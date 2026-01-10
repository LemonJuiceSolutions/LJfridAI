'use client';

import React from 'react';
import { DynamicGridPage, type Widget, type Layouts } from '@/components/layout/dynamic-grid-page';

const defaultLayouts: Layouts = {
  lg: [{ i: 'packaging', x: 0, y: 0, w: 48, h: 25 }],
  md: [{ i: 'packaging', x: 0, y: 0, w: 20, h: 25 }],
  sm: [{ i: 'packaging', x: 0, y: 0, w: 12, h: 25 }],
  xs: [{ i: 'packaging', x: 0, y: 0, w: 8, h: 25 }],
  xxs: [{ i: 'packaging', x: 0, y: 0, w: 4, h: 25 }],
};

const defaultItems = [{ id: 'packaging', isText: false }];

export default function PackagingDynamicPage() {
  return (
    <DynamicGridPage
      pageId="packaging"
      defaultLayouts={defaultLayouts}
      defaultItems={defaultItems}
    />
  );
}
