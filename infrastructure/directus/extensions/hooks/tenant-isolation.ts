import { defineHook } from '@directus/extensions-sdk';
import { TENANT_COLLECTIONS } from '@ops/shared';

async function resolveTenant(accountability: any, database: any): Promise<string | null> {
  if (!accountability?.user) return null;
  const row = await database('directus_users').where('id', accountability.user).first();
  return row?.tenant_id ?? null;
}

export default defineHook(({ filter }) => {
  filter('items.read', async (payload: any, meta: any, context: any) => {
    if (!(TENANT_COLLECTIONS as readonly string[]).includes(meta.collection)) return payload;

    const tenantId = await resolveTenant(context.accountability, context.database);
    if (!tenantId) throw new Error('Tenant context required');

    return {
      ...payload,
      filter: {
        ...payload.filter,
        tenant_id: { _eq: tenantId },
      },
    };
  });

  filter('items.create', async (payload: any, meta: any, context: any) => {
    if (!(TENANT_COLLECTIONS as readonly string[]).includes(meta.collection)) return payload;

    const tenantId = await resolveTenant(context.accountability, context.database);
    return { ...payload, tenant_id: tenantId };
  });
});
