// Tokens del Session Launcher (handoff Claude Design), tema claro ADPRO/testPlatform.
// Centralizados para poder mapearlos luego a SincoTheme sin tocar los componentes.
export const T = {
  surface: {
    page: '#0F172A',
    card: '#1B2336',
    subtle: '#232E45',
    input: '#131C2E',
    inputDisabled: '#182338',
    hover: '#232E45',
    selected: '#262A4D',
    popover: '#26314A',
  },
  border: {
    card: '#2B3852',
    input: '#3C4A66',
    divider: '#1E293B',
    divider2: '#2B3852',
  },
  primary: {
    main: '#818CF8',
    dark: '#6366F1',
    tint: '#23264A',
    tintBorder: '#3730A3',
    on: '#FFFFFF',
  },
  text: {
    primary: '#F1F5F9',
    secondary: '#CBD5E1',
    muted: '#94A3B8',
    disabled: '#64748B',
    faint: '#475569',
  },
  warning: { text: '#FBBF24', bg: '#2A2410', border: '#78560F' },
  success: { text: '#4ADE80', bg: '#0E2A1E', border: '#166534' },
  error:   { main: '#F87171', text: '#F87171', bg: '#2C1618', border: '#7F2A2E' },
  radius: { input: 6, card: 10, pill: 9999, chip: 6, checkbox: 4 },
} as const;

export type StateKey = 'pending' | 'recorded' | 'error' | 'installed';

export const STATE_META: Record<StateKey, { label: string; text: string; bg: string; border: string }> = {
  pending:   { label: 'Pendiente', text: T.warning.text, bg: T.warning.bg, border: T.warning.border },
  recorded:  { label: 'Grabada',   text: T.success.text, bg: T.success.bg, border: T.success.border },
  error:     { label: 'Error',     text: T.error.text,   bg: T.error.bg,   border: T.error.border },
  installed: { label: 'Instalada', text: T.success.text, bg: T.success.bg, border: T.success.border },
};
