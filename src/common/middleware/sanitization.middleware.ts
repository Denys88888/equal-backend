import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class SanitizationMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    if (req.body && typeof req.body === 'object') {
      this.sanitizeObject(req.body);
    }
    next();
  }

  private sanitizeObject(obj: Record<string, unknown>): void {
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (typeof value === 'string') {
        // Remove potential XSS vectors
        obj[key] = value
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .trim();
      } else if (typeof value === 'object' && value !== null) {
        this.sanitizeObject(value as Record<string, unknown>);
      }
    }
  }
}
