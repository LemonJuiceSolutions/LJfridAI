'use client';

import React from 'react';
import { DynamicGridPage, type Layouts } from '@/components/layout/dynamic-grid-page';

const defaultLayouts: Layouts = {
  lg: [{ i: 'printing', x: 0, y: 0, w: 48, h: 25 }],
  md: [{ i: 'printing', x: 0, y: 0, w: 20, h: 25 }],
  sm: [{ i: 'printing', x: 0, y: 0, w: 12, h: 25 }],
  xs: [{ i: 'printing', x: 0, y: 0, w: 8, h: 25 }],
  xxs: [{ i: 'printing', x: 0, y: 0, w: 4, h: 25 }],
};

const defaultItems = [{ id: 'printing', isText: false }];

export default function PrintingDynamicPage() {
  return (
    <DynamicGridPage
      pageId="printing"
      defaultLayouts={defaultLayouts}
      defaultItems={defaultItems}
    />
  );
}
