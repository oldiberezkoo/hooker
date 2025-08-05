// Full analysis
import { enhancedMain } from './main';
await enhancedMain();

// Individual modules
import { smartDeobfuscate } from './deobfuscation';
import { RuntimeAnalyzer } from './runtime/analyzer';
import { ArchitectureAnalyzer } from './architecture/analyzer';

// Deobfuscate code
const deobfuscated = await smartDeobfuscate(obfuscatedCode);

// Runtime analysis
const analyzer = new RuntimeAnalyzer();
const instrumented = analyzer.instrumentCode(code);

// Architecture analysis
const archAnalyzer = new ArchitectureAnalyzer();
await archAnalyzer.analyzeProject(depGraph, files);