'use client';

import React from 'react';
import { DynamicGridPage, type Layouts } from '@/components/layout/dynamic-grid-page';

// Define the default layout for the dashboard widgets
const defaultLayouts: Layouts = {
    lg: [
      { i: 'kpi-1', x: 0, y: 0, w: 12, h: 4 },
      { i: 'kpi-2', x: 12, y: 0, w: 12, h: 4 },
      { i: 'kpi-3', x: 24, y: 0, w: 12, h: 4 },
      { i: 'kpi-4', x: 36, y: 0, w: 12, h: 4 },
      { i: 'overview', x: 0, y: 4, w: 32, h: 10 },
      { i: 'revenue-by-product', x: 32, y: 4, w: 16, h: 10 },
      { i: 'capacity', x: 0, y: 14, w: 20, h: 10 },
      { i: 'cost-center', x: 20, y: 14, w: 28, h: 10 },
      { i: 'job-margin', x: 0, y: 24, w: 24, h: 10 },
      { i: 'sql-test-table', x: 24, y: 24, w: 24, h: 10 },
    ],
    md: [
      { i: 'kpi-1', x: 0, y: 0, w: 10, h: 4 },
      { i: 'kpi-2', x: 10, y: 0, w: 10, h: 4 },
      { i: 'kpi-3', x: 0, y: 4, w: 10, h: 4 },
      { i: 'kpi-4', x: 10, y: 4, w: 10, h: 4 },
      { i: 'overview', x: 0, y: 8, w: 20, h: 10 },
      { i: 'revenue-by-product', x: 0, y: 18, w: 20, h: 10 },
      { i: 'capacity', x: 0, y: 28, w: 20, h: 10 },
      { i: 'cost-center', x: 0, y: 38, w: 20, h: 10 },
      { i: 'job-margin', x: 0, y: 48, w: 20, h: 10 },
      { i: 'sql-test-table', x: 0, y: 58, w: 20, h: 10 },
    ],
    sm: [
      { i: 'kpi-1', x: 0, y: 0, w: 6, h: 4 },
      { i: 'kpi-2', x: 6, y: 0, w: 6, h: 4 },
      { i: 'kpi-3', x: 0, y: 4, w: 6, h: 4 },
      { i: 'kpi-4', x: 6, y: 4, w: 6, h: 4 },
      { i: 'overview', x: 0, y: 8, w: 12, h: 10 },
      { i: 'revenue-by-product', x: 0, y: 18, w: 12, h: 10 },
      { i: 'capacity', x: 0, y: 28, w: 12, h: 10 },
      { i: 'cost-center', x: 0, y: 38, w: 12, h: 10 },
      { i: 'job-margin', x: 0, y: 48, w: 12, h: 10 },
      { i: 'sql-test-table', x: 0, y: 58, w: 12, h: 10 },
    ],
    xs: [
      { i: 'kpi-1', x: 0, y: 0, w: 8, h: 4 },
      { i: 'kpi-2', x: 0, y: 4, w: 8, h: 4 },
      { i: 'kpi-3', x: 0, y: 8, w: 8, h: 4 },
      { i: 'kpi-4', x: 0, y: 12, w: 8, h: 4 },
      { i: 'overview', x: 0, y: 16, w: 8, h: 10 },
      { i: 'revenue-by-product', x: 0, y: 26, w: 8, h: 10 },
      { i: 'capacity', x: 0, y: 36, w: 8, h: 10 },
      { i: 'cost-center', x: 0, y: 46, w: 8, h: 10 },
      { i: 'job-margin', x: 0, y: 56, w: 8, h: 10 },
      { i: 'sql-test-table', x: 0, y: 66, w: 8, h: 10 },
    ],
    xxs: [
      { i: 'kpi-1', x: 0, y: 0, w: 4, h: 4 },
      { i: 'kpi-2', x: 0, y: 4, w: 4, h: 4 },
      { i: 'kpi-3', x: 0, y: 8, w: 4, h: 4 },
      { i: 'kpi-4', x: 0, y: 12, w: 4, h: 4 },
      { i: 'overview', x: 0, y: 16, w: 4, h: 10 },
      { i: 'revenue-by-product', x: 0, y: 26, w: 4, h: 10 },
      { i: 'capacity', x: 0, y: 36, w: 4, h: 10 },
      { i: 'cost-center', x: 0, y: 46, w: 4, h: 10 },
      { i: 'job-margin', x: 0, y: 56, w: 4, h: 10 },
      { i: 'sql-test-table', x: 0, y: 66, w: 4, h: 10 },
    ]
};

// The default set of items to show on the dashboard
const defaultItems = [
    { id: 'kpi-1', isText: false },
    { id: 'kpi-2', isText: false },
    { id: 'kpi-3', isText: false },
    { id: 'kpi-4', isText: false },
    { id: 'overview', isText: false },
    { id: 'revenue-by-product', isText: false },
    { id: 'capacity', isText: false },
    { id: 'cost-center', isText: false },
    { id: 'job-margin', isText: false },
    { id: 'sql-test-table', isText: false },
];


export default function DashboardPage() {

  return (
    <DynamicGridPage
        pageId="dashboard"
        defaultLayouts={defaultLayouts}
        defaultItems={defaultItems}
    />
  );
}
