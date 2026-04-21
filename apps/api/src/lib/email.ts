import nodemailer from 'nodemailer';

type SendMailInput = {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    attachments?: Array<{
        filename: string;
        content: Buffer | string;
        contentType?: string;
    }>;
};

function getEnv(name: string): string | undefined {
    const v = process.env[name];
    if (!v) return undefined;
    return String(v).trim();
}

export async function trySendMail(input: SendMailInput): Promise<{ ok: boolean; reason?: string }> {
    const host = getEnv('SMTP_HOST');
    const portRaw = getEnv('SMTP_PORT');
    const user = getEnv('SMTP_USER');
    const pass = getEnv('SMTP_PASS');
    const from = getEnv('SMTP_FROM') || user;

    if (!host || !portRaw || !user || !pass || !from) {
        return { ok: false, reason: 'SMTP ayarlı değil (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM)' };
    }

    const port = Number(portRaw);
    if (!Number.isFinite(port)) {
        return { ok: false, reason: 'SMTP_PORT geçersiz' };
    }

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });

    await transporter.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        attachments: input.attachments,
    });

    return { ok: true };
}
