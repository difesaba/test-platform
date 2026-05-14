import { Request, Response } from 'express';
import { E2eService } from '../../services/e2e.service';
import { resolveAutomationEntryUrl, resolveRuntimeUrl } from '../../utils/runtime-url';

const svc = new E2eService();

function getSessionContext(req: Request) {
    const sess = req.session as any;
    return {
        urlRaiz: sess?.urlRaiz,
        clienteId: sess?.clienteId,
        empresaId: sess?.empresa?.id,
        sucursalId: sess?.sucursal?.id,
        empresaNombre: sess?.empresa?.nombre ?? sess?.empresaNombre,
        sucursalNombre: sess?.sucursal?.nombre,
        entornoName: sess?.sucursal?.entorno ?? sess?.entorno?.name,
        empNombre: sess?.empNombre,
    };
}

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

    remove = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            await svc.delete(mod, req.params.id, submodule, page);
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    startRecording = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            const sessionUrlRaiz = String((req.session as any)?.urlRaiz ?? '');
            const overrideUrl = resolveAutomationEntryUrl(String(req.body?.url ?? ''), sessionUrlRaiz) || undefined;
            const adproToken = (req.session as any)?.adproToken;
            await svc.startRecording(mod, req.params.id, submodule, page, overrideUrl, adproToken, getSessionContext(req));
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    stopRecording = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            await svc.stopRecording(mod, req.params.id, submodule, page);
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
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
