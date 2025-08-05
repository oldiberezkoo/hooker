import { extname } from "path";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { debug, errorLog } from "../utils/logger";
import { readFile } from "fs/promises";
import { readFileSafe } from "../utils/fileSystem";

export async function parseDeps(file: string): Promise<Set<string>> {
  debug("[parseDeps]", `Parsing dependencies for: ${file}`);
  let raw: string;
  try {
    raw = await readFileSafe(file);
  } catch {
    // Already logged inside readFileSafe
    return new Set();
  }

  const ext = extname(file).toLowerCase();
  if (![".js", ".ts", ".jsx", ".tsx"].includes(ext)) {
    debug("[parseDeps]", `Skipping non-JS/TS file: ${file}`);
    return new Set();
  }

  // Try parsing with increasing leniency
  const plugins = ["jsx", "typescript", "dynamicImport"] as const;
  const parseOptions = [
    { sourceType: "module" as const },
    { sourceType: "script" as const },
    { sourceType: "unambiguous" as const },
  ];

  let ast: t.File | null = null;
  for (const opts of parseOptions) {
    try {
      ast = parse(raw, { ...opts, plugins: [...plugins] });
      break;
    } catch {}
  }
  if (!ast) {
    // Strip comments and retry
    const clean = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    try {
      ast = parse(clean, { sourceType: "unambiguous", plugins: [...plugins] });
    } catch (err) {
      errorLog("[parseDeps]", `Failed to parse AST for ${file}`, err);
      return new Set();
    }
  }

  const deps = new Set<string>();
  let importCount = 0;
  let requireCount = 0;

  try {
    traverse(ast, {
      ImportDeclaration(path) {
        importCount++;
        const src = path.node.source.value;
        deps.add(src);
        debug("[parseDeps]", `Found import: ${src}`);
      },
      ExportNamedDeclaration(path) {
        if (path.node.source?.value) {
          const src = path.node.source.value;
          deps.add(src);
          debug("[parseDeps]", `Found re-export: ${src}`);
        }
      },
      ExportAllDeclaration(path) {
        const src = path.node.source.value;
        deps.add(src);
        debug("[parseDeps]", `Found export * from: ${src}`);
      },
      CallExpression(path) {
        const callee = path.node.callee;
        // require(...)
        if (
          t.isIdentifier(callee, { name: "require" }) &&
          path.node.arguments.length === 1
        ) {
          const arg = path.node.arguments[0];
          if (t.isStringLiteral(arg)) {
            requireCount++;
            deps.add(arg.value);
            debug("[parseDeps]", `Found require: ${arg.value}`);
          }
        }
        // __webpack_require__(...)
        if (
          t.isIdentifier(callee, { name: "__webpack_require__" }) &&
          path.node.arguments.length === 1
        ) {
          const arg = path.node.arguments[0];
          if (t.isStringLiteral(arg)) {
            requireCount++;
            deps.add(arg.value);
            debug("[parseDeps]", `Found webpack_require: ${arg.value}`);
          }
        }
      },
    });
    debug(
      "[parseDeps]",
      `Import declarations: ${importCount}, requires: ${requireCount}, total deps: ${deps.size}`
    );
  } catch (err) {
    errorLog("[parseDeps]", `Error traversing AST for ${file}`, err);
  }

  return deps;
}
