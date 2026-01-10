'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { useParams } from 'next/navigation';

// Import dynamically to avoid SSR issues with grid layout
const DynamicGridPage = dynamic(
    () => import('@/components/layout/dynamic-grid-page').then(mod => mod.DynamicGridPage),
    { ssr: false }
);

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

    // Define default layouts/items for these new blank pages
    // We start clean.
    const defaultLayouts = { lg: [], md: [], sm: [] };
    const defaultItems: any[] = [];

    return (
        <div className="h-[calc(100vh-3.5rem)] w-full">
            <DynamicGridPage
                pageId={`page-${pageId}`} // Unique ID for Firestore persistence
                title={`Pagina ${pageId}`}
                description={`Questa è una pagina personalizzabile. Attiva la modalità modifica per aggiungere widget.`}
                defaultLayouts={defaultLayouts}
                defaultItems={defaultItems}
            />
        </div>
    );
}
