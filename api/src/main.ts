import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');

  // Behind Render's proxy, req.ip must carry the client's real IP.
  app.set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS compares only the origin (scheme + host), without path or trailing slash.
  const defaultOrigins = ['https://hub.corpsc.com'];
  const envOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const origins = [...new Set([...defaultOrigins, ...envOrigins])];

  app.enableCors({
    origin: (origin, cb) => {
      // No origin means curl-like tools; localhost is development.
      if (!origin || origins.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)) {
        cb(null, true);
      } else {
        cb(new Error('Origen no permitido por CORS'), false);
      }
    },
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('CORPSC Hub API')
    .setDescription('Centralized analytics and KPIs for the CORPSC sites')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  new Logger('Bootstrap').log(`API on http://localhost:${port}/api — docs at /docs`);
}

void bootstrap();
