import { Request, Response } from 'express';
import { ApiTestService } from './apiTest.service';
import { BatchHistoryService } from '../batch/batchHistory.service';

const svc = new ApiTestService();
const historySvc = new BatchHistoryService();

export class ApiTestsController {

    list = (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        res.json(svc.list(mod, submodule, page));
    };

    create = (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        const test = svc.create(mod, req.body, submodule, page);
        res.status(201).json(test);
    };

    update = (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            const test = svc.update(mod, (req.params.id as string), req.body ?? {}, submodule, page);
            res.json(test);
        } catch (e: any) { res.status(404).json({ error: e.message }); }
    };

    remove = (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        svc.delete(mod, (req.params.id as string), submodule, page);
        res.json({ ok: true });
    };

    run = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            const sess = req.session as any;
            const adproToken = sess?.adproToken;
            const empresaNombre = sess?.empresa?.nombre ?? sess?.empresaNombre;
            const sucursalNombre = sess?.sucursal?.nombre;
            const result = await svc.run(mod, (req.params.id as string), submodule, page, adproToken, empresaNombre, sucursalNombre, {}, sess?.urlRaiz, sess?.clienteId, sess?.empresa?.id, sess?.sucursal?.id);
            res.json(result);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    batchRun = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        const { testIds, companies, sourceUrlRaiz } = req.body;
        if (!testIds?.length || !companies?.length || !sourceUrlRaiz) {
            return res.status(400).json({ error: 'Faltan testIds, companies o sourceUrlRaiz' });
        }
        try {
            const sess = req.session as any;
            const allTests = svc.list(mod, submodule, page);
            const testsToRun = allTests.filter((t: any) => testIds.includes(t.id));
            const results = await svc.batchRun({
                moduleName: mod, submodule, page,
                testIds, companies, sourceUrlRaiz,
                sourceToken: sess?.adproToken,
            });

            // Auto-guardar en historial
            const passed = results.filter((r: any) => r.ok).length;
            const record = historySvc.save({
                moduleContext: { module: mod, submodule, page },
                companies,
                testNames: Object.fromEntries(testsToRun.map((t: any) => [t.id, t.name])),
                results,
                summary: { total: results.length, passed, failed: results.length - passed },
            });

            res.json({ results, recordId: record.id });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };
}
