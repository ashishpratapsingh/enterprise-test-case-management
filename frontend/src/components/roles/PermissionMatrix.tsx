import React, { useMemo } from 'react';
import {
  Box,
  Checkbox,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

/**
 * Canonical list of resources the app authorizes against. New backends
 * can introduce additional resources via the permissions JSON; the
 * matrix auto-discovers them and appends them so nothing is silently
 * dropped on edit.
 */
const KNOWN_RESOURCES = [
  'projects',
  'modules',
  'releases',
  'requirements',
  'epics',
  'user_stories',
  'test_cases',
  'test_suites',
  'test_runs',
  'executions',
  'defects',
  'attachments',
  'reports',
  'users',
  'roles',
  'audit',
  'integrations',
];

/**
 * Canonical action vocabulary. Same auto-discovery rule applies — any
 * non-canonical action found in the current permissions appears as an
 * extra column rather than being dropped.
 */
const KNOWN_ACTIONS = [
  'create',
  'read',
  'update',
  'delete',
  'execute',
  'assign',
  'approve',
  'export',
  'manage',
];

export type Permissions = Record<string, string[]>;

interface PermissionMatrixProps {
  value: Permissions;
  onChange: (next: Permissions) => void;
  disabled?: boolean;
}

function unique<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of arr) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

const PermissionMatrix: React.FC<PermissionMatrixProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const safeValue: Permissions = value || {};

  // Resources rendered = canonical list ∪ anything currently set on
  // this role. Same for actions. Order: canonical first, custom last.
  const resources = useMemo(
    () => unique([...KNOWN_RESOURCES, ...Object.keys(safeValue).sort()]),
    [safeValue],
  );
  const actions = useMemo(() => {
    const fromValue = Object.values(safeValue).flat();
    return unique([...KNOWN_ACTIONS, ...fromValue.sort()]);
  }, [safeValue]);

  const isChecked = (resource: string, action: string): boolean => {
    return (safeValue[resource] || []).includes(action);
  };

  const toggle = (resource: string, action: string) => {
    if (disabled) return;
    const current = safeValue[resource] || [];
    let nextActions: string[];
    if (current.includes(action)) {
      nextActions = current.filter((a) => a !== action);
    } else {
      nextActions = [...current, action];
    }
    const next: Permissions = { ...safeValue };
    if (nextActions.length === 0) {
      delete next[resource];
    } else {
      next[resource] = nextActions;
    }
    onChange(next);
  };

  const toggleResourceRow = (resource: string, on: boolean) => {
    if (disabled) return;
    const next: Permissions = { ...safeValue };
    if (on) {
      next[resource] = [...actions];
    } else {
      delete next[resource];
    }
    onChange(next);
  };

  const resourceFullySelected = (resource: string): boolean => {
    const current = safeValue[resource] || [];
    return actions.every((a) => current.includes(a));
  };

  const resourcePartiallySelected = (resource: string): boolean => {
    const current = safeValue[resource] || [];
    return current.length > 0 && !resourceFullySelected(resource);
  };

  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      sx={{ maxHeight: 460, mt: 1 }}
    >
      <Table size="small" stickyHeader aria-label="Permission matrix">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700, minWidth: 160, bgcolor: 'background.paper' }}>
              Resource
            </TableCell>
            {actions.map((action) => (
              <TableCell
                key={action}
                align="center"
                sx={{
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  fontSize: '0.75rem',
                  bgcolor: 'background.paper',
                  px: 0.5,
                }}
              >
                {action}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {resources.map((resource) => (
            <TableRow key={resource} hover>
              <TableCell
                sx={{
                  fontWeight: 500,
                  textTransform: 'capitalize',
                }}
              >
                <Box display="flex" alignItems="center" gap={1}>
                  <Checkbox
                    size="small"
                    indeterminate={resourcePartiallySelected(resource)}
                    checked={resourceFullySelected(resource)}
                    onChange={(e) => toggleResourceRow(resource, e.target.checked)}
                    inputProps={{
                      'aria-label': `Toggle all ${resource} actions`,
                    }}
                    disabled={disabled}
                  />
                  <Typography variant="body2" fontWeight={500}>
                    {resource.replace(/_/g, ' ')}
                  </Typography>
                </Box>
              </TableCell>
              {actions.map((action) => (
                <TableCell key={action} align="center" sx={{ px: 0.5 }}>
                  <Checkbox
                    size="small"
                    checked={isChecked(resource, action)}
                    onChange={() => toggle(resource, action)}
                    inputProps={{
                      'aria-label': `${resource} ${action}`,
                    }}
                    disabled={disabled}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default PermissionMatrix;
