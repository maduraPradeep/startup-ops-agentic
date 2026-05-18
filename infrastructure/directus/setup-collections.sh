#!/usr/bin/env bash
# Registers custom collections, field metadata, and relations in Directus.
# Run once after `make dev-up` when starting with a fresh database.
set -euo pipefail

DIRECTUS_URL="${DIRECTUS_URL:-http://localhost:8055}"
ADMIN_TOKEN="${DIRECTUS_ADMIN_TOKEN:-dev-admin-token}"

# ── wait for Directus ─────────────────────────────────────────────────────────
echo "Waiting for Directus at ${DIRECTUS_URL}..."
until curl -sf "${DIRECTUS_URL}/server/health" | grep -q '"status":"ok"'; do
  sleep 3
done
echo "Directus is up."

AUTH="-H 'Authorization: Bearer ${ADMIN_TOKEN}'"
BASE="${DIRECTUS_URL}"

patch_field() {
  local collection=$1 field=$2 body=$3
  curl -sf -X PATCH "${BASE}/fields/${collection}/${field}" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "${body}" > /dev/null
}

# ── 1. Register collections ───────────────────────────────────────────────────
echo "Registering collections..."

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-docker-postgres-1}"

docker exec "$POSTGRES_CONTAINER" psql -U ops_user -d ops_platform -c "
INSERT INTO directus_collections (collection, icon, note, sort, accountability, collapse)
VALUES
  ('tenants',        'corporate_fare',  'Platform-level tenant registry', 1,  'all', 'open'),
  ('departments',    'account_tree',    NULL,                              2,  'all', 'open'),
  ('employees',      'people',          NULL,                              3,  'all', 'open'),
  ('leave_policies', 'policy',          NULL,                              4,  'all', 'open'),
  ('leave_requests', 'event_available', NULL,                              5,  'all', 'open'),
  ('projects',       'work',            NULL,                              6,  'all', 'open'),
  ('documents',      'description',     NULL,                              7,  'all', 'open'),
  ('approval_chains','approval',        NULL,                              8,  'all', 'open'),
  ('audit_logs',     'history',         NULL,                              9,  'all', 'open'),
  ('conversations',  'chat',            NULL,                              10, 'all', 'open')
ON CONFLICT (collection) DO NOTHING;
"

# ── 2. Register relations (bypass FK-exists error by direct SQL insert) ───────
echo "Registering relations..."
docker exec "$POSTGRES_CONTAINER" psql -U ops_user -d ops_platform -c "
INSERT INTO directus_relations (many_collection, many_field, one_collection, one_deselect_action)
VALUES
  ('departments',    'tenant_id',   'tenants',        'nullify'),
  ('employees',      'tenant_id',   'tenants',        'nullify'),
  ('employees',      'department',  'departments',    'nullify'),
  ('employees',      'manager',     'employees',      'nullify'),
  ('leave_requests', 'employee',    'employees',      'nullify'),
  ('leave_requests', 'policy',      'leave_policies', 'nullify'),
  ('leave_requests', 'approver',    'employees',      'nullify'),
  ('projects',       'owner',       'employees',      'nullify'),
  ('projects',       'department',  'departments',    'nullify'),
  ('approval_chains','approver',    'employees',      'nullify'),
  ('documents',      'tenant_id',   'tenants',        'nullify'),
  ('documents',      'created_by',  'employees',      'nullify'),
  ('audit_logs',     'tenant_id',   'tenants',        'nullify'),
  ('conversations',  'tenant_id',   'tenants',        'nullify')
ON CONFLICT DO NOTHING;
"

# ── 3. Field metadata ─────────────────────────────────────────────────────────
echo "Setting field metadata..."

# tenants
patch_field tenants created_at  '{"meta":{"hidden":true,"readonly":true}}'
patch_field tenants plan        '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Starter","value":"starter"},{"text":"Growth","value":"growth"},{"text":"Enterprise","value":"enterprise"}]}}}'
patch_field tenants settings    '{"meta":{"interface":"input-code","options":{"language":"json"}}}'

# departments
patch_field departments tenant_id '{"meta":{"hidden":true}}'

# employees
patch_field employees tenant_id         '{"meta":{"hidden":true}}'
patch_field employees department        '{"meta":{"interface":"select-dropdown-m2o"}}'
patch_field employees manager           '{"meta":{"interface":"select-dropdown-m2o"}}'
patch_field employees employment_status '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Active","value":"active"},{"text":"Suspended","value":"suspended"},{"text":"On Leave","value":"on_leave"},{"text":"Terminated","value":"terminated"},{"text":"Archived","value":"archived"}]}}}'
patch_field employees employment_type   '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Full Time","value":"full_time"},{"text":"Part Time","value":"part_time"},{"text":"Contractor","value":"contractor"},{"text":"Intern","value":"intern"}]}}}'
patch_field employees skills            '{"meta":{"interface":"tags"}}'
patch_field employees created_at        '{"meta":{"hidden":true,"readonly":true}}'
patch_field employees updated_at        '{"meta":{"hidden":true,"readonly":true}}'

# leave_policies
patch_field leave_policies tenant_id  '{"meta":{"hidden":true}}'
patch_field leave_policies leave_type '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Annual","value":"annual"},{"text":"Sick","value":"sick"},{"text":"Parental","value":"parental"},{"text":"Bereavement","value":"bereavement"},{"text":"Unpaid","value":"unpaid"},{"text":"Wellness","value":"wellness"},{"text":"Other","value":"other"}]}}}'

# leave_requests
patch_field leave_requests tenant_id       '{"meta":{"hidden":true}}'
patch_field leave_requests employee        '{"meta":{"interface":"select-dropdown-m2o"}}'
patch_field leave_requests policy          '{"meta":{"interface":"select-dropdown-m2o"}}'
patch_field leave_requests approver        '{"meta":{"interface":"select-dropdown-m2o"}}'
patch_field leave_requests leave_type      '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Annual","value":"annual"},{"text":"Sick","value":"sick"},{"text":"Parental","value":"parental"},{"text":"Bereavement","value":"bereavement"},{"text":"Unpaid","value":"unpaid"},{"text":"Wellness","value":"wellness"},{"text":"Other","value":"other"}]}}}'
patch_field leave_requests status          '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Draft","value":"draft"},{"text":"Submitted","value":"submitted"},{"text":"Under Review","value":"under_review"},{"text":"Approved","value":"approved"},{"text":"Rejected","value":"rejected"},{"text":"Cancelled","value":"cancelled"},{"text":"Taken","value":"taken"}]}}}'
patch_field leave_requests reason          '{"meta":{"interface":"input-multiline"}}'
patch_field leave_requests approval_notes  '{"meta":{"interface":"input-multiline"}}'
patch_field leave_requests created_at      '{"meta":{"hidden":true,"readonly":true}}'
patch_field leave_requests updated_at      '{"meta":{"hidden":true,"readonly":true}}'

# projects
patch_field projects tenant_id  '{"meta":{"hidden":true}}'
patch_field projects owner      '{"meta":{"interface":"select-dropdown-m2o"}}'
patch_field projects department '{"meta":{"interface":"select-dropdown-m2o"}}'
patch_field projects status     '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Planning","value":"planning"},{"text":"Active","value":"active"},{"text":"On Hold","value":"on_hold"},{"text":"Completed","value":"completed"},{"text":"Cancelled","value":"cancelled"}]}}}'
patch_field projects description '{"meta":{"interface":"input-multiline"}}'
patch_field projects tags       '{"meta":{"interface":"tags"}}'
patch_field projects created_at '{"meta":{"hidden":true,"readonly":true}}'
patch_field projects updated_at '{"meta":{"hidden":true,"readonly":true}}'

# documents
patch_field documents tenant_id  '{"meta":{"hidden":true}}'
patch_field documents created_by '{"meta":{"interface":"select-dropdown-m2o"}}'
patch_field documents content    '{"meta":{"interface":"input-multiline"}}'
patch_field documents tags       '{"meta":{"interface":"tags"}}'
patch_field documents created_at '{"meta":{"hidden":true,"readonly":true}}'
patch_field documents updated_at '{"meta":{"hidden":true,"readonly":true}}'

# approval_chains
patch_field approval_chains tenant_id      '{"meta":{"hidden":true}}'
patch_field approval_chains approver       '{"meta":{"interface":"select-dropdown-m2o"}}'
patch_field approval_chains status         '{"meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Pending","value":"pending"},{"text":"Approved","value":"approved"},{"text":"Rejected","value":"rejected"}]}}}'
patch_field approval_chains description    '{"meta":{"interface":"input-multiline"}}'
patch_field approval_chains approval_notes '{"meta":{"interface":"input-multiline"}}'

# audit_logs
patch_field audit_logs tenant_id '{"meta":{"hidden":true}}'

# conversations
patch_field conversations tenant_id '{"meta":{"hidden":true}}'
patch_field conversations updated_at '{"meta":{"hidden":true,"readonly":true}}'

echo "Done. Open http://localhost:8055 — all collections should now be visible."
