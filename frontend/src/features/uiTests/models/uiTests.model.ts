export type { UiTest, UiTestComponent, UiTestComponentCandidate } from '@/shared/types/platform';
import type { UiTestComponent, UiTestComponentCandidate } from '@/shared/types/platform';

export interface StartPickerResponse { sessionId?: string }
// ⚠️ El picker se consulta por polling; 'selected' trae el componente elegido.
export interface ComponentPickerStatus { status?: 'selected' | 'closed' | string; component?: UiTestComponentCandidate }
// 📝 Cuerpos de crear/ejecutar basados en el uso en UiTestTab; validar con verify-api-interfaces.
export interface SaveUiTestDTO { name: string; url: string; components: UiTestComponent[] }
export interface RunUiTestDTO { url?: string }
