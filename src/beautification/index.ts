import { parse } from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import prettier from "prettier";
import recast from "recast";
import { debug, errorLog } from "../utils/logger";
import { smartDeobfuscate } from "../deobfuscation";

export async function beautify(code: string): Promise<string> {
  debug(`[beautify] Beautifying code chunk of length ${code.length}`);
  let prettied: string = code;
  try {
    prettied = await prettier.format(code, {
      parser: "babel",
      singleQuote: true,
    });
    debug(`[beautify] Prettier formatting succeeded`);
  } catch (err) {
    errorLog("[beautify] Prettier formatting failed", err);
    prettied = code;
  }
  let ast: recast.types.ASTNode;
  try {
    ast = recast.parse(prettied, {
      parser: require("recast/parsers/babel"),
    });
    debug(`[beautify] Recast parsing succeeded`);
  } catch (err) {
    errorLog("[beautify] Recast parsing failed", err);
    try {
      ast = recast.parse(code, {
        parser: require("recast/parsers/babel"),
      });
      debug(`[beautify] Fallback recast parsing succeeded`);
    } catch (err2) {
      errorLog("[beautify] Fallback recast parsing failed", err2);
      return prettied;
    }
  }
  try {
    const result = recast.print(ast, { tabWidth: 2 }).code;
    debug(`[beautify] Beautified code length: ${result.length}`);
    return result;
  } catch (err) {
    errorLog("[beautify] recast.print failed", err);
    return prettied;
  }
}

export async function beautifyWithDeobfuscation(code: string): Promise<string> {
  debug(
    `[beautifyWithDeobfuscation] Processing code chunk of length ${code.length}`
  );

  // Сначала пытаемся деобфусцировать
  let deobfuscated: string;
  try {
    deobfuscated = await smartDeobfuscate(code);
    debug(`[beautifyWithDeobfuscation] Deobfuscation completed`);
  } catch (err) {
    errorLog(
      "[beautifyWithDeobfuscation] Deobfuscation failed, using original code",
      err
    );
    deobfuscated = code;
  }

  // Дополнительная обработка строк перед beautify
  const safeCode = deobfuscated
    .replace(/`/g, "\\`") // Экранируем обратные кавычки
    .replace(/\\/g, "\\\\") // Экранируем обратные слеши
    .replace(/"/g, '\\"') // Экранируем двойные кавычки
    .replace(/'/g, "\\'"); // Экранируем одинарные кавычки

  return await beautify(safeCode);
}
