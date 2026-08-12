import axios from 'axios';
import { encryptPassword } from '../../shared/helpers/crypto';
import { envs } from '../../shared/config/envs';

const BASE      = 'https://core.sincoerp.com/SincoSoporte';
const CONN_DATA = JSON.stringify([
    { name: 'myhub' },
    { name: 'releasemanager' },
    { name: 'clientes' },
    { name: 'entornos' },
]);

interface KeyCache {
    key: string;
    expiresAt: number;
}

class CookieJar {
    private store = new Map<string, string>();

    ingest(setCookieHeader: string | string[] | undefined) {
        const headers = Array.isArray(setCookieHeader) ? setCookieHeader
            : setCookieHeader ? [setCookieHeader] : [];
        for (const h of headers) {
            const [pair] = h.split(';');
            const eq = pair.indexOf('=');
            if (eq > 0) this.store.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
        }
    }

    header(): string {
        return [...this.store.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }
}

class TorreService {
    private cache: KeyCache | null = null;
    private refreshTimer: ReturnType<typeof setTimeout> | null = null;
    private initializing = false;

    private get domUser() {
        return `sinco\\${envs.SINCO_USERNAME}`;
    }

    private get domUserEnc() {
        return encodeURIComponent(this.domUser);
    }

    private get connDataEnc() {
        return encodeURIComponent(CONN_DATA);
    }

    private async fetchKey(): Promise<string> {
        const jar = new CookieJar();
        const http = axios.create({ validateStatus: () => true });

        // Step 1: validate worker (sets session cookies)
        const validateRes = await http.post(
            `${BASE}/API/Trabajadores/Validar`,
            { usuario: envs.SINCO_USERNAME, password: encryptPassword(envs.SINCO_PASSWORD) },
            { headers: { 'Content-Type': 'application/json' } },
        );
        jar.ingest(validateRes.headers['set-cookie']);

        // Step 2: SignalR negotiate
        const negotiateUrl = `${BASE}/API/signalr/negotiate`
            + `?clientProtocol=1.5&UserName=${this.domUserEnc}`
            + `&EquipoTrabajo=${envs.SINCO_TEAM_ID}&AppEmpresa=sincosoporte`
            + `&connectionData=${this.connDataEnc}`;

        const negRes = await http.get(negotiateUrl, {
            headers: { Cookie: jar.header() },
        });
        jar.ingest(negRes.headers['set-cookie']);

        const token: string = negRes.data?.ConnectionToken;
        if (!token) throw new Error(`Negotiate sin ConnectionToken. Status: ${negRes.status}`);

        // Step 3: send obtenerKeyLoginCentralizado (returns key synchronously in json.R)
        const sendUrl = `${BASE}/API/signalr/send`
            + `?transport=serverSentEvents&clientProtocol=1.5`
            + `&UserName=${this.domUserEnc}&EquipoTrabajo=${envs.SINCO_TEAM_ID}&AppEmpresa=sincosoporte`
            + `&connectionToken=${encodeURIComponent(token)}&connectionData=${this.connDataEnc}`;

        const hubMsg = JSON.stringify({
            H: 'myhub',
            M: 'obtenerKeyLoginCentralizado',
            A: [this.domUser],
            I: 10,
        });

        const sendRes = await http.post(sendUrl,
            `data=${encodeURIComponent(hubMsg)}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar.header() } },
        );
        jar.ingest(sendRes.headers['set-cookie']);

        const key: string = sendRes.data?.R;
        if (!key) throw new Error(`obtenerKeyLoginCentralizado sin key. Respuesta: ${JSON.stringify(sendRes.data)}`);

        return key;
    }

    private scheduleRefresh(msUntilExpiry: number) {
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        const delay = Math.max(msUntilExpiry - 3 * 60 * 1000, 5000); // renovar 3 min antes, mínimo 5s
        this.refreshTimer = setTimeout(() => this.init(), delay);
    }

    async init(): Promise<void> {
        if (this.initializing) return;
        this.initializing = true;
        try {
            console.log('[TorreService] Obteniendo SSO key...');
            const key = await this.fetchKey();
            const ttl = 25 * 60 * 1000; // 25 min
            this.cache = { key, expiresAt: Date.now() + ttl };
            console.log(`[TorreService] SSO key obtenida (válida 25 min)`);
            this.scheduleRefresh(ttl);
        } catch (e: any) {
            console.error('[TorreService] Error obteniendo SSO key:', e.message);
            // Reintentar en 2 min si falla
            this.scheduleRefresh(2 * 60 * 1000);
        } finally {
            this.initializing = false;
        }
    }

    async getSsoKey(): Promise<string> {
        if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.key;
        // Cache expirada o vacía — forzar renovación sincrónica
        await this.init();
        if (!this.cache?.key) throw new Error('No se pudo obtener SSO key de Torre');
        return this.cache.key;
    }

    /**
     * Campos del POST a Login.aspx (login centralizado, tal como lo hace Torre).
     * OJO:
     *  - usuDominio = usuario de dominio/soporte (sinco\<SINCO_USERNAME>) → quien está autorizado.
     *  - usuario    = usuario del ERP al que se ingresa dentro de la empresa (NOM_USUARIO, ej: admin).
     *  - Login.aspx lee estos campos del CUERPO POST (x-www-form-urlencoded), NO del querystring.
     */
    loginFields(key: string, usuarioErp?: string): Record<string, string> {
        return {
            keyC:       key,
            ingreso:    '0',
            usuDominio: this.domUser,                              // usuario de dominio/soporte
            usuario:    (usuarioErp && usuarioErp.trim()) || envs.SINCO_ERP_USER, // usuario ERP (ej: admin)
        };
    }

    /**
     * (Legacy) URL con querystring. Login.aspx IGNORA la llave por GET/querystring y rebota
     * a Login_iv.aspx; el ingreso real se hace con loginFields() + POST. Se conserva por compatibilidad.
     */
    buildSsoUrl(loginUrl: string, key: string): string {
        const params = new URLSearchParams(this.loginFields(key));
        return `${loginUrl}?${params}`;
    }
}

// Singleton exportado
export const torreService = new TorreService();
