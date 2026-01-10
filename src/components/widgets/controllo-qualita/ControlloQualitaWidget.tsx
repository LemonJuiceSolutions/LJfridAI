'use client';

import React, { useState, useMemo, useCallback } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { customerOrdersData, productionStages, suppliersData } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Check, Send, Printer, ClipboardList, Play, ChevronRight, Info, Sparkles, AlertTriangle, CheckCircle, Percent, Package } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from '@/components/ui/dialog';
import { addDays, format, parse } from 'date-fns';
import { Input } from '@/components/ui/input';
import { AssignJobDialog } from '@/components/production/assign-job-dialog';


const CURRENT_STAGE = "Controllo Qualità";
type JobStatus = 'To be assigned' | 'To be prepared (Internal)' | 'To be prepared (External)' | 'In Progress (Internal)' | 'Awaiting Return (External)' | 'Completed (Internal)' | 'Returned (External)';

export type Job = {
    jobId: string;
    orderId: string;
    product: string;
    sku: string;
    quantity: number;
    customer: string;
    status: JobStatus;
    assignedTo: 'Internal' | 'External' | null;
    supplier?: string;
    bom: { components: { name: string; quantity: number; unit: string }[], phases: any[] };
    deliveryDate: string;
    returnDate: string | null;
    ddtNumber: string | null;
    returnedQuantity: number | null;
    previousStageQuantity: number;
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

// Function to get a pseudo-random but deterministic status based on Job ID
const getInitialJobStatus = (jobId: string): { status: JobStatus; assignedTo: 'Internal' | 'External' | null, supplier?: string } => {
    const numericId = parseInt(jobId.replace(/\D/g, ''), 10) || 0;
    const mod = numericId % 10;

    if (mod < 2) return { status: 'To be assigned', assignedTo: null }; 
    if (mod < 4) return { status: 'To be prepared (Internal)', assignedTo: 'Internal' };
    if (mod < 7) return { status: 'In Progress (Internal)', assignedTo: 'Internal' }; 
    if (mod < 8) return { status: 'Awaiting Return (External)', assignedTo: 'External', supplier: suppliersData[numericId % suppliersData.length].name };
    if (mod < 9) return { status: 'Completed (Internal)', assignedTo: 'Internal' };
    return { status: 'Returned (External)', assignedTo: 'External', supplier: suppliersData[numericId % suppliersData.length].name };
};

const getDeliveryDate = (jobId: string) => {
    const numericId = parseInt(jobId.replace(/\D/g, ''), 10) || 0;
    const daysToAdd = (numericId % 14) + 7; // Add between 7 and 20 days
    return format(addDays(new Date('2024-06-01'), daysToAdd), 'dd/MM/yyyy');
};

const getReturnDate = (jobId: string) => {
    const baseJobId = jobId.split('-')[0];
    const numericId = parseInt(baseJobId.replace(/\D/g, ''), 10) || 0;
    if(isNaN(numericId)) return format(new Date('2024-06-01'), 'dd/MM/yyyy'); // fallback
    const daysToSubtract = (numericId % 5);
    return format(addDays(new Date('2024-06-01'), -daysToSubtract), 'dd/MM/yyyy');
};

const SheetDialog = ({ job, isOpen, onOpenChange }: { job: Job | null, isOpen: boolean, onOpenChange: (open: boolean) => void }) => {
    if (!job) return null;

    const isExternal = job.assignedTo === 'External';
    const documentTitle = isExternal ? 'Ordine di Conto Lavoro / DDT' : 'Scheda di Controllo Qualità';
    const documentDescription = isExternal 
        ? `Dettagli per l'invio al fornitore ${job.supplier}` 
        : `Commessa: ${job.jobId} - Cliente: ${job.customer}`;
  
    const handlePrint = () => {
      window.print();
    };
  
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl @media print:sm:max-w-none print:m-0 print:border-0 print:rounded-none">
          <DialogHeader>
            <DialogTitle>{documentTitle} - {job.product}</DialogTitle>
            <DialogDescription>
                {documentDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h4 className="font-semibold text-lg border-b pb-2 mb-2">Dettagli Produzione</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mt-2">
                        <p><strong>Articolo:</strong> {job.sku}</p>
                        <p><strong>Cliente Finale:</strong> {job.customer}</p>
                        <p><strong>Commessa:</strong> {job.jobId}</p>
                        <p><strong>Quantità da Lavorare:</strong> <span className='font-bold text-xl'>{job.quantity} pz</span></p>
                        <p><strong>Assegnato a:</strong> <span className='font-semibold'>{job.supplier ?? job.assignedTo}</span></p>
                        <p><strong>Data Consegna Prevista:</strong> {job.deliveryDate}</p>
                        {isExternal && (
                             <p><strong>DDT Uscita N°:</strong> DDT-OUT-{parseInt(job.jobId.replace(/\D/g, ''), 10) || 'N/A'}</p>
                        )}
                    </div>
                </div>
                <div>
                    <h4 className="font-semibold text-lg border-b pb-2 mb-2">Materiali (Distinta Base)</h4>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Componente</TableHead>
                                <TableHead className='text-right'>Qtà Totale Richiesta</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {job.bom.components.map(comp => (
                                <TableRow key={comp.name}>
                                    <TableCell>{comp.name}</TableCell>
                                    <TableCell className='text-right font-medium'>{(comp.quantity * job.quantity).toLocaleString('it-IT')} {comp.unit}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
              </div>
              {isExternal && (
                  <div className='print:mt-12'>
                      <h4 className="font-semibold text-lg border-b pb-2 mb-2">Conferma di Ritorno</h4>
                       <div className="grid grid-cols-3 gap-8 mt-8 text-sm">
                            <div>
                                <p>Data Rientro:</p>
                                <div className="border-b h-8 mt-2"></div>
                            </div>
                             <div>
                                <p>DDT Rientro N°:</p>
                                <div className="border-b h-8 mt-2"></div>
                            </div>
                             <div>
                                <p>Timbro e Firma Fornitore:</p>
                                <div className="border-b h-8 mt-2"></div>
                            </div>
                       </div>
                  </div>
              )}
            </div>
          <DialogFooter className="print:hidden">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Chiudi
            </Button>
            <Button type="button" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" /> Stampa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
};


export default function ControlloQualitaWidget() {
    const [openJobId, setOpenJobId] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [sheetDialogOpen, setSheetDialogOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);

    const [jobs, setJobs] = useState<Job[]>(() => {
        const stageIndex = productionStages.indexOf(CURRENT_STAGE);
        const prevStage = stageIndex > 0 ? productionStages[stageIndex - 1] : 'Planning';

        const allJobsFromOrders = customerOrdersData.flatMap(order => 
            order.lines
                .filter(line => productionStages.indexOf(line.status) >= stageIndex - 1)
                .map(line => {
                    const previousStageData = line.stages.find(s => s.name === prevStage);
                    const previousStageQuantity = previousStageData?.quantity ?? line.quantity;
                    const isJobAtCurrentStageOrLater = productionStages.indexOf(line.status) >= stageIndex;

                    let finalStatus: { status: JobStatus; assignedTo: 'Internal' | 'External' | null, supplier?: string };

                    if (isJobAtCurrentStageOrLater) {
                        const initialStatus = getInitialJobStatus(line.jobId);
                         if (productionStages.indexOf(line.status) > stageIndex) {
                            finalStatus = {
                                ...initialStatus,
                                status: initialStatus.assignedTo === 'External' 
                                    ? 'Returned (External)' 
                                    : 'Completed (Internal)'
                            };
                        } else {
                            finalStatus = initialStatus;
                        }
                    } else {
                        finalStatus = { status: 'To be assigned', assignedTo: null };
                    }
                    
                    const deliveryDate = getDeliveryDate(line.jobId);
                    const isCompletedOrReturned = finalStatus.status.startsWith('Completed') || finalStatus.status.startsWith('Returned');

                    const numericJobId = parseInt(line.jobId.replace(/\D/g, '')) || 0;

                    return {
                        jobId: line.jobId,
                        orderId: order.id,
                        product: line.product,
                        sku: line.sku,
                        quantity: previousStageQuantity,
                        customer: order.customer,
                        ...finalStatus,
                        bom: line.bom,
                        deliveryDate: deliveryDate,
                        returnDate: isCompletedOrReturned ? getReturnDate(line.jobId) : null,
                        ddtNumber: finalStatus.status.startsWith('Returned') ? `DDT-R-${numericJobId}` : null,
                        returnedQuantity: isCompletedOrReturned ? previousStageQuantity - (numericJobId % 5) : null, // Simulate a small loss
                        previousStageQuantity: line.quantity, // This is the original order quantity
                    };
                })
        );
        
        // This part ensures there's always some data for demonstration
        const statusesToEnsure = ['To be assigned', 'To be prepared (Internal)', 'In Progress (Internal)', 'Awaiting Return (External)'];
        statusesToEnsure.forEach(statusPrefix => {
            while (allJobsFromOrders.filter(j => j.status === statusPrefix).length < 2) {
                const jobToConvertIndex = allJobsFromOrders.findIndex(j => {
                     switch(statusPrefix) {
                        case 'To be assigned': return !j.status.startsWith('To be assigned');
                        case 'To be prepared (Internal)': return j.status === 'To be assigned';
                        case 'In Progress (Internal)': return j.status === 'To be prepared (Internal)';
                        case 'Awaiting Return (External)': return j.status === 'To be prepared (External)';
                        default: return false;
                     }
                });
                
                if (jobToConvertIndex > -1) {
                    const jobToConvert = allJobsFromOrders[jobToConvertIndex];
                     switch(statusPrefix) {
                        case 'To be assigned': 
                            jobToConvert.status = 'To be assigned';
                            jobToConvert.assignedTo = null;
                            jobToConvert.supplier = undefined;
                            break;
                        case 'To be prepared (Internal)':
                            jobToConvert.status = 'To be prepared (Internal)';
                            jobToConvert.assignedTo = 'Internal';
                            break;
                        case 'In Progress (Internal)':
                            jobToConvert.status = 'In Progress (Internal)';
                            break;
                        case 'Awaiting Return (External)':
                            jobToConvert.status = 'Awaiting Return (External)';
                            jobToConvert.assignedTo = 'External';
                            jobToConvert.supplier = suppliersData[0].name;
                             break;
                     }
                } else break; 
            }
        });

        return allJobsFromOrders;
    });

    const kpiValues = useMemo(() => {
        const today = new Date();
        const lateJobs = jobs.filter(j => {
            const isLate = !j.status.startsWith('Completed') && !j.status.startsWith('Returned') && parse(j.deliveryDate, 'dd/MM/yyyy', new Date()) < today;
            return isLate;
        }).length;

        const piecesCompletedToday = jobs.filter(j => j.returnDate === format(today, 'dd/MM/yyyy'))
                                        .reduce((sum, j) => sum + (j.returnedQuantity ?? 0), 0);

        const allCompletedJobs = jobs.filter(j => j.status.startsWith('Completed') || j.status.startsWith('Returned'));
        const totalInitialQty = allCompletedJobs.reduce((sum, j) => sum + j.quantity, 0);
        const totalReturnedQty = allCompletedJobs.reduce((sum, j) => sum + (j.returnedQuantity ?? 0), 0);
        const efficiency = totalInitialQty > 0 ? (totalReturnedQty / totalInitialQty) * 100 : 100;
        
        const totalToProcess = jobs.filter(j => !j.status.startsWith('Completed') && !j.status.startsWith('Returned'))
                                   .reduce((sum, j) => sum + j.quantity, 0);

        return { lateJobs, piecesCompletedToday, efficiency, totalToProcess };
    }, [jobs]);

    const openAssignDialog = useCallback((job: Job) => {
        setSelectedJob(job);
        setDialogOpen(true);
    }, []);

    const openSheetDialog = useCallback((job: Job) => {
        setSelectedJob(job);
        setSheetDialogOpen(true);
    }, []);

    const handleAssign = useCallback((jobToAssign: Job, quantityToAssign: number, destination: string, supplier?: string) => {
        setJobs(prevJobs => {
            const newJobs = [...prevJobs];
            const originalJobIndex = newJobs.findIndex(j => j.jobId === jobToAssign.jobId);
            
            if (originalJobIndex === -1) return prevJobs;

            const originalJob = newJobs[originalJobIndex];
            const remainingQuantity = originalJob.quantity - quantityToAssign;
            
            const newPartialJob: Job = {
                ...originalJob,
                jobId: `${jobToAssign.jobId}-P${Date.now()}`,
                quantity: quantityToAssign,
                status: destination === 'Internal' ? 'To be prepared (Internal)' : 'To be prepared (External)',
                assignedTo: destination === 'Internal' ? 'Internal' : 'External',
                supplier: supplier,
            };

            if (remainingQuantity > 0) {
                newJobs[originalJobIndex].quantity = remainingQuantity;
            } else {
                newJobs.splice(originalJobIndex, 1);
            }

            newJobs.push(newPartialJob);
            return newJobs;
        });
        setDialogOpen(false);
    }, []);

    const handleStartProduction = (jobId: string) => {
        setJobs(prevJobs => 
            prevJobs.map(job => {
                if (job.jobId === jobId) {
                    const newStatus = job.assignedTo === 'Internal' ? 'In Progress (Internal)' : 'Awaiting Return (External)';
                    return { ...job, status: newStatus as JobStatus };
                }
                return job;
            })
        );
    };

    const handleMarkAsComplete = (jobId: string) => {
        setJobs(prevJobs => 
            prevJobs.map(job => {
                if (job.jobId === jobId) {
                    const newStatus = job.assignedTo === 'Internal' ? 'Completed (Internal)' : 'Returned (External)';
                    return { 
                        ...job, 
                        status: newStatus as JobStatus,
                        returnDate: format(new Date(), 'dd/MM/yyyy'),
                        returnedQuantity: job.returnedQuantity ?? job.quantity, // Default to original quantity if not set
                    };
                }
                return job;
            })
        );
    };

    const handleDdtChange = (jobId: string, ddt: string) => {
        setJobs(prevJobs => 
            prevJobs.map(job => 
                job.jobId === jobId ? { ...job, ddtNumber: ddt } : job
            )
        );
    };

    const handleReturnedQuantityChange = (jobId: string, quantity: string) => {
        const numQuantity = parseInt(quantity, 10);
        setJobs(prevJobs => 
            prevJobs.map(job => 
                job.jobId === jobId ? { ...job, returnedQuantity: isNaN(numQuantity) ? null : numQuantity } : job
            )
        );
    };

    const getStatusVariant = (status: JobStatus) => {
        if (status.startsWith('Completed') || status.startsWith('Returned')) return 'default';
        if (status.startsWith('In Progress') || status.startsWith('Awaiting')) return 'secondary';
        if (status.startsWith('To be prepared')) return 'outline';
        return 'outline';
    };

    const jobsToBeAssigned = useMemo(() => jobs.filter(j => j.status === 'To be assigned'), [jobs]);
    const jobsToBePrepared = useMemo(() => jobs.filter(j => j.status.startsWith('To be prepared')), [jobs]);
    const jobsInProgress = useMemo(() => jobs.filter(j => j.status.startsWith('In Progress') || j.status.startsWith('Awaiting')), [jobs]);
    const jobsCompleted = useMemo(() => jobs.filter(j => j.status.startsWith('Completed') || j.status.startsWith('Returned')), [jobs]);
    
    const renderJobsTable = (jobList: Job[], tab: 'assign' | 'prepare' | 'progress' | 'completed') => (
        <Table>
          <TableHeader>
            <TableRow>
              {(tab === 'prepare' || tab === 'progress') && <TableHead className='w-12'></TableHead>}
              <TableHead>Codice Articolo</TableHead>
              <TableHead>Prodotto</TableHead>
              <TableHead>Commessa</TableHead>
              <TableHead>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1">
                           Qtà da Lavorare <Info className="h-3 w-3" />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>La quantità disponibile dalla fase precedente</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
              </TableHead>
              {tab === 'completed' && <TableHead>Qtà Rientrata</TableHead>}
              <TableHead>Data Consegna</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assegnato a</TableHead>
              {tab === 'completed' && <TableHead>Data Rientro</TableHead>}
              {tab === 'completed' && <TableHead>Carico DDT</TableHead>}
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobList.length > 0 ? jobList.map((job) => (
                <React.Fragment key={job.jobId}>
                    <TableRow>
                        {(tab === 'prepare' || tab === 'progress') && (
                            <TableCell>
                                <Button variant="ghost" size="icon" onClick={() => setOpenJobId(prev => prev === job.jobId ? null : job.jobId)}>
                                    <ChevronRight className={`h-4 w-4 transition-transform ${openJobId === job.jobId ? 'rotate-90' : ''}`} />
                                </Button>
                            </TableCell>
                        )}
                        <TableCell className="font-medium">{job.sku}</TableCell>
                        <TableCell>{job.product}</TableCell>
                        <TableCell>{job.jobId}</TableCell>
                        <TableCell>{job.quantity}</TableCell>
                         {tab === 'completed' && 
                            <TableCell>
                                <Input 
                                    type="number" 
                                    value={job.returnedQuantity ?? ''}
                                    onChange={(e) => handleReturnedQuantityChange(job.jobId, e.target.value)}
                                    className='h-8 w-24'
                                />
                            </TableCell>
                        }
                        <TableCell>{job.deliveryDate}</TableCell>
                        <TableCell>{job.customer}</TableCell>
                        <TableCell>
                            <Badge variant={getStatusVariant(job.status)}>
                                {job.status}
                            </Badge>
                        </TableCell>
                        <TableCell>{job.supplier ?? job.assignedTo ?? 'N/A'}</TableCell>
                        {tab === 'completed' && <TableCell>{job.returnDate}</TableCell>}
                        {tab === 'completed' && <TableCell>
                                <Input 
                                    type="text" 
                                    defaultValue={job.ddtNumber ?? ''}
                                    onBlur={(e) => handleDdtChange(job.jobId, e.target.value)}
                                    className='h-8'
                                    placeholder='Inserisci DDT...'
                                    disabled={job.assignedTo === 'Internal'}
                                />
                            </TableCell>}
                        <TableCell className="text-right">
                            <div className='flex gap-2 justify-end'>
                            {tab === 'assign' && (
                                <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="outline" size="icon" onClick={() => openAssignDialog(job)}>
                                            <Send className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Assegna Lotto</p>
                                    </TooltipContent>
                                </Tooltip>
                                </TooltipProvider>
                            )}
                            {tab === 'prepare' && (
                                <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="outline" size="icon" onClick={() => openSheetDialog(job)}>
                                            <Printer className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Stampa Fabbisogni</p>
                                    </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="outline" size="icon" onClick={() => handleStartProduction(job.jobId)}>
                                            <Play className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Invia a Produzione</p>
                                    </TooltipContent>
                                </Tooltip>
                                </TooltipProvider>
                            )}
                            {(tab === 'progress') && (
                                 <TooltipProvider>
                                 <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="outline" size="icon" onClick={() => openSheetDialog(job)}>
                                            <Printer className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Stampa Scheda / DDT</p>
                                    </TooltipContent>
                                </Tooltip>
                                </TooltipProvider>
                            )}
                            {tab === 'progress' && (
                                <Button variant="default" size="sm" onClick={() => handleMarkAsComplete(job.jobId)}>
                                    <Check className="h-4 w-4 mr-2" />
                                    {job.assignedTo === 'Internal' ? 'Completa' : 'Marca Rientrato'}
                                </Button>
                            )}
                            {tab === 'completed' && !job.ddtNumber && job.assignedTo === 'External' && (
                                <span className='text-xs text-muted-foreground italic'>In attesa DDT...</span>
                            )}
                             {tab === 'completed' && (
                                <Button variant="ghost" size="icon">
                                    <Check className="h-4 w-4" />
                                </Button>
                            )}
                            </div>
                        </TableCell>
                    </TableRow>
                    {openJobId === job.jobId && (tab === 'prepare' || tab === 'progress') && (
                        <TableRow>
                            <TableCell colSpan={12} className='p-0 bg-muted/50'>
                                <div className='p-4'>
                                    <h4 className='font-semibold text-sm mb-2'>Materiali necessari da Distinta Base</h4>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Componente</TableHead>
                                                <TableHead>Qtà per Unità</TableHead>
                                                <TableHead>Unità</TableHead>
                                                <TableHead className='text-right'>Qtà Totale Richiesta</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {job.bom.components.map(comp => (
                                                <TableRow key={comp.name}>
                                                    <TableCell>{comp.name}</TableCell>
                                                    <TableCell>{comp.quantity}</TableCell>
                                                    <TableCell>{comp.unit}</TableCell>
                                                    <TableCell className='text-right font-medium'>{(comp.quantity * job.quantity).toLocaleString('it-IT')} {comp.unit}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </TableCell>
                        </TableRow>
                    )}
                </React.Fragment>
            )) : (
                <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                        Nessun lotto in questa sezione.
                    </TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
    );

  return (
    <Card className="h-full flex flex-col">
    <CardHeader>
      <CardTitle>Reparto Controllo Qualità</CardTitle>
      <CardDescription>Assegna e traccia i lotti per il controllo qualità.</CardDescription>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 pt-4">
          <KpiCard title="Lotti in Ritardo" value={kpiValues.lateJobs.toString()} icon={AlertTriangle} description="Lotti la cui consegna è scaduta" />
          <KpiCard title="Pezzi Lavorati (Oggi)" value={kpiValues.piecesCompletedToday.toLocaleString('it-IT')} icon={CheckCircle} description="Totale pezzi completati oggi" />
          <KpiCard title="Efficienza vs Scarti" value={`${kpiValues.efficiency.toFixed(1)}%`} icon={Percent} description="Rapporto tra pezzi rientrati e pezzi lavorati" />
          <KpiCard title="Pezzi Totali da Lavorare" value={kpiValues.totalToProcess.toLocaleString('it-IT')} icon={Package} description="Pezzi in attesa, da preparare e in lavorazione" />
      </div>
    </CardHeader>
    <CardContent className="overflow-auto">
      <Tabs defaultValue="assign">
          <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="assign">
                  <Send className="h-4 w-4 mr-2"/>
                  Da Assegnare ({jobsToBeAssigned.length})
              </TabsTrigger>
              <TabsTrigger value="prepare">
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Da Preparare ({jobsToBePrepared.length})
              </TabsTrigger>
              <TabsTrigger value="progress">
                  <Sparkles className="h-4 w-4 mr-2"/>
                  In Lavorazione / Attesa Rientro ({jobsInProgress.length})
              </TabsTrigger>
              <TabsTrigger value="completed">
                  <Check className="h-4 w-4 mr-2"/>
                  Completati / Rientrati ({jobsCompleted.length})
              </TabsTrigger>
          </TabsList>
          <TabsContent value="assign" className='mt-4'>
              {renderJobsTable(jobsToBeAssigned, 'assign')}
          </TabsContent>
          <TabsContent value="prepare" className='mt-4'>
              {renderJobsTable(jobsToBePrepared, 'prepare')}
          </TabsContent>
          <TabsContent value="progress" className='mt-4'>
              {renderJobsTable(jobsInProgress, 'progress')}
          </TabsContent>
          <TabsContent value="completed" className='mt-4'>
              {renderJobsTable(jobsCompleted, 'completed')}
          </TabsContent>
      </Tabs>
    </CardContent>
    {selectedJob && (
        <AssignJobDialog
            isOpen={dialogOpen}
            setIsOpen={setDialogOpen}
            job={selectedJob}
            onAssign={handleAssign}
            suppliers={suppliersData}
        />
    )}
     <SheetDialog job={selectedJob} isOpen={sheetDialogOpen} onOpenChange={setSheetDialogOpen} />
    </Card>
  );
}