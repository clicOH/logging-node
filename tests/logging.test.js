const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const {
  cleanData,
  printGeneralLog,
  safeSerialize,
} = require('../dist/logger');
const { sanitizeRequestPath } = require('../dist/log-data');

const projectRoot = path.resolve(__dirname, '..');

const createLoggerSpy = () => {
  const calls = {
    error: [],
    info: [],
  };

  return {
    calls,
    logger: {
      error: (event) => calls.error.push(event),
      info: (event) => calls.info.push(event),
    },
  };
};

const runLoggerProcess = (source, environment = {}) =>
  spawnSync(process.execPath, ['-e', source], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...environment,
    },
  });

test('printGeneralLog writes structured info events', () => {
  const { calls, logger } = createLoggerSpy();

  printGeneralLog(
    { message: 'Shipment created', shipmentId: '123456' },
    'shipmentCreated',
    logger,
  );

  assert.equal(calls.error.length, 0);
  assert.deepEqual(calls.info[0], {
    message: 'Shipment created',
    shipmentId: '123456',
    type: 'shipmentCreated',
  });
});

test('printGeneralLog writes error events through error level', () => {
  const { calls, logger } = createLoggerSpy();
  printGeneralLog(new Error('Provider failed'), 'providerError', logger, true);

  assert.equal(calls.info.length, 0);
  assert.equal(calls.error[0].type, 'providerError');
  assert.equal(calls.error[0].name, 'Error');
  assert.equal(calls.error[0].message, 'Provider failed');
  assert.match(calls.error[0].stack, /Provider failed/);
});

test('redacts common sensitive fields regardless of case or value type', () => {
  const source = {
    Authorization: 'Bearer secret',
    password: 123456,
    token: { raw: 'secret' },
    apiKey: true,
    'access-token': 'mobile-token',
    'private-key': ['secret'],
    safe: 'visible',
  };

  assert.deepEqual(cleanData(source), {
    Authorization: '[REDACTED]',
    password: '[REDACTED]',
    token: '[REDACTED]',
    apiKey: '[REDACTED]',
    'access-token': '[REDACTED]',
    'private-key': '[REDACTED]',
    safe: 'visible',
  });
  assert.equal(source.Authorization, 'Bearer secret');
});

test('redacts nested fields and custom hidden fields', () => {
  assert.deepEqual(
    cleanData(
      {
        shipment: {
          credentials: [{ clientSecret: 'one' }, { ProductDesc: 'private' }],
        },
      },
      ['productDesc'],
    ),
    {
      shipment: {
        credentials: [
          { clientSecret: '[REDACTED]' },
          { ProductDesc: '[REDACTED]' },
        ],
      },
    },
  );
});

test('serializes circular objects without throwing', () => {
  const source = { id: 1 };
  source.self = source;

  assert.deepEqual(safeSerialize(source), {
    id: 1,
    self: '[Circular]',
  });
});

test('removes query strings and masks dynamic request path segments', () => {
  const requestPath =
    '/api/v2/orders/123456/550e8400-e29b-41d4-a716-446655440000?token=secret';

  assert.equal(
    sanitizeRequestPath(requestPath),
    '/api/v2/orders/:value/:value',
  );
});

test('keeps long alphabetic route names and still masks ids', () => {
  assert.equal(
    sanitizeRequestPath(
      '/api/v2/troncales/listRoadmapByCenterDestination/12345',
    ),
    '/api/v2/troncales/listRoadmapByCenterDestination/:value',
  );
  assert.equal(
    sanitizeRequestPath(
      '/api/v2/troncales/listDeliveriesNotScannedSendTrunk/99',
    ),
    '/api/v2/troncales/listDeliveriesNotScannedSendTrunk/:value',
  );
});

test('masks long non-alphabetic path segments', () => {
  const token = `${'a'.repeat(20)}${'1'.repeat(10)}`;

  assert.equal(
    sanitizeRequestPath(`/api/v2/files/${token}`),
    '/api/v2/files/:value',
  );
});

test('preserves Error name, message, and stack', () => {
  const serialized = safeSerialize(new TypeError('Invalid shipment'));

  assert.equal(serialized.name, 'TypeError');
  assert.equal(serialized.message, 'Invalid shipment');
  assert.match(serialized.stack, /TypeError: Invalid shipment/);
});

test('does not call logger when logging is disabled', () => {
  const { calls, logger } = createLoggerSpy();

  printGeneralLog(
    { message: 'disabled' },
    'disabledLog',
    logger,
    false,
    'json',
    false,
  );

  assert.equal(calls.info.length, 0);
  assert.equal(calls.error.length, 0);
});

test('honors LOG_LEVEL and defaults invalid levels to info', () => {
  const warnResult = runLoggerProcess(
    "process.stdout.write(require('./dist/logging').default.level)",
    { LOG_LEVEL: 'warn' },
  );
  const invalidResult = runLoggerProcess(
    "process.stdout.write(require('./dist/logging').default.level)",
    { LOG_LEVEL: 'verbose' },
  );

  assert.equal(warnResult.status, 0);
  assert.equal(warnResult.stdout, 'warn');
  assert.equal(invalidResult.status, 0);
  assert.equal(invalidResult.stdout, 'info');
});

test('writes one-line JSON with standard metadata to stdout', () => {
  const result = runLoggerProcess(
    "require('./dist/logging').default.info({type:'shipmentCreated',message:'Shipment created',shipmentId:'123456'})",
    {
      ENVIRONMENT: 'prod',
      LOG_LEVEL: 'info',
      NODE_ENV: 'production',
      SERVICE_NAME: 'shipping',
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');

  const lines = result.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 1);

  const event = JSON.parse(lines[0]);
  assert.equal(event.level, 'info');
  assert.equal(event.service, 'shipping');
  assert.equal(event.environment, 'prod');
  assert.equal(event.type, 'shipmentCreated');
  assert.equal(event.message, 'Shipment created');
  assert.match(event.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test('writes error events to stderr', () => {
  const result = runLoggerProcess(
    "require('./dist/logging').default.error({type:'providerError',message:'Provider failed'})",
    {
      ENVIRONMENT: 'prod',
      LOG_LEVEL: 'info',
      NODE_ENV: 'production',
      SERVICE_NAME: 'shipping',
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');

  const event = JSON.parse(result.stderr.trim());
  assert.equal(event.level, 'error');
  assert.equal(event.type, 'providerError');
});

test('limits the final UTF-8 JSON line by bytes', () => {
  const result = runLoggerProcess(
    "require('./dist/logging').default.info({type:'largePayload',message:'😀'.repeat(1000)})",
    {
      ENVIRONMENT: 'prod',
      LOG_LEVEL: 'info',
      MAX_LOG_EVENT_LENGTH: '256',
      NODE_ENV: 'production',
      SERVICE_NAME: 'shipping',
    },
  );

  assert.equal(result.status, 0);
  const output = result.stdout.trim();
  assert.doesNotThrow(() => JSON.parse(output));
  assert.ok(Buffer.byteLength(output) <= 256);
  assert.equal(JSON.parse(output).truncated, true);
});

test('top-level package exports the compatibility API', () => {
  const pkg = require('../dist');

  assert.equal(typeof pkg.default.info, 'function');
  assert.equal(typeof pkg.printGeneralLog, 'function');
  assert.equal(typeof pkg.logErrorMiddleware, 'function');
  assert.equal(typeof pkg.auditMiddleware, 'function');
  assert.equal(typeof pkg.memoryMiddleware, 'function');
});
