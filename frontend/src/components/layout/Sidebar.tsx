import { useEffect, useMemo, useState } from 'react';
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
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import WidgetsRoundedIcon from '@mui/icons-material/WidgetsRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import api from '../../api/client';
import { useModuleStore, type SelectedModule } from '../../store/useModuleStore';
import { useSessionStore } from '../../store/useSessionStore';
import type { ModuleItem } from '../../types/platform';
import { getWebBase } from '../../utils/platform';

type FormTarget =
  | { type: 'module' }
  | { type: 'page'; parent: string; submoduleName?: string }
  | { type: 'submodule'; parent: string };

type DeleteTarget =
  | { type: 'module'; moduleName: string; label: string }
  | { type: 'page'; moduleName: string; pageName: string; label: string; submoduleName?: string }
  | { type: 'submodule'; moduleName: string; submoduleName: string; label: string };

interface Props {
  modules: ModuleItem[];
  loading: boolean;
  onRefresh: () => void;
  onNotify: (message: string, severity?: 'success' | 'error' | 'info') => void;
  onNavigate?: () => void;
}

export default function Sidebar({ modules, loading, onRefresh, onNotify, onNavigate }: Props) {
  const { selected, setSelected } = useModuleStore();
  const { urlRaiz } = useSessionStore();
  const webBase = getWebBase(urlRaiz);

  const [expanded, setExpanded] = useState<string[]>([]);
  const [expandedSubmodules, setExpandedSubmodules] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<FormTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
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

  const filteredModules = useMemo(() => {
    if (!query.trim()) return modules;

    const normalizedQuery = query.toLowerCase();
    return modules.filter((module) => {
      const moduleMatch = module.name.toLowerCase().includes(normalizedQuery);
      const pageMatch = (module.pages ?? []).some((page) => page.name.toLowerCase().includes(normalizedQuery));
      const submoduleMatch = (module.submodules ?? []).some((submodule) =>
        submodule.name.toLowerCase().includes(normalizedQuery) ||
        (submodule.pages ?? []).some((p) => p.name.toLowerCase().includes(normalizedQuery))
      );
      return moduleMatch || pageMatch || submoduleMatch;
    });
  }, [modules, query]);

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

  const toggleExpanded = (moduleName: string) => {
    setExpanded((current) => (
      current.includes(moduleName)
        ? current.filter((item) => item !== moduleName)
        : [...current, moduleName]
    ));
  };

  const toggleExpandedSubmodule = (key: string) => {
    setExpandedSubmodules((current) => (
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    ));
  };

  const handleSelection = (selection: SelectedModule | null) => {
    setSelected(selection);
    onNavigate?.();
  };

  const handleCreate = async () => {
    if (!form || !newName.trim() || (form.type === 'page' && !newUrl.trim())) return;

    setSubmitting(true);
    try {
      if (form.type === 'module') {
        await api.post('/modules', { name: newName.trim() });
        onNotify('Modulo creado correctamente.');
      } else if (form.type === 'page') {
        if (form.submoduleName) {
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
        if (deleteTarget.submoduleName) {
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
        await api.delete(`/modules/${deleteTarget.moduleName}/submodules/${deleteTarget.submoduleName}`);
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
            <Typography variant="h6">Modulos</Typography>
            <Typography variant="body2" color="text.secondary">
              Selecciona una pagina o submodulo para trabajar en su contexto.
            </Typography>
          </Box>

          <Button fullWidth variant="contained" size="small" startIcon={<AddRoundedIcon />} onClick={() => openForm({ type: 'module' })}>
            Nuevo modulo
          </Button>

          <TextField
            size="small"
            placeholder="Buscar modulo o pagina"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
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
            <Chip label={`${modules.reduce((total, module) => total + (module.pages?.length ?? 0), 0)} paginas`} size="small" variant="outlined" />
          </Stack>
        </Stack>

        <Divider />

        <Box flex={1} overflow="auto" px={1.5} py={1.5}>
          {loading && <Alert severity="info" variant="outlined">Cargando modulos y estructura de pruebas.</Alert>}
          {!loading && filteredModules.length === 0 && <Alert severity="info" variant="outlined">No hay resultados para la busqueda actual.</Alert>}

          <List disablePadding>
            {filteredModules.map((module) => {
              const moduleExpanded = expanded.includes(module.name);

              return (
                <Box key={module.name} mb={0.5}>
                  {/* Módulo raíz */}
                  <ListItemButton
                    selected={isSelected(module.name)}
                    onClick={() => {
                      handleSelection({ moduleName: module.name });
                      toggleExpanded(module.name);
                    }}
                    sx={{ borderRadius: 1 }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <WidgetsRoundedIcon fontSize="small" color={isSelected(module.name) ? 'primary' : 'inherit'} />
                    </ListItemIcon>
                    <ListItemText
                      primary={module.name}
                      secondary={`${module.pages?.length ?? 0} pag · ${module.submodules?.length ?? 0} sub`}
                      primaryTypographyProps={{ fontWeight: 700, noWrap: true, variant: 'body2' }}
                      secondaryTypographyProps={{ noWrap: true, variant: 'caption' }}
                    />
                    <Tooltip title="Eliminar modulo">
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteTarget({ type: 'module', moduleName: module.name, label: module.name });
                        }}
                      >
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleExpanded(module.name); }}>
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
                          sx={{ borderRadius: 1, py: 0.5 }}
                        >
                          <ListItemIcon sx={{ minWidth: 30 }}>
                            <DescriptionRoundedIcon fontSize="small" color={isSelected(module.name, page.name) ? 'primary' : 'inherit'} />
                          </ListItemIcon>
                          <ListItemText
                            primary={page.name}
                            secondary={page.url}
                            primaryTypographyProps={{ noWrap: true, variant: 'body2' }}
                            secondaryTypographyProps={{ noWrap: true, variant: 'caption' }}
                          />
                          <IconButton
                            edge="end"
                            size="small"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteTarget({ type: 'page', moduleName: module.name, pageName: page.name, label: page.name });
                            }}
                          >
                            <DeleteOutlineRoundedIcon fontSize="small" />
                          </IconButton>
                        </ListItemButton>
                      ))}

                      {/* Submodulos */}
                      {(module.submodules ?? []).map((submodule) => {
                        const subKey = `${module.name}::${submodule.name}`;
                        const subExpanded = expandedSubmodules.includes(subKey);
                        const subPages = submodule.pages ?? [];

                        return (
                          <Box key={submodule.name} mt={0.25}>
                            {/* Fila submodulo */}
                            <ListItemButton
                              selected={isSelected(module.name, undefined, submodule.name)}
                              onClick={() => {
                                handleSelection({ moduleName: module.name, submoduleName: submodule.name });
                                toggleExpandedSubmodule(subKey);
                              }}
                              sx={{ borderRadius: 1, py: 0.5 }}
                            >
                              <ListItemIcon sx={{ minWidth: 30 }}>
                                {isSelected(module.name, undefined, submodule.name)
                                  ? <FolderOpenRoundedIcon fontSize="small" color="primary" />
                                  : <FolderRoundedIcon fontSize="small" />}
                              </ListItemIcon>
                              <ListItemText
                                primary={submodule.name}
                                secondary={`${subPages.length} paginas`}
                                primaryTypographyProps={{ noWrap: true, variant: 'body2', fontWeight: 600 }}
                                secondaryTypographyProps={{ noWrap: true, variant: 'caption' }}
                              />
                              <Tooltip title="Eliminar submodulo">
                                <IconButton
                                  edge="end"
                                  size="small"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setDeleteTarget({ type: 'submodule', moduleName: module.name, submoduleName: submodule.name, label: submodule.name });
                                  }}
                                >
                                  <DeleteOutlineRoundedIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleExpandedSubmodule(subKey); }}>
                                {subExpanded ? <ExpandLessRoundedIcon fontSize="small" /> : <ExpandMoreRoundedIcon fontSize="small" />}
                              </IconButton>
                            </ListItemButton>

                            {/* Páginas del submodulo */}
                            <Collapse in={subExpanded} timeout="auto" unmountOnExit>
                              <Box
                                sx={{
                                  ml: 1.5,
                                  pl: 1,
                                  borderLeft: '2px solid',
                                  borderColor: 'divider',
                                }}
                              >
                                {subPages.map((page) => (
                                  <ListItemButton
                                    key={page.name}
                                    selected={isSelected(module.name, page.name, submodule.name)}
                                    onClick={() => handleSelection({
                                      moduleName: module.name,
                                      submoduleName: submodule.name,
                                      pageName: page.name,
                                      pageUrl: page.url,
                                    })}
                                    sx={{ borderRadius: 1, py: 0.5 }}
                                  >
                                    <ListItemIcon sx={{ minWidth: 30 }}>
                                      <DescriptionRoundedIcon
                                        fontSize="small"
                                        color={isSelected(module.name, page.name, submodule.name) ? 'primary' : 'inherit'}
                                      />
                                    </ListItemIcon>
                                    <ListItemText
                                      primary={page.name}
                                      secondary={page.url}
                                      primaryTypographyProps={{ noWrap: true, variant: 'body2' }}
                                      secondaryTypographyProps={{ noWrap: true, variant: 'caption' }}
                                    />
                                    <IconButton
                                      edge="end"
                                      size="small"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setDeleteTarget({
                                          type: 'page',
                                          moduleName: module.name,
                                          pageName: page.name,
                                          label: page.name,
                                          submoduleName: submodule.name,
                                        });
                                      }}
                                    >
                                      <DeleteOutlineRoundedIcon fontSize="small" />
                                    </IconButton>
                                  </ListItemButton>
                                ))}

                                {/* Botón agregar página en submodulo */}
                                <Box px={0.5} py={0.75}>
                                  <Button
                                    fullWidth
                                    size="small"
                                    variant="outlined"
                                    startIcon={<DescriptionRoundedIcon fontSize="small" />}
                                    onClick={() => openForm({ type: 'page', parent: module.name, submoduleName: submodule.name })}
                                  >
                                    Agregar pagina
                                  </Button>
                                </Box>
                              </Box>
                            </Collapse>
                          </Box>
                        );
                      })}

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
