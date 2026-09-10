import * as rTracer from 'cls-rtracer';
import winston from 'winston';

import {
  cleanLogData,
  limitLogEvent,
  safeStringify,
} from './log-data';

const VALID_LOG_LEVELS = new Set(['error', 'warn', 'info', 'debug']);
const configuredLevel = process.env.LOG_LEVEL?.toLowerCase();
const logLevel =
  configuredLevel && VALID_LOG_LEVELS.has(configuredLevel)
    ? configuredLevel
    : 'info';

const getHiddenFields = () => {
  const applicationGlobal = global as typeof globalThis & {
    hiddenFields?: string[];
  };
  return applicationGlobal.hiddenFields ?? [];
};

const structuredMetadata = winston.format((info) => {
  const currentLevel = info.level;
  const sanitized = limitLogEvent(cleanLogData(info, getHiddenFields()));

  for (const key of Object.keys(info)) {
    delete info[key];
  }

  if (
    sanitized &&
    typeof sanitized === 'object' &&
    !Array.isArray(sanitized)
  ) {
    Object.assign(info, sanitized);
  } else {
    info.message = sanitized;
  }

  info.level = currentLevel;
  info.service =
    process.env.SERVICE_NAME ||
    process.env.npm_package_name ||
    'unknown-service';
  info.environment =
    process.env.ENVIRONMENT || process.env.NODE_ENV || 'unknown';

  if (process.env.AWS_REGION) {
    info.region = process.env.AWS_REGION;
  }

  const requestId = rTracer.id();
  if (requestId !== undefined && requestId !== null) {
    info.requestId = requestId;
  }

  return info;
});

const oneLineJson = winston.format((info) => {
  info[Symbol.for('message')] = safeStringify(limitLogEvent(info));
  return info;
});

const outputFormat =
  process.env.NODE_ENV === 'local'
    ? winston.format.combine(
        winston.format.errors({ stack: true }),
        structuredMetadata(),
        winston.format.timestamp(),
        winston.format.prettyPrint(),
      )
    : winston.format.combine(
        winston.format.errors({ stack: true }),
        structuredMetadata(),
        winston.format.timestamp(),
        oneLineJson(),
      );

const logger = winston.createLogger({
  level: logLevel,
  format: outputFormat,
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error'],
      consoleWarnLevels: [],
    }),
  ],
});

process
  .on('unhandledRejection', (reason: unknown, promise) => {
    try {
      logger.error({
        type: 'unhandledRejection',
        name: 'Unhandled Rejection at Promise',
        error: reason,
        promise,
      });
    } catch {
      process.stderr.write(
        '{"level":"error","type":"unhandledRejection","message":"Logger failed while handling rejection"}\n',
      );
    }
  })
  .on('uncaughtException', (error: Error) => {
    try {
      logger.error({
        type: 'uncaughtException',
        name: 'Uncaught Exception thrown',
        error,
      });
    } catch {
      process.stderr.write(
        '{"level":"error","type":"uncaughtException","message":"Logger failed while handling exception"}\n',
      );
    } finally {
      process.exit(1);
    }
  });

export { logger };
export default logger;
