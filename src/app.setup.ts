import {
  BadRequestException,
  INestApplication,
  StandardSchemaValidationPipe,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import helmet from 'helmet';

import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { parseCorsOrigins, type AppEnv } from './config/env.schema.js';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService<AppEnv, true>);
  const origins = parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true }));

  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.enableCors({
    origin: origins,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
    credentials: false,
  });
  app.useGlobalPipes(
    new StandardSchemaValidationPipe({
      exceptionFactory: (issues) => new BadRequestException(publicValidationMessages(issues)),
    }),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
}

function publicValidationMessages(issues: readonly StandardSchemaV1.Issue[]): string[] {
  return issues.map((issue) => {
    const segments = (issue.path ?? []).map(String);
    if (segments.some((segment) => segment === 'password' || segment === 'refreshToken')) {
      return 'Invalid value';
    }
    const message = typeof issue.message === 'string' ? issue.message : 'Invalid value';
    return segments.length > 0 ? `${segments.join('.')}: ${message}` : message;
  });
}
