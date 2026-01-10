'use client'

import { PlusCircle, ListFilter, ChevronRight, CheckCircle2, AlertTriangle, ChevronsUpDown, ChevronsDownUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { customerOrdersData, productionStages } from '@/lib/data';
import { useState } from 'react';
import React from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function OrdersWidget() {
    const [openOrderIds, setOpenOrderIds] = useState<string[]>([]);
    const [openOrderLine, setOpenOrderLine] = useState<string | null>(null);
    const [hideShipped, setHideShipped] = useState(true);

    const toggleOrder = (orderId: string) => {
        setOpenOrderIds(prev => 
            prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
        );
    };

    const expandAll = () => {
        setOpenOrderIds(customerOrdersData.map(order => order.id));
    };

    const collapseAll = () => {
        setOpenOrderIds([]);
    };

    const getStatusVariant = (status: string) => {
        switch (status) {
            case 'Shipped':
                return 'default';
            case 'In Production':
            case 'Quality Control':
            case 'In Progress':
            case 'Sewing':
            case 'Cutting':
            case 'Printing':
            case 'Embroidery':
            case 'Finishing':
            case 'Procurement':
                return 'secondary';
            case 'Completed':
                return 'default';
            case 'Multiple':
                return 'outline';
            default:
                return 'outline';
        }
    };

    const getAggregatedStatus = (orderLines: any[]) => {
        const statuses = orderLines.map(line => line.status);
        const uniqueStatuses = [...new Set(statuses)];
    
        if (uniqueStatuses.length === 1) {
          return uniqueStatuses[0];
        }
    
        if (uniqueStatuses.length > 1) {
          const statusCounts = statuses.reduce((acc, status) => {
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
    
          return `${orderLines.length} items: ` + Object.entries(statusCounts)
            .map(([status, count]) => `${count} ${status}`)
            .join(', ');
        }
        
        return 'Pending';
      };

      const hasQuantityDiscrepancy = (stages: any) => {
        if (!Array.isArray(stages)) return false;
        for (let i = 1; i < stages.length; i++) {
          const prevStage = stages[i-1];
          const currentStage = stages[i];
          if (prevStage.quantity !== null && currentStage.quantity !== null && currentStage.quantity > prevStage.quantity) {
            return true;
          }
        }
        return false;
      };

      const orderHasAlert = (order: (typeof customerOrdersData)[0]) => {
        return order.lines.some(line => hasQuantityDiscrepancy(line.stages));
      }

      const filteredOrders = hideShipped 
        ? customerOrdersData.filter(order => order.lines.some(line => line.status !== 'Shipped'))
        : customerOrdersData;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between pl-6">
            <div>
                <CardTitle>Customer Orders</CardTitle>
                <CardDescription>Handle customer orders with size/color variations.</CardDescription>
            </div>
            <div className="flex gap-2 items-center">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={expandAll} className="h-7 w-7">
                                <ChevronsDownUp className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Expand All</p>
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={collapseAll} className="h-7 w-7">
                                <ChevronsUpDown className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Collapse All</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 gap-1">
                            <ListFilter className="h-3.5 w-3.5" />
                            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                            Filter
                            </span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem checked={hideShipped} onCheckedChange={setHideShipped}>
                            Hide Shipped
                        </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button size="sm" className="gap-1">
                    <PlusCircle className="h-3.5 w-3.5" />
                    <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                        Add Order
                    </span>
                </Button>
            </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-auto">
        <TooltipProvider>
            <Table>
            <TableHeader>
                <TableRow>
                <TableHead className="w-[24px]"></TableHead>
                <TableHead>Order ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[24px]"></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {filteredOrders.map((order) => {
                    const aggregatedStatus = getAggregatedStatus(order.lines);
                    const hasMultipleStatuses = aggregatedStatus.includes(':');
                    const isOrderOpen = openOrderIds.includes(order.id);
                    const alertPresent = orderHasAlert(order);

                    return (
                        <React.Fragment key={order.id}>
                            <TableRow className="cursor-pointer" onClick={() => toggleOrder(order.id)}>
                                <TableCell>
                                    <ChevronRight className={`h-4 w-4 transition-transform ${isOrderOpen ? 'rotate-90' : ''}`} />
                                </TableCell>

                                <TableCell className="font-medium">{order.id}</TableCell>
                                <TableCell>{order.customer}</TableCell>
                                <TableCell>{order.date}</TableCell>
                                <TableCell>{order.items}</TableCell>
                                <TableCell>${order.total.toLocaleString('en-US')}</TableCell>
                                <TableCell>
                                    <Badge variant={getStatusVariant(hasMultipleStatuses ? 'Multiple' : aggregatedStatus)} className={cn(hasMultipleStatuses && 'max-w-[200px] truncate')}>
                                        {aggregatedStatus}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    {alertPresent && (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Quantity discrepancy in one or more order lines.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    )}
                                </TableCell>
                            </TableRow>
                            {isOrderOpen && (
                                <TableRow className="bg-muted/50">
                                    <TableCell colSpan={8} className="p-0">
                                    <div className="p-6 grid grid-cols-1 gap-6">
                                        <div>
                                        <h4 className="font-semibold mb-4">Order Lines</h4>
                                        <div className="space-y-4">
                                            {order.lines.map((line) => (
                                                <Collapsible asChild key={line.sku} open={openOrderLine === line.sku} onOpenChange={() => setOpenOrderLine(openOrderLine === line.sku ? null : line.sku)}>
                                                    <div className="rounded-md border bg-background">
                                                        <CollapsibleTrigger className='w-full'>
                                                            <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-sm cursor-pointer hover:bg-muted/50 rounded-t-md">
                                                                <div className='flex items-center gap-2 col-span-1'>
                                                                    <ChevronRight className={`h-4 w-4 transition-transform ${openOrderLine === line.sku ? 'rotate-90' : ''}`} />
                                                                    <div>
                                                                        <div>{line.product}</div>
                                                                        <div className="text-xs text-muted-foreground">{line.color}, {line.size} (Qty: {line.quantity})</div>
                                                                    </div>
                                                                </div>
                                                                <div className="col-span-1">
                                                                    <div className="text-xs text-muted-foreground">Job ID</div>
                                                                    <div>{line.jobId}</div>
                                                                </div>
                                                                <div className="col-span-2">
                                                                    <div className="text-xs text-muted-foreground mb-1 flex items-center gap-2">
                                                                        Production Status
                                                                        {hasQuantityDiscrepancy(line.stages) && (
                                                                            <Tooltip>
                                                                                <TooltipTrigger asChild>
                                                                                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                                                                </TooltipTrigger>
                                                                                <TooltipContent>
                                                                                    <p>Quantity discrepancy detected. Review planning and procurement.</p>
                                                                                </TooltipContent>
                                                                            </Tooltip>
                                                                        )}
                                                                    </div>
                                                                    
                                                                    <div className="flex items-start space-x-2">
                                                                        {Array.isArray(line.stages) && line.stages.map((stage, index) => {
                                                                            const currentStageIndex = productionStages.indexOf(line.status);
                                                                            const isCompleted = index <= currentStageIndex;
                                                                            const isMissingData = stage.quantity === null;
                                                                            const nextStageIsMissingData = index + 1 < line.stages.length && line.stages[index + 1].quantity === null;

                                                                            return (
                                                                                <React.Fragment key={stage.name}>
                                                                                    <div className="flex flex-col items-center flex-1 min-w-0">
                                                                                        <div className="text-xs font-bold text-muted-foreground">{stage.quantity ?? 'N/A'}</div>
                                                                                        <div className={cn("mt-1 flex h-6 w-6 items-center justify-center rounded-full", 
                                                                                            isCompleted && isMissingData ? 'bg-orange-400 text-white' : 
                                                                                            isCompleted ? 'bg-green-500 text-white' : 
                                                                                            'bg-muted'
                                                                                        )}>
                                                                                            <CheckCircle2 className="h-4 w-4" />
                                                                                        </div>
                                                                                        <div className="text-[10px] mt-1 text-muted-foreground text-center truncate">{stage.name}</div>
                                                                                    </div>
                                                                                    {index < line.stages.length - 1 && (
                                                                                        <div className={cn("flex-1 h-0.5 mt-4", 
                                                                                            isCompleted && !isMissingData && nextStageIsMissingData ? 'bg-orange-400' :
                                                                                            isCompleted && !isMissingData ? 'bg-green-500' : 
                                                                                            'bg-muted')} />
                                                                                    )}
                                                                                </React.Fragment>
                                                                            )
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </CollapsibleTrigger>
                                                        <CollapsibleContent>
                                                            <div className="p-4 bg-muted/50 rounded-b-md grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                                                <div>
                                                                    <h5 className="font-semibold mb-2">Components (BOM)</h5>
                                                                    <div className='space-y-1'>
                                                                    {line.bom.components.map(c => (
                                                                        <div key={c.name} className="flex justify-between">
                                                                            <span>{c.name}</span>
                                                                            <span className='text-muted-foreground'>{c.quantity} {c.unit}</span>
                                                                        </div>
                                                                    ))}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <h5 className="font-semibold mb-2">Production Phases</h5>
                                                                    <ul className='list-disc list-inside space-y-1'>
                                                                    {line.bom.phases.map(p => (
                                                                        <li key={p.name}>{p.name} ({p.duration})</li>
                                                                    ))}
                                                                    </ul>
                                                                </div>
                                                            </div>
                                                        </CollapsibleContent>
                                                    </div>
                                                </Collapsible>
                                            ))}
                                        </div>
                                        </div>
                                    </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </React.Fragment>
                )})}
            </TableBody>
            </Table>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}