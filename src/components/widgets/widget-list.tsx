'use client';

import React, { useState, useEffect } from 'react';
import { kpiData } from '@/lib/data';
import KpiCard from '@/components/dashboard/kpi-card';
import OverviewChart from '@/components/dashboard/overview-chart';
import RevenueByProductChart from '@/components/dashboard/revenue-by-product-chart';
import CapacityChart from '@/components/dashboard/capacity-chart';
import JobMarginAnalysis from '@/components/dashboard/job-margin-analysis';
import CostCenterAnalysisChart from '@/components/dashboard/cost-center-analysis';
import OrdersWidget from '@/components/widgets/orders/OrdersWidget';
import PlanningWidget from '@/components/widgets/planning/PlanningWidget';
import AcquistiWidget from './acquisti/AcquistiWidget';
import CuttingWidget from './cutting/CuttingWidget';
import SewingWidget from './sewing/SewingWidget';
import PrintingWidget from './printing/PrintingWidget';
import EmbroideryWidget from './embroidery/EmbroideryWidget';
import LavanderiaWidget from './lavanderia/LavanderiaWidget';
import StiroWidget from './stiro/StiroWidget';
import ControlloQualitaWidget from './controllo-qualita/ControlloQualitaWidget';
import PackagingWidget from './packaging/PackagingWidget';
import MagazzinoWidget from './magazzino/MagazzinoWidget';
import SetupWidget from './setup/SetupWidget';
import PipelinesWidget from './pipelines/PipelinesWidget';
import SqlTestTable from '../dashboard/sql-test-table';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import PipelineOutputWidget from './pipelines/PipelineOutputWidget';

export type Widget = {
    id: string;
    name: string;
    component: React.ReactNode;
};

// Static widgets that are always available
const staticWidgets: Record<string, Widget> = {
    'kpi-1': { id: 'kpi-1', component: <KpiCard {...kpiData[0]} />, name: 'KPI Fatturato' },
    'kpi-2': { id: 'kpi-2', component: <KpiCard {...kpiData[1]} />, name: 'KPI Budget' },
    'kpi-3': { id: 'kpi-3', component: <KpiCard {...kpiData[2]} />, name: 'KPI Forecast' },
    'kpi-4': { id: 'kpi-4', component: <KpiCard {...kpiData[3]} />, name: 'KPI Anno Prec.' },
    'overview': { id: 'overview', component: <OverviewChart />, name: 'Panoramica Fatturato' },
    'revenue-by-product': { id: 'revenue-by-product', component: <RevenueByProductChart />, name: 'Fatturato per Prodotto' },
    'capacity': { id: 'capacity', component: <CapacityChart />, name: 'Capacità Produttiva' },
    'cost-center': { id: 'cost-center', component: <CostCenterAnalysisChart />, name: 'Analisi Costi CDC' },
    'job-margin': { id: 'job-margin', component: <JobMarginAnalysis />, name: 'Analisi Marginalità' },
    'sql-test-table': { id: 'sql-test-table', component: <SqlTestTable />, name: 'SQL Test Table' },
    'orders': { id: 'orders', component: <OrdersWidget />, name: 'Gestione Ordini' },
    'planning': { id: 'planning', component: <PlanningWidget />, name: 'Pianificazione Produzione' },
    'acquisti': { id: 'acquisti', component: <AcquistiWidget />, name: 'Centrale Acquisti' },
    'cutting': { id: 'cutting', component: <CuttingWidget />, name: 'Reparto Taglio' },
    'sewing': { id: 'sewing', component: <SewingWidget />, name: 'Reparto Confezione' },
    'printing': { id: 'printing', component: <PrintingWidget />, name: 'Reparto Stampa' },
    'embroidery': { id: 'embroidery', component: <EmbroideryWidget />, name: 'Reparto Ricamo' },
    'lavanderia': { id: 'lavanderia', component: <LavanderiaWidget />, name: 'Reparto Lavanderia' },
    'stiro': { id: 'stiro', component: <StiroWidget />, name: 'Reparto Stiro' },
    'controllo-qualita': { id: 'controllo-qualita', component: <ControlloQualitaWidget />, name: 'Reparto Controllo Qualità' },
    'packaging': { id: 'packaging', component: <PackagingWidget />, name: 'Reparto Packaging' },
    'magazzino': { id: 'magazzino', component: <MagazzinoWidget />, name: 'Magazzino' },
    'setup': { id: 'setup', component: <SetupWidget />, name: 'Setup Connessioni' },
    'pipelines': { id: 'pipelines', component: <PipelinesWidget />, name: 'Pipeline ETL' },
};


export const useAvailableWidgets = () => {
    const [availableWidgets, setAvailableWidgets] = useState<Record<string, Widget>>(staticWidgets);
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const userSettingsRef = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return doc(firestore, 'tenants', user.uid, 'userSettings', user.uid);
    }, [user, firestore]);

    useEffect(() => {
        const fetchPipelineWidgets = async () => {
            if (!userSettingsRef || isUserLoading) return;
            
            try {
                const docSnap = await getDoc(userSettingsRef);
                const dynamicWidgets: Record<string, Widget> = {};

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const pipelinesData = data.pipelines || [];
                    const pipelines = Array.isArray(pipelinesData) ? pipelinesData : Object.values(pipelinesData);
                    
                    if (Array.isArray(pipelines)) {
                        pipelines.forEach((pipeline: any) => {
                            if (pipeline.nodes) {
                                Object.values(pipeline.nodes).forEach((node: any) => {
                                    if (node.type === 'end' && node.isPublished) {
                                        const widgetId = `pipeline-${pipeline.id}-${node.id}`;
                                        dynamicWidgets[widgetId] = {
                                            id: widgetId,
                                            name: node.name,
                                            component: <PipelineOutputWidget pipelineId={pipeline.id} nodeId={node.id} />,
                                        };
                                    }
                                });
                            }
                        });
                    }
                }
                setAvailableWidgets({ ...staticWidgets, ...dynamicWidgets });

            } catch (error) {
                console.error("Error fetching pipeline widgets:", error);
                setAvailableWidgets(staticWidgets);
            }
        };

        fetchPipelineWidgets();
    }, [userSettingsRef, isUserLoading]);

    return availableWidgets;
};

// You can export this if you have components that need the static list and cannot be hooks
export { staticWidgets };
