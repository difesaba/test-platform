// Motion helpers — purposeful, scoped transitions for the dark system.
// Principles (Emil Kowalski): never `transition: all`; scope to the exact props;
// custom ease-out with punch; gate hover behind hover-capable pointers; and reduce
// movement/scale to nothing under prefers-reduced-motion. Keep durations 120-160ms
// for UI feedback so the app feels responsive.
import type { SxProps, Theme } from '@mui/material/styles';
import { T } from '@/shared/theme/launcherTokens';

// Stronger than the built-in CSS ease-out — gives the hover its "snap".
export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

// Clickable cards/tiles: border + subtle elevation (bg wash + focus-ring shadow) on
// hover. Spread into sx; keep your own base border/bg and your own `&:focus-visible`.
export const cardHoverSx: SxProps<Theme> = {
  transition: `border-color 140ms ${EASE_OUT}, background-color 140ms ${EASE_OUT}, box-shadow 140ms ${EASE_OUT}`,
  '@media (hover: hover)': {
    '&:hover': {
      borderColor: T.primary.main,
      backgroundColor: T.surface.hover,
      boxShadow: `0 0 0 3px ${T.primary.tint}`,
    },
  },
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
};

// List rows inside a card/panel: gentle background wash on hover only.
export const rowHoverSx: SxProps<Theme> = {
  transition: `background-color 120ms ${EASE_OUT}`,
  '@media (hover: hover)': { '&:hover': { backgroundColor: T.surface.hover } },
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
};

// Disclosure chevron: rotate on open, scoped to transform, movement removed under
// reduced-motion. Merge the result into the icon's sx (set your own color/fontSize).
export const disclosureSpinSx = (open: boolean): SxProps<Theme> => ({
  transform: open ? 'rotate(90deg)' : 'none',
  transition: `transform 150ms ${EASE_OUT}`,
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
});
