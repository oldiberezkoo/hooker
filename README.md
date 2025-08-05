# Code Analysis and Documentation Tool

A comprehensive TypeScript/JavaScript code analysis and documentation generation tool with modular architecture.

## Features

- **Code Deobfuscation**: Automatic detection and deobfuscation of various obfuscation patterns
- **Runtime Analysis**: Instrumentation and analysis of code execution patterns
- **Architecture Analysis**: Dependency mapping and architectural visualization
- **Documentation Generation**: AI-powered code documentation using Ollama
- **Beautification**: Code formatting and structure improvement

## Project Structure

```
src/
├── types/                 # Shared TypeScript interfaces and types
├── utils/                 # Utility functions
│   ├── logger.ts         # Centralized logging
│   ├── crypto.ts         # Cryptographic utilities
│   └── fileSystem.ts     # File system operations
├── deobfuscation/        # Code deobfuscation modules
│   ├── patterns.ts       # Obfuscation pattern definitions
│   └── index.ts          # Main deobfuscation logic
├── beautification/       # Code formatting and beautification
│   └── index.ts          # Beautification with deobfuscation
├── parsing/              # Code parsing and analysis
│   └── dependencies.ts   # Dependency parsing
├── runtime/              # Runtime analysis and instrumentation
│   ├── analyzer.ts       # Runtime event analysis
│   └── instrumentation.ts # Code instrumentation utilities
├── architecture/         # Architecture analysis
│   └── analyzer.ts       # Module and dependency analysis
├── ollama/              # AI integration
│   └── client.ts        # Ollama client and streaming
├── documentation/        # Documentation generation
│   └── generator.ts      # Documentation and prompt generation
└── main.ts              # Main orchestration logic
```

## Modules

### Types (`src/types/`)

Centralized type definitions for the entire application:

- `ObfuscationPattern`: Interface for obfuscation detection and deobfuscation
- `RuntimeEvent`: Runtime analysis event types
- `ModuleInfo`: Module analysis information
- `DepGraph`: Dependency graph structure

### Utils (`src/utils/`)

Common utility functions:

- **Logger**: Centralized debug and error logging
- **Crypto**: File hashing and cryptographic operations
- **FileSystem**: Safe file operations with error handling

### Deobfuscation (`src/deobfuscation/`)

Intelligent code deobfuscation:

- **Patterns**: Detects webpack, uglify, terser, jsconfuser, and custom obfuscation
- **Smart Deobfuscation**: Applies multiple deobfuscation techniques in order of confidence

### Beautification (`src/beautification/`)

Code formatting and structure improvement:

- **Prettier Integration**: Code formatting with Prettier
- **AST-based Formatting**: Advanced formatting using AST manipulation
- **Deobfuscation Integration**: Combines deobfuscation with beautification

### Parsing (`src/parsing/`)

Code analysis and parsing:

- **Dependency Parsing**: Extracts import/require statements
- **AST Analysis**: Uses Babel parser for accurate dependency detection
- **Multiple Parser Support**: Handles different module systems

### Runtime (`src/runtime/`)

Runtime analysis and instrumentation:

- **RuntimeAnalyzer**: Tracks function calls, API calls, DOM access, and storage operations
- **Instrumentation**: Automatically instruments code for runtime analysis
- **Event Tracking**: Comprehensive event tracking with stack traces

### Architecture (`src/architecture/`)

Architectural analysis and visualization:

- **Module Analysis**: Analyzes module complexity, dependencies, and structure
- **Layer Classification**: Automatically categorizes modules into architectural layers
- **Mermaid Diagrams**: Generates visual architecture diagrams
- **Complexity Reports**: Detailed complexity analysis and recommendations

### Ollama (`src/ollama/`)

AI-powered analysis:

- **Streaming Client**: Real-time streaming with Ollama
- **Cache Management**: Intelligent caching of AI responses
- **Fallback Support**: Multiple model support with fallback options

### Documentation (`src/documentation/`)

Documentation generation:

- **Prompt Generation**: Structured prompts for AI analysis
- **Markdown Streaming**: Real-time markdown generation
- **File Processing**: Orchestrates the entire documentation process

## Usage

### Basic Usage

```typescript
import { enhancedMain } from "./src/main";

// Run the enhanced analysis (includes architecture analysis and instrumentation)
await enhancedMain();
```

### Individual Module Usage

```typescript
import { smartDeobfuscate } from "./src/deobfuscation";
import { beautifyWithDeobfuscation } from "./src/beautification";
import { RuntimeAnalyzer } from "./src/runtime/analyzer";
import { ArchitectureAnalyzer } from "./src/architecture/analyzer";

// Deobfuscate code
const deobfuscated = await smartDeobfuscate(obfuscatedCode);

// Beautify with deobfuscation
const beautified = await beautifyWithDeobfuscation(rawCode);

// Runtime analysis
const analyzer = new RuntimeAnalyzer();
const instrumented = analyzer.instrumentCode(code);

// Architecture analysis
const archAnalyzer = new ArchitectureAnalyzer();
await archAnalyzer.analyzeProject(depGraph, files);
const report = archAnalyzer.generateArchitectureReport();
```

## Configuration

The tool supports various configuration options:

### Runtime Analysis Configuration

```typescript
const config = {
  trackFunctions: true,
  trackVariables: true,
  trackAPICalls: true,
  trackDOMAccess: true,
  trackStorageAccess: true,
  maxEvents: 10000,
};
```

### Obfuscation Patterns

The tool automatically detects and handles:

- Webpack bundles
- UglifyJS minification
- Terser compression
- JSConfuser obfuscation
- Custom hex encoding
- Eval-based obfuscation

## Output

The tool generates comprehensive documentation:

1. **Per-file Documentation**: Detailed analysis of each source file
2. **Architecture Reports**: Mermaid diagrams and dependency matrices
3. **Complexity Analysis**: Module complexity metrics and recommendations
4. **Instrumented Code**: Runtime-ready instrumented versions
5. **Cache Files**: Intelligent caching for performance

## Dependencies

- `@babel/parser`: AST parsing
- `@babel/traverse`: AST traversal
- `@babel/types`: TypeScript types for AST
- `prettier`: Code formatting
- `recast`: AST manipulation
- `ollama`: AI integration
- `crypto`: Cryptographic operations

## Development

### Adding New Obfuscation Patterns

```typescript
// In src/deobfuscation/patterns.ts
export const obfuscationPatterns: ObfuscationPattern[] = [
  // ... existing patterns
  {
    name: "custom_pattern",
    detect: (code: string) => /your-pattern/.test(code),
    confidence: 0.8,
    deobfuscate: async (code: string) => {
      // Your deobfuscation logic
      return deobfuscatedCode;
    },
  },
];
```

### Adding New Runtime Tracking

```typescript
// In src/runtime/analyzer.ts
private instrumentCustomOperation(code: string): string {
  // Your instrumentation logic
  return instrumentedCode;
}
```

## Architecture Benefits

1. **Modularity**: Each component is self-contained and testable
2. **Extensibility**: Easy to add new obfuscation patterns or analysis types
3. **Maintainability**: Clear separation of concerns
4. **Reusability**: Components can be used independently
5. **Type Safety**: Comprehensive TypeScript types throughout

## Performance

- **Intelligent Caching**: Caches AI responses and analysis results
- **Lazy Loading**: Modules are loaded only when needed
- **Streaming**: Real-time processing without blocking
- **Parallel Processing**: Independent file processing

This modular architecture provides a robust foundation for code analysis and documentation generation, with clear separation of concerns and excellent extensibility.
