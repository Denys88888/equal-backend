import { initSentry } from './sentry';
initSentry();
import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { SentryExceptionFilter } from './sentry.filter';
import { NestExpressApplication } from '@nestjs/platform-express';
import { isOriginAllowed } from './common/allowed-origins';
import { piApiStatus, refreshPiApiStatusIfStale } from './common/pi-api-status';
import { paymentDiagnostics } from './common/payment-diagnostics';
import * as path from 'path';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Render terminates TLS at its proxy; without this req.ip is the proxy hop,
  // not the client. ThrottlerProxyGuard reads the forwarded headers directly.
  app.set('trust proxy', 1);

  // Serve locally-stored uploads (fallback when Cloudinary is not configured)
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });
  const adapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new SentryExceptionFilter(adapterHost.httpAdapter));

  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    // Rejecting by returning `false` rather than an Error: the browser still
    // blocks the response (no allow-origin header), but the request finishes as
    // a normal 200 instead of an unhandled 500 that Sentry books as a server
    // fault on every scan and stray origin.
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('Equal API')
    .setDescription('Dating app backend for Pi Network')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Health check at /v1/health (matches render.yaml healthCheckPath)
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/v1/health', (_req: unknown, res: { json: (v: unknown) => void }) => {
    // Kicked off, never awaited — see pi-api-status.ts for why health must stay
    // instant and must not go red when Pi is unreachable.
    refreshPiApiStatusIfStale();
    res.json({
      status: 'ok',
      ts: Date.now(),
      pi_api: piApiStatus(),
      payments_last: paymentDiagnostics(),
      // Whether Web Push can send at all — both VAPID keys must be set. Only a
      // boolean, never the keys.
      push_configured: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    });
  });

  // Cheap unauthenticated keep-alive target. Deliberately outside the /v1
  // prefix and free of any DB work, so an external pinger costs nothing.
  httpAdapter.get('/ping', (_req: unknown, res: { send: (v: string) => void }) => {
    res.send('pong');
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`API running on port ${port}`);

  // Keep Render free tier warm (spins down after 15 min of inactivity)
  const selfUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
  setInterval(() => {
    fetch(`${selfUrl}/v1/health`).catch(() => {});
  }, 14 * 60 * 1000);
}
bootstrap();
