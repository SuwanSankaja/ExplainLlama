const vscode = require('vscode');
const axios = require('axios');

// Manually update this URL each time the ngrok URL changes
const CODELLAMA_API_URL = "https://5e39-34-124-141-87.ngrok-free.app"; // 🔹 Replace with your actual ngrok URL

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
        vscode.window.showInformationMessage("Fixing Java code...");

        // Step 1: Request the fixed code from CodeLlama
        const response = await axios.post(fixApiUrl, { buggy_code: buggyCode });
        if (response.status !== 200) {
            throw new Error("Failed to fetch fixed code.");
        }
        const fixedCode = response.data.fixed_code;

        // Step 2: Request an explanation from CodeLlama
        const explanationResponse = await axios.post(explainApiUrl, {
            buggy_code: buggyCode,
            fixed_code: fixedCode
        });
        const explanation = explanationResponse.status === 200
            ? explanationResponse.data.explanation
            : "Explanation not available.";

        // Step 3: Display results in a WebView panel with a "Fix" button
        const panel = vscode.window.createWebviewPanel(
            'explainllama',
            'ExplainLlama Results',
            vscode.ViewColumn.Two,
            { enableScripts: true } // Enable JavaScript in WebView
        );

        panel.webview.html = `<html>
        <body>
            <h2>Fixed Code:</h2>
            <pre>${fixedCode}</pre>
            <h2>Explanation:</h2>
            <p>${explanation}</p>
            <button id="fix-button">Fix</button>

            <script>
                const vscode = acquireVsCodeApi();
                document.getElementById('fix-button').addEventListener('click', () => {
                    vscode.postMessage({ command: 'applyFix', fixedCode: \`${fixedCode}\` });
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
    let disposable = vscode.commands.registerCommand('explainllama.fixJava', fixJavaBug);
    context.subscriptions.push(disposable);
}

/**
 * This method is called when the extension is deactivated.
 */
function deactivate() {}

module.exports = { activate, deactivate };
