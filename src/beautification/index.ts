import { parse } from "@babel/parser";
import prettier from "prettier";
import recast from "recast";
import { debug, errorLog } from "../utils/logger";
import { smartDeobfuscate } from "../deobfuscation";
import { SHOW_DEBUG_LOGS } from "../..";

/**
 * Attempts to fix common obfuscated string patterns and unterminated string issues.
 */
function processObfuscatedStringPatterns(code: string): string {
  let fixed = code;

  // 1. Merge broken template literals: `foo` + `bar` => `foobar`
  fixed = fixed.replace(/`([^`]+)`\s*\+\s*`([^`]*)`/g, "`$1$2`");

  // 2. Merge multiline template literals split by newlines
  fixed = fixed.replace(/`([^`]+)`\s*\n\s*`([^`]*)`/g, "`$1$2`");

  // 3. Fix incorrectly escaped quotes inside strings
  fixed = fixed.replace(/(["'`])((?:\\.|[^\\])*?)\\\\"\1/g, '$1$2"$1');
  fixed = fixed.replace(/(["'`])((?:\\.|[^\\])*?)\\\\'\1/g, "$1$2'$1");

  // 4. Pad unicode escapes to 4 digits: \u123 => \u0123
  fixed = fixed.replace(
    /\\u([0-9a-fA-F]{1,3})(?![0-9a-fA-F])/gi,
    (match, hex) => `\\u${hex.padStart(4, "0")}`
  );

  // 5. Merge broken string literals: "foo" "bar" => "foobar"
  fixed = fixed.replace(/(["'])([^"']*)\1\s*\n\s*\1([^"']*)\1/g, "$1$2$3$1");

  // 6. Fix unterminated strings in arrays/objects
  fixed = fixed.replace(
    /(\[|\{)([^[\]{}]*?)("[^"]*?)\n\s*("[^"]*?)"([,\}\]])/g,
    '$1$2$3$4"$5'
  );

  // 6.5. Merge concatenated strings: 'a' + 'b' => 'ab'
  fixed = fixed
    .replace(/(['"`])\s*\+\s*\1\s*\+\s*(['"`])/g, "$1$2")
    .replace(/(['"`])\s*\+\s*(['"`])/g, "$1$2");

  // 7. Attempt to auto-close unterminated strings at line ends
  const lines = fixed.split("\n");
  const stack: { quote: string; lineIndex: number; pos: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let pos = 0;
    let newLine = "";

    if (typeof line !== "string") {
      lines[i] = "";
      continue;
    }

    while (pos < line.length) {
      const char = line[pos];

      // Handle escaped characters
      if (char === "\\") {
        newLine += char + (line[pos + 1] || "");
        pos += 2;
        continue;
      }

      // Handle quote stack
      if (stack.length > 0) {
        const { quote } = stack[stack.length - 1];
        if (char === quote) {
          stack.pop();
        }
        newLine += char;
        pos++;
        continue;
      }

      if (char === '"' || char === "'" || char === "`") {
        stack.push({ quote: char, lineIndex: i, pos });
      }
      newLine += char;
      pos++;
    }

    // Auto-close unterminated string if not continued on next line
    if (
      stack.length > 0 &&
      (i === lines.length - 1 || !lines[i + 1].trim().startsWith("+"))
    ) {
      const last = stack[stack.length - 1];
      if (last && typeof last.quote === "string") {
        newLine += last.quote;
        stack.pop();
      }
    }
    lines[i] = newLine;
  }

  return lines.join("\n");
}

/**
 * Checks if the code is valid JavaScript.
 */
function isValidJavaScript(code: string): boolean {
  try {
    parse(code, {
      sourceType: "unambiguous",
      plugins: [
        "jsx",
        "typescript",
        "classProperties",
        "dynamicImport",
        "objectRestSpread",
        "decorators-legacy",
        "numericSeparator",
        "optionalChaining",
        "nullishCoalescingOperator",
        "importAssertions",
        "topLevelAwait",
      ],
      errorRecovery: true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely parses code to AST with multiple fallbacks and error handling.
 */
function safeParse(code: string): recast.types.ASTNode | null {
  try {
    return recast.parse(code, {
      parser: require("recast/parsers/babel"),
    });
  } catch (err) {
    // Fallback: try Babel parser directly
    try {
      const babelAst = parse(code, {
        sourceType: "unambiguous",
        plugins: [
          "jsx",
          "typescript",
          "classProperties",
          "dynamicImport",
          "objectRestSpread",
          "decorators-legacy",
          "numericSeparator",
          "optionalChaining",
          "nullishCoalescingOperator",
          "importAssertions",
          "topLevelAwait",
        ],
        errorRecovery: true,
      });

      return {
        type: "File",
        start: 0,
        end: code.length,
        loc: {
          start: { line: 1, column: 0 },
          end: { line: code.split("\n").length, column: 0 },
        },
        program: babelAst.program,
        comments: babelAst.comments || [],
      } as recast.types.ASTNode;
    } catch (err2: any) {
      // Fallback: try to fix unterminated string errors
      if (
        err2 instanceof Error &&
        (err2.message.includes("Unterminated string") ||
          err2.message.includes("Unterminated template") ||
          err2.message.includes("Unterminated template literal"))
      ) {
        try {
          const fixedCode = code.replace(
            /(["'`])([^\n]*?)(\n|\Z)/g,
            (match, quote, content, ending) => {
              return content.includes(quote)
                ? match
                : `${quote}${content}${quote}${ending === "\n" ? "\n" : ""}`;
            }
          );
          return recast.parse(fixedCode, {
            parser: require("recast/parsers/babel"),
          });
        } catch (fixErr) {
          if (SHOW_DEBUG_LOGS) {
            errorLog(
              "[beautify] Failed to fix unterminated string by global replace",
              fixErr
            );
          }
        }
      }
      // Fallback: try to fix only the problematic line
      try {
        const lines = code.split("\n");
        let problematicLine = 0;
        const lineMatch = err2.message.match(/line (\d+)/i);
        if (lineMatch) {
          problematicLine = parseInt(lineMatch[1]);
        } else {
          const altMatch = err2.message.match(/\((\d+):\d+\)/);
          if (altMatch) {
            problematicLine = parseInt(altMatch[1]);
          }
        }

        if (
          problematicLine > 0 &&
          problematicLine <= lines.length &&
          typeof lines[problematicLine - 1] !== "undefined"
        ) {
          let fixedLine = lines[problematicLine - 1];

          fixedLine = fixedLine!.replace(
            /(["'`])((?:\\.|[^\\])*?)$/,
            (match, quote, content) => {
              if (match.endsWith(quote)) return match;
              return `${quote}${content}${quote}`;
            }
          );

          if (
            /^[+,]\s*["'`]/.test(fixedLine) &&
            problematicLine > 1 &&
            typeof lines[problematicLine - 2] !== "undefined"
          ) {
            lines[problematicLine - 2] =
              (lines[problematicLine - 2] || "").replace(/["'`]$/, "") +
              fixedLine.replace(/^[+,]\s*["'`]/, "");
            lines.splice(problematicLine - 1, 1);
          } else {
            lines[problematicLine - 1] = fixedLine;
          }

          const fixedCode = lines.join("\n");
          const fixedAst = parse(fixedCode, {
            sourceType: "unambiguous",
            plugins: [
              "jsx",
              "typescript",
              "classProperties",
              "dynamicImport",
              "objectRestSpread",
              "decorators-legacy",
              "numericSeparator",
              "optionalChaining",
              "nullishCoalescingOperator",
              "importAssertions",
              "topLevelAwait",
            ],
            errorRecovery: true,
          });

          return {
            type: "File",
            start: 0,
            end: fixedCode.length,
            loc: {
              start: { line: 1, column: 0 },
              end: { line: fixedCode.split("\n").length, column: 0 },
            },
            program: fixedAst.program,
            comments: fixedAst.comments || [],
          } as recast.types.ASTNode;
        }
      } catch (fixErr) {
        if (SHOW_DEBUG_LOGS) {
          errorLog("[beautify] Failed to fix specific line", fixErr);
        }
      }
      return null;
    }
  }
}

export async function beautify(code: string): Promise<string> {
  debug(`[beautify] Beautifying code chunk of length ${code.length}`);

  // Remove "Unterminated string constant" error messages
  if (code.includes("Unterminated string constant")) {
    code = code.replace(/Unterminated string constant/g, "");
  }

  // 1. Return early if code is empty
  if (!code.trim()) {
    debug(`[beautify] Empty code, returning as is`);
    return code;
  }

  // 2. Try Prettier first
  try {
    const prettied = await prettier.format(code, {
      parser: "babel",
      singleQuote: true,
      tabWidth: 2,
      bracketSpacing: true,
      trailingComma: "none",
      arrowParens: "avoid",
      errorRecovery: true,
      requirePragma: false,
      insertPragma: false,
      proseWrap: "never",
    });
    debug(`[beautify] Prettier formatting succeeded`);
    return prettied;
  } catch (err) {
    if (SHOW_DEBUG_LOGS) {
      errorLog("[beautify] Primary Prettier formatting failed", err);
    }

    // 3. Try to fix obfuscated string patterns
    let fixedCode = processObfuscatedStringPatterns(code);

    // 4. Try to parse the fixed code
    const ast = safeParse(fixedCode);

    if (ast) {
      try {
        const result = recast.print(ast, {
          tabWidth: 2,
          quote: "single",
          trailingComma: false,
        }).code;

        if (isValidJavaScript(result)) {
          debug(`[beautify] Beautified code length: ${result.length}`);
          return result;
        }
      } catch (printErr) {
        if (SHOW_DEBUG_LOGS) {
          errorLog("[beautify] recast.print failed", printErr);
        }
      }
    }

    // 5. Try Prettier on the fixed code
    try {
      const prettied = await prettier.format(fixedCode, {
        parser: "babel",
        singleQuote: true,
        tabWidth: 2,
        bracketSpacing: true,
        trailingComma: "none",
        arrowParens: "avoid",
        errorRecovery: true,
        requirePragma: false,
        insertPragma: false,
        proseWrap: "never",
      });

      if (isValidJavaScript(prettied)) {
        debug(`[beautify] Fallback prettier formatting succeeded`);
        return prettied;
      }
    } catch (prettierErr) {
      if (SHOW_DEBUG_LOGS) {
        errorLog("[beautify] Fallback prettier formatting failed", prettierErr);
      }

      // 6. Last resort: minimal formatting (reduce indentation)
      try {
        return code.replace(/^[ \t]+/gm, (match) =>
          " ".repeat(Math.floor(match.length / 2))
        );
      } catch (indentErr) {
        if (SHOW_DEBUG_LOGS) {
          errorLog("[beautify] Minimal formatting failed", indentErr);
        }
      }
    }
  }

  // 7. If all else fails, return the original code
  debug(
    `[beautify] All beautification methods failed, returning original code`
  );
  return code;
}

export async function beautifyWithDeobfuscation(code: string): Promise<string> {
  debug(
    `[beautifyWithDeobfuscation] Processing code chunk of length ${code.length}`
  );

  let deobfuscated: string;
  try {
    deobfuscated = await smartDeobfuscate(code);
    debug(`[beautifyWithDeobfuscation] Deobfuscation completed`);
  } catch (err) {
    if (SHOW_DEBUG_LOGS) {
      errorLog(
        "[beautifyWithDeobfuscation] Deobfuscation failed, using original code",
        err
      );
    }
    deobfuscated = code;
  }

  // Never globally escape the code!
  return await beautify(deobfuscated);
}
