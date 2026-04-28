import React from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from '@mui/material';
import { Close as CloseIcon, Edit as EditIcon } from '@mui/icons-material';

export interface ViewDialogProps {
  open: boolean;
  onClose: () => void;
  /** Title bar content. Pass a string for plain titles, or arbitrary
   *  JSX (typically a heading + chips row) when the dialog needs
   *  inline metadata next to the title. */
  title: React.ReactNode;
  /** When provided, an Edit button appears in the footer that calls
   *  this and (typically) triggers an edit dialog. Hidden when
   *  undefined — useful for read-only roles. */
  onEdit?: () => void;
  /** Footer Edit button label. Default ``Edit``. */
  editLabel?: string;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  fullScreen?: boolean;
  children: React.ReactNode;
}

/**
 * Read-only detail dialog shell. Replaces the hand-rolled JSX that
 * was duplicated across Projects / Defects / TestSuites / Roles /
 * Users / Requirements (Epics + Stories) — title bar + close icon +
 * divided body + Close/Edit footer.
 *
 * The body is just ``children`` so callers keep full control over
 * the field grid, attachments, embedded PermissionMatrix, etc.
 *
 * Title accepts arbitrary nodes so callers can pass either a plain
 * string ("Defect ABC") or a flex row of ``<Chip>`` siblings for
 * status / category / priority decorations.
 */
const ViewDialog: React.FC<ViewDialogProps> = ({
  open,
  onClose,
  title,
  onEdit,
  editLabel = 'Edit',
  maxWidth = 'md',
  fullScreen = false,
  children,
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={maxWidth}
      fullWidth
      fullScreen={fullScreen}
    >
      <DialogTitle sx={{ pr: 6 }}>
        {/* Wrap string titles so callers don't have to. JSX titles
            (with chips) are passed through unchanged. */}
        {typeof title === 'string' ? (
          <Typography variant="h6" fontWeight={700} component="span">
            {title}
          </Typography>
        ) : (
          <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
            {title}
          </Box>
        )}
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>{children}</DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {onEdit && (
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            onClick={onEdit}
          >
            {editLabel}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ViewDialog;
