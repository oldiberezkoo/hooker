import { join, dirname, relative } from "path";
import { open, stat } from "fs/promises";
import { debug, errorLog } from "../utils/logger";
import { ensureDir, openFileSafe } from "../utils/fileSystem";
import { fileHash } from "../utils/crypto";
import { runOllamaStreamToFile } from "../ollama/client";
import { beautifyWithDeobfuscation } from "../beautification";
import { createInstrumentedVersion } from "../runtime/instrumentation";
import { ArchitectureAnalyzer } from "../architecture/analyzer";
import type { DepGraph } from "../types";

export async function writeMarkdownStream(
  filePath: string,
  header: string,
  docBodyPromise: Promise<string> | null,
  streamBodyFn?: () => Promise<void>
): Promise<void> {
  await ensureDir(dirname(filePath));
  let fileHandle: any | undefined;
  try {
    fileHandle = await openFileSafe(filePath, "w");
    await fileHandle.write(header);
    debug(`[writeMarkdownStream] Header written to ${filePath}`);
    if (streamBodyFn) {
      await streamBodyFn();
      debug(`[writeMarkdownStream] Streamed body written to ${filePath}`);
    } else if (docBodyPromise) {
      let docBody: string;
      try {
        docBody = await docBodyPromise;
        debug(`[writeMarkdownStream] Body generated for ${filePath}`);
      } catch (err) {
        errorLog(`[writeMarkdownStream] Error in docBodyPromise:`, err);
        docBody = "_Failed to generate documentation._";
      }
      await fileHandle.write(docBody);
      debug(`[writeMarkdownStream] Body written to ${filePath}`);
    }
  } catch (err) {
    errorLog(`[writeMarkdownStream] Failed to write to ${filePath}:`, err);
  } finally {
    if (fileHandle) {
      try {
        await fileHandle.close();
        debug(`[writeMarkdownStream] File closed: ${filePath}`);
      } catch (err) {
        errorLog(
          `[writeMarkdownStream] Failed to close file: ${filePath}`,
          err
        );
      }
    }
  }
}

export function generateOllamaPrompt(code: string, rel: string): string {
  return `
You are a lead expert in reverse engineering and JavaScript/TypeScript source code analysis.
Your task is to perform a deep, accurate, and professional examination of the given file for auditing, documentation, and architectural understanding.
This code has been automatically deobfuscated and enhanced for analysis. 
Use the strictly structured template below. Fill each section with detailed explanations, examples, and code excerpts.
1. **General Purpose and Architecture**  
   - Describe the business logic or user scenario addressed by the file.  
   - Specify the main architectural patterns (modules, layers, asynchronous patterns via async/await or generators).  
2. **Input and Output Data**  
   - List all public functions, their signatures, expected arguments, and return types.  
   - Specify what data GraphQL queries accept and what they return.  
3. **Dependencies**  
   - Enumerate external packages and their roles.  
   - List internal modules and types, including their import origins.  
4. **Side Effects and Environment Interaction**  
   - Describe network calls (API, WebSocket), access to localStorage/sessionStorage.  
   - Note usage of global variables, DOM manipulation, cookies, etc.  
   - **If none:** "No side effects present in this file."
5. **Key Algorithms and Logic**  
   - Break down the most non-trivial parts with step-by-step examples.
   - Explain potential vulnerabilities or edge cases.
6. **Potential Reverse Engineering / Injection Points**  
   - Identify functions or areas where data interception or logic substitution is possible.
7. **Code Structure Tree and Summary**  
   - Present a hierarchical tree of modules, functions, and relationships.
**Source code for analysis:**
\`\`\`ts
${code}
\`\`\`
  `.trim();
}

export async function processFile(
  file: string,
  graph: DepGraph,
  ROOT: string
): Promise<void> {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const outPath = join("docs/files", rel + ".md");
  const instrumentedPath = join("docs/instrumented", rel + ".instrumented.js");
  debug(`[processFile] Processing file: ${file} (rel: ${rel})`);

  // Проверяем, обработан ли файл
  try {
    const outStat = await stat(outPath);
    if (outStat && outStat.size > 0) {
      debug(`[processFile] Skipping ${rel} (already documented)`);
      return;
    }
  } catch {
    // Файл не существует, продолжаем обработку
  }

  // Читаем и обрабатываем файл
  let raw: string;
  try {
    const { readFileSafe } = await import("../utils/fileSystem");
    raw = await readFileSafe(file);
    debug(`[processFile] Read file: ${file} (length: ${raw.length})`);
  } catch (err) {
    errorLog(`[processFile] Failed to read file: ${file}`, err);
    return;
  }

  // Улучшенная beautification с деобфускацией
  let code: string;
  try {
    code = await beautifyWithDeobfuscation(raw);
    debug(`[processFile] Enhanced beautification completed for: ${file}`);
  } catch (err) {
    errorLog(`[processFile] Enhanced beautify failed for file: ${file}`, err);
    code = raw;
  }

  // Создаем инструментированную версию
  try {
    await createInstrumentedVersion(file, instrumentedPath);
    debug(`[processFile] Created instrumented version: ${instrumentedPath}`);
  } catch (err) {
    errorLog(`[processFile] Failed to create instrumented version:`, err);
  }

  // Генерируем документацию
  const depsSet = graph[file] ?? new Set();
  const depsList = [...depsSet].map((d) => `- \`${d}\``).join("\n");
  const whyFile = `**Why this file exists:**
This file (\`${rel}\`) is present in the project because it implements specific logic, functionality, or architectural responsibilities required by the application. Its dependencies and code structure reflect its role within the codebase. See below for a detailed breakdown.
`;
  const header = `# ${rel}
${whyFile}**Dependencies:**
${depsList}
**🔧 Instrumented Version**: [${rel}.instrumented.js](../instrumented/${rel}.instrumented.js)
---
`;

  // Генерируем промпт для Ollama
  const prompt = generateOllamaPrompt(code, rel);
  const chunkHash = fileHash(code);

  // Записываем документацию
  await writeMarkdownStream(outPath, header, null, async () => {
    debug(
      `[processFile] Running enhanced ollama analysis for: ${file} (hash: ${chunkHash})`
    );
    await runOllamaStreamToFile(prompt, chunkHash, await open(outPath, "a"));
    debug(`[processFile] Enhanced analysis completed for: ${file}`);
  });
}

export async function generateArchitectureDocs(
  depGraph: DepGraph,
  files: string[]
): Promise<void> {
  debug("[generateArchitectureDocs] Starting architecture analysis");

  const analyzer = new ArchitectureAnalyzer();
  await analyzer.analyzeProject(depGraph, files);

  const architectureReport = analyzer.generateArchitectureReport();

  try {
    await ensureDir("docs");
    const { writeFileSafe } = await import("../utils/fileSystem");
    await writeFileSafe("docs/architecture.md", architectureReport);
    debug(
      "[generateArchitectureDocs] Architecture report written to docs/architecture.md"
    );
  } catch (err) {
    errorLog(
      "[generateArchitectureDocs] Failed to write architecture report:",
      err
    );
  }
}
