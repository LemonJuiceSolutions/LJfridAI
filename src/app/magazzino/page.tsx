'use client';

import React from 'react';
import { DynamicGridPage, type Widget, type Layouts } from '@/components/layout/dynamic-grid-page';

const defaultLayouts: Layouts = {
  lg: [{ i: 'magazzino', x: 0, y: 0, w: 48, h: 25 }],
  md: [{ i: 'magazzino', x: 0, y: 0, w: 20, h: 25 }],
  sm: [{ i: 'magazzino', x: 0, y: 0, w: 12, h: 25 }],
  xs: [{ i: 'magazzino', x: 0, y: 0, w: 8, h: 25 }],
  xxs: [{ i: 'magazzino', x: 0, y: 0, w: 4, h: 25 }],
};

const defaultItems = [{ id: 'magazzino', isText: false }];

export default function MagazzinoDynamicPage() {
  return (
    <DynamicGridPage
      pageId="magazzino"
      defaultLayouts={defaultLayouts}
      defaultItems={defaultItems}
    />
  );
}
