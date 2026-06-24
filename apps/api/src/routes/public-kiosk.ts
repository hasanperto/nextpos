import { Router } from 'express';
import { kioskBootstrapHandler, kioskSessionHandler, kioskVerifyAdminPinHandler, kioskListTablesHandler } from '../controllers/publicKiosk.controller.js';

export const publicKioskRouter = Router();

publicKioskRouter.get('/tables', kioskListTablesHandler);
publicKioskRouter.post('/bootstrap', kioskBootstrapHandler);
publicKioskRouter.post('/session', kioskSessionHandler);
publicKioskRouter.post('/verify-admin-pin', kioskVerifyAdminPinHandler);
