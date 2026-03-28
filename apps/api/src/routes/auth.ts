// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Auth Route (Multi-Tenant)
// Login/Logout/Refresh — Schema-per-Tenant uyumlu
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { login, loginWithPin, refreshToken, logout, saasLogin } from '../controllers/auth.controller.js';

export const authRouter = Router();

authRouter.post('/login', login);
authRouter.post('/login/pin', loginWithPin);
authRouter.post('/login/saas', saasLogin);
authRouter.post('/refresh', refreshToken);
authRouter.post('/logout', logout);
