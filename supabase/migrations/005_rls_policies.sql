-- Phase 1b — 005_rls_policies.sql
-- Row-Level Security as defense-in-depth for tenant_id isolation (spec §11.2). This
-- is a SAFETY NET under — never replacing — the app-layer authorize() checks in
-- Fastify. All entity/skill mutations still flow through the gateway.
--
-- Tenancy model:
--   * The Fastify service role connects as a BYPASSRLS role (e.g. the Supabase
--     `service_role` / a dedicated `app_service` login) → it sees all tenants and
--     is responsible for enforcing tenant scoping in the app layer.
--   * Any direct / Studio / PostgREST access uses a non-bypass role and is confined
--     to the tenant in the `app.tenant_id` GUC (set per request / session).
--
-- Platform config tables (entity_definitions, platform_fields, tool_registry,
-- agent_definitions, roles, default_skills) are GLOBAL (Tier 1) and intentionally
-- NOT under RLS — every tenant reads the same platform config.

-- Helper: current tenant from the request-scoped GUC. Returns NULL when unset.
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', TRUE), '')::UUID
$$;

DO $$
DECLARE
  t TEXT;
  tenant_tables TEXT[] := ARRAY[
    'departments', 'employees', 'leave_policies', 'leave_requests',
    'tenant_field_definitions', 'skills', 'skill_compilations', 'skill_executions'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- FORCE so even the table owner is subject to RLS (the app connects as a
    -- BYPASSRLS role, which is the only intended escape hatch).
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())',
      t
    );
  END LOOP;
END $$;
