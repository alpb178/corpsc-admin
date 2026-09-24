import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { isAllowedOrigin, isDevelopment } from './common/http-config';

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

  app.enableCors({
    origin: (origin, cb) => {
      if (isAllowedOrigin(origin)) {
        cb(null, true);
      } else {
        cb(new Error('Origen no permitido por CORS'), false);
      }
    },
    credentials: true,
  });

  // Swagger only in development: in production it would map the whole API
  // surface for anyone.
  const development = isDevelopment();
  if (development) {
    const config = new DocumentBuilder()
      .setTitle('CORPSC Hub API')
      .setDescription('Centralized analytics and KPIs for the CORPSC sites')
      .setVersion('0.1')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  new Logger('Bootstrap').log(
    `API on http://localhost:${port}/api${development ? ' — docs at /docs' : ''}`,
  );
}

void bootstrap();
