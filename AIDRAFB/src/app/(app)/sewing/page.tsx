'use client';

import React from 'react';
import { DynamicGridPage, type Layouts } from '@/components/layout/dynamic-grid-page';

const defaultLayouts: Layouts = {
  lg: [{ i: 'sewing', x: 0, y: 0, w: 48, h: 25 }],
  md: [{ i: 'sewing', x: 0, y: 0, w: 20, h: 25 }],
  sm: [{ i: 'sewing', x: 0, y: 0, w: 12, h: 25 }],
  xs: [{ i: 'sewing', x: 0, y: 0, w: 8, h: 25 }],
  xxs: [{ i: 'sewing', x: 0, y: 0, w: 4, h: 25 }],
};

const defaultItems = [{ id: 'sewing', isText: false }];

export default function SewingDynamicPage() {
  return (
    <DynamicGridPage
      pageId="sewing"
      defaultLayouts={defaultLayouts}
      defaultItems={defaultItems}
    />
  );
}
