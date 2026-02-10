'use client';

import React, { useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { Responsive, WidthProvider, Layout, Layouts as ReactGridLayouts } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useEditMode } from '@/hooks/use-edit-mode';
import { cn } from '@/lib/utils';
import { GripVertical, Plus, Trash2, LayoutGrid, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TextWidget from '@/components/dashboard/text-widget';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAvailableWidgets } from '../widgets/widget-list';
import { getPageLayout, savePageLayout } from '@/actions/dashboard';
import { useSession } from 'next-auth/react';
import { useToast } from '@/hooks/use-toast';

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

export type Layouts = ReactGridLayouts;

type DynamicGridPageProps = {
    pageId: string;
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
                if (item.id.includes('overview') || item.id.includes('revenue-by-product') || item.id.includes('capacity') || item.id.includes('cost-center') || item.id.includes('job-margin') || item.id.includes('python-preview') || item.id.includes('sql-preview')) {
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
    const { data: session, status } = useSession();
    const availableWidgets = useAvailableWidgets();
    const { toast } = useToast();

    const [layouts, setLayouts] = useState<any>(generateLayouts(defaultItems, defaultLayouts));
    const [items, setItems] = useState<Item[]>(defaultItems);
    const [isComponentMounted, setIsComponentMounted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [hiddenWidgets, setHiddenWidgets] = useState<Set<string>>(new Set());
    const [widgetToDelete, setWidgetToDelete] = useState<string | null>(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    useEffect(() => {
        setIsComponentMounted(true);
    }, []);

    // Load hidden widgets from localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedHiddenWidgets = localStorage.getItem(`hidden-widgets-${pageId}`);
            if (savedHiddenWidgets) {
                setHiddenWidgets(new Set(JSON.parse(savedHiddenWidgets)));
            }
        }
    }, [pageId]);

    // Save hidden widgets to localStorage
    const saveHiddenWidgets = useCallback((newHiddenWidgets: Set<string>) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(`hidden-widgets-${pageId}`, JSON.stringify(Array.from(newHiddenWidgets)));
        }
    }, [pageId]);

    useLayoutEffect(() => {
        if (status === 'loading' || !isComponentMounted) return;

        const loadDashboardState = async () => {
            setIsLoading(true);
            try {
                const data = await getPageLayout(pageId);
                if (data) {
                    // Cast JSON back to types if necessary, mostly implicit
                    const loadedItems = data.items as Item[] || defaultItems;
                    const loadedLayouts = data.layouts as any || generateLayouts(loadedItems, defaultLayouts);
                    setItems(loadedItems);
                    setLayouts(loadedLayouts);
                } else {
                    setItems(defaultItems);
                    setLayouts(generateLayouts(defaultItems, defaultLayouts));
                }
            } catch (error) {
                console.error(`Error loading ${pageId} state:`, error);
                setItems(defaultItems);
                setLayouts(generateLayouts(defaultItems, defaultLayouts));
            } finally {
                setIsLoading(false);
            }
        };

        loadDashboardState();
    }, [status, isComponentMounted, pageId, defaultItems, defaultLayouts]);

    const saveDashboardState = useCallback(async (newLayouts: any, newItems: any) => {
        if (session?.user && isComponentMounted && !isLoading) {
            const cleanedLayouts = removeUndefinedFields(newLayouts);
            const result = await savePageLayout(pageId, cleanedLayouts, newItems);
            // Only show error for auth issues, not for database unavailable (to avoid spamming)
            if (!result.success && result.error === "Unauthorized") {
                toast({ variant: "destructive", title: "Error", description: "Session expired. Please refresh." });
            }
            // Silent fail for database issues - layout will be retried on next change
        }
    }, [session, isComponentMounted, isLoading, pageId, toast]);

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
        // Debounce saving for text changes? For now direct save
        saveDashboardState(layouts, newItems);
    };

    const handleHideWidget = (widgetId: string) => {
        setWidgetToDelete(widgetId);
        setShowDeleteDialog(true);
    };

    const confirmHideWidget = () => {
        if (widgetToDelete) {
            const newHiddenWidgets = new Set(hiddenWidgets);
            newHiddenWidgets.add(widgetToDelete);
            setHiddenWidgets(newHiddenWidgets);
            saveHiddenWidgets(newHiddenWidgets);

            // Also remove from current dashboard if it's present
            if (items.find(item => item.id === widgetToDelete)) {
                removeWidget(widgetToDelete);
            }

            toast({
                title: "Widget nascosto",
                description: "Il widget è stato rimosso dalla lista disponibile",
            });
        }
        setShowDeleteDialog(false);
        setWidgetToDelete(null);
    };

    const cancelHideWidget = () => {
        setShowDeleteDialog(false);
        setWidgetToDelete(null);
    };

    const handleShowAllWidgets = () => {
        setHiddenWidgets(new Set());
        saveHiddenWidgets(new Set());
        toast({
            title: "Widget ripristinati",
            description: "Tutti i widget sono ora visibili nella lista",
        });
    };

    const hideAllStaticWidgets = () => {
        // List of static widget IDs from widget-list.tsx
        const staticWidgetIds = [
            'kpi-1', 'kpi-2', 'kpi-3', 'kpi-4',
            'overview', 'revenue-by-product', 'capacity', 'cost-center', 'job-margin',
            'sql-test-table', 'orders', 'planning', 'acquisti', 'cutting', 'sewing',
            'printing', 'embroidery', 'lavanderia', 'stiro', 'controllo-qualita',
            'packaging', 'magazzino', 'setup', 'pipelines'
        ];

        const newHiddenWidgets = new Set(hiddenWidgets);
        staticWidgetIds.forEach(id => newHiddenWidgets.add(id));
        setHiddenWidgets(newHiddenWidgets);
        saveHiddenWidgets(newHiddenWidgets);

        // Also remove static widgets from current dashboard if present
        const itemsToRemove = items.filter(item => staticWidgetIds.includes(item.id));
        itemsToRemove.forEach(item => removeWidget(item.id));

        toast({
            title: "Widget statici nascosti",
            description: `Nascosti ${staticWidgetIds.length} widget statici dalla lista`,
        });
    };

    const currentWidgetIds = useMemo(() => new Set(items.map(i => i.id)), [items]);

    // Filter available widgets to exclude hidden ones
    const visibleWidgets = useMemo(() => {
        return Object.entries(availableWidgets).filter(([key]) => !hiddenWidgets.has(key));
    }, [availableWidgets, hiddenWidgets]);

    if (isLoading || status === 'loading' || !isComponentMounted) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    const gridItemClasses = (isEditing: boolean) => cn(
        "bg-card rounded-lg shadow-sm transition-all duration-200 overflow-visible",
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
                <div className='flex justify-end gap-2 flex-wrap'>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm">
                                <LayoutGrid className="h-4 w-4 mr-2" />
                                Aggiungi Widget
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="max-h-96 overflow-y-auto w-80">
                            {visibleWidgets.length === 0 ? (
                                <div className="p-4 text-sm text-muted-foreground text-center">
                                    Nessun widget disponibile
                                </div>
                            ) : (
                                visibleWidgets.map(([key, widget]) => (
                                    <div key={key} className="flex items-center justify-between px-2 py-1">
                                        <DropdownMenuItem
                                            className="flex-1"
                                            onSelect={() => addWidget(key)}
                                            disabled={currentWidgetIds.has(key)}
                                        >
                                            {widget.name}
                                        </DropdownMenuItem>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 flex-shrink-0 hover:text-destructive"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleHideWidget(key);
                                            }}
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))
                            )}
                            {(hiddenWidgets.size > 0 || Object.keys(availableWidgets).some(key =>
                                ['kpi-1', 'kpi-2', 'kpi-3', 'kpi-4', 'overview', 'revenue-by-product',
                                    'capacity', 'cost-center', 'job-margin', 'sql-test-table', 'orders',
                                    'planning', 'acquisti', 'cutting', 'sewing', 'printing', 'embroidery',
                                    'lavanderia', 'stiro', 'controllo-qualita', 'packaging', 'magazzino',
                                    'setup', 'pipelines'].includes(key) && !hiddenWidgets.has(key)
                            )) && (
                                    <>
                                        <div className="border-t my-2" />
                                        <DropdownMenuItem
                                            className="text-sm text-destructive hover:text-destructive"
                                            onSelect={hideAllStaticWidgets}
                                        >
                                            Nascondi tutti i widget statici
                                        </DropdownMenuItem>
                                        {hiddenWidgets.size > 0 && (
                                            <DropdownMenuItem
                                                className="text-sm text-muted-foreground"
                                                onSelect={handleShowAllWidgets}
                                            >
                                                Mostra tutti i widget nascosti ({hiddenWidgets.size})
                                            </DropdownMenuItem>
                                        )}
                                    </>
                                )}
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

            {/* Confirmation dialog for hiding widgets */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Nascondi widget</AlertDialogTitle>
                        <AlertDialogDescription>
                            Sei sicuro di voler nascondere questo widget dalla lista? Potrai ripristinarlo in seguito cliccando su "Mostra tutti i widget nascosti".
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={cancelHideWidget}>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmHideWidget} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Nascondi
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
