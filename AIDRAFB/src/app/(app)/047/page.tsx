'use client';

import React from 'react';
import { DynamicGridPage, type Layouts } from '@/components/layout/dynamic-grid-page';
import { availableWidgets } from '@/components/widgets/widget-list';

const defaultLayouts: Layouts = {
  lg: [],
  md: [],
  sm: [],
  xs: [],
  xxs: [],
};

const defaultItems = [];

export default function Page047() {
  return (
    <DynamicGridPage
      pageId="page-047"
      availableWidgets={availableWidgets}
      defaultLayouts={defaultLayouts}
      defaultItems={defaultItems}
    />
  );
}
