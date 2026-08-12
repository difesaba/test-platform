import { getPool, sql } from './pool';

export interface QueryParam {
    name: string;
    type: sql.ISqlType | (() => sql.ISqlType);
    value: unknown;
}

/**
 * Ejecuta una query cruda (sin parámetros). Úsalo solo para sentencias sin input de usuario.
 */
export async function executeQuery<T = Record<string, unknown>>(query: string): Promise<T[]> {
    const pool = await getPool();
    const result = await pool.request().query<T>(query);
    return result.recordset;
}

/**
 * Ejecuta una query parametrizada (previene inyección SQL).
 */
export async function executeQueryParam<T = Record<string, unknown>>(
    query: string,
    params: QueryParam[] = [],
): Promise<T[]> {
    const pool = await getPool();
    const request = pool.request();
    for (const p of params) {
        request.input(p.name, p.type as sql.ISqlType, p.value);
    }
    const result = await request.query<T>(query);
    return result.recordset;
}

/**
 * Ejecuta un stored procedure.
 */
export async function executeProcedure<T = Record<string, unknown>>(
    procedureName: string,
    params: QueryParam[] = [],
): Promise<T[]> {
    const pool = await getPool();
    const request = pool.request();
    for (const p of params) {
        request.input(p.name, p.type as sql.ISqlType, p.value);
    }
    const result = await request.execute<T>(procedureName);
    return result.recordset;
}

export { sql };
