const vscode = require('vscode');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const API_ENDPOINT = process.env.API_ENDPOINT;
console.log("API Endpoint:", API_ENDPOINT);
if (!API_ENDPOINT) {
    throw new Error('Endpoint not found in environment variables. Please Activate the Server');
}
const genAI = new GoogleGenerativeAI(API_ENDPOINT);

/**
 * Removes markdown code block syntax from code string
 * @param {string} code The code that might contain markdown code blocks
 * @returns {string} The cleaned code without markdown syntax
 */
function removeCodeBlockSyntax(code) {
    if (!code) return '';
    
    // Remove opening code block (```java, ```JavaScript, ``` etc.)
    let cleanedCode = code.replace(/^```[a-zA-Z]*\n?/gm, '');
    
    // Remove closing code block (```)
    cleanedCode = cleanedCode.replace(/\n?```$/gm, '');
    
    // Trim any extra whitespace
    return cleanedCode.trim();
}

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
        vscode.window.showInformationMessage("Fixplain is analyzing your Java code...");

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `
            Analyze the following Java code for bugs.
            
            **Buggy Java Code:**
            \`\`\`java
            ${buggyCode}
            \`\`\`

            **Instructions:**
            Your response must be a single JSON object containing two keys:
            1. "fixed_code": A string containing the corrected, complete Java code (without any markdown code block syntax like \`\`\`java or \`\`\`).
            2. "explanation": A concise, one-paragraph explanation (under 100 words) of the bug and the fix.

            If there is no bug, return the original code in "fixed_code" and explain why the code is correct.
            
            IMPORTANT: Do not wrap the fixed_code value in markdown code blocks. Return plain Java code only.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = await response.text();

        let fixedCode, generatedExplanation;
        try {
            const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
            const parsedJson = JSON.parse(jsonString);
            
            // Clean the fixed code to remove any markdown syntax
            fixedCode = removeCodeBlockSyntax(parsedJson.fixed_code);
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
                // Also clean the code when applying the fix, just in case
                const cleanedFixedCode = removeCodeBlockSyntax(message.fixedCode);
                editor.edit(editBuilder => {
                    editBuilder.replace(editor.selection, cleanedFixedCode);
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
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #0d1117 0%, #161b22 100%);
                color: #e6edf3;
                padding: 0;
                margin: 0;
                min-height: 100vh;
                line-height: 1.6;
            }

            .container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
            }

            .header {
                text-align: center;
                padding: 30px 0;
                background: linear-gradient(90deg, #1f6feb 0%, #0969da 100%);
                margin: -20px -20px 30px -20px;
                border-radius: 0 0 20px 20px;
                box-shadow: 0 4px 20px rgba(31, 111, 235, 0.3);
            }

            .header h1 {
                font-size: 2.5em;
                font-weight: 700;
                color: white;
                text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
                margin-bottom: 10px;
            }

            .header p {
                background: none;
                padding: 0;
                color: rgba(255, 255, 255, 0.9);
                font-size: 1.1em;
                font-weight: 300;
            }

            .section {
                margin-bottom: 30px;
                background: rgba(33, 39, 46, 0.8);
                border-radius: 15px;
                padding: 25px;
                border: 1px solid rgba(48, 54, 61, 0.8);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                backdrop-filter: blur(10px);
                transition: transform 0.3s ease, box-shadow 0.3s ease;
            }

            .section:hover {
                transform: translateY(-2px);
                box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
            }

            .section-title {
                font-size: 1.4em;
                font-weight: 600;
                margin-bottom: 15px;
                color: #58a6ff;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .section-title::before {
                content: '';
                width: 4px;
                height: 24px;
                background: linear-gradient(135deg, #58a6ff, #1f6feb);
                border-radius: 2px;
            }

            .buggy-title::before {
                background: linear-gradient(135deg, #ff7b72, #f85149);
            }

            .fixed-title::before {
                background: linear-gradient(135deg, #3fb950, #238636);
            }

            .explanation-title::before {
                background: linear-gradient(135deg, #d2a8ff, #8b5cf6);
            }

            pre {
                background: #0d1117;
                padding: 20px;
                border-radius: 10px;
                overflow-x: auto;
                font-family: 'Cascadia Code', 'SF Mono', Monaco, 'Cascadia Mono', 'Roboto Mono', Consolas, 'Courier New', monospace;
                font-size: 14px;
                line-height: 1.5;
                color: #e6edf3;
                white-space: pre-wrap;
                word-wrap: break-word;
                border: 1px solid rgba(48, 54, 61, 0.5);
                box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.3);
                position: relative;
            }

            pre::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: linear-gradient(90deg, #58a6ff, #1f6feb);
                border-radius: 10px 10px 0 0;
            }

            .explanation-content {
                background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(168, 85, 247, 0.05));
                padding: 20px;
                border-radius: 10px;
                border-left: 4px solid #d2a8ff;
                font-size: 1.05em;
                line-height: 1.7;
            }

            .button-group {
                display: flex;
                gap: 15px;
                margin-top: 30px;
                flex-wrap: wrap;
            }

            button {
                background: linear-gradient(135deg, #238636, #2ea043);
                color: white;
                border: none;
                padding: 12px 24px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                border-radius: 8px;
                transition: all 0.3s ease;
                box-shadow: 0 4px 15px rgba(46, 160, 67, 0.3);
                position: relative;
                overflow: hidden;
            }

            button::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
                transition: left 0.5s ease;
            }

            button:hover::before {
                left: 100%;
            }

            button:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(46, 160, 67, 0.4);
            }

            button:active {
                transform: translateY(0);
                box-shadow: 0 4px 15px rgba(46, 160, 67, 0.3);
            }

            #edit-button {
                background: linear-gradient(135deg, #1f6feb, #0969da);
                box-shadow: 0 4px 15px rgba(31, 111, 235, 0.3);
            }

            #edit-button:hover {
                box-shadow: 0 8px 25px rgba(31, 111, 235, 0.4);
            }

            #edit-area {
                display: none;
                margin-top: 20px;
                padding: 25px;
                background: rgba(33, 39, 46, 0.6);
                border-radius: 15px;
                border: 1px solid rgba(48, 54, 61, 0.6);
                animation: slideIn 0.3s ease-out;
            }

            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            #edit-area h2 {
                color: #58a6ff;
                margin-bottom: 15px;
                font-size: 1.3em;
            }

            textarea {
                width: 100%;
                background: #0d1117;
                color: #e6edf3;
                border: 1px solid rgba(48, 54, 61, 0.8);
                border-radius: 8px;
                padding: 15px;
                font-family: 'Cascadia Code', 'SF Mono', Monaco, 'Cascadia Mono', 'Roboto Mono', Consolas, 'Courier New', monospace;
                font-size: 14px;
                line-height: 1.5;
                resize: vertical;
                min-height: 300px;
                transition: border-color 0.3s ease, box-shadow 0.3s ease;
            }

            textarea:focus {
                outline: none;
                border-color: #58a6ff;
                box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.3);
            }

            .highlight-red {
                background-color: rgba(248, 81, 73, 0.3) !important;
                border-left: 3px solid #f85149;
                padding-left: 10px;
            }

            .highlight-green {
                background-color: rgba(63, 185, 80, 0.2) !important;
                border-left: 3px solid #3fb950;
                padding-left: 10px;
            }

            .status-badge {
                display: inline-block;
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 0.9em;
                font-weight: 600;
                margin-bottom: 15px;
            }

            .status-error {
                background: rgba(248, 81, 73, 0.2);
                color: #ff7b72;
                border: 1px solid rgba(248, 81, 73, 0.3);
            }

            .status-success {
                background: rgba(63, 185, 80, 0.2);
                color: #56d364;
                border: 1px solid rgba(63, 185, 80, 0.3);
            }

            .loading {
                opacity: 0.7;
                pointer-events: none;
            }

            /* Scrollbar styling */
            ::-webkit-scrollbar {
                width: 8px;
            }

            ::-webkit-scrollbar-track {
                background: rgba(33, 39, 46, 0.5);
                border-radius: 4px;
            }

            ::-webkit-scrollbar-thumb {
                background: rgba(88, 166, 255, 0.5);
                border-radius: 4px;
            }

            ::-webkit-scrollbar-thumb:hover {
                background: rgba(88, 166, 255, 0.7);
            }

            /* Mobile responsiveness */
            @media (max-width: 768px) {
                .container {
                    padding: 10px;
                }

                .header {
                    margin: -10px -10px 20px -10px;
                    padding: 20px 0;
                }

                .header h1 {
                    font-size: 2em;
                }

                .section {
                    padding: 20px;
                    margin-bottom: 20px;
                }

                .button-group {
                    flex-direction: column;
                }

                button {
                    width: 100%;
                    justify-content: center;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
        
            <div class="section">
                <h2 class="section-title buggy-title">🐛 Original Code</h2>
                <pre>${highlightedBuggyCode}</pre>
            </div>

            <div class="section">
                <h2 class="section-title fixed-title">✅ Fixed Code</h2>
                <pre>${highlightedFixedCode}</pre>
            </div>

            <div class="section">
                <h2 class="section-title explanation-title">💡 Analysis & Explanation</h2>
                <div class="explanation-content">${explanation}</div>
            </div>

            <div class="button-group">
                <button id="fix-button">🚀 Apply Fix</button>
                <button id="edit-button">✏️ Edit & Fix</button>
            </div>

            <div id="edit-area">
                <h2>✏️ Edit Fixed Code</h2>
                <textarea id="edited-code" placeholder="Edit the fixed code here...">${escapeHtml(rawFixedCode)}</textarea>
                <div class="button-group">
                    <button id="apply-edited-button">🎯 Apply Edited Fix</button>
                </div>
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            const rawFixedCode = ${JSON.stringify(rawFixedCode)};

            // Add loading states for better UX
            function setLoading(button, isLoading) {
                if (isLoading) {
                    button.classList.add('loading');
                    button.textContent = '⏳ Applying...';
                } else {
                    button.classList.remove('loading');
                }
            }

            document.getElementById('fix-button').addEventListener('click', function() {
                setLoading(this, true);
                vscode.postMessage({ command: 'applyFix', fixedCode: rawFixedCode });
                setTimeout(() => setLoading(this, false), 1000);
            });

            document.getElementById('edit-button').addEventListener('click', function() {
                const editArea = document.getElementById('edit-area');
                editArea.style.display = editArea.style.display === 'none' ? 'block' : 'none';
                this.textContent = editArea.style.display === 'none' ? '✏️ Edit & Fix' : '🙈 Hide Editor';
            });

            document.getElementById('apply-edited-button').addEventListener('click', function() {
                const editedCode = document.getElementById('edited-code').value;
                setLoading(this, true);
                vscode.postMessage({ command: 'applyFix', fixedCode: editedCode });
                setTimeout(() => setLoading(this, false), 1000);
            });

            // Add smooth scrolling behavior
            document.querySelectorAll('button').forEach(button => {
                button.addEventListener('click', function() {
                    this.style.transform = 'scale(0.95)';
                    setTimeout(() => {
                        this.style.transform = '';
                    }, 100);
                });
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