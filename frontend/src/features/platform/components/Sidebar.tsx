import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import WidgetsRoundedIcon from '@mui/icons-material/WidgetsRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import api from '@/shared/api/client';
import { useModuleStore, type SelectedModule } from '@/shared/store/useModuleStore';
import { useSessionStore } from '@/shared/store/useSessionStore';
import type { ModuleItem, SubmoduleItem, PageItem } from '@/shared/types/platform';
import { getWebBase } from '@/shared/utils/platform';
import { T } from '@/shared/theme/launcherTokens';
import { RowsSkeleton } from '@/shared/components/Skeletons';
import SubmoduleTree from '@/features/platform/components/SubmoduleTree';
import RowMenu from '@/features/platform/components/RowMenu';

type FormTarget =
  | { type: 'module' }
  | { type: 'page'; parent: string; submoduleName?: string; path?: string[] }
  | { type: 'submodule'; parent: string; path?: string[] };

type DeleteTarget =
  | { type: 'module'; moduleName: string; label: string }
  | { type: 'page'; moduleName: string; pageName: string; label: string; submoduleName?: string; path?: string[] }
  | { type: 'submodule'; moduleName: string; submoduleName: string; label: string; path?: string[] };

type RenameTarget =
  | { kind: 'module'; moduleName: string; current: string }
  | { kind: 'submodule'; moduleName: string; path: string[]; current: string }
  | { kind: 'page'; moduleName: string; path: string[]; pageName: string; current: string };

interface Props {
  modules: ModuleItem[];
  loading: boolean;
  onRefresh: () => void;
  onNotify: (message: string, severity?: 'success' | 'error' | 'info') => void;
  onNavigate?: () => void;
  collapsible?: boolean;
  onCollapse?: () => void;
  focusSearchSignal?: number;
}

const metaLabel = (pages: number, subs: number): string => {
  const parts: string[] = [];
  if (pages > 0) parts.push(pages + ' pág');
  if (subs > 0) parts.push(subs + ' sub');
  return parts.join(' · ');
};

// Cuenta recursiva de páginas (raíz + submódulos anidados N niveles).
const countPagesRec = (subs: SubmoduleItem[]): number =>
  subs.reduce((acc, sub) => acc + (sub.pages?.length ?? 0) + countPagesRec(sub.submodules ?? []), 0);
const countAllPages = (mods: ModuleItem[]): number =>
  mods.reduce((total, mod) => total + (mod.pages?.length ?? 0) + countPagesRec(mod.submodules ?? []), 0);

const selectedRowSx = {
  '&.Mui-selected': {
    backgroundColor: T.primary.tint,
    boxShadow: 'inset 3px 0 0 ' + T.primary.main,
    '&:hover': { backgroundColor: T.primary.tint },
    '& .MuiListItemText-primary': { color: T.primary.main },
  },
} as const;

type SearchHit = { moduleName: string; path: string[]; pageName?: string; url?: string; label: string; crumb: string; kind: 'page' | 'submodule' };

function buildHits(mods: ModuleItem[], q: string): SearchHit[] {
  const nq = q.trim().toLowerCase();
  if (!nq) return [];
  const hits: SearchHit[] = [];
  const walkSub = (moduleName: string, sub: SubmoduleItem, path: string[]) => {
    if (sub.name.toLowerCase().includes(nq)) {
      hits.push({ moduleName, path, label: sub.name, crumb: [moduleName, ...path.slice(0, -1)].join(' › '), kind: 'submodule' });
    }
    (sub.pages ?? []).forEach((pg: PageItem) => {
      if (pg.name.toLowerCase().includes(nq)) hits.push({ moduleName, path, pageName: pg.name, url: pg.url, label: pg.name, crumb: [moduleName, ...path].join(' › '), kind: 'page' });
    });
    (sub.submodules ?? []).forEach((ch: SubmoduleItem) => walkSub(moduleName, ch, [...path, ch.name]));
  };
  mods.forEach((m) => {
    (m.pages ?? []).forEach((pg: PageItem) => {
      if (pg.name.toLowerCase().includes(nq)) hits.push({ moduleName: m.name, path: [], pageName: pg.name, url: pg.url, label: pg.name, crumb: m.name, kind: 'page' });
    });
    (m.submodules ?? []).forEach((sub: SubmoduleItem) => walkSub(m.name, sub, [sub.name]));
  });
  return hits;
}

export default function Sidebar({ modules, loading, onRefresh, onNotify, onNavigate, onCollapse, focusSearchSignal }: Props) {
  const { selected, setSelected } = useModuleStore();
  const { urlRaiz } = useSessionStore();
  const webBase = getWebBase(urlRaiz);

  const searchRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [expandedSubmodules, setExpandedSubmodules] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<FormTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (selected?.moduleName) {
      setExpanded((current) => (current.includes(selected.moduleName) ? current : [...current, selected.moduleName]));
    }
    if (selected?.moduleName && selected?.submoduleName) {
      const key = `${selected.moduleName}::${selected.submoduleName}`;
      setExpandedSubmodules((current) => (current.includes(key) ? current : [...current, key]));
    }
  }, [selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (focusSearchSignal) searchRef.current?.focus();
  }, [focusSearchSignal]);

  const searching = query.trim().length > 0;
  const hits = useMemo(() => buildHits(modules, query), [modules, query]);

  const openForm = (target: FormTarget) => {
    setForm(target);
    setNewName('');
    setNewUrl(target.type === 'page' ? webBase : '');
  };

  const closeForm = () => {
    setForm(null);
    setNewName('');
    setNewUrl('');
  };

  const openRename = (target: RenameTarget) => { setRenameTarget(target); setRenameValue(target.current); };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    const nv = renameValue.trim();
    setSubmitting(true);
    try {
      if (renameTarget.kind === 'module') {
        await api.post(`/modules/${renameTarget.moduleName}/rename`, { newName: nv });
      } else if (renameTarget.kind === 'submodule') {
        await api.post(`/modules/${renameTarget.moduleName}/tree/rename-submodule`, { path: renameTarget.path, newName: nv });
      } else {
        await api.post(`/modules/${renameTarget.moduleName}/tree/rename-page`, { path: renameTarget.path, name: renameTarget.pageName, newName: nv });
      }
      onNotify('Renombrado correctamente.');
      if (selected?.moduleName === renameTarget.moduleName) setSelected(null);
      setRenameTarget(null);
      onRefresh();
    } catch (requestError: unknown) {
      const message = requestError && typeof requestError === 'object' && 'response' in requestError
        ? (requestError as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      onNotify(message ?? 'No fue posible renombrar.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleExpanded = (moduleName: string) => {
    setExpanded((current) => (current.includes(moduleName) ? [] : [moduleName]));
    setExpandedSubmodules([]); // acordeón: al cambiar de módulo, colapsa submódulos
  };

  const openModule = (moduleName: string) => {
    setExpanded([moduleName]);
    setExpandedSubmodules([]);
  };

  const toggleExpandedSubmodule = (key: string) => {
    setExpandedSubmodules((current) => {
      const isOpen = current.includes(key);
      const sep = key.indexOf('::');
      const mod = key.slice(0, sep);
      const segs = key.slice(sep + 2).split('/');
      const prefixes = segs.map((_, i) => `${mod}::${segs.slice(0, i + 1).join('/')}`);
      // abrir: ancestros + este; cerrar: solo ancestros (colapsa este y sus hijos)
      return isOpen ? prefixes.slice(0, -1) : prefixes;
    });
  };

  const handleSelection = (selection: SelectedModule | null) => {
    setSelected(selection);
    onNavigate?.();
  };

  const selectHit = (h: SearchHit) => {
    if (h.kind === 'page') {
      if (h.path.length === 0) handleSelection({ moduleName: h.moduleName, pageName: h.pageName, pageUrl: h.url });
      else handleSelection({ moduleName: h.moduleName, submoduleName: h.path[h.path.length - 1], submodulePath: h.path, pageName: h.pageName, pageUrl: h.url });
    } else {
      handleSelection({ moduleName: h.moduleName, submoduleName: h.path[h.path.length - 1], submodulePath: h.path });
    }
  };

  const handleCreate = async () => {
    if (!form || !newName.trim() || (form.type === 'page' && !newUrl.trim())) return;

    setSubmitting(true);
    try {
      if (form.type === 'module') {
        await api.post('/modules', { name: newName.trim() });
        onNotify('Modulo creado correctamente.');
      } else if (form.type === 'page') {
        if (form.path) {
          await api.post(`/modules/${form.parent}/tree/pages`, { path: form.path, name: newName.trim(), url: newUrl.trim() });
          const k = `${form.parent}::${form.path.join('/')}`;
          setExpandedSubmodules((c) => (c.includes(k) ? c : [...c, k]));
        } else if (form.submoduleName) {
          await api.post(`/modules/${form.parent}/submodules/${form.submoduleName}/pages`, {
            name: newName.trim(),
            url: newUrl.trim(),
          });
          const key = `${form.parent}::${form.submoduleName}`;
          setExpandedSubmodules((current) => (current.includes(key) ? current : [...current, key]));
        } else {
          await api.post(`/modules/${form.parent}/pages`, { name: newName.trim(), url: newUrl.trim() });
          setExpanded((current) => (current.includes(form.parent) ? current : [...current, form.parent]));
        }
        onNotify('Pagina agregada correctamente.');
      } else if (form.path) {
        await api.post(`/modules/${form.parent}/tree/submodules`, { path: [...form.path, newName.trim()] });
        const k = `${form.parent}::${form.path.join('/')}`;
        setExpandedSubmodules((c) => (c.includes(k) ? c : [...c, k]));
        onNotify('Submodulo agregado correctamente.');
      } else {
        await api.post(`/modules/${form.parent}/submodules`, { name: newName.trim() });
        setExpanded((current) => (current.includes(form.parent) ? current : [...current, form.parent]));
        onNotify('Submodulo agregado correctamente.');
      }

      closeForm();
      onRefresh();
    } catch (requestError: unknown) {
      const message = requestError && typeof requestError === 'object' && 'response' in requestError
        ? (requestError as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      onNotify(message ?? 'No fue posible completar la accion.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setSubmitting(true);
    try {
      if (deleteTarget.type === 'module') {
        await api.delete(`/modules/${deleteTarget.moduleName}`);
        if (selected?.moduleName === deleteTarget.moduleName) setSelected(null);
        onNotify('Modulo eliminado.');
      } else if (deleteTarget.type === 'page') {
        if (deleteTarget.path) {
          await api.post(`/modules/${deleteTarget.moduleName}/tree/delete-page`, { path: deleteTarget.path, name: deleteTarget.pageName });
        } else if (deleteTarget.submoduleName) {
          await api.delete(`/modules/${deleteTarget.moduleName}/submodules/${deleteTarget.submoduleName}/pages/${deleteTarget.pageName}`);
        } else {
          await api.delete(`/modules/${deleteTarget.moduleName}/pages/${deleteTarget.pageName}`);
        }
        if (
          selected?.moduleName === deleteTarget.moduleName &&
          selected.pageName === deleteTarget.pageName &&
          selected.submoduleName === deleteTarget.submoduleName
        ) setSelected(null);
        onNotify('Pagina eliminada.');
      } else {
        if (deleteTarget.path) {
          await api.post(`/modules/${deleteTarget.moduleName}/tree/delete-submodule`, { path: deleteTarget.path });
        } else {
          await api.delete(`/modules/${deleteTarget.moduleName}/submodules/${deleteTarget.submoduleName}`);
        }
        if (selected?.moduleName === deleteTarget.moduleName && selected.submoduleName === deleteTarget.submoduleName) setSelected(null);
        onNotify('Submodulo eliminado.');
      }

      setDeleteTarget(null);
      onRefresh();
    } catch (requestError: unknown) {
      const message = requestError && typeof requestError === 'object' && 'response' in requestError
        ? (requestError as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      onNotify(message ?? 'No fue posible eliminar el elemento.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const isSelected = (moduleName: string, pageName?: string, submoduleName?: string) => (
    selected?.moduleName === moduleName
    && selected?.pageName === pageName
    && selected?.submoduleName === submoduleName
  );

  return (
    <>
      <Box width={320} height="100%" display="flex" flexDirection="column" bgcolor="background.paper">
        <Stack spacing={2} px={2} py={2.5}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Navegacion
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="h6" flex={1}>Modulos</Typography>
              {onCollapse && (
                <Tooltip title="Colapsar módulos">
                  <IconButton size="small" onClick={onCollapse}>
                    <ChevronLeftRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Selecciona una pagina o submodulo para trabajar en su contexto.
            </Typography>
          </Box>

          <Button fullWidth variant="contained" size="small" startIcon={<AddRoundedIcon />} onClick={() => openForm({ type: 'module' })}>
            Nuevo modulo
          </Button>

          <TextField
            size="small"
            inputRef={searchRef}
            placeholder="Buscar página, módulo o URL…  (⌘K)"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            inputProps={{ 'aria-label': 'Buscar página, módulo o URL' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={`${modules.length} modulos`} size="small" variant="outlined" />
            <Chip label={`${countAllPages(modules)} paginas`} size="small" variant="outlined" />
          </Stack>
        </Stack>

        <Divider />

        <Box flex={1} overflow="auto" px={1.5} py={1.5}>
          {loading && <RowsSkeleton rows={6} height={40} />}
          {!loading && searching && hits.length === 0 && <Alert severity="info" variant="outlined">Sin resultados para «{query.trim()}».</Alert>}
          {!loading && !searching && modules.length === 0 && <Alert severity="info" variant="outlined">Aún no hay módulos. Crea uno con "Nuevo módulo".</Alert>}

          <List disablePadding>
            {searching && hits.slice(0, 100).map((h, i) => (
              <ListItemButton
                key={h.moduleName + '/' + h.path.join('/') + '/' + (h.pageName ?? '') + '-' + i}
                selected={isSelected(h.moduleName, h.pageName, h.path.length ? h.path[h.path.length - 1] : undefined)}
                onClick={() => selectHit(h)}
                sx={{ borderRadius: 1, alignItems: 'flex-start', ...selectedRowSx }}
              >
                <ListItemIcon sx={{ minWidth: 30, mt: 0.5 }}>
                  {h.kind === 'page' ? <DescriptionRoundedIcon fontSize="small" /> : <FolderRoundedIcon fontSize="small" />}
                </ListItemIcon>
                <ListItemText
                  primary={h.label}
                  secondary={h.crumb}
                  primaryTypographyProps={{ noWrap: true, variant: 'body2' }}
                  secondaryTypographyProps={{ noWrap: true, variant: 'caption', sx: { color: 'text.secondary' } }}
                />
              </ListItemButton>
            ))}
            {searching && hits.length > 100 && (
              <Typography variant="caption" sx={{ display: 'block', px: 1.5, py: 1, color: T.text.muted }}>
                Mostrando 100 de {hits.length} resultados. Afina la búsqueda.
              </Typography>
            )}
            {!searching && modules.map((module) => {
              const moduleExpanded = expanded.includes(module.name);

              return (
                <Box key={module.name} mb={0.5}>
                  {/* Módulo raíz */}
                  <ListItemButton
                    selected={isSelected(module.name)}
                    onClick={() => {
                      handleSelection({ moduleName: module.name });
                      openModule(module.name);
                    }}
                    sx={{ borderRadius: 1, ...selectedRowSx }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <WidgetsRoundedIcon fontSize="small" color={isSelected(module.name) ? 'primary' : 'inherit'} />
                    </ListItemIcon>
                    <ListItemText
                      primary={module.name}
                      secondary={metaLabel(module.pages?.length ?? 0, module.submodules?.length ?? 0) || undefined}
                      primaryTypographyProps={{ fontWeight: 700, noWrap: true, variant: 'body2' }}
                      secondaryTypographyProps={{ noWrap: true, variant: 'caption' }}
                    />
                    <RowMenu ariaLabel="Acciones del módulo" actions={[
                      { label: 'Renombrar', icon: <EditRoundedIcon fontSize="small" />, onClick: () => openRename({ kind: 'module', moduleName: module.name, current: module.name }) },
                      { label: 'Eliminar', icon: <DeleteOutlineRoundedIcon fontSize="small" />, danger: true, onClick: () => setDeleteTarget({ type: 'module', moduleName: module.name, label: module.name }) },
                    ]} />
                    <IconButton size="small" aria-label={moduleExpanded ? 'Colapsar módulo' : 'Expandir módulo'} onClick={(e) => { e.stopPropagation(); toggleExpanded(module.name); }}>
                      {moduleExpanded ? <ExpandLessRoundedIcon fontSize="small" /> : <ExpandMoreRoundedIcon fontSize="small" />}
                    </IconButton>
                  </ListItemButton>

                  <Collapse in={moduleExpanded} timeout="auto" unmountOnExit>
                    {/* Contenedor con línea vertical izquierda */}
                    <Box
                      sx={{
                        ml: 2,
                        pl: 1,
                        borderLeft: '2px solid',
                        borderColor: 'divider',
                      }}
                    >
                      {/* Páginas del módulo */}
                      {(module.pages ?? []).map((page) => (
                        <ListItemButton
                          key={page.name}
                          selected={isSelected(module.name, page.name)}
                          onClick={() => handleSelection({ moduleName: module.name, pageName: page.name, pageUrl: page.url })}
                          sx={{ borderRadius: 1, py: 0.5, ...selectedRowSx }}
                        >
                          <ListItemIcon sx={{ minWidth: 30 }}>
                            <Box sx={{ width: 6, height: 6, borderRadius: '50%', ml: '5px', bgcolor: isSelected(module.name, page.name) ? T.primary.main : T.text.muted }} />
                          </ListItemIcon>
                          <ListItemText
                            primary={page.name}
                            primaryTypographyProps={{ noWrap: true, variant: 'body2' }}
                            secondaryTypographyProps={{ noWrap: true, variant: 'caption' }}
                          />
                          <RowMenu ariaLabel="Acciones de la página" actions={[
                            { label: 'Renombrar', icon: <EditRoundedIcon fontSize="small" />, onClick: () => openRename({ kind: 'page', moduleName: module.name, path: [], pageName: page.name, current: page.name }) },
                            { label: 'Eliminar', icon: <DeleteOutlineRoundedIcon fontSize="small" />, danger: true, onClick: () => setDeleteTarget({ type: 'page', moduleName: module.name, pageName: page.name, label: page.name }) },
                          ]} />
                        </ListItemButton>
                      ))}

                      {/* Submodulos (recursivo, N niveles) */}
                      {(module.submodules ?? []).map((submodule) => (
                        <SubmoduleTree
                          key={submodule.name}
                          moduleName={module.name}
                          submodule={submodule}
                          path={[submodule.name]}
                          depth={0}
                          selected={selected}
                          expandedKeys={expandedSubmodules}
                          onToggle={toggleExpandedSubmodule}
                          onSelectSub={(m, p) => handleSelection({ moduleName: m, submoduleName: p[p.length - 1], submodulePath: p })}
                          onSelectPage={(m, p, pg) => handleSelection({ moduleName: m, submoduleName: p[p.length - 1], submodulePath: p, pageName: pg.name, pageUrl: pg.url })}
                          onDeleteSub={(m, p, label) => setDeleteTarget({ type: 'submodule', moduleName: m, submoduleName: p[p.length - 1], label, path: p })}
                          onDeletePage={(m, p, pageName) => setDeleteTarget({ type: 'page', moduleName: m, pageName, label: pageName, submoduleName: p[p.length - 1], path: p })}
                          onRenameSub={(m, p) => openRename({ kind: 'submodule', moduleName: m, path: p, current: p[p.length - 1] })}
                          onRenamePage={(m, p, pageName) => openRename({ kind: 'page', moduleName: m, path: p, pageName, current: pageName })}
                          onAdd={(m, p, kind) => (kind === 'page'
                            ? openForm({ type: 'page', parent: m, submoduleName: p[p.length - 1], path: p })
                            : openForm({ type: 'submodule', parent: m, path: p }))}
                        />
                      ))}

                      {/* Acciones del módulo: agregar página o submodulo */}
                      <Stack direction="row" spacing={1} py={0.75} pr={0.5}>
                        <Button
                          fullWidth
                          size="small"
                          variant="outlined"
                          startIcon={<DescriptionRoundedIcon fontSize="small" />}
                          onClick={() => openForm({ type: 'page', parent: module.name })}
                        >
                          Pagina
                        </Button>
                        <Button
                          fullWidth
                          size="small"
                          variant="outlined"
                          startIcon={<FolderRoundedIcon fontSize="small" />}
                          onClick={() => openForm({ type: 'submodule', parent: module.name })}
                        >
                          Submodulo
                        </Button>
                      </Stack>
                    </Box>
                  </Collapse>
                </Box>
              );
            })}
          </List>
        </Box>
      </Box>

      {/* Dialog crear */}
      <Dialog open={Boolean(form)} onClose={closeForm} fullWidth maxWidth="sm">
        <DialogTitle>
          {form?.type === 'module' && 'Crear modulo'}
          {form?.type === 'page' && (form.submoduleName ? `Agregar pagina en "${form.submoduleName}"` : 'Agregar pagina')}
          {form?.type === 'submodule' && 'Agregar submodulo'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={0.5}>
            <TextField
              autoFocus
              label={form?.type === 'page' ? 'Nombre de la pagina' : 'Nombre'}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) handleCreate(); }}
            />
            {form?.type === 'page' && (
              <TextField
                label="URL"
                helperText="Usa la URL completa de la pagina a probar."
                value={newUrl}
                onChange={(event) => setNewUrl(event.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newUrl.trim()) handleCreate(); }}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeForm}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={submitting || !newName.trim() || (form?.type === 'page' && !newUrl.trim())}
          >
            {submitting ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog renombrar */}
      <Dialog open={Boolean(renameTarget)} onClose={() => setRenameTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Renombrar {renameTarget?.kind === 'module' ? 'módulo' : renameTarget?.kind === 'submodule' ? 'submódulo' : 'página'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Nuevo nombre"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && renameValue.trim()) handleRename(); }}
            sx={{ mt: 0.5 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameTarget(null)}>Cancelar</Button>
          <Button variant="contained" onClick={handleRename} disabled={submitting || !renameValue.trim() || renameValue.trim() === renameTarget?.current}>
            {submitting ? 'Guardando...' : 'Renombrar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog eliminar */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Eliminar elemento</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            Esta accion eliminara <strong>{deleteTarget?.label}</strong> y sus pruebas asociadas.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={submitting}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
