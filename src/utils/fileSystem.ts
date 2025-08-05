import { join, dirname, extname } from "path";
import { mkdir, readdir, stat, readFile, writeFile, open } from "fs/promises";
import { debug, errorLog } from "./logger";
import type { Stats } from "../types";
import { SingleBar, Presets } from "cli-progress";

/**
 * Обрезает путь для отображения в прогресс-баре.
 */
function truncatePath(path: string, maxLength: number): string {
  return path.length <= maxLength ? path : "…" + path.slice(-maxLength);
}

/**
 * Гарантирует существование директории, создавая её при необходимости.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  debug("[fileSystem][ensureDir]", `Ensuring directory: ${dirPath}`);
  try {
    await mkdir(dirPath, { recursive: true });
    debug("[fileSystem][ensureDir]", `Directory ready: ${dirPath}`);
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      errorLog("[fileSystem][ensureDir]", `Cannot create: ${dirPath}`, err);
      throw err;
    }
    debug("[fileSystem][ensureDir]", `Already exists: ${dirPath}`);
  }
}

/**
 * Рекурсивно собирает все кодовые файлы в директории `dir`.
 * Исправлено: readdir теперь вызывается с { withFileTypes: true }, чтобы entries содержал информацию о типе файла.
 */
async function collectFiles(dir: string, out: string[]): Promise<void> {
  let entries: any[];
  try {
    // Используем withFileTypes для получения типа файла без отдельного stat
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    errorLog("[fileSystem][collectFiles]", `Read dir failed: ${dir}`, err);
    return;
  }

  for (const entry of entries) {
    const name = entry.name;
    const full = join(dir, name);

    if (entry.isDirectory()) {
      await collectFiles(full, out);
    } else if (entry.isFile()) {
      const ext = extname(name).toLowerCase();
      if ([".js", ".ts", ".jsx", ".tsx", ".html"].includes(ext)) {
        out.push(full);
      }
    }
    // Символические ссылки и прочее игнорируем
  }
}

/**
 * Обходит директорию, собирает все кодовые файлы и опционально показывает прогресс-бар
 * при чтении каждого файла через readFileSafe.
 *
 * @param dir          — корневая директория для сканирования
 * @param showProgress — если true, читает каждый файл и обновляет CLI прогресс-бар
 */
export async function walk(
  dir: string,
  showProgress = false
): Promise<string[]> {
  const files: string[] = [];
  await collectFiles(dir, files);
  debug("[fileSystem][walk]", `Found ${files.length} code files in ${dir}`);

  if (showProgress && files.length > 0) {
    const bar = new SingleBar(
      {
        format:
          "Processing [{bar}] {percentage}% | {value}/{total} | {filename}",
        barCompleteChar: "\u2588",
        barIncompleteChar: "\u2591",
        hideCursor: true,
      },
      Presets.shades_classic
    );
    bar.start(files.length, 0, { filename: "" });

    for (const file of files) {
      await readFileSafe(file);
      bar.increment(1, { filename: truncatePath(file, 40) });
    }

    bar.stop();
  }

  return files;
}

/**
 * Безопасно читает файл как UTF-8, логируя только ошибки.
 */
export async function readFileSafe(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (err) {
    errorLog("[fileSystem][readFileSafe]", `Cannot read: ${filePath}`, err);
    throw err;
  }
}

/**
 * Безопасно записывает UTF-8 контент в файл.
 */
export async function writeFileSafe(
  filePath: string,
  content: string
): Promise<void> {
  try {
    await writeFile(filePath, content, "utf8");
  } catch (err) {
    errorLog("[fileSystem][writeFileSafe]", `Cannot write: ${filePath}`, err);
    throw err;
  }
}

/**
 * Безопасно открывает файловый дескриптор.
 */
export async function openFileSafe(filePath: string, mode = "w") {
  try {
    return await open(filePath, mode);
  } catch (err) {
    errorLog("[fileSystem][openFileSafe]", `Cannot open: ${filePath}`, err);
    throw err;
  }
}
