import { Request, Response } from 'express';
import { AdproAuthService } from './adpro-auth.service';
import { loginWithKeyC } from './playwright-auth.service';


const authService = new AdproAuthService();

function labelEntorno(nombreBaseDatos?: string): string {
    if (nombreBaseDatos?.startsWith('REPLICA_')) return 'replica';
    if (nombreBaseDatos?.endsWith('_PRBINT'))   return 'prueba';
    return 'produccion';
}

function entornoFromUrl(url?: string): string {
    const u = (url ?? '').toLowerCase();
    if (u.includes('kilauea')) return 'replica';
    if (u.includes('pruebas')) return 'prueba';
    return 'produccion';
}

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
            const { urlRaiz } = req.body;
            if (!urlRaiz) return res.status(400).json({ error: 'Falta urlRaiz' });
            const empresas = await authService.getEmpresas(urlRaiz);
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
                Number(clienteId ?? 1),
                Number(empresaId)
            );
            const etiquetadas = sucursales.map((s: any) => ({
                ...s,
                entorno: labelEntorno(s.NombreBaseDatos),
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
            const token = await authService.login(urlRaiz, clienteId ?? 1, empresaId, sucursalId);
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

    /**
     * Ingreso 1-clic estilo Torre.
     * Usa el keyC de login centralizado + Playwright para entrar a la empresa
     * ya autenticada y capturar el token que emite ADPRO.
     * Body: { loginUrl, urlRaiz, empresaNombre?, empNombre?, entornoName?, usuario? }
     */
    quickLogin = async (req: Request, res: Response) => {
        try {
            const { loginUrl, urlRaiz, empresaNombre, empNombre, entornoName, usuario } = req.body;
            if (!loginUrl) return res.status(400).json({ error: 'Falta loginUrl' });

            const entorno = entornoName ?? entornoFromUrl(loginUrl);

            // Entrar vía keyC (POST estilo Torre) y capturar el token de ADPRO
            const token = await loginWithKeyC(loginUrl, usuario);

            const empresaIdTok  = token.empresaId  ?? token.EmpresaId  ?? token.IdEmpresa  ?? 0;
            const sucursalIdTok = token.sucursalId ?? token.SucursalId ?? token.IdSucursal ?? 0;

            const sess = req.session as any;
            sess.adproToken    = token;
            sess.urlRaiz       = urlRaiz ?? '';
            sess.clienteId     = 1;
            sess.empresa       = { id: Number(empresaIdTok), nombre: empresaNombre ?? '' };
            sess.sucursal      = { id: Number(sucursalIdTok), nombre: '', entorno };
            sess.empresaNombre = empresaNombre ?? '';
            sess.entorno       = { urlRaiz: urlRaiz ?? '', name: entorno };
            sess.empNombre     = empNombre ?? '';

            res.json({
                ok: true,
                urlRaiz: urlRaiz ?? '',
                empresaNombre: empresaNombre ?? '',
                empresa:  sess.empresa,
                sucursal: sess.sucursal,
            });
        } catch (e: any) {
            res.status(401).json({ error: e.message });
        }
    };

    logout = (req: Request, res: Response) => {
        req.session.destroy(() => res.json({ ok: true }));
    };
}
