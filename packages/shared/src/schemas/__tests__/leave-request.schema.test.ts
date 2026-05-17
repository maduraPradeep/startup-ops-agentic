import { describe, it, expect } from 'vitest';
import { CreateLeaveRequestSchema, LeaveRequestSchema } from '../leave-request.schema';

const base = {
  employee: '550e8400-e29b-41d4-a716-446655440001',
  policy:   '550e8400-e29b-41d4-a716-446655440002',
  leave_type: 'annual' as const,
  start_date: new Date('2025-06-01'),
  end_date:   new Date('2025-06-10'),
};

describe('LeaveRequestSchema', () => {
  it('parses a valid leave request', () => {
    const result = CreateLeaveRequestSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('rejects end_date before start_date', () => {
    const result = LeaveRequestSchema.safeParse({
      ...base,
      end_date: new Date('2025-05-01'),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const endDateError = result.error.issues.find((i) => i.path.includes('end_date'));
      expect(endDateError).toBeDefined();
    }
  });

  it('allows equal start and end dates', () => {
    const result = CreateLeaveRequestSchema.safeParse({
      ...base,
      end_date: new Date('2025-06-01'),
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid leave_type', () => {
    const result = CreateLeaveRequestSchema.safeParse({ ...base, leave_type: 'vacation' });
    expect(result.success).toBe(false);
  });

  it('allows optional reason', () => {
    const result = CreateLeaveRequestSchema.parse({ ...base, reason: 'Family trip' });
    expect(result.reason).toBe('Family trip');
  });

  it('rejects reason longer than 500 chars', () => {
    const result = CreateLeaveRequestSchema.safeParse({ ...base, reason: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('coerces string dates', () => {
    const result = CreateLeaveRequestSchema.parse({
      ...base,
      start_date: '2025-06-01',
      end_date: '2025-06-10',
    });
    expect(result.start_date).toBeInstanceOf(Date);
    expect(result.end_date).toBeInstanceOf(Date);
  });
});
