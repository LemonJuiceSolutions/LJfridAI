'use client';

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
import { mockSalesData } from '@/lib/data';
import { ScrollArea } from '../ui/scroll-area';

export default function SqlTestTable() {
    return (
        <Card className="h-full flex flex-col">
            <CardHeader>
                <CardTitle>SQL Test Table</CardTitle>
                <CardDescription>
                    A static table of raw sales data for pipeline testing.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
                <ScrollArea className="h-full">
                    <Table>
                        <TableHeader className="sticky top-0 bg-card">
                            <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead>Sales</TableHead>
                                <TableHead>Month</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {mockSalesData.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell>{item.id}</TableCell>
                                    <TableCell>{item.product}</TableCell>
                                    <TableCell>{item.sales}</TableCell>
                                    <TableCell>{item.month}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
