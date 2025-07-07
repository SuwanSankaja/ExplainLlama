const vscode = require('vscode');
const axios = require('axios');

// Manually update this URL each time the ngrok URL changes

const CODELLAMA_API_URL = "https://7f6e-35-234-62-147.ngrok-free.app"; // 🔹 Replace with your actual ngrok URL

/**
 * Finds the differences between two arrays of lines and returns the indices of changed lines.
 */
function findChangedLines(buggyLines, fixedLines) {
    const changedLines = [];
    const maxLength = Math.max(buggyLines.length, fixedLines.length);

    for (let i = 0; i < maxLength; i++) {
        const buggyLine = buggyLines[i] || '';
        const fixedLine = fixedLines[i] || '';

        // Normalize lines by trimming whitespace
        const normalizedBuggyLine = buggyLine.trim();
        const normalizedFixedLine = fixedLine.trim();

        // Compare normalized lines
        if (normalizedBuggyLine !== normalizedFixedLine) {
            changedLines.push(i);
        }
    }

    return changedLines;
}

/**
 * Highlights the specified lines in the code with the given color.
 */
function highlightLines(lines, lineIndices, color) {
    return lines.map((line, index) => {
        if (lineIndices.includes(index)) {
            return `<span style="background-color: ${color};">${line}</span>`;
        }
        return line;
    }).join('\n');
}




/**
 * Sends the selected Java code to the FastAPI server for fixing.
 */
async function fixJavaBug() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("Open a Java file first!");
        return;
    }

    const buggyCode = editor.document.getText(editor.selection);
    if (!buggyCode) {
        vscode.window.showErrorMessage("Select Java code to fix!");
        return;
    }

    const fixApiUrl = `${CODELLAMA_API_URL}/fix_code`;
    const explainApiUrl = `${CODELLAMA_API_URL}/explain_fix`;

    try {
        vscode.window.showInformationMessage("Fixplain running...");

        // Step 1: Request the fixed code from CodeLlama
        const response = await axios.post(fixApiUrl, { buggy_code: buggyCode });
        if (response.status !== 200) {
            throw new Error("Failed to fetch fixed code.");
        }
        const fixedCode = response.data.fixed_code;

        // Normalize code for comparison
        const buggyNormalized = buggyCode.trim();
        const fixedNormalized = fixedCode.trim();

        let explanation = "";
        let changedLines = [];
        let highlightedBuggyCode = "";
        let highlightedFixedCode = "";

        if (buggyNormalized === fixedNormalized) {
            // Step 2: Still get the explanation
            const explanationResponse = await axios.post(explainApiUrl, {
                buggy_code: buggyCode,
                fixed_code: fixedCode
            });
            const generatedExplanation = explanationResponse.status === 200
                ? explanationResponse.data.explanation
                : "Explanation not available.";

            const infoLine = `<span style="color:yellow; font-weight: bold;">There is no Bug in the code.</span>`;
            explanation = `${infoLine}<br>${generatedExplanation}`;

            highlightedBuggyCode = buggyCode;
            highlightedFixedCode = fixedCode;

        } else {
            // Step 2: Get explanation
            const explanationResponse = await axios.post(explainApiUrl, {
                buggy_code: buggyCode,
                fixed_code: fixedCode
            });
            const generatedExplanation = explanationResponse.status === 200
                ? explanationResponse.data.explanation
                : "Explanation not available.";

            const infoLine = `<span style="color:red; font-weight: bold;">A Bug is present in the code.</span>`;
            explanation = `${infoLine}<br>${generatedExplanation}`;

            const buggyLines = buggyCode.split('\n');
            const fixedLines = fixedCode.split('\n');

            changedLines = findChangedLines(buggyLines, fixedLines);
            highlightedBuggyCode = highlightLines(buggyLines, changedLines, 'red');
            highlightedFixedCode = highlightLines(fixedLines, changedLines, 'green');
        }

        // Step 6: Display results in a WebView panel with both Apply and Edit & Apply options
        const panel = vscode.window.createWebviewPanel(
            'fixplain',
            'Fixplain Results',
            vscode.ViewColumn.Two,
            { enableScripts: true }
        );

        panel.webview.html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Fixplain Results</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background-color: #1e1e1e;
                    color: #d4d4d4;
                    padding: 20px;
                }
                h2 {
                    color: #569cd6;
                }
                pre, textarea {
                    background-color: #252526;
                    padding: 10px;
                    border-radius: 5px;
                    overflow-x: auto;
                    width: 100%;
                    box-sizing: border-box;
                    font-family: monospace;
                    font-size: 14px;
                    color: #d4d4d4;
                }
                p {
                    background-color: #252526;
                    padding: 10px;
                    border-radius: 5px;
                }
                button {
                    background-color: #0e639c;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    text-align: center;
                    text-decoration: none;
                    display: inline-block;
                    font-size: 16px;
                    margin: 10px 10px 10px 0;
                    cursor: pointer;
                    border-radius: 5px;
                }
                button:hover {
                    background-color: #1177bb;
                }
                #edit-area {
                    display: none;
                    margin-top: 10px;
                }
            </style>

        </head>
        <body>
            <h2>Buggy Code:</h2>
            <pre>${highlightedBuggyCode}</pre>
            <h2>Fixed Code:</h2>
            <pre>${highlightedFixedCode}</pre>
            <h2>Explanation:</h2>
            <p>${explanation}</p>

            <button id="fix-button">Apply Fix</button>
            <button id="edit-button">Edit & Fix</button>

            <div id="edit-area">
                <h2>Edit Fixed Code:</h2>
                <textarea id="edited-code" rows="15">${fixedCode}</textarea><br>
                <button id="apply-edited-button">Apply Edited Fix</button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                document.getElementById('fix-button').addEventListener('click', () => {
                    vscode.postMessage({ command: 'applyFix', fixedCode: \`${fixedCode}\` });
                });

                document.getElementById('edit-button').addEventListener('click', () => {
                    document.getElementById('edit-area').style.display = 'block';
                });

                document.getElementById('apply-edited-button').addEventListener('click', () => {
                    const editedCode = document.getElementById('edited-code').value;
                    vscode.postMessage({ command: 'applyFix', fixedCode: editedCode });
                });
            </script>
        </body>
        </html>`;

        // Handle messages from the WebView
        panel.webview.onDidReceiveMessage(
            message => {
                if (message.command === 'applyFix') {
                    editor.edit(editBuilder => {
                        editBuilder.replace(editor.selection, message.fixedCode);
                    });
                }
            },
            undefined,
            vscode.window.activeTextEditor
        );

    } catch (error) {
        vscode.window.showErrorMessage("Error fixing Java code: " + error.message);
    }
}

/**
 * This method is called when the extension is activated.
 */
function activate(context) {
    let disposable = vscode.commands.registerCommand('fixplain.fixJava', fixJavaBug);
    context.subscriptions.push(disposable);
}

/**
 * This method is called when the extension is deactivated.
 */
function deactivate() {}

module.exports = { activate, deactivate };
