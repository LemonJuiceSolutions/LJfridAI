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
import { jobMarginAnalysisData } from '@/lib/data';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';

export default function JobMarginAnalysis() {
    const getDeviation = (actual: number, budget: number) => {
        if (budget === 0 && actual === 0) return 0;
        if (budget === 0) return actual > 0 ? 100 : 0;
        return ((actual - budget) / budget) * 100;
    };

    const DeviationBadge = ({ deviation }: { deviation: number }) => {
        const isPositive = deviation < 0; // Good if actual is less than budget
        const isNeutral = Math.abs(deviation) < 0.1;
        const color = isNeutral ? 'bg-gray-500' : isPositive ? 'bg-green-500' : 'bg-red-500';
        const Icon = isNeutral ? Minus : isPositive ? TrendingDown : TrendingUp;

        return (
            <Badge className={cn('text-white whitespace-nowrap', color)}>
                <Icon className="h-3 w-3 mr-1" />
                {deviation.toFixed(1)}%
            </Badge>
        );
    };

    return (
        <Card className="h-full flex flex-col">
            <CardHeader>
                <CardTitle>Analisi Marginalità Commesse</CardTitle>
                <CardDescription>
                    Classifica delle commesse in base al margine e scostamento costi (consuntivo vs. budget).
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
                <ScrollArea className="h-full">
                    <Table>
                        <TableHeader className="sticky top-0 bg-card">
                            <TableRow>
                                <TableHead>Comessa</TableHead>
                                <TableHead>Prodotto</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead className="text-right">Margine</TableHead>
                                <TableHead className="text-center">Sct. Materiali</TableHead>
                                <TableHead className="text-center">Sct. Ore Lavoro</TableHead>
                                <TableHead className="text-center">Sct. Lavorazioni Esterne</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {jobMarginAnalysisData.map((job) => (
                                <TableRow key={job.jobId}>
                                    <TableCell className="font-medium">{job.jobId}</TableCell>
                                    <TableCell>{job.productName}</TableCell>
                                    <TableCell>{job.customer}</TableCell>
                                    <TableCell className={cn("text-right font-semibold", job.margin > 0 ? 'text-green-600' : 'text-red-600')}>
                                        {job.margin.toFixed(1)}%
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <DeviationBadge deviation={getDeviation(job.materials.actual, job.materials.budget)} />
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <DeviationBadge deviation={getDeviation(job.hours.actual, job.hours.budget)} />
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <DeviationBadge deviation={getDeviation(job.external.actual, job.external.budget)} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
