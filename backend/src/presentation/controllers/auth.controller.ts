import { Request, Response } from 'express';
import { AdproAuthService } from '../../services/adpro-auth.service';
import { envs } from '../../config/envs';

function parseUrlRaiz(ingresarUrl: string): string {
    try {
        const url = new URL(ingresarUrl);
        const appNombre = url.pathname.split('/').filter(Boolean)[0];
        return `${url.origin}/${appNombre}/v3`;
    } catch {
        return ingresarUrl.replace(/\/$/, '');
    }
}

const authService = new AdproAuthService();

export class AuthController {

    session = (req: Request, res: Response) => {
        const sess = req.session as any;
        if (!sess.adproToken) return res.json({ isAuthenticated: false });
        res.json({
            isAuthenticated: true,
            empresa:       sess.empresa ?? null,
            sucursal:      sess.sucursal ?? null,
            empresaNombre: sess.empresaNombre,
            entorno:       sess.entorno,
            empNombre:     sess.empNombre,
            urlRaiz:       sess.urlRaiz,
        });
    };

    getEmpresas = async (req: Request, res: Response) => {
        try {
            const { urlIngresar } = req.body;
            if (!urlIngresar) return res.status(400).json({ error: 'Falta urlIngresar' });
            const urlRaiz = parseUrlRaiz(urlIngresar);
            const empresas = await authService.getEmpresas(urlRaiz, envs.NOM_USUARIO, envs.CLAVE_USUARIO);
            res.json({ urlRaiz, empresas });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    getSucursales = async (req: Request, res: Response) => {
        try {
            console.log('[getSucursales] body recibido:', JSON.stringify(req.body));
            const { urlRaiz, clienteId, empresaId } = req.body;
            const sucursales = await authService.getSucursales(
                urlRaiz ?? '',
                envs.NOM_USUARIO,
                envs.CLAVE_USUARIO,
                Number(clienteId ?? 1),
                Number(empresaId)
            );
            const etiquetadas = sucursales.map((s: any) => ({
                ...s,
                entorno: s.NombreBaseDatos?.startsWith('REPLICA_') ? 'replica'
                       : s.NombreBaseDatos?.endsWith('_PRBINT')   ? 'prueba'
                       : 'produccion',
            }));
            res.json(etiquetadas);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    login = async (req: Request, res: Response) => {
        try {
            const { urlRaiz, clienteId, empresaId, sucursalId, entornoName, empresaNombre, sucursalNombre, empNombre } = req.body;
            if (!urlRaiz || empresaId == null || empresaId === '' || sucursalId == null || sucursalId === '') {
                return res.status(400).json({ error: 'Faltan parámetros requeridos' });
            }
            const token = await authService.login(urlRaiz, envs.NOM_USUARIO, envs.CLAVE_USUARIO, clienteId ?? 1, empresaId, sucursalId);
            const sess = req.session as any;
            sess.adproToken    = token;
            sess.urlRaiz       = urlRaiz;
            sess.clienteId     = Number(clienteId ?? 1);
            sess.empresa       = { id: Number(empresaId), nombre: empresaNombre ?? '' };
            sess.sucursal      = { id: Number(sucursalId), nombre: sucursalNombre ?? '', entorno: entornoName ?? 'produccion' };
            sess.empresaNombre = empresaNombre;
            sess.entorno       = { urlRaiz, name: entornoName };
            sess.empNombre     = empNombre;
            res.json({ ok: true });
        } catch (e: any) {
            res.status(401).json({ error: e.message });
        }
    };

    logout = (req: Request, res: Response) => {
        req.session.destroy(() => res.json({ ok: true }));
    };
}
