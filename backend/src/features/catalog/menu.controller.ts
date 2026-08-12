import { Request, Response } from 'express';
import { MenuService } from './menu.service';

const menuService = new MenuService();

export class MenuController {

    /**
     * GET /api/menus/dump
     * Vuelca los menús del entorno actual usando el token de la sesión
     * (empresa/sucursal ya seleccionadas en el 1-clic). Solo diagnóstico:
     * sirve para ver la forma real del JSON de menús antes de mapearlos.
     */
    dump = async (req: Request, res: Response) => {
        try {
            const sess = req.session as any;
            const urlRaiz = (req.query.urlRaiz as string) || sess.urlRaiz;
            if (!urlRaiz) return res.status(400).json({ error: 'No hay urlRaiz en la sesión ni en la query' });
            const result = await menuService.dump(urlRaiz, sess.adproToken);
            res.json(result);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };
}
