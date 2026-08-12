import type { SelectedModule } from '@/shared/store/useModuleStore';

export const ENVIRONMENT_META: Record<string, { label: string; color: 'success' | 'warning' | 'error' }> = {
  produccion: { label: 'Produccion', color: 'success' },
  prueba: { label: 'Prueba', color: 'warning' },
  replica: { label: 'Replica', color: 'error' },
};

export const ENVIRONMENT_ORDER = ['produccion', 'prueba', 'replica'];

export function buildSelectionQuery(selected: SelectedModule) {
  const params = new URLSearchParams({ module: selected.moduleName });
  if (selected.pageName) {
    params.set('page', selected.pageName);
  }
  if (selected.submoduleName) {
    params.set('submodule', selected.submoduleName);
  }
  return params.toString();
}

export function getWebBase(urlRaiz: string) {
  return urlRaiz ? urlRaiz.replace(/\/v3$/i, '/') : '';
}

export function resolvePageUrl(pageUrl: string | undefined, urlRaiz: string) {
  const value = pageUrl?.trim() ?? '';
  if (!value) return '';

  const webBase = getWebBase(urlRaiz);
  if (!webBase) return value;

  const normalizedBase = webBase.endsWith('/') ? webBase : `${webBase}/`;

  try {
    const currentBase = new URL(normalizedBase);

    if (/^https?:\/\//i.test(value)) {
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

export function resolveAutomationUrl(pageUrl: string | undefined, urlRaiz: string) {
  return resolvePageUrl(pageUrl, urlRaiz);
}

export function formatRunTime(value?: string) {
  return value ? value.slice(11, 19) : '--:--:--';
}

export function resolvePath(template: string, values: Record<string, string>) {
  return template.replace(/\{([^}]+)\}/g, (_, name) => values[name] ?? `{${name}}`);
}

export function getEnvironmentMeta(environment?: string) {
  return ENVIRONMENT_META[environment ?? 'produccion'] ?? ENVIRONMENT_META.produccion;
}
