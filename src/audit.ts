import express, { NextFunction, Request, Response } from 'express';

import { sanitizeRequestPath } from './log-data';
import { printGeneralLog } from './logger';
import logger from './logging';

const auditMiddleware = express.Router();

auditMiddleware.use(
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.body) req.body = {};
      const { body, params, method, headers } = req;

      let { admin, admin_id, adminId } = body;
      let { messenger, messengerId, messenger_id, idMessenger } = body;
      let { user, userId, user_id, idUser } = body;

      let adminOid = null;
      let userOid = null;
      let messengerOid = null;

      if (user == null && userId == null && user_id == null && idUser == null) {
        ({ user, userId, user_id, idUser } = params);
      }
      userOid = user ?? userId ?? user_id ?? idUser ?? null;

      if (
        messenger == null &&
        messengerId == null &&
        messenger_id == null &&
        idMessenger == null
      ) {
        ({ messenger, messengerId, messenger_id, idMessenger } = params);
      }
      messengerOid =
        messenger ?? messengerId ?? messenger_id ?? idMessenger ?? null;

      if (admin == null && admin_id == null && adminId == null) {
        ({ admin, admin_id, adminId } = params);
      }
      adminOid = admin ?? admin_id ?? adminId ?? null;

      if (process.env.NODE_ENV !== 'local') {
        const logHttpFull = process.env.LOG_HTTP_FULL === 'true';

        printGeneralLog(
          {
            method: method || null,
            admin: adminOid ? String(adminOid) : null,
            messenger: messengerOid ? String(messengerOid) : null,
            user: userOid ? String(userOid) : null,
            action: sanitizeRequestPath(`${req.baseUrl}${req.path}`),
            ...(logHttpFull ? { body, headers } : {}),
          },
          'auditRequest',
          logger,
        );
      }

      next();
    } catch (error) {
      printGeneralLog(
        error && typeof error === 'object' ? error : { error },
        'auditMiddlewareError',
        logger,
        true,
      );
      next();
    }
  },
);

export { auditMiddleware };
export default auditMiddleware;
