import { initSentry } from './sentry';
initSentry();
import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { SentryExceptionFilter } from './sentry.filter';
import { join } from 'path';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const adapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new SentryExceptionFilter(adapterHost.httpAdapter));

  const expressApp = app.getHttpAdapter().getInstance() as express.Application;
  // Trust one hop so express-rate-limit gets the real client IP from X-Forwarded-For
  // (Render sits behind a single reverse-proxy hop; using `true` would allow XFF spoofing)
  expressApp.set('trust proxy', 1);
  // Serve locally-saved photo uploads (fallback when Cloudinary is not configured)
  expressApp.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const allowedOrigins = [
    'https://equal-app.onrender.com',
    'https://denys88888.github.io',
    'http://localhost:3000',
    'http://localhost:5173',
  ];
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error('Not allowed by CORS'));
    },
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
    res.json({ status: 'ok', ts: Date.now() });
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
