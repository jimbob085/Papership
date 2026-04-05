function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export function loadConfig() {
  return {
    port: parseInt(optionalEnv("PORT", "3100"), 10),
    nodeEnv: optionalEnv("NODE_ENV", "development"),

    paperclip: {
      baseUrl: requireEnv("PAPERCLIP_BASE_URL"),
      apiKey: requireEnv("PAPERCLIP_API_KEY"),
    },

    permaship: {
      baseUrl: requireEnv("PERMASHIP_BASE_URL"),
      apiKey: requireEnv("PERMASHIP_API_KEY"),
      orgId: requireEnv("PERMASHIP_ORG_ID"),
      projectId: requireEnv("PERMASHIP_PROJECT_ID"),
      repoKey: requireEnv("PERMASHIP_REPO_KEY"),
      webhookSecret: optionalEnv("PERMASHIP_WEBHOOK_SECRET", ""),
    },

    defaults: {
      ticketKind: optionalEnv("DEFAULT_TICKET_KIND", "feature"),
      ticketPriority: parseInt(optionalEnv("DEFAULT_TICKET_PRIORITY", "2"), 10),
    },
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
