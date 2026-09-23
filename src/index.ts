import auditMiddleware from './audit';
import {
  CIRCULAR_VALUE,
  DEFAULT_SENSITIVE_FIELDS,
  REDACTED_VALUE,
  TRUNCATED_SUFFIX,
  cleanLogData,
  getMaxEventLength,
  getMaxStringLength,
  getRequestPathFields,
  limitLogEvent,
  redactSensitiveData,
  safeSerialize,
  safeStringify,
  sanitizeRequestPath,
  stripQueryString,
  truncateString,
} from './log-data';
import {
  cleanData,
  handlerError,
  hideSensitiveData,
  logErrorMiddleware,
  logTimeStartMiddleware,
  printGeneralLog,
  requestLogMiddleware,
} from './logger';
import logger from './logging';
import memoryMiddleware from './memory';

export {
  CIRCULAR_VALUE,
  DEFAULT_SENSITIVE_FIELDS,
  REDACTED_VALUE,
  TRUNCATED_SUFFIX,
  auditMiddleware,
  cleanData,
  cleanLogData,
  getMaxEventLength,
  getMaxStringLength,
  getRequestPathFields,
  handlerError,
  hideSensitiveData,
  limitLogEvent,
  logErrorMiddleware,
  logger,
  logTimeStartMiddleware,
  memoryMiddleware,
  printGeneralLog,
  redactSensitiveData,
  requestLogMiddleware,
  safeSerialize,
  safeStringify,
  sanitizeRequestPath,
  stripQueryString,
  truncateString,
};

export type { CompatibleLogger } from './logger';

export default logger;
