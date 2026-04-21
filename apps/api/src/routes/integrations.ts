import { Router } from 'express';
import * as controller from '../controllers/integrations.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

/**
 * Caller ID Webhook
 * Android Gateway App veya VoIP'ten gelen istekleri karşılar
 */
router.post('/caller-id', controller.handleIncomingCall);

router.get('/whatsapp', controller.verifyWhatsAppWebhook);
router.post('/whatsapp', controller.handleWhatsAppWebhook);
router.post('/whatsapp/simulate', authMiddleware, controller.simulateWhatsAppBotHandler);

export default router;
