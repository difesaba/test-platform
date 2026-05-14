import { Request, Response } from 'express';
import { ApiTestService } from '../../services/apiTest.service';

const svc = new ApiTestService();

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
            const sess = req.session as any;
            const adproToken = sess?.adproToken;
            const empresaNombre = sess?.empresa?.nombre ?? sess?.empresaNombre;
            const sucursalNombre = sess?.sucursal?.nombre;
            const result = await svc.run(mod, req.params.id, submodule, page, adproToken, empresaNombre, sucursalNombre);
            res.json(result);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };
}
