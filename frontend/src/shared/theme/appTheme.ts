// Tema de la aplicación — dark theme STANDALONE construido desde cero sobre los
// design tokens del Session Launcher. NO extiende ningún tema de terceros: todos
// los estilos de componentes se definen aquí para que el modo oscuro sea legible y
// consistente por construcción (iconos visibles, inputs con borde, chips con
// contraste, superficies homogéneas).
import { createTheme } from '@mui/material/styles';
import { T } from '@/shared/theme/launcherTokens';

export const appTheme = createTheme({
  palette: {
    mode: 'dark',
    primary:   { main: '#6366F1', dark: '#4F46E5', light: '#818CF8', contrastText: '#FFFFFF' },
    secondary: { main: '#CBD5E1' },
    success:   { main: '#22C55E', contrastText: '#0F172A' },
    warning:   { main: '#F59E0B', contrastText: '#0F172A' },
    error:     { main: '#EF4444', contrastText: '#FFFFFF' },
    info:      { main: '#6366F1', contrastText: '#FFFFFF' },
    text:      { primary: T.text.primary, secondary: T.text.secondary, disabled: T.text.disabled },
    divider:   T.border.divider,
    background: { default: T.surface.page, paper: T.surface.card },
    action: {
      active: T.text.secondary,
      hover: 'rgba(148,163,184,0.08)',
      selected: T.surface.selected,
      disabled: T.text.disabled,
      disabledBackground: T.surface.inputDisabled,
    },
  },

  shape: { borderRadius: 8 },

  typography: {
    fontFamily: '"Inter Variable", "Inter", system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    h1: { fontWeight: 700, fontSize: '2.25rem', lineHeight: 1.15, letterSpacing: '-0.02em' },
    h2: { fontWeight: 700, fontSize: '1.875rem', lineHeight: 1.2, letterSpacing: '-0.02em' },
    h3: { fontWeight: 700, fontSize: '1.5rem', lineHeight: 1.25, letterSpacing: '-0.02em' },
    h4: { fontWeight: 700, fontSize: '1.25rem', lineHeight: 1.3, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700, fontSize: '1.0625rem', lineHeight: 1.35, letterSpacing: '-0.015em' },
    h6: { fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1.4, letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 600, fontSize: '0.9375rem', lineHeight: 1.5 },
    subtitle2: { fontWeight: 600, fontSize: '0.8125rem', lineHeight: 1.5 },
    body1: { fontSize: '0.9375rem', lineHeight: 1.55 },
    body2: { fontSize: '0.8125rem', lineHeight: 1.5 },
    button: { textTransform: 'none', fontWeight: 600 },
    caption: { fontSize: '0.75rem', lineHeight: 1.4 },
    overline: { fontWeight: 700, fontSize: '0.6875rem', letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.6 },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: `
        body { background:${T.surface.page}; color:${T.text.primary}; font-feature-settings:'tnum','cnum'; }
        *,*::before,*::after { box-sizing:border-box; }
        ::selection { background:${T.primary.tint}; }
        *::-webkit-scrollbar { width:10px; height:10px; }
        *::-webkit-scrollbar-thumb { background:${T.border.input}; border-radius:8px; }
        *::-webkit-scrollbar-track { background:transparent; }
      `,
    },

    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none', backgroundColor: T.surface.card, borderColor: T.border.card },
        outlined: { border: `1px solid ${T.border.card}` },
      },
    },

    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: T.surface.card,
          color: T.text.primary,
          backgroundImage: 'none',
          borderBottom: `1px solid ${T.border.card}`,
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: T.surface.card,
          border: `1px solid ${T.border.card}`,
          boxShadow: 'none',
          backgroundImage: 'none',
        },
      },
    },

    MuiSvgIcon: {
      styleOverrides: {
        root: { color: 'inherit' },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          color: T.text.secondary,
          '&:hover': { backgroundColor: 'rgba(148,163,184,0.08)' },
        },
      },
    },

    MuiListItemIcon: {
      styleOverrides: {
        root: { color: T.text.secondary, minWidth: 36 },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '&.Mui-selected': { backgroundColor: T.surface.selected },
          '&.Mui-selected:hover': { backgroundColor: T.surface.selected },
          '&:hover': { backgroundColor: T.surface.hover },
        },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: T.surface.input,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: T.border.input },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: T.text.muted },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: T.primary.main },
        },
        input: {
          '&::placeholder': { color: T.text.muted, opacity: 1 },
        },
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: T.text.muted,
          '&.Mui-focused': { color: T.primary.main },
        },
      },
    },

    MuiInputAdornment: {
      styleOverrides: {
        root: { color: T.text.muted },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: { borderRadius: T.radius.chip },
        // Sólo mapeamos el color "default" a tokens oscuros; los chips con color
        // (success/warning/error/primary/…) conservan sus estilos legibles.
        outlined: ({ ownerState }) => ({
          ...(ownerState.color === 'default' && {
            borderColor: T.border.input,
            color: T.text.secondary,
          }),
        }),
        filled: ({ ownerState }) => ({
          ...(ownerState.color === 'default' && {
            backgroundColor: T.surface.subtle,
            color: T.text.secondary,
          }),
        }),
      },
    },

    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 8 },
        contained: { boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
        outlined: {
          borderColor: T.border.input,
          color: T.text.primary,
          '&:hover': { borderColor: T.text.muted, backgroundColor: 'rgba(148,163,184,0.06)' },
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: T.surface.popover,
          color: T.text.primary,
          border: `1px solid ${T.border.card}`,
          fontSize: 12,
        },
        arrow: { color: T.surface.popover },
      },
    },

    MuiTabs: {
      styleOverrides: {
        indicator: { backgroundColor: T.primary.main },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          color: T.text.muted,
          '&.Mui-selected': { color: T.text.primary },
        },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: { borderColor: T.border.divider },
      },
    },

    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: T.surface.popover,
          backgroundImage: 'none',
          border: `1px solid ${T.border.card}`,
        },
      },
    },

    MuiPopover: {
      styleOverrides: {
        paper: {
          backgroundColor: T.surface.popover,
          backgroundImage: 'none',
          border: `1px solid ${T.border.card}`,
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: T.surface.card,
          backgroundImage: 'none',
          border: `1px solid ${T.border.card}`,
        },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: T.border.divider },
        head: { color: T.text.muted, backgroundColor: T.surface.subtle },
      },
    },

    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: T.border.input,
          '&.Mui-checked': { color: T.primary.main },
        },
      },
    },

    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          '&.Mui-checked': { color: T.primary.main },
          '&.Mui-checked + .MuiSwitch-track': { backgroundColor: T.primary.main },
        },
        track: { backgroundColor: T.border.input },
      },
    },

    MuiSkeleton: {
      styleOverrides: {
        root: { backgroundColor: T.surface.subtle },
      },
    },
  },
});
