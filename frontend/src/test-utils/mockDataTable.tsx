/**
 * Test stub for DataTable that renders rows as accessible HTML so tests can
 * assert on visible content. AG Grid uses DOM measurements that don't work
 * reliably under JSDOM, so we replace it entirely in component tests.
 *
 * Import this in tests:
 *   jest.mock('../components/common/DataTable', () => require('../test-utils/mockDataTable'));
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
}

const MockDataTable: React.FC<DataTableProps> = ({
  rows,
  columns,
  loading = false,
  onRowClick,
  getRowId,
}) => (
  <div data-testid="data-table">
    {loading && <div data-testid="data-table-loading">Loading…</div>}
    <div data-testid="data-table-row-count">{rows.length}</div>
    <table>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.field}>{c.headerName}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => {
          const id = getRowId ? getRowId(row) : row.id ?? idx;
          return (
            <tr
              key={id}
              data-testid="data-table-row"
              onClick={() => onRowClick?.({ row, id })}
            >
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

export default MockDataTable;
