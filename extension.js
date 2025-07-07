const vscode = require('vscode');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 🔹 Add your Gemini API key here
const API_KEY = "AIzaSyBxqjdKKKLSJGUmhgaXj69luQSJucBAbr4";
const genAI = new GoogleGenerativeAI(API_KEY);


/**
 * Escapes special HTML characters to prevent rendering issues in the webview.
 * @param {string} text The text to escape.
 * @returns {string} The escaped text.
 */
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Finds the differences between two arrays of lines, ignoring whitespace and indentation.
 * @param {string[]} buggyLines An array of lines from the buggy code.
 * @param {string[]} fixedLines An array of lines from the fixed code.
 * @returns {number[]} An array of indices for the changed lines.
 */
function findChangedLines(buggyLines, fixedLines) {
    const changedLines = [];
    const maxLength = Math.max(buggyLines.length, fixedLines.length);

    for (let i = 0; i < maxLength; i++) {
        const buggyLine = buggyLines[i] || '';
        const fixedLine = fixedLines[i] || '';

        // Normalize lines by collapsing all whitespace to a single space and then trimming.
        // This makes the comparison robust against formatting differences.
        const normalizedBuggyLine = buggyLine.replace(/\s+/g, ' ').trim();
        const normalizedFixedLine = fixedLine.replace(/\s+/g, ' ').trim();

        if (normalizedBuggyLine !== normalizedFixedLine) {
            changedLines.push(i);
        }
    }

    return changedLines;
}

/**
 * Wraps specified lines in a span with a background color for highlighting.
 * @param {string[]} lines The lines of code to process.
 * @param {number[]} lineIndices The indices of lines to highlight.
 * @param {string} color The background color for the highlight.
 * @returns {string} A string of HTML with highlighted lines.
 */
function highlightLines(lines, lineIndices, color) {
    return lines.map((line, index) => {
        const escapedLine = escapeHtml(line);
        if (lineIndices.includes(index)) {
            // Use a span with a translucent background color for highlighting
            return `<span style="background-color: ${color}; display: block; width: 100%;">${escapedLine || '&nbsp;'}</span>`;
        }
        return escapedLine;
    }).join('\n');
}

/**
 * Activates the command to fix the Java bug using the Gemini API.
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

    try {
        vscode.window.showInformationMessage("Fixplain running with Gemini...");

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `
            Analyze the following Java code for bugs.
            
            **Buggy Java Code:**
            \`\`\`java
            ${buggyCode}
            \`\`\`

            **Instructions:**
            Your response must be a single JSON object containing two keys:
            1. "fixed_code": A string containing the corrected, complete Java code.
            2. "explanation": A concise, one-paragraph explanation (under 100 words) of the bug and the fix.

            If there is no bug, return the original code in "fixed_code" and explain why the code is correct.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = await response.text();

        let fixedCode, generatedExplanation;
        try {
            const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
            const parsedJson = JSON.parse(jsonString);
            fixedCode = parsedJson.fixed_code;
            generatedExplanation = parsedJson.explanation;
        } catch (e) {
            vscode.window.showErrorMessage("Error parsing the AI's response. Please try again.");
            console.error("Gemini parsing error:", e, "Response:", text);
            return;
        }
        
        const buggyLines = buggyCode.split(/\r?\n/);
        const fixedLines = fixedCode.split(/\r?\n/);
        const changedLines = findChangedLines(buggyLines, fixedLines);
        
        let explanation = "";
        let highlightedBuggyCode = "";
        let highlightedFixedCode = "";

        if (changedLines.length === 0) {
            const infoLine = `<span style="color:yellow; font-weight: bold;">No bug was found in the code.</span>`;
            explanation = `${infoLine}<br>${generatedExplanation}`;
            highlightedBuggyCode = escapeHtml(buggyCode);
            highlightedFixedCode = escapeHtml(fixedCode);
        } else {
            const infoLine = `<span style="color:#ff7b72; font-weight: bold;">A bug was found and fixed.</span>`;
            explanation = `${infoLine}<br>${generatedExplanation}`;
            // Use translucent colors for better readability
            highlightedBuggyCode = highlightLines(buggyLines, changedLines, 'rgba(255, 0, 0, 0.3)');
            highlightedFixedCode = highlightLines(fixedLines, changedLines, 'rgba(0, 255, 0, 0.2)');
        }

        const panel = vscode.window.createWebviewPanel('fixplain', 'Fixplain Results', vscode.ViewColumn.Two, { enableScripts: true });
        panel.webview.html = getWebviewContent(highlightedBuggyCode, highlightedFixedCode, explanation, fixedCode);

        panel.webview.onDidReceiveMessage(message => {
            if (message.command === 'applyFix') {
                editor.edit(editBuilder => {
                    editBuilder.replace(editor.selection, message.fixedCode);
                });
            }
        });

    } catch (error) {
        vscode.window.showErrorMessage("Error fixing Java code with Gemini: " + error.message);
    }
}

/**
 * Generates the HTML content for the webview panel.
 * @returns {string} The HTML content.
 */
function getWebviewContent(highlightedBuggyCode, highlightedFixedCode, explanation, rawFixedCode) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Fixplain Results</title>
        <style>
            body { font-family: Arial, sans-serif; background-color: #1e1e1e; color: #d4d4d4; padding: 20px; }
            h2 { color: #569cd6; }
            pre, textarea { background-color: #252526; padding: 10px; border-radius: 5px; overflow-x: auto; width: 100%; box-sizing: border-box; font-family: monospace; font-size: 14px; color: #d4d4d4; white-space: pre-wrap; word-wrap: break-word; }
            p { background-color: #252526; padding: 10px; border-radius: 5px; }
            button { background-color: #0e639c; color: white; border: none; padding: 10px 20px; font-size: 16px; margin: 10px 10px 10px 0; cursor: pointer; border-radius: 5px; }
            button:hover { background-color: #1177bb; }
            #edit-area { display: none; margin-top: 10px; }
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
            <textarea id="edited-code" rows="15">${escapeHtml(rawFixedCode)}</textarea><br>
            <button id="apply-edited-button">Apply Edited Fix</button>
        </div>
        <script>
            const vscode = acquireVsCodeApi();
            const rawFixedCode = ${JSON.stringify(rawFixedCode)};

            document.getElementById('fix-button').addEventListener('click', () => {
                vscode.postMessage({ command: 'applyFix', fixedCode: rawFixedCode });
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
}

function activate(context) {
    let disposable = vscode.commands.registerCommand('fixplain.fixJava', fixJavaBug);
    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = { activate, deactivate };