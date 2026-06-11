// Phase 1a — skill-text fixtures used by tests (spec Appendix C and variants).

export const ADD_EMPLOYEE_SKILL = `Skill: Add Employee
Trigger: manual
Required role: @role:hr_admin, @role:owner

Use @tools:describe:people to load the current employee schema.
Collect all required fields of @entity:people from the user.
Ask for their LinkedIn URL. Analyze with @tool:linkedin_analyzer
and save to @entity:people.linkedin_summary.
Use @tools:create:people to save the record.
Send a notification to @role:owner with name and summary.
Send a notification to @role:all welcoming the person.
Start @agent:onboarding.
`;

export const HRIS_SYNC_SKILL = `Skill: Sync HRIS
Trigger: manual
Required role: @role:hr_admin

Use @tools:describe:people to load the schema.
Sync the record to the external system with @tool:hris_sync.
`;

export const UNKNOWN_ENTITY_SKILL = `Skill: Broken
Trigger: manual

Use @entity:unicorn to do something impossible.
`;

export const UNKNOWN_KIND_SKILL = `Skill: Broken Kind
Trigger: manual

Use @widget:sprocket to do something undefined.
`;
