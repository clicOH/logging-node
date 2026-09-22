const REDACTED_VALUE = '[REDACTED]';
const CIRCULAR_VALUE = '[Circular]';
const TRUNCATED_SUFFIX = '...[TRUNCATED]';
const DEFAULT_MAX_STRING_LENGTH = 10000;
const DEFAULT_MAX_EVENT_LENGTH = 65536;
const MAX_DEPTH = 12;
const MAX_ARRAY_ITEMS = 100;
const MAX_OBJECT_KEYS = 100;
const MAX_NODES = 2000;

const DEFAULT_SENSITIVE_FIELDS = [
  'authorization',
  'proxy-authorization',
  'password',
  'passwordConfirmation',
  'passwd',
  'pass',
  'token',
  'tokenPushy',
  'accessToken',
  'access-token',
  'access_token',
  'refreshToken',
  'refresh_token',
  'apiKey',
  'apikey',
  'secret',
  'clientSecret',
  'client_secret',
  'cookie',
  'set-cookie',
  'x-api-key',
  'private-key',
  'session-tracker',
  'security',
];

type SerializationContext = {
  nodes: number;
  seen: WeakSet<object>;
};

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getMaxStringLength = () =>
  Math.max(
    TRUNCATED_SUFFIX.length,
    parsePositiveInteger(
      process.env.MAX_LOG_STRING_LENGTH,
      DEFAULT_MAX_STRING_LENGTH,
    ),
  );

const getMaxEventLength = () =>
  Math.max(
    256,
    parsePositiveInteger(
      process.env.MAX_LOG_EVENT_LENGTH,
      DEFAULT_MAX_EVENT_LENGTH,
    ),
  );

const truncateString = (value: string, maxLength = getMaxStringLength()) => {
  if (value.length <= maxLength) {
    return value;
  }

  const availableLength = Math.max(0, maxLength - TRUNCATED_SUFFIX.length);
  return `${value.slice(0, availableLength)}${TRUNCATED_SUFFIX}`;
};

const serializeValue = (
  value: unknown,
  context: SerializationContext,
  depth: number,
): unknown => {
  if (value === undefined) return '[Undefined]';
  if (value === null) return null;
  if (typeof value === 'string') return truncateString(value);
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return typeof value === 'bigint' ? value.toString() : value;
  }
  if (typeof value === 'symbol' || typeof value === 'function') {
    return truncateString(String(value));
  }
  if (depth >= MAX_DEPTH || context.nodes >= MAX_NODES) {
    return TRUNCATED_SUFFIX;
  }
  if (typeof value !== 'object') {
    return truncateString(String(value));
  }
  if (context.seen.has(value)) {
    return CIRCULAR_VALUE;
  }

  context.seen.add(value);
  context.nodes += 1;

  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? 'Invalid Date' : value.toISOString();
  }

  if (value instanceof Error) {
    const serializedError: Record<string, unknown> = {
      name: value.name,
      message: truncateString(value.message),
    };

    if (value.stack) {
      serializedError.stack = truncateString(value.stack);
    }

    for (const key of Object.keys(value).slice(0, MAX_OBJECT_KEYS)) {
      try {
        serializedError[key] = serializeValue(
          (value as unknown as Record<string, unknown>)[key],
          context,
          depth + 1,
        );
      } catch {
        serializedError[key] = '[Unserializable]';
      }
    }

    return serializedError;
  }

  if (Buffer.isBuffer(value)) {
    return `[Buffer length=${value.length}]`;
  }

  if (Array.isArray(value)) {
    const serializedArray = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => serializeValue(item, context, depth + 1));

    if (value.length > MAX_ARRAY_ITEMS) {
      serializedArray.push(TRUNCATED_SUFFIX);
    }

    return serializedArray;
  }

  const serializedObject: Record<string, unknown> = {};
  let keys: string[];

  try {
    keys = Object.keys(value);
  } catch {
    return '[Unserializable]';
  }

  for (const key of keys.slice(0, MAX_OBJECT_KEYS)) {
    try {
      serializedObject[key] = serializeValue(
        (value as Record<string, unknown>)[key],
        context,
        depth + 1,
      );
    } catch {
      serializedObject[key] = '[Unserializable]';
    }
  }

  if (keys.length > MAX_OBJECT_KEYS) {
    serializedObject._truncated = TRUNCATED_SUFFIX;
  }

  return serializedObject;
};

const safeSerialize = (value: unknown): unknown =>
  serializeValue(
    value,
    {
      nodes: 0,
      seen: new WeakSet<object>(),
    },
    0,
  );

const getSensitiveFields = (hiddenFields: string[] = []) =>
  new Set(
    [...DEFAULT_SENSITIVE_FIELDS, ...hiddenFields].map((field) =>
      field.toLowerCase(),
    ),
  );

const redactValue = (value: unknown, sensitiveFields: Set<string>): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, sensitiveFields));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    redacted[key] = sensitiveFields.has(key.toLowerCase())
      ? REDACTED_VALUE
      : redactValue(item, sensitiveFields);
  }
  return redacted;
};

const redactSensitiveData = (value: unknown, hiddenFields: string[] = []) =>
  redactValue(value, getSensitiveFields(hiddenFields));

const cleanLogData = (value: unknown, hiddenFields: string[] = []) =>
  redactSensitiveData(safeSerialize(value), hiddenFields);

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify('[Unserializable]');
  }
};

const truncateUtf8 = (value: string, maxBytes: number) => {
  const buffer = Buffer.from(value);
  if (buffer.length <= maxBytes) {
    return value;
  }
  return buffer.subarray(0, Math.max(0, maxBytes)).toString('utf8');
};

const limitLogEvent = (value: unknown): unknown => {
  const serialized = safeStringify(value);
  const maxLength = getMaxEventLength();

  if (Buffer.byteLength(serialized) <= maxLength) {
    return value;
  }

  let availableBytes = Math.max(
    0,
    maxLength - Buffer.byteLength(TRUNCATED_SUFFIX) - 64,
  );
  let limited = {
    message: `${truncateUtf8(serialized, availableBytes)}${TRUNCATED_SUFFIX}`,
    truncated: true,
  };
  let limitedSize = Buffer.byteLength(safeStringify(limited));

  while (limitedSize > maxLength && availableBytes > 0) {
    availableBytes = Math.max(0, availableBytes - (limitedSize - maxLength));
    limited = {
      message: `${truncateUtf8(serialized, availableBytes)}${TRUNCATED_SUFFIX}`,
      truncated: true,
    };
    limitedSize = Buffer.byteLength(safeStringify(limited));
  }

  return limited;
};

const sanitizeRequestPath = (path: string) => {
  const dynamicSegment =
    /^(?:\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{16,}|[^/]*@[^/]*)$/i;
  const staticRouteSegment = /^[A-Za-z]+$/;
  const pathname = path.split('?')[0];

  return pathname
    .split('/')
    .map((segment) => {
      if (!segment) {
        return segment;
      }
      if (dynamicSegment.test(segment)) {
        return ':value';
      }
      if (segment.length > 24 && !staticRouteSegment.test(segment)) {
        return ':value';
      }
      return segment;
    })
    .join('/');
};

export {
  CIRCULAR_VALUE,
  DEFAULT_SENSITIVE_FIELDS,
  REDACTED_VALUE,
  TRUNCATED_SUFFIX,
  cleanLogData,
  getMaxEventLength,
  getMaxStringLength,
  limitLogEvent,
  redactSensitiveData,
  sanitizeRequestPath,
  safeSerialize,
  safeStringify,
  truncateString,
};
