import { directus } from '../services/directus.service.js';

interface ListOptions {
  filter?: Record<string, unknown>;
  sort?: string[];
  page?: number;
  limit?: number;
  meta?: string;
}

export const EntityModel = {
  async findAll(collection: string, tenantId: string, opts: ListOptions = {}) {
    return directus.readItems(collection, {
      filter: { tenant_id: { _eq: tenantId }, ...(opts.filter ?? {}) },
      sort:   opts.sort,
      page:   opts.page,
      limit:  opts.limit,
      meta:   opts.meta,
    });
  },

  async findById(collection: string, id: string) {
    return directus.readItem(collection, id);
  },

  async create(collection: string, data: Record<string, unknown>, tenantId: string) {
    return directus.createItem(collection, { ...data, tenant_id: tenantId });
  },

  async update(collection: string, id: string, data: Record<string, unknown>) {
    return directus.updateItem(collection, id, data);
  },

  async describe(collection: string): Promise<unknown> {
    const res = await fetch(
      `${process.env.DIRECTUS_URL}/items/${collection}/describe`,
      { headers: { Authorization: `Bearer ${process.env.DIRECTUS_ADMIN_TOKEN}` } }
    );
    return res.json();
  },
};
