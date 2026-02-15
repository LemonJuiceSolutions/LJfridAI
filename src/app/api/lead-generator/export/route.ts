import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await db.user.findUnique({
            where: { email: session.user.email },
            include: { company: true },
        });

        if (!user?.company) {
            return NextResponse.json({ error: 'User not associated with a company' }, { status: 400 });
        }

        const { searchParams } = new URL(request.url);
        const searchId = searchParams.get('searchId');
        const format = searchParams.get('format') || 'csv';

        const where: any = { companyId: user.company.id };
        if (searchId) where.searchId = searchId;

        const leads = await db.lead.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });

        if (leads.length === 0) {
            return NextResponse.json({ error: 'Nessun lead trovato' }, { status: 404 });
        }

        if (format === 'excel') {
            // Use Python backend for Excel generation
            try {
                const excelData = leads.map(l => ({
                    'Nome': l.fullName || `${l.firstName || ''} ${l.lastName || ''}`.trim(),
                    'Ruolo': l.jobTitle || '',
                    'Email': l.email || '',
                    'Telefono': l.phone || '',
                    'LinkedIn': l.linkedinUrl || '',
                    'Azienda': l.companyName || '',
                    'Settore': l.companyIndustry || '',
                    'Città': l.companyCity || '',
                    'Paese': l.companyCountry || '',
                    'Sito Web': l.companyWebsite || '',
                    'Fonte': l.source || '',
                }));

                const pyResponse = await fetch('http://localhost:5005/download-excel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: excelData }),
                });

                if (!pyResponse.ok) {
                    throw new Error('Python backend error');
                }

                const buffer = await pyResponse.arrayBuffer();
                return new NextResponse(buffer, {
                    headers: {
                        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().split('T')[0]}.xlsx"`,
                    },
                });
            } catch {
                return NextResponse.json({ error: 'Errore generazione Excel. Verifica che il Python backend sia in esecuzione.' }, { status: 500 });
            }
        }

        // CSV format
        const headers = ['Nome', 'Ruolo', 'Email', 'Telefono', 'LinkedIn', 'Azienda', 'Settore', 'Città', 'Paese', 'Sito Web', 'Fonte'];
        const rows = leads.map(l => [
            l.fullName || `${l.firstName || ''} ${l.lastName || ''}`.trim(),
            l.jobTitle || '', l.email || '', l.phone || '', l.linkedinUrl || '',
            l.companyName || '', l.companyIndustry || '', l.companyCity || '',
            l.companyCountry || '', l.companyWebsite || '', l.source || '',
        ].map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','));

        const csv = [headers.join(','), ...rows].join('\n');

        return new NextResponse(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().split('T')[0]}.csv"`,
            },
        });
    } catch (error: any) {
        console.error('Error exporting leads:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
