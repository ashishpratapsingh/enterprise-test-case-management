import React from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { BulkFieldSpec, UseBulkEditResult } from '../../hooks/useBulkEdit';

export interface BulkResultEntry {
  field: string;
  succeeded: number;
  failed: number;
  firstError?: string;
}

export interface BulkEditDialogProps {
  open: boolean;
  onClose: () => void;
  /** What entity is being edited, e.g. "test case". Drives the title
   *  ("Bulk update N test cases") and the result-empty copy. */
  entityLabel: string;
  /** Plural form, falls back to ``entityLabel + 's'``. */
  entityPlural?: string;
  selectionCount: number;
  /** Backend cap on bulk operation size (default 500). */
  bulkMax?: number;
  fields: BulkFieldSpec[];
  bulk: UseBulkEditResult;
  busy: boolean;
  onApply: () => void;
  /** Per-field result rows displayed after Apply finishes. ``null``
   *  while the form is still being filled out. */
  result: { perField: BulkResultEntry[] } | null;
}

/**
 * JIRA-style bulk-edit dialog. Renders one row per ``fields`` entry —
 * a "Change <label>" checkbox and an input that's disabled until the
 * checkbox is ticked. Validation, an info / warning Alert stack, and
 * a result panel are all handled here so each page only has to wire
 * up:
 *
 * 1. The field spec (``BulkFieldSpec[]``)
 * 2. ``useBulkEdit(fields)`` for state / validation
 * 3. An ``onApply`` callback that translates ``bulk.changedFields``
 *    into the right backend calls
 *
 * The legacy hand-coded dialogs on Defects / TestCases / UserStories
 * lived in ~150 lines of JSX each; this lets a page collapse to ~20.
 */
const BulkEditDialog: React.FC<BulkEditDialogProps> = ({
  open,
  onClose,
  entityLabel,
  entityPlural,
  selectionCount,
  bulkMax = 500,
  fields,
  bulk,
  busy,
  onApply,
  result,
}) => {
  const plural = entityPlural || `${entityLabel}s`;
  const noun = selectionCount === 1 ? entityLabel : plural;
  const tooMany = selectionCount > bulkMax;
  const noRows = selectionCount === 0;

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ pr: 6 }}>
        Bulk update {selectionCount} {noun}
        <IconButton
          aria-label="Close"
          onClick={onClose}
          disabled={busy}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Tick the checkbox next to each field you want to change. Untouched fields are left as-is on every selected {entityLabel}.
        </Typography>

        {!result && noRows && (
          <Alert severity="error" sx={{ mb: 2 }}>
            No {plural} selected. Close this dialog and pick at least one row.
          </Alert>
        )}
        {!result && tooMany && (
          <Alert severity="error" sx={{ mb: 2 }}>
            You selected {selectionCount} {plural} but the backend only accepts {bulkMax} per bulk operation. Narrow the selection and try again.
          </Alert>
        )}
        {!result && !bulk.anyFieldChanged && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Tick at least one field below to enable Apply.
          </Alert>
        )}

        {/* Field rows */}
        {fields.map((field) => {
          const fs = bulk.state[field.key] || { changed: false, value: '' };
          const error = bulk.errors[field.key];
          const disabled = !fs.changed;

          return (
            <Box
              key={field.key}
              display="flex"
              alignItems="flex-start"
              gap={2}
              mb={2}
            >
              <FormControlLabel
                sx={{ minWidth: 140, m: 0, mt: 1 }}
                control={
                  <Checkbox
                    checked={fs.changed}
                    onChange={(e) => bulk.setChanged(field.key, e.target.checked)}
                  />
                }
                label={field.label}
              />
              {field.type === 'select' ? (
                <FormControl
                  size="small"
                  fullWidth
                  disabled={disabled}
                  error={!!error}
                  required={fs.changed && field.required !== false}
                >
                  <InputLabel>{field.label.replace(/^Change\s+/i, '')}</InputLabel>
                  <Select
                    label={field.label.replace(/^Change\s+/i, '')}
                    value={fs.value}
                    onChange={(e) => bulk.setValue(field.key, e.target.value as string)}
                    inputProps={
                      field.inputAriaLabel
                        ? { 'aria-label': field.inputAriaLabel }
                        : undefined
                    }
                  >
                    {(field.options || []).map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.value === '' ? <em>{opt.label}</em> : opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                  {(error || (fs.changed && field.helperText)) && (
                    <FormHelperText>{error || field.helperText}</FormHelperText>
                  )}
                </FormControl>
              ) : (
                <TextField
                  size="small"
                  fullWidth
                  type={field.type === 'number' ? 'number' : 'text'}
                  label={field.label.replace(/^Change\s+/i, '')}
                  value={fs.value}
                  onChange={(e) => bulk.setValue(field.key, e.target.value)}
                  disabled={disabled}
                  error={!!error}
                  helperText={
                    error || (fs.changed ? field.helperText : undefined)
                  }
                  inputProps={
                    field.inputAriaLabel
                      ? { 'aria-label': field.inputAriaLabel }
                      : undefined
                  }
                />
              )}
            </Box>
          );
        })}

        {/* Result panel — replaces field inputs visually after Apply */}
        {result && (
          <Box
            sx={{
              mt: 2,
              p: 1.5,
              borderRadius: 1,
              border: 1,
              borderColor: 'divider',
              backgroundColor: 'action.hover',
            }}
          >
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              Result
            </Typography>
            {result.perField.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No changes applied.
              </Typography>
            ) : (
              result.perField.map((r, i) => (
                <Box key={i} display="flex" alignItems="center" gap={1} mb={0.5}>
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {r.field}
                  </Typography>
                  {r.succeeded > 0 && (
                    <Chip
                      size="small"
                      label={`${r.succeeded} updated`}
                      sx={{
                        fontSize: 11,
                        fontWeight: 600,
                        bgcolor: 'rgba(16,185,129,0.1)',
                        color: '#10b981',
                        border: '1px solid rgba(16,185,129,0.3)',
                      }}
                    />
                  )}
                  {r.failed > 0 && (
                    <Tooltip title={r.firstError || 'Some failed'}>
                      <Chip
                        size="small"
                        label={`${r.failed} failed`}
                        sx={{
                          fontSize: 11,
                          fontWeight: 600,
                          bgcolor: 'rgba(239,68,68,0.1)',
                          color: '#ef4444',
                          border: '1px solid rgba(239,68,68,0.3)',
                        }}
                      />
                    </Tooltip>
                  )}
                </Box>
              ))
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {result ? 'Done' : 'Cancel'}
        </Button>
        {!result && (
          <Button
            variant="contained"
            onClick={onApply}
            disabled={busy || !bulk.isValid || tooMany || noRows}
          >
            {busy ? 'Applying…' : `Apply to ${selectionCount}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default BulkEditDialog;
