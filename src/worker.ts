/**
 * Nexus Governance Plugin Worker
 *
 * This is the main plugin logic. It hooks into Paperclip's event system
 * to intercept issues before they are executed by agent runtimes, routes
 * them through Nexus's governance review pipeline, and reports the results
 * back as issue comments and approval decisions.
 *
 * Two operating modes:
 *
 * 1. Connected Mode: A running Nexus instance handles the full multi-agent
 *    review (CISO, QA, SRE, Product, Design agents deliberate). The plugin
 *    triggers the review via Nexus's REST API and polls for results.
 *
 * 2. Standalone Mode: No Nexus instance required. The plugin uses Paperclip's
 *    built-in agent invocation to run a simplified governance review prompt
 *    through whatever LLM the company has configured.
 */

import { definePlugin, runWorker } from '@paperclipai/plugin-sdk';
import { NexusClient } from './nexus-client.js';
import type {
  NexusConfig,
  ReviewRequest,
  ReviewState,
  GovernanceReview,
} from './types.js';

const PLUGIN_ID = 'permaship.nexus-governance';
const STATE_PREFIX = 'review:';

export default definePlugin({
  async setup(ctx) {
    ctx.logger.info('Nexus Governance plugin initializing');

    // Load configuration
    const config = await loadConfig(ctx);
    const isConnected = config !== null;
    let client: NexusClient | null = null;

    if (isConnected) {
      client = new NexusClient(config);
      const health = await client.healthCheck();
      if (health.ok) {
        ctx.logger.info('Connected to Nexus instance at %s', config.nexusUrl);
      } else {
        ctx.logger.warn(
          'Nexus unreachable at %s (%s). Falling back to standalone mode.',
          config.nexusUrl,
          health.error
        );
      }
    } else {
      ctx.logger.info('No Nexus URL configured. Running in standalone mode.');
    }

    // Subscribe to issue creation events
    ctx.events.on('issue.created', async (data: IssueEvent) => {
      ctx.logger.info('New issue detected: %s (%s)', data.issue.title, data.issue.id);
      await handleIssueReview(ctx, client, data);
    });

    // Subscribe to issue assignment events
    ctx.events.on('issue.assigned', async (data: IssueEvent) => {
      // Only review if not already reviewed
      const existing = await ctx.state.get(`${STATE_PREFIX}${data.issue.id}`);
      if (existing) {
        ctx.logger.info('Issue %s already reviewed, skipping', data.issue.id);
        return;
      }
      ctx.logger.info('Issue assigned: %s (%s)', data.issue.title, data.issue.id);
      await handleIssueReview(ctx, client, data);
    });

    // Register a tool that agents can call to request governance review
    ctx.tools.register('nexus-review', {
      description:
        'Request a governance review from Nexus specialist agents (Security, QA, SRE, Product). ' +
        'Returns a structured verdict with approve/flag/block decisions from each specialist.',
      parameters: {
        type: 'object',
        properties: {
          issueId: { type: 'string', description: 'The Paperclip issue ID to review' },
          reason: { type: 'string', description: 'Why this issue needs review' },
        },
        required: ['issueId'],
      },
      handler: async (params: { issueId: string; reason?: string }) => {
        const issues = await ctx.issues.list({ id: params.issueId });
        if (!issues || issues.length === 0) {
          return { error: `Issue ${params.issueId} not found` };
        }
        const issue = issues[0];
        const review = await runReview(ctx, client, {
          issueId: issue.id,
          issueTitle: issue.title,
          issueBody: issue.description ?? '',
          assigneeAgent: issue.assigneeAgentId ?? undefined,
          companyId: issue.companyId,
        });
        return review ?? { error: 'Review failed or timed out' };
      },
    });

    ctx.logger.info(
      'Nexus Governance plugin ready (mode: %s)',
      isConnected ? 'connected' : 'standalone'
    );
  },

  async onHealth() {
    return { status: 'ok', message: 'Nexus Governance plugin operational' };
  },

  async onConfigChanged(config: Record<string, unknown>) {
    // Config changes are picked up on next event; no hot-reload needed
    return;
  },
});

// ---- Core review logic ----

interface IssueEvent {
  issue: {
    id: string;
    title: string;
    description?: string;
    assigneeAgentId?: string;
    companyId: string;
    goalId?: string;
    status?: string;
  };
}

type PluginContext = Parameters<Parameters<typeof definePlugin>[0]['setup']>[0];

async function handleIssueReview(
  ctx: PluginContext,
  client: NexusClient | null,
  data: IssueEvent
) {
  const { issue } = data;

  // Skip issues that are already done or in review
  if (issue.status === 'done') return;

  const request: ReviewRequest = {
    issueId: issue.id,
    issueTitle: issue.title,
    issueBody: issue.description ?? '',
    assigneeAgent: issue.assigneeAgentId ?? undefined,
    goalId: issue.goalId ?? undefined,
    companyId: issue.companyId,
  };

  // Mark review as started
  const state: ReviewState = {
    issueId: issue.id,
    status: 'in-review',
    startedAt: new Date().toISOString(),
  };
  await ctx.state.set(`${STATE_PREFIX}${issue.id}`, state);

  // Run the review
  const review = await runReview(ctx, client, request);

  if (review) {
    // Store completed review
    const completedState: ReviewState = {
      ...state,
      status: 'completed',
      review,
      completedAt: new Date().toISOString(),
    };
    await ctx.state.set(`${STATE_PREFIX}${issue.id}`, completedState);

    // Post review as issue comment
    await postReviewComment(ctx, review);

    // Track metrics
    await ctx.metrics.write('nexus.reviews.completed', 1, {
      decision: review.decision,
    });
    await ctx.metrics.write('nexus.reviews.duration_ms', review.reviewDurationMs, {});
  } else {
    // Mark as error
    await ctx.state.set(`${STATE_PREFIX}${issue.id}`, {
      ...state,
      status: 'error',
      error: 'Review returned no result',
    });
    await ctx.metrics.write('nexus.reviews.errors', 1, {});
  }
}

async function runReview(
  ctx: PluginContext,
  client: NexusClient | null,
  request: ReviewRequest
): Promise<GovernanceReview | null> {
  // Try connected mode first
  if (client) {
    const health = await client.healthCheck();
    if (health.ok) {
      return await runConnectedReview(ctx, client, request);
    }
    ctx.logger.warn('Nexus unreachable, falling back to standalone review');
  }

  // Standalone mode
  return await runStandaloneReview(ctx, request);
}

async function runConnectedReview(
  ctx: PluginContext,
  client: NexusClient,
  request: ReviewRequest
): Promise<GovernanceReview | null> {
  const { triggered, error } = await client.triggerReview(request);
  if (!triggered) {
    ctx.logger.error('Failed to trigger Nexus review: %s', error);
    return null;
  }

  ctx.logger.info('Nexus review triggered for issue %s, polling for results...', request.issueId);

  return await client.waitForReview(request.issueId, (msg) => {
    ctx.logger.info(msg);
  });
}

async function runStandaloneReview(
  ctx: PluginContext,
  request: ReviewRequest
): Promise<GovernanceReview | null> {
  ctx.logger.info('Running standalone governance review for issue %s', request.issueId);
  const start = Date.now();

  try {
    // Use Paperclip's agent invocation to run the review prompt
    const prompt = NexusClient.buildStandaloneReviewPrompt(request);

    // Create a chat session with an agent to run the review
    const agents = await ctx.agents.list();
    if (!agents || agents.length === 0) {
      ctx.logger.error('No agents available for standalone review');
      return null;
    }

    // Prefer an agent with "review" or "qa" in the name, otherwise use the first available
    const reviewAgent =
      agents.find(
        (a: { name: string }) =>
          a.name.toLowerCase().includes('review') ||
          a.name.toLowerCase().includes('qa') ||
          a.name.toLowerCase().includes('governance')
      ) ?? agents[0];

    const session = await ctx.agents.createChatSession({
      agentId: reviewAgent.id,
      initialMessage: prompt,
    });

    if (!session || !session.response) {
      ctx.logger.error('Standalone review returned no response');
      return null;
    }

    const duration = Date.now() - start;
    return NexusClient.parseStandaloneResponse(
      request.issueId,
      request.issueTitle,
      session.response,
      duration
    );
  } catch (err) {
    ctx.logger.error(
      'Standalone review failed: %s',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

// ---- Output formatting ----

async function postReviewComment(ctx: PluginContext, review: GovernanceReview) {
  const icon =
    review.decision === 'approved'
      ? '[APPROVED]'
      : review.decision === 'needs-revision'
        ? '[NEEDS REVISION]'
        : '[BLOCKED]';

  const verdictLines = review.verdicts
    .map((v) => {
      const badge =
        v.decision === 'approve'
          ? 'PASS'
          : v.decision === 'flag'
            ? 'FLAG'
            : 'BLOCK';
      const suggestions =
        v.suggestions && v.suggestions.length > 0
          ? `\n  Suggestions: ${v.suggestions.join('; ')}`
          : '';
      return `- ${badge} [${v.specialist}] (${v.severity}): ${v.reasoning}${suggestions}`;
    })
    .join('\n');

  const comment = `## Nexus Governance Review ${icon}

${review.summary}

### Specialist Verdicts
${verdictLines}

*Reviewed in ${Math.round(review.reviewDurationMs / 1000)}s by Nexus (permaship.ai)*`;

  try {
    await ctx.issues.addComment({
      issueId: review.issueId,
      content: comment,
      author: PLUGIN_ID,
    });
  } catch (err) {
    ctx.logger.error(
      'Failed to post review comment: %s',
      err instanceof Error ? err.message : String(err)
    );
  }
}

// ---- Configuration loading ----

async function loadConfig(ctx: PluginContext): Promise<NexusConfig | null> {
  try {
    const nexusUrl = await ctx.state.get('config:nexusUrl');
    const internalSecret = await ctx.state.get('config:internalSecret');

    if (!nexusUrl || !internalSecret) return null;

    const activeSpecialists = await ctx.state.get('config:activeSpecialists');
    const autoApprove = await ctx.state.get('config:autoApproveOnConsensus');
    const timeout = await ctx.state.get('config:reviewTimeoutMs');

    return {
      nexusUrl: nexusUrl as string,
      internalSecret: internalSecret as string,
      activeSpecialists: activeSpecialists as NexusConfig['activeSpecialists'],
      autoApproveOnConsensus: autoApprove as boolean | undefined,
      reviewTimeoutMs: timeout as number | undefined,
    };
  } catch {
    return null;
  }
}

runWorker(import.meta);
