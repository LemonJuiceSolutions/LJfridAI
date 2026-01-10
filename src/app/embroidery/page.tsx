'use client';

import React from 'react';
import { DynamicGridPage, type Widget, type Layouts } from '@/components/layout/dynamic-grid-page';

const defaultLayouts: Layouts = {
  lg: [{ i: 'embroidery', x: 0, y: 0, w: 48, h: 25 }],
  md: [{ i: 'embroidery', x: 0, y: 0, w: 20, h: 25 }],
  sm: [{ i: 'embroidery', x: 0, y: 0, w: 12, h: 25 }],
  xs: [{ i: 'embroidery', x: 0, y: 0, w: 8, h: 25 }],
  xxs: [{ i: 'embroidery', x: 0, y: 0, w: 4, h: 25 }],
};

const defaultItems = [{ id: 'embroidery', isText: false }];

export default function EmbroideryDynamicPage() {
  return (
    <DynamicGridPage
      pageId="embroidery"
      defaultLayouts={defaultLayouts}
      defaultItems={defaultItems}
    />
  );
}
