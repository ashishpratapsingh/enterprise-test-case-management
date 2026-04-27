/**
 * Test stub for DataTable that renders rows as accessible HTML so tests can
 * assert on visible content. AG Grid uses DOM measurements that don't work
 * reliably under JSDOM, so we replace it entirely in component tests.
 *
 * Import this in tests:
 *   jest.mock('../components/common/DataTable', () => require('../test-utils/mockDataTable'));
 *
 * When ``checkboxSelection`` is on, each row gets a real <input type="checkbox">
 * wired up to call ``onRowSelectionModelChange`` with the toggled set of IDs.
 * Tests can simulate multi-row selection by clicking those checkboxes.
 */

import React from 'react';

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

interface DataTableProps {
  rows: any[];
  columns: GridColDef[];
  totalRows?: number;
  loading?: boolean;
  paginationModel?: GridPaginationModel;
  onPaginationModelChange?: (model: GridPaginationModel) => void;
  onRowClick?: (params: any) => void;
  getRowId?: (row: any) => any;
  checkboxSelection?: boolean;
  rowSelectionModel?: any;
  onRowSelectionModelChange?: (ids: string[]) => void;
}

const MockDataTable: React.FC<DataTableProps> = ({
  rows,
  columns,
  loading = false,
  onRowClick,
  getRowId,
  checkboxSelection = false,
  rowSelectionModel,
  onRowSelectionModelChange,
}) => {
  const selected: string[] = Array.isArray(rowSelectionModel)
    ? rowSelectionModel
    : [];

  const toggle = (id: string) => {
    if (!onRowSelectionModelChange) return;
    if (selected.includes(id)) {
      onRowSelectionModelChange(selected.filter((x) => x !== id));
    } else {
      onRowSelectionModelChange([...selected, id]);
    }
  };

  return (
    <div data-testid="data-table">
      {loading && <div data-testid="data-table-loading">Loading…</div>}
      <div data-testid="data-table-row-count">{rows.length}</div>
      <table>
        <thead>
          <tr>
            {checkboxSelection && <th />}
            {columns.map((c) => (
              <th key={c.field}>{c.headerName}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const id = String(getRowId ? getRowId(row) : row.id ?? idx);
            return (
              <tr
                key={id}
                data-testid="data-table-row"
                onClick={() => onRowClick?.({ row, id })}
              >
                {checkboxSelection && (
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`select-row-${id}`}
                      checked={selected.includes(id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggle(id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                )}
                {columns.map((c) => {
                  const value = row[c.field];
                  const content = c.renderCell
                    ? c.renderCell({ value, row })
                    : value ?? '';
                  return <td key={c.field}>{content as React.ReactNode}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default MockDataTable;
