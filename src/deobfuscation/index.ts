import { debug, errorLog } from "../utils/logger";
import { detectObfuscationType } from "./patterns";

export async function smartDeobfuscate(code: string): Promise<string> {
  debug("[smartDeobfuscate] Starting smart deobfuscation");

  const patterns = await detectObfuscationType(code);

  if (patterns.length === 0) {
    debug("[smartDeobfuscate] No obfuscation patterns detected");
    return code;
  }

  let result = code;

  // Применяем деобфускацию в порядке уверенности
  for (const pattern of patterns) {
    debug(`[smartDeobfuscate] Applying ${pattern.name} deobfuscation`);
    try {
      result = await pattern.deobfuscate(result);
    } catch (err) {
      errorLog(
        `[smartDeobfuscate] Error in ${pattern.name} deobfuscation:`,
        err
      );
    }
  }

  debug("[smartDeobfuscate] Deobfuscation complete");
  return result;
}

export * from "./patterns";
