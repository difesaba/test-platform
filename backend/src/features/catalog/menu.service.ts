import { captureAdproToken } from '../auth/playwright-auth.service';

// Endpoints de menús del ERP (sobre urlRaiz del entorno).
const MENU_ENDPOINTS = ['Modulos', 'Aplicacion', 'GestionConfig', 'AccesoRapido', 'TipoEmergente'];

// Construye el "doble token" igual que Peticiones (adpro-auth.service).
function authHeaders(token: any): Record<string, string> {
    const tokenType   = token.token_type  ?? token.TokenType  ?? 'Bearer';
    const accessToken = token.access_token ?? token.AccessToken ?? token.Token ?? '';
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `${tokenType} ${accessToken}`,
    };
    const authTok = token.authorization_token ?? token.AuthorizationToken;
    if (authTok) headers['X-SincoERP-Authorization'] = authTok;
    return headers;
}

async function callMenu(urlRaiz: string, ep: string, token: any): Promise<{ status: number; data: any }> {
    const res = await fetch(`${urlRaiz.replace(/\/$/, '')}/API/Menus/${ep}`, { headers: authHeaders(token) });
    const txt = await res.text();
    let data: any = null;
    try { data = JSON.parse(txt); } catch { data = txt.slice(0, 500); }
    return { status: res.status, data };
}

export class MenuService {

    /**
     * Vuelca la estructura de menús de un entorno.
     * Usa el token de la sesión (con empresa/sucursal ya elegidas). Si no se pasa,
     * cae a un token admin (keyC) fresco a nivel Selección — útil solo de diagnóstico.
     */
    async dump(urlRaiz: string, sessionToken?: any, loginUrl?: string): Promise<any> {
        const raiz = urlRaiz.replace(/\/$/, '');
        const token = sessionToken ?? await captureAdproToken(loginUrl ?? `${raiz}/Marco/Login.aspx`);
        const out: any = { urlRaiz: raiz, usandoTokenSesion: !!sessionToken, endpoints: {} as Record<string, any> };
        for (const ep of MENU_ENDPOINTS) {
            try {
                out.endpoints[ep] = await callMenu(raiz, ep, token);
            } catch (e: any) {
                out.endpoints[ep] = { status: 0, error: e.message };
            }
        }
        return out;
    }
}
