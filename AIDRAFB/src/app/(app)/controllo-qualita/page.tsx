'use client';

import React from 'react';
import { DynamicGridPage, type Widget, type Layouts } from '@/components/layout/dynamic-grid-page';

const defaultLayouts: Layouts = {
  lg: [{ i: 'controllo-qualita', x: 0, y: 0, w: 48, h: 25 }],
  md: [{ i: 'controllo-qualita', x: 0, y: 0, w: 20, h: 25 }],
  sm: [{ i: 'controllo-qualita', x: 0, y: 0, w: 12, h: 25 }],
  xs: [{ i: 'controllo-qualita', x: 0, y: 0, w: 8, h: 25 }],
  xxs: [{ i: 'controllo-qualita', x: 0, y: 0, w: 4, h: 25 }],
};

const defaultItems = [{ id: 'controllo-qualita', isText: false }];

export default function ControlloQualitaDynamicPage() {
  return (
    <DynamicGridPage
      pageId="controllo-qualita"
      defaultLayouts={defaultLayouts}
      defaultItems={defaultItems}
    />
  );
}
