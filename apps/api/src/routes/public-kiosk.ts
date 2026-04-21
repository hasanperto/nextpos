import { Router } from 'express';
import { kioskBootstrapHandler, kioskSessionHandler, kioskVerifyAdminPinHandler } from '../controllers/publicKiosk.controller.js';

export const publicKioskRouter = Router();

publicKioskRouter.post('/bootstrap', kioskBootstrapHandler);
publicKioskRouter.post('/session', kioskSessionHandler);
publicKioskRouter.post('/verify-admin-pin', kioskVerifyAdminPinHandler);
