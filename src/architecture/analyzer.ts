import { parse } from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { debug, errorLog } from "../utils/logger";
import { readFileSafe } from "../utils/fileSystem";
import type { ModuleInfo, ArchitectureLayer, DepGraph } from "../types";

export class ArchitectureAnalyzer {
  private modules: Map<string, ModuleInfo> = new Map();

  async analyzeProject(depGraph: DepGraph, files: string[]): Promise<void> {
    debug("[ArchitectureAnalyzer] Analyzing project architecture");
    for (const file of files) {
      const moduleInfo = await this.analyzeModule(
        file,
        depGraph[file] || new Set()
      );
      this.modules.set(file, moduleInfo);
    }
  }

  private async analyzeModule(
    filePath: string,
    dependencies: Set<string>
  ): Promise<ModuleInfo> {
    debug(`[ArchitectureAnalyzer] Analyzing module: ${filePath}`);
    let code: string;
    try {
      code = await readFileSafe(filePath);
    } catch (err) {
      errorLog(`[ArchitectureAnalyzer] Failed to read ${filePath}:`, err);
      return this.createEmptyModuleInfo(filePath, dependencies);
    }

    let ast: t.File;
    try {
      ast = parse(code, {
        sourceType: "unambiguous",
        plugins: ["jsx", "typescript"],
      });
    } catch (err) {
      errorLog(`[ArchitectureAnalyzer] Failed to parse ${filePath}:`, err);
      return this.createEmptyModuleInfo(filePath, dependencies);
    }

    const exports: string[] = [];
    const functions: string[] = [];
    const classes: string[] = [];
    let complexity = 0;

    // Сохраняем ссылку на this
    const self = this;

    // Исправление ошибки: t.isFunction не существует, нужно использовать t.isFunctionExpression и t.isArrowFunctionExpression
    // Создаем объект посетителя с явным выполнением операций без возврата значений
    const visitor = {
      ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
        if (path.node.declaration) {
          if (
            t.isFunctionDeclaration(path.node.declaration) &&
            path.node.declaration.id
          ) {
            exports.push(path.node.declaration.id.name);
            functions.push(path.node.declaration.id.name);
          } else if (
            t.isClassDeclaration(path.node.declaration) &&
            path.node.declaration.id
          ) {
            exports.push(path.node.declaration.id.name);
            classes.push(path.node.declaration.id.name);
          }
        }
      },

      ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
        exports.push("default");
      },

      // Универсальный обработчик всех типов функций
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        if (path.node.id) {
          functions.push(path.node.id.name);
        }
        try {
          complexity += self.calculateFunctionComplexity(
            path as NodePath<t.Function>
          );
        } catch (err) {
          errorLog(
            `[ArchitectureAnalyzer] Error calculating complexity for ${path.node.id?.name || "anonymous function"} in ${filePath}:`,
            err
          );
        }
      },

      FunctionExpression(path: NodePath<t.FunctionExpression>) {
        let functionName: string | null = null;
        if (
          path.parentPath &&
          t.isVariableDeclarator(path.parentPath.node) &&
          t.isIdentifier(path.parentPath.node.id)
        ) {
          functionName = path.parentPath.node.id.name;
        }
        if (functionName) {
          functions.push(functionName);
        }
        try {
          complexity += self.calculateFunctionComplexity(
            path as NodePath<t.Function>
          );
        } catch (err) {
          errorLog(
            `[ArchitectureAnalyzer] Error calculating complexity for ${functionName || "anonymous function"} in ${filePath}:`,
            err
          );
        }
      },

      ArrowFunctionExpression(path: NodePath<t.ArrowFunctionExpression>) {
        let functionName: string | null = null;
        if (
          path.parentPath &&
          t.isVariableDeclarator(path.parentPath.node) &&
          t.isIdentifier(path.parentPath.node.id)
        ) {
          functionName = path.parentPath.node.id.name;
        }
        if (functionName) {
          functions.push(functionName);
        }
        try {
          complexity += self.calculateFunctionComplexity(
            path as NodePath<t.Function>
          );
        } catch (err) {
          errorLog(
            `[ArchitectureAnalyzer] Error calculating complexity for ${functionName || "anonymous function"} in ${filePath}:`,
            err
          );
        }
      },

      ObjectMethod(path: NodePath<t.ObjectMethod>) {
        let functionName: string | null = null;
        if (t.isIdentifier(path.node.key)) {
          functionName = path.node.key.name;
        }
        if (functionName) {
          functions.push(functionName);
        }
        try {
          complexity += self.calculateFunctionComplexity(
            path as NodePath<t.Function>
          );
        } catch (err) {
          errorLog(
            `[ArchitectureAnalyzer] Error calculating complexity for ${functionName || "anonymous function"} in ${filePath}:`,
            err
          );
        }
      },

      ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
        if (path.node.id) {
          classes.push(path.node.id.name);
        }
        complexity += 2; // Базовая сложность класса
      },

      // Исправляем все посетители чтобы не возвращали значения
      IfStatement(path: NodePath<t.IfStatement>) {
        complexity += 1;
      },

      WhileStatement(path: NodePath<t.WhileStatement>) {
        complexity += 1;
      },

      ForStatement(path: NodePath<t.ForStatement>) {
        complexity += 1;
      },

      SwitchStatement(path: NodePath<t.SwitchStatement>) {
        complexity += 1;
      },

      TryStatement(path: NodePath<t.TryStatement>) {
        complexity += 1;
      },

      // Добавляем учет дополнительных элементов
      LogicalExpression(path: NodePath<t.LogicalExpression>) {
        // Увеличиваем сложность для && и ||
        if (path.node.operator === "&&" || path.node.operator === "||") {
          complexity += 0.5; // Логические операторы добавляют частичную сложность
        }
      },

      ConditionalExpression(path: NodePath<t.ConditionalExpression>) {
        complexity += 1; // Тернарный оператор
      },

      AwaitExpression(path: NodePath<t.AwaitExpression>) {
        complexity += 0.5; // Async/await добавляет частичную сложность
      },

      CallExpression(path: NodePath<t.CallExpression>) {
        // Учет callback-функций
        if (
          path.node.arguments.some(
            (arg) =>
              t.isFunctionExpression(arg) || t.isArrowFunctionExpression(arg)
          )
        ) {
          complexity += 0.5;
        }
      },
    };

    try {
      traverse(ast, visitor);
    } catch (err) {
      errorLog(
        `[ArchitectureAnalyzer] Error traversing AST for ${filePath}:`,
        err
      );
    }

    return {
      path: filePath,
      name: this.getModuleName(filePath),
      dependencies,
      exports,
      functions,
      classes,
      size: code.length,
      complexity: Math.round(complexity), // Округляем до целого числа
    };
  }

  private createEmptyModuleInfo(
    filePath: string,
    dependencies: Set<string>
  ): ModuleInfo {
    return {
      path: filePath,
      name: this.getModuleName(filePath),
      dependencies,
      exports: [],
      functions: [],
      classes: [],
      size: 0,
      complexity: 0,
    };
  }

  private calculateFunctionComplexity(path: NodePath<t.Function>): number {
    let complexity = 1; // Базовая сложность

    try {
      // Исправление ошибки: t.isFunction не существует, нужно использовать t.isFunctionExpression и t.isArrowFunctionExpression
      // Создаем безопасный посетитель, который не возвращает значения
      const visitor = {
        IfStatement: (path: NodePath<t.IfStatement>) => {
          complexity += 1;
        },
        ConditionalExpression: (path: NodePath<t.ConditionalExpression>) => {
          complexity += 1;
        },
        LogicalExpression: (path: NodePath<t.LogicalExpression>) => {
          // Увеличиваем сложность только для && и ||
          if (path.node.operator === "&&" || path.node.operator === "||") {
            complexity += 0.5;
          }
        },
        SwitchCase: (path: NodePath<t.SwitchCase>) => {
          // Увеличиваем сложность только для case (кроме default)
          if (path.node.test) {
            complexity += 1;
          }
        },
        WhileStatement: (path: NodePath<t.WhileStatement>) => {
          complexity += 1;
        },
        DoWhileStatement: (path: NodePath<t.DoWhileStatement>) => {
          complexity += 1;
        },
        ForStatement: (path: NodePath<t.ForStatement>) => {
          complexity += 1;
        },
        ForInStatement: (path: NodePath<t.ForInStatement>) => {
          complexity += 1;
        },
        ForOfStatement: (path: NodePath<t.ForOfStatement>) => {
          complexity += 1;
        },
        CatchClause: (path: NodePath<t.CatchClause>) => {
          complexity += 1;
        },
        AwaitExpression: (path: NodePath<t.AwaitExpression>) => {
          complexity += 0.5;
        },
        CallExpression: (path: NodePath<t.CallExpression>) => {
          // Учет callback-функций внутри функции
          if (
            path.node.arguments.some(
              (arg) =>
                t.isFunctionExpression(arg) || t.isArrowFunctionExpression(arg)
            )
          ) {
            complexity += 0.5;
          }
        },
        // Рекурсивный подсчет сложности для вложенных функций
        FunctionDeclaration: (nestedPath: NodePath<t.FunctionDeclaration>) => {
          try {
            complexity += this.calculateFunctionComplexity(
              nestedPath as NodePath<t.Function>
            );
          } catch (err) {
            errorLog(
              "[ArchitectureAnalyzer] Error calculating nested function complexity",
              err
            );
          }
        },
        FunctionExpression: (nestedPath: NodePath<t.FunctionExpression>) => {
          try {
            complexity += this.calculateFunctionComplexity(
              nestedPath as NodePath<t.Function>
            );
          } catch (err) {
            errorLog(
              "[ArchitectureAnalyzer] Error calculating nested function complexity",
              err
            );
          }
        },
        ArrowFunctionExpression: (
          nestedPath: NodePath<t.ArrowFunctionExpression>
        ) => {
          try {
            complexity += this.calculateFunctionComplexity(
              nestedPath as NodePath<t.Function>
            );
          } catch (err) {
            errorLog(
              "[ArchitectureAnalyzer] Error calculating nested function complexity",
              err
            );
          }
        },
        ObjectMethod: (nestedPath: NodePath<t.ObjectMethod>) => {
          try {
            complexity += this.calculateFunctionComplexity(
              nestedPath as unknown as NodePath<t.Function>
            );
          } catch (err) {
            errorLog(
              "[ArchitectureAnalyzer] Error calculating nested function complexity",
              err
            );
          }
        },
      };

      path.traverse(visitor);
    } catch (err) {
      errorLog(
        "[ArchitectureAnalyzer] Error calculating function complexity",
        err
      );
    }

    return Math.round(complexity); // Округляем до целого числа
  }

  private getModuleName(filePath: string): string {
    return (
      filePath
        .split("/")
        .pop()
        ?.replace(/\.(js|ts|jsx|tsx)$/, "") || "unknown"
    );
  }

  private categorizeModules(): ArchitectureLayer[] {
    const layers: ArchitectureLayer[] = [
      { name: "API Layer", modules: [], color: "#FF6B6B" },
      { name: "Business Logic", modules: [], color: "#4ECDC4" },
      { name: "Data Layer", modules: [], color: "#45B7D1" },
      { name: "UI Components", modules: [], color: "#96CEB4" },
      { name: "Utilities", modules: [], color: "#FFEAA7" },
      { name: "Configuration", modules: [], color: "#DDA0DD" },
      { name: "Infrastructure", modules: [], color: "#C7B198" },
      { name: "Unknown", modules: [], color: "#95A5A6" },
    ];

    for (const module of this.modules.values()) {
      const layer = this.classifyModule(module);
      const targetLayer =
        layers.find((l) => l.name === layer) || layers[layers.length - 1];
      targetLayer.modules.push(module);
    }

    return layers.filter((layer) => layer.modules.length > 0);
  }

  private classifyModule(module: ModuleInfo): string {
    const path = module.path.toLowerCase();
    const name = module.name.toLowerCase();
    const contentBasedClassification = this.classifyByContent(module);

    // Если классификация по содержимому дала результат, используем его
    if (contentBasedClassification) {
      return contentBasedClassification;
    }

    // --- FSD (Feature-Sliced Design) ---
    if (path.includes("/app/")) return "FSD: App Layer";
    if (path.includes("/processes/")) return "FSD: Processes";
    if (path.includes("/pages/")) return "FSD: Pages";
    if (path.includes("/widgets/")) return "FSD: Widgets";
    if (path.includes("/features/")) return "FSD: Features";
    if (path.includes("/entities/")) return "FSD: Entities";
    if (path.includes("/shared/")) return "FSD: Shared";

    // --- DDD (Domain-Driven Design) ---
    if (path.includes("/domain/")) return "DDD: Domain";
    if (path.includes("/application/")) return "DDD: Application";
    if (path.includes("/infrastructure/")) return "DDD: Infrastructure";
    if (path.includes("/presentation/")) return "DDD: Presentation";
    if (path.includes("/aggregate/")) return "DDD: Aggregate";
    if (path.includes("/repository/")) return "DDD: Repository";
    if (path.includes("/service/")) return "DDD: Service";
    if (path.includes("/valueobject/") || name.includes("valueobject"))
      return "DDD: Value Object";
    if (path.includes("/entity/") || name.includes("entity"))
      return "DDD: Entity";

    // --- Atomic Design ---
    if (path.includes("/atoms/") || name.includes("atom"))
      return "Atomic: Atom";
    if (path.includes("/molecules/") || name.includes("molecule"))
      return "Atomic: Molecule";
    if (path.includes("/organisms/") || name.includes("organism"))
      return "Atomic: Organism";
    if (path.includes("/templates/") || name.includes("template"))
      return "Atomic: Template";
    if (path.includes("/pages/") || name.includes("page"))
      return "Atomic: Page";

    // Иначе используем классификацию по пути и имени
    // API Layer
    if (
      path.includes("/api/") ||
      path.includes("/service") ||
      path.includes("/client") ||
      path.includes("/endpoint") ||
      name.includes("api") ||
      name.includes("service") ||
      name.includes("client") ||
      name.includes("endpoint") ||
      name.includes("controller")
    ) {
      return "API Layer";
    }

    // UI Components
    if (
      path.includes("/component") ||
      path.includes("/ui/") ||
      path.includes("/view") ||
      path.includes("/pages") ||
      path.includes("/screens") ||
      name.includes("component") ||
      name.includes("view") ||
      name.includes("page") ||
      name.includes("screen") ||
      name.includes("hook") ||
      module.exports.some((e) => e.toLowerCase().includes("component"))
    ) {
      return "UI Components";
    }

    // Data Layer
    if (
      path.includes("/model") ||
      path.includes("/store") ||
      path.includes("/data/") ||
      path.includes("/repository") ||
      path.includes("/dao") ||
      name.includes("model") ||
      name.includes("store") ||
      name.includes("repository") ||
      name.includes("dao") ||
      name.includes("schema")
    ) {
      return "Data Layer";
    }

    // Utilities
    if (
      path.includes("/util") ||
      path.includes("/helper") ||
      path.includes("/lib/") ||
      path.includes("/utils") ||
      name.includes("util") ||
      name.includes("helper") ||
      name.includes("tool") ||
      name.includes("utils")
    ) {
      return "Utilities";
    }

    // Configuration
    if (
      path.includes("/config") ||
      path.includes("/setting") ||
      path.includes("/env") ||
      name.includes("config") ||
      name.includes("setting") ||
      name.includes("environment") ||
      name.includes("env")
    ) {
      return "Configuration";
    }

    // Infrastructure
    if (
      path.includes("/middleware") ||
      path.includes("/server") ||
      path.includes("/plugin") ||
      name.includes("middleware") ||
      name.includes("server") ||
      name.includes("plugin")
    ) {
      return "Infrastructure";
    }

    // Business Logic (default for complex modules)
    if (
      module.complexity > 15 ||
      module.functions.length > 8 ||
      module.classes.length > 2
    ) {
      return "Business Logic";
    }

    return "Unknown";
  }

  private classifyByContent(module: ModuleInfo): string | null {
    // Анализируем содержимое модуля для более точной классификации
    const path = module.path.toLowerCase();

    // Проверяем, есть ли в модуле экспорт функций с определенными ключевыми словами
    const hasApiFunctions = module.exports.some(
      (e) =>
        e.toLowerCase().includes("fetch") ||
        e.toLowerCase().includes("api") ||
        e.toLowerCase().includes("service")
    );

    const hasUiComponents = module.exports.some(
      (e) =>
        e.toLowerCase().includes("component") ||
        e.toLowerCase().includes("view") ||
        e.toLowerCase().includes("hook")
    );

    const hasDataFunctions = module.exports.some(
      (e) =>
        e.toLowerCase().includes("model") ||
        e.toLowerCase().includes("store") ||
        e.toLowerCase().includes("repository")
    );

    const hasUtilFunctions = module.exports.some(
      (e) =>
        e.toLowerCase().includes("util") ||
        e.toLowerCase().includes("helper") ||
        e.toLowerCase().includes("format")
    );

    // Приоритетная проверка
    if (hasApiFunctions && (path.includes("api") || path.includes("service"))) {
      return "API Layer";
    }

    if (
      hasUiComponents &&
      (path.includes("component") || path.includes("ui"))
    ) {
      return "UI Components";
    }

    if (hasDataFunctions && (path.includes("model") || path.includes("data"))) {
      return "Data Layer";
    }

    if (hasUtilFunctions) {
      return "Utilities";
    }

    return null;
  }

  generateMermaidDiagram(): string {
    debug("[ArchitectureAnalyzer] Generating Mermaid diagram");
    const layers = this.categorizeModules();
    let mermaid = "graph TB\n";

    // Добавляем subgraphs для каждого слоя
    layers.forEach((layer, index) => {
      mermaid += `  subgraph L${index}["${layer.name}"]\n`;
      layer.modules.forEach((module) => {
        const nodeId = this.sanitizeNodeId(module.path);
        const complexity =
          module.complexity > 30
            ? "🔴"
            : module.complexity > 20
              ? "🟠"
              : module.complexity > 10
                ? "🟡"
                : "🟢";
        mermaid += `    ${nodeId}["${complexity} ${module.name}<br/>📊 ${module.complexity}"]\n`;
      });
      mermaid += "  end\n";
    });

    // Добавляем зависимости
    this.modules.forEach((module) => {
      const sourceId = this.sanitizeNodeId(module.path);
      module.dependencies.forEach((dep) => {
        // Показываем только внутренние зависимости
        const targetModule = this.findModuleByDependency(dep);
        if (targetModule) {
          const targetId = this.sanitizeNodeId(targetModule.path);
          mermaid += `  ${sourceId} --> ${targetId}\n`;
        }
      });
    });

    // Добавляем стилизацию
    mermaid += "\n";
    layers.forEach((layer, index) => {
      mermaid += `  classDef layer${index} fill:${layer.color},stroke:#333,stroke-width:2px\n`;
      layer.modules.forEach((module) => {
        const nodeId = this.sanitizeNodeId(module.path);
        mermaid += `  class ${nodeId} layer${index}\n`;
      });
    });

    return mermaid;
  }

  private sanitizeNodeId(path: string): string {
    return `node_${path.replace(/[^a-zA-Z0-9]/g, "_")}`;
  }

  private findModuleByDependency(dep: string): ModuleInfo | undefined {
    // Пытаемся найти внутренний модуль по зависимости
    const depName = dep
      .split("/")
      .pop()
      ?.replace(/\.(js|ts|jsx|tsx)$/, "");

    // Сначала ищем точное совпадение по имени файла
    for (const module of this.modules.values()) {
      const moduleName = module.path.split("/").pop();
      if (moduleName === dep || (depName && moduleName === depName)) {
        return module;
      }
    }

    // Если точное совпадение не найдено, ищем частичное совпадение
    // но с дополнительными проверками, чтобы избежать ложных срабатываний
    for (const module of this.modules.values()) {
      const moduleDir = module.path.split("/").slice(0, -1).join("/");
      const depDir = dep.split("/").slice(0, -1).join("/");

      // Проверяем, что пути имеют похожую структуру
      if (moduleDir.endsWith(depDir) || depDir.endsWith(moduleDir)) {
        return module;
      }

      // Проверяем, что имена файлов похожи
      if (
        (depName && module.name.includes(depName)) ||
        (depName && depName.includes(module.name))
      ) {
        return module;
      }
    }

    return undefined;
  }

  generateDependencyMatrix(): string {
    debug("[ArchitectureAnalyzer] Generating dependency matrix");
    const modules = Array.from(this.modules.values());
    let matrix = "# Dependency Matrix\n";
    matrix += "| Module | " + modules.map((m) => m.name).join(" | ") + " |\n";
    matrix += "|--------" + "|--------".repeat(modules.length) + "|\n";

    modules.forEach((sourceModule) => {
      let row = `| ${sourceModule.name} |`;
      modules.forEach((targetModule) => {
        const hasDependency =
          sourceModule.dependencies.has(targetModule.path) ||
          sourceModule.dependencies.has(targetModule.name) ||
          sourceModule.dependencies.has(
            targetModule.path.replace(/\.ts$/, "")
          ) ||
          sourceModule.dependencies.has(targetModule.path.replace(/\.js$/, ""));
        row += hasDependency ? " ✅ |" : " ❌ |";
      });
      matrix += row + "\n";
    });

    return matrix;
  }

  generateComplexityReport(): string {
    debug("[ArchitectureAnalyzer] Generating complexity report");
    const modules = Array.from(this.modules.values()).sort(
      (a, b) => b.complexity - a.complexity
    );
    let report = "# Complexity Analysis Report\n";

    // Общая статистика
    const totalComplexity = modules.reduce((sum, m) => sum + m.complexity, 0);
    const avgComplexity = totalComplexity / modules.length;
    report += `## Overview\n`;
    report += `- **Total Modules**: ${modules.length}\n`;
    report += `- **Total Complexity**: ${totalComplexity}\n`;
    report += `- **Average Complexity**: ${avgComplexity.toFixed(2)}\n`;

    // Самые сложные модули
    report += `## Most Complex Modules\n`;
    report +=
      "| Rank | Module | Complexity | Functions | Classes | Size (KB) |\n";
    report +=
      "|------|--------|------------|-----------|---------|----------|\n";

    modules.slice(0, 10).forEach((module, index) => {
      report += `| ${index + 1} | ${module.name} | ${module.complexity} | ${
        module.functions.length
      } | ${module.classes.length} | ${(module.size / 1024).toFixed(1)} |\n`;
    });

    // Распределение сложности
    report += `\n## Complexity Distribution\n`;
    const distribution = {
      low: modules.filter((m) => m.complexity <= 10).length,
      medium: modules.filter((m) => m.complexity > 10 && m.complexity <= 20)
        .length,
      high: modules.filter((m) => m.complexity > 20 && m.complexity <= 30)
        .length,
      critical: modules.filter((m) => m.complexity > 30).length,
    };

    report += `- **Low Complexity (≤10)**: ${distribution.low} modules\n`;
    report += `- **Medium Complexity (11-20)**: ${distribution.medium} modules\n`;
    report += `- **High Complexity (21-30)**: ${distribution.high} modules\n`;
    report += `- **Critical Complexity (>30)**: ${distribution.critical} modules\n`;

    // Рекомендации
    report += `## Recommendations\n`;
    if (distribution.critical > 0) {
      report += `⚠️ **${distribution.critical} modules have critical complexity** - consider immediate refactoring:\n`;
      modules
        .filter((m) => m.complexity > 30)
        .slice(0, 5)
        .forEach((module) => {
          report += `- \`${module.name}\` (complexity: ${module.complexity})\n`;
        });
      report += "\n";
    }

    if (distribution.high > 0) {
      report += `⚠️ **${distribution.high} modules have high complexity** - consider refactoring:\n`;
      modules
        .filter((m) => m.complexity > 20 && m.complexity <= 30)
        .slice(0, 5)
        .forEach((module) => {
          report += `- \`${module.name}\` (complexity: ${module.complexity})\n`;
        });
      report += "\n";
    }

    return report;
  }

  generateArchitectureReport(): string {
    debug("[ArchitectureAnalyzer] Generating architecture report");
    const layers = this.categorizeModules();
    let report = "# Architecture Analysis Report\n";

    // Диаграмма архитектуры
    report += "## Architecture Diagram\n";
    report += "```mermaid\n";
    report += this.generateMermaidDiagram();
    report += "```\n";

    // Анализ слоев
    report += "## Layer Analysis\n";
    layers.forEach((layer) => {
      report += `### ${layer.name} (${layer.modules.length} modules)\n`;
      const totalComplexity = layer.modules.reduce(
        (sum, m) => sum + m.complexity,
        0
      );
      const avgComplexity = totalComplexity / layer.modules.length;
      report += `- **Average Complexity**: ${avgComplexity.toFixed(2)}\n`;
      report += `- **Total Size**: ${(
        layer.modules.reduce((sum, m) => sum + m.size, 0) / 1024
      ).toFixed(1)} KB\n`;
      report += `- **Critical Modules** (${layer.modules.filter((m) => m.complexity > 30).length}):\n`;

      const criticalModules = layer.modules.filter((m) => m.complexity > 30);
      if (criticalModules.length > 0) {
        criticalModules.slice(0, 5).forEach((module) => {
          report += `  - \`${module.name}\` (complexity: ${module.complexity})\n`;
        });
        if (criticalModules.length > 5) {
          report += `  - ... and ${criticalModules.length - 5} more\n`;
        }
      } else {
        report += "  - None\n";
      }

      report += "\n";
    });

    // Матрица зависимостей
    report += this.generateDependencyMatrix();
    report += "\n";

    // Отчет по сложности
    report += this.generateComplexityReport();

    return report;
  }
}
