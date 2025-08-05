import { Ollama } from "ollama";
import { debug, errorLog } from "../utils/logger";
import { writeFileSafe } from "../utils/fileSystem";
import { fileHash } from "../utils/crypto";
import type { FileHandle } from "../types";
import { OLLAMA_HOST_ADDRESS } from "../..";

let ollamaClient: Ollama | null = null;
try {
  ollamaClient = new Ollama({
    host: OLLAMA_HOST_ADDRESS,
  });
  debug("[Ollama] Ollama client initialized");
} catch (err) {
  errorLog("[Ollama] Failed to initialize Ollama client", err);
  ollamaClient = null;
}

export function parseOllamaMarkdownResponse(response: string): string {
  try {
    const mdMatch = response.match(
      /(^|\n)#{1,6} .+|^---$|^```[\s\S]*?```|^[\s\S]+/gm
    );
    if (!mdMatch) {
      debug(
        "[parseOllamaMarkdownResponse] No markdown match, returning trimmed response"
      );
      return response.trim();
    }
    let result = "";
    let inCode = false;
    for (const line of response.split("\n")) {
      if (line.trim().startsWith("```")) {
        inCode = !inCode;
        result += line + "\n";
        continue;
      }
      if (!inCode && line.trim().startsWith("#")) {
        if (result.length > 0) break;
      }
      result += line + "\n";
    }
    debug("[parseOllamaMarkdownResponse] Markdown response parsed");
    return result.trim();
  } catch (err) {
    errorLog("[parseOllamaMarkdownResponse] Error parsing markdown", err);
    return response.trim();
  }
}

/**
 * Stream Ollama response and write to file in real time.
 * Returns a Promise that resolves when the stream is finished.
 */
export async function runOllamaStreamToFile(
  prompt: string,
  cacheKey: string,
  fileHandle: FileHandle
): Promise<void> {
  const { join } = await import("path");
  const { readFile, writeFile } = await import("fs/promises");
  const cacheFile = join(".cache", cacheKey + ".json");
  debug(`[runOllamaStreamToFile] Checking cache for key: ${cacheKey}`);

  // Попытка загрузить из кэша
  try {
    const cached = await readFile(cacheFile, "utf8");
    const parsed = JSON.parse(cached);
    if (typeof parsed.response === "string") {
      debug(`[runOllamaStreamToFile] Cache hit for key: ${cacheKey}`);
      const parsedMd = parseOllamaMarkdownResponse(parsed.response);
      await fileHandle.write(parsedMd);
      return;
    }
  } catch (err) {
    debug(`[runOllamaStreamToFile] Cache miss for key: ${cacheKey}`);
  }

  if (!ollamaClient) {
    errorLog("[runOllamaStreamToFile] Ollama client not available");
    await fileHandle.write(
      "_Failed to generate documentation: Ollama client not available._"
    );
    return;
  }

  debug(
    `[runOllamaStreamToFile] Using ollama npm client for key: ${cacheKey} (stream: true)`
  );
  let responseContent = "";
  let success = false;

  try {
    const stream = await ollamaClient.chat({
      model: "huihui_ai/qwen2.5-1m-abliterated:7b",
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });

    for await (const chunk of stream) {
      let text = "";

      // Обрабатываем разные возможные форматы ответа
      if (typeof chunk === "string") {
        text = chunk;
      } else if (chunk && typeof (chunk as any).message?.content === "string") {
        text = (chunk as any).message.content;
      } else if (chunk && typeof (chunk as any).content === "string") {
        text = (chunk as any).content;
      }

      if (text) {
        debug(
          `[runOllamaStreamToFile] Streaming chunk of length ${text.length}`
        );
        responseContent += text;
        await fileHandle.write(text);
      }
    }

    debug(
      `[runOllamaStreamToFile] Stream finished, total length: ${responseContent.length}`
    );

    // Сохраняем в кэш
    try {
      await writeFile(
        cacheFile,
        JSON.stringify({ prompt, response: responseContent }),
        "utf8"
      );
      debug(
        `[runOllamaStreamToFile] Wrote ollama response to cache: ${cacheFile}`
      );
      success = true;
    } catch (e) {
      errorLog("[runOllamaStreamToFile] Failed to write cache file", e);
    }
  } catch (err: any) {
    errorLog(
      `[runOllamaStreamToFile] Ollama npm client failed: ${err.message || err}`
    );

    // Пытаемся использовать fallback модель
    try {
      debug("[runOllamaStreamToFile] Trying fallback model");
      const fallbackResponse = await ollamaClient.chat({
        model: "qwen:7b",
        messages: [{ role: "user", content: prompt }],
      });

      const text = fallbackResponse.message.content;
      await fileHandle.write(text);
      responseContent = text;
      success = true;

      debug("[runOllamaStreamToFile] Fallback model succeeded");
    } catch (fallbackErr) {
      errorLog(
        "[runOllamaStreamToFile] Fallback model also failed",
        fallbackErr
      );
      await fileHandle.write(
        "_Failed to generate documentation: Ollama error._"
      );
    }
  } finally {
    if (!success && responseContent) {
      // Если частично получили ответ, сохраняем что есть
      try {
        await writeFile(
          cacheFile,
          JSON.stringify({ prompt, response: responseContent }),
          "utf8"
        );
      } catch (e) {
        // Игнорируем ошибку сохранения
      }
    }
  }
}
