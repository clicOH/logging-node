# @clicoh/logging

Structured JSON logging for ClicOH Node.js and Express services.

## Install

```bash
bun add @clicoh/logging
```

The package is public on npmjs.com, so consumers do not need a registry token.

## Usage

```ts
import logger, {
  logErrorMiddleware,
  logTimeStartMiddleware,
  printGeneralLog,
  requestLogMiddleware,
} from '@clicoh/logging';

printGeneralLog(
  { message: 'Shipment created' },
  'shipmentCreated',
  logger,
);
```

Optional middleware exports:

```ts
import { auditMiddleware, memoryMiddleware } from '@clicoh/logging';
```

## Configuration

- `SERVICE_NAME`: stable service name used in Loki.
- `ENVIRONMENT` or `NODE_ENV`: deployment environment.
- `LOG_LEVEL`: `error`, `warn`, `info`, or `debug`.
- `LOG_HTTP_FULL`: includes sanitized request bodies and headers in audit logs.
- `LOG_MEMORY_USAGE`: enables memory-delta logs.
- `MAX_LOG_STRING_LENGTH`: maximum length for individual strings.
- `MAX_LOG_EVENT_LENGTH`: maximum UTF-8 byte size for a complete JSON line.
- `AWS_REGION`: optional region metadata.

Errors are written to stderr. Other enabled levels are written to stdout.
