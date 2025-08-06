# Hooker

> **Reverse-engineering tool for analyzing JavaScript/TypeScript bundles in web applications.**  
> Designed for fast static analysis, AI-powered code understanding, and architectural insight — perfect for when you need to "figure out what's really going on" in a complex or minified codebase.

---

## 🚀 Overview

**Hooker** is a tool for reverse engineering JS/TS bundles.  
Its main purpose: build an architectural map of an unknown project, visualize dependencies, estimate complexity, and automate the initial audit that would otherwise take weeks for a human.

- **Who is this for?**  
  Security engineers, researchers, reverse engineering enthusiasts, and developers who need to quickly understand a foreign frontend bundle.
- Originally built for Twitch, but suitable for any JS/TS project.

---

## ⚡️ Features

- **Analyzes all JS/TS files** in a given folder (`ROOT`) — recursive, any depth.
- **Generates detailed reports** (`docs/architecture.md`) including:  
  - Architecture diagram (layered structure)
  - Layer Analysis (file responsibilities, complexity)
  - Dependency Matrix (module interconnections)
  - Complexity Analysis Report (top complex modules, metrics)
- **AI-powered file analysis:**  
  Each module is described, dependencies are mapped, and critical spots are highlighted.
- **Instrumented copies** of all files are saved in `docs/instrumented` (pretty-printed, with runtime comments).
- **Works with minified, obfuscated, and any JS/TS files.**

---

## 🛠️ Getting Started

### Requirements

- Node.js **v24+**
- pnpm **v18+**
- [Ollama](https://ollama.com/) with model `huihui_ai/qwen2.5-1m-abliterated:7b` (or any model with at least 512k context)

### Quick Start

```bash
git clone https://github.com/oldiberezkoo/hooker.git
cd hooker
pnpm install
```

**1. Prepare your bundle for analysis:**  
Download or copy your JS files into a folder (e.g., `assets/`).

**2. Set the analysis target:**  
Open `index.ts` and set the `ROOT` variable:

```ts
// index.ts
const ROOT = "assets"; // path to your JS/TS files folder
```

**3. Run the analysis:**
```bash
pnpm start
```

**4. View the report:**  
Results will appear in `docs/architecture.md`.  
Instrumented versions of the parsed files (with runtime info) will be in `docs/instrumented`.

---

## 📃 Example Output (AI Report for a Module)

```markdown
# assets/20312-17ca21e784f6fef3ca2d.js

**Why this file exists:**
This file implements logic and responsibilities related to modal state management in the app...

**Dependencies:**
- [assets/20312-17ca21e784f6fef3ca2d.js.instrumented.js](../instrumented/assets/20312-17ca21e784f6fef3ca2d.js.instrumented.js)
---
[AI-generated description of the module structure, dependencies, complexity metrics, etc.]
```

---

## 📂 Output Structure

- `docs/architecture.md` — the main report: architecture, layers, dependencies, metrics.
- `docs/instrumented/` — prettified and instrumented versions of all analyzed files.
- `.cache/` — temporary folder; may contain leftover data from interrupted runs.

### ⚠️ Recommendation
If you change your target project or if a previous run was interrupted, manually delete `.cache` and `docs` before restarting the analysis.

---

## 🤖 AI & Ollama

- Deep analysis uses Ollama with the `huihui_ai/qwen2.5-1m-abliterated:7b` model (1M token context).
- You can change the model in `src/ollama/client.ts` (minimum required context: 512k).
- All processing is local; your code and reports never leave your machine.

---

## ⚠️ Limitations

- **Maximum file size is 1,024,000 characters** — larger files are skipped (ML context limitation).
- Not all JS files can be parsed correctly (e.g., if minified with invalid syntax); in such cases, AI will attempt to make sense of the file, but results may vary.
- This is an early-stage, "for myself" project — bugs are possible, and the code is not production-ready.

---

## 💡 FAQ

**Why does this project exist?**  
— For reverse engineering JS/TS projects, automating architecture analysis, and finding hidden complexity.

**Can I increase the per-file size limit?**  
— No, this is limited by the ML model context.

**How do I change the AI model?**  
— Edit `src/ollama/client.ts` (min 512k context required).

**Is it safe to analyze private bundles?**  
— Yes, all files and analysis stay on your machine.

**Is this production-ready?**  
— Not yet! This is a work-in-progress; refactoring and improvements are planned.

**Where can I ask questions or suggest features?**  
— Open an issue on GitHub or contact me on Discord: **oldiberezko**

---

## 🧑‍💻 Contributing

Pull requests and ideas are welcome!  
Open issues, suggest patches, or discuss architecture.

---

## 📜 License

MIT

---

> _Author: [oldiberezkoo](https://github.com/oldiberezkoo)_
