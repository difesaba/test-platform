import { Request, Response } from 'express';
import { AddonService } from './addon.service';
import { hasRecording, recordFlow, installAddon } from './addon-installer.service';

const svc = new AddonService();

export class AddonController {
    list = async (_req: Request, res: Response) => {
        try {
            const addons = await svc.list();
            res.json(addons);
        } catch (e: any) {
            console.error('[AddonController] Error:', e.message);
            res.status(500).json({ error: e.message });
        }
    };

    recordingStatus = (_req: Request, res: Response) => {
        res.json({ hasRecording: hasRecording() });
    };

    record = async (req: Request, res: Response) => {
        const { loginUrl, urlRaiz } = req.body;
        if (!loginUrl || !urlRaiz) return res.status(400).json({ error: 'Faltan loginUrl o urlRaiz' });
        res.json({ ok: true, message: 'Grabación iniciada con sesión de Torre. Instala el addon y cierra el browser cuando termines.' });
        recordFlow(loginUrl, urlRaiz).catch((e) =>
            console.error('[AddonController] Error grabando:', e.message)
        );
    };

    instalar = async (req: Request, res: Response) => {
        const { loginUrl, urlRaiz, addonNumber } = req.body;
        if (!loginUrl || !urlRaiz || addonNumber == null) return res.status(400).json({ error: 'Faltan loginUrl, urlRaiz o addonNumber' });
        try {
            const result = await installAddon(loginUrl, urlRaiz, Number(addonNumber));
            res.json(result);
        } catch (e: any) {
            res.status(500).json({ ok: false, message: e.message });
        }
    };
}
