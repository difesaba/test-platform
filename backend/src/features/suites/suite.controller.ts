import { Request, Response } from 'express';
import { suiteService } from './suite.service';
import { auditService } from '../audit/audit.service';

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

export class SuiteController {
    list = async (req: Request, res: Response) => {
        const { tipo } = req.query as Record<string, string>;
        res.json(await suiteService.list(tipo as any));
    };

    get = async (req: Request, res: Response) => {
        const suite = await suiteService.get(req.params.id as string);
        if (!suite) return res.status(404).json({ error: 'Suite no encontrada' });
        res.json(suite);
    };

    create = async (req: Request, res: Response) => {
        const { name, description, tipo, stopOnFailure } = req.body ?? {};
        try {
            const suite = await suiteService.create(name, description, tipo ?? 'e2e', !!stopOnFailure);
            const c = getSessionContext(req);
            auditService.record({ type: 'structural', action: 'crear', target: 'suite ' + suite.name, empresaNombre: c.empresaNombre, entorno: c.entornoName, urlRaiz: c.urlRaiz });
            res.status(201).json(suite);
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    };

    update = async (req: Request, res: Response) => {
        try {
            const suite = await suiteService.update(req.params.id as string, req.body ?? {});
            const c = getSessionContext(req);
            auditService.record({ type: 'structural', action: 'editar', target: 'suite ' + suite.name, empresaNombre: c.empresaNombre, entorno: c.entornoName, urlRaiz: c.urlRaiz });
            res.json(suite);
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    };

    remove = async (req: Request, res: Response) => {
        try {
            await suiteService.remove(req.params.id as string);
            const c = getSessionContext(req);
            auditService.record({ type: 'structural', action: 'eliminar', target: 'suite ' + (req.params.id as string), empresaNombre: c.empresaNombre, entorno: c.entornoName, urlRaiz: c.urlRaiz });
            res.json({ ok: true });
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    };

    addFlow = async (req: Request, res: Response) => {
        const { module: mod, submodule, page, flowId, name } = req.body ?? {};
        if (!mod || !flowId) return res.status(400).json({ error: 'Falta module o flowId' });
        try {
            const suite = await suiteService.addFlow(req.params.id as string, { module: mod, submodule, page, flowId, name: name ?? flowId });
            const c = getSessionContext(req);
            auditService.record({ type: 'structural', action: 'agregar', target: 'prueba "' + (name ?? flowId) + '" a suite ' + suite.name, empresaNombre: c.empresaNombre, entorno: c.entornoName, urlRaiz: c.urlRaiz });
            res.json(suite);
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    };

    removeFlow = async (req: Request, res: Response) => {
        try {
            const suite = await suiteService.removeFlow(req.params.id as string, req.params.flowId as string);
            const c = getSessionContext(req);
            auditService.record({ type: 'structural', action: 'quitar', target: 'prueba de suite ' + suite.name, empresaNombre: c.empresaNombre, entorno: c.entornoName, urlRaiz: c.urlRaiz });
            res.json(suite);
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    };

    run = async (req: Request, res: Response) => {
        try {
            const ctx = getSessionContext(req);
            const adproToken = (req.session as any)?.adproToken;
            const run = await suiteService.run(req.params.id as string, ctx, adproToken);
            auditService.record({ type: 'execution', action: 'ejecutar', target: 'suite ' + run.suiteName, empresaNombre: ctx.empresaNombre, entorno: ctx.entornoName, urlRaiz: ctx.urlRaiz, meta: { total: run.total, passed: run.passed, failed: run.failed, ok: run.ok } });
            res.json(run);
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    runs = async (req: Request, res: Response) => {
        const { limit } = req.query as Record<string, string>;
        res.json(await suiteService.runsHistory(req.params.id as string, limit ? Number(limit) : undefined));
    };
}
