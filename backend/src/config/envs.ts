import 'dotenv/config';
import * as env from 'env-var';

export const envs = {
    PORT:                env.get('PORT').required().asPortNumber(),
    SESSION_SECRET:      env.get('SESSION_SECRET').required().asString(),
    ANTHROPIC_API_KEY:   env.get('ANTHROPIC_API_KEY').required().asString(),
    WORKSPACE_PATH:      env.get('WORKSPACE_PATH').default('./workspace').asString(),
    NOM_USUARIO:         env.get('NOM_USUARIO').required().asString(),
    CLAVE_USUARIO:       env.get('CLAVE_USUARIO').required().asString(),
    SINCO_EMPRESAS_PATH: env.get('SINCO_EMPRESAS_PATH').default('').asString(),
};
