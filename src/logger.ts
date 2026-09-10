import {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from 'express';

import logger from './logging';
import {
  cleanLogData,
  limitLogEvent,
  redactSensitiveData,
  safeSerialize,
  safeStringify,
  truncateString,
} from './log-data';

type ApplicationGlobal = typeof globalThis & {
  hiddenFields?: string[];
};

type CompatibleLogger = {
  error: (message: unknown, metadata?: object) => unknown;
  info: (message: unknown, metadata?: object) => unknown;
};

const getGlobalHiddenFields = () =>
  (global as ApplicationGlobal).hiddenFields ?? [];

const handlerError = (code: number, error: string, status: number) => ({
  status: status || 400,
  message: {
    code,
    detail: error,
  },
});

const logTimeStartMiddleware = (
  req: Request & { logTimeStart?: number },
  _res: Response,
  next: NextFunction,
) => {
  req.logTimeStart = Date.now();
  next();
};

const cleanData = (data: unknown, hiddenFields: string[] = []) =>
  cleanLogData(data, hiddenFields);

const hideSensitiveData = (data: unknown, hiddenFields: string[] = []) =>
  redactSensitiveData(safeSerialize(data), hiddenFields);

const logErrorMiddleware: ErrorRequestHandler = (
  err: unknown,
  req: Request & { logErrorData?: object },
  _res: Response,
  next: NextFunction,
) => {
  try {
    const errorRecord =
      err && typeof err === 'object'
        ? (err as Record<string, unknown>)
        : undefined;
    const nestedError = errorRecord?.error;
    const source = nestedError ?? err;
    const sourceRecord =
      source && typeof source === 'object'
        ? (source as Record<string, unknown>)
        : undefined;
    const name =
      source instanceof Error
        ? source.name
        : typeof sourceRecord?.name === 'string'
          ? sourceRecord.name
          : String(source ?? 'UnknownError');
    const stack =
      typeof errorRecord?.stack === 'string'
        ? errorRecord.stack
        : typeof sourceRecord?.stack === 'string'
          ? sourceRecord.stack
          : '';

    req.logErrorData = {
      name: truncateString(name),
      data: limitLogEvent(cleanData(source, getGlobalHiddenFields())),
      stack: truncateString(stack),
    };
  } catch {
    req.logErrorData = {
      name: 'LoggingError',
      data: '[Unserializable]',
      stack: '',
    };
  }

  next(err);
};

const requestLogMiddleware =
  (
    targetLogger: CompatibleLogger,
    formats = 'json',
    enabled = true,
    hiddenFields: string[] = [],
  ) =>
  (_req: Request, _res: Response, next: NextFunction) => {
    void targetLogger;
    void formats;
    void enabled;
    void hiddenFields;
    next();
  };

const printGeneralLog = (
  message: object,
  type: string,
  targetLogger: CompatibleLogger | null = null,
  isError = false,
  formats = 'json',
  enabled = true,
) => {
  if (!enabled) {
    return;
  }

  const selectedLogger = targetLogger || logger;

  try {
    const sanitized = cleanData(message, getGlobalHiddenFields());
    const formatted = formats === 'json' ? sanitized : safeStringify(sanitized);
    const limited = limitLogEvent(formatted);
    const event =
      limited && typeof limited === 'object' && !Array.isArray(limited)
        ? { ...limited, type }
        : { message: limited, type };

    if (isError) {
      selectedLogger.error(event);
    } else {
      selectedLogger.info(event);
    }
  } catch {
    try {
      process.stderr.write(
        `${safeStringify({
          level: 'error',
          type: 'loggerFailure',
          sourceType: truncateString(type),
          message: 'The logger failed to serialize an event',
        })}\n`,
      );
    } catch {
      // Logging failures must not affect application behavior.
    }
  }
};

export {
  CompatibleLogger,
  cleanData,
  handlerError,
  hideSensitiveData,
  limitLogEvent,
  logErrorMiddleware,
  logTimeStartMiddleware,
  printGeneralLog,
  redactSensitiveData,
  requestLogMiddleware,
  safeSerialize,
  truncateString,
};
