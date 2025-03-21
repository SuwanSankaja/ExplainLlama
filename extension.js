const vscode = require('vscode');
const axios = require('axios');

// 🔁 Your droplet's public IP
const CODELLAMA_API_URL = "http://192.241.141.164:3000";

/**
 * Finds the differences between two arrays of lines and returns the indices of changed lines.
 */
function findChangedLines(buggyLines, fixedLines) {
    const changedLines = [];
    const maxLength = Math.max(buggyLines.length, fixedLines.length);

    for (let i = 0; i < maxLength; i++) {
        const buggyLine = buggyLines[i] || '';
        const fixedLine = fixedLines[i] || '';

        if (buggyLine.trim() !== fixedLine.trim()) {
            changedLines.push(i);
        }
    }

    return changedLines;
}

/**
 * Highlights lines with a background color.
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
 * Sends code to the queue and waits for result from /get-result
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

    const jobId = Date.now().toString();  // Simple unique ID

    try {
        vscode.window.showInformationMessage("Queuing job to ExplainLlama...");

        // Step 1: Send job to Droplet API
        await axios.post(`${CODELLAMA_API_URL}/queue-job`, {
            job_id: jobId,
            code: buggyCode,
            language: "java"
        });

        // Step 2: Poll for result
        const waitForResult = async () => {
            let attempts = 0;
            const maxAttempts = 20;

            while (attempts < maxAttempts) {
                const response = await axios.get(`${CODELLAMA_API_URL}/get-result/${jobId}`);
                const data = response.data;

                if (data && data.status === "done") {
                    return data;
                }

                await new Promise(res => setTimeout(res, 3000));
                attempts++;
            }

            throw new Error("Timeout: Result not ready.");
        };

        const { fixed_code, explanation } = await waitForResult();

        vscode.window.showInformationMessage("✅ Fix is ready!");
        showWebView(buggyCode, fixed_code, explanation, editor);

    } catch (err) {
        vscode.window.showErrorMessage("❌ Error: " + err.message);
    }
}

/**
 * Displays the result in a WebView
 */
function showWebView(buggyCode, fixedCode, explanation, editor) {
    const changedLines = findChangedLines(buggyCode.split('\n'), fixedCode.split('\n'));
    const highlightedBuggyCode = highlightLines(buggyCode.split('\n'), changedLines, 'red');
    const highlightedFixedCode = highlightLines(fixedCode.split('\n'), changedLines, 'green');

    const panel = vscode.window.createWebviewPanel(
        'explainllama',
        'ExplainLlama Results',
        vscode.ViewColumn.Two,
        { enableScripts: true }
    );

    panel.webview.html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {
                font-family: Arial;
                background-color: #1e1e1e;
                color: #d4d4d4;
                padding: 20px;
            }
            pre {
                background: #2d2d2d;
                padding: 10px;
                border-radius: 5px;
                overflow-x: auto;
            }
            button {
                background-color: #0e639c;
                color: white;
                border: none;
                padding: 10px 20px;
                font-size: 16px;
                margin-top: 10px;
                border-radius: 5px;
                cursor: pointer;
            }
            button:hover {
                background-color: #1177bb;
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

        <button id="applyFix">Apply Fix</button>

        <script>
            const vscode = acquireVsCodeApi();
            document.getElementById('applyFix').addEventListener('click', () => {
                vscode.postMessage({ command: 'applyFix', fixedCode: \`${fixedCode}\` });
            });
        </script>
    </body>
    </html>
    `;

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
}

/**
 * Activates the extension
 */
function activate(context) {
    let disposable = vscode.commands.registerCommand('explainllama.fixJava', fixJavaBug);
    context.subscriptions.push(disposable);
}

/**
 * Deactivates the extension
 */
function deactivate() {}

module.exports = {
    activate,
    deactivate
};
