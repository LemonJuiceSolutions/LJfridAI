'use client';

import React from 'react';
import { DynamicGridPage, type Widget, type Layouts } from '@/components/layout/dynamic-grid-page';

const defaultLayouts: Layouts = {
  lg: [{ i: 'setup', x: 0, y: 0, w: 48, h: 15 }],
  md: [{ i: 'setup', x: 0, y: 0, w: 20, h: 15 }],
  sm: [{ i: 'setup', x: 0, y: 0, w: 12, h: 15 }],
  xs: [{ i: 'setup', x: 0, y: 0, w: 8, h: 15 }],
  xxs: [{ i: 'setup', x: 0, y: 0, w: 4, h: 15 }],
};

const defaultItems = [{ id: 'setup', isText: false }];

export default function SetupDynamicPage() {
  return (
    <DynamicGridPage
      pageId="setup"
      defaultLayouts={defaultLayouts}
      defaultItems={defaultItems}
    />
  );
}
