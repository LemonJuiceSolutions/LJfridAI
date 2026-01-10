'use client';

import React from 'react';
import { DynamicGridPage, type Layouts } from '@/components/layout/dynamic-grid-page';

const defaultLayouts: Layouts = {
  lg: [],
  md: [],
  sm: [],
  xs: [],
  xxs: [],
};

const defaultItems = [];

export default function Page003() {
  return (
    <DynamicGridPage
      pageId="page-003"
      defaultLayouts={defaultLayouts}
      defaultItems={defaultItems}
    />
  );
}
