'use client';

import React from 'react';
import { DynamicGridPage, type Layouts } from '@/components/layout/dynamic-grid-page';

const defaultLayouts: Layouts = {
  lg: [{ i: 'acquisti', x: 0, y: 0, w: 48, h: 20 }],
  md: [{ i: 'acquisti', x: 0, y: 0, w: 20, h: 20 }],
  sm: [{ i: 'acquisti', x: 0, y: 0, w: 12, h: 20 }],
  xs: [{ i: 'acquisti', x: 0, y: 0, w: 8, h: 20 }],
  xxs: [{ i: 'acquisti', x: 0, y: 0, w: 4, h: 20 }],
};

const defaultItems = [{ id: 'acquisti', isText: false }];

export default function AcquistiDynamicPage() {
  return (
    <DynamicGridPage
      pageId="acquisti"
      defaultLayouts={defaultLayouts}
      defaultItems={defaultItems}
    />
  );
}
