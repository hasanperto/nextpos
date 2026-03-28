// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Languages Route (Multi-Tenant)
// Çoklu dil desteği — public schema üzerinden
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import {
    getLanguagesHandler,
    getTranslationsHandler
} from '../controllers/languages.controller.js';

export const languagesRouter = Router();

languagesRouter.get('/', getLanguagesHandler);
languagesRouter.get('/:lang/translations', getTranslationsHandler);

export default languagesRouter;
