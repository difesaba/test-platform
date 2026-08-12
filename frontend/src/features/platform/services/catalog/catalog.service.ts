import { apiClient, toResult } from '@/shared/services/http';
import type { OperationResult } from '@/shared/models/shared.model';
import type { ModuleItem } from '@/shared/types/platform';
import type {
  TreePagePayload, TreeSubmodulePayload, TreeRenameSubmodulePayload,
  TreeRenamePagePayload, TreeDeletePagePayload,
} from '@/features/platform/models/catalog.model';

// 📝 Las mutaciones no retornan cuerpo consumido por la UI (se refresca el árbol) → OperationResult<void>.
const enc = encodeURIComponent;

/** Árbol completo de módulos/submódulos/páginas del contexto actual. */
export const getModules = (): Promise<OperationResult<ModuleItem[]>> =>
  toResult(() => apiClient.get<ModuleItem[]>('/modules'), undefined, 'No se pudieron cargar los módulos');

export const createModule = (name: string): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>('/modules', { name }), 'Módulo creado', 'No se pudo crear el módulo');

export const deleteModule = (name: string): Promise<OperationResult<void>> =>
  toResult(() => apiClient.delete<void>(`/modules/${enc(name)}`), 'Módulo eliminado', 'No se pudo eliminar el módulo');

export const renameModule = (name: string, newName: string): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>(`/modules/${enc(name)}/rename`, { newName }), 'Módulo renombrado', 'No se pudo renombrar el módulo');

/** Swagger por módulo (usado por la pestaña API y Configuración). */
export const setModuleSwagger = (name: string, swaggerUrl: string): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>(`/modules/${enc(name)}/swagger`, { swaggerUrl }), 'Swagger guardado', 'No se pudo guardar el Swagger');

// --- Páginas/submódulos planos (raíz del módulo) ---
export const createPage = (moduleName: string, name: string, url: string): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>(`/modules/${enc(moduleName)}/pages`, { name, url }), 'Página creada', 'No se pudo crear la página');

export const deletePage = (moduleName: string, pageName: string): Promise<OperationResult<void>> =>
  toResult(() => apiClient.delete<void>(`/modules/${enc(moduleName)}/pages/${enc(pageName)}`), 'Página eliminada', 'No se pudo eliminar la página');

export const createSubmodule = (moduleName: string, name: string): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>(`/modules/${enc(moduleName)}/submodules`, { name }), 'Submódulo creado', 'No se pudo crear el submódulo');

export const deleteSubmodule = (moduleName: string, submoduleName: string): Promise<OperationResult<void>> =>
  toResult(() => apiClient.delete<void>(`/modules/${enc(moduleName)}/submodules/${enc(submoduleName)}`), 'Submódulo eliminado', 'No se pudo eliminar el submódulo');

export const createSubmodulePage = (moduleName: string, submoduleName: string, name: string, url: string): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>(`/modules/${enc(moduleName)}/submodules/${enc(submoduleName)}/pages`, { name, url }), 'Página creada', 'No se pudo crear la página');

export const deleteSubmodulePage = (moduleName: string, submoduleName: string, pageName: string): Promise<OperationResult<void>> =>
  toResult(() => apiClient.delete<void>(`/modules/${enc(moduleName)}/submodules/${enc(submoduleName)}/pages/${enc(pageName)}`), 'Página eliminada', 'No se pudo eliminar la página');

// --- Árbol por ruta (N niveles) ---
export const createTreePage = (moduleName: string, payload: TreePagePayload): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>(`/modules/${enc(moduleName)}/tree/pages`, payload), 'Página creada', 'No se pudo crear la página');

export const createTreeSubmodule = (moduleName: string, payload: TreeSubmodulePayload): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>(`/modules/${enc(moduleName)}/tree/submodules`, payload), 'Submódulo creado', 'No se pudo crear el submódulo');

export const renameTreeSubmodule = (moduleName: string, payload: TreeRenameSubmodulePayload): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>(`/modules/${enc(moduleName)}/tree/rename-submodule`, payload), 'Submódulo renombrado', 'No se pudo renombrar el submódulo');

export const renameTreePage = (moduleName: string, payload: TreeRenamePagePayload): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>(`/modules/${enc(moduleName)}/tree/rename-page`, payload), 'Página renombrada', 'No se pudo renombrar la página');

export const deleteTreePage = (moduleName: string, payload: TreeDeletePagePayload): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>(`/modules/${enc(moduleName)}/tree/delete-page`, payload), 'Página eliminada', 'No se pudo eliminar la página');

export const deleteTreeSubmodule = (moduleName: string, payload: TreeSubmodulePayload): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>(`/modules/${enc(moduleName)}/tree/delete-submodule`, payload), 'Submódulo eliminado', 'No se pudo eliminar el submódulo');
