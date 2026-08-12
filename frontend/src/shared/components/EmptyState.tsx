import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { T } from '@/shared/theme/launcherTokens';

interface Props {
  icon: ReactNode;
  title: string;
  description: string;
  cta?: ReactNode;
  plain?: boolean;
}

export default function EmptyState({ icon, title, description, cta, plain }: Props) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1.25, py: 6, px: 3, ...(plain ? {} : { bgcolor: T.surface.subtle, border: `1px dashed ${T.border.card}`, borderRadius: `${T.radius.card}px` }) }}>
      <Box sx={{ color: T.text.muted, display: 'grid', placeItems: 'center', lineHeight: 0 }}>{icon}</Box>
      <Typography variant="subtitle1" sx={{ color: T.text.primary, fontWeight: 600 }}>{title}</Typography>
      <Typography variant="body2" sx={{ color: T.text.secondary, maxWidth: 420 }}>{description}</Typography>
      {cta && <Box sx={{ mt: 1 }}>{cta}</Box>}
    </Box>
  );
}
