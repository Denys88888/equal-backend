import { Injectable } from '@nestjs/common';
import pino from 'pino';

/**
 * Structured logging to stdout only — Render discards the filesystem on every
 * restart, so file transports would silently lose everything.
 *
 * NOTE: unlike the WorkPro backend, info/warn are NOT no-ops in production
 * here; pino writes them to stdout where Render's log viewer picks them up.
 */
@Injectable()
export class LoggerService {
  private readonly logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    // Pretty output locally; raw JSON on Render (its viewer parses JSON).
    ...(process.env.NODE_ENV !== 'production'
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : {}),
  });

  info(msg: string, meta?: Record<string, unknown>) {
    this.logger.info(meta ?? {}, msg);
  }

  warn(msg: string, meta?: Record<string, unknown>) {
    this.logger.warn(meta ?? {}, msg);
  }

  error(msg: string, meta?: Record<string, unknown>) {
    this.logger.error(meta ?? {}, msg);
  }

  debug(msg: string, meta?: Record<string, unknown>) {
    this.logger.debug(meta ?? {}, msg);
  }
}
