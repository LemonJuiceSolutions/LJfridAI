import React, { useState, useMemo, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { Col, Form, Pagination, Row, Table } from 'react-bootstrap';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  ChevronUp,
} from 'lucide-react';

interface Employee {
  id: number;
  name: string;
  gender: string;
  age: number;
  address: {
    city: string;
    state: string;
  };
}

const columnHelper = createColumnHelper<Employee>();

const DatatableExample = () => {
  const [data, setData] = useState<Employee[]>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}/data/100k.json`);
        const jsonData = await response.json();
        setData(jsonData);
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const columns = useMemo(
    () => [
      columnHelper.accessor('id', {
        header: 'ID',
        cell: (info) => info.getValue(),
        enableSorting: true,
      }),
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => info.getValue(),
        enableSorting: true,
      }),
      columnHelper.accessor('gender', {
        header: 'Gender',
        cell: (info) => info.getValue(),
        enableSorting: true,
      }),
      columnHelper.accessor('age', {
        header: 'Age',
        cell: (info) => info.getValue(),
        enableSorting: true,
      }),
      columnHelper.accessor('address.city', {
        header: 'City',
        cell: (info) => info.getValue(),
        enableSorting: true,
      }),
      columnHelper.accessor('address.state', {
        header: 'State',
        cell: (info) => info.getValue(),
        enableSorting: true,
      }),
    ],
    []
  );

  const table = useReactTable<Employee>({
    data,
    columns,
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <>
      {/* Global Filter */}
      <Row>
        <Col md={8} className="mb-3">
          <div className="d-flex align-items-center justify-content-center justify-content-md-start">
            <span className="me-2">Show</span>
            <Form.Select
              size="sm"
              style={{ width: 'auto' }}
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
            >
              {[5, 10, 20, 30].map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize}
                </option>
              ))}
            </Form.Select>
            <span className="ms-2">entries per page</span>
          </div>
        </Col>
        <Col md={4} className="mb-3">
          <Form.Control
            size="sm"
            type="text"
            placeholder="Search all columns..."
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
        </Col>
      </Row>

      {/* Table */}
      <Table responsive striped bordered>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default' }}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <div className="d-flex align-items-center">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanSort() && (
                      <span className="ms-2">
                        {header.column.getIsSorted() === 'asc' ? (
                          <ChevronUp size={12} />
                        ) : header.column.getIsSorted() === 'desc' ? (
                          <ChevronDown size={12} />
                        ) : (
                          <ChevronsUpDown size={12} />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>

      {/* Pagination */}
      <Row className="align-items-center">
        <Col md={6} className="mt-3 d-flex justify-content-center justify-content-md-start">
          <span className="text-secondary">
            Showing {table.getRowModel().rows.length} of {data.length} entries
          </span>
        </Col>
        <Col md={6} className="mt-3">
          <Pagination
            size="sm"
            className="justify-content-center justify-content-md-end mb-0"
            aria-label="Table pagination"
          >
            <Pagination.First onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
              <ChevronsLeft size={14} />
            </Pagination.First>
            <Pagination.Prev onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeft size={14} />
            </Pagination.Prev>
            <Pagination.Item active>
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </Pagination.Item>
            <Pagination.Next onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              <ChevronRight size={14} />
            </Pagination.Next>
            <Pagination.Last
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <ChevronsRight size={14} />
            </Pagination.Last>
          </Pagination>
        </Col>
      </Row>
    </>
  );
};

export default React.memo(DatatableExample);
