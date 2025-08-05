import crypto from "crypto";
import { parse } from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { debug, errorLog } from "../utils/logger";
import type {
  RuntimeEvent,
  EnhancedRuntimeEvent,
  InstrumentationConfig,
} from "../types";

export class RuntimeAnalyzer {
  private events: RuntimeEvent[] = [];
  private config: InstrumentationConfig;
  private originalConsoleLog: typeof console.log;

  constructor(config: Partial<InstrumentationConfig> = {}) {
    this.config = {
      trackFunctions: true,
      trackVariables: true,
      trackAPICalls: true,
      trackDOMAccess: true,
      trackStorageAccess: true,
      maxEvents: 10000,
      ...config,
    };

    this.originalConsoleLog = console.log;
  }

  private addEvent(event: RuntimeEvent): void {
    if (!event || typeof event !== "object") {
      errorLog("[RuntimeAnalyzer] Invalid event object", event);
      return;
    }

    const enhancedEvent: EnhancedRuntimeEvent = {
      ...event,
      id: crypto.randomBytes(8).toString("hex"),
    };

    // Добавляем обработку ошибок
    try {
      if (this.events.length >= this.config.maxEvents) {
        this.events.shift();
      }
      this.events.push(enhancedEvent);
    } catch (err) {
      errorLog("[RuntimeAnalyzer] Failed to add event", err, event);
    }
  }

  private getStackTrace(): string[] {
    const stack = new Error().stack;
    return stack ? stack.split("\n").slice(2) : [];
  }

  instrumentCode(code: string): string {
    debug("[RuntimeAnalyzer] Instrumenting code for runtime analysis");

    let instrumented = code;

    if (this.config.trackFunctions) {
      instrumented = this.instrumentFunctions(instrumented);
    }

    if (this.config.trackVariables) {
      instrumented = this.instrumentVariables(instrumented);
    }

    if (this.config.trackAPICalls) {
      instrumented = this.instrumentAPICalls(instrumented);
    }

    if (this.config.trackDOMAccess) {
      instrumented = this.instrumentDOMAccess(instrumented);
    }

    if (this.config.trackStorageAccess) {
      instrumented = this.instrumentStorageAccess(instrumented);
    }

    return this.wrapWithRuntimeHooks(instrumented);
  }

  private instrumentFunctions(code: string): string {
    debug("[RuntimeAnalyzer] Instrumenting functions via AST");
    try {
      const ast = parse(code, {
        sourceType: "unambiguous",
        plugins: ["jsx", "typescript"],
      });

      traverse(ast, {
        FunctionDeclaration(path) {
          const funcName = path.node.id?.name || "anonymous";

          // Создаем код для логирования вызова функции
          const logCall = t.expressionStatement(
            t.callExpression(
              t.memberExpression(
                t.optionalMemberExpression(
                  t.identifier("window"),
                  t.identifier("__runtimeAnalyzer"),
                  false,
                  true
                ),
                t.identifier("logFunctionCall"),
                false
              ),
              [t.stringLiteral(funcName), t.identifier("arguments")]
            )
          );

          // Создаем блок try-catch
          const tryBlock = t.tryStatement(
            t.blockStatement([
              logCall,
              ...path.node.body.body.map((node) => t.cloneNode(node)),
            ]),
            t.catchClause(
              t.identifier("e"),
              t.blockStatement([
                t.expressionStatement(
                  t.callExpression(
                    t.memberExpression(
                      t.optionalMemberExpression(
                        t.identifier("window"),
                        t.identifier("__runtimeAnalyzer"),
                        false,
                        true
                      ),
                      t.identifier("logFunctionError"),
                      false
                    ),
                    [t.stringLiteral(funcName), t.identifier("e")]
                  )
                ),
                t.throwStatement(t.identifier("e")),
              ])
            )
          );

          // Заменяем тело функции на обернутый блок
          path.node.body = t.blockStatement([tryBlock]);
        },
      });

      return require("recast").print(ast).code;
    } catch (err) {
      errorLog(
        "[RuntimeAnalyzer] AST function instrumentation failed, falling back to regex",
        err
      );
      // Резервный вариант с регулярными выражениями
      return code
        .replace(
          /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^)]*)\)\s*\{/g,
          (match, funcName) => `function ${funcName}($2) {
          window.__runtimeAnalyzer?.logFunctionCall('${funcName}', arguments);
          try {`
        )
        .replace(
          /(\})\s*$/gm,
          `  } catch(e) {
          window.__runtimeAnalyzer?.logFunctionError('function', e);
          throw e;
        }
      }`
        );
    }
  }

  private instrumentVariables(code: string): string {
    // Инструментация доступа к переменным
    return code.replace(/(\w+)\s*=\s*([^;,\n]+)/g, (match, varName, value) => {
      return `${varName} = (window.__runtimeAnalyzer?.logVariableSet('${varName}', ${value}), ${value})`;
    });
  }

  private instrumentAPICalls(code: string): string {
    // Инструментация API вызовов
    let instrumented = code;

    // XMLHttpRequest
    instrumented = instrumented.replace(
      /new\s+XMLHttpRequest\(\)/g,
      `(function() {
        const xhr = new XMLHttpRequest();
        const originalOpen = xhr.open.bind(xhr);
        const originalSend = xhr.send.bind(xhr);
        
        xhr.open = function(method, url, ...args) {
          window.__runtimeAnalyzer?.logAPICall('XMLHttpRequest.open', { method, url });
          return originalOpen(method, url, ...args);
        };
        
        xhr.send = function(data) {
          window.__runtimeAnalyzer?.logAPICall('XMLHttpRequest.send', { data });
          return originalSend(data);
        };
        
        return xhr;
      })()`
    );

    // Fetch API
    instrumented = instrumented.replace(
      /fetch\s*\(/g,
      `(function(url, options) {
        window.__runtimeAnalyzer?.logAPICall('fetch', { url, options });
        return fetch(url, options);
      })(`
    );

    return instrumented;
  }

  private instrumentDOMAccess(code: string): string {
    // Инструментация DOM операций
    return code.replace(
      /document\.(getElementById|querySelector|querySelectorAll|createElement)/g,
      (match, method) => {
        return `(function(...args) {
          window.__runtimeAnalyzer?.logDOMAccess('${method}', args);
          return document.${method}(...args);
        })`;
      }
    );
  }

  private instrumentStorageAccess(code: string): string {
    // Инструментация localStorage/sessionStorage
    return code.replace(
      /(localStorage|sessionStorage)\.(getItem|setItem|removeItem)/g,
      (match, storage, method) => {
        return `(function(...args) {
          window.__runtimeAnalyzer?.logStorageAccess('${storage}.${method}', args);
          return ${storage}.${method}(...args);
        })`;
      }
    );
  }

  private wrapWithRuntimeHooks(code: string): string {
    const runtimeHooks = `
// Runtime Analysis Hooks
window.__runtimeAnalyzer = {
  logFunctionCall: function(funcName, args) {
    this.addEvent({
      type: 'function_call',
      timestamp: Date.now(),
      location: funcName,
      details: { arguments: Array.from(args) },
      stackTrace: this.getStackTrace()
    });
  },
  
  logFunctionError: function(funcName, error) {
    this.addEvent({
      type: 'function_call',
      timestamp: Date.now(),
      location: funcName,
      details: { error: error.message, stack: error.stack },
      stackTrace: this.getStackTrace()
    });
  },
  
  logVariableSet: function(varName, value) {
    this.addEvent({
      type: 'variable_access',
      timestamp: Date.now(),
      location: varName,
      details: { value: value, type: typeof value },
      stackTrace: this.getStackTrace()
    });
    return value;
  },
  
  logAPICall: function(apiName, details) {
    this.addEvent({
      type: 'api_call',
      timestamp: Date.now(),
      location: apiName,
      details: details,
      stackTrace: this.getStackTrace()
    });
  },
  
  logDOMAccess: function(method, args) {
    this.addEvent({
      type: 'dom_access',
      timestamp: Date.now(),
      location: method,
      details: { arguments: args },
      stackTrace: this.getStackTrace()
    });
  },
  
  logStorageAccess: function(operation, args) {
    this.addEvent({
      type: 'storage_access',
      timestamp: Date.now(),
      location: operation,
      details: { arguments: args },
      stackTrace: this.getStackTrace()
    });
  },
  
  addEvent: function(event) {
    if (!window.__runtimeEvents) window.__runtimeEvents = [];
    if (window.__runtimeEvents.length >= 10000) {
      window.__runtimeEvents.shift();
    }
    window.__runtimeEvents.push(event);
  },
  
  getStackTrace: function() {
    const stack = new Error().stack;
    return stack ? stack.split('\\n').slice(2) : [];
  },
  
  getEvents: function() {
    return window.__runtimeEvents || [];
  },
  
  exportEvents: function() {
    const events = this.getEvents();
    const blob = new Blob([JSON.stringify(events, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'runtime-analysis.json';
    a.click();
    URL.revokeObjectURL(url);
  }
};

// Начало инструментированного кода
`;

    return (
      runtimeHooks +
      code +
      `
// Конец инструментированного кода
console.log('[Runtime Analyzer] Code instrumentation active. Use window.__runtimeAnalyzer.exportEvents() to export analysis data.');
`
    );
  }

  generateRuntimeReport(events: RuntimeEvent[]): string {
    debug("[RuntimeAnalyzer] Generating runtime analysis report");

    const report = {
      summary: this.generateSummary(events),
      functionCalls: this.analyzeFunctionCalls(events),
      apiCalls: this.analyzeAPICalls(events),
      domAccess: this.analyzeDOMAccess(events),
      storageAccess: this.analyzeStorageAccess(events),
      timeline: this.generateTimeline(events),
    };

    return JSON.stringify(report, null, 2);
  }

  private generateSummary(events: RuntimeEvent[]) {
    const byType = events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalEvents: events.length,
      eventTypes: byType,
      timespan:
        events.length > 0
          ? {
              start: events[0].timestamp,
              end: events[events.length - 1].timestamp,
              duration:
                events[events.length - 1].timestamp - events[0].timestamp,
            }
          : null,
    };
  }

  private analyzeFunctionCalls(events: RuntimeEvent[]) {
    const functionEvents = events.filter((e) => e.type === "function_call");
    const callCounts = functionEvents.reduce((acc, event) => {
      acc[event.location] = (acc[event.location] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalCalls: functionEvents.length,
      uniqueFunctions: Object.keys(callCounts).length,
      mostCalled: Object.entries(callCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10),
      callFrequency: callCounts,
    };
  }

  private analyzeAPICalls(events: RuntimeEvent[]) {
    const apiEvents = events.filter((e) => e.type === "api_call");

    return {
      totalCalls: apiEvents.length,
      endpoints: [
        ...new Set(apiEvents.map((e) => e.details.url || e.location)),
      ],
      methods: apiEvents.reduce((acc, event) => {
        const method = event.details.method || "unknown";
        acc[method] = (acc[method] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  private analyzeDOMAccess(events: RuntimeEvent[]) {
    const domEvents = events.filter((e) => e.type === "dom_access");

    return {
      totalAccess: domEvents.length,
      methods: domEvents.reduce((acc, event) => {
        acc[event.location] = (acc[event.location] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  private analyzeStorageAccess(events: RuntimeEvent[]) {
    const storageEvents = events.filter((e) => e.type === "storage_access");

    return {
      totalAccess: storageEvents.length,
      operations: storageEvents.reduce((acc, event) => {
        acc[event.location] = (acc[event.location] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  private generateTimeline(events: RuntimeEvent[]) {
    return events.map((event) => ({
      timestamp: event.timestamp,
      type: event.type,
      location: event.location,
      details:
        typeof event.details === "object"
          ? Object.keys(event.details).join(", ")
          : event.details,
    }));
  }
}

// Вынесенная функция для базовых хуков (не static, вне класса)
export function getBasicRuntimeHooks(): string {
  return `
    // Basic Runtime Analysis Hooks (fallback)
    if (typeof window === 'object') {
      window.__runtimeEvents = window.__runtimeEvents || [];
      window.__runtimeAnalyzer = {
        logEvent: function(type, details) {
          if (window.__runtimeEvents.length >= 1000) {
            window.__runtimeEvents.shift();
          }
          window.__runtimeEvents.push({
            type: type,
            timestamp: Date.now(),
            details: details
          });
        },
        exportEvents: function() {
          const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(window.__runtimeEvents));
          const downloadAnchorNode = document.createElement('a');
          downloadAnchorNode.setAttribute("href", dataStr);
          downloadAnchorNode.setAttribute("download", "runtime-events.json");
          document.body.appendChild(downloadAnchorNode);
          downloadAnchorNode.click();
          downloadAnchorNode.remove();
        }
      };
    }
  `;
}
