# UI Design Document
## AI-Native Operations Platform — WebChat Application

**Version:** 1.0  
**Date:** 2026-05-30  
**Stack:** React 19 · Vite · Tailwind CSS 3 · Lucide React · React Hook Form · Zustand · TanStack Query

---

## 1. Design Principles

1. **Operators, not developers.** Every surface must be usable by an HR Manager or Finance Lead with no engineering knowledge. No raw JSON, no SQL, no cryptic error codes.
2. **State is always visible.** Workflow executions, approvals, and compilation progress are surfaced in real time. Users never have to guess "did my action do anything?"
3. **Fail loudly, recover gracefully.** Validation errors appear inline, immediately, at the exact field that is wrong. Empty states explain what to do next, not just that the list is empty.
4. **Chat is the shell; everything else is a surface.** The WebChat is the primary entry point for operators. Admin surfaces (Schema Builder, Skill Editor) are reachable from the sidebar and are full-page overlays — they do not disrupt the chat context.
5. **Confidence before consequence.** Destructive or irreversible actions (publish a skill, rollback a version, GDPR erase) always require a confirmation with explicit impact text.

---

## 2. Design System

### 2.1 Color Tokens

```
Primary     — indigo-600  (#4f46e5)   Active states, CTAs, progress bars
Primary dim — indigo-50   (#eef2ff)   Active nav backgrounds, selected chips
Primary fg  — indigo-700  (#4338ca)   Text on indigo-50 backgrounds

Surface     — white        (#ffffff)   Cards, panels, modals
Background  — gray-50      (#f9fafb)   App background
Border      — gray-200     (#e5e7eb)   Default card/panel borders
Border dim  — gray-100     (#f3f4f6)   Subtle separators

Text primary   — gray-900  (#111827)
Text secondary — gray-600  (#4b5563)
Text muted     — gray-400  (#9ca3af)
Text disabled  — gray-300  (#d1d5db)

Success   — green-600  (#16a34a)   Approve buttons, completed badges
Warning   — amber-400  (#fbbf24)   Approval-required accent, escalated states
Danger    — red-600    (#dc2626)   Reject, cancel, error states
Info      — blue-600   (#2563eb)   Informational banners, links

Compilation states:
  Compiling    — indigo-500 pulsing ring
  Success      — green-500 solid
  Error        — red-500 solid
  Cache hit    — gray-400 solid + lightning icon
```

### 2.2 Typography Scale

| Role | Class | Usage |
|------|-------|-------|
| Page title | `text-2xl font-bold text-gray-900` | Section headings (Schema Builder, Skill Editor) |
| Section heading | `text-lg font-semibold text-gray-900` | Card headers, panel titles |
| Label | `text-sm font-medium text-gray-700` | Form labels, column headers |
| Body | `text-sm text-gray-700` | Card body text, descriptions |
| Caption | `text-xs text-gray-500` | Metadata, timestamps, badge text |
| Code | `font-mono text-sm text-gray-800 bg-gray-100 px-1 rounded` | Token names, hashes, step types |

### 2.3 Spacing System

All spacing uses Tailwind's 4px base grid. Standard component spacing:

```
Component padding:   px-4 py-3   (cards, panels)
Form field gap:      space-y-4   (between fields)
Inline element gap:  gap-2       (icon + label)
Section gap:         space-y-6   (between form sections)
Card grid gap:       gap-4       (card grids)
```

### 2.4 Border Radius

```
Cards, panels:   rounded-xl  (12px)
Buttons:         rounded-lg  (8px)
Chips/badges:    rounded-full
Input fields:    rounded-lg  (8px)
Modals:          rounded-2xl (16px)
```

### 2.5 Shadow Scale

```
Card (default):    shadow-sm
Card (hover):      shadow-md
Modal backdrop:    bg-black/40 (backdrop-blur-sm)
Dropdown:          shadow-lg ring-1 ring-gray-200
```

### 2.6 Elevation & Layering

```
z-10   Sticky headers, sidebar
z-20   Dropdown menus, tooltips
z-30   Page-level drawers (Skill Editor, Schema Builder overlay)
z-40   Modals, confirmation dialogs
z-50   Toast notifications
```

---

## 3. Component Primitives

### 3.1 Button

Four variants. All share `rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed`.

| Variant | Classes | Usage |
|---------|---------|-------|
| Primary | `bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2` | Primary CTA |
| Secondary | `border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2` | Secondary action |
| Danger | `bg-red-600 text-white hover:bg-red-700 px-4 py-2` | Destructive confirm |
| Ghost | `text-gray-600 hover:bg-gray-100 px-3 py-2` | Icon buttons, nav items |

Loading state: replace button text with a `w-4 h-4 animate-spin` spinner; keep button width stable with `min-w-[...]`.

### 3.2 Input

```
base:   w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
        placeholder:text-gray-400
        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
        disabled:bg-gray-50 disabled:text-gray-500
error:  border-red-400 focus:ring-red-400
```

Error message below input: `text-xs text-red-500 mt-1`.

### 3.3 Badge

```
base:       inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium
draft:      bg-gray-100 text-gray-600
compiled:   bg-blue-50 text-blue-700
validated:  bg-indigo-50 text-indigo-700
live:       bg-green-50 text-green-700
archived:   bg-gray-100 text-gray-400
```

Execution state badges use the same pattern:
```
initiated:              bg-gray-100 text-gray-600
collecting_info:        bg-blue-50 text-blue-700
awaiting_approval:      bg-amber-50 text-amber-700
awaiting_human_input:   bg-indigo-50 text-indigo-700
completed:              bg-green-50 text-green-700
error:                  bg-red-50 text-red-700
```

### 3.4 Card

```
base:   bg-white rounded-xl border border-gray-200 shadow-sm
hover:  hover:shadow-md transition-shadow duration-200
```

Cards that contain approval actions get `border-l-4 border-amber-400` accent.

### 3.5 Modal

```
backdrop:  fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-center justify-center
container: bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6
header:    flex items-center justify-between mb-4
footer:    flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-100
```

Close via Escape key and clicking the backdrop.

### 3.6 Toast

Position: top-right, `fixed top-4 right-4 z-50 flex flex-col gap-2`.

```
base:     bg-white rounded-xl shadow-lg border border-gray-200 px-4 py-3 flex items-center gap-3 min-w-[280px] max-w-sm
success:  border-l-4 border-green-500
error:    border-l-4 border-red-500
info:     border-l-4 border-indigo-500
warning:  border-l-4 border-amber-400
```

Auto-dismiss after 4 s; user can dismiss early with × button.

### 3.7 Empty State

```
container:  flex flex-col items-center justify-center py-16 text-center
icon:       w-12 h-12 text-gray-300 mb-4  (Lucide icon)
heading:    text-base font-medium text-gray-500
body:       text-sm text-gray-400 mt-1 max-w-xs
cta:        mt-4 (Primary button if actionable)
```

### 3.8 Skeleton Loader

```
base:    animate-pulse bg-gray-100 rounded
text:    h-4 rounded w-3/4
avatar:  w-8 h-8 rounded-full
card:    h-24 rounded-xl
```

---

## 4. Application Structure

### 4.1 Routing

```
/login                      → LoginPage
/                           → ChatPage (authenticated)
/admin/schema               → SchemaBuilderPage (tenant_admin+)
/admin/skills               → SkillsListPage (tenant_admin+)
/admin/skills/new           → SkillEditorPage (new)
/admin/skills/:id           → SkillEditorPage (edit)
/admin/skills/:id/compile   → SkillCompilationPage
/workflows                  → WorkflowsPage
/workflows/:id              → WorkflowDetailPage
/audit                      → AuditLogPage (tenant_admin+)
```

Routes under `/admin/*` check role ≥ `tenant_admin`; redirect to `/` if unauthorized.

### 4.2 Layout Hierarchy

```
RootLayout
└── AuthGuard
    ├── LoginPage              (no sidebar)
    └── AppLayout              (sidebar + main)
        ├── ChatPage           (default main area)
        ├── SchemaBuilderPage  (replaces main, slide-in from right)
        ├── SkillsListPage     (replaces main)
        ├── SkillEditorPage    (replaces main)
        ├── WorkflowsPage      (replaces main)
        ├── WorkflowDetailPage (replaces main)
        └── AuditLogPage       (replaces main)
```

The sidebar is always visible. Navigating to an admin page does not remove the sidebar; the chat panel is replaced by the admin surface. The user can always click the chat nav item to return.

---

## 5. Screen Specifications

### 5.1 LoginPage

**Path:** `/login`  
**Role:** All (pre-auth)

```
┌─────────────────────────────────────────┐
│         [Ops Platform logo]             │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  Sign in to your workspace        │  │
│  │                                   │  │
│  │  Email ________________________   │  │
│  │  Password _____________________   │  │
│  │                                   │  │
│  │  [Sign In  ─────────────────────] │  │
│  │                                   │  │
│  │  Forgot password?                 │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
  bg-gray-50, card centered vertically
```

- Email + password fields with React Hook Form + Zod validation.
- On submit: POST `/auth/login`; store JWT in Zustand `auth.store`; redirect to `/`.
- Error state: inline toast "Invalid email or password" (do not say which is wrong).
- Loading state: button spinner, fields disabled.
- No tenant selector in Phase 1 (tenant resolved from user record).

---

### 5.2 AppLayout (Persistent Shell)

**Sidebar width:** 288px expanded (`w-72`), 56px collapsed (`w-14`).  
**Transition:** `transition-all duration-200` width animation.

#### Sidebar Sections (top to bottom):

**Brand header:**
```
┌──────────────────────────────────────┐
│  [O]  Ops Platform                   │
│       Acme Corp                      │   ← tenantName from auth store
└──────────────────────────────────────┘
```

**Navigation:**
```
[GitBranch]   Workflows          ← active: indigo-50 bg, indigo-700 text
[CheckSquare] Approvals   [3]    ← red badge when pendingApprovalCount > 0
[LayoutDash]  Entities
[Bell]        Alerts
─────────────── (separator) ────────────
[Settings]    Admin              ← only visible to tenant_admin+
[BookOpen]    Skills             ← only visible to tenant_admin+
```

**Sidebar panel (when a nav item is active):**  
The panel slides in below nav items, scrollable, without changing the sidebar width. Contains the relevant controller content (ActiveWorkflows, PendingApprovals, RecentEntities, etc.).

**User footer:**
```
[MP]  Madu Pradeep               ← avatar initials in indigo-100 circle
      tenant_admin               ← role
[LogOut]  [ChevronLeft/Right]
```

#### Adding Admin nav items (Phase 1b):

```typescript
const NAV_ITEMS_ADMIN = [
  { path: '/admin/schema',  icon: <Database />,   label: 'Schema' },
  { path: '/admin/skills',  icon: <Cpu />,         label: 'Skills' },
];
```

These appear below a `── Admin ──` divider; only rendered if `user.role === 'tenant_admin' || 'super_admin'`.

---

### 5.3 ChatPage

**Path:** `/`  
**Role:** All authenticated

```
┌──────────────────────────────────────────────────────────────────┐
│  SIDEBAR (w-72)  │  CHAT SURFACE (flex-1)                       │
│                  │                                               │
│  [Workflows]     │   ┌──────────────────────────────────────┐   │
│  [Approvals] [3] │   │                                      │   │
│  [Entities]      │   │   How can I help you today?          │   │
│  [Alerts]        │   │   Ask about employees, leave...      │   │
│  ──────────────  │   │                                      │   │
│  (active panel   │   │  ┌──────────────────────────────┐   │   │
│   content here)  │   │  │  USER: I need to submit a    │   │   │
│                  │   │  │  leave request               │   │   │
│                  │   │  └──────────────────────────────┘   │   │
│                  │   │  ┌──────────────────────────────┐   │   │
│                  │   │  │  ASSISTANT: Sure! Let me      │   │   │
│                  │   │  │  help you with that.         │   │   │
│                  │   │  │  [WorkflowStatusCard]         │   │   │
│                  │   │  └──────────────────────────────┘   │   │
│                  │   │                                      │   │
│                  │   └──────────────────────────────────────┘   │
│                  │   ┌──────────────────────────────────────┐   │
│                  │   │  [Message input…]          [Send →]  │   │
│                  │   └──────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

#### MessageBubble variants:

**User bubble** (right-aligned):
```
                ┌─────────────────────────────┐
                │  I need to submit a leave   │
                │  request for next week      │ ← bg-indigo-600 text-white rounded-xl rounded-br-sm
                └─────────────────────────────┘
                                   10:34 AM MP
```

**Assistant bubble** (left-aligned):
```
[O] ┌─────────────────────────────────────┐
    │  Sure! I've started a Leave Request │ ← bg-white border border-gray-200 rounded-xl rounded-bl-sm
    │  workflow for you.                  │
    │                                     │
    │  [WorkflowStatusCard]               │ ← embedded card component
    └─────────────────────────────────────┘
    10:34 AM · Ops Agent
```

**System bubble** (centered):
```
    ──── Workflow started at 10:34 AM ──── ← text-xs text-gray-400
```

#### Embedded card types in chat:

Chat messages can embed rich cards as children of an assistant bubble. Cards are rendered by `MessageBubble` based on `message.card_type`:

| `card_type` | Component |
|-------------|-----------|
| `workflow_status` | `WorkflowStatusCard` |
| `approval_required` | `ApprovalCard` |
| `action_confirm` | `ActionCard` |
| `broadcast` | `BroadcastCard` |
| `entity_summary` | `EntitySummaryCard` (new in 1b) |
| `form_input` | `FormInputCard` (new in 1c, human_input step) |

#### MessageInput:

```
┌──────────────────────────────────────────────────────────────┐
│  Type a message…                                    [Send →] │
└──────────────────────────────────────────────────────────────┘
```

- Textarea auto-grows (max 5 lines); Enter submits, Shift+Enter adds newline.
- Disabled while `isTyping === true` or `disabled === true`.
- Send button disabled when input is empty or trimmed to empty.

---

### 5.4 Sidebar Panels

#### 5.4.1 Active Workflows Panel

```
WORKFLOWS
─────────────────────────────────
┌──────────────────────────────┐
│ Leave Request — John Smith   │
│ ████████░░░░  awaiting_appr  │  ← progress bar + state badge
│ Started 5 min ago            │
└──────────────────────────────┘
┌──────────────────────────────┐
│ Employee Onboarding — A. Lee │
│ ████░░░░░░░░  collecting_inf │
│ Started 2 h ago              │
└──────────────────────────────┘
[+ Trigger a Skill]           ← Ghost button → opens skill trigger modal
```

Each workflow row is clickable → opens `WorkflowDetailPage`.

#### 5.4.2 Pending Approvals Panel

```
APPROVALS  [3]
─────────────────────────────────
┌──────────────────────────────┐
│ 🔒 Leave Request             │
│ John Smith · 10 days PTO     │
│ Requested by HR Coordinator  │
│ [Reject] [Approve]           │  ← inline quick-action buttons
└──────────────────────────────┘
```

Quick approve/reject in the panel; a "View Details" link opens the full `ApprovalCard` in chat.

#### 5.4.3 Recent Entities Panel

```
ENTITIES
─────────────────────────────────
Employees            [+]
  ○ Alice Johnson    Apr 3
  ○ Bob Martinez     Mar 28
  ○ Carol White      Mar 15
  [See all 42 →]

Departments          [+]
  ○ Engineering
  ○ Finance
  [See all 8 →]
```

Clicking an entity name inserts a reference into the chat input (or opens an EntityDetailModal).

---

### 5.5 SchemaBuilderPage

**Path:** `/admin/schema`  
**Role:** `tenant_admin+`

```
┌──────────────────────────────────────────────────────────────────┐
│  Schema Builder                                    [+ Add Field] │
│  Extend entity schemas with tenant-specific fields               │
├──────────────────────────────────────────────────────────────────┤
│  [Employee ▼]  (entity selector tabs)                            │
├────────────────────────┬─────────────────────────────────────────┤
│  PLATFORM FIELDS       │  TENANT FIELDS                          │
│  (read-only, gray bg)  │  (editable)                             │
│                        │                                         │
│  id            uuid    │  ┌─────────────────────────────────┐   │
│  tenant_id     uuid    │  │ employee_number   string  [Edit] │   │
│  first_name    string  │  │ department_code   string  [Edit] │   │
│  last_name     string  │  │ cost_center       number  [Edit] │   │
│  email         string  │  │ start_date        date    [Edit] │   │
│  role          string  │  │                                  │   │
│  created_at    ts      │  │ [+ Add another field]            │   │
│                        │  └─────────────────────────────────┘   │
└────────────────────────┴─────────────────────────────────────────┘
```

#### Add / Edit Field Drawer (slides in from right, z-30):

```
┌─────────────────────────────────────────┐
│  Add Tenant Field               [✕]    │
├─────────────────────────────────────────┤
│  Field Name *                           │
│  [employee_number              ]        │
│  Letters, numbers, underscores only     │
│                                         │
│  Display Label *                        │
│  [Employee Number              ]        │
│                                         │
│  Data Type *                            │
│  [string ▼]  string / number /          │
│              boolean / date / enum      │
│                                         │
│  (if enum)                              │
│  Allowed Values                         │
│  [active, inactive, on_leave    ] [+]   │
│                                         │
│  Required?  [● Yes  ○ No]               │
│                                         │
│  PII?       [○ Yes  ● No]               │
│  ℹ Marking as PII encrypts this         │
│    field at rest and applies GDPR       │
│    erasure rules.                       │
│                                         │
│  [Cancel]           [Save Field →]      │
└─────────────────────────────────────────┘
```

**Conflict (409) state:** if a field name already exists, the "Field Name" input shows the red error border + "A field with this name already exists. To change it, use Edit."

**Validation rules (client-side before POST):**
- `name`: `/^[a-z][a-z0-9_]*$/` — enforce on blur, not on keypress.
- `type`: required select.
- `enum` values: non-empty array if type is `enum`.

---

### 5.6 SkillsListPage

**Path:** `/admin/skills`  
**Role:** `tenant_admin+`

```
┌──────────────────────────────────────────────────────────────────┐
│  Skills                                         [+ New Skill]   │
│  Define and manage your automated workflows                      │
├──────────────────────────────────────────────────────────────────┤
│  [All ▼]  [live] [draft] [archived]    [Search skills…]         │
├──────────────────────────────────────────────────────────────────┤
│ NAME                  LIFECYCLE    LAST COMPILED   ACTIONS       │
│ ─────────────────────────────────────────────────────────────── │
│ Leave Request         [live]       2 h ago         [⋯]          │
│   Fork of: Default · v3                                         │
│ Employee Onboarding   [validated]  4 h ago         [⋯]          │
│ Expense Report        [draft]      —               [⋯]          │
├──────────────────────────────────────────────────────────────────┤
│  DEFAULT SKILLS  (platform-provided)                             │
│ Leave Request         [default]    —               [Fork →]     │
│ Employee Onboarding   [default]    —               [Fork →]     │
└──────────────────────────────────────────────────────────────────┘
```

Row action menu `[⋯]` items:
- Edit → `/admin/skills/:id`
- Compile → `/admin/skills/:id/compile`
- Publish (if `validated`) → confirmation modal
- Rollback (if `live` and `previous_compilation_id` exists) → confirmation modal
- Archive → confirmation modal

---

### 5.7 SkillEditorPage

**Path:** `/admin/skills/:id` or `/admin/skills/new`  
**Role:** `tenant_admin+`

This is the most complex screen. It has three panels: authoring (left), compilation status (center), and visual validation (right).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Skills   Leave Request                 [draft]       [Compile ▶]        │
├──────────────────┬──────────────────────────┬───────────────────────────────┤
│  SKILL TEXT      │  COMPILATION             │  FLOW GRAPH                  │
│  (w-1/3)         │  (w-1/3)                 │  (w-1/3)                     │
│                  │                          │                              │
│  Name            │  ○ Idle                  │  ┌───────────────────────┐  │
│  [Leave Request] │  ● Compiling…            │  │   React Flow canvas   │  │
│                  │  ◉ Success               │  │                       │  │
│  Description     │  ✕ Error                 │  │  [start] → [collect]  │  │
│  [A workflow for │                          │  │    → [human_input]    │  │
│   submitting...] │  Tokens found (5)        │  │    → [entity_tool]    │  │
│                  │  ✓ @entity:Employee      │  │    → [notify]         │  │
│  Skill Text *    │  ✓ @entity:LeaveReq      │  │    → [end]            │  │
│  ┌────────────┐  │  ✓ @tool:create_leave   │  │                       │  │
│  │ When an    │  │  ✓ @role:manager         │  └───────────────────────┘  │
│  │ employee   │  │  ✓ @agent:hr_agent       │                              │
│  │ requests   │  │                          │  ◉ Visual mode               │
│  │ leave,     │  │  Warnings (1)            │  ○ Edit mode (FlowEditor)    │
│  │ collect    │  │  ⚠ Step 3 collects PII  │                              │
│  │ @entity:   │  │    consider adding a     │                              │
│  │ Employee   │  │    pii_safe tool         │                              │
│  │ data...    │  │                          │                              │
│  └────────────┘  │  Stages                  │                              │
│                  │  ✓ parse                 │                              │
│  Token hint:     │  ✓ resolve               │                              │
│  Type @ for      │  ✓ cache                 │                              │
│  tokens          │  ✓ llm_compile           │                              │
│                  │  ✓ structural_validate   │                              │
│                  │  ✓ data_flow_validate    │                              │
│                  │  ✓ generate_flow         │                              │
│                  │  ✓ output                │                              │
│                  │                          │                              │
│                  │  Hash: a3f9e2b1...       │                              │
│                  │  From cache: No          │                              │
│                  │  Duration: 4.2 s         │                              │
└──────────────────┴──────────────────────────┴───────────────────────────────┘
│  [Save Draft]                                           [Validate →]       │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Skill Text Editor:

- `<textarea>` with monospace font, syntax-highlighting via simple token regex coloring:
  - `@entity:*` → indigo-700 bold
  - `@tool:*` → green-700 bold
  - `@role:*` → amber-700 bold
  - `@agent:*` → purple-700 bold
  - `@field:*` → blue-700 bold
- **Token autocomplete:** triggered on `@`, shows a dropdown of valid tokens from `/admin/skills/tokens/resolve`. Keyboard-navigable list; selecting inserts the full token.

```
  collect @|
            ┌───────────────────────┐
            │ @entity:Employee      │  ← highlighted item
            │ @entity:Department    │
            │ @entity:LeaveRequest  │
            │ @tool:create_leave    │
            │ @tool:send_email      │
            └───────────────────────┘
```

#### Token autocomplete dropdown:

```
position:   absolute z-20, below cursor
width:      min-w-[240px]
item:       flex items-center gap-2 px-3 py-2 text-sm hover:bg-indigo-50
            [colored kind badge] token_name · description
active:     bg-indigo-50 text-indigo-700
```

#### Compilation progress (center panel):

Real-time: the `POST /admin/skills/compile` response is streamed via SSE. Each stage completion updates the stage list immediately.

Stage states:
- `pending` → `text-gray-300 ○`
- `running` → `text-indigo-500 ● animate-pulse`
- `done` → `text-green-600 ✓`
- `error` → `text-red-600 ✕` + expand to show error detail inline

Compilation error expandable detail:
```
  ✕ structural_validate
    ┌──────────────────────────────────────────┐
    │ Error: Unknown step type "approve_leave" │
    │ at node index 2 (step: collect info)     │
    │                                          │
    │ Valid step types: collect, enrich,       │
    │ entity_tool, notify, start_agent,        │
    │ condition, human_input, end              │
    └──────────────────────────────────────────┘
```

#### Flow Graph (right panel):

- Uses `reactflow` to render the compiled LangGraph definition as a directed graph.
- Nodes are color-coded by `step_type`:

| Step type | Node color |
|-----------|-----------|
| `collect` | blue-100 border-blue-400 |
| `enrich` | purple-100 border-purple-400 |
| `entity_tool` | green-100 border-green-400 |
| `notify` | indigo-100 border-indigo-400 |
| `start_agent` | amber-100 border-amber-400 |
| `condition` | yellow-100 border-yellow-400 |
| `human_input` | red-100 border-red-400 |
| `end` | gray-100 border-gray-400 |

- Hovering a node shows a tooltip with its full config (tool name, agent name, etc.).
- **Edit mode (FlowEditor):** Toggling to "Edit mode" enables drag-to-reorder and node config panels. This is the Phase 1b fallback if compilation success rate < 90%.

#### Lifecycle action bar (bottom):

```
[draft]     → [Save Draft]                           [Compile ▶]
[compiled]  → [Save Draft]              [Compile ▶]  [Validate →]
[validated] → [Save Draft]  [Rollback]  [Compile ▶]  [Publish →]
[live]      → [Save Draft]  [Rollback]  [Compile ▶]  [Archive]
```

**Publish confirmation modal:**
```
┌───────────────────────────────────────────────┐
│  Publish "Leave Request" v3?                  │
│                                               │
│  This skill will become available for         │
│  operators to trigger. Any currently          │
│  live version will be archived.               │
│                                               │
│  Compilation hash: a3f9e2b1...               │
│  Validated: 2 min ago                         │
│                                               │
│  [Cancel]              [Publish →]            │
└───────────────────────────────────────────────┘
```

**Rollback confirmation modal:**
```
┌───────────────────────────────────────────────┐
│  Rollback to v2?                              │
│                                               │
│  The live skill will revert to the previous   │
│  compilation. In-flight executions on v3      │
│  will complete on v3 — they are not affected. │
│                                               │
│  [Cancel]              [Rollback to v2 →]     │
└───────────────────────────────────────────────┘
```

---

### 5.8 WorkflowsPage

**Path:** `/workflows`  
**Role:** All authenticated

```
┌──────────────────────────────────────────────────────────────────┐
│  Workflows                                                       │
│  Active and recent skill executions                              │
├───────────────────┬──────────────────────────────────────────────┤
│  [All ▼]          │  [Leave Requests ▼]                          │
│  Filter by state  │  Filter by skill                             │
├───────────────────┴──────────────────────────────────────────────┤
│  ID         SKILL               STATE           STARTED    ACTOR │
│  ─────────────────────────────────────────────────────────────── │
│  wf-1234    Leave Request       [awaiting_appr] 10 min ago  You  │
│  wf-1233    Employee Onboarding [completed]     2 h ago     HR   │
│  wf-1230    Leave Request       [error]         Yesterday   You  │
└──────────────────────────────────────────────────────────────────┘
```

Clicking a row → `WorkflowDetailPage`.

---

### 5.9 WorkflowDetailPage

**Path:** `/workflows/:id`  
**Role:** All authenticated

```
┌──────────────────────────────────────────────────────────────────┐
│  ← Workflows   Leave Request — John Smith                        │
│  wf-1234 · Started 10 min ago · [awaiting_approval]              │
├─────────────────────────────────────┬────────────────────────────┤
│  EXECUTION TIMELINE                 │  CURRENT STEP              │
│                                     │                            │
│  ✓ initiated          10:24         │  ┌────────────────────┐   │
│  ✓ collecting_info    10:24         │  │ 🔒 Approval         │   │
│  ✓ validating         10:25         │  │ Required           │   │
│  ● awaiting_approval  10:26 →now    │  │                    │   │
│  ○ approved           —             │  │ Requested by:       │   │
│  ○ completed          —             │  │ John Smith          │   │
│                                     │  │                    │   │
│                                     │  │ Leave: 10 days     │   │
│                                     │  │ Dates: Apr 1–14    │   │
│                                     │  │ Policy: Standard   │   │
│                                     │  │                    │   │
│                                     │  │ [Reject][Approve]  │   │
│                                     │  └────────────────────┘   │
│                                     │                            │
│  [Cancel Workflow]                  │                            │
└─────────────────────────────────────┴────────────────────────────┘
```

Real-time: state transitions update the timeline live via WebSocket subscription. The current step panel swaps to `FormInputCard` when `step_type === human_input` and the current user is the expected actor.

---

### 5.10 AuditLogPage

**Path:** `/audit`  
**Role:** `tenant_admin+`

```
┌──────────────────────────────────────────────────────────────────┐
│  Audit Log                                   [Export CSV ↓]     │
│                                                                  │
│  [Date range ▼]  [Actor ▼]  [Entity ▼]  [Action ▼]  [Search]   │
├──────────────────────────────────────────────────────────────────┤
│  TIME             ACTOR           ACTION              ENTITY     │
│  ─────────────────────────────────────────────────────────────── │
│  10:26:03 today   hr@acme.com     skill_execute       Leave Req  │
│  10:25:58 today   hr@acme.com     entity_update       Employee   │
│  10:24:01 today   system          skill_compile       Leave Req  │
│  Yesterday 15:00  admin@acme.com  schema_field_add    Employee   │
├──────────────────────────────────────────────────────────────────┤
│                          [← Prev]  [1] [2] [3]  [Next →]        │
└──────────────────────────────────────────────────────────────────┘
```

Row expand (click): shows the full diff / context JSON in a collapsible `<pre>` block with `font-mono text-xs`.

---

## 6. New Card Components (Phase 1b+)

### 6.1 EntitySummaryCard

Rendered in chat when the agent surfaces an entity record.

```
┌─────────────────────────────────────────┐
│  [User icon] John Smith · Employee      │
│  ─────────────────────────────────────  │
│  Email        john@acme.com             │
│  Department   Engineering               │
│  Start Date   2024-01-15                │
│  Leave Balance 12 days                  │
│                                         │
│  [View Full Record →]                   │
└─────────────────────────────────────────┘
```

### 6.2 FormInputCard

Rendered in chat at a `human_input` step. Provides the form fields defined by the step's `collect` config.

```
┌─────────────────────────────────────────┐
│  📝 Leave Request Details              │
│  ─────────────────────────────────────  │
│  Leave Type *                           │
│  [Annual Leave ▼]                       │
│                                         │
│  Start Date *    End Date *             │
│  [2026-04-01]    [2026-04-14]          │
│                                         │
│  Reason (optional)                      │
│  [Family vacation              ]        │
│                                         │
│  [Submit →]                             │
└─────────────────────────────────────────┘
```

Fields are driven by the `collect_fields` array in the IR node config. `react-hook-form` + Zod validation; types (`string`, `date`, `number`, `enum`, `boolean`) map to the appropriate input component.

---

## 7. Interaction Patterns

### 7.1 Real-Time State Updates

All execution state updates arrive over WebSocket (`socket.io-client`). The `conversation.store` handles:

```typescript
socket.on('execution:state_change', (event: ExecutionStateEvent) => {
  // Update the relevant workflow in the store
  // If the current chat has an embedded WorkflowStatusCard for this execution,
  // it re-renders via the updated Zustand slice
});
```

Visual pattern: when a state badge transitions, it briefly flashes `animate-pulse` for 800 ms to draw attention without jarring the user.

### 7.2 Optimistic Updates

Approve and Reject actions in `ApprovalCard` are optimistic:

1. Button switches to loading spinner immediately.
2. The card's state badge updates to `approved` or `rejected`.
3. If the API call fails, the card rolls back with an inline error message below the buttons.

### 7.3 Compilation Progress

`POST /admin/skills/compile` opens an SSE stream. The center panel of `SkillEditorPage` subscribes to the stream events and updates each stage row in real time.

### 7.4 Confirmation Dialogs

Destructive actions (publish, rollback, archive, cancel workflow) always open a `<Modal>` with:
- Title: concise description of what will happen.
- Body: explicit impact statement (what changes, what is not affected).
- Buttons: `[Cancel]` (secondary) + `[Confirm Action →]` (primary or danger).

Never use `window.confirm()`.

### 7.5 Token Autocomplete in Skill Editor

Triggered when the user types `@` in the skill text textarea.

```typescript
// On keyup in textarea:
const trigger = getTextBehindCursor(textarea); // returns text after last @
if (trigger !== null) {
  fetchTokenSuggestions(trigger); // debounced 200ms, calls /admin/skills/tokens/resolve
  showDropdown(suggestions);
} else {
  hideDropdown();
}
```

Keyboard navigation: `ArrowUp/Down` to navigate, `Enter` or `Tab` to select, `Escape` to dismiss.

---

## 8. Responsive Behavior

Phase 1 targets desktop-first (min-width: 1024px). The sidebar collapses automatically on viewport widths below 1280px.

| Breakpoint | Sidebar | Main panel |
|------------|---------|-----------|
| `>= 1280px` | Expanded (288px) | Full |
| `1024–1279px` | Collapsed (56px) | Full |
| `< 1024px` | Hidden (hamburger toggle) | Full |

The `SkillEditorPage` three-panel layout stacks vertically on widths < 1280px:
- < 1280px: left panel full width, center and right in 50/50 row below.
- < 1024px: all three panels stack vertically; right panel hidden by default (toggle button reveals it).

Mobile support is Phase 2 (PWA). Do not invest in deep mobile breakpoints in Phase 1.

---

## 9. Accessibility

Minimum requirements for Phase 1:

- All interactive elements are keyboard-reachable (natural tab order; no positive `tabindex`).
- All icon-only buttons have `title` and `aria-label`.
- All form inputs are associated with `<label>` elements (htmlFor / id pairing).
- Error messages are linked to inputs via `aria-describedby`.
- Modal dialogs trap focus (`focus-trap-react` or equivalent) and restore focus on close.
- Live regions: execution state changes in `WorkflowStatusCard` are announced via `aria-live="polite"`.
- Color is never the only indicator: state badges use both color and text/icon.
- Minimum contrast ratio: 4.5:1 for body text, 3:1 for large text (WCAG AA).

---

## 10. Error States

### 10.1 API Errors

All API errors surface via the toast system. Do not expose raw HTTP status codes or stack traces to the user. Map errors:

| HTTP status | Toast message |
|-------------|--------------|
| 401 | "Your session has expired. Please sign in again." → redirect to `/login` |
| 403 | "You don't have permission to do that." |
| 404 | "That record no longer exists." |
| 409 | Surface inline on the specific field (e.g., schema builder duplicate) |
| 422 | Surface inline validation errors on the form |
| 500 | "Something went wrong on our end. Please try again." |

### 10.2 Compilation Errors

Shown inline in the center panel of `SkillEditorPage`, not as a toast. The exact stage that failed is highlighted red, and the error message explains what to fix in plain language (not a raw validator output).

### 10.3 WebSocket Disconnection

A subtle banner at the top of the main area:

```
┌──────────────────────────────────────────────────────────────────┐
│  ⚠ Reconnecting… Workflow updates may be delayed.    [Dismiss]  │
└──────────────────────────────────────────────────────────────────┘
```

Banner disappears when the socket reconnects. Auto-reconnect is handled by `socket.io-client` with exponential backoff.

---

## 11. File Structure for New UI Components

All new components follow the existing structure in `apps/web/src/`:

```
views/
  admin/
    SchemaBuilder/
      SchemaBuilderPage.tsx        ← page shell
      FieldList.tsx                ← platform + tenant field tables
      AddFieldDrawer.tsx           ← slide-in form
      FieldRow.tsx                 ← single row with edit/delete
    SkillEditor/
      SkillEditorPage.tsx          ← three-panel shell
      SkillTextEditor.tsx          ← textarea + token highlighting
      TokenAutocomplete.tsx        ← dropdown component
      CompilationPanel.tsx         ← stage list + status
      FlowGraphPanel.tsx           ← react-flow canvas + edit toggle
      FlowEditor.tsx               ← drag-and-drop fallback editor
    SkillsList/
      SkillsListPage.tsx
      SkillRow.tsx
      SkillActionMenu.tsx
  cards/
    EntitySummaryCard.tsx          ← new in 1b
    FormInputCard.tsx              ← new in 1c
  workflows/
    WorkflowsPage.tsx
    WorkflowDetailPage.tsx
    ExecutionTimeline.tsx          ← timeline step list
  audit/
    AuditLogPage.tsx
    AuditRow.tsx
  common/
    Modal.tsx
    ConfirmModal.tsx
    Toast.tsx
    ToastProvider.tsx
    Badge.tsx
    EmptyState.tsx
    Skeleton.tsx
    Drawer.tsx                     ← right-side slide-in panel
```

```
stores/
  toast.store.ts                   ← add toast queue
  workflow.store.ts                ← execution state subscriptions

queries/
  useSkills.ts
  useSkillCompile.ts               ← SSE-aware query
  useSchemaFields.ts
  useAuditLog.ts
```

---

## 12. Dependencies to Add

| Package | Purpose |
|---------|---------|
| `reactflow` | Flow graph visualization and FlowEditor |
| `@radix-ui/react-dialog` | Accessible modal primitive |
| `@radix-ui/react-select` | Accessible select / dropdown |
| `@radix-ui/react-tabs` | Entity selector tabs in Schema Builder |
| `@radix-ui/react-tooltip` | Node hover tooltips in flow graph |
| `focus-trap-react` | Modal focus trap |
| `date-fns` | Already installed — date formatting in audit log |

Avoid adding a full component library (e.g., shadcn, MUI, Chakra). The existing Tailwind + Lucide + Radix primitives stack is sufficient and keeps the bundle lean.

---

## 13. Phase Delivery Map

| Screen / Component | Phase |
|-------------------|-------|
| LoginPage | 1a ✅ |
| AppLayout (shell + 4 nav items) | 1a ✅ |
| ChatSurface + MessageBubble + MessageInput | 1a ✅ |
| WorkflowStatusCard + ApprovalCard + ActionCard + BroadcastCard | 1a ✅ |
| Sidebar: ActiveWorkflows + PendingApprovals + RecentEntities | 1a ✅ |
| SchemaBuilderPage + AddFieldDrawer | 1b |
| SkillsListPage + SkillRow | 1b |
| SkillEditorPage (text editor + token autocomplete + compilation panel + flow graph) | 1b |
| FlowEditor (drag-and-drop fallback) | 1b |
| EntitySummaryCard | 1b |
| Admin nav items in sidebar | 1b |
| Toast system + ConfirmModal + Drawer primitives | 1b |
| WorkflowsPage + WorkflowDetailPage + ExecutionTimeline | 1c |
| FormInputCard (human_input step) | 1c |
| Skill lifecycle controls (validate / publish / rollback buttons + modals) | 1c |
| AuditLogPage + AuditRow + export | 1d |
| Notification / alerts panel (sidebar) | 1d |
