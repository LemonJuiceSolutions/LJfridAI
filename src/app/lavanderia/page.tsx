'use client';

import React from 'react';
import { DynamicGridPage, type Widget, type Layouts } from '@/components/layout/dynamic-grid-page';

const defaultLayouts: Layouts = {
  lg: [{ i: 'lavanderia', x: 0, y: 0, w: 48, h: 25 }],
  md: [{ i: 'lavanderia', x: 0, y: 0, w: 20, h: 25 }],
  sm: [{ i: 'lavanderia', x: 0, y: 0, w: 12, h: 25 }],
  xs: [{ i: 'lavanderia', x: 0, y: 0, w: 8, h: 25 }],
  xxs: [{ i: 'lavanderia', x: 0, y: 0, w: 4, h: 25 }],
};

const defaultItems = [{ id: 'lavanderia', isText: false }];

export default function LavanderiaDynamicPage() {
  return (
    <DynamicGridPage
      pageId="lavanderia"
      defaultLayouts={defaultLayouts}
      defaultItems={defaultItems}
    />
  );
}
