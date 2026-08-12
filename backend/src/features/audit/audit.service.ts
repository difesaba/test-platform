import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { envs } from '../../shared/config/envs';
import { SqlAuditStore } from './sqlAuditStore';

export type AuditType = 'structural' | 'execution';

export interface AuditEvent {
    id: string;
    ts: string;
    type: AuditType;
    action: string;
    target: string;
    empresaNombre?: string;
    entorno?: string;
    urlRaiz?: string;
    meta?: Record<string, any>;
}

/**
 * Abstracción de almacenamiento de auditoría.
 * Hoy: archivo JSONL (FileAuditStore) o SQL Server (SqlAuditStore), seleccionable por config.
 * El evento ya viene normalizado (id, ts, type, action, target, empresa, entorno, meta)
 * y mapea 1:1 a una tabla (meta como columna JSON).
 */
export interface AuditStore {
    append(e: AuditEvent): Promise<void>;
    list(limit: number): Promise<AuditEvent[]>;
}

export class FileAuditStore implements AuditStore {
    private file: string;
    constructor(file?: string) {
        this.file = file ?? path.join(process.cwd(), envs.WORKSPACE_PATH, 'audit.log.jsonl');
    }
    async append(e: AuditEvent): Promise<void> {
        try {
            fs.mkdirSync(path.dirname(this.file), { recursive: true });
            fs.appendFileSync(this.file, JSON.stringify(e) + '\n', 'utf-8');
        } catch { /* noop */ }
    }
    async list(limit: number): Promise<AuditEvent[]> {
        try {
            if (!fs.existsSync(this.file)) return [];
            const lines = fs.readFileSync(this.file, 'utf-8').split('\n').filter(Boolean);
            return lines.slice(-limit)
                .map((l) => { try { return JSON.parse(l) as AuditEvent; } catch { return null; } })
                .filter(Boolean) as AuditEvent[];
        } catch { return []; }
    }
}

/**
 * Punto único de selección del backend de almacenamiento.
 * SQL Server solo si AUDIT_STORE === 'sqlserver' y la BD está habilitada; si no, archivos (default,
 * sin regresión).
 */
function createStore(): AuditStore {
    if (envs.AUDIT_STORE === 'sqlserver' && envs.db.enabled) {
        return new SqlAuditStore();
    }
    return new FileAuditStore();
}

class AuditService {
    private emitter = new EventEmitter();
    private store: AuditStore;

    constructor(store: AuditStore = createStore()) {
        this.store = store;
        this.emitter.setMaxListeners(0);
    }

    record(evt: Omit<AuditEvent, 'id' | 'ts'>): AuditEvent {
        const full: AuditEvent = { id: randomUUID(), ts: new Date().toISOString(), ...evt };
        // Persistencia en background: no bloquea el SSE ni el flujo que audita.
        void this.store.append(full).catch((err) => console.error('audit append failed', err));
        this.emitter.emit('event', full);
        return full;
    }

    async list(limit = 300): Promise<AuditEvent[]> {
        return this.store.list(limit);
    }

    subscribe(cb: (e: AuditEvent) => void): () => void {
        this.emitter.on('event', cb);
        return () => { this.emitter.off('event', cb); };
    }
}

export const auditService = new AuditService();
