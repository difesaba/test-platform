function getWebBase(urlRaiz: string) {
    return urlRaiz ? urlRaiz.replace(/\/v3$/i, '/') : '';
}

function isReactAppRoute(url: string): boolean {
    return /\/ADPRO\/Views\/reactapp\/#/i.test(url);
}

function isLocalhostUrl(url: string): boolean {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url);
}

// Páginas ADPRO clásicas del ERP (.html/.aspx bajo /adpro/, ej: PanelInforme.html?TipInforme=811).
// Deben abrirse a través del Marco REAL: el Marco mintea el token vsADPRO por sesión al abrir el
// reporte desde su menú; sin Marco padre la página queda colgada en "Cargando...".
// FALSE para localhost, rutas React (se manejan aparte) y las páginas propias del Marco (/Marco/).
function isAdproErpPage(url: string): boolean {
    if (!/^https?:\/\//i.test(url)) return false;
    if (isLocalhostUrl(url)) return false;
    if (isReactAppRoute(url)) return false;
    if (/\/Marco\//i.test(url)) return false;
    return /\/adpro\//i.test(url) && /\.(aspx|html?)(\?|#|$)/i.test(url);
}

// URL que debe abrirse a través del Marco REAL (React SPA o página ADPRO clásica).
function needsMarcoShell(url: string): boolean {
    return isReactAppRoute(url) || isAdproErpPage(url);
}

export function buildMarcoEntryUrl(sessionUrlRaiz: string | undefined): string {
    const webBase = getWebBase(sessionUrlRaiz ?? '');
    if (!webBase) return '';
    const normalizedBase = webBase.endsWith('/') ? webBase : `${webBase}/`;
    return new URL('Marco/Default_iv.aspx', normalizedBase).toString();
}

export function resolveRuntimeUrl(requestedUrl: string | undefined, sessionUrlRaiz: string | undefined): string {
    const value = requestedUrl?.trim() ?? '';
    if (!value) return '';

    const webBase = getWebBase(sessionUrlRaiz ?? '');
    if (!webBase) return value;

    const normalizedBase = webBase.endsWith('/') ? webBase : `${webBase}/`;

    try {
        const currentBase = new URL(normalizedBase);

        if (/^https?:\/\//i.test(value)) {
            if (isLocalhostUrl(value)) {
                return value;
            }
            const savedUrl = new URL(value);
            const currentBasePath = currentBase.pathname.endsWith('/') ? currentBase.pathname : `${currentBase.pathname}/`;
            const relativePath = savedUrl.pathname.startsWith(currentBasePath)
                ? savedUrl.pathname.slice(currentBasePath.length)
                : savedUrl.pathname.replace(/^\/+/, '');

            return new URL(`${relativePath}${savedUrl.search}${savedUrl.hash}`, currentBase).toString();
        }

        const normalizedPath = value.startsWith('/') ? value.slice(1) : value;
        return new URL(normalizedPath, currentBase).toString();
    } catch {
        return value;
    }
}

export function resolveAutomationEntryUrl(requestedUrl: string | undefined, sessionUrlRaiz: string | undefined): string {
    const runtimeUrl = resolveRuntimeUrl(requestedUrl, sessionUrlRaiz);
    if (!runtimeUrl) return '';

    const marcoUrl = buildMarcoEntryUrl(sessionUrlRaiz);
    if (marcoUrl && needsMarcoShell(runtimeUrl)) {
        return marcoUrl;
    }

    return runtimeUrl;
}
