import { z } from 'zod';

export const LeaveTypeEnum = z.enum([
  'annual', 'sick', 'parental', 'bereavement', 'unpaid', 'wellness', 'other',
]);

export const LeaveRequestStatusEnum = z.enum([
  'draft', 'submitted', 'under_review', 'approved', 'rejected', 'cancelled', 'taken',
]);

const LeaveRequestBase = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional(),
  employee: z.string().uuid(),
  policy: z.string().uuid(),
  leave_type: LeaveTypeEnum,
  start_date: z.coerce.date(),
  end_date: z.coerce.date(),
  days_requested: z.number().positive().optional(),
  reason: z.string().max(500).optional(),
  status: LeaveRequestStatusEnum.default('draft'),
  approver: z.string().uuid().optional(),
  approved_at: z.coerce.date().optional(),
  approval_notes: z.string().optional(),
  submitted_at: z.coerce.date().optional(),
});

export const LeaveRequestSchema = LeaveRequestBase.refine(
  (data) => data.end_date >= data.start_date,
  { message: 'End date must be on or after start date', path: ['end_date'] }
);

export const CreateLeaveRequestSchema = LeaveRequestBase.omit({
  id: true, tenant_id: true, status: true, days_requested: true,
  approver: true, approved_at: true, approval_notes: true, submitted_at: true,
});

export const ApproveLeaveRequestSchema = z.object({
  approval_notes: z.string().optional(),
});

export type LeaveRequest = z.infer<typeof LeaveRequestSchema>;
export type CreateLeaveRequest = z.infer<typeof CreateLeaveRequestSchema>;
export type ApproveLeaveRequest = z.infer<typeof ApproveLeaveRequestSchema>;
