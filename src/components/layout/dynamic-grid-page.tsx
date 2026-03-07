'use client';

import React, { useState, useEffect, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Responsive, WidthProvider, Layout, Layouts as ReactGridLayouts } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useEditMode } from '@/hooks/use-edit-mode';
import { cn } from '@/lib/utils';
import { GripVertical, Plus, Trash2, LayoutGrid, Loader2, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TextWidget from '@/components/dashboard/text-widget';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import { savePageLayout } from '@/actions/dashboard';
import { PreviewWidgetRenderer } from '../widgets/builder/PreviewWidgetRenderer';
import { NodeWidgetRenderer } from '../widgets/builder/NodeWidgetRenderer';
import { useSession } from 'next-auth/react';
import { useToast } from '@/hooks/use-toast';
import { useDashboardLayout } from '@/hooks/use-dashboard-data';

// Remove WidthProvider
// const ResponsiveGridLayout = WidthProvider(Responsive);

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
    const { widgets: availableWidgets, refresh: refreshWidgets } = useAvailableWidgets();
    const { toast } = useToast();

    // Use optimized hook with caching for dashboard layout
    const { data: layoutData, isLoading: isLayoutLoading, refetch: refetchLayout } = useDashboardLayout(pageId, defaultLayouts, defaultItems);

    const [layouts, setLayouts] = useState<any>(generateLayouts(defaultItems, defaultLayouts));
    const [items, setItems] = useState<Item[]>(defaultItems);
    const [isComponentMounted, setIsComponentMounted] = useState(false);
    const [hiddenWidgets, setHiddenWidgets] = useState<Set<string>>(new Set());
    const [widgetToDelete, setWidgetToDelete] = useState<string | null>(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [width, setWidth] = useState(1200);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
    // Track whether the initial layout has been loaded from DB to skip the first
    // handleLayoutChange call (which fires on grid mount, not from user interaction)
    const hasUserInteractedRef = useRef(false);

    // Update state when layout data changes from hook
    useEffect(() => {
        if (layoutData) {
            setItems(layoutData.items);
            setLayouts(layoutData.layouts);
            // Reset interaction flag when new data arrives from DB
            hasUserInteractedRef.current = false;
        }
    }, [layoutData]);

    // Robust ResizeObserver to handle container width changes
    useLayoutEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect) {
                    // Subtracting a small buffer or using contentRect.width directly
                    setWidth(entry.contentRect.width);
                }
            }
        });

        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

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

    const saveDashboardState = useCallback((newLayouts: any, newItems: any) => {
        if (!session?.user || !isComponentMounted || isLayoutLoading) return;

        // Debounce saves: wait 800ms of inactivity before persisting
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            const cleanedLayouts = removeUndefinedFields(newLayouts);
            const result = await savePageLayout(pageId, cleanedLayouts, newItems);
            if (!result.success && result.error === "Unauthorized") {
                toast({ variant: "destructive", title: "Error", description: "Session expired. Please refresh." });
            }
        }, 800);
    }, [session, isComponentMounted, isLayoutLoading, pageId, toast]);

    // Cleanup debounce timer on unmount
    useEffect(() => {
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, []);

    const handleLayoutChange = useCallback((_layout: Layout[], allLayouts: ReactGridLayouts) => {
        if (isComponentMounted && !isLayoutLoading) {
            setLayouts(allLayouts);
            // Skip the first call (grid mount) - only save on actual user interaction
            if (!hasUserInteractedRef.current) {
                hasUserInteractedRef.current = true;
                return;
            }
            saveDashboardState(allLayouts, items);
        }
    }, [isComponentMounted, isLayoutLoading, saveDashboardState, items]);

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

    const currentWidgetIds = useMemo(() => new Set(items.map(i => i.id)), [items]);

    // Filter available widgets to exclude hidden ones and apply search filter
    const visibleWidgets = useMemo(() => {
        return Object.entries(availableWidgets).filter(([key, widget]) => {
            const isNotHidden = !hiddenWidgets.has(key);
            if (!isNotHidden) return false;

            if (!searchTerm) return true;
            return widget.name.toLowerCase().includes(searchTerm.toLowerCase());
        });
    }, [availableWidgets, hiddenWidgets, searchTerm]);

    // Lazy load for fallback pipeline widget - defined OUTSIDE render to avoid
    // creating a new lazy component on every render (which defeats React.lazy caching)
    const LazyPipelineOutputWidget = useMemo(
        () => React.lazy(() => import('../widgets/pipelines/PipelineOutputWidget').then(m => ({ default: m.default }))),
        []
    );

    const FallbackLoader = useMemo(() => (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <div className="animate-pulse">Caricamento...</div>
        </div>
    ), []);

    // Memoize the render widget function - only depends on availableWidgets reference
    const renderWidget = useCallback((item: Item) => {
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
        if (widgetConfig) return widgetConfig.component;

        // Fallback: render dynamic preview widgets directly even if not yet loaded in availableWidgets
        const pythonMatch = item.id.match(/^python-preview-(.+?)-(.+)$/);
        if (pythonMatch) {
            return (
                <React.Suspense fallback={FallbackLoader}>
                    <PreviewWidgetRenderer treeId={pythonMatch[1]} nodeId={pythonMatch[2]} previewType="python" resultName="" />
                </React.Suspense>
            );
        }
        const sqlMatch = item.id.match(/^sql-preview-(.+?)-(.+)$/);
        if (sqlMatch) {
            return (
                <React.Suspense fallback={FallbackLoader}>
                    <PreviewWidgetRenderer treeId={sqlMatch[1]} nodeId={sqlMatch[2]} previewType="sql" resultName="" />
                </React.Suspense>
            );
        }
        const treeMatch = item.id.match(/^tree-(.+?)-(.+)$/);
        if (treeMatch) {
            return (
                <React.Suspense fallback={FallbackLoader}>
                    <NodeWidgetRenderer treeId={treeMatch[1]} nodeId={treeMatch[2]} />
                </React.Suspense>
            );
        }
        const pipelineMatch = item.id.match(/^pipeline-(.+?)-(.+)$/);
        if (pipelineMatch) {
            return (
                <React.Suspense fallback={FallbackLoader}>
                    <LazyPipelineOutputWidget pipelineId={pipelineMatch[1]} nodeId={pipelineMatch[2]} />
                </React.Suspense>
            );
        }

        return <div className='p-4 text-sm text-destructive'>Widget non trovato: {item.id}</div>;
    }, [availableWidgets, editMode, handleTextChange, FallbackLoader, LazyPipelineOutputWidget]);

    // Optimized skeleton loader - shows placeholder widgets while loading
    if (isLayoutLoading || status === 'loading' || !isComponentMounted) {
        return (
            <div className='flex flex-col gap-4'>
                {editMode && (
                    <div className='flex justify-end gap-2 flex-wrap'>
                        <div className="h-9 w-40 bg-muted animate-pulse rounded-md" />
                        <div className="h-9 w-32 bg-muted animate-pulse rounded-md" />
                    </div>
                )}
                <div ref={containerRef} className="w-full">
                    <Responsive
                        width={width}
                        className="layout"
                        layouts={layouts}
                        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                        cols={{ lg: 48, md: 20, sm: 12, xs: 8, xxs: 4 }}
                        rowHeight={20}
                        isDraggable={false}
                        isResizable={false}
                        compactType="vertical"
                        preventCollision={false}
                        isBounded={false}
                        allowOverlap={false}
                        margin={[20, 20]}
                        containerPadding={[20, 20]}
                    >
                        {items.map(item => (
                            <div key={item.id} className="bg-card rounded-lg shadow-sm overflow-hidden">
                                <div className="flex h-full w-full items-center justify-center p-8">
                                    <div className="animate-pulse space-y-3 w-full">
                                        <div className="h-4 bg-muted rounded w-3/4 mx-auto" />
                                        <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
                                        <div className="h-32 bg-muted rounded mt-4" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </Responsive>
                </div>
            </div>
        );
    }

    const gridItemClasses = (isEditing: boolean) => cn(
        "bg-card rounded-lg shadow-sm transition-all duration-200 overflow-visible",
        isEditing && 'border-2 border-dashed border-primary/50 relative'
    );

    return (
        <div className='flex flex-col gap-4'>
            {editMode && (
                <div className='flex justify-end gap-2 flex-wrap'>
                    <DropdownMenu onOpenChange={(open) => { if (open) refreshWidgets(); }}>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm">
                                <LayoutGrid className="h-4 w-4 mr-2" />
                                Aggiungi Widget
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="max-h-96 overflow-y-auto w-80">
                            <div className="p-2 border-b sticky top-0 bg-popover z-10">
                                <div className="relative">
                                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Cerca widget..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-8 h-9"
                                        onKeyDown={(e) => e.stopPropagation()} // Prevent closing dropdown on space
                                    />
                                </div>
                            </div>
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
                            {hiddenWidgets.size > 0 && (
                                    <>
                                        <div className="border-t my-2" />
                                        <DropdownMenuItem
                                            className="text-sm text-muted-foreground"
                                            onSelect={handleShowAllWidgets}
                                        >
                                            Mostra tutti i widget nascosti ({hiddenWidgets.size})
                                        </DropdownMenuItem>
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
            <div ref={containerRef} className="w-full">
                <Responsive
                    width={width} // Explicit width from ResizeObserver
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
                    margin={[20, 20]}
                    containerPadding={[20, 20]}
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

                </Responsive>

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
        </div>
    );
}
