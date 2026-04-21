import { Request, Response } from 'express';
import { queryPublic } from '../lib/db.js';

export const getLanguagesHandler = async (_req: Request, res: Response) => {
    try {
        const [rows]: any = await queryPublic(
            'SELECT * FROM languages WHERE is_active = true ORDER BY sort_order ASC'
        );
        res.json(rows);
    } catch (error) {
        console.error('❌ Diller hatası:', error);
        res.status(500).json({ error: 'Diller yüklenemedi' });
    }
};

export const getTranslationsHandler = async (req: Request, res: Response) => {
    try {
        const { lang } = req.params;
        const { namespace } = req.query;

        /* PostgreSQL: key rezerve kelime — tırnaklı sütun adı */
        let queryStr = 'SELECT namespace, "key", value FROM ui_translations WHERE lang = ?';
        const params: any[] = [lang];

        if (namespace) {
            params.push(namespace);
            queryStr += ` AND namespace = ?`;
        }

        const [rows]: any = await queryPublic(queryStr, params);

        const translations: Record<string, Record<string, string>> = {};
        for (const row of rows) {
            if (!translations[row.namespace]) {
                translations[row.namespace] = {};
            }
            translations[row.namespace][row.key] = row.value;
        }

        res.json(translations);
    } catch (error) {
        console.error('❌ Çeviriler hatası:', error);
        res.status(500).json({ error: 'Çeviriler yüklenemedi' });
    }
};
