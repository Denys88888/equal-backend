import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Populates req.user when a valid Bearer token is present, and lets the request
 * through untouched when it isn't.
 *
 * Needed by the shareable Equal Ask feed: a /u/:username link has to render for
 * a signed-out visitor (that is the whole viral mechanic), but a signed-in
 * visitor should still see their own like state on each answer.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  // Passport calls this with the auth outcome. Swallowing the error is what
  // turns "no/!invalid token" from a 401 into an anonymous request.
  handleRequest<TUser>(_err: unknown, user: TUser): TUser {
    return (user || undefined) as TUser;
  }
}
