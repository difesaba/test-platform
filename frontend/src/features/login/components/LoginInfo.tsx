import { Box, Stack, Typography } from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import AutoModeRoundedIcon from '@mui/icons-material/AutoModeRounded';
import { T } from '@/shared/theme/launcherTokens';

const FEATURES = [
  { icon: ShieldOutlinedIcon, title: 'Sesiones controladas', text: 'El contexto queda visible antes de ingresar.' },
  { icon: ChecklistRoundedIcon, title: 'Proceso guiado', text: 'Filtra por grupo y tipo; entra en un clic.' },
  { icon: AutoModeRoundedIcon, title: 'Instalación automática', text: 'Los flujos grabados se ejecutan sin pasos manuales.' },
];

export default function LoginInfo({ groupCount, envCount }: { groupCount: number; envCount: number }) {
  return (
    <Box sx={{ background: T.surface.card, border: `1px solid ${T.border.card}`, borderRadius: `${T.radius.card}px`, p: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Box component="img" src="/testverse-full.png" alt="TestVerse — The Universe of Test Automatization" sx={{ display: 'block', width: '100%', maxWidth: 240, height: 'auto', mx: 'auto', mb: 2 }} />
          <Typography sx={{ fontSize: 20, fontWeight: 700, color: T.text.primary, mt: 1.5, lineHeight: 1.25 }}>
            Ingreso centralizado a los entornos de prueba.
          </Typography>
          <Typography sx={{ fontSize: 13, color: T.text.muted, mt: 1, lineHeight: 1.55 }}>
            Elige el grupo empresarial y entra directo a su entorno — la sesión se resuelve con la key de login centralizado, sin credenciales por empresa.
          </Typography>
        </Box>

        <Stack spacing={2}>
          {FEATURES.map((f) => (
            <Stack key={f.title} direction="row" spacing={1.5} alignItems="flex-start">
              <Box sx={{ width: 36, height: 36, flexShrink: 0, borderRadius: '10px', display: 'grid', placeItems: 'center', background: T.primary.tint, border: `1px solid ${T.primary.tintBorder}` }}>
                <f.icon sx={{ fontSize: 18, color: T.primary.main }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: T.text.primary }}>{f.title}</Typography>
                <Typography sx={{ fontSize: 12.5, color: T.text.muted, mt: 0.25, lineHeight: 1.5 }}>{f.text}</Typography>
              </Box>
            </Stack>
          ))}
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Box sx={{ fontSize: 12, fontWeight: 600, color: T.text.secondary, background: T.surface.subtle, border: `1px solid ${T.border.card}`, borderRadius: `${T.radius.pill}px`, px: 1.25, py: '5px' }}>
            {groupCount} grupos
          </Box>
          <Box sx={{ fontSize: 12, fontWeight: 600, color: T.text.secondary, background: T.surface.subtle, border: `1px solid ${T.border.card}`, borderRadius: `${T.radius.pill}px`, px: 1.25, py: '5px' }}>
            {envCount} entornos
          </Box>
        </Stack>
      </Stack>
    </Box>
  );
}
