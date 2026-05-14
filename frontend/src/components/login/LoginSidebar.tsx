import { Box, Chip, Divider, Paper, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import BusinessRoundedIcon from '@mui/icons-material/BusinessRounded';

interface LoginSidebarProps {
  groupCount: number;
  clientCount: number;
  selectedEntorno?: string;
}

const FEATURES = [
  {
    icon: <ShieldOutlinedIcon color="primary" />,
    title: 'Sesiones controladas',
    text: 'La seleccion del contexto queda visible antes de ingresar.',
  },
  {
    icon: <ChecklistRoundedIcon color="primary" />,
    title: 'Proceso guiado',
    text: 'Cada paso aparece solo cuando corresponde y reduce errores.',
  },
  {
    icon: <InsightsRoundedIcon color="primary" />,
    title: 'Operacion directa',
    text: 'Menos ruido visual y mejor foco en la tarea de acceso.',
  },
];

export function LoginSidebar({ groupCount, clientCount, selectedEntorno }: LoginSidebarProps) {
  const theme = useTheme();

  const glowColor = selectedEntorno === 'produccion'
    ? theme.palette.success.main
    : selectedEntorno === 'prueba'
      ? theme.palette.warning.main
      : selectedEntorno === 'replica'
        ? theme.palette.error.main
        : undefined;

  return (
    <Paper
      elevation={3}
      sx={{
        height: '100%',
        p: 3,
        boxShadow: glowColor
          ? `0 0 0 1px ${glowColor}40, 0 4px 24px 0 ${glowColor}33`
          : undefined,
        transition: 'box-shadow 0.4s ease',
      }}
    >
      <Stack spacing={4} height="100%" justifyContent="center">
        <Stack spacing={2}>
          <Chip
            icon={<BusinessRoundedIcon />}
            label="testPlatform"
            variant="outlined"
            color="primary"
          />
          <Typography variant="h4">
            Acceso corporativo para operar pruebas con un flujo claro.
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Selecciona grupo, entorno, empresa y sucursal en una sola vista, sin bloques visuales innecesarios.
          </Typography>
        </Stack>

        <Stack spacing={2} divider={<Divider flexItem />}>
          {FEATURES.map((item) => (
            <Stack key={item.title} direction="row" spacing={2} alignItems="flex-start">
              {item.icon}
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  {item.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {item.text}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label={`${groupCount} grupos`} variant="outlined" size="small" />
          <Chip label={`${clientCount} entornos`} variant="outlined" size="small" />
        </Stack>
      </Stack>
    </Paper>
  );
}
