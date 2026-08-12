import type { ApiAssertionType } from '@/shared/types/platform';

// Metadatos de las validaciones de API: etiqueta y qué campos pide cada tipo.
// Compartido entre el formulario de creación (ApiTestTab) y el editor (ApiTestEditDialog).
export const ASSERTION_META: Record<ApiAssertionType, {
  label: string;
  needsTarget: boolean;
  needsValue: boolean;
  targetLabel?: string;
  valueLabel?: string;
  targetPlaceholder?: string;
  valuePlaceholder?: string;
}> = {
  'body-contains':   { label: 'El cuerpo contiene', needsTarget: false, needsValue: true, valueLabel: 'Texto', valuePlaceholder: 'exitoso' },
  'field-equals':    { label: 'Campo igual a', needsTarget: true, needsValue: true, targetLabel: 'Campo (ruta)', valueLabel: 'Valor', targetPlaceholder: 'data.id', valuePlaceholder: '123' },
  'field-exists':    { label: 'Campo existe', needsTarget: true, needsValue: false, targetLabel: 'Campo (ruta)', targetPlaceholder: 'data.token' },
  'header-contains': { label: 'Header contiene', needsTarget: true, needsValue: true, targetLabel: 'Header', valueLabel: 'Texto', targetPlaceholder: 'content-type', valuePlaceholder: 'application/json' },
  'time-under':      { label: 'Tiempo menor a (ms)', needsTarget: false, needsValue: true, valueLabel: 'Milisegundos', valuePlaceholder: '2000' },
};

export const ASSERTION_TYPES = Object.keys(ASSERTION_META) as ApiAssertionType[];

/** Deriva la ruta relativa a la raíz de la empresa (todo cambia menos la urlRaiz entre empresas). */
export function relativeBasePath(finalUrl: string, urlRaiz?: string): string | undefined {
  const root = (urlRaiz ?? '').replace(/\/v3$/i, '').replace(/\/+$/, '');
  return root && finalUrl.startsWith(root) ? finalUrl.slice(root.length) : undefined;
}

export function newAssertionId(): string {
  try { return crypto.randomUUID(); } catch { return `a-${Date.now()}-${Math.floor(Math.random() * 1e6)}`; }
}
