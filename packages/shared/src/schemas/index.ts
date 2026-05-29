import type { ZodSchema } from 'zod';
import { CreateEmployeeSchema } from './employee.schema';
import { CreateLeaveRequestSchema } from './leave-request.schema';
import { CreateProjectSchema } from './project.schema';

const SCHEMA_REGISTRY: Record<string, ZodSchema> = {
  employees: CreateEmployeeSchema,
  leave_requests: CreateLeaveRequestSchema,
  projects: CreateProjectSchema,
};

export function getEntitySchema(collection: string): ZodSchema | null {
  return SCHEMA_REGISTRY[collection] ?? null;
}

export * from './employee.schema';
export * from './leave-request.schema';
export * from './project.schema';
export * from './workflow.schema';
export * from './conversation.schema';

// Phase 1a — skill compilation contract
export * from './tokens';
export * from './langgraph-ir';
export * from './execution';
export * from './react-flow';
export * from './registry';
export * from './compilation';
