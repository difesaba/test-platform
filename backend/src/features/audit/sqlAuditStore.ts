import { executeQuery, executeQueryParam, sql } from '../../shared/database/index';
import type { AuditStore, AuditEvent, AuditType } from './audit.service';

/** Fila cruda tal como vuelve de dbo.audit_events. */
interface AuditRow {
    id: string;
    ts: Date;
    type: string;
    action: string;
    target: string;
    empresa_nombre: string | null;
    entorno: string | null;
    url_raiz: string | null;
    meta: string | null;
}

/**
 * Almacenamiento de auditoría en SQL Server (dbo.audit_events).
 * Nunca relanza: un fallo de BD no debe tumbar la app ni el flujo que audita.
 */
export class SqlAuditStore implements AuditStore {
    async append(e: AuditEvent): Promise<void> {
        try {
            await executeQueryParam(
                `INSERT INTO dbo.audit_events
                    (id, ts, [type], [action], target, empresa_nombre, entorno, url_raiz, meta)
                 VALUES
                    (@id, @ts, @type, @action, @target, @empresa_nombre, @entorno, @url_raiz, @meta)`,
                [
                    { name: 'id', type: sql.UniqueIdentifier, value: e.id },
                    { name: 'ts', type: sql.DateTime2, value: new Date(e.ts) },
                    { name: 'type', type: sql.VarChar, value: e.type },
                    { name: 'action', type: sql.NVarChar, value: e.action },
                    { name: 'target', type: sql.NVarChar, value: e.target },
                    { name: 'empresa_nombre', type: sql.NVarChar, value: e.empresaNombre ?? null },
                    { name: 'entorno', type: sql.NVarChar, value: e.entorno ?? null },
                    { name: 'url_raiz', type: sql.NVarChar, value: e.urlRaiz ?? null },
                    { name: 'meta', type: sql.NVarChar, value: e.meta ? JSON.stringify(e.meta) : null },
                ],
            );
        } catch (err) {
            console.error('[audit] SqlAuditStore.append falló', err);
        }
    }

    async list(limit: number): Promise<AuditEvent[]> {
        try {
            const rows = await executeQuery<AuditRow>(
                `SELECT TOP (${Number(limit) || 0})
                    id, ts, [type], [action], target, empresa_nombre, entorno, url_raiz, meta
                 FROM dbo.audit_events
                 ORDER BY ts DESC`,
            );
            // FileAuditStore devuelve los últimos N del más viejo al más nuevo: invertimos el DESC.
            return rows.reverse().map((row) => {
                const ev: AuditEvent = {
                    id: row.id,
                    ts: new Date(row.ts).toISOString(),
                    type: row.type as AuditType,
                    action: row.action,
                    target: row.target,
                    empresaNombre: row.empresa_nombre ?? undefined,
                    entorno: row.entorno ?? undefined,
                    urlRaiz: row.url_raiz ?? undefined,
                    meta: row.meta ? (JSON.parse(row.meta) as Record<string, unknown>) : undefined,
                };
                return ev;
            });
        } catch (err) {
            console.error('[audit] SqlAuditStore.list falló', err);
            return [];
        }
    }
}
