import { encryptPassword } from './crypto.service';

export interface ADPROToken {
    access_token: string;
    token_type: string;
    expires_in: number;
    authorization_token?: string;
}

export interface Empresa {
    Id: number;
    Nombre: string;
    [key: string]: any;
}

export interface Sucursal {
    Id: number;
    Nombre: string;
    [key: string]: any;
}

// Replica exacta de Peticiones() de nodeServer/src/fetch.ts
// Sin chequeo de status HTTP — igual que el nodeServer
async function Peticiones(
    url: string,
    type: 'GET' | 'POST',
    data: any,
    reqPre: boolean,
    _pretoken: any
): Promise<any> {
    const config: any = {
        method: type,
        headers: { 'Content-Type': 'application/json' },
    };

    if (reqPre) {
        // ADPRO puede devolver token_type/access_token (camelCase) o TokenType/AccessToken (PascalCase)
        const tokenType  = _pretoken.token_type  ?? _pretoken.TokenType  ?? 'Bearer';
        const accessToken = _pretoken.access_token ?? _pretoken.AccessToken ?? _pretoken.Token ?? '';
        console.log('[Peticiones] pretoken keys:', Object.keys(_pretoken), '| header:', `${tokenType} ${accessToken.substring(0,20)}...`);
        config.headers.Authorization = `${tokenType} ${accessToken}`;
    }

    if (data !== undefined) config.body = JSON.stringify(data);

    const request = await fetch(url, config as RequestInit);
    const text = await request.text();
    if (!text) throw new Error(`Respuesta vacía — HTTP ${request.status} en ${url}`);
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`HTTP ${request.status} en ${url}: ${text.substring(0, 300)}`);
    }
}

export class AdproAuthService {

    async getEmpresas(urlRaiz: string, nomUsuario: string, claveUsuario: string): Promise<Empresa[]> {
        const _pretoken = await Peticiones(
            `${urlRaiz}/API/Auth/Usuario`, 'POST',
            { NomUsuario: nomUsuario, ClaveUsuario: encryptPassword(claveUsuario) },
            false, null
        );
        console.log('[AUTH] pretoken completo:', JSON.stringify(_pretoken));
        const empresas = await Peticiones(
            `${urlRaiz}/API/Cliente/Empresas`, 'GET',
            undefined, true, _pretoken
        );
        console.log('[AUTH] empresas:', JSON.stringify(empresas));
        return empresas;
    }

    async getSucursales(urlRaiz: string, nomUsuario: string, claveUsuario: string, clienteId: number, empresaId: number): Promise<Sucursal[]> {
        const _pretoken = await Peticiones(
            `${urlRaiz}/API/Auth/Usuario`, 'POST',
            { NomUsuario: nomUsuario, ClaveUsuario: encryptPassword(claveUsuario) },
            false, null
        );
        const sucursales = await Peticiones(
            `${urlRaiz}/API/Cliente/${clienteId}/Empresa/${empresaId}/Sucursales`, 'GET',
            undefined, true, _pretoken
        );
        console.log('[AUTH] sucursales:', JSON.stringify(sucursales));
        return sucursales;
    }

    async login(urlRaiz: string, nomUsuario: string, claveUsuario: string, clienteId: number, empresaId: number, sucursalId: number): Promise<ADPROToken> {
        const _pretoken = await Peticiones(
            `${urlRaiz}/API/Auth/Usuario`, 'POST',
            { NomUsuario: nomUsuario, ClaveUsuario: encryptPassword(claveUsuario) },
            false, null
        );
        await Peticiones(`${urlRaiz}/API/Cliente/Empresas`, 'GET', undefined, true, _pretoken);
        await Peticiones(`${urlRaiz}/API/Cliente/${clienteId}/Empresa/${empresaId}/Sucursales`, 'GET', undefined, true, _pretoken);
        const _token = await Peticiones(
            `${urlRaiz}/API/Auth/Sesion/IniciarMovil/${clienteId}/Empresa/${empresaId}/Sucursal/${sucursalId}`, 'GET',
            undefined, true, _pretoken
        );
        console.log('[AUTH] token final keys:', Object.keys(_token ?? {}), '| full:', JSON.stringify(_token));
        return _token;
    }
}
