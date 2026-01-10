'use client';

import React, { useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { Responsive, WidthProvider, Layout, Layouts as ReactGridLayouts } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useEditMode } from '@/hooks/use-edit-mode';
import { cn } from '@/lib/utils';
import { GripVertical, Plus, Trash2, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TextWidget from '@/components/dashboard/text-widget';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAvailableWidgets } from '../widgets/widget-list';

const ResponsiveGridLayout = WidthProvider(Responsive);

export type Widget = {
    id: string;
    name: string;
    component: React.ReactNode;
};

export type Item = {
    id: string;
    content?: string;
    isText?: boolean;
    pipelineId?: string;
    nodeId?: string;
};

type DashboardState = {
    layouts?: ReactGridLayouts,
    items: Item[],
}

export type Layouts = ReactGridLayouts;

type DynamicGridPageProps = {
    pageId: string;
    // availableWidgets is now a hook
    defaultLayouts: Layouts;
    defaultItems: Item[];
};


function removeUndefinedFields(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedFields);
  }

  if (typeof obj === 'object') {
    const newObj: { [key: string]: any } = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (value !== undefined) {
          newObj[key] = removeUndefinedFields(value);
        }
      }
    }
    return newObj;
  }

  return obj;
}


const generateLayouts = (items: Item[], defaultLayouts: Layouts) => {
    const staticLayouts: Record<string, any[]> = defaultLayouts;
  
    const layouts: Record<string, any[]> = JSON.parse(JSON.stringify(staticLayouts));
    
    items.forEach((item) => {
      Object.keys(layouts).forEach(bp => {
          if (!layouts[bp].find(l => l.i === item.id)) {
              let h = 4; // default height
              if (item.id.includes('overview') || item.id.includes('revenue-by-product') || item.id.includes('capacity') || item.id.includes('cost-center') || item.id.includes('job-margin')) {
                  h = 10;
              }
              layouts[bp].push({ i: item.id, x: 0, y: Infinity, w: layouts[bp][0]?.w || 12, h });
          }
      });
    });
  
    return layouts;
};


export function DynamicGridPage({ pageId, defaultLayouts, defaultItems }: DynamicGridPageProps) {
    const { editMode } = useEditMode();
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const availableWidgets = useAvailableWidgets();
    
    const [layouts, setLayouts] = useState<any>(generateLayouts(defaultItems, defaultLayouts));
    const [items, setItems] = useState<Item[]>(defaultItems);
    const [isComponentMounted, setIsComponentMounted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const userSettingsRef = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return doc(firestore, 'tenants', user.uid, 'userSettings', user.uid);
    }, [user, firestore]);

    useEffect(() => {
        setIsComponentMounted(true);
    }, []);

    useLayoutEffect(() => {
        if (isUserLoading || !isComponentMounted) return;
        
        const loadDashboardState = async () => {
            setIsLoading(true);
            try {
                if(userSettingsRef) {
                    const docSnap = await getDoc(userSettingsRef);
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        const pageData = data[pageId];
                        const loadedItems = pageData?.items || defaultItems;
                        const loadedLayouts = pageData?.layouts || generateLayouts(loadedItems, defaultLayouts);
                        
                        setItems(loadedItems);
                        setLayouts(loadedLayouts);
                    } else {
                        setItems(defaultItems);
                        setLayouts(generateLayouts(defaultItems, defaultLayouts));
                    }
                } else {
                     setItems(defaultItems);
                     setLayouts(generateLayouts(defaultItems, defaultLayouts));
                }
            } catch (error) {
                console.error(`Error loading ${pageId} state from Firestore:`, error);
                 setItems(defaultItems);
                 setLayouts(generateLayouts(defaultItems, defaultLayouts));
            } finally {
                setTimeout(() => setIsLoading(false), 50);
            }
        };

        loadDashboardState();
    }, [userSettingsRef, isUserLoading, isComponentMounted, pageId, defaultItems, defaultLayouts]);

    const saveDashboardState = useCallback((newLayouts: any, newItems: any) => {
        if (userSettingsRef && isComponentMounted && !isLoading) {
            const cleanedLayouts = removeUndefinedFields(newLayouts);
            setDocumentNonBlocking(userSettingsRef, { 
                [pageId]: {
                    layouts: cleanedLayouts,
                    items: newItems
                }
            }, { merge: true });
        }
    }, [userSettingsRef, isComponentMounted, isLoading, pageId]);

    const handleLayoutChange = (layout: Layout[], allLayouts: ReactGridLayouts) => {
        if (isComponentMounted && !isLoading) {
            setLayouts(allLayouts);
            saveDashboardState(allLayouts, items);
        }
    };
    
    const addTextWidget = () => {
        const newItemId = `text-${Date.now()}`;
        const newTextItem: Item = { id: newItemId, content: '<h1>Nuovo widget di testo...</h1>', isText: true };
        
        const newItems = [...items, newTextItem];
        setItems(newItems);

        const newLayouts = generateLayouts(newItems, layouts);
        setLayouts(newLayouts);
        saveDashboardState(newLayouts, newItems);
    };

    const addWidget = (widgetId: string) => {
        if (items.find(item => item.id === widgetId)) return;

        let newItem: Item = { id: widgetId, isText: false };
        if (widgetId.startsWith('pipeline-')) {
            const [, pipelineId, nodeId] = widgetId.split('-');
            newItem = { ...newItem, pipelineId, nodeId };
        }
        
        const newItems = [...items, newItem];
        setItems(newItems);

        const newLayouts = generateLayouts(newItems, layouts);
        setLayouts(newLayouts);
        saveDashboardState(newLayouts, newItems);
    }

    const removeWidget = (itemId: string) => {
        const newItems = items.filter(item => item.id !== itemId);
        setItems(newItems);

        const newLayouts = JSON.parse(JSON.stringify(layouts));
        Object.keys(newLayouts).forEach(breakpoint => {
            newLayouts[breakpoint] = newLayouts[breakpoint].filter((l: any) => l.i !== itemId);
        });
        setLayouts(newLayouts);
        saveDashboardState(newLayouts, newItems);
    };

    const handleTextChange = (id: string, content: string) => {
        const newItems = items.map(item => item.id === id ? { ...item, content } : item);
        setItems(newItems);
        saveDashboardState(layouts, newItems);
    };
    
    const currentWidgetIds = useMemo(() => new Set(items.map(i => i.id)), [items]);
    
    if (isLoading || isUserLoading || !isComponentMounted) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }
  
    const gridItemClasses = (isEditing: boolean) => cn(
        "bg-card rounded-lg shadow-sm transition-all duration-200 overflow-hidden",
        isEditing && 'border-2 border-dashed border-primary/50 relative'
    );

    const renderWidget = (item: Item) => {
        if (item.isText) {
            return (
                <TextWidget 
                    content={item.content || ''}
                    onContentChange={(newContent) => handleTextChange(item.id, newContent)}
                    isEditing={editMode}
                />
            );
        }
        const widgetConfig = (availableWidgets as Record<string, any>)[item.id];
        return widgetConfig ? widgetConfig.component : <div className='p-4 text-sm text-destructive'>Widget non trovato: {item.id}</div>;
    }

  return (
    <div className='flex flex-col gap-4'>
        {editMode && (
            <div className='flex justify-end gap-2'>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="sm">
                            <LayoutGrid className="h-4 w-4 mr-2" />
                            Aggiungi Widget
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="max-h-96 overflow-y-auto">
                        {Object.entries(availableWidgets).map(([key, widget]) => (
                            <DropdownMenuItem 
                                key={key} 
                                onSelect={() => addWidget(key)}
                                disabled={currentWidgetIds.has(key)}
                            >
                                {widget.name}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button onClick={addTextWidget} size="sm" variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Aggiungi Testo
                </Button>
            </div>
        )}
        <ResponsiveGridLayout
            className="layout"
            layouts={layouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 48, md: 20, sm: 12, xs: 8, xxs: 4 }}
            rowHeight={20}
            onLayoutChange={handleLayoutChange}
            isDraggable={editMode}
            isResizable={editMode}
            draggableHandle=".drag-handle"
            compactType="vertical"
            preventCollision={false}
            isBounded={false}
            allowOverlap={false}
            measureBeforeMount={false}
        >
            {items.map(item => (
                 <div key={item.id} className={gridItemClasses(editMode)}>
                    {editMode && (
                        <>
                            <GripVertical className="absolute top-2 left-2 h-5 w-5 text-primary/50 cursor-move drag-handle z-10" />
                            <Button
                                variant="destructive"
                                size="icon"
                                className="absolute top-1 right-1 h-6 w-6 z-10"
                                onClick={() => removeWidget(item.id)}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </>
                    )}
                    {renderWidget(item)}
                </div>
            ))}

        </ResponsiveGridLayout>
    </div>
  );
}
