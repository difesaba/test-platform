// 📝 Shape derivado del uso en InstallQueue.tsx y AddonsPage.tsx; validar con verify-api-interfaces.
export interface Addon {
  id: string | number;
  loginUrl?: string;
  urlRaiz?: string;
  addonUrl?: string;
  addonNumber?: number;
  [key: string]: unknown;
}
export interface RecordingStatus { hasRecording: boolean; }
export interface SsoUrlResponse { url?: string; }
export interface InstallAddonDTO { loginUrl?: string; urlRaiz?: string; addonNumber?: number; }
export interface RecordAddonDTO { loginUrl?: string; urlRaiz?: string; }
