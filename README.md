# 🦙 ExplainLlama - Java Bug Fixer & Explainer 🚀



🔹 **ExplainLlama** is a **VS Code extension** that **automatically fixes Java code** and provides **clear explanations** using AI.\
🔹 Powered by **CodeLlama** and **Google Colab**, it connects with an **ngrok-exposed FastAPI server** to process Java code instantly!

---

## 🌟 Features

✅ **Fix Java Code** - Automatically corrects syntax and logic errors.\
✅ **Explain Fixes** - Generates human-readable explanations of the changes.\
✅ **AI-Powered** - Uses **CodeLlama** and advanced LLMs for intelligent debugging.\
✅ **Easy Setup** - Just update the **ngrok URL** and start fixing!

---

## 🎯 Getting Started

### **1️⃣ Clone the Extension**

```sh
git clone https://github.com/SuwanSankaja/explainllama.git
cd explainllama
```

### **2️⃣ Install Dependencies**

```sh
npm install
```

### **3️⃣ Run the Extension in VS Code**

```sh
code .
```

Then, press **`F5`** to launch the **ExplainLlama Extension** in a new window.

---

## 🚀 Running the FastAPI Server (Google Colab)

1. Open **Google Colab** and create a new notebook.
2. **Copy & Paste the Server Code** (provided below) into a Colab cell.
3. **Run the cell** to start the FastAPI server.
4. **Copy the ngrok public URL** from the output.
5. **Update ****`CODELLAMA_API_URL`** in `extension.js` with the new ngrok URL.

```python
# Install dependencies
!pip install fastapi uvicorn transformers torch accelerate pyngrok nest_asyncio

# Run the FastAPI server
!python server.py
```

---

## 🔗 **Manually Update the ngrok URL**

Since **ngrok changes its URL** every time you restart Colab, update this manually in `extension.js`:

```javascript
const CODELLAMA_API_URL = "https://your-latest-ngrok-url.ngrok-free.app"; // Replace with new URL
```

After updating, **restart the extension** (`F5` in VS Code).

---

## 🎨 How to Use ExplainLlama 🦙

### **1️⃣ Open a Java File in VS Code**

- Open any Java file (`.java`).
- Select **buggy Java code**.

### **2️⃣ Run the ExplainLlama Command**

- Open **Command Palette** (`Ctrl + Shift + P`).
- Run **"Fix Java Bug with ExplainLlama"**.

### **3️⃣ Get Fixed Code & Explanation! 🎉**

- The extension will **fix your Java code**.
- It will show an **explanation of the changes** in a beautiful WebView.

---

## 🛠 **Troubleshooting**

| Issue                               | Solution                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| ❌ **`Error fetching ngrok URL`**    | Ensure the FastAPI server is running in **Colab** and **update the ngrok URL** in `extension.js`. |
| 🔄 **Command not found in VS Code** | Restart the extension using **`F5`** in VS Code.                                                  |
| 🚫 **API calls fail**               | Manually test the ngrok URL with: `curl -X GET "https://your-ngrok-url/get_ngrok_url"`            |

---

## 🎨 UI Enhancements & Icons

- **Fixed code & explanations** are displayed in a **styled WebView**.
- **Icons & colors** enhance the user experience.
- Future updates will include **syntax highlighting** for the fixed code.

---

## ✨ Contributors & Credits

Developed with ❤️ by **SuwanSankaja**\
🔗 Powered by **OpenAI, CodeLlama, and Google Colab**

**Star the repo ⭐ if you found this useful!**

---



