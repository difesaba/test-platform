import { create } from 'zustand';
import { getModules } from '@/features/platform/services/catalog';
import type { ModuleItem } from '@/shared/types/platform';

interface CatalogStore {
  modules: ModuleItem[];
  loading: boolean;
  loaded: boolean;
  loadModules: () => Promise<void>;
}

export const useCatalogStore = create<CatalogStore>((set) => ({
  modules: [],
  loading: false,
  loaded: false,
  loadModules: async () => {
    set({ loading: true });
    try {
      const res = await getModules();
      if (res.success && res.data) {
        set({ modules: res.data, loaded: true });
      }
    } finally {
      set({ loading: false });
    }
  },
}));
