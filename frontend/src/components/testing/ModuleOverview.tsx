import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import api from '../../api/client';
import type { SelectedModule } from '../../store/useModuleStore';
import { useModuleStore } from '../../store/useModuleStore';
import { useSessionStore } from '../../store/useSessionStore';
import type { ModuleItem, PageItem } from '../../types/platform';
import { getWebBase } from '../../utils/platform';

interface Props {
  selected: SelectedModule;
  modules: ModuleItem[];
  onRefresh: () => void;
  onNotify: (message: string, severity?: 'success' | 'error' | 'info') => void;
}

export default function ModuleOverview({ selected, modules, onRefresh, onNotify }: Props) {
  const { setSelected } = useModuleStore();
  const { urlRaiz } = useSessionStore();
  const webBase = getWebBase(urlRaiz);

  const [dialogOpen, setDialogOpen] = useState<'page' | 'submodule' | false>(false);
  const [deleteTarget, setDeleteTarget] = useState<PageItem | null>(null);
  const [pageName, setPageName] = useState('');
  const [pageUrl, setPageUrl] = useState(webBase);
  const [submoduleName, setSubmoduleName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const moduleData = useMemo(
    () => modules.find((module) => module.name === selected.moduleName),
    [modules, selected.moduleName],
  );

  const inSubmodule = Boolean(selected.submoduleName);

  const pages = useMemo(() => {
    if (inSubmodule) {
      return moduleData?.submodules?.find((s) => s.name === selected.submoduleName)?.pages ?? [];
    }
    return moduleData?.pages ?? [];
  }, [moduleData, inSubmodule, selected.submoduleName]);

  const submodules = moduleData?.submodules ?? [];

  const closeDialog = () => {
    setDialogOpen(false);
    setPageName('');
    setPageUrl(webBase);
    setSubmoduleName('');
  };

  const handleCreatePage = async () => {
    if (!pageName.trim() || !pageUrl.trim()) return;

    setSubmitting(true);
    try {
      if (inSubmodule) {
        await api.post(`/modules/${selected.moduleName}/submodules/${selected.submoduleName}/pages`, {
          name: pageName.trim(),
          url: pageUrl.trim(),
        });
      } else {
        await api.post(`/modules/${selected.moduleName}/pages`, {
          name: pageName.trim(),
          url: pageUrl.trim(),
        });
      }
      onNotify('Pagina agregada correctamente.');
      closeDialog();
      onRefresh();
    } catch (requestError: unknown) {
      const message = requestError && typeof requestError === 'object' && 'response' in requestError
        ? (requestError as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      onNotify(message ?? 'No fue posible guardar la pagina.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSubmodule = async () => {
    if (!submoduleName.trim()) return;

    setSubmitting(true);
    try {
      await api.post(`/modules/${selected.moduleName}/submodules`, { name: submoduleName.trim() });
      onNotify('Submodulo agregado correctamente.');
      closeDialog();
      onRefresh();
    } catch (requestError: unknown) {
      const message = requestError && typeof requestError === 'object' && 'response' in requestError
        ? (requestError as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      onNotify(message ?? 'No fue posible crear el submodulo.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setSubmitting(true);
    try {
      if (inSubmodule) {
        await api.delete(`/modules/${selected.moduleName}/submodules/${selected.submoduleName}/pages/${deleteTarget.name}`);
      } else {
        await api.delete(`/modules/${selected.moduleName}/pages/${deleteTarget.name}`);
      }
      onNotify('Pagina eliminada.');
      setDeleteTarget(null);
      onRefresh();
    } catch (requestError: unknown) {
      const message = requestError && typeof requestError === 'object' && 'response' in requestError
        ? (requestError as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      onNotify(message ?? 'No fue posible eliminar la pagina.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const navigateToPage = (row: PageItem) => {
    setSelected({
      moduleName: selected.moduleName,
      submoduleName: selected.submoduleName,
      pageName: row.name,
      pageUrl: row.url,
    });
  };

  const columns: GridColDef<PageItem>[] = [
    {
      field: 'name',
      headerName: 'Pagina',
      flex: 1,
      minWidth: 220,
    },
    {
      field: 'url',
      headerName: 'URL',
      flex: 1.4,
      minWidth: 260,
    },
    {
      field: 'actions',
      headerName: 'Acciones',
      sortable: false,
      filterable: false,
      width: 140,
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Abrir pruebas">
            <IconButton
              size="small"
              color="primary"
              aria-label={`Abrir pruebas de ${row.name}`}
              onClick={(event) => { event.stopPropagation(); navigateToPage(row); }}
            >
              <OpenInNewRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Eliminar página">
            <IconButton
              size="small"
              color="error"
              aria-label={`Eliminar ${row.name}`}
              onClick={(event) => { event.stopPropagation(); setDeleteTarget(row); }}
            >
              <DeleteOutlineRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  const statsCards = inSubmodule
    ? [
        {
          label: 'Submodulo activo',
          value: selected.submoduleName!,
          icon: <FolderRoundedIcon color="primary" />,
        },
        {
          label: 'Modulo padre',
          value: selected.moduleName,
          icon: <FolderRoundedIcon color="action" />,
        },
        {
          label: 'Paginas registradas',
          value: String(pages.length),
          icon: <DescriptionRoundedIcon color="primary" />,
        },
      ]
    : [
        {
          label: 'Modulo activo',
          value: selected.moduleName,
          icon: <FolderRoundedIcon color="primary" />,
        },
        {
          label: 'Paginas registradas',
          value: String(pages.length),
          icon: <DescriptionRoundedIcon color="primary" />,
        },
        {
          label: 'Submodulos',
          value: String(submodules.length),
          icon: <FolderRoundedIcon color="primary" />,
        },
      ];

  return (
    <Stack spacing={3}>
      <Grid container spacing={2}>
        {statsCards.map((item) => (
          <Grid key={item.label} size={{ xs: 12, md: 4 }}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center">
                  {item.icon}
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      {item.label}
                    </Typography>
                    <Typography variant="h6">{item.value}</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card>
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
            mb={2}
          >
            <Box>
              <Typography variant="h5">
                Paginas disponibles
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {inSubmodule
                  ? `Haz clic en una pagina para abrir sus pruebas API, UI y E2E.`
                  : 'Haz clic en una pagina para abrir sus pruebas API, UI y E2E.'}
              </Typography>
            </Box>
            {inSubmodule ? (
              <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDialogOpen('page')}>
                Nueva pagina
              </Button>
            ) : (
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => setDialogOpen('page')}>
                  Nueva pagina
                </Button>
                <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDialogOpen('submodule')}>
                  Nuevo submodulo
                </Button>
              </Stack>
            )}
          </Stack>

          <Box minHeight={360}>
            <DataGrid
              rows={pages}
              columns={columns}
              getRowId={(row) => row.name}
              disableRowSelectionOnClick
              pageSizeOptions={[5, 10]}
              initialState={{
                pagination: {
                  paginationModel: { pageSize: 5, page: 0 },
                },
              }}
              onRowClick={({ row }) => navigateToPage(row)}
              sx={{ cursor: 'pointer' }}
              slots={{
                noRowsOverlay: () => (
                  <Box height="100%" display="flex" alignItems="center" justifyContent="center">
                    <Stack alignItems="center" justifyContent="center" spacing={1}>
                      <Typography variant="subtitle1">Aun no hay paginas registradas.</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Crea una pagina para empezar a centralizar sus pruebas.
                      </Typography>
                    </Stack>
                  </Box>
                ),
              }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Dialog: agregar página */}
      <Dialog open={dialogOpen === 'page'} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>
          {inSubmodule ? `Agregar pagina en "${selected.submoduleName}"` : 'Agregar pagina'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={0.5}>
            <TextField
              autoFocus
              label="Nombre de la pagina"
              value={pageName}
              onChange={(event) => setPageName(event.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && pageName.trim() && pageUrl.trim()) handleCreatePage(); }}
            />
            <TextField
              label="URL"
              helperText="Usa la URL completa o la ruta preparada del entorno activo."
              value={pageUrl}
              onChange={(event) => setPageUrl(event.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && pageName.trim() && pageUrl.trim()) handleCreatePage(); }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancelar</Button>
          <Button variant="contained" onClick={handleCreatePage} disabled={submitting || !pageName.trim() || !pageUrl.trim()}>
            {submitting ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: agregar submodulo */}
      <Dialog open={dialogOpen === 'submodule'} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>Agregar submodulo en "{selected.moduleName}"</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={0.5}>
            <TextField
              autoFocus
              label="Nombre del submodulo"
              value={submoduleName}
              onChange={(event) => setSubmoduleName(event.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && submoduleName.trim()) handleCreateSubmodule(); }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancelar</Button>
          <Button variant="contained" onClick={handleCreateSubmodule} disabled={submitting || !submoduleName.trim()}>
            {submitting ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: eliminar página */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Eliminar pagina</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            Se eliminara <strong>{deleteTarget?.name}</strong> y sus pruebas asociadas.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={submitting}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
