import { create } from 'zustand';

interface SessionState {
  isAuthenticated: boolean;
  backendAvailable: boolean;
  urlRaiz: string;
  empNombre: string;
  entornoNombre: string;
  empresa: { id: number; nombre: string } | null;
  sucursal: { id: number; nombre: string; entorno: string } | null;
  setAuthenticated: (val: boolean, data?: Partial<SessionState>) => void;
  setBackendAvailable: (val: boolean) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  isAuthenticated: false,
  backendAvailable: true,
  urlRaiz: '',
  empNombre: '',
  entornoNombre: '',
  empresa: null,
  sucursal: null,
  setAuthenticated: (val, data) => set({ isAuthenticated: val, ...data }),
  setBackendAvailable: (val) => set({ backendAvailable: val }),
  clear: () => set({
    isAuthenticated: false,
    backendAvailable: true,
    urlRaiz: '',
    empNombre: '',
    entornoNombre: '',
    empresa: null,
    sucursal: null,
  }),
}));
