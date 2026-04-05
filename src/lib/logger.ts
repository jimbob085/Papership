type LogLevel = "info" | "warn" | "error" | "debug";

interface LogContext {
  paperclipRunId?: string;
  permashipTicketId?: string;
  [key: string]: unknown;
}

function formatEntry(level: LogLevel, message: string, context?: LogContext): string {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "paperclip-permaship-bridge",
    message,
    ...context,
  };
  return JSON.stringify(entry);
}

export const logger = {
  info(message: string, context?: LogContext) {
    console.log(formatEntry("info", message, context));
  },
  warn(message: string, context?: LogContext) {
    console.warn(formatEntry("warn", message, context));
  },
  error(message: string, context?: LogContext) {
    console.error(formatEntry("error", message, context));
  },
  debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV === "development") {
      console.debug(formatEntry("debug", message, context));
    }
  },
};
