const DIRECTUS_URL = process.env.DIRECTUS_URL ?? 'http://localhost:8055';
const ADMIN_TOKEN  = process.env.DIRECTUS_ADMIN_TOKEN ?? '';

interface ReadOptions {
  filter?: Record<string, unknown>;
  sort?: string[];
  limit?: number;
  page?: number;
  meta?: string;
  fields?: string[];
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Directus ${method} ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export const directus = {
  async readItems<T = Record<string, unknown>>(collection: string, opts: ReadOptions = {}): Promise<T[]> {
    const params = new URLSearchParams();
    if (opts.filter) params.set('filter', JSON.stringify(opts.filter));
    if (opts.sort)   params.set('sort', opts.sort.join(','));
    if (opts.limit)  params.set('limit', String(opts.limit));
    if (opts.page)   params.set('page',  String(opts.page));
    if (opts.meta)   params.set('meta',  opts.meta);
    if (opts.fields) params.set('fields', opts.fields.join(','));

    const qs = params.toString();
    const res = await request<{ data: T[] }>('GET', `/items/${collection}${qs ? '?' + qs : ''}`);
    return res.data;
  },

  async readItem<T = Record<string, unknown>>(collection: string, id: string): Promise<T> {
    const res = await request<{ data: T }>('GET', `/items/${collection}/${id}`);
    return res.data;
  },

  async createItem<T = Record<string, unknown>>(collection: string, data: Record<string, unknown>): Promise<T> {
    const res = await request<{ data: T }>('POST', `/items/${collection}`, data);
    return res.data;
  },

  async updateItem<T = Record<string, unknown>>(collection: string, id: string, data: Record<string, unknown>): Promise<T> {
    const res = await request<{ data: T }>('PATCH', `/items/${collection}/${id}`, data);
    return res.data;
  },

  async deleteItem(collection: string, id: string): Promise<void> {
    await request('DELETE', `/items/${collection}/${id}`);
  },
};
