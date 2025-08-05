import { enhancedMain, main } from "../src/main";
import { smartDeobfuscate } from "../src/deobfuscation";
import { beautifyWithDeobfuscation } from "../src/beautification";
import { RuntimeAnalyzer } from "../src/runtime/analyzer";
import { ArchitectureAnalyzer } from "../src/architecture/analyzer";
import { parseDeps } from "../src/parsing/dependencies";

// Example 1: Run the full enhanced analysis
async function runFullAnalysis() {
  console.log("Running full enhanced analysis...");
  await enhancedMain();
}

// Example 2: Deobfuscate specific code
async function deobfuscateCode() {
  const obfuscatedCode = `
    (function(modules){var installedModules={};function __webpack_require__(moduleId){
    if(installedModules[moduleId])return installedModules[moduleId].exports;
    var module=installedModules[moduleId]={i:moduleId,l:false,exports:{}};
    modules[moduleId].call(module.exports,module,module.exports,__webpack_require__);
    module.l=true;return module.exports;}return __webpack_require__(0);})([
    function(module,exports){module.exports="Hello World";}
    ]);
  `;

  const deobfuscated = await smartDeobfuscate(obfuscatedCode);
  console.log("Deobfuscated code:", deobfuscated);
}

// Example 3: Beautify code with deobfuscation
async function beautifyCode() {
  const uglyCode = `function test(a,b){return a+b;}const x=test(1,2);console.log(x);`;

  const beautified = await beautifyWithDeobfuscation(uglyCode);
  console.log("Beautified code:", beautified);
}

// Example 4: Runtime analysis
async function analyzeRuntime() {
  const code = `
    function add(a, b) {
      return a + b;
    }
    
    function multiply(a, b) {
      return a * b;
    }
    
    const result = add(5, 3);
    console.log(result);
  `;

  const analyzer = new RuntimeAnalyzer({
    trackFunctions: true,
    trackVariables: true,
    maxEvents: 1000,
  });

  const instrumented = analyzer.instrumentCode(code);
  console.log("Instrumented code:", instrumented);
}

// Example 5: Architecture analysis
async function analyzeArchitecture() {
  const files = ["src/main.ts", "src/utils/logger.ts"];
  const depGraph = {};

  // Build dependency graph
  for (const file of files) {
    try {
      depGraph[file] = await parseDeps(file);
    } catch (err) {
      depGraph[file] = new Set();
    }
  }

  const analyzer = new ArchitectureAnalyzer();
  await analyzer.analyzeProject(depGraph, files);

  const report = analyzer.generateArchitectureReport();
  console.log("Architecture report:", report);
}

// Example 6: Individual module usage
async function individualModules() {
  // Parse dependencies
  const deps = await parseDeps("src/main.ts");
  console.log("Dependencies:", [...deps]);

  // Deobfuscate specific pattern
  const webpackCode = `(function(modules){/* webpack code */})([]);`;
  const deobfuscated = await smartDeobfuscate(webpackCode);
  console.log("Deobfuscated webpack:", deobfuscated);

  // Runtime analysis with custom config
  const runtimeAnalyzer = new RuntimeAnalyzer({
    trackFunctions: true,
    trackAPICalls: true,
    maxEvents: 500,
  });

  const testCode = `
    function apiCall() {
      fetch('/api/data').then(r => r.json());
    }
  `;

  const instrumented = runtimeAnalyzer.instrumentCode(testCode);
  console.log("Instrumented API code:", instrumented);
}

// Run examples
async function runExamples() {
  console.log("=== Code Analysis Tool Examples ===\n");

  try {
    console.log("1. Deobfuscating code...");
    await deobfuscateCode();

    console.log("\n2. Beautifying code...");
    await beautifyCode();

    console.log("\n3. Runtime analysis...");
    await analyzeRuntime();

    console.log("\n4. Architecture analysis...");
    await analyzeArchitecture();

    console.log("\n5. Individual modules...");
    await individualModules();

    console.log("\n✅ All examples completed successfully!");
  } catch (error) {
    console.error("❌ Error running examples:", error);
  }
}

// Export for use in other files
export {
  runFullAnalysis,
  deobfuscateCode,
  beautifyCode,
  analyzeRuntime,
  analyzeArchitecture,
  individualModules,
  runExamples,
};

// Run if this file is executed directly
if (require.main === module) {
  runExamples();
}
