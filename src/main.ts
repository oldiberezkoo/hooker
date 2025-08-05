import { join, dirname, relative } from "path";
import { debug, errorLog } from "./utils/logger";
import { walk, ensureDir } from "./utils/fileSystem";
import { parseDeps } from "./parsing/dependencies";
import { beautify } from "./beautification";
import {
  processFile,
  generateArchitectureDocs,
} from "./documentation/generator";
import { fileHash } from "./utils/crypto";
import type { DepGraph } from "./types";

async function enhancedMain(): Promise<void> {
  const ROOT = "project";
  debug(`[enhancedMain] Starting enhanced analysis process. Root: ${ROOT}`);

  let files: string[] = [];
  try {
    files = await walk(ROOT);
    debug(`[enhancedMain] Files found: ${files.length}`);
  } catch (err) {
    errorLog("[enhancedMain] Failed to walk project directory", err);
    return;
  }

  const graph: DepGraph = {};

  // Создаем выходные директории
  try {
    await ensureDir(".cache");
    await ensureDir("docs");
    await ensureDir("docs/files");
    await ensureDir("docs/instrumented");
    await ensureDir("docs/architecture");
    debug("[enhancedMain] Output directories ensured");
  } catch (err) {
    errorLog("[enhancedMain] Failed to ensure output directories", err);
    return;
  }

  // Строим граф зависимостей
  debug(`[enhancedMain] Building dependency graph...`);
  for (const f of files) {
    try {
      graph[f] = await parseDeps(f);
      debug(
        `[enhancedMain] Dependencies for ${f}: ${[...graph[f]].join(", ")}`
      );
    } catch (err) {
      errorLog(`[enhancedMain] Failed to parse dependencies for ${f}`, err);
      graph[f] = new Set();
    }
  }

  // Генерируем архитектурную документацию
  debug(`[enhancedMain] Generating architecture documentation...`);
  try {
    await generateArchitectureDocs(graph, files);
  } catch (err) {
    errorLog(`[enhancedMain] Failed to generate architecture docs:`, err);
  }

  // Обрабатываем каждый файл
  debug(`[enhancedMain] Generating enhanced documentation for each file...`);
  for (const file of files) {
    try {
      await processFile(file, graph, ROOT);
    } catch (err) {
      errorLog(`[enhancedMain] Failed to process file ${file}:`, err);
      // Продолжаем обработку других файлов
    }
  }

  debug(
    "✅ Enhanced analysis complete: per-file docs, architecture analysis, and instrumented versions generated."
  );
}

async function main(): Promise<void> {
  const ROOT = "project";
  debug(`[main] Starting main process. Root: ${ROOT}`);
  let files: string[] = [];
  try {
    files = await walk(ROOT);
    debug(`[main] Files found: ${files.length}`);
  } catch (err) {
    errorLog("[main] Failed to walk project directory", err);
    return;
  }
  const graph: DepGraph = {};

  try {
    await ensureDir(".cache");
    await ensureDir("docs/files");
    debug("[main] Output directories ensured");
  } catch (err) {
    errorLog("[main] Failed to ensure output directories", err);
    return;
  }

  debug(`[main] Building dependency graph...`);
  for (const f of files) {
    try {
      graph[f] = await parseDeps(f);
      debug(`[main] Dependencies for ${f}: ${[...graph[f]].join(", ")}`);
    } catch (err) {
      errorLog(`[main] Failed to parse dependencies for ${f}`, err);
      graph[f] = new Set();
    }
  }

  debug(`[main] Generating markdown documentation for each file...`);
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    const outPath = join("docs/files", rel + ".md");
    debug(`[main] Processing file: ${file} (rel: ${rel})`);
    try {
      await ensureDir(dirname(outPath));
      debug(`[main] Output directory ensured for: ${outPath}`);
    } catch (err) {
      errorLog(`[main] Failed to ensure output directory for: ${outPath}`, err);
      continue;
    }

    let outStat: any | undefined;
    try {
      const { stat } = await import("fs/promises");
      outStat = await stat(outPath);
      if (outStat) {
        debug(`[main] Output file exists: ${outPath} (size: ${outStat.size})`);
      }
    } catch {
      outStat = undefined;
      debug(`[main] Output file does not exist: ${outPath}`);
    }
    if (outStat && outStat.size > 0) {
      debug(`[main] Skipping ${rel} (already documented)`);
      continue;
    }

    let raw: string;
    try {
      const { readFileSafe } = await import("./utils/fileSystem");
      raw = await readFileSafe(file);
      debug(`[main] Read file: ${file} (length: ${raw.length})`);
    } catch (err) {
      errorLog(`[main] Failed to read file: ${file}`, err);
      continue;
    }
    let code: string;
    try {
      code = await beautify(raw);
      debug(`[main] Beautified code for: ${file}`);
    } catch (err) {
      errorLog(`[main] Beautify failed for file: ${file}`, err);
      code = raw;
    }
    const depsSet = graph[file] ?? new Set();
    const depsList = [...depsSet].map((d) => `- \`${d}\``).join("\n");
    const whyFile = `**Why this file exists:**\n\nThis file (\`${rel}\`) is present in the project because it implements specific logic, functionality, or architectural responsibilities required by the application. Its dependencies and code structure reflect its role within the codebase. See below for a detailed breakdown.\n\n`;

    const header = `# ${rel}\n\n${whyFile}**Dependencies:**\n\n${depsList}\n\n---\n\n`;

    const prompt = `
You are a lead expert in reverse engineering and JavaScript/TypeScript source code analysis.
Your task is to perform a deep, accurate, and professional examination of the given file for auditing, documentation, and architectural understanding.

Use the strictly structured template below. Fill each section with detailed explanations, examples, and code excerpts.

1. **General Purpose and Architecture**  
   - Describe the business logic or user scenario addressed by the file.  
   - Specify the main architectural patterns (modules, layers, asynchronous patterns via async/await or generators).  
   - **Example:**  
     > This module handles tracking of video item impressions and clicks.  
     > - Implements the Command pattern for event dispatch.  
     > - Main export is \`trackEvent(eventType: string, payload: Payload): Promise<void>\`.  
     > - Asynchronous queue is implemented with generators:  
     >   \`\`\`ts
     >   export function* sendQueue(): Generator<Promise<void>, void, unknown> {
     >     for (const item of queue) {
     >       yield api.send(item);
     >     }
     >   }
     >   \`\`\`

2. **Input and Output Data**  
   - List all public functions, their signatures, expected arguments, and return types.  
   - Specify what data GraphQL queries accept and what they return.  
   - **Example:**  
     \`\`\`ts
     /**
      * @param id — unique video identifier
      * @returns Promise<{ ownerId: string; duration: number; }>
      */
     export async function fetchVideoMeta(id: string): Promise<VideoMeta> { /* ... */ }
     \`\`\`

3. **Dependencies**  
   - Enumerate external packages (\`graphql-request\`, \`lodash\`, \`moment\`, etc.) and their roles.  
   - List internal modules and types, including their import origins.  
   - **Example table:**

     | Module                         | Purpose                                |
     |--------------------------------|----------------------------------------|
     | \`import { gql }\`               | Constructs GraphQL queries             |
     | \`import { errorLog }\`          | Universal error logger                 |

4. **Side Effects and Environment Interaction**  
   - Describe network calls (API, WebSocket), access to localStorage/sessionStorage.  
   - Note usage of global variables, DOM manipulation, cookies, etc.  
   - **If none:** "No side effects present in this file."

5. **Key Algorithms and Logic**  
   - Break down the most non-trivial parts by subitems:  
     - Tracking (impressions, clicks)  
     - Time parsing and formatting  
     - Asynchronous operation queue  
   - For each, explain:  
     1. What the algorithm does.  
     2. A step-by-step example with real variable names.  
     3. Potential vulnerabilities or edge cases.  
   - **Example:**
     \`\`\`ts
     // Click tracking function
     export async function trackClick(itemId: string): Promise<void> {
       try {
         const resp = await api.query(CLICK_MUTATION, { itemId });
         if (!resp.ok) throw new Error('Failed');
       } catch (e) {
         errorLog(e, { module: 'trackClick', itemId });
       }
     }
     \`\`\`

6. **Potential Reverse Engineering / Injection Points**  
   - Identify functions or areas where data interception or logic substitution is possible (middleware, arguments, global objects).  
   - **Example:**  
     > You can replace \`api.query\` with a mock via dependency injection to intercept GraphQL requests.  
     > The \`sendQueue()\` generator can be manipulated by injecting a custom \`queue\` array.

7. **Code Structure Tree and Summary**  
   - Internally analyze the entire codebase to build a hierarchical tree of its modules, functions, and relationships.  
   - Then present a concise, clear rewrite of that tree—listing each node (module, function, export) and its immediate children.

---

**Response Requirements:**  
- Be concise and focused; avoid unnecessary verbosity.  
- Use \`function\` declarations in code examples.  
- Include lines of exact code snippets where necessary..  
- If a section is not applicable, explicitly state "No relevant content."

**Source code for analysis:**

\`\`\`ts
${code}
\`\`\`
    `.trim();

    const chunkHash = fileHash(code);

    // Stream Ollama output directly to file in real time
    const { writeMarkdownStream } = await import("./documentation/generator");
    const { runOllamaStreamToFile } = await import("./ollama/client");
    const { open } = await import("fs/promises");

    await writeMarkdownStream(outPath, header, null, async () => {
      debug(
        `[main] Running ollama (stream:true) for: ${file} (hash: ${chunkHash})`
      );
      await runOllamaStreamToFile(prompt, chunkHash, await open(outPath, "a"));
      debug(`[main] Ollama streaming response finished for: ${file}`);
    });
  }

  debug("✅ Phase 1 complete: per-file docs generated.");
}

// Export both functions for flexibility
export { enhancedMain, main };

// Run enhanced main by default
enhancedMain().catch((err: unknown) => {
  errorLog("[main] Unhandled error:", err);
  process.exit(1);
});
