import pino from 'pino';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Base pino logger instance.
 *
 * - Development: pretty-printed with colors (set LOG_LEVEL=debug for verbose output)
 * - Production: JSON format, for log aggregation
 *
 * Replaces scattered console.log usage. Ported from the Regata project.
 *
 * NOTE: this is for SERVER-side code (API routes, server components) only.
 * For client-side logs inside World App, use the Eruda console that the
 * template already wires up in src/providers/Eruda/.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
});

/**
 * Create a child logger scoped to a specific domain.
 *
 * @example
 * const log = createLogger('api/verify-proof');
 * log.info({ nullifierHash }, 'Verifying proof');
 * log.error({ error }, 'Verification failed');
 */
export function createLogger(domain: string) {
  return logger.child({ domain });
}
