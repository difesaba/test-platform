// Analizador de selectores (self-healing preventivo).
// Detecta locators frágiles en un spec de Playwright y, cuando se puede derivar del propio
// selector (texto, aria-label, placeholder, etc.), propone/aplica el equivalente robusto
// (getByRole/getByLabel/getByText/getByPlaceholder/getByTestId).

export type LocatorSeverity = 'alto' | 'medio';

export interface LocatorFinding {
    line: number;          // línea 1-based en el spec
    original: string;      // el selector detectado
    method: string;        // .locator / .click / .fill / ...
    reason: string;        // por qué es frágil
    severity: LocatorSeverity;
    suggestion?: string;   // expresión de reemplazo, si es derivable (ej. getByRole('button', { name: 'Guardar' }))
    autoFixable: boolean;  // si heal puede reescribirlo sin ambigüedad
}

export interface LocatorHealResult {
    spec: string;          // spec resultante
    applied: { line: number; from: string; to: string }[];
}

// Escapa comillas simples para incrustar texto en getByX('...').
function q(s: string): string {
    return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

// ¿El id parece autogenerado (React \:rf\:, GUID, hash, muchos dígitos)? → frágil.
function looksAutoId(id: string): boolean {
    return /\\*:r[a-z0-9]*\\*:/i.test(id)                 // ids de React tipo :rf: (con o sin escape)
        || /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(id) // GUID
        || /^[a-z]*\d{4,}$/i.test(id)                       // prefijo + muchos dígitos
        || /(css|jss|sc)-[0-9a-z]{4,}/i.test(id);           // clases/ids hasheados
}

/**
 * Intenta derivar un locator robusto a partir de un selector CSS/XPath frágil,
 * usando solo señales presentes en el propio string (texto, aria-label, etc.).
 * Devuelve la expresión (sin el `page.`) o null si no es derivable con seguridad.
 */
function deriveRobust(sel: string): { expr: string; why: string } | null {
    const roleForTag = (tag: string): string | null => {
        const t = tag.toLowerCase();
        if (t === 'button') return 'button';
        if (t === 'a') return 'link';
        if (t === 'input' || t === 'textarea') return 'textbox';
        return null;
    };

    // aria-label → getByLabel
    let m = sel.match(/\[aria-label=["']([^"']+)["']\]/i);
    if (m) return { expr: `getByLabel(${q(m[1])})`, why: 'aria-label estable → getByLabel' };

    // placeholder → getByPlaceholder
    m = sel.match(/\[placeholder=["']([^"']+)["']\]/i);
    if (m) return { expr: `getByPlaceholder(${q(m[1])})`, why: 'placeholder → getByPlaceholder' };

    // data-testid → getByTestId
    m = sel.match(/\[data-testid=["']([^"']+)["']\]/i);
    if (m) return { expr: `getByTestId(${q(m[1])})`, why: 'data-testid → getByTestId' };

    // tag:has-text("X")  /  tag >> text=X  → getByRole(role,{name}) si el tag mapea a rol
    m = sel.match(/^([a-z]+)[^]*?:has-text\(\s*["']([^"']+)["']\s*\)/i)
        || sel.match(/^([a-z]+)[^]*?>>\s*text=["']?([^"']+)["']?/i);
    if (m) {
        const role = roleForTag(m[1]);
        if (role) return { expr: `getByRole('${role}', { name: ${q(m[2])} })`, why: `texto visible + <${m[1]}> → getByRole` };
        return { expr: `getByText(${q(m[2])})`, why: 'texto visible → getByText' };
    }

    // text=X  /  :text("X")  (sin tag) → getByText
    m = sel.match(/^(?:text=|:text\(\s*["'])\s*["']?([^"')]+)["']?\)?/i);
    if (m) return { expr: `getByText(${q(m[1].trim())})`, why: 'texto visible → getByText' };

    // XPath con texto: //button[contains(text(),"X")] o //*[text()="X"]
    m = sel.match(/^(?:xpath=)?\/\/([a-z*]+)\[[^\]]*(?:contains\(\s*(?:\.|text\(\))\s*,\s*|text\(\)\s*=\s*)["']([^"']+)["']/i);
    if (m) {
        const role = roleForTag(m[1]);
        if (role) return { expr: `getByRole('${role}', { name: ${q(m[2])} })`, why: 'XPath por texto → getByRole' };
        return { expr: `getByText(${q(m[2])})`, why: 'XPath por texto → getByText' };
    }

    return null;
}

// Clasifica un selector string y devuelve el hallazgo (o null si ya es robusto/aceptable).
function classify(sel: string): { reason: string; severity: LocatorSeverity } | null {
    if (/^\/\/|^xpath=/i.test(sel)) return { reason: 'XPath: se rompe con cualquier cambio de estructura', severity: 'alto' };
    if (/:nth-child|:nth-of-type|>>\s*nth=|\.nth\(/i.test(sel)) return { reason: 'Selector posicional (nth): frágil ante reordenamientos', severity: 'alto' };
    const idm = sel.match(/#([\w\\:-]+)/);
    if (idm && looksAutoId(idm[1])) return { reason: 'ID autogenerado (no estable entre renders/builds)', severity: 'alto' };
    if (/\.(css|jss|sc)-[0-9a-z]{4,}|\.Mui[A-Za-z]+-[a-z]/i.test(sel)) return { reason: 'Clase hasheada/de framework: cambia entre builds', severity: 'medio' };
    const combinators = (sel.match(/\s*>\s*|\s+(?=[.#\[a-z])/gi) || []).length;
    if (combinators >= 3 || sel.length > 70) return { reason: 'Cadena CSS larga/anidada: sensible a cambios de layout', severity: 'medio' };
    return null;
}

// Encuentra llamadas .metodo('selector' ...) con selector string como primer argumento.
const CALL_RE = /\.(locator|click|fill|check|uncheck|selectOption|type|press|hover|dblclick|waitForSelector|focus)\(\s*(['"])((?:\\.|(?!\2).)*)\2/g;

export function analyzeLocators(spec: string): LocatorFinding[] {
    const findings: LocatorFinding[] = [];
    const lines = spec.split(/\r?\n/);
    lines.forEach((line, idx) => {
        // Ignora líneas que ya usan API robusta como locator base.
        CALL_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = CALL_RE.exec(line)) !== null) {
            const method = m[1];
            const sel = m[3];
            // Si el selector es claramente robusto (data-testid puro) lo saltamos salvo mejora directa.
            const cls = classify(sel);
            const robust = deriveRobust(sel);
            if (!cls && !robust) continue;
            findings.push({
                line: idx + 1,
                original: sel,
                method,
                reason: cls?.reason ?? 'Se puede expresar de forma más robusta',
                severity: cls?.severity ?? 'medio',
                suggestion: robust ? `getBy…: ${robust.expr}  (${robust.why})` : undefined,
                autoFixable: !!robust && method === 'locator',
            });
        }
    });
    return findings;
}

/**
 * Aplica los reemplazos seguros: solo `x.locator('selector')` → `x.getByRole/…(...)`
 * cuando el robusto es derivable del propio selector. No toca lo ambiguo.
 */
export function healLocators(spec: string): LocatorHealResult {
    const applied: LocatorHealResult['applied'] = [];
    const lines = spec.split(/\r?\n/);
    const healed = lines.map((line, idx) => {
        return line.replace(/\.locator\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/g, (whole, _q, sel) => {
            const robust = deriveRobust(sel);
            if (!robust) return whole;
            const replacement = `.${robust.expr}`;
            applied.push({ line: idx + 1, from: `.locator(${_q}${sel}${_q})`, to: replacement });
            return replacement;
        });
    });
    return { spec: healed.join('\n'), applied };
}
