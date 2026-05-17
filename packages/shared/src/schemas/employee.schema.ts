import { z } from 'zod';

export const EmploymentStatusEnum = z.enum([
  'active', 'suspended', 'on_leave', 'terminated', 'archived',
]);

export const EmploymentTypeEnum = z.enum([
  'full_time', 'part_time', 'contractor', 'intern',
]);

export const EmployeeSchema = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional(),
  name: z.string().min(2).max(100),
  email: z.string().email(),
  role: z.string().min(1),
  department: z.string().uuid(),
  manager: z.string().uuid().optional(),
  employment_status: EmploymentStatusEnum.default('active'),
  start_date: z.coerce.date(),
  location: z.string().optional(),
  employment_type: EmploymentTypeEnum.default('full_time'),
  skills: z.array(z.string()).optional(),
  slack_id: z.string().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const CreateEmployeeSchema = EmployeeSchema.omit({
  id: true, tenant_id: true, created_at: true, updated_at: true,
});

export const UpdateEmployeeSchema = CreateEmployeeSchema.partial();

export type Employee = z.infer<typeof EmployeeSchema>;
export type CreateEmployee = z.infer<typeof CreateEmployeeSchema>;
export type UpdateEmployee = z.infer<typeof UpdateEmployeeSchema>;
