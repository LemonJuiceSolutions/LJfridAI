'use client';

import { useState, useMemo } from 'react';
import React from 'react';
import Link from 'next/link';
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2, ChevronRight, Play } from 'lucide-react';
import { customerOrdersData, productionStages } from '@/lib/data';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type Job = {
  jobId: string;
  orderId: string;
  sku: string;
  customer: string;
  quantity: number;
  status: string;
};

type PlanningGroup = {
  product: string;
  mainSku: string;
  totalQuantity: number;
  jobs: Job[];
  status: 'To Do' | 'Partially Launched' | 'Launched';
  jobsToDo: number;
  jobsLaunched: number;
  uniqueSkus: number;
};

export default function PlanningWidget() {
  const [orders, setOrders] = useState(customerOrdersData);
  const [filter, setFilter] = useState<'todo' | 'launched' | 'all'>('all');
  const [openProduct, setOpenProduct] = useState<string | null>(null);
  const { toast } = useToast();

  const handleLaunchGroup = (productName: string) => {
    setOrders(prevOrders => {
        const newOrders = prevOrders.map(order => {
            const newLines = order.lines.map(line => {
                if (line.product === productName && (line.status === 'Pending' || line.status === 'Planning')) {
                    const newStatus = 'Cutting';
                    const newStages = line.stages.map(stage => {
                        const stageIndex = productionStages.indexOf(stage.name);
                        const newStatusIndex = productionStages.indexOf(newStatus);
                        if (stageIndex <= newStatusIndex) {
                            return { ...stage, quantity: stage.quantity ?? line.quantity };
                        }
                        return stage;
                    });
                    return { ...line, status: newStatus, stages: newStages };
                }
                return line;
            });
            return { ...order, lines: newLines };
        });
        return newOrders;
    });
    toast({
        title: "Jobs Launched!",
        description: `All pending jobs for ${productName} have been moved to the Cutting department.`,
    });
  };

  const planningGroups = useMemo((): PlanningGroup[] => {
    const groups = orders
      .flatMap(order => 
        order.lines.map(line => ({
          product: line.product,
          sku: line.sku,
          jobId: line.jobId,
          orderId: order.id,
          customer: order.customer,
          quantity: line.quantity,
          status: line.status,
        }))
      )
      .reduce((acc, job) => {
        if (!acc[job.product]) {
          acc[job.product] = {
            product: job.product,
            mainSku: job.sku,
            totalQuantity: 0,
            jobs: [],
            status: 'Launched',
            jobsToDo: 0,
            jobsLaunched: 0,
          };
        }
        acc[job.product].totalQuantity += job.quantity;
        acc[job.product].jobs.push(job);
        
        const isLaunched = !['Pending', 'Planning'].includes(job.status);
        if(isLaunched) {
            acc[job.product].jobsLaunched++;
        } else {
            acc[job.product].jobsToDo++;
        }

        return acc;
      }, {} as Record<string, Omit<PlanningGroup, 'uniqueSkus' | 'status' > & { status: string, jobsToDo: number, jobsLaunched: number }>);
      
    return Object.values(groups).map(group => {
        let status: PlanningGroup['status'];
        if(group.jobsToDo === 0) {
            status = 'Launched';
        } else if (group.jobsLaunched > 0) {
            status = 'Partially Launched';
        } else {
            status = 'To Do';
        }
        return {
            ...group,
            status,
            uniqueSkus: new Set(group.jobs.map(j => j.sku)).size,
        };
    });
  }, [orders]);


  const filteredItems = useMemo(() => {
    switch (filter) {
        case 'todo':
            return planningGroups.filter(item => item.status !== 'Launched');
        case 'launched':
            return planningGroups.filter(item => item.status === 'Launched');
        case 'all':
        default:
            return planningGroups;
    }
  }, [filter, planningGroups]);

  const PlanningGroupRow = ({ group }: { group: PlanningGroup }) => {
    const isGroupOpen = openProduct === group.product;
    const canBeLaunched = group.status === 'To Do' || group.status === 'Partially Launched';

    return (
      <React.Fragment>
        <TableRow className="cursor-pointer" onClick={() => setOpenProduct(isGroupOpen ? null : group.product)}>
            <TableCell className="w-12 py-2">
                <ChevronRight className={cn('h-4 w-4 transition-transform', isGroupOpen && 'rotate-90')} />
            </TableCell>
            <TableCell className="font-medium py-2">{group.mainSku}</TableCell>
            <TableCell className="py-2">{group.product}</TableCell>
            <TableCell className="py-2">{group.totalQuantity}</TableCell>
            <TableCell className="py-2">{group.uniqueSkus}</TableCell>
            <TableCell className="py-2">{group.jobs.length}</TableCell>
            <TableCell className="py-2">
              <Badge variant={group.status === 'Launched' ? 'default' : 'outline'}>
                {group.status === 'Launched' ? 'Launched' : `${group.jobsToDo} to do`}
              </Badge>
            </TableCell>
            <TableCell className="text-right py-2">
                <div className='inline-flex'>
                    {canBeLaunched && (
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleLaunchGroup(group.product); }}>
                            <Play className="h-4 w-4" />
                            <span className="sr-only">Launch All Jobs</span>
                        </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete Group</span>
                    </Button>
                </div>
            </TableCell>
        </TableRow>
        {isGroupOpen && (
            <TableRow className="bg-muted/50">
                <TableCell colSpan={8} className="p-0">
                    <div className="p-4">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Job ID</TableHead>
                                    <TableHead>SKU</TableHead>
                                    <TableHead>Order ID</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Quantity</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {group.jobs.map(job => (
                                    <TableRow key={job.jobId}>
                                        <TableCell>{job.jobId}</TableCell>
                                        <TableCell>{job.sku}</TableCell>
                                        <TableCell>
                                            <Link href="/orders" className="text-primary hover:underline">
                                                {job.orderId}
                                            </Link>
                                        </TableCell>
                                        <TableCell>{job.customer}</TableCell>
                                        <TableCell>{job.quantity}</TableCell>
                                        <TableCell>
                                            <Badge variant={!['Pending', 'Planning'].includes(job.status) ? 'default' : 'outline'}>
                                                {job.status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </TableCell>
            </TableRow>
        )}
      </React.Fragment>
    );
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Production Planning</CardTitle>
            <CardDescription>
              Review, plan, and launch production jobs grouped by product.
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <Select value={filter} onValueChange={(value) => setFilter(value as any)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter status..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                <SelectItem value="todo">To Be Launched</SelectItem>
                <SelectItem value="launched">Launched</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="gap-1">
              <PlusCircle className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                Add Job
              </span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>Article Code</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Total Quantity</TableHead>
              <TableHead>SKUs</TableHead>
              <TableHead>Jobs</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length > 0 ? (
                filteredItems.map((group) => (
                    <PlanningGroupRow key={group.product} group={group} />
                ))
            ) : (
                <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No production jobs match the current filter.
                    </TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}