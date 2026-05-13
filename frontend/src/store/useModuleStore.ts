import { create } from 'zustand';

export interface SelectedModule {
    moduleName: string;
    submoduleName?: string;
    pageName?: string;
    pageUrl?: string;
}

interface ModuleStore {
    selected: SelectedModule | null;
    setSelected: (sel: SelectedModule | null) => void;
}

export const useModuleStore = create<ModuleStore>((set) => ({
    selected: null,
    setSelected: (sel) => set({ selected: sel }),
}));
