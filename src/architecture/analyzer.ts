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

    traverse(ast, {
      ExportNamedDeclaration(path) {
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

      ExportDefaultDeclaration(path) {
        exports.push("default");
      },

      FunctionDeclaration(path) {
        if (path.node.id) {
          functions.push(path.node.id.name);
        }
        complexity += self.calculateFunctionComplexity(path);
      },

      ClassDeclaration(path) {
        if (path.node.id) {
          classes.push(path.node.id.name);
        }
        complexity += 2; // Base complexity for class
      },

      IfStatement() {
        complexity += 1;
      },

      WhileStatement() {
        complexity += 1;
      },

      ForStatement() {
        complexity += 1;
      },

      SwitchStatement() {
        complexity += 1;
      },

      TryStatement() {
        complexity += 1;
      },
    });

    return {
      path: filePath,
      name: this.getModuleName(filePath),
      dependencies,
      exports,
      functions,
      classes,
      size: code.length,
      complexity,
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

  private calculateFunctionComplexity(
    path: NodePath<t.FunctionDeclaration>
  ): number {
    let complexity = 1; // Base complexity

    try {
      path.traverse({
        IfStatement: () => (complexity += 1),
        ConditionalExpression: () => (complexity += 1),
        LogicalExpression: () => (complexity += 1),
        SwitchCase: () => (complexity += 1),
        WhileStatement: () => (complexity += 1),
        DoWhileStatement: () => (complexity += 1),
        ForStatement: () => (complexity += 1),
        ForInStatement: () => (complexity += 1),
        ForOfStatement: () => (complexity += 1),
        CatchClause: () => (complexity += 1),
      });
    } catch (err) {
      errorLog(
        "[ArchitectureAnalyzer] Error calculating function complexity",
        err
      );
    }

    return complexity;
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

    // API Layer
    if (
      path.includes("/api/") ||
      path.includes("/service") ||
      name.includes("api") ||
      name.includes("service") ||
      name.includes("client")
    ) {
      return "API Layer";
    }

    // UI Components
    if (
      path.includes("/component") ||
      path.includes("/ui/") ||
      name.includes("component") ||
      module.exports.some((e) => e.includes("Component"))
    ) {
      return "UI Components";
    }

    // Data Layer
    if (
      path.includes("/model") ||
      path.includes("/store") ||
      path.includes("/data/") ||
      name.includes("model") ||
      name.includes("store") ||
      name.includes("repository")
    ) {
      return "Data Layer";
    }

    // Utilities
    if (
      path.includes("/util") ||
      path.includes("/helper") ||
      path.includes("/lib/") ||
      name.includes("util") ||
      name.includes("helper") ||
      name.includes("tool")
    ) {
      return "Utilities";
    }

    // Configuration
    if (
      path.includes("/config") ||
      name.includes("config") ||
      name.includes("setting")
    ) {
      return "Configuration";
    }

    // Business Logic (default for complex modules)
    if (module.complexity > 10 || module.functions.length > 5) {
      return "Business Logic";
    }

    return "Unknown";
  }

  generateMermaidDiagram(): string {
    debug("[ArchitectureAnalyzer] Generating Mermaid diagram");

    const layers = this.categorizeModules();
    let mermaid = "graph TB\n";

    // Add subgraphs for each layer
    layers.forEach((layer, index) => {
      mermaid += `  subgraph L${index}["${layer.name}"]\n`;
      layer.modules.forEach((module) => {
        const nodeId = this.sanitizeNodeId(module.path);
        const complexity =
          module.complexity > 20 ? "🔴" : module.complexity > 10 ? "🟡" : "🟢";
        mermaid += `    ${nodeId}["${complexity} ${module.name}<br/>📊 ${module.complexity}"]\n`;
      });
      mermaid += "  end\n\n";
    });

    // Add dependencies
    this.modules.forEach((module) => {
      const sourceId = this.sanitizeNodeId(module.path);
      module.dependencies.forEach((dep) => {
        // Only show internal dependencies
        const targetModule = this.findModuleByDependency(dep);
        if (targetModule) {
          const targetId = this.sanitizeNodeId(targetModule.path);
          mermaid += `  ${sourceId} --> ${targetId}\n`;
        }
      });
    });

    // Add styling
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
    return path.replace(/[^a-zA-Z0-9]/g, "_");
  }

  private findModuleByDependency(dep: string): ModuleInfo | undefined {
    // Try to find internal module by dependency name
    for (const module of this.modules.values()) {
      if (module.path.includes(dep) || module.name === dep) {
        return module;
      }
    }
    return undefined;
  }

  generateDependencyMatrix(): string {
    debug("[ArchitectureAnalyzer] Generating dependency matrix");

    const modules = Array.from(this.modules.values());
    let matrix = "# Dependency Matrix\n\n";
    matrix += "| Module | " + modules.map((m) => m.name).join(" | ") + " |\n";
    matrix += "|--------" + "|--------".repeat(modules.length) + "|\n";

    modules.forEach((sourceModule) => {
      let row = `| ${sourceModule.name} |`;
      modules.forEach((targetModule) => {
        const hasDependency =
          sourceModule.dependencies.has(targetModule.name) ||
          sourceModule.dependencies.has(targetModule.path);
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

    let report = "# Complexity Analysis Report\n\n";

    // Overall stats
    const totalComplexity = modules.reduce((sum, m) => sum + m.complexity, 0);
    const avgComplexity = totalComplexity / modules.length;

    report += `## Overview\n\n`;
    report += `- **Total Modules**: ${modules.length}\n`;
    report += `- **Total Complexity**: ${totalComplexity}\n`;
    report += `- **Average Complexity**: ${avgComplexity.toFixed(2)}\n\n`;

    // Top complex modules
    report += `## Most Complex Modules\n\n`;
    report +=
      "| Rank | Module | Complexity | Functions | Classes | Size (KB) |\n";
    report +=
      "|------|--------|------------|-----------|---------|----------|\n";

    modules.slice(0, 10).forEach((module, index) => {
      report += `| ${index + 1} | ${module.name} | ${module.complexity} | ${
        module.functions.length
      } | ${module.classes.length} | ${(module.size / 1024).toFixed(1)} |\n`;
    });

    // Complexity distribution
    report += `\n## Complexity Distribution\n\n`;
    const distribution = {
      low: modules.filter((m) => m.complexity <= 10).length,
      medium: modules.filter((m) => m.complexity > 10 && m.complexity <= 20)
        .length,
      high: modules.filter((m) => m.complexity > 20).length,
    };

    report += `- **Low Complexity (≤10)**: ${distribution.low} modules\n`;
    report += `- **Medium Complexity (11-20)**: ${distribution.medium} modules\n`;
    report += `- **High Complexity (>20)**: ${distribution.high} modules\n\n`;

    // Recommendations
    report += `## Recommendations\n\n`;
    if (distribution.high > 0) {
      report += `⚠️ **${distribution.high} modules have high complexity** - consider refactoring:\n\n`;
      modules
        .filter((m) => m.complexity > 20)
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

    let report = "# Architecture Analysis Report\n\n";

    // Mermaid diagram
    report += "## Architecture Diagram\n\n";
    report += "```mermaid\n";
    report += this.generateMermaidDiagram();
    report += "```\n\n";

    // Layer analysis
    report += "## Layer Analysis\n\n";
    layers.forEach((layer) => {
      report += `### ${layer.name} (${layer.modules.length} modules)\n\n`;

      const totalComplexity = layer.modules.reduce(
        (sum, m) => sum + m.complexity,
        0
      );
      const avgComplexity = totalComplexity / layer.modules.length;

      report += `- **Average Complexity**: ${avgComplexity.toFixed(2)}\n`;
      report += `- **Total Size**: ${(
        layer.modules.reduce((sum, m) => sum + m.size, 0) / 1024
      ).toFixed(1)} KB\n`;
      report += `- **Modules**:\n`;

      layer.modules.forEach((module) => {
        report += `  - \`${module.name}\` (complexity: ${module.complexity})\n`;
      });

      report += "\n";
    });

    // Dependency matrix
    report += this.generateDependencyMatrix();
    report += "\n";

    // Complexity report
    report += this.generateComplexityReport();

    return report;
  }
}
