export type { ModuleItem, SubmoduleItem, PageItem } from '@/shared/types/platform';

/** Parámetros para operar sobre el árbol por ruta (N niveles). */
export interface TreePagePayload { path: string[]; name: string; url: string; }
export interface TreeSubmodulePayload { path: string[]; }
export interface TreeRenameSubmodulePayload { path: string[]; newName: string; }
export interface TreeRenamePagePayload { path: string[]; name: string; newName: string; }
export interface TreeDeletePagePayload { path: string[]; name: string; }
