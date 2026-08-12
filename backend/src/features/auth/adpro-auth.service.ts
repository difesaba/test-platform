import { captureAdproToken } from './playwright-auth.service';
import type { ADPROToken, Empresa, Sucursal } from '../../shared/models/adpro.model';

// Re-export para compatibilidad con quien los importe desde este servicio.
export type { ADPROToken, Empresa, Sucursal };

// Llama una API del ERP. Si reqPre, agrega el "doble token" del login centralizado:
//   Authorization: <tokenType> <accessToken>   +   X-SincoERP-Authorization: <authorization_token>
async function Peticiones(
    url: string,
    type: 'GET' | 'POST',
    data: any,
    reqPre: boolean,
    _pretoken: any
): Promise<any> {
    const config: any = {
        method: type,
        headers: { 'Content-Type': 'application/json' } as Record<string, string>,
    };

    if (reqPre) {
        const tokenType   = _pretoken.token_type  ?? _pretoken.TokenType  ?? 'Bearer';
        const accessToken = _pretoken.access_token ?? _pretoken.AccessToken ?? _pretoken.Token ?? '';
        config.headers.Authorization = `${tokenType} ${accessToken}`;
        const authTok = _pretoken.authorization_token ?? _pretoken.AuthorizationToken;
        if (authTok) config.headers['X-SincoERP-Authorization'] = authTok;
        console.log('[Peticiones] auth:', `${tokenType} ${String(accessToken).substring(0, 16)}...`, authTok ? '(+X-SincoERP-Authorization)' : '');
    }

    if (data !== undefined) config.body = JSON.stringify(data);

    const request = await fetch(url, config as RequestInit);
    const text = await request.text();
    if (!text) throw new Error(`Respuesta vacía — HTTP ${request.status} en ${url}`);
    if (!request.ok) {
        let detail = text.substring(0, 400);
        try { detail = JSON.stringify(JSON.parse(text)); } catch {}
        throw new Error(`HTTP ${request.status} en ${url}: ${detail}`);
    }
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`HTTP ${request.status} en ${url}: ${text.substring(0, 300)}`);
    }
}

function loginUrlFor(urlRaiz: string): string {
    return `${urlRaiz.replace(/\/$/, '')}/Marco/Login.aspx`;
}

// Caché del token scoped a ADPRO por (urlRaiz|empresa|sucursal). El access_token de IniciarMovil expira,
// así que TTL corto.
const adproScopedCache = new Map<string, { token: ADPROToken; expiresAt: number }>();
const ADPRO_SCOPED_TTL = 10 * 60 * 1000; // 10 min

export class AdproAuthService {

    // Todas las operaciones usan el token de `admin` obtenido por keyC (login centralizado
    // estilo Torre). NO se usan credenciales de usuario (desarrolladorcbr).

    async getEmpresas(urlRaiz: string): Promise<Empresa[]> {
        const token = await captureAdproToken(loginUrlFor(urlRaiz));
        const empresas = await Peticiones(`${urlRaiz}/API/Cliente/Empresas`, 'GET', undefined, true, token);
        console.log('[AUTH] empresas:', Array.isArray(empresas) ? empresas.length : 0);
        return empresas;
    }

    async getSucursales(urlRaiz: string, clienteId: number, empresaId: number): Promise<Sucursal[]> {
        const token = await captureAdproToken(loginUrlFor(urlRaiz));
        const sucursales = await Peticiones(
            `${urlRaiz}/API/Cliente/${clienteId}/Empresa/${empresaId}/Sucursales`, 'GET',
            undefined, true, token
        );
        console.log('[AUTH] sucursales:', Array.isArray(sucursales) ? sucursales.length : 0);
        return sucursales;
    }

    /**
     * Intercambia un token del Marco (ya en sesión) por el token scoped a ADPRO vía IniciarMovil,
     * sin re-loguear. Es lo que hace el front (generarTokenEntorno): el Bearer del Marco NO sirve
     * para /ADPRO/api; hay que llamar IniciarMovil y usar su access_token. Cacheado ~10 min.
     */
    async exchangeForAdpro(urlRaiz: string, clienteId: number, empresaId: number, sucursalId: number | undefined, marcoToken: any, empresaNombre?: string): Promise<ADPROToken> {
        const base = urlRaiz.replace(/\/+$/, '');
        // El Marco puede exigir X-SincoERP-Authorization; usamos el access_token como fallback (igual que UI).
        const pre = { ...marcoToken, authorization_token: marcoToken?.authorization_token ?? marcoToken?.access_token };
        const cli = clienteId || 1;

        // Si la empresa viene en 0 (el login 1-clic no la captura), la resolvemos de la lista del cliente.
        let emp = empresaId;
        if (!emp) {
            try {
                const empresas = await Peticiones(`${base}/API/Cliente/${cli}/Empresas`, 'GET', undefined, true, pre);
                if (Array.isArray(empresas) && empresas.length) {
                    const norm = (s: any) => String(s ?? '').trim().toLowerCase();
                    const match = empresaNombre
                        ? empresas.find((e: any) => norm(e.Nombre ?? e.nombre ?? e.NombreEmpresa ?? e.Descripcion) === norm(empresaNombre))
                        : null;
                    const chosen = match ?? empresas[0];
                    emp = chosen.Id ?? chosen.id ?? chosen.IdEmpresa ?? chosen.EmpresaId;
                    console.log('[AUTH] empresa resuelta →', emp, '(', chosen.Nombre ?? chosen.nombre ?? chosen.NombreEmpresa, ')');
                }
            } catch (e: any) { console.warn('[AUTH] Empresas falló:', e?.message); }
        }

        let suc = sucursalId;
        if (!suc && emp) {
            try {
                const sucursales = await Peticiones(`${base}/API/Cliente/${cli}/Empresa/${emp}/Sucursales`, 'GET', undefined, true, pre);
                if (Array.isArray(sucursales) && sucursales.length) suc = sucursales[0].Id ?? sucursales[0].id ?? sucursales[0].IdSucursal;
            } catch (e: any) { console.warn('[AUTH] Sucursales falló:', e?.message); }
        }

        const cacheKey = `${base}|${cli}|${emp}|${suc}`;
        const cached = adproScopedCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) return cached.token;

        const _token = await Peticiones(`${base}/API/Auth/Sesion/IniciarMovil/${cli}/Empresa/${emp}/Sucursal/${suc}`, 'GET', undefined, true, pre);
        const scoped: ADPROToken = {
            access_token:        _token?.access_token ?? _token?.AccessToken ?? _token?.Token ?? marcoToken?.access_token,
            token_type:          _token?.token_type ?? _token?.TokenType ?? 'Bearer',
            expires_in:          _token?.expires_in ?? 0,
            authorization_token: _token?.authorization_token ?? _token?.AuthorizationToken ?? marcoToken?.authorization_token,
        };
        adproScopedCache.set(cacheKey, { token: scoped, expiresAt: Date.now() + ADPRO_SCOPED_TTL });
        console.log('[AUTH] IniciarMovil (exchange) → access_token', scoped.access_token ? 'sí' : 'no', '| cliente/empresa/sucursal:', cli, emp, suc);
        return scoped;
    }

    async login(urlRaiz: string, clienteId: number, empresaId: number, sucursalId: number): Promise<ADPROToken> {
        const token = await captureAdproToken(loginUrlFor(urlRaiz));
        const _token = await Peticiones(
            `${urlRaiz}/API/Auth/Sesion/IniciarMovil/${clienteId}/Empresa/${empresaId}/Sucursal/${sucursalId}`, 'GET',
            undefined, true, token
        );
        console.log('[AUTH] IniciarMovil respuesta:', _token && typeof _token === 'object' ? Object.keys(_token) : typeof _token);
        // Busca el authorization_token bajo cualquier nombre razonable (recursivo un nivel).
        const pickAuth = (o: any, depth = 0): string | undefined => {
            if (!o || typeof o !== 'object' || depth > 2) return undefined;
            for (const k of Object.keys(o)) {
                if (/authoriz|token[_-]?auth/i.test(k) && typeof o[k] === 'string' && o[k].length > 10) return o[k];
            }
            for (const k of Object.keys(o)) {
                if (o[k] && typeof o[k] === 'object') { const v = pickAuth(o[k], depth + 1); if (v) return v; }
            }
            return undefined;
        };
        // Doble token: access_token de IniciarMovil + authorization_token (de IniciarMovil o del admin keyC).
        const final: ADPROToken = {
            access_token:        _token?.access_token ?? _token?.AccessToken ?? _token?.Token ?? token.access_token,
            token_type:          _token?.token_type ?? _token?.TokenType ?? token.token_type ?? 'Bearer',
            expires_in:          _token?.expires_in ?? token.expires_in ?? 0,
            authorization_token: pickAuth(_token) ?? _token?.authorization_token ?? token.authorization_token,
        };
        console.log('[AUTH] token final keys:', Object.keys(final), '| authorization_token:', final.authorization_token ? 'sí (' + String(final.authorization_token).slice(0, 20) + '…)' : 'NO');
        return final;
    }
}
