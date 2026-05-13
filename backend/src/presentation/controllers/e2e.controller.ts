import { Request, Response } from 'express';
import { E2eService } from '../../services/e2e.service';
import { resolveAutomationEntryUrl, resolveRuntimeUrl } from '../../utils/runtime-url';

const svc = new E2eService();

export class E2eController {

    list = (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        res.json(svc.list(mod, submodule, page));
    };

    create = (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        const sessionUrlRaiz = String((req.session as any)?.urlRaiz ?? '');
        res.status(201).json(svc.create(mod, {
            ...req.body,
            url: resolveRuntimeUrl(String(req.body?.url ?? ''), sessionUrlRaiz),
        }, submodule, page));
    };

    remove = (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        svc.delete(mod, req.params.id, submodule, page);
        res.json({ ok: true });
    };

    startRecording = (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            const sessionUrlRaiz = String((req.session as any)?.urlRaiz ?? '');
            const overrideUrl = resolveAutomationEntryUrl(String(req.body?.url ?? ''), sessionUrlRaiz) || undefined;
            svc.startRecording(mod, req.params.id, submodule, page, overrideUrl);
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    stopRecording = (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        svc.stopRecording(mod, req.params.id, submodule, page);
        res.json({ ok: true });
    };

    run = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            const sessionUrlRaiz = String((req.session as any)?.urlRaiz ?? '');
            const overrideUrl = resolveAutomationEntryUrl(String(req.body?.url ?? ''), sessionUrlRaiz) || undefined;
            const result = await svc.run(mod, req.params.id, submodule, page, overrideUrl);
            res.json(result);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    getSpec = (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        res.json({ spec: svc.getSpec(mod, req.params.id, submodule, page) });
    };
}
