import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');

  // Detrás del proxy de Render, req.ip debe traer la IP real del cliente.
  app.set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS compara solo el origen (esquema + host), sin ruta ni barra final.
  const defaultOrigins = ['https://hub.corpsc.com'];
  const envOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const origins = [...new Set([...defaultOrigins, ...envOrigins])];

  app.enableCors({
    origin: (origin, cb) => {
      // Sin origin son herramientas tipo curl; localhost es desarrollo.
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
    .setDescription('Analítica y KPIs centralizados de los sitios de CORPSC')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  new Logger('Bootstrap').log(`API en http://localhost:${port}/api — docs en /docs`);
}

void bootstrap();
