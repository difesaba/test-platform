import { Box, Button, Collapse, IconButton, ListItemButton, ListItemIcon, ListItemText, Stack } from '@mui/material';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import type { PageItem, SubmoduleItem } from '@/shared/types/platform';
import type { SelectedModule } from '@/shared/store/useModuleStore';
import RowMenu from '@/features/platform/components/RowMenu';
import { T } from '@/shared/theme/launcherTokens';

export interface SubmoduleTreeProps {
    moduleName: string;
    submodule: SubmoduleItem;
    path: string[];              // ruta completa hasta este submódulo (incluye su nombre)
    depth: number;
    selected: SelectedModule | null;
    expandedKeys: string[];
    onToggle: (key: string) => void;
    onSelectSub: (moduleName: string, path: string[]) => void;
    onSelectPage: (moduleName: string, path: string[], page: PageItem) => void;
    onDeleteSub: (moduleName: string, path: string[], label: string) => void;
    onRenameSub: (moduleName: string, path: string[]) => void;
    onRenamePage: (moduleName: string, path: string[], pageName: string) => void;
    onDeletePage: (moduleName: string, path: string[], pageName: string) => void;
    onAdd: (moduleName: string, path: string[], kind: 'page' | 'submodule') => void;
}

const metaLabel = (pages: number, subs: number): string => {
  const parts: string[] = [];
  if (pages > 0) parts.push(pages + ' pág');
  if (subs > 0) parts.push(subs + ' sub');
  return parts.join(' · ');
};

const selectedRowSx = {
  '&.Mui-selected': {
    backgroundColor: T.primary.tint,
    boxShadow: 'inset 3px 0 0 ' + T.primary.main,
    '&:hover': { backgroundColor: T.primary.tint },
    '& .MuiListItemText-primary': { color: T.primary.main },
  },
} as const;

export default function SubmoduleTree(props: SubmoduleTreeProps) {
    const { moduleName, submodule, path, depth, selected, expandedKeys, onToggle,
        onSelectSub, onSelectPage, onDeleteSub, onDeletePage, onAdd, onRenameSub, onRenamePage } = props;

    const key = `${moduleName}::${path.join('/')}`;
    const expanded = expandedKeys.includes(key);
    const pages = submodule.pages ?? [];
    const children = submodule.submodules ?? [];
    const last = path[path.length - 1];
    const subSelected = selected?.moduleName === moduleName && selected?.submoduleName === last && !selected?.pageName;

    return (
        <Box mt={0.25}>
            <ListItemButton
                selected={subSelected}
                onClick={() => { onSelectSub(moduleName, path); onToggle(key); }}
                sx={{ borderRadius: 1, py: 0.5, ...selectedRowSx }}
            >
                <ListItemIcon sx={{ minWidth: 30 }}>
                    {subSelected ? <FolderOpenRoundedIcon fontSize="small" color="primary" /> : <FolderRoundedIcon fontSize="small" />}
                </ListItemIcon>
                <ListItemText
                    primary={submodule.name}
                    secondary={metaLabel(pages.length, children.length) || undefined}
                    primaryTypographyProps={{ noWrap: true, variant: 'body2', fontWeight: 600 }}
                    secondaryTypographyProps={{ noWrap: true, variant: 'caption' }}
                />
                <RowMenu ariaLabel="Acciones del submódulo" actions={[
                    { label: 'Renombrar', icon: <EditRoundedIcon fontSize="small" />, onClick: () => onRenameSub(moduleName, path) },
                    { label: 'Eliminar', icon: <DeleteOutlineRoundedIcon fontSize="small" />, danger: true, onClick: () => onDeleteSub(moduleName, path, submodule.name) },
                ]} />
                <IconButton size="small" aria-label={expanded ? 'Colapsar submódulo' : 'Expandir submódulo'} onClick={(e) => { e.stopPropagation(); onToggle(key); }}>
                    {expanded ? <ExpandLessRoundedIcon fontSize="small" /> : <ExpandMoreRoundedIcon fontSize="small" />}
                </IconButton>
            </ListItemButton>

            <Collapse in={expanded} timeout="auto" unmountOnExit>
                <Box sx={{ ml: 1.5, pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}>
                    {/* Páginas directas */}
                    {pages.map((page) => {
                        const pageSelected = selected?.moduleName === moduleName && selected?.submoduleName === last && selected?.pageName === page.name;
                        return (
                            <ListItemButton
                                key={page.name}
                                selected={pageSelected}
                                onClick={() => onSelectPage(moduleName, path, page)}
                                sx={{ borderRadius: 1, py: 0.5, ...selectedRowSx }}
                            >
                                <ListItemIcon sx={{ minWidth: 30 }}>
                                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', ml: '5px', bgcolor: pageSelected ? T.primary.main : T.text.muted }} />
                                </ListItemIcon>
                                <ListItemText
                                    primary={page.name}
                                    primaryTypographyProps={{ noWrap: true, variant: 'body2' }}
                                    secondaryTypographyProps={{ noWrap: true, variant: 'caption' }}
                                />
                                <RowMenu ariaLabel="Acciones de la página" actions={[
                                    { label: 'Renombrar', icon: <EditRoundedIcon fontSize="small" />, onClick: () => onRenamePage(moduleName, path, page.name) },
                                    { label: 'Eliminar', icon: <DeleteOutlineRoundedIcon fontSize="small" />, danger: true, onClick: () => onDeletePage(moduleName, path, page.name) },
                                ]} />
                            </ListItemButton>
                        );
                    })}

                    {/* Submódulos hijos (recursivo) */}
                    {children.map((child) => (
                        <SubmoduleTree
                            {...props}
                            key={child.name}
                            submodule={child}
                            path={[...path, child.name]}
                            depth={depth + 1}
                        />
                    ))}

                    {/* Acciones dentro del submódulo */}
                    <Stack direction="row" spacing={1} py={0.5} pr={0.5}>
                        <Button fullWidth size="small" variant="outlined" startIcon={<DescriptionRoundedIcon fontSize="small" />}
                            onClick={() => onAdd(moduleName, path, 'page')}>
                            Pagina
                        </Button>
                        <Button fullWidth size="small" variant="outlined" startIcon={<FolderRoundedIcon fontSize="small" />}
                            onClick={() => onAdd(moduleName, path, 'submodule')}>
                            Submodulo
                        </Button>
                    </Stack>
                </Box>
            </Collapse>
        </Box>
    );
}
