# paperclip-permaship-bridge

An external bridge service that connects **Paperclip** HTTP adapter invocations to **PermaShip** governed engineering execution.

This is not a native Paperclip plugin. It is a standalone integration built around Paperclip's async HTTP adapter pattern, translating orchestration decisions into concrete engineering tickets and reporting results back when work completes.

## Why This Exists

Paperclip handles company-level orchestration: deciding what engineering work should happen. PermaShip handles governed engineering execution: turning work into concrete tasks, executing through a coding backend, and reviewing before shipping.

This bridge connects those layers:

1. **Paperclip** decides engineering work should happen
2. **The bridge** translates that into a PermaShip ticket
3. **PermaShip** performs governed execution
4. **The bridge** reports completion status back to Paperclip

## Architecture

```
Paperclip                    Bridge                      PermaShip
   |                           |                            |
   |  POST /invoke             |                            |
   |-------------------------->|                            |
   |  202 Accepted             |                            |
   |<--------------------------|                            |
   |                           |  POST /orgs/.../tickets    |
   |                           |--------------------------->|
   |                           |  201 Created (ticketId)    |
   |                           |<---------------------------|
   |                           |                            |
   |                           |     ... work happens ...   |
   |                           |                            |
   |                           |  POST /webhooks/permaship  |
   |                           |<---------------------------|
   |  POST /api/heartbeat-     |                            |
   |    runs/:runId/callback   |                            |
   |<--------------------------|                            |
```

## End-to-End Sequence

1. Paperclip sends an HTTP adapter request to `POST /invoke` with a `runId` and task context.
2. The bridge returns `202 Accepted` immediately.
3. The bridge maps the Paperclip payload to a PermaShip ticket and creates it via the PermaShip API.
4. The bridge stores a `paperclipRunId <-> permashipTicketId` mapping in a local SQLite database.
5. PermaShip executes the engineering work.
6. PermaShip sends a webhook (`ready_for_review` or `ticket.failed`) to `POST /webhooks/permaship`.
7. The bridge looks up the mapping and calls Paperclip's callback endpoint with `succeeded` or `failed`.

## Setup

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Configure

Copy the environment template and fill in your values:

```bash
cp .env.example .env
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3100) |
| `NODE_ENV` | No | Environment (default: development) |
| `PAPERCLIP_BASE_URL` | Yes | Paperclip instance URL |
| `PAPERCLIP_API_KEY` | Yes | Paperclip API key for callbacks |
| `PERMASHIP_BASE_URL` | Yes | PermaShip API base URL |
| `PERMASHIP_API_KEY` | Yes | PermaShip API key |
| `PERMASHIP_ORG_ID` | Yes | PermaShip organization ID |
| `PERMASHIP_PROJECT_ID` | Yes | PermaShip project ID |
| `PERMASHIP_REPO_KEY` | Yes | Target repository (e.g. `acme/backend`) |
| `PERMASHIP_WEBHOOK_SECRET` | No | Webhook signature verification secret |
| `DEFAULT_TICKET_KIND` | No | Ticket kind (default: `feature`) |
| `DEFAULT_TICKET_PRIORITY` | No | Ticket priority (default: `2`) |

### Run Locally

```bash
# Development with hot reload
npm run dev

# Production
npm run build
npm start
```

### Run Tests

```bash
npm test
```

## API Endpoints

### `POST /invoke`

Receives Paperclip HTTP adapter invocations. Returns `202 Accepted` immediately and processes the ticket creation asynchronously.

**Request body:**

```json
{
  "runId": "run_abc123",
  "agentId": "agent_eng_01",
  "taskId": "task_456",
  "wakeReason": "new_issue",
  "issueIds": ["ISS-101"],
  "context": {
    "title": "Add rate limiting to /api/users endpoint"
  }
}
```

**Response:**

```json
{
  "status": "accepted",
  "runId": "run_abc123"
}
```

### `POST /webhooks/permaship`

Receives PermaShip webhook events. Verifies signature (if secret is configured), looks up the mapping, and sends a callback to Paperclip.

**Request body:**

```json
{
  "event": "ready_for_review",
  "ticketId": "tkt_789",
  "projectId": "proj_example",
  "data": {
    "prUrl": "https://github.com/acme/backend/pull/42"
  }
}
```

### `GET /health`

Returns service health status.

## Paperclip HTTP Adapter Configuration

To configure Paperclip to use this bridge, add an HTTP adapter config like:

```json
{
  "id": "permaship-bridge",
  "name": "PermaShip Bridge",
  "type": "http",
  "config": {
    "url": "http://localhost:3100/invoke",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "timeout": 10000,
    "async": true
  }
}
```

See `examples/sample-paperclip-agent-config.json` for a complete example.

The adapter uses the async `202 Accepted` + callback model. Do not increase the timeout to wait for completion.

## Event Mapping

| PermaShip Event | Paperclip Callback Status | Notes |
|-----------------|--------------------------|-------|
| `ready_for_review` | `succeeded` | Work is complete and ready for human review |
| `ticket.failed` | `failed` | Execution failed; error detail included if available |
| Any other event | No callback | Logged and stored, but no callback sent |

## Data Storage

The bridge uses a local JSON file (`bridge-data.json`) to persist run-to-ticket mappings. Each mapping tracks:

- Paperclip run/task/agent IDs
- PermaShip ticket/project IDs
- Current status and latest event
- Whether a callback has been sent (prevents duplicates)

## Known Limitations

- **Single-instance only.** JSON file storage is local. For multi-instance deployments, swap to Postgres or SQLite.
- **No retry queue.** If a callback to Paperclip fails, it is logged but not retried.
- **Webhook signature verification assumes HMAC-SHA256.** The exact PermaShip signature format should be confirmed against their docs.
- **No authentication on /invoke.** In production, add authentication middleware or deploy behind an API gateway.
- **No idempotency key handling.** Duplicate webhook deliveries are partially handled (callback-sent flag), but could be more robust.

## Future Direction

These are documented for future development but not built in v1:

- Native Paperclip plugin-runtime version (pending Paperclip plugin spec stabilization)
- Richer ticket classification from Paperclip context
- Idempotent retry queue for failed callbacks
- Persistence upgrade to Postgres for multi-instance deployment
- Metrics and distributed tracing
- Nexus-native bridge path
- PR/deployment artifact links back into Paperclip
- Cost accounting passthrough (usage/costUsd fields)
