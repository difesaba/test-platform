import fs from 'fs';
import path from 'path';

interface Client {
    id: number;
    appName: string;
    empId: number;
    empNombre: string;
    empresaNombre: string;
    clienteId: number;
    activo: boolean;
    parentId: number | null;
    loginUrl: string;
    urlRaiz: string;
    serverType: number;
    entorno: 'produccion' | 'prueba' | 'replica';
}

const ENTORNO_MAP: Record<string, 'produccion' | 'prueba' | 'replica'> = {
    '1': 'produccion',
    '2': 'prueba',
    '3': 'replica',
};

function getUrlRaiz(loginUrl: string): string {
    try {
        const url = new URL(loginUrl);
        const firstSegment = url.pathname.split('/').filter(Boolean)[0];
        return `${url.origin}/${firstSegment}/v3`;
    } catch {
        return '';
    }
}

const rawFile = path.join(__dirname, 'raw-clients.txt');
const outFile = path.join(__dirname, '..', 'workspace', 'clients.json');

// Columns (11): EMPid | EMPnombre | BdId | BdNombre | BdNombreCliente | BdEmpresa | BdActivo | BdAspMult | BdWebDireccion | BdCategoria | tipoBaseDatos
//                 0        1         2       3              4               5           6          7               8              9              10
const lines = fs.readFileSync(rawFile, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

type RawRow = {
    empId: number;
    empNombre: string;
    id: number;
    appName: string;
    empresaNombre: string;
    clienteId: number;
    activo: boolean;
    parentId: number | null;
    loginUrl: string | null;
    serverType: number;
    entorno: 'produccion' | 'prueba' | 'replica';
};

const rawRows = lines.map((line): RawRow | null => {
    const cols = line.split('\t');
    if (cols.length < 11) return null;
    const loginUrl = cols[8].trim() === 'NULL' ? null : cols[8].trim();
    return {
        empId:        parseInt(cols[0]),
        empNombre:    cols[1].trim(),
        id:           parseInt(cols[2]),
        appName:      cols[3].trim(),
        empresaNombre: cols[4].trim(),
        clienteId:    parseInt(cols[5]),
        activo:       cols[6].trim() === '1',
        parentId:     cols[7].trim() === 'NULL' ? null : parseInt(cols[7]),
        loginUrl,
        serverType:   parseInt(cols[9]) || 0,
        entorno:      ENTORNO_MAP[cols[10].trim()] ?? 'produccion',
    };
}).filter(Boolean) as RawRow[];

// Index for URL inheritance: (clienteId, entorno) → first URL found
const urlByClientEntorno = new Map<string, string>();
const urlByClient = new Map<string, string>();
for (const r of rawRows) {
    if (!r.loginUrl) continue;
    const key = `${r.clienteId}|${r.entorno}`;
    if (!urlByClientEntorno.has(key)) urlByClientEntorno.set(key, r.loginUrl);
    const k2 = String(r.clienteId);
    if (!urlByClient.has(k2)) urlByClient.set(k2, r.loginUrl);
}

function resolveUrl(r: RawRow): string | null {
    return r.loginUrl
        ?? urlByClientEntorno.get(`${r.clienteId}|${r.entorno}`)
        ?? urlByClient.get(String(r.clienteId))
        ?? null;
}

const activeRows = rawRows.filter(r => r.activo);
const clients: Client[] = [];
let noUrlCount = 0;

for (const r of activeRows) {
    const url = resolveUrl(r);
    if (!url) { noUrlCount++; continue; }
    clients.push({
        id:           r.id,
        appName:      r.appName,
        empId:        r.empId,
        empNombre:    r.empNombre,
        empresaNombre: r.empresaNombre,
        clienteId:    r.clienteId,
        activo:       r.activo,
        parentId:     r.parentId,
        loginUrl:     url,
        urlRaiz:      getUrlRaiz(url),
        serverType:   r.serverType,
        entorno:      r.entorno,
    });
}

fs.writeFileSync(outFile, JSON.stringify(clients, null, 2), 'utf-8');
console.log(`✅ Generados ${clients.length} clientes activos → workspace/clients.json`);
console.log(`   Inactivos omitidos: ${rawRows.length - activeRows.length}`);
if (noUrlCount > 0) console.log(`   ⚠️  Sin URL resolvible (omitidos): ${noUrlCount}`);
