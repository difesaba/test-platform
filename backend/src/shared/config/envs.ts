import 'dotenv/config';
import * as env from 'env-var';

export const envs = {
    PORT:                env.get('PORT').required().asPortNumber(),
    SESSION_SECRET:      env.get('SESSION_SECRET').required().asString(),
    ANTHROPIC_API_KEY:   env.get('ANTHROPIC_API_KEY').required().asString(),
    WORKSPACE_PATH:      env.get('WORKSPACE_PATH').default('./workspace').asString(),
    SINCO_EMPRESAS_PATH: env.get('SINCO_EMPRESAS_PATH').default('').asString(),
    SINCO_USERNAME:      env.get('SINCO_USERNAME').default('').asString(),
    SINCO_PASSWORD:      env.get('SINCO_PASSWORD').default('').asString(),
    SINCO_TEAM_ID:       env.get('SINCO_TEAM_ID').default('105').asString(),
    // Usuario del ERP con el que entra el ingreso centralizado (keyC), estilo Torre.
    // En SINCO suele ser 'admin' (cuenta estándar de administración de cada empresa).
    SINCO_ERP_USER:      env.get('SINCO_ERP_USER').default('admin').asString(),
    CHROME_USER_DATA_DIR: env.get('CHROME_USER_DATA_DIR').default('').asString(),

    // Base de datos (SQL Server) — opcional; la app corre sin BD.
    db: {
        enabled:                env.get('DB_ENABLED').default('false').asBool(),
        server:                 env.get('DB_SERVER').default('').asString(),
        port:                   env.get('DB_PORT').default('1433').asPortNumber(),
        name:                   env.get('DB_NAME').default('').asString(),
        user:                   env.get('DB_USER').default('').asString(),
        password:               env.get('DB_PASSWORD').default('').asString(),
        encrypt:                env.get('DB_ENCRYPT').default('true').asBool(),
        trustServerCertificate: env.get('DB_TRUST_CERT').default('true').asBool(),
    },
    E2E_STORE:          env.get("E2E_STORE").default("file").asString(),
    AUDIT_STORE:         env.get('AUDIT_STORE').default('file').asString(),
};
