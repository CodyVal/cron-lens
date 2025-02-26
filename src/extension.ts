import * as vscode from "vscode";
import * as cronParser from "cron-parser";
import * as cronstrue from "cronstrue";
import * as minimatch from "minimatch";

// Create a decoration type for inline CRON descriptions
const cronDecorationType = vscode.window.createTextEditorDecorationType({
  after: {
    margin: "0 0 0 10px",
    color: new vscode.ThemeColor("editorCodeLens.foreground"),
  },
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
});

export function activate(context: vscode.ExtensionContext) {
  console.log("CRON Lens is now active");

  // Update decorations when the active editor changes
  vscode.window.onDidChangeActiveTextEditor(
    updateDecorations,
    null,
    context.subscriptions
  );

  // Update decorations when the document changes
  vscode.workspace.onDidChangeTextDocument(
    (event) => {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && event.document === activeEditor.document) {
        updateDecorations(activeEditor);
      }
    },
    null,
    context.subscriptions
  );

  // Update decorations when configuration changes
  vscode.workspace.onDidChangeConfiguration(
    (e) => {
      if (e.affectsConfiguration("cronLens")) {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          updateDecorations(activeEditor);
        }
      }
    },
    null,
    context.subscriptions
  );

  // Initial update for the active editor
  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor);
  }
}

// Regular expressions to match CRON expressions
const potentialCronPattern =
  /(?:['"])?(\*(?:\/\d+)?|\d+(?:-\d+)?(?:,\d+)*(?:\/\d+)?)\s+(\*(?:\/\d+)?|\d+(?:-\d+)?(?:,\d+)*(?:\/\d+)?)\s+(\*(?:\/\d+)?|\d+(?:-\d+)?(?:,\d+)*(?:\/\d+)?)\s+(\*(?:\/\d+)?|\d+(?:-\d+)?(?:,\d+)*(?:\/\d+)?)\s+(\*(?:\/\d+)?|\d+(?:-\d+)?(?:,\d+)*(?:\/\d+)?)(?:['"])?/g;

function updateDecorations(editor: vscode.TextEditor | undefined) {
  if (!editor) {
    return;
  }

  // Check if the extension is enabled
  const config = vscode.workspace.getConfiguration("cronLens");
  if (!config.get("enabled", true)) {
    editor.setDecorations(cronDecorationType, []);
    return;
  }

  // Get file patterns from configuration
  const filePatterns = config.get<string[]>("filePatterns", [
    "*.js",
    "*.ts",
    "*.py",
    "*.java",
    "*.yaml",
    "*.yml",
    "*.json",
  ]);

  // Check if current file matches any of the patterns
  const fileName = editor.document.fileName;
  // Extract just the base name of the file for pattern matching
  const basename = fileName.split(/[\\/]/).pop() || "";
  const isFileSupported = filePatterns.some((pattern) => {
    const matcher = new minimatch.Minimatch(pattern, { matchBase: true });
    return matcher.match(basename);
  });

  if (!isFileSupported) {
    editor.setDecorations(cronDecorationType, []);
    return;
  }

  const document = editor.document;
  const text = document.getText();

  // Clear existing decorations first
  editor.setDecorations(cronDecorationType, []);

  const decorations: vscode.DecorationOptions[] = [];

  console.log("Analyzing document:", document.fileName);

  // Process potential CRON expressions
  let match;
  while ((match = potentialCronPattern.exec(text)) !== null) {
    // Combine the five captured groups to form the complete CRON expression
    const cronExpression = match.slice(1, 6).join(" ").trim();
    console.log("Found potential CRON expression:", cronExpression);

    try {
      // Try to parse it as a CRON expression
      cronParser.parseExpression(cronExpression);
      const lineNumber = document.positionAt(match.index).line;
      tryAddDecoration(document, cronExpression, lineNumber, decorations);
    } catch (error) {
      console.log("Invalid CRON expression:", cronExpression, error);
      continue;
    }
  }

  // Apply new decorations to editor
  editor.setDecorations(cronDecorationType, decorations);
}

function tryAddDecoration(
  document: vscode.TextDocument,
  cronExpression: string,
  lineNumber: number,
  decorations: vscode.DecorationOptions[]
) {
  try {
    // Validate the CRON expression
    cronParser.parseExpression(cronExpression);

    // Get the line text
    const line = document.lineAt(lineNumber);
    const lineText = line.text;

    // Determine the position for the decoration
    let decorationPosition: vscode.Position;

    // Check if the line ends with a semicolon
    if (lineText.trim().endsWith(";")) {
      // Place decoration at the end of the line
      decorationPosition = line.range.end;
    } else {
      // Find the CRON expression in the line and include any surrounding quotes
      const cronIndex = lineText.indexOf(cronExpression);
      if (cronIndex !== -1) {
        let endPos = cronIndex + cronExpression.length;
        // Check if there's a quote after the CRON expression
        if (
          endPos < lineText.length &&
          (lineText[endPos] === '"' || lineText[endPos] === "'")
        ) {
          endPos++;
        }
        decorationPosition = new vscode.Position(lineNumber, endPos);
      } else {
        // Fallback to end of line if CRON expression can't be found
        decorationPosition = line.range.end;
      }
    }

    // Create a decoration with the human-readable description
    const humanReadable = cronstrue.toString(cronExpression);
    const decoration: vscode.DecorationOptions = {
      range: new vscode.Range(decorationPosition, decorationPosition),
      renderOptions: {
        after: {
          contentText: `  📅 ${humanReadable}`,
          color: new vscode.ThemeColor("editorCodeLens.foreground"),
          fontStyle: "italic",
        },
      },
    };

    decorations.push(decoration);
    console.log(
      `Added decoration for CRON: ${cronExpression} -> ${humanReadable}`
    );
  } catch (error) {
    // Invalid CRON expression, log with more details
    console.log(`Error parsing CRON expression: ${cronExpression}`);
    console.log(
      `Error details: ${error instanceof Error ? error.message : String(error)}`
    );

    // Try with cronstrue directly as a fallback
    try {
      const humanReadable = cronstrue.toString(cronExpression);
      console.log(`Fallback succeeded: ${humanReadable}`);

      // Get the line
      const line = document.lineAt(lineNumber);

      // Determine the position for the decoration
      let decorationPosition: vscode.Position;

      // Check if the line ends with a semicolon
      if (line.text.trim().endsWith(";")) {
        // Place decoration at the end of the line
        decorationPosition = line.range.end;
      } else {
        // Find the CRON expression in the line and include any surrounding quotes
        const cronIndex = line.text.indexOf(cronExpression);
        if (cronIndex !== -1) {
          let endPos = cronIndex + cronExpression.length;
          // Check if there's a quote after the CRON expression
          if (
            endPos < line.text.length &&
            (line.text[endPos] === '"' || line.text[endPos] === "'")
          ) {
            endPos++;
          }
          decorationPosition = new vscode.Position(lineNumber, endPos);
        } else {
          // Fallback to end of line if CRON expression can't be found
          decorationPosition = line.range.end;
        }
      }

      // Create a decoration with the human-readable description
      const decoration: vscode.DecorationOptions = {
        range: new vscode.Range(decorationPosition, decorationPosition),
        renderOptions: {
          after: {
            contentText: `  📅 ${humanReadable}`,
            color: new vscode.ThemeColor("editorCodeLens.foreground"),
            fontStyle: "italic",
          },
        },
      };

      decorations.push(decoration);
    } catch (fallbackError) {
      console.log(
        `Fallback also failed: ${
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError)
        }`
      );
    }
  }
}

export function deactivate() {}
