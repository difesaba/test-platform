import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { envs } from '../../config/envs';

function mapTipo(tipo: string): string {
    const t = (tipo ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (t.includes('replica')) return 'replica';
    if (t.includes('prueba')) return 'prueba';
    return 'produccion';
}

function deriveUrlRaiz(loginUrl: string): string {
    const match = loginUrl.match(/^(https?:\/\/[^/]+\/[^/]+\/[Vv]3)/);
    if (match) return match[1];
    return loginUrl.replace(/\/[^/]*\.[^/]+$/, '');
}

function toClient(entry: any) {
    return {
        id:           entry.Id,
        appName:      entry.Nombre,
        empId:        entry.EmpresaId,
        empNombre:    entry.NombreEmpresa,
        empresaNombre:entry.NombreEmpresa,
        clienteId:    1,
        loginUrl:     entry.URL,
        urlRaiz:      deriveUrlRaiz(entry.URL),
        serverType:    entry.HostingSinco,
        entorno:       mapTipo(entry.Tipo),
        estadoServicio:entry.EstadoServicio ?? 0,
        baseDatos:    (entry.BasesDatos ?? []).map((bd: any) => ({
            Id:       bd.Id,
            Nombre:   bd.Nombre,
            Catalogo: bd.Catalogo,
            Tipo:     bd.Tipo,
            Principal:bd.Principal,
        })),
    };
}

export class SincoController {
    list = (_req: Request, res: Response) => {
        try {
            const filePath = envs.SINCO_EMPRESAS_PATH
                || path.join(process.cwd(), envs.WORKSPACE_PATH, 'sinco-empresas.json');

            if (!fs.existsSync(filePath)) {
                return res.status(503).json({
                    error: `empresas.json no encontrado en ${filePath}. Configura SINCO_EMPRESAS_PATH en .env o ejecuta bot.js.`,
                });
            }

            const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const clients = Array.isArray(raw) ? raw.map(toClient) : [];
            res.json(clients);
        } catch (error: any) {
            res.status(500).json({ error: 'Error leyendo empresas.json: ' + error.message });
        }
    };
}
