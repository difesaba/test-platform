import { useState, type ReactNode, type MouseEvent } from 'react';
import { IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Tooltip } from '@mui/material';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';

export interface RowAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export default function RowMenu({ actions, ariaLabel = 'Acciones' }: { actions: RowAction[]; ariaLabel?: string }) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const open = Boolean(anchor);

  const openMenu = (e: MouseEvent<HTMLElement>) => { e.stopPropagation(); setAnchor(e.currentTarget); };
  const closeMenu = (e?: object) => { (e as MouseEvent | undefined)?.stopPropagation?.(); setAnchor(null); };

  return (
    <>
      <Tooltip title={ariaLabel}>
        <IconButton edge="end" size="small" aria-label={ariaLabel} onClick={openMenu}>
          <MoreVertRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={closeMenu}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        MenuListProps={{ dense: true }}
      >
        {actions.map((a) => (
          <MenuItem
            key={a.label}
            disabled={a.disabled}
            onClick={(e) => { e.stopPropagation(); setAnchor(null); a.onClick(); }}
            sx={a.danger ? { color: 'error.main' } : undefined}
          >
            {a.icon && <ListItemIcon sx={a.danger ? { color: 'error.main', minWidth: 32 } : { minWidth: 32 }}>{a.icon}</ListItemIcon>}
            <ListItemText>{a.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
