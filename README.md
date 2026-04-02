# Nexus Governance Plugin for Paperclip

**Who reviews what your agents ship?**

Paperclip orchestrates AI agent teams. Nexus makes sure their work is actually safe to deploy.

This plugin adds a governance layer to Paperclip by routing agent work through specialist reviewers (Security, QA, SRE, Product) before execution. Nothing ships without a verdict.

## What It Does

When a Paperclip issue is created or assigned to an agent, this plugin intercepts it and runs a multi-perspective governance review:

| Specialist | What They Check |
|-----------|----------------|
| **CISO** | Security vulnerabilities, auth concerns, data exposure |
| **QA Manager** | Task clarity, edge cases, acceptance criteria |
| **SRE** | Uptime risk, performance impact, deployment safety |
| **Product** | Goal alignment, scope creep, missing context |
| **Release Eng** | CI/CD impact, rollback readiness |
| **FinOps** | Cost implications, resource usage |

Each specialist returns a verdict: **APPROVE**, **FLAG** (proceed with caution), or **BLOCK** (needs revision). The consolidated result is posted as an issue comment with actionable feedback.

## Two Operating Modes

### Connected Mode (Full Power)
Run alongside a [Nexus](https://github.com/PermaShipAI/nexus) instance for the complete multi-agent governance experience. Nexus's specialist agents deliberate independently, argue with each other, and produce nuanced verdicts.

```
Paperclip Issue --> Plugin --> Nexus API --> 8 Specialist Agents --> Verdict --> Issue Comment
```

### Standalone Mode (Zero Setup)
No Nexus instance required. The plugin generates a governance review prompt and runs it through any agent available in your Paperclip company. Simpler than Connected mode, but still catches the big issues.

```
Paperclip Issue --> Plugin --> Review Prompt --> Any Paperclip Agent --> Verdict --> Issue Comment
```

## Quick Start

### Install

```bash
# From your Paperclip installation
paperclip plugin install @permaship/nexus-governance-plugin
```

### Configure (Optional, for Connected Mode)

If you have a running Nexus instance:

```bash
# Set the Nexus API URL and shared secret
paperclip plugin config permaship.nexus-governance set nexusUrl http://localhost:9000
paperclip plugin config permaship.nexus-governance set internalSecret your-shared-secret
```

Without configuration, the plugin runs in Standalone mode automatically.

### Verify

```bash
paperclip plugin health permaship.nexus-governance
```

## Agent Tool

The plugin also registers a `nexus-review` tool that any Paperclip agent can call directly:

```
"I want a governance review on issue #42 before I start implementation."
```

This lets agents self-govern by requesting review before making changes, not just after.

## Configuration Options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `nexusUrl` | string | none | Nexus API base URL (enables Connected mode) |
| `internalSecret` | string | none | Shared secret for Nexus API auth |
| `activeSpecialists` | string[] | all | Which specialists to include in reviews |
| `autoApproveOnConsensus` | boolean | false | Auto-approve when all specialists agree |
| `reviewTimeoutMs` | number | 120000 | Max time to wait for a review (ms) |

## Review Output

Reviews are posted as issue comments with this structure:

```
## Nexus Governance Review [APPROVED]

Overall assessment of the proposed work and key considerations.

### Specialist Verdicts
- PASS [ciso] (info): No security concerns identified.
- FLAG [qa-manager] (warning): Acceptance criteria could be more specific.
- PASS [sre] (info): Low risk to reliability.
- PASS [product-manager] (info): Aligns with current sprint goals.

Reviewed in 12s by Nexus (permaship.ai)
```

## Why Governance Matters

AI agents are productive. They are also confident, fast, and unchecked by default. A coding agent will happily:

- Introduce a SQL injection to ship a feature faster
- Delete a "redundant" error handler that prevents cascading failures
- Refactor a module in a way that breaks three downstream services
- Ship code that works locally but fails under production load

Governance is not bureaucracy. It is the difference between "move fast and break things" and "move fast and catch the things that would break."

## Built With

- [Paperclip Plugin SDK](https://github.com/paperclipai/paperclip) for the plugin framework
- [Nexus](https://github.com/PermaShipAI/nexus) for the full governance engine
- [Permaship.ai](https://permaship.ai) for the hosted autonomous engineering platform

## License

MIT
