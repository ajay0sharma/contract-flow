import * as Sentry from "@sentry/nextjs";

let sentryInitialized = false;

function ensureSentry(): void {
  if (sentryInitialized || !process.env.SENTRY_DSN?.trim()) {
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
  });

  sentryInitialized = true;
}

export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  console.error(error, context);

  if (!process.env.SENTRY_DSN?.trim()) {
    return;
  }

  ensureSentry();
  Sentry.captureException(error, {
    extra: context,
  });
}

export const SAFE_API_ERROR_MESSAGE =
  "An unexpected error occurred. Please try again.";

export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): string {
  captureException(error, context);
  return SAFE_API_ERROR_MESSAGE;
}
