import { Step, StepLabel, Stepper, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';

interface LoginStepperProps {
  activeStep: number;
}

const STEPS = ['Grupo', 'Entorno', 'Empresa', 'Sucursal'];

export function LoginStepper({ activeStep }: LoginStepperProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Stepper activeStep={activeStep} alternativeLabel>
      {STEPS.map((label) => (
        <Step key={label}>
          <StepLabel
            sx={isMobile ? { '& .MuiStepLabel-label': { display: 'none' } } : undefined}
          >
            {label}
          </StepLabel>
        </Step>
      ))}
    </Stepper>
  );
}
