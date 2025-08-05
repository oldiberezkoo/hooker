import { join, dirname, relative } from "path";
import { promises as fs } from "fs";
import { debug, errorLog } from "./utils/logger";
import { walk, ensureDir, readFileSafe } from "./utils/fileSystem";
import { parseDeps } from "./parsing/dependencies";
import { beautify } from "./beautification";
import {
  processFile,
  generateArchitectureDocs,
  writeMarkdownStream,
} from "./documentation/generator";
import { runOllamaStreamToFile } from "./ollama/client";
import { fileHash } from "./utils/crypto";

import type { DepGraph, FileHandle as CustomFileHandle } from "./types";
import { LANGUAGE, eLanguage, PROMPT, ROOT, OLLAMA_HOST_ADDRESS } from "..";

// Проверка подключения к Ollama
async function checkOllamaConnection(): Promise<boolean> {
  try {
    // Попробуем сделать простой запрос к Ollama API
    const res = await fetch(`${OLLAMA_HOST_ADDRESS}/api/tags`, {
      method: "GET",
    });
    if (!res.ok) {
      debug(`[ollama] Ollama responded with status ${res.status}`);
      return false;
    }
    debug("[ollama] Ollama connection OK");
    return true;
  } catch (err) {
    errorLog("[ollama] Ollama connection failed", err);
    return false;
  }
}

// Причина, почему лого может не вставляться в файлы:
// Если markdown-файл потом обрабатывается каким-то markdown-парсером или LLM, который удаляет/игнорирует HTML-теги или многострочные блоки с ```,
// то лого может не отображаться. Также, если markdown-файл уже существует и не перезаписывается, старый вариант без лого может остаться.
// Проверьте, что markdown-файл действительно создаётся с новым содержимым и что markdown-рендер поддерживает HTML и многострочные блоки.

async function ensureAllDirs(): Promise<void> {
  const dirs = [
    ".cache",
    "docs",
    "docs/files",
    "docs/instrumented",
    "docs/architecture",
  ];
  for (const d of dirs) {
    await ensureDir(d);
    debug(`[dirs] ensured ${d}`);
  }
}

async function buildGraph(files: string[]): Promise<DepGraph> {
  const graph: DepGraph = {};
  for (const f of files) {
    try {
      graph[f] = await parseDeps(f);
      debug(`[deps] ${relative(ROOT, f)} → ${[...graph[f]].join(", ") || "–"}`);
    } catch (err) {
      errorLog(`[deps] parseDeps failed for ${f}`, err);
      graph[f] = new Set();
    }
  }
  return graph;
}

function makeHeader(rel: string, deps: Set<string>): string {
  const depsList =
    [...deps].map((d) => `- \`${d}\``).join("\n") || "_No dependencies_";
  // Важно: Markdown поддерживает HTML, но не все рендеры это показывают!
  // Если лого не видно, попробуйте открыть md-файл в GitHub или VSCode.
  // Если всё равно не видно, возможно, markdown-файл не обновляется.
  const logo = `
<p align="center">

\`\`\`bash
   ▄█    █▄     ▄██████▄   ▄██████▄     ▄█   ▄█▄    ▄████████    ▄████████ 
  ███    ███   ███    ███ ███    ███   ███ ▄███▀   ███    ███   ███    ███ 
  ███    ███   ███    ███ ███    ███   ███▐██▀     ███    █▀    ███    ███ 
 ▄███▄▄▄▄███▄▄ ███    ███ ███    ███  ▄█████▀     ▄███▄▄▄      ▄███▄▄▄▄██▀ 
▀▀███▀▀▀▀███▀  ███    ███ ███    ███ ▀▀█████▄    ▀▀███▀▀▀     ▀▀███▀▀▀▀▀   
  ███    ███   ███    ███ ███    ███   ███▐██▄     ███    █▄  ▀███████████ 
  ███    ███   ███    ███ ███    ███   ███ ▀███▄   ███    ███   ███    ███ 
  ███    █▀     ▀██████▀   ▀██████▀    ███   ▀█▀   ██████████   ███    ███ 
                                       ▀                        ███    ███
\`\`\`

</p>
<p align="center">
  POWERED BY <a href="https://github.com/oldiberezkoo/hooker">HOOKER</a>
</p>
`;
  const why =
    LANGUAGE === eLanguage.Russian
      ? `**Зачем нужен этот файл:**\n\nЭтот файл (\`${rel}\`) реализует архитектурную или прикладную логику.\n\n`
      : `**Why this file exists:**\n\nThis file (\`${rel}\`) implements specific application logic.\n\n`;
  const depsLabel =
    LANGUAGE === eLanguage.Russian ? "**Зависимости:**" : "**Dependencies:**";

  // Вставляем лого прямо после заголовка
  return `# ${rel}\n\n${logo}\n${why}${depsLabel}\n\n${depsList}\n\n---\n\n`;
}

async function generateMarkdownForFile(
  file: string,
  deps: Set<string>
): Promise<void> {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const outPath = join("docs/files", rel + ".md");
  await ensureDir(dirname(outPath));

  // Skip if already exists
  try {
    const st = await fs.stat(outPath);
    if (st.size > 0) {
      // ВАЖНО: если файл уже существует, он не будет перезаписан, и лого не появится!
      debug(`[skip] ${rel}`);
      return;
    }
  } catch {
    // not exist
  }

  // Read & beautify
  const raw = await readFileSafe(file);
  const code = await beautify(raw).catch(() => raw);

  // Build prompt, header, hash
  const prompt = PROMPT(code);
  const hash = fileHash(code);
  const header = makeHeader(rel, deps);

  // Stream to markdown
  await writeMarkdownStream(outPath, header, null, async () => {
    debug(`[ollama] starting ${rel}`);
    const handle = (await fs.open(outPath, "a")) as unknown as CustomFileHandle;
    try {
      await runOllamaStreamToFile(prompt, hash, handle);
      debug(`[ollama] finished ${rel}`);
    } finally {
      await handle.close();
    }
  });
}

async function run(): Promise<void> {
  debug(`[run] ROOT=${ROOT}`);

  // Проверяем подключение к Ollama перед началом работы
  const ollamaOk = await checkOllamaConnection();
  if (!ollamaOk) {
    errorLog(
      `[run] Ollama не доступен. Проверьте, что Ollama запущен на ${OLLAMA_HOST_ADDRESS}`
    );
    process.exit(1);
  }

  // 1. Gather files
  let files: string[];
  try {
    files = await walk(ROOT);
    debug(`[run] found ${files.length} files`);
  } catch (err) {
    errorLog("[run] walk failed", err);
    process.exit(1);
  }

  // 2. Prepare directories
  try {
    await ensureAllDirs();
  } catch (err) {
    errorLog("[run] ensureAllDirs failed", err);
    process.exit(1);
  }

  // 3. Dependency graph
  const graph = await buildGraph(files);

  // 4. Architecture docs
  try {
    await generateArchitectureDocs(graph, files);
    debug("[run] architecture docs generated");
  } catch (err) {
    errorLog("[run] generateArchitectureDocs failed", err);
  }

  // 5. Instrumented versions
  for (const file of files) {
    try {
      await processFile(file, graph, ROOT);
      debug(`[instrument] ${relative(ROOT, file)}`);
    } catch (err) {
      errorLog(`[instrument] processFile failed for ${file}`, err);
    }
  }

  // 6. Per-file markdown via Ollama
  for (const file of files) {
    try {
      await generateMarkdownForFile(file, graph[file] ?? new Set());
    } catch (err) {
      errorLog(`[markdown] failed for ${file}`, err);
    }
  }

  debug("[run] ✅ all steps complete");
}

run().catch((err) => {
  errorLog("[run] unhandled error", err);
  process.exit(1);
});
