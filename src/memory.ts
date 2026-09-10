import express, { NextFunction, Request, Response } from 'express';

import { printGeneralLog } from './logger';
import logger from './logging';

const memoryMiddleware = express.Router();

memoryMiddleware.use(
  async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.LOG_MEMORY_USAGE !== 'true') {
      return next();
    }

    const startMemory = process.memoryUsage().heapUsed;
    res.on('finish', () => {
      const endMemory = process.memoryUsage().heapUsed;
      const memoryUsed = endMemory - startMemory;
      if (process.env.NODE_ENV !== 'local') {
        printGeneralLog(
          {
            memoryMb: memoryUsed / (1024 * 1024),
            method: req.method,
            url: req.path,
          },
          'memory-usage',
          logger,
        );
      }
    });
    next();
  },
);

export { memoryMiddleware };
export default memoryMiddleware;
