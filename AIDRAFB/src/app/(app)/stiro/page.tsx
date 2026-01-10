'use client';

import React from 'react';
import { DynamicGridPage, type Widget, type Layouts } from '@/components/layout/dynamic-grid-page';

const defaultLayouts: Layouts = {
  lg: [{ i: 'stiro', x: 0, y: 0, w: 48, h: 25 }],
  md: [{ i: 'stiro', x: 0, y: 0, w: 20, h: 25 }],
  sm: [{ i: 'stiro', x: 0, y: 0, w: 12, h: 25 }],
  xs: [{ i: 'stiro', x: 0, y: 0, w: 8, h: 25 }],
  xxs: [{ i: 'stiro', x: 0, y: 0, w: 4, h: 25 }],
};

const defaultItems = [{ id: 'stiro', isText: false }];

export default function StiroDynamicPage() {
  return (
    <DynamicGridPage
      pageId="stiro"
      defaultLayouts={defaultLayouts}
      defaultItems={defaultItems}
    />
  );
}
