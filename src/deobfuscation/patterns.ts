import { debug, errorLog } from "../utils/logger";
import type { ObfuscationPattern } from "../types";

export const obfuscationPatterns: ObfuscationPattern[] = [
  {
    name: "webpack",
    detect: (code: string) => {
      return (
        /webpackJsonp|__webpack_require__|webpackChunkName/.test(code) ||
        /\(function\s*\(\s*modules?\s*\)\s*{[\s\S]*__webpack_require__/.test(
          code
        )
      );
    },
    confidence: 0.9,
    deobfuscate: async (code: string) => {
      debug("[deobfuscate:webpack] Attempting webpack bundle extraction");

      // Поиск модулей webpack
      const modulePattern = /\{([\s\S]*?)\}/;
      const webpackBootstrap =
        /\(function\(modules\)\s*{([\s\S]*?)}\)\(\[([\s\S]*?)\]\)/;

      let result = code;

      // Извлечение модулей из webpack bundle
      const bundleMatch = code.match(webpackBootstrap);
      if (bundleMatch) {
        const modulesArray = bundleMatch[3];
        const modules = modulesArray.split(/,\s*function\s*\(/);

        result = modules
          .map((mod, index) => {
            return `// === MODULE ${index} ===\nfunction module${index}(${mod}`;
          })
          .join("\n\n");
      }

      return result;
    },
  },

  {
    name: "uglify",
    detect: (code: string) => {
      const indicators = [
        /[a-zA-Z]\$[a-zA-Z]{1,2}\$[a-zA-Z]/, // UglifyJS variable pattern
        /function\s+[a-zA-Z]\([a-zA-Z],[a-zA-Z],[a-zA-Z]\){/, // Short function signatures
        /!function\([a-zA-Z]\){/, // IIFE pattern
        /[a-zA-Z]\.prototype\.[a-zA-Z]=function/, // Prototype assignments
      ];
      return indicators.some((pattern) => pattern.test(code));
    },
    confidence: 0.7,
    deobfuscate: async (code: string) => {
      debug("[deobfuscate:uglify] Attempting UglifyJS deobfuscation");

      let result = code;

      // Восстановление whitespace и форматирования
      result = result
        .replace(/;/g, ";\n")
        .replace(/\{/g, "{\n")
        .replace(/\}/g, "\n}\n")
        .replace(/,/g, ",\n");

      // Попытка восстановления имен переменных через частотный анализ
      const varMap = new Map<string, string>();
      const shortVars = result.match(/\b[a-zA-Z]\b/g) || [];
      const varFreq = shortVars.reduce((acc, v) => {
        acc[v] = (acc[v] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Наиболее частые переменные получают осмысленные имена
      const sortedVars = Object.entries(varFreq)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

      const meaningfulNames = [
        "element",
        "data",
        "config",
        "result",
        "value",
        "item",
        "index",
        "callback",
        "options",
        "params",
      ];

      sortedVars.forEach(([varName, freq], index) => {
        if (freq > 5 && meaningfulNames[index]) {
          varMap.set(varName, meaningfulNames[index]);
        }
      });

      // Замена переменных
      for (const [oldName, newName] of varMap) {
        const regex = new RegExp(`\\b${oldName}\\b`, "g");
        result = result.replace(regex, newName);
      }

      return result;
    },
  },

  {
    name: "terser",
    detect: (code: string) => {
      return (
        /\b[a-z]\$[a-z]+\b/.test(code) || // Terser variable naming
        /!function\([a-z],[a-z]\)/.test(code) || // IIFE with short params
        /\b[a-z]{1,2}\([a-z],[a-z],[a-z]\)/.test(code)
      ); // Short function calls
    },
    confidence: 0.8,
    deobfuscate: async (code: string) => {
      debug("[deobfuscate:terser] Attempting Terser deobfuscation");

      // Terser часто сохраняет семантику лучше UglifyJS
      let result = code;

      // Восстановление структуры
      result = result
        .replace(/([;}])/g, "$1\n")
        .replace(/(\{)/g, "$1\n")
        .replace(/(\})/g, "\n$1\n");

      return result;
    },
  },

  {
    name: "jsconfuser",
    detect: (code: string) => {
      return (
        /String\["fromCharCode"\]/.test(code) ||
        /\["constructor"\]\["constructor"\]/.test(code) ||
        /atob\s*\(/.test(code)
      );
    },
    confidence: 0.85,
    deobfuscate: async (code: string) => {
      debug("[deobfuscate:jsconfuser] Attempting JSConfuser deobfuscation");

      let result = code;

      // Восстановление строк из charCode
      result = result.replace(
        /String\["fromCharCode"\]\((\d+(?:,\s*\d+)*)\)/g,
        (match, codes) => {
          const chars = codes
            .split(",")
            .map((c: string) => String.fromCharCode(parseInt(c.trim())));
          return `"${chars.join("")}"`;
        }
      );

      // Восстановление base64
      result = result.replace(
        /atob\s*\(\s*["']([A-Za-z0-9+/=]+)["']\s*\)/g,
        (match, b64) => {
          try {
            const decoded = Buffer.from(b64, "base64").toString("utf8");
            return `"${decoded}"`;
          } catch {
            return match;
          }
        }
      );

      return result;
    },
  },

  {
    name: "custom_hex",
    detect: (code: string) => {
      return (
        /\\x[0-9a-fA-F]{2}/.test(code) &&
        code.match(/\\x[0-9a-fA-F]{2}/g)!.length > 10
      );
    },
    confidence: 0.6,
    deobfuscate: async (code: string) => {
      debug("[deobfuscate:custom_hex] Attempting hex string deobfuscation");

      return code.replace(/\\x([0-9a-fA-F]{2})/g, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
      });
    },
  },

  {
    name: "eval_obfuscation",
    detect: (code: string) => {
      return (
        /eval\s*\(/.test(code) &&
        (/new\s+Function\s*\(/.test(code) ||
          /Function\s*\(\s*["'].+["']\s*\)/.test(code))
      );
    },
    confidence: 0.95,
    deobfuscate: async (code: string) => {
      debug("[deobfuscate:eval] Attempting eval-based deobfuscation");

      let result = code;

      // ВНИМАНИЕ: eval может быть опасен, используйте с осторожностью
      // В production среде лучше использовать статический анализ

      try {
        // Попытка статически извлечь содержимое eval
        const evalPattern = /eval\s*\(\s*["']([^"']+)["']\s*\)/g;
        result = result.replace(evalPattern, (match, evalCode) => {
          // Безопасное декодирование без выполнения
          return `// EVAL CONTENT:\n${evalCode}\n// END EVAL`;
        });
      } catch (err) {
        errorLog("[deobfuscate:eval] Error processing eval content", err);
      }

      return result;
    },
  },
];

export async function detectObfuscationType(
  code: string
): Promise<ObfuscationPattern[]> {
  debug("[detectObfuscationType] Analyzing code for obfuscation patterns");

  const detectedPatterns: Array<ObfuscationPattern & { score: number }> = [];

  for (const pattern of obfuscationPatterns) {
    if (pattern.detect(code)) {
      const score = pattern.confidence;
      detectedPatterns.push({ ...pattern, score });
      debug(
        `[detectObfuscationType] Detected ${pattern.name} (confidence: ${score})`
      );
    }
  }

  // Сортировка по уверенности
  detectedPatterns.sort((a, b) => b.score - a.score);

  return detectedPatterns;
}
