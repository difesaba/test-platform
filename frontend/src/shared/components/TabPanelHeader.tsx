import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { T } from '@/shared/theme/launcherTokens';

interface Props {
  title: string;
  description: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
}

export default function TabPanelHeader({ title, description, primaryAction, secondaryActions }: Props) {
  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'flex-start', md: 'flex-start' }, justifyContent: 'space-between', gap: 2 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h5" component="h2" sx={{ color: T.text.primary, fontWeight: 700 }}>{title}</Typography>
        <Typography variant="body2" sx={{ color: T.text.secondary, mt: 0.5, maxWidth: 640 }}>{description}</Typography>
      </Box>
      {(primaryAction || secondaryActions) && (
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flexShrink: 0 }}>
          {secondaryActions}
          {primaryAction}
        </Stack>
      )}
    </Box>
  );
}
