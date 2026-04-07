# PaperShip

The integration layer between [Paperclip](https://github.com/nicepkg/paperclip) and [PermaShip](https://permaship.ai). Connects Paperclip's agent orchestration to PermaShip's governed engineering execution, and provides Nexus adapter profiles so Nexus can talk to Paperclip natively.

## What This Does

PaperShip has two halves:

**1. The Bridge** (`src/`) receives work from Paperclip agents, translates it into PermaShip tickets, and reports results back when execution completes. It also runs background services that keep the two systems in sync.

**2. The Adapters** (`src/adapters/`) let Nexus use Paperclip as its ticket tracker, project registry, and tenant resolver directly. Set `ADAPTER_PROFILE=permaship` in Nexus and it talks to Paperclip natively through these adapters.

## Architecture

```
Paperclip                    PaperShip Bridge                PermaShip / Nexus
   |                              |                               |
   |  POST /invoke                |                               |
   |----------------------------->|                               |
   |  202 Accepted                |                               |
   |<-----------------------------|                               |
   |                              |  Create ticket / dispatch     |
   |                              |------------------------------>|
   |                              |                               |
   |                              |      ... work happens ...     |
   |                              |                               |
   |                              |  Webhook: ready_for_review    |
   |                              |<------------------------------|
   |                              |                               |
   |                              |  Review Loop: classify +      |
   |                              |  route to Nexus specialist    |
   |                              |------------------------------>|
   |                              |                               |
   |  Callback: succeeded/failed  |                               |
   |<-----------------------------|                               |
```

## Features

- **Invoke endpoint** that receives Paperclip HTTP adapter calls and creates PermaShip tickets
- **Webhook handler** with HMAC-SHA256 signature verification for PermaShip events
- **Bearer token auth** on the /invoke route
- **Bidirectional status sync** between Paperclip issues and PermaShip tickets
- **Review loop** that polls completed heartbeat runs, classifies them by domain (security, reliability, quality, cost, UX), and routes to the appropriate Nexus specialist agent
- **Retry scheduler** with exponential backoff for failed callbacks
- **Stall detector** that finds stuck heartbeat runs (>30 min) and resets them
- **Nexus adapter profile** (`src/adapters/`) for native Paperclip integration
- **Secret redaction** utility for scrubbing API keys from logs

## Setup

```bash
npm install
cp .env.example .env
# Fill in your values
npm run dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3100) |
| `PAPERCLIP_BASE_URL` | Yes | Paperclip instance URL |
| `PAPERCLIP_API_KEY` | Yes | Paperclip API key for callbacks |
| `PERMASHIP_BASE_URL` | Yes | PermaShip API base URL |
| `PERMASHIP_API_KEY` | Yes | PermaShip API key |
| `PERMASHIP_ORG_ID` | Yes | PermaShip organization ID |
| `PERMASHIP_PROJECT_ID` | Yes | PermaShip project ID |
| `PERMASHIP_REPO_KEY` | Yes | Target repository (e.g. `acme/backend`) |
| `PERMASHIP_WEBHOOK_SECRET` | No | Webhook signature verification secret |

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled output |
| `npm test` | Run test suite (78 tests) |

## Project Structure

```
src/
  adapters/           Nexus adapter profile (ADAPTER_PROFILE=permaship)
    index.ts            Entry point: loadPermashipAdapters()
    llm-provider.ts     Anthropic LLM provider
    project-registry.ts Paperclip project registry adapter
    ticket-tracker.ts   Paperclip ticket tracker adapter
    tenant-resolver.ts  Tenant resolver adapter
    redact-secrets.ts   API key / token redaction utility
    stubs.ts            No-op adapters for unused interfaces
    types.ts            AdapterSet type definitions
  clients/            API clients for Paperclip and PermaShip
  review-loop/        Post-execution governance review pipeline
    index.ts            Main loop: poll, classify, route
    classifier.ts       Domain classifier (security/reliability/quality/cost/UX)
    router.ts           Maps domains to Nexus specialist agents
    nexus-client.ts     Posts review requests to Nexus chat API
    watermark.ts        Tracks last-processed timestamp
  routes/             Express route handlers
  services/           Core business logic
    invokeService.ts    Translates Paperclip invocations to PermaShip tickets
    callbackService.ts  Sends completion callbacks to Paperclip
    webhookService.ts   Processes PermaShip webhook events + bidirectional sync
    retryScheduler.ts   Exponential backoff retry for failed callbacks
    stallDetector.ts    Detects and resets stuck heartbeat runs
  store/              Local JSON persistence for run-to-ticket mappings
tests/                78 tests across 8 files
```

## Using the Nexus Adapters

To run Nexus with Paperclip as the backend:

```bash
# In your Nexus .env
ADAPTER_PROFILE=permaship
PERMASHIP_API_URL=http://127.0.0.1:3100
PERMASHIP_API_KEY=your-agent-jwt
PERMASHIP_ORG_ID=your-paperclip-company-id
LLM_API_KEY=your-anthropic-key
```

This replaces Nexus's default adapters with Paperclip-backed implementations for ticket tracking, project registry, and tenant resolution.

## Paperclip HTTP Adapter Configuration

Configure a Paperclip agent to use the bridge:

```json
{
  "adapterType": "http",
  "adapterConfig": {
    "url": "http://localhost:3100/invoke",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer your-api-key"
    },
    "timeoutMs": 10000
  }
}
```

The adapter uses the async `202 Accepted` + callback model. Do not increase the timeout to wait for completion.

## License

MIT
