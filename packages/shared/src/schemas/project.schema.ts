import { z } from 'zod';

export const ProjectStatusEnum = z.enum([
  'planning', 'active', 'on_hold', 'completed', 'cancelled',
]);

export const ProjectSchema = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional(),
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  status: ProjectStatusEnum.default('planning'),
  owner: z.string().uuid(),
  department: z.string().uuid().optional(),
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
  budget: z.number().positive().optional(),
  members: z.array(z.string().uuid()).optional(),
  tags: z.array(z.string()).optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const CreateProjectSchema = ProjectSchema.omit({
  id: true, tenant_id: true, created_at: true, updated_at: true,
});

export const UpdateProjectSchema = CreateProjectSchema.partial();

export type Project = z.infer<typeof ProjectSchema>;
export type CreateProject = z.infer<typeof CreateProjectSchema>;
export type UpdateProject = z.infer<typeof UpdateProjectSchema>;
