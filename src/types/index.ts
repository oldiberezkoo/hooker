import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

// Obfuscation patterns
export interface ObfuscationPattern {
  name: string;
  detect: (code: string) => boolean;
  confidence: number;
  deobfuscate: (code: string) => Promise<string>;
}

// Runtime analysis types
export interface RuntimeEvent {
  type:
    | "function_call"
    | "variable_access"
    | "api_call"
    | "dom_access"
    | "storage_access";
  timestamp: number;
  location: string;
  details: any;
  stackTrace: string[];
}

export interface EnhancedRuntimeEvent extends RuntimeEvent {
  id?: string;
  duration?: number;
  parentEventId?: string;
}

export interface InstrumentationConfig {
  trackFunctions: boolean;
  trackVariables: boolean;
  trackAPICalls: boolean;
  trackDOMAccess: boolean;
  trackStorageAccess: boolean;
  maxEvents: number;
}

// Architecture analysis types
export interface ModuleInfo {
  path: string;
  name: string;
  dependencies: Set<string>;
  exports: string[];
  functions: string[];
  classes: string[];
  size: number;
  complexity: number;
}

export interface ArchitectureLayer {
  name: string;
  modules: ModuleInfo[];
  color: string;
}

// Dependency graph type
export type DepGraph = Record<string, Set<string>>;

// Utility types
export interface FileHandle {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
}

export interface Stats {
  isDirectory: () => boolean;
  size: number;
}

export enum eLanguage {
  Russian = "Russian",
  English = "English",
}
