import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule, ObserveInstrument } from './app.module.js';
import { configureApp } from './app.setup.js';
import { validateEnv, type AppEnv } from './config/env.schema.js';

const levelOrder: readonly AppEnv['LOG_LEVEL'][] = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

function logLevels(level: AppEnv['LOG_LEVEL']): LogLevel[] {
  const index = levelOrder.indexOf(level);
  return levelOrder.slice(0, index + 1);
}

async function bootstrap(): Promise<void> {
  const env = validateEnv(process.env);
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
    logger: new ConsoleLogger({
      json: true,
      colors: false,
      logLevels: logLevels(env.LOG_LEVEL),
    }),
  });
  configureApp(app);
  await app.listen(env.PORT);
}

await bootstrap();
