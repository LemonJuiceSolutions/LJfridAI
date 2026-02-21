'use client';

import React from 'react';
import { DynamicGridPage, type Layouts } from '@/components/layout/dynamic-grid-page';

const defaultLayouts: Layouts = {
  lg: [
    // Summary row
    { i: 'xbrl-summary', x: 0, y: 0, w: 48, h: 7 },
    // KPI row
    { i: 'xbrl-kpi-utile', x: 0, y: 7, w: 8, h: 4 },
    { i: 'xbrl-kpi-ebitda-margin', x: 8, y: 7, w: 8, h: 4 },
    { i: 'xbrl-kpi-roe', x: 16, y: 7, w: 8, h: 4 },
    { i: 'xbrl-kpi-pfn-ebitda', x: 24, y: 7, w: 8, h: 4 },
    { i: 'xbrl-kpi-current-ratio', x: 32, y: 7, w: 8, h: 4 },
    // Charts row 1
    { i: 'xbrl-composizione-attivo', x: 0, y: 11, w: 24, h: 10 },
    { i: 'xbrl-composizione-passivo', x: 24, y: 11, w: 24, h: 10 },
    // Charts row 2
    { i: 'xbrl-struttura-costi', x: 0, y: 21, w: 24, h: 10 },
    { i: 'xbrl-evoluzione-ricavi', x: 24, y: 21, w: 24, h: 10 },
    // Charts row 3
    { i: 'xbrl-margini-trend', x: 0, y: 31, w: 24, h: 10 },
    { i: 'xbrl-indicatori-redditivita', x: 24, y: 31, w: 24, h: 10 },
    // Charts row 4
    { i: 'xbrl-indici-liquidita', x: 0, y: 41, w: 16, h: 10 },
    { i: 'xbrl-giorni-ciclo', x: 16, y: 41, w: 16, h: 10 },
    { i: 'xbrl-leverage-trend', x: 32, y: 41, w: 16, h: 10 },
    // Charts row 5
    { i: 'xbrl-evoluzione-patrimonio', x: 0, y: 51, w: 48, h: 10 },
  ],
  md: [
    { i: 'xbrl-summary', x: 0, y: 0, w: 20, h: 10 },
    { i: 'xbrl-kpi-utile', x: 0, y: 10, w: 10, h: 4 },
    { i: 'xbrl-kpi-ebitda-margin', x: 10, y: 10, w: 10, h: 4 },
    { i: 'xbrl-kpi-roe', x: 0, y: 14, w: 7, h: 4 },
    { i: 'xbrl-kpi-pfn-ebitda', x: 7, y: 14, w: 7, h: 4 },
    { i: 'xbrl-kpi-current-ratio', x: 14, y: 14, w: 6, h: 4 },
    { i: 'xbrl-composizione-attivo', x: 0, y: 18, w: 20, h: 10 },
    { i: 'xbrl-composizione-passivo', x: 0, y: 28, w: 20, h: 10 },
    { i: 'xbrl-struttura-costi', x: 0, y: 38, w: 20, h: 10 },
    { i: 'xbrl-evoluzione-ricavi', x: 0, y: 48, w: 20, h: 10 },
    { i: 'xbrl-margini-trend', x: 0, y: 58, w: 20, h: 10 },
    { i: 'xbrl-indicatori-redditivita', x: 0, y: 68, w: 20, h: 10 },
    { i: 'xbrl-indici-liquidita', x: 0, y: 78, w: 20, h: 10 },
    { i: 'xbrl-giorni-ciclo', x: 0, y: 88, w: 20, h: 10 },
    { i: 'xbrl-leverage-trend', x: 0, y: 98, w: 20, h: 10 },
    { i: 'xbrl-evoluzione-patrimonio', x: 0, y: 108, w: 20, h: 10 },
  ],
  sm: [
    { i: 'xbrl-summary', x: 0, y: 0, w: 12, h: 12 },
    { i: 'xbrl-kpi-utile', x: 0, y: 12, w: 6, h: 4 },
    { i: 'xbrl-kpi-ebitda-margin', x: 6, y: 12, w: 6, h: 4 },
    { i: 'xbrl-kpi-roe', x: 0, y: 16, w: 4, h: 4 },
    { i: 'xbrl-kpi-pfn-ebitda', x: 4, y: 16, w: 4, h: 4 },
    { i: 'xbrl-kpi-current-ratio', x: 8, y: 16, w: 4, h: 4 },
    { i: 'xbrl-composizione-attivo', x: 0, y: 20, w: 12, h: 10 },
    { i: 'xbrl-composizione-passivo', x: 0, y: 30, w: 12, h: 10 },
    { i: 'xbrl-struttura-costi', x: 0, y: 40, w: 12, h: 10 },
    { i: 'xbrl-evoluzione-ricavi', x: 0, y: 50, w: 12, h: 10 },
    { i: 'xbrl-margini-trend', x: 0, y: 60, w: 12, h: 10 },
    { i: 'xbrl-indicatori-redditivita', x: 0, y: 70, w: 12, h: 10 },
    { i: 'xbrl-indici-liquidita', x: 0, y: 80, w: 12, h: 10 },
    { i: 'xbrl-giorni-ciclo', x: 0, y: 90, w: 12, h: 10 },
    { i: 'xbrl-leverage-trend', x: 0, y: 100, w: 12, h: 10 },
    { i: 'xbrl-evoluzione-patrimonio', x: 0, y: 110, w: 12, h: 10 },
  ],
  xs: [
    { i: 'xbrl-summary', x: 0, y: 0, w: 8, h: 14 },
    { i: 'xbrl-kpi-utile', x: 0, y: 14, w: 4, h: 4 },
    { i: 'xbrl-kpi-ebitda-margin', x: 4, y: 14, w: 4, h: 4 },
    { i: 'xbrl-kpi-roe', x: 0, y: 18, w: 4, h: 4 },
    { i: 'xbrl-kpi-pfn-ebitda', x: 4, y: 18, w: 4, h: 4 },
    { i: 'xbrl-kpi-current-ratio', x: 0, y: 22, w: 8, h: 4 },
    { i: 'xbrl-composizione-attivo', x: 0, y: 26, w: 8, h: 10 },
    { i: 'xbrl-composizione-passivo', x: 0, y: 36, w: 8, h: 10 },
    { i: 'xbrl-struttura-costi', x: 0, y: 46, w: 8, h: 10 },
    { i: 'xbrl-evoluzione-ricavi', x: 0, y: 56, w: 8, h: 10 },
    { i: 'xbrl-margini-trend', x: 0, y: 66, w: 8, h: 10 },
    { i: 'xbrl-indicatori-redditivita', x: 0, y: 76, w: 8, h: 10 },
    { i: 'xbrl-indici-liquidita', x: 0, y: 86, w: 8, h: 10 },
    { i: 'xbrl-giorni-ciclo', x: 0, y: 96, w: 8, h: 10 },
    { i: 'xbrl-leverage-trend', x: 0, y: 106, w: 8, h: 10 },
    { i: 'xbrl-evoluzione-patrimonio', x: 0, y: 116, w: 8, h: 10 },
  ],
  xxs: [
    { i: 'xbrl-summary', x: 0, y: 0, w: 4, h: 16 },
    { i: 'xbrl-kpi-utile', x: 0, y: 16, w: 4, h: 4 },
    { i: 'xbrl-kpi-ebitda-margin', x: 0, y: 20, w: 4, h: 4 },
    { i: 'xbrl-kpi-roe', x: 0, y: 24, w: 4, h: 4 },
    { i: 'xbrl-kpi-pfn-ebitda', x: 0, y: 28, w: 4, h: 4 },
    { i: 'xbrl-kpi-current-ratio', x: 0, y: 32, w: 4, h: 4 },
    { i: 'xbrl-composizione-attivo', x: 0, y: 36, w: 4, h: 10 },
    { i: 'xbrl-composizione-passivo', x: 0, y: 46, w: 4, h: 10 },
    { i: 'xbrl-struttura-costi', x: 0, y: 56, w: 4, h: 10 },
    { i: 'xbrl-evoluzione-ricavi', x: 0, y: 66, w: 4, h: 10 },
    { i: 'xbrl-margini-trend', x: 0, y: 76, w: 4, h: 10 },
    { i: 'xbrl-indicatori-redditivita', x: 0, y: 86, w: 4, h: 10 },
    { i: 'xbrl-indici-liquidita', x: 0, y: 96, w: 4, h: 10 },
    { i: 'xbrl-giorni-ciclo', x: 0, y: 106, w: 4, h: 10 },
    { i: 'xbrl-leverage-trend', x: 0, y: 116, w: 4, h: 10 },
    { i: 'xbrl-evoluzione-patrimonio', x: 0, y: 126, w: 4, h: 10 },
  ],
};

const defaultItems = [
  { id: 'xbrl-summary', isText: false },
  { id: 'xbrl-kpi-utile', isText: false },
  { id: 'xbrl-kpi-ebitda-margin', isText: false },
  { id: 'xbrl-kpi-roe', isText: false },
  { id: 'xbrl-kpi-pfn-ebitda', isText: false },
  { id: 'xbrl-kpi-current-ratio', isText: false },
  { id: 'xbrl-composizione-attivo', isText: false },
  { id: 'xbrl-composizione-passivo', isText: false },
  { id: 'xbrl-struttura-costi', isText: false },
  { id: 'xbrl-evoluzione-ricavi', isText: false },
  { id: 'xbrl-margini-trend', isText: false },
  { id: 'xbrl-indicatori-redditivita', isText: false },
  { id: 'xbrl-indici-liquidita', isText: false },
  { id: 'xbrl-giorni-ciclo', isText: false },
  { id: 'xbrl-leverage-trend', isText: false },
  { id: 'xbrl-evoluzione-patrimonio', isText: false },
];

export default function XbrlAnalysisPage() {
  return (
    <DynamicGridPage
      pageId="xbrl-analysis"
      defaultLayouts={defaultLayouts}
      defaultItems={defaultItems}
    />
  );
}
