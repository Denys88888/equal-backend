import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Behind Render (which sits behind Cloudflare) the socket peer address rotates
 * per request, so the default req.ip tracker gives every request its own bucket
 * and nothing is ever limited. Track the real client instead.
 *
 * cf-connecting-ip is set by Cloudflare itself and cannot be forged by the
 * client, so it is preferred over x-forwarded-for (whose leftmost entry is
 * client-supplied and therefore spoofable).
 */
@Injectable()
export class ThrottlerProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const cf = req.headers?.['cf-connecting-ip'];
    if (typeof cf === 'string' && cf.length > 0) return cf;

    const xff = req.headers?.['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
      // Right-most entry is the one appended by the closest trusted proxy
      const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) return parts[parts.length - 1];
    }

    return req.ip ?? 'unknown';
  }
}
