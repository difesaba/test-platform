function getWebBase(urlRaiz: string) {
    return urlRaiz ? urlRaiz.replace(/\/v3$/i, '/') : '';
}

function isReactAppRoute(url: string): boolean {
    return /\/ADPRO\/Views\/reactapp\/#/i.test(url);
}

function isLocalhostUrl(url: string): boolean {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url);
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
    if (marcoUrl && isReactAppRoute(runtimeUrl)) {
        return marcoUrl;
    }

    return runtimeUrl;
}
