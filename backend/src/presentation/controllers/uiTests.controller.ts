import { Request, Response } from 'express';
import { UiTestService } from '../../services/uiTest.service';
import { resolveRuntimeUrl } from '../../utils/runtime-url';

const svc = new UiTestService();

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

export class UiTestsController {

    list = (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        res.json(svc.list(mod, submodule, page));
    };

    inspectComponents = async (req: Request, res: Response) => {
        const sessionUrlRaiz = String((req.session as any)?.urlRaiz ?? '');
        const url = resolveRuntimeUrl(String(req.body?.url ?? ''), sessionUrlRaiz);
        if (!url) return res.status(400).json({ error: 'Falta url' });
        try {
            console.log('[UI Controller] inspectComponents resolved URL', {
                requestedUrl: String(req.body?.url ?? ''),
                resolvedUrl: url,
                sessionUrlRaiz,
            });
            const adproToken = (req.session as any)?.adproToken;
            const components = await svc.inspectComponents(url, adproToken, getSessionContext(req));
            res.json(components);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    startComponentPicker = async (req: Request, res: Response) => {
        const sessionUrlRaiz = String((req.session as any)?.urlRaiz ?? '');
        const url = resolveRuntimeUrl(String(req.body?.url ?? ''), sessionUrlRaiz);
        if (!url) return res.status(400).json({ error: 'Falta url' });
        try {
            console.log('[UI Controller] startComponentPicker resolved URL', {
                requestedUrl: String(req.body?.url ?? ''),
                resolvedUrl: url,
                sessionUrlRaiz,
            });
            const adproToken = (req.session as any)?.adproToken;
            res.status(201).json(await svc.startComponentPicker(url, adproToken, getSessionContext(req)));
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    componentPickerStatus = async (req: Request, res: Response) => {
        try {
            res.json(await svc.getComponentPickerStatus(req.params.id));
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    cancelComponentPicker = async (req: Request, res: Response) => {
        try {
            await svc.cancelComponentPicker(req.params.id);
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
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

    run = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            const adproToken = (req.session as any)?.adproToken;
            const sessionUrlRaiz = String((req.session as any)?.urlRaiz ?? '');
            const overrideUrl = resolveRuntimeUrl(String(req.body?.url ?? ''), sessionUrlRaiz) || undefined;
            console.log('[UI Controller] run resolved URL', {
                requestedUrl: String(req.body?.url ?? ''),
                overrideUrl: overrideUrl ?? '',
                sessionUrlRaiz,
            });
            const result = await svc.run(mod, req.params.id, submodule, page, adproToken, overrideUrl, getSessionContext(req));
            res.json(result);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };
}
