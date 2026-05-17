import { defineEndpoint } from '@directus/extensions-sdk';

async function getTenantForUser(userId: string, database: any): Promise<string | null> {
  const row = await database('directus_users').where('id', userId).first();
  return row?.tenant_id ?? null;
}

function getToolManifest(collection: string) {
  const BASE_TOOLS = [
    { name: 'list',   description: `List ${collection} with optional filters` },
    { name: 'get',    description: `Get a single ${collection} item by ID` },
    { name: 'create', description: `Create a new ${collection} item` },
    { name: 'update', description: `Update an existing ${collection} item` },
  ];

  const COLLECTION_TOOLS: Record<string, typeof BASE_TOOLS> = {
    leave_requests: [
      ...BASE_TOOLS,
      { name: 'approveRequest', description: 'Approve a leave request' },
      { name: 'rejectRequest',  description: 'Reject a leave request with reason' },
      { name: 'submitRequest',  description: 'Submit a draft leave request for approval' },
    ],
    employees: [
      ...BASE_TOOLS,
      { name: 'terminate',      description: 'Terminate an employee' },
      { name: 'updateStatus',   description: 'Update employee employment status' },
    ],
  };

  return COLLECTION_TOOLS[collection] ?? BASE_TOOLS;
}

export default defineEndpoint((router, context) => {
  const { getSchema, database } = context;

  router.get('/items/:collection/describe', async (req: any, res: any) => {
    const schema = await getSchema();
    const collection = req.params.collection;
    const tenantId = req.accountability?.user
      ? await getTenantForUser(req.accountability.user, database)
      : null;

    if (!schema.collections[collection]) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const fields = schema.fields[collection] ?? {};
    const relations = schema.relations.filter((r: any) =>
      r.collection === collection || r.related_collection === collection
    );

    return res.json({
      collection,
      tenant_id: tenantId,
      schema: {
        fields: Object.entries(fields).map(([name, field]: [string, any]) => ({
          name,
          type: field.type,
          required: !field.nullable,
          validation: field.validation,
          meta: field.meta,
        })),
        relations: relations.map((r: any) => ({
          field: r.field,
          target: r.related_collection,
          type: r.meta?.one_field ? 'one_to_many' : 'many_to_one',
        })),
      },
      tools: getToolManifest(collection),
    });
  });
});
