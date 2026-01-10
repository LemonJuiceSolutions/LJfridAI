'use client';

import React from 'react';
import { DynamicGridPage, type Layouts } from '@/components/layout/dynamic-grid-page';


const defaultLayouts: Layouts = {
  lg: [{ i: 'planning', x: 0, y: 0, w: 48, h: 20 }],
  md: [{ i: 'planning', x: 0, y: 0, w: 20, h: 20 }],
  sm: [{ i: 'planning', x: 0, y: 0, w: 12, h: 20 }],
  xs: [{ i: 'planning', x: 0, y: 0, w: 8, h: 20 }],
  xxs: [{ i: 'planning', x: 0, y: 0, w: 4, h: 20 }],
};

const defaultItems = [{ id: 'planning', isText: false }];

export default function PlanningDynamicPage() {
  return (
    <DynamicGridPage
      pageId="planning"
      defaultLayouts={defaultLayouts}
      defaultItems={defaultItems}
    />
  );
}
