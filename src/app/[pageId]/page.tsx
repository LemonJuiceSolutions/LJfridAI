'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { useParams } from 'next/navigation';

// Import dynamically to avoid SSR issues with grid layout.
// Provide a lightweight loading skeleton so the page shell renders immediately
// (FCP during SSR) instead of blank screen while JS bundle loads.
const DynamicGridPage = dynamic(
    () => import('@/components/layout/dynamic-grid-page').then(mod => mod.DynamicGridPage),
    {
        ssr: false,
        loading: () => (
            <div className="h-full w-full p-6 animate-pulse space-y-4">
                <div className="flex gap-4">
                    <div className="h-8 w-40 bg-muted rounded" />
                    <div className="h-8 w-32 bg-muted rounded" />
                    <div className="h-8 w-36 bg-muted rounded" />
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-48 bg-muted rounded-lg" />
                    ))}
                </div>
            </div>
        ),
    }
);

// Define default layouts/items OUTSIDE the component to prevent new object references on each render
// This fixes the infinite re-render loop caused by useLayoutEffect dependencies
const defaultLayouts = { lg: [], md: [], sm: [] };
const defaultItems: any[] = [];

export default function NumberedPage() {
    const params = useParams();
    const pageId = params?.pageId as string;

    // Validate that the pageId is a number between 001 and 100
    // Detailed regex explanation:
    // ^[0-9]{1,3}$ : Matches 1 to 3 digits
    // We strictly check the numeric value
    const isNumeric = /^[0-9]{1,3}$/.test(pageId);
    const pageNum = parseInt(pageId, 10);

    // You requested pages 001 to 100.
    // We can be flexible (e.g. up to 999) or strict. 
    // Let's allow up to 999 for flexibility, as maintaining this logic is zero cost.
    if (!isNumeric || pageNum < 1 || pageNum > 999) {
        notFound();
    }

    return (
        <div className="h-[calc(100vh-3.5rem)] w-full">
            <DynamicGridPage
                pageId={`page-${pageId}`}
                defaultLayouts={defaultLayouts}
                defaultItems={defaultItems}
            />
        </div>
    );
}

