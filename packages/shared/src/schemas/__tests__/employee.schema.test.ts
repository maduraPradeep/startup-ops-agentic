import { describe, it, expect } from 'vitest';
import { EmployeeSchema, CreateEmployeeSchema, UpdateEmployeeSchema } from '../employee.schema';

const validEmployee = {
  name: 'Jane Smith',
  email: 'jane@acme.com',
  role: 'Software Engineer',
  department: '550e8400-e29b-41d4-a716-446655440000',
  start_date: new Date('2024-01-15'),
};

describe('EmployeeSchema', () => {
  it('parses a valid employee', () => {
    const result = CreateEmployeeSchema.safeParse(validEmployee);
    expect(result.success).toBe(true);
  });

  it('applies defaults for employment_status and employment_type', () => {
    const result = CreateEmployeeSchema.parse(validEmployee);
    expect(result.employment_status).toBe('active');
    expect(result.employment_type).toBe('full_time');
  });

  it('rejects missing required fields', () => {
    const result = CreateEmployeeSchema.safeParse({ name: 'Jane' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = CreateEmployeeSchema.safeParse({ ...validEmployee, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects name shorter than 2 chars', () => {
    const result = CreateEmployeeSchema.safeParse({ ...validEmployee, name: 'J' });
    expect(result.success).toBe(false);
  });

  it('allows partial updates', () => {
    const result = UpdateEmployeeSchema.safeParse({ role: 'Senior Engineer' });
    expect(result.success).toBe(true);
  });

  it('coerces string dates', () => {
    const result = CreateEmployeeSchema.parse({ ...validEmployee, start_date: '2024-01-15' });
    expect(result.start_date).toBeInstanceOf(Date);
  });

  it('includes optional id and tenant_id in full schema', () => {
    const full = EmployeeSchema.parse({
      ...validEmployee,
      id: '550e8400-e29b-41d4-a716-446655440001',
      tenant_id: '550e8400-e29b-41d4-a716-446655440002',
    });
    expect(full.id).toBeDefined();
    expect(full.tenant_id).toBeDefined();
  });
});
