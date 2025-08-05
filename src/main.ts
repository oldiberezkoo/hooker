import { join, dirname, relative } from "path";
import { promises as fs } from "fs";
import { debug, errorLog } from "./utils/logger";
import { walk, ensureDir, readFileSafe } from "./utils/fileSystem";
import { parseDeps } from "./parsing/dependencies";
import { beautify } from "./beautification";
import { writeFile, appendFile } from "fs/promises";

import {
  processFile,
  generateArchitectureDocs,
} from "./documentation/generator";
import { runOllamaStreamToFile } from "./ollama/client";
import { fileHash } from "./utils/crypto";
import { LANGUAGE, eLanguage, PROMPT, ROOT, OLLAMA_HOST_ADDRESS } from "..";

import type { DepGraph, FileHandle as CustomFileHandle } from "./types";

/**
 * Проверка подключения к Ollama
 */
async function checkOllamaConnection(): Promise<boolean> {
  try {
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

/**
 * Убедиться, что все выходные каталоги существуют
 */
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

/**
 * Построение графа зависимостей
 */
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

/**
 * Генерация заголовка markdown-файла
 */
function makeHeader(rel: string, deps: Set<string>): string {
  const depsList =
    [...deps].map((d) => `- \`${d}\``).join("\n") || "_No dependencies_";

  // ИСПРАВЛЕНО: Добавлены обязательные пустые строки до/после блока кода
  // и экранированы спецсимволы для корректного отображения в Markdown
  const logo = `
\`\`\`
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

`;

  const why =
    LANGUAGE === eLanguage.Russian
      ? `**Зачем нужен этот файл:**\n\nЭтот файл (\`${rel}\`) реализует архитектурную или прикладную логику.\n\n`
      : `**Why this file exists:**\n\nThis file (\`${rel}\`) implements specific application logic.\n\n`;

  const depsLabel =
    LANGUAGE === eLanguage.Russian ? "**Зависимости:**" : "**Dependencies:**";

  // ИСПРАВЛЕНО: Добавлены обязательные пустые строки вокруг логотипа
  return `# ${rel}

${logo.trim()}

${why}${depsLabel}

${depsList}

---

`;
}

/**
 * Обёртка для записи markdown-файла
 */
async function writeMarkdownStream(
  filePath: string,
  header: string,
  _placeholder: null,
  cb: () => Promise<void>
): Promise<void> {
  // Для отладки можно оставить один вывод
  // console.log("==HEADER==\n" + header);
  await writeFile(filePath, header, "utf-8"); // убираем лишние \n\n, т.к. header уже содержит все нужные переводы строк
  await cb();
}

/**
 * Генерация markdown-файла для одного исходника
 */
async function generateMarkdownForFile(
  file: string,
  deps: Set<string>
): Promise<void> {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const outPath = join("docs/files", rel + ".md");
  await ensureDir(dirname(outPath));

  const FORCE_REWRITE = true;

  try {
    const st = await fs.stat(outPath);
    if (!FORCE_REWRITE && st.size > 0) {
      debug(`[skip] ${rel}`);
      return;
    }
  } catch {}

  const raw = await readFileSafe(file);
  const code = await beautify(raw).catch(() => raw);

  const prompt = PROMPT(code);
  const hash = fileHash(code);
  const header = makeHeader(rel, deps);

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

/**
 * Главный запуск
 */
async function run(): Promise<void> {
  debug(`[run] ROOT=${ROOT}`);

  const ollamaOk = await checkOllamaConnection();
  if (!ollamaOk) {
    errorLog(
      `[run] Ollama не доступен. Проверьте, что Ollama запущен на ${OLLAMA_HOST_ADDRESS}`
    );
    process.exit(1);
  }

  let files: string[];
  try {
    files = await walk(ROOT);
    debug(`[run] found ${files.length} files`);
  } catch (err) {
    errorLog("[run] walk failed", err);
    process.exit(1);
  }

  try {
    await ensureAllDirs();
  } catch (err) {
    errorLog("[run] ensureAllDirs failed", err);
    process.exit(1);
  }

  const graph = await buildGraph(files);

  try {
    await generateArchitectureDocs(graph, files);
    debug("[run] architecture docs generated");
  } catch (err) {
    errorLog("[run] generateArchitectureDocs failed", err);
  }

  for (const file of files) {
    try {
      await processFile(file, graph, ROOT);
      debug(`[instrument] ${relative(ROOT, file)}`);
    } catch (err) {
      errorLog(`[instrument] processFile failed for ${file}`, err);
    }
  }

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
