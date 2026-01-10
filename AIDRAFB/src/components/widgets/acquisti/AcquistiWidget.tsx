'use client';

import React, { useState, useMemo } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Truck, ChevronRight, HardHat, PackageCheck, Send } from 'lucide-react';
import { customerOrdersData, suppliersData, materialsData } from '@/lib/data';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type MaterialRequirement = {
  supplier: string;
  componentName: string;
  totalQuantity: number;
  unit: string;
  jobs: {
    jobId: string;
    orderId: string;
    product: string;
    quantity: number;
  }[];
};

const KpiCard = ({ title, value, icon: Icon, description }: { title: string, value: string, icon: React.ElementType, description: string }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
);

export default function AcquistiWidget() {
    const [openSupplier, setOpenSupplier] = useState<string | null>(null);
    const [openComponent, setOpenComponent] = useState<string | null>(null);

    const requirementsBySupplier = useMemo(() => {
        const materialMap = new Map<string, { supplier: string, unit: string }>();
        materialsData.forEach(mat => {
            materialMap.set(mat.name, { supplier: mat.supplier, unit: mat.unit });
        });

        const requirements: Record<string, MaterialRequirement[]> = {};
        
        customerOrdersData.forEach(order => {
            order.lines.forEach(line => {
                // Consider only jobs that are in production
                if (line.status !== 'Pending' && line.status !== 'Planning') {
                    line.bom.components.forEach(component => {
                        const materialInfo = materialMap.get(component.name);
                        if (materialInfo) {
                            const supplier = materialInfo.supplier;
                            if (!requirements[supplier]) {
                                requirements[supplier] = [];
                            }

                            let materialReq = requirements[supplier].find(r => r.componentName === component.name);
                            if (!materialReq) {
                                materialReq = {
                                    supplier: supplier,
                                    componentName: component.name,
                                    totalQuantity: 0,
                                    unit: materialInfo.unit,
                                    jobs: []
                                };
                                requirements[supplier].push(materialReq);
                            }
                            
                            const requiredForJob = component.quantity * line.quantity;
                            materialReq.totalQuantity += requiredForJob;
                            materialReq.jobs.push({
                                jobId: line.jobId,
                                orderId: order.id,
                                product: line.product,
                                quantity: requiredForJob
                            });
                        }
                    });
                }
            });
        });
        
        // Sort jobs within each requirement
        Object.values(requirements).forEach(reqList => {
            reqList.forEach(req => {
                req.jobs.sort((a, b) => a.jobId.localeCompare(b.jobId));
            });
            // Sort requirements by component name
            reqList.sort((a,b) => a.componentName.localeCompare(b.componentName));
        });

        return Object.entries(requirements).sort((a,b) => a[0].localeCompare(b[0]));
    }, []);

    const kpiValues = useMemo(() => {
        const totalSuppliers = requirementsBySupplier.length;
        const totalItemsToOrder = requirementsBySupplier.reduce((sum, [, reqs]) => sum + reqs.length, 0);
        return { totalSuppliers, totalItemsToOrder };
    }, [requirementsBySupplier]);

    const toggleSupplier = (supplierName: string) => {
        setOpenSupplier(prev => prev === supplierName ? null : supplierName);
        setOpenComponent(null);
    };
    
    const toggleComponent = (componentKey: string) => {
        setOpenComponent(prev => prev === componentKey ? null : componentKey);
    };

    return (
        <Card className="h-full flex flex-col">
            <CardHeader>
                <CardTitle>Centrale Acquisti</CardTitle>
                <CardDescription>
                    Raggruppa i fabbisogni di materiali per fornitore e crea ordini di acquisto.
                </CardDescription>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 pt-4">
                    <KpiCard title="Totale Fornitori con Fabbisogni" value={kpiValues.totalSuppliers.toString()} icon={HardHat} description="Numero di fornitori da cui acquistare" />
                    <KpiCard title="Articoli Totali da Ordinare" value={kpiValues.totalItemsToOrder.toString()} icon={PackageCheck} description="Numero totale di SKU da ordinare" />
                </div>
            </CardHeader>
            <CardContent className="overflow-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className='w-12'></TableHead>
                            <TableHead>Fornitore</TableHead>
                            <TableHead>N° Articoli da Ordinare</TableHead>
                            <TableHead className='text-right'>Azioni</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {requirementsBySupplier.map(([supplierName, requirements]) => {
                            const isSupplierOpen = openSupplier === supplierName;
                            const supplierInfo = suppliersData.find(s => s.name === supplierName);

                            return (
                                <React.Fragment key={supplierName}>
                                    <TableRow className="cursor-pointer bg-muted/25 hover:bg-muted/50" onClick={() => toggleSupplier(supplierName)}>
                                        <TableCell>
                                            <ChevronRight className={cn('h-4 w-4 transition-transform', isSupplierOpen && 'rotate-90')} />
                                        </TableCell>
                                        <TableCell className="font-semibold">{supplierName}</TableCell>
                                        <TableCell>
                                            <Badge variant="secondary">{requirements.length} articoli</Badge>
                                        </TableCell>
                                        <TableCell className='text-right'>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button size="sm">
                                                            <Send className='h-4 w-4 mr-2' />
                                                            Crea Ordine
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Raggruppa tutti i fabbisogni in un unico Ordine a Fornitore</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </TableCell>
                                    </TableRow>

                                    {isSupplierOpen && (
                                        <TableRow>
                                            <TableCell colSpan={4} className='p-0'>
                                                <div className='p-4 bg-background'>
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead className='w-12'></TableHead>
                                                            <TableHead>Codice / Articolo</TableHead>
                                                            <TableHead>Quantità Totale</TableHead>
                                                            <TableHead>Unità</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {requirements.map(req => {
                                                            const componentKey = `${supplierName}-${req.componentName}`;
                                                            const isComponentOpen = openComponent === componentKey;
                                                            return (
                                                                <React.Fragment key={componentKey}>
                                                                    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleComponent(componentKey)}>
                                                                        <TableCell>
                                                                            <ChevronRight className={cn('h-4 w-4 transition-transform', isComponentOpen && 'rotate-90')} />
                                                                        </TableCell>
                                                                        <TableCell className='font-medium'>{req.componentName}</TableCell>
                                                                        <TableCell className='font-bold'>{req.totalQuantity.toLocaleString('it-IT')}</TableCell>
                                                                        <TableCell>{req.unit}</TableCell>
                                                                    </TableRow>
                                                                    {isComponentOpen && (
                                                                        <TableRow>
                                                                            <TableCell colSpan={4} className='p-0 pl-12 bg-muted/20'>
                                                                                <div className='p-2'>
                                                                                    <Table>
                                                                                        <TableHeader>
                                                                                            <TableRow>
                                                                                                <TableHead className='text-xs'>Commessa</TableHead>
                                                                                                <TableHead className='text-xs'>Prodotto Finale</TableHead>
                                                                                                <TableHead className='text-xs text-right'>Qtà Richiesta</TableHead>
                                                                                            </TableRow>
                                                                                        </TableHeader>
                                                                                        <TableBody>
                                                                                            {req.jobs.map(job => (
                                                                                                <TableRow key={job.jobId}>
                                                                                                    <TableCell className='text-xs'>{job.jobId}</TableCell>
                                                                                                    <TableCell className='text-xs'>{job.product}</TableCell>
                                                                                                    <TableCell className='text-xs text-right'>{job.quantity.toLocaleString('it-IT')} {req.unit}</TableCell>
                                                                                                </TableRow>
                                                                                            ))}
                                                                                        </TableBody>
                                                                                    </Table>
                                                                                </div>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    )}
                                                                </React.Fragment>
                                                            )
                                                        })}
                                                    </TableBody>
                                                </Table>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </React.Fragment>
                            )
                        })}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}