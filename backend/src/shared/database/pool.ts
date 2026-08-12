import sql from 'mssql';
import { envs } from '../config/envs';

let poolPromise: Promise<sql.ConnectionPool> | null = null;

const config: sql.config = {
    user: envs.db.user,
    password: envs.db.password,
    server: envs.db.server,
    port: envs.db.port,
    database: envs.db.name,
    options: {
        encrypt: envs.db.encrypt,
        trustServerCertificate: envs.db.trustServerCertificate,
    },
    pool: {
        max: 20,
        min: 0,
        idleTimeoutMillis: 30000,
    },
};

/**
 * Devuelve un único pool de conexión (singleton). Reconecta si el pool previo falló.
 */
export async function getPool(): Promise<sql.ConnectionPool> {
    if (!poolPromise) {
        poolPromise = new sql.ConnectionPool(config)
            .connect()
            .then((pool) => {
                console.log(`[db] MSSQL conectado (server=${envs.db.server} db=${envs.db.name})`);
                pool.on('error', (err) => {
                    console.error('[db] error en el pool MSSQL', err);
                    poolPromise = null;
                });
                return pool;
            })
            .catch((err) => {
                poolPromise = null;
                console.error('[db] no se pudo conectar a MSSQL', err);
                throw err;
            });
    }
    return poolPromise;
}

export async function closePool(): Promise<void> {
    if (poolPromise) {
        const pool = await poolPromise;
        await pool.close();
        poolPromise = null;
    }
}

export { sql };
