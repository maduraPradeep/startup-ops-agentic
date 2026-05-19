# Project TODO

Remaining tasks to complete the AI-Native Operations Platform. Ordered by priority.

---

## Critical — Core functionality

### 1. Integrate real LLM (Claude/OpenAI) into LangGraph agents
`services/langgraph/main.py`

The `policy_agent_node` and `orchestrator_node` are fully hardcoded — policy always passes, orchestrator just echoes. Replace with actual LLM calls.

- Add `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) to `.env` and `requirements.txt`
- Policy node: prompt the LLM with leave request details + policy rules, parse approve/reject decision
- Orchestrator node: generate natural language responses instead of string templates

---

### 2. Persist LangGraph workflow state to Directus
`services/langgraph/main.py`

`_workflows: Dict[str, Dict] = {}` is in-memory — all state is lost on restart.

- After `invoke_message` / `invoke_action` / `cancel`, write workflow record to Directus
- `GET /workflows/active` and `GET /workflows/:id` should read from Directus, not the dict

---

### 3. Persist conversation messages to Directus
`apps/api/src/controllers/conversation.controller.ts`

The `conversations` table exists and `ConversationModel.findByTenant` queries it, but the WebSocket handler never writes messages. History is lost on page reload.

- After sending to LangGraph and receiving a response, save both the human message and agent response to Directus
- Load existing messages from Directus on WebSocket connect so history is restored

---

## Important — Correctness and completeness

### 4. Add JWT token auto-refresh interceptor to api-client
`apps/web/src/lib/api-client.ts`

`POST /auth/refresh` and `AuthModel.refresh()` exist but the web client has no interceptor. Users silently lose their session.

- Add a response interceptor that catches 401s
- Call `/auth/refresh` with the stored refresh token, update the auth store, retry the original request
- If refresh fails, call `clearAuth()` to log out

---

### 5. Implement audit logging for entity mutations
`apps/api/src/controllers/entity.controller.ts`, `approval.controller.ts`

The `audit_logs` table exists in `init.sql` but nothing writes to it.

- Hook into entity create, update, and action paths
- Each entry: `tenant_id`, `actor` (userId + role), `collection`, `entity_id`, `action`, payload snapshot, timestamp

---

### 6. Feed leave_policies data into LangGraph policy validation
`services/langgraph/main.py`

The `leave_policies` table exists in Directus but `policy_agent_node` ignores it entirely.

- Fetch relevant policies from Directus on each invocation (max days, blackout periods, overlap rules)
- Check: days requested vs max allowed, overlapping approved requests, blackout dates
- Pass results into the LLM prompt or enforce via explicit logic

---

### 7. Add workflow definitions list, edit, and delete UI
`apps/web/src/pages/WorkflowBuilderPage.tsx`

`WorkflowBuilderPage` only creates — no way to view, edit, or delete existing definitions.

- Add a list view fetching `GET /workflows/definitions`
- Each row: name, trigger type, status badge, edit and delete actions
- Delete = PATCH status to `inactive`
- Click to edit pre-fills the existing form

---

## Nice to have — Polish and cleanup

### 8. Wire up real-time notifications in the Alerts sidebar panel
`apps/web/src/controllers/AppController.tsx`

The "Alerts" panel hardcodes `"No new notifications"`.

- Listen to `approval:decided`, `broadcast:new`, `workflow:updated` socket events
- Accumulate entries in a notifications store with timestamps
- Render them in the panel with a dismiss action

---

### 9. Add broadcast send UI to the frontend
`apps/web/src/views/cards/BroadcastCard.tsx` exists, `POST /broadcast` API exists, no trigger UI.

- Add a compose modal or page: title, message, audience (all/department/role), priority, channels
- Wire to a `useBroadcast` mutation calling `POST /api/v1/broadcast`

---

### 10. Write API integration tests for core routes
`apps/api/` — no integration tests exist.

Cover at minimum:
- `POST /auth/login`
- `GET /entities/:collection`
- `POST /entities/:collection`
- `POST /entities/:collection/:id/:action` (approveRequest / rejectRequest)
- `GET /approvals/pending`
- `POST /approvals/:id/decide`
- `POST /workflows/definitions`

Use vitest + `fastify.inject()` or supertest.

---

### 11. Remove or wire up the unused SSE endpoint
`apps/api/src/controllers/conversation.controller.ts` — `GET /conversations/stream/:conversationId`

The frontend uses WebSocket exclusively; SSE is dead code. Either remove it or replace the WebSocket with SSE (simpler for server-push).

---

## Webchat — Feature gaps

### 12. Fix WebSocket authentication (security bug)
`apps/api/src/routes/conversations/index.ts`, `apps/web/src/queries/useConversation.ts`

The `GET /conversations/ws` route has no `preHandler: fastify.authenticate`, so `request.user` and `request.tenantId` are `undefined` inside `handleWebSocket`. The browser `WebSocket` API cannot set custom headers, so the token must be passed as a query param (`?token=...`) and validated manually on the server.

- Pass the JWT as a query param on the WebSocket URL: `ws://localhost:3001/api/v1/conversations/ws?token=<jwt>`
- In the route handler, read `request.query.token`, verify it with `fastify.jwt.verify()`, and populate `request.user` and `request.tenantId` before proceeding
- Reject the connection with a close frame if auth fails

---

### 13. Optimistically append the user's own message to the chat
`apps/web/src/queries/useConversation.ts`

When `sendMessage()` is called, the frontend only calls `ws.send()` — the user's own message is never added to the store. The agent response appears but not what the user typed.

- In `sendMessage`, immediately call `appendMessage()` with a human-typed `Message` object before `ws.send()`
- Use `useAuthStore.getState().user` for the sender fields
- Assign a temporary `id` (`uuidv4()`) and `timestamp: new Date()` locally

---

### 14. Emit `agent:typing` from the API before calling LangGraph
`apps/api/src/controllers/conversation.controller.ts`

The frontend handles `agent:typing` events and shows a typing indicator, but the API never emits them. LangGraph is called synchronously so the indicator never appears.

- Before calling `ConversationModel.sendToAgent()`, emit `agent:typing` via `socket.emit('agent:typing', { agent: 'orchestrator', typing: true })`
- After receiving the response, emit `agent:typing` with `typing: false`
- Requires access to the specific socket for the sending user, or broadcast to `user:<userId>` room

---

### 15. Render `action_card` and `broadcast` message payloads in chat
`apps/web/src/views/chat/MessageBubble.tsx`

`MessageBubble` only handles `workflow_status` and `approval` payload types. The `action_card` and `broadcast` types are defined in `MessageSchema` and their view components exist but are never rendered.

- Add a case for `payload.type === 'action_card'` → render `<ActionCard>` (needs an `ActionController` to dispatch the selected action back to the agent via WebSocket)
- Add a case for `payload.type === 'broadcast'` → render `<BroadcastCard>`
- Handle `broadcast:new` socket events in `useConversationSocket` and append them as messages to the store

---

### 16. Load conversation history on WebSocket connect
`apps/web/src/queries/useConversation.ts`, `apps/api/src/controllers/conversation.controller.ts`

On page reload the message store is empty. `GET /conversations` exists and `ConversationModel.findByTenant` queries Directus, but the frontend never fetches prior messages.

- On WebSocket open, send a `{ type: 'load_history', conversationId }` frame (or fetch via REST `GET /conversations`)
- Server responds with the stored messages for that `conversationId`
- Frontend hydrates the store with the returned messages (depends on task #3 — messages must be persisted first)

---

### 17. Show WebSocket connection error state in the chat UI
`apps/web/src/queries/useConversation.ts`, `apps/web/src/views/chat/ChatSurface.tsx`

If the WebSocket fails to connect or drops, the input is disabled but there is no visible error message. The user sees a blank chat with no explanation.

- Track `connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error'` in `useConversationSocket`
- Pass it down to `ChatSurface` and show a banner or inline message when disconnected
- Attempt reconnect on close (with exponential backoff), update status accordingly

---

### 18. Wire up ActionCard selection to send a follow-up message
`apps/web/src/views/cards/ActionCard.tsx`

`ActionCard` renders selectable options but `onSelect` is never wired to anything — clicking an option does nothing. This is the mechanism for the AI to present choices to the user (e.g., "Which type of leave?").

- Create an `ActionCardController` that receives the selected value and calls `sendMessage(value)` via the WebSocket
- Use `ActionCardController` in `MessageBubble` instead of `ActionCard` directly
- The agent receives the selection as a follow-up user message and continues the workflow

---

### 19. Fix "View Details" dead button on WorkflowStatusCard
`apps/web/src/views/cards/WorkflowStatusCard.tsx`

The "View Details" button has no `onClick` handler and does nothing.

- Add an `onViewDetails?: () => void` prop
- Wire it up in `WorkflowStatusController` to navigate to a workflow detail view or open a modal showing the full `history` array with timestamps and agent notes

---

*Last updated: 2026-05-18*
