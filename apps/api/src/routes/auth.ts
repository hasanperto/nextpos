import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { 
    login, loginWithPin, refreshToken, logout, saasLogin, verifyAdminPin, verifySaas2fa, resendSaas2fa,
    createImpersonationCode, loginWithImpersonationCode
} from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.js';

function envInt(name: string, fallback: number): number {
    const n = parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** IP başına giriş denemesi — brute-force ilk katman (15 dk pencere). */
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: envInt('AUTH_LOGIN_MAX_PER_WINDOW', 40),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla giriş denemesi, lütfen bir süre sonra tekrar deneyin' },
});

/** Refresh token yenileme — istemci döngüsüne toleranslı. */
const refreshLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: envInt('AUTH_REFRESH_MAX_PER_MIN', 90),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla oturum yenileme isteği' },
});

export const authRouter = Router();

authRouter.post('/login', loginLimiter, login);
authRouter.post('/login/pin', loginLimiter, loginWithPin);
authRouter.post('/login/saas', loginLimiter, saasLogin);
authRouter.post('/login/saas/2fa/verify', loginLimiter, verifySaas2fa);
authRouter.post('/login/saas/2fa/resend', loginLimiter, resendSaas2fa);
authRouter.post('/verify-admin', authMiddleware, loginLimiter, verifyAdminPin);
authRouter.post('/refresh', refreshLimiter, refreshToken);
authRouter.post('/logout', logout);

// Gölge Giriş (Impersonation)
authRouter.post('/impersonate', authMiddleware, createImpersonationCode);
authRouter.post('/login/impersonate', loginLimiter, loginWithImpersonationCode);

