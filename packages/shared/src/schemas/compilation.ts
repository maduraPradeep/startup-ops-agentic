import { z } from 'zod';
import type { LangGraphDefinition } from './langgraph-ir';
import type { ReactFlowGraph } from './react-flow';
import type { ParsedToken } from './tokens';

// Phase 1a — compilation result contract (spec §4.4 step 9, §11.6).

export const CompilationStageSchema = z.enum([
  'parse',
  'cache_check',
  'compile',
  'structural_validate',
  'data_flow_validate',
  'generate_flow',
]);
export type CompilationStage = z.infer<typeof CompilationStageSchema>;

export interface CompilationWarning {
  code: string;
  message: string;
}

export interface CompilationSuccess {
  success: true;
  langgraph_def: LangGraphDefinition;
  react_flow_graph: ReactFlowGraph;
  warnings: CompilationWarning[];
  parsed_tokens: ParsedToken[];
  compilation_hash: string;
  from_cache: boolean;
}

export interface CompilationError {
  success: false;
  error_type: string;
  stage: CompilationStage;
  message: string;
  token_at_fault?: string;
  suggestion?: string;
}

export type CompilationResult = CompilationSuccess | CompilationError;
