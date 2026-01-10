'use client';

import React from 'react';
import { DynamicGridPage, type Layouts } from '@/components/layout/dynamic-grid-page';

const defaultLayouts: Layouts = {
  lg: [{ i: 'cutting', x: 0, y: 0, w: 48, h: 25 }],
  md: [{ i: 'cutting', x: 0, y: 0, w: 20, h: 25 }],
  sm: [{ i: 'cutting', x: 0, y: 0, w: 12, h: 25 }],
  xs: [{ i: 'cutting', x: 0, y: 0, w: 8, h: 25 }],
  xxs: [{ i: 'cutting', x: 0, y: 0, w: 4, h: 25 }],
};

const defaultItems = [{ id: 'cutting', isText: false }];

export default function CuttingDynamicPage() {
  return (
    <DynamicGridPage
      pageId="cutting"
      defaultLayouts={defaultLayouts}
      defaultItems={defaultItems}
    />
  );
}
