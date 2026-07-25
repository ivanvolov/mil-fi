import { NextRequest, NextResponse } from 'next/server';

/**
 * Route handler type for the Next.js App Router.
 * Supports both simple handlers (request only) and dynamic route handlers (request + context).
 */
type RouteHandler = (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>;

interface ErrorHandlerOptions {
  /** CORS headers to include on error responses (each route defines its own) */
  corsHeaders?: Record<string, string>;
}

/**
 * Wraps a Next.js App Router route handler with global error handling.
 *
 * - Catches unhandled errors thrown by the handler
 * - Logs them with request context via the structured logger
 * - Returns a clean JSON error response, never leaking a stack trace to the client
 *
 * Ported from the Regata project.
 *
 * @example
 * export const POST = withErrorHandler(async (request) => {
 *   const body = await request.json();
 *   // ... business logic
 *   return NextResponse.json({ ok: true });
 * });
 */
export function withErrorHandler(
  handler: RouteHandler,
  options?: ErrorHandlerOptions
): RouteHandler {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      const { createLogger } = await import('@/lib/logger');
      const log = createLogger('error-handler');
      log.error(
        {
          url: request.url,
          method: request.method,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Unhandled API error'
      );

      return NextResponse.json(
        { error: 'Internal error' },
        { status: 500, headers: { ...(options?.corsHeaders || {}) } }
      );
    }
  };
}
