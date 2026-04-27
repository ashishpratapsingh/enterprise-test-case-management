import React, { useMemo, useCallback, useRef } from 'react';
import {
  Box,
  CircularProgress,
  IconButton,
  Select,
  MenuItem,
  Typography,
  useTheme,
} from '@mui/material';
import {
  FirstPage as FirstPageIcon,
  LastPage as LastPageIcon,
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
} from '@mui/icons-material';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import type {
  ColDef,
  RowClickedEvent,
  ICellRendererParams,
} from 'ag-grid-community';

// Register all community modules
ModuleRegistry.registerModules([AllCommunityModule]);

// ── Compatible types re-exported for pages ─────────────────────────────────

export interface GridColDef {
  field: string;
  headerName: string;
  width?: number;
  flex?: number;
  minWidth?: number;
  sortable?: boolean;
  renderCell?: (params: any) => React.ReactNode;
  resizable?: boolean;
  autoHeight?: boolean;
  wrapText?: boolean;
}

export interface GridPaginationModel {
  page: number;
  pageSize: number;
}

// ── Props ───────────────────────────────────────────────────────────────────

interface DataTableProps {
  rows: any[];
  columns: GridColDef[];
  totalRows?: number;
  loading?: boolean;
  paginationModel?: GridPaginationModel;
  onPaginationModelChange?: (model: GridPaginationModel) => void;
  onRowClick?: (params: any) => void;
  pageSizeOptions?: number[];
  autoHeight?: boolean;
  density?: 'compact' | 'standard' | 'comfortable';
  getRowId?: (row: any) => any;
  paginationMode?: 'server' | 'client';
  checkboxSelection?: boolean;
  rowSelectionModel?: any;
  onRowSelectionModelChange?: (model: any) => void;
  sortModel?: any;
  onSortModelChange?: (model: any) => void;
  filterModel?: any;
  onFilterModelChange?: (model: any) => void;
  showToolbar?: boolean;
  getRowStyle?: (params: any) => Record<string, string | number> | undefined;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapColumns(columns: GridColDef[]): ColDef[] {
  return columns.map((col) => {
    const agCol: ColDef = {
      field: col.field,
      headerName: col.headerName,
      sortable: col.sortable !== false,
      resizable: col.resizable !== false,
    };

    if (col.width) agCol.width = col.width;
    if (col.flex) agCol.flex = col.flex;
    if (col.minWidth) agCol.minWidth = col.minWidth;
    if (col.autoHeight) agCol.autoHeight = true;
    if (col.wrapText) agCol.wrapText = true;

    if (col.renderCell) {
      const renderFn = col.renderCell;
      agCol.cellRenderer = (params: ICellRendererParams) => {
        const adapted = {
          value: params.value,
          row: params.data,
        };
        return renderFn(adapted);
      };
    }

    return agCol;
  });
}

const rowHeightMap = { compact: 36, standard: 44, comfortable: 56 };

// ── Custom AG Grid theme matching SabPaisa look ─────────────────────────────

const sabpaisaThemeLight = themeQuartz.withParams({
  accentColor: '#f57c00',
  borderColor: 'rgba(26, 35, 126, 0.08)',
  borderRadius: 8,
  browserColorScheme: 'light',
  fontFamily: '"DM Sans", "Inter", sans-serif',
  fontSize: 13,
  headerBackgroundColor: '#f8f9fc',
  headerFontWeight: 600,
  headerTextColor: '#1a237e',
  rowHoverColor: 'rgba(245, 124, 0, 0.04)',
  selectedRowBackgroundColor: 'rgba(245, 124, 0, 0.08)',
  oddRowBackgroundColor: '#ffffff',
  foregroundColor: '#2d2d3f',
  headerFontSize: 13,
});

const sabpaisaThemeDark = themeQuartz.withParams({
  accentColor: '#f57c00',
  borderColor: 'rgba(255, 255, 255, 0.08)',
  borderRadius: 8,
  browserColorScheme: 'dark',
  fontFamily: '"DM Sans", "Inter", sans-serif',
  fontSize: 13,
  backgroundColor: '#1a1d27',
  headerBackgroundColor: '#252836',
  headerFontWeight: 600,
  headerTextColor: '#9aa0aa',
  rowHoverColor: 'rgba(245, 124, 0, 0.08)',
  selectedRowBackgroundColor: 'rgba(245, 124, 0, 0.16)',
  oddRowBackgroundColor: '#1a1d27',
  foregroundColor: '#e6e7eb',
  headerFontSize: 13,
});

// ── Component ───────────────────────────────────────────────────────────────

const DataTable: React.FC<DataTableProps> = ({
  rows,
  columns,
  totalRows,
  loading = false,
  paginationModel = { page: 0, pageSize: 25 },
  onPaginationModelChange,
  onRowClick,
  pageSizeOptions = [10, 25, 50, 100],
  density = 'standard',
  getRowId,
  checkboxSelection = false,
  onRowSelectionModelChange,
  getRowStyle,
}) => {
  const gridRef = useRef<AgGridReact>(null);
  const muiTheme = useTheme();
  const sabpaisaTheme =
    muiTheme.palette.mode === 'dark' ? sabpaisaThemeDark : sabpaisaThemeLight;

  const agColumns = useMemo(() => mapColumns(columns), [columns]);

  const rowHeight = rowHeightMap[density] || 44;

  const total = totalRows ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / paginationModel.pageSize));
  const currentPage = paginationModel.page;
  const startRow = total === 0 ? 0 : currentPage * paginationModel.pageSize + 1;
  const endRow = Math.min((currentPage + 1) * paginationModel.pageSize, total);

  const onRowClicked = useCallback(
    (event: RowClickedEvent) => {
      if (!onRowClick) return;
      const target = event.event?.target as HTMLElement | null;
      if (target && (target.closest('button') || target.closest('a') || target.closest('[role="button"]'))) {
        return;
      }
      onRowClick({ row: event.data, id: getRowId ? getRowId(event.data) : event.data?.id });
    },
    [onRowClick, getRowId],
  );

  const getRowIdFn = useMemo(() => {
    if (getRowId) return (params: any) => String(getRowId(params.data));
    return (params: any) => String(params.data?.id ?? params.data?.Id ?? '');
  }, [getRowId]);

  const gridHeight = useMemo(() => {
    const headerHeight = 48;
    const paginationBarHeight = 52;
    const visibleRows = Math.min(rows.length || 1, paginationModel.pageSize);
    return headerHeight + visibleRows * rowHeight + paginationBarHeight + 2;
  }, [rows.length, paginationModel.pageSize, rowHeight]);

  const handlePageChange = (newPage: number) => {
    if (onPaginationModelChange && newPage >= 0 && newPage < totalPages) {
      onPaginationModelChange({ ...paginationModel, page: newPage });
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    if (onPaginationModelChange) {
      onPaginationModelChange({ page: 0, pageSize: newSize });
    }
  };

  return (
    <Box
      sx={{
        width: '100%',
        position: 'relative',
        '& .ag-root-wrapper': {
          borderRadius: '8px 8px 0 0',
          border: '1px solid rgba(26, 35, 126, 0.08)',
          borderBottom: 'none',
        },
        '& .ag-header': {
          borderBottom: '2px solid rgba(26, 35, 126, 0.08)',
        },
      }}
    >
      {loading && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.7)',
            zIndex: 10,
            borderRadius: '8px',
          }}
        >
          <CircularProgress sx={{ color: '#f57c00' }} />
        </Box>
      )}
      <Box sx={{ width: '100%', height: gridHeight - 52 }}>
        <AgGridReact
          ref={gridRef}
          theme={sabpaisaTheme}
          rowData={rows}
          columnDefs={agColumns}
          getRowId={getRowIdFn}
          rowHeight={rowHeight}
          headerHeight={48}
          pagination={false}
          suppressPaginationPanel
          onRowClicked={onRowClicked}
          rowSelection={
            // AG Grid v32+ object form. ``enableClickSelection: false``
            // replaces the deprecated top-level ``suppressRowClickSelection``.
            // When checkboxSelection is on we show a checkbox column +
            // header checkbox so the user can multi-select rows.
            checkboxSelection
              ? {
                  mode: 'multiRow',
                  enableClickSelection: false,
                  checkboxes: true,
                  headerCheckbox: true,
                }
              : undefined
          }
          onSelectionChanged={(event) => {
            if (!onRowSelectionModelChange) return;
            const selectedRows = event.api.getSelectedRows();
            const ids = selectedRows.map((r: any) =>
              getRowId ? getRowId(r) : r?.id,
            );
            onRowSelectionModelChange(ids);
          }}
          animateRows
          domLayout="normal"
          getRowStyle={getRowStyle}
        />
      </Box>
      {/* Custom Pagination Bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 0.5,
          height: 52,
          borderRadius: '0 0 8px 8px',
          border: '1px solid rgba(26, 35, 126, 0.08)',
          backgroundColor: '#f8f9fc',
        }}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="body2" color="text.secondary">
            Rows per page:
          </Typography>
          <Select
            size="small"
            value={paginationModel.pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            sx={{ fontSize: 13, height: 32, minWidth: 60 }}
          >
            {pageSizeOptions.map((opt) => (
              <MenuItem key={opt} value={opt}>{opt}</MenuItem>
            ))}
          </Select>
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="body2" color="text.secondary">
            {total === 0 ? '0 of 0' : `${startRow}–${endRow} of ${total}`}
          </Typography>
          <IconButton
            size="small"
            disabled={currentPage === 0}
            onClick={() => handlePageChange(0)}
          >
            <FirstPageIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            disabled={currentPage === 0}
            onClick={() => handlePageChange(currentPage - 1)}
          >
            <PrevIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            disabled={currentPage >= totalPages - 1}
            onClick={() => handlePageChange(currentPage + 1)}
          >
            <NextIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            disabled={currentPage >= totalPages - 1}
            onClick={() => handlePageChange(totalPages - 1)}
          >
            <LastPageIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
};

export default DataTable;
