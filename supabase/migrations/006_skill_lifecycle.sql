-- Phase 1c — 006_skill_lifecycle.sql
-- Skill lifecycle state machine (spec §4.7, PRD §8.4 deliverable #3):
--   draft → compiled → validated → live → archived
-- plus the live/previous compilation pointers that back publish + rollback
-- (deliverable #10). RLS on `skills` is unchanged (already enabled in 005).

ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft',
  -- The latest successful compilation bound to the current text — the candidate that
  -- `validate` confirms and `publish` promotes to live.
  ADD COLUMN IF NOT EXISTS compiled_compilation_id UUID REFERENCES skill_compilations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS live_compilation_id     UUID REFERENCES skill_compilations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_compilation_id UUID REFERENCES skill_compilations(id) ON DELETE SET NULL;

-- Constrain status to the known lifecycle states. Dropped-then-added so re-running
-- the migration after a state-set change is idempotent.
ALTER TABLE skills DROP CONSTRAINT IF EXISTS skills_status_check;
ALTER TABLE skills ADD  CONSTRAINT skills_status_check
  CHECK (status IN ('draft', 'compiled', 'validated', 'live', 'archived'));

CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(tenant_id, status);
