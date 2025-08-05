import { join, dirname } from "path";
import { debug, errorLog } from "../utils/logger";
import { ensureDir, writeFileSafe } from "../utils/fileSystem";
import { RuntimeAnalyzer, getBasicRuntimeHooks } from "./analyzer";
import type { InstrumentationConfig } from "../types";

export async function createInstrumentedVersion(
  filePath: string,
  outputPath: string,
  config?: Partial<InstrumentationConfig>
): Promise<void> {
  debug(`[createInstrumentedVersion] Instrumenting ${filePath}`);
  try {
    const { readFileSafe } = await import("../utils/fileSystem");
    const code = await readFileSafe(filePath);
    const analyzer = new RuntimeAnalyzer(config);

    let instrumented: string;
    try {
      // Попытка инструментации через AST
      instrumented = analyzer.instrumentCode(code);
    } catch (instrumentationErr) {
      errorLog(
        `[createInstrumentedVersion] AST instrumentation failed, trying fallback`,
        instrumentationErr
      );

      // Fallback к простому добавлению хуков
      instrumented = `
${getBasicRuntimeHooks()}
${code}
console.log('[Runtime Analyzer] Basic instrumentation active.');
`;
    }

    await ensureDir(dirname(outputPath));
    await writeFileSafe(outputPath, instrumented);
    debug(
      `[createInstrumentedVersion] Instrumented code written to ${outputPath}`
    );
  } catch (err) {
    errorLog(
      `[createInstrumentedVersion] Failed to instrument ${filePath}:`,
      err
    );
    throw err;
  }
}
