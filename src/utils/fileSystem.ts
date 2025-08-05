import { join, dirname } from "path";
import { mkdir, readdir, stat, readFile, writeFile, open } from "fs/promises";
import { debug, errorLog } from "./logger";
import type { Stats } from "../types";

export async function ensureDir(path: string): Promise<void> {
  debug(`[ensureDir] Ensuring directory: ${path}`);
  try {
    await mkdir(path, { recursive: true });
    debug(`[ensureDir] Directory ensured: ${path}`);
  } catch (err: any) {
    if (err && err.code !== "EEXIST") {
      errorLog(`[ensureDir] Error ensuring directory: ${path}`, err);
      throw err;
    } else {
      debug(`[ensureDir] Directory already exists: ${path}`);
    }
  }
}

export async function walk(dir: string, out: string[] = []): Promise<string[]> {
  debug(`[walk] Reading directory: ${dir}`);
  let names: string[];
  try {
    names = await readdir(dir);
    debug(`[walk] Found entries in ${dir}: ${names.join(", ")}`);
  } catch (err) {
    errorLog(`[walk] Failed to read directory: ${dir}`, err);
    return out;
  }

  for (const name of names) {
    const full = join(dir, name);
    let s: Stats;
    try {
      s = await stat(full);
    } catch (err) {
      errorLog(`[walk] Failed to stat: ${full}`, err);
      continue;
    }
    if (s.isDirectory()) {
      debug(`[walk] Entering directory: ${full}`);
      await walk(full, out);
    } else if (
      [".js", ".ts", ".jsx", ".tsx", ".html"].includes(
        name.split(".").pop() || ""
      )
    ) {
      debug(`[walk] Found file: ${full}`);
      out.push(full);
    } else {
      debug(`[walk] Skipping non-code file: ${full}`);
    }
  }
  return out;
}

export async function readFileSafe(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath, "utf8");
    debug(`[readFileSafe] Read file: ${filePath} (length: ${content.length})`);
    return content;
  } catch (err) {
    errorLog(`[readFileSafe] Failed to read file: ${filePath}`, err);
    throw err;
  }
}

export async function writeFileSafe(
  filePath: string,
  content: string
): Promise<void> {
  try {
    await writeFile(filePath, content, "utf8");
    debug(`[writeFileSafe] Wrote file: ${filePath}`);
  } catch (err) {
    errorLog(`[writeFileSafe] Failed to write file: ${filePath}`, err);
    throw err;
  }
}

export async function openFileSafe(filePath: string, mode: string = "w") {
  try {
    const handle = await open(filePath, mode);
    debug(`[openFileSafe] Opened file: ${filePath} in mode: ${mode}`);
    return handle;
  } catch (err) {
    errorLog(`[openFileSafe] Failed to open file: ${filePath}`, err);
    throw err;
  }
}
