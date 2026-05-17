import { directus } from './directus.service.js';

interface AuditEntry {
  tenant_id: string;
  actor_id: string;
  actor_email: string;
  action: string;
  collection: string;
  item_id?: string;
  changes?: unknown;
  metadata?: unknown;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await directus.createItem('audit_logs', {
      ...(entry as unknown as Record<string, unknown>),
      timestamp: new Date().toISOString(),
    });
  } catch {
    // audit log failures are non-fatal
  }
}
