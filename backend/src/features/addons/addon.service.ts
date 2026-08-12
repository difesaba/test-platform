import fs from 'fs';
import axios from 'axios';
import { encryptPassword } from '../../shared/helpers/crypto';
import { envs } from '../../shared/config/envs';

export interface AddonRequest {
    id: number;
    addonNumber: number | null;
    grupo: string;
    asunto: string;
    empresa: string;
    sucursal: string;
    responsable: string;
    fecha: string;
    fechaVencimiento: string;
    estado: number;
    cantidadReplicas: number;
    urlRaiz: string | null;
    loginUrl: string | null;
    addonUrl: string | null;
}

function parseAddonNumber(asunto: string): number | null {
    const match = asunto.match(/Addon\s+(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
}

function deriveUrlRaiz(loginUrl: string): string {
    const match = loginUrl.match(/^(https?:\/\/[^/]+\/[^/]+\/[Vv]3)/);
    if (match) return match[1];
    return loginUrl.replace(/\/[^/]*\.[^/]+$/, '');
}

function resolveUrls(idBaseDatos: number): { urlRaiz: string; loginUrl: string } | null {
    const filePath = envs.SINCO_EMPRESAS_PATH;
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
        const raw: any[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const entry = raw.find((e: any) =>
            Array.isArray(e.BasesDatos) && e.BasesDatos.some((bd: any) => bd.Id === idBaseDatos)
        );
        if (!entry?.URL) return null;
        return { urlRaiz: deriveUrlRaiz(entry.URL), loginUrl: entry.URL };
    } catch {
        return null;
    }
}

class CookieJar {
    private store = new Map<string, string>();
    ingest(h: string | string[] | undefined) {
        for (const header of (Array.isArray(h) ? h : h ? [h] : [])) {
            const eq = header.indexOf('='), sc = header.indexOf(';');
            if (eq > 0) this.store.set(header.slice(0, eq).trim(), header.slice(eq + 1, sc > eq ? sc : undefined).trim());
        }
    }
    header() { return [...this.store.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }
}

const BASE = 'https://core.sincoerp.com/SincoSoporte';

async function torreGet(path: string): Promise<any> {
    const jar = new CookieJar();
    const http = axios.create({ validateStatus: () => true });

    // Autenticar con password AES-encriptado (igual que bot.js step2 y torre.service.ts)
    const authRes = await http.post(
        `${BASE}/API/Trabajadores/Validar`,
        { usuario: envs.SINCO_USERNAME, password: encryptPassword(envs.SINCO_PASSWORD) },
        { headers: { 'Content-Type': 'application/json' } },
    );
    jar.ingest(authRes.headers['set-cookie']);

    const res = await http.get(`${BASE}${path}`, {
        headers: { Cookie: jar.header() },
    });

    if (res.status >= 400) {
        throw new Error(`HTTP ${res.status} en ${path}`);
    }
    return res.data;
}

export class AddonService {
    async list(): Promise<AddonRequest[]> {
        const teamId = envs.SINCO_TEAM_ID || '105';
        const raw = await torreGet(`/Api/Mensajes/equipo/${teamId}`);

        // La API devuelve grupos (equipos), cada uno con Mensajes[] adentro — aplanar preservando el nombre del grupo
        const data: { msg: any; grupoNombre: string }[] = Array.isArray(raw)
            ? raw.flatMap((grupo: any) =>
                (grupo.Mensajes ?? []).map((msg: any) => ({ msg, grupoNombre: grupo.Descripcion ?? '' }))
              )
            : [];

        return data
            .filter(({ msg }) => msg.Tipo === 'ADDON')
            .map(({ msg: m, grupoNombre }) => {
                let session: any = {};
                try { session = JSON.parse(m.valoresSesion || '{}'); } catch {}

                const addonNumber = parseAddonNumber(m.Asunto ?? '');
                const idBaseDatos: number = session.idBaseDatos;
                const urls = idBaseDatos ? resolveUrls(idBaseDatos) : null;

                return {
                    id: m.Id,
                    addonNumber,
                    grupo: grupoNombre,
                    asunto: m.Asunto ?? '',
                    empresa: m.Empresa?.Nombre ?? session.NomEmpresa ?? session.razonSocial ?? '',
                    sucursal: session.NombreSucursal ?? '',
                    responsable: m.Responsable ?? '',
                    fecha: m.Fecha ?? '',
                    fechaVencimiento: m.FechaVencimiento ?? '',
                    estado: m.Estado_Id ?? 0,
                    cantidadReplicas: m.CantidadReplicas ?? 0,
                    urlRaiz: urls?.urlRaiz ?? null,
                    loginUrl: urls?.loginUrl ?? null,
                    addonUrl: urls?.urlRaiz
                        ? `${urls.urlRaiz}/ADPRO/Views/reactapp/#/mantenimiento/addons`
                        : null,
                };
            });
    }
}
