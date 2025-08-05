import { extname } from "path";
import { parse } from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { debug, errorLog } from "../utils/logger";
import { readFileSafe } from "../utils/fileSystem";

export async function parseDeps(file: string): Promise<Set<string>> {
  debug(`[parseDeps] Parsing dependencies for: ${file}`);
  let raw: string;

  try {
    raw = await readFileSafe(file);
  } catch (err) {
    errorLog(`[parseDeps] Failed to read file: ${file}`, err);
    return new Set();
  }

  // Проверяем, является ли файл JavaScript/TypeScript
  const ext = extname(file).toLowerCase();
  if (![".js", ".ts", ".jsx", ".tsx"].includes(ext)) {
    debug(`[parseDeps] Skipping non-JS/TS file: ${file}`);
    return new Set();
  }

  // Пробуем разные методы парсинга
  let ast: t.File | null = null;
  const parsers = [
    () => parse(raw, { sourceType: "module", plugins: ["jsx", "typescript"] }),
    () => parse(raw, { sourceType: "script", plugins: ["jsx", "typescript"] }),
    () =>
      parse(raw, { sourceType: "unambiguous", plugins: ["jsx", "typescript"] }),
  ];

  for (const parseFn of parsers) {
    try {
      ast = parseFn();
      break;
    } catch (err) {
      // Продолжаем с другими вариантами
    }
  }

  if (!ast) {
    try {
      // Пытаемся удалить комментарии и пробелы
      const cleanCode = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
      ast = parse(cleanCode, {
        sourceType: "unambiguous",
        plugins: ["jsx", "typescript"],
      });
    } catch (err) {
      errorLog(`[parseDeps] Failed to parse AST for file: ${file}`, err);
      return new Set();
    }
  }

  const deps = new Set<string>();
  try {
    traverse(ast, {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        if (path.node.source && typeof path.node.source.value === "string") {
          deps.add(path.node.source.value);
          debug(
            `[parseDeps] Found import: ${path.node.source.value} in ${file}`
          );
        }
      },
      CallExpression(path: NodePath<t.CallExpression>) {
        const c = path.node.callee;
        if (
          t.isIdentifier(c) &&
          c.name === "require" &&
          path.node.arguments.length === 1
        ) {
          const arg = path.node.arguments[0];
          if (t.isStringLiteral(arg)) {
            deps.add(arg.value);
            debug(`[parseDeps] Found require: ${arg.value} in ${file}`);
          }
        }
      },
    });
    debug(`[parseDeps] Total dependencies found in ${file}: ${deps.size}`);
  } catch (err) {
    errorLog(`[parseDeps] Error during AST traversal for ${file}`, err);
  }
  return deps;
}
