'use client';

import React from 'react';
import { DynamicGridPage, type Layouts } from '@/components/layout/dynamic-grid-page';

const defaultLayouts: Layouts = {
  lg: [{ i: 'orders', x: 0, y: 0, w: 48, h: 25 }],
  md: [{ i: 'orders', x: 0, y: 0, w: 20, h: 25 }],
  sm: [{ i: 'orders', x: 0, y: 0, w: 12, h: 25 }],
  xs: [{ i: 'orders', x: 0, y: 0, w: 8, h: 25 }],
  xxs: [{ i: 'orders', x: 0, y: 0, w: 4, h: 25 }],
};

const defaultItems = [{ id: 'orders', isText: false }];

export default function OrdersDynamicPage() {
  return (
    <DynamicGridPage
      pageId="orders"
      defaultLayouts={defaultLayouts}
      defaultItems={defaultItems}
    />
  );
}
