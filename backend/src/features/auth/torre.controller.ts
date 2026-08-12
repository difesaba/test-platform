import { Request, Response } from 'express';
import { torreService } from './torre.service';

export class TorreController {
    getSsoUrl = async (req: Request, res: Response) => {
        const { loginUrl } = req.query as Record<string, string>;
        if (!loginUrl) return res.status(400).json({ error: 'Falta loginUrl' });
        try {
            const key = await torreService.getSsoKey();
            const ssoUrl = torreService.buildSsoUrl(loginUrl, key);
            res.json({ ssoUrl });
        } catch (e: any) {
            res.status(502).json({ error: e.message });
        }
    };
}
