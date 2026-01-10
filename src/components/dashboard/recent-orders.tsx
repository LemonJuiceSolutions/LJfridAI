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
import { recentOrdersData } from '@/lib/data';

export default function RecentOrders() {
    const getStatusVariant = (status: string) => {
        switch (status) {
            case 'Shipped':
            case 'Delivered':
                return 'default';
            case 'Processing':
                return 'secondary';
            case 'Cancelled':
                return 'destructive';
            default:
                return 'outline';
        }
    };
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>Ordini Recenti</CardTitle>
                <CardDescription>Una panoramica degli ordini cliente più recenti.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Ordine</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Data</TableHead>
                            <TableHead>Stato</TableHead>
                            <TableHead className="text-right">Totale</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {recentOrdersData.map((order) => (
                            <TableRow key={order.order}>
                                <TableCell className="font-medium">{order.order}</TableCell>
                                <TableCell>{order.customer}</TableCell>
                                <TableCell>{order.date}</TableCell>
                                <TableCell>
                                    <Badge variant={getStatusVariant(order.status)}>{order.status}</Badge>
                                </TableCell>
                                <TableCell className="text-right">{order.total}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
