import { type ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { T } from '@/shared/theme/launcherTokens';

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;   // right-aligned actions (chips, switches, buttons)
  icon?: ReactNode;      // optional leading icon
}

export default function PageHeader({ title, subtitle, actions, icon }: Props) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        {icon && (
          <Box sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: '10px', display: 'grid', placeItems: 'center', bgcolor: T.primary.tint, color: T.primary.main }}>
            {icon}
          </Box>
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h5" component="h1" fontWeight={800} noWrap>{title}</Typography>
          {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{subtitle}</Typography>}
        </Box>
        {actions && <Box sx={{ flexShrink: 0 }}>{actions}</Box>}
      </Stack>
    </Box>
  );
}
