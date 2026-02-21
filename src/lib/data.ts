import { LayoutGrid, ShoppingCart, Calendar, Truck, Scissors, Brush, Shirt, PencilRuler, Wind, Droplets, Sparkles, Package, Boxes, Settings, Plug, GitCommitHorizontal, RefreshCw, Compass } from 'lucide-react';

export const navItems = [
    { href: '/xbrl-analysis', icon: 'FileSpreadsheet', label: 'Analisi XBRL' },
];

export const settingsNavItems = [
    { href: '/scheduler', icon: 'Clock', label: 'Scheduler' },
    { href: '/settings/navigation', icon: 'Compass', label: 'Navigation' },
    { href: '/settings', icon: 'Settings', label: 'Settings' }
];


const ytdRevenue = 42000 + 45000 + 51000 + 48000 + 55000;
const ytdBudget = 40000 + 46000 + 50000 + 52000 + 54000;
const yearForecast = 688000;
const prevYearRevenue = 650000;

export const kpiData = [
    { title: 'Fatturato Reale (YTD)', value: `€${(ytdRevenue / 1000).toFixed(0)}k`, change: `${((ytdRevenue - ytdBudget) / ytdBudget * 100).toFixed(1)}%`, period: 'vs Budget YTD' },
    { title: 'Budget (YTD)', value: `€${(ytdBudget / 1000).toFixed(0)}k`, change: '', period: '' },
    { title: 'Forecast (Anno)', value: `€${(yearForecast / 1000).toFixed(0)}k`, change: `${((yearForecast - prevYearRevenue) / prevYearRevenue * 100).toFixed(1)}%`, period: 'vs Anno Precedente' },
    { title: 'Fatturato Anno Prec.', value: `€${(prevYearRevenue / 1000).toFixed(0)}k`, change: '', period: '' },
];

export const overviewChartData = [
    { name: 'Gen', revenueActual: 42000, budget: 40000, forecast: 42000, intake: 45000 },
    { name: 'Feb', revenueActual: 45000, budget: 46000, forecast: 44000, intake: 48000 },
    { name: 'Mar', revenueActual: 51000, budget: 50000, forecast: 52000, intake: 55000 },
    { name: 'Apr', revenueActual: 48000, budget: 52000, forecast: 50000, intake: 51000 },
    { name: 'Mag', revenueActual: 55000, budget: 54000, forecast: 56000, intake: 58000 },
    { name: 'Giu', revenueActual: null, budget: 58000, forecast: 60000, intake: 62000 },
    { name: 'Lug', revenueActual: null, budget: 62000, forecast: 65000, intake: 66000 },
    { name: 'Ago', revenueActual: null, budget: 60000, forecast: 63000, intake: 60000 },
    { name: 'Set', revenueActual: null, budget: 65000, forecast: 68000, intake: 70000 },
    { name: 'Ott', revenueActual: null, budget: 70000, forecast: 72000, intake: 75000 },
    { name: 'Nov', revenueActual: null, budget: 75000, forecast: 78000, intake: 80000 },
    { name: 'Dic', revenueActual: null, budget: 80000, forecast: 88000, intake: 85000 },
];

export const revenueByProductData = [
    { name: 'T-Shirts', revenue: 110000 },
    { name: 'Jeans', revenue: 95000 },
    { name: 'Abiti', revenue: 82000 },
    { name: 'Cinture', revenue: 45000 },
    { name: 'Sciarpe', revenue: 35000 },
];

const minutesPerDay = 8 * 60;
const workingDays = {
    'Gen': 22, 'Feb': 20, 'Mar': 22, 'Apr': 20, 'Mag': 22, 'Giu': 21,
    'Lug': 22, 'Ago': 15, 'Set': 21, 'Ott': 22, 'Nov': 21, 'Dic': 18
};

const calculateCapacity = (employees: number, month: keyof typeof workingDays) => {
    return employees * workingDays[month] * minutesPerDay;
};

export const capacityChartData = [
    { name: 'Gen', employees: 20, capacityUsed: 160000, capacityPlanned: 170000, capacityContract: calculateCapacity(20, 'Gen') },
    { name: 'Feb', employees: 20, capacityUsed: 155000, capacityPlanned: 160000, capacityContract: calculateCapacity(20, 'Feb') },
    { name: 'Mar', employees: 21, capacityUsed: 175000, capacityPlanned: 180000, capacityContract: calculateCapacity(21, 'Mar') }, // New hire
    { name: 'Apr', employees: 21, capacityUsed: 168000, capacityPlanned: 170000, capacityContract: calculateCapacity(21, 'Apr') },
    { name: 'Mag', employees: 21, capacityUsed: 182000, capacityPlanned: 180000, capacityContract: calculateCapacity(21, 'Mag') }, // Over capacity
    { name: 'Giu', employees: 22, capacityUsed: null, capacityPlanned: 185000, capacityContract: calculateCapacity(22, 'Giu') }, // New hire
    { name: 'Lug', employees: 22, capacityUsed: null, capacityPlanned: 180000, capacityContract: calculateCapacity(22, 'Lug') },
    { name: 'Ago', employees: 22, capacityUsed: null, capacityPlanned: 110000, capacityContract: calculateCapacity(22, 'Ago') }, // Holidays
    { name: 'Set', employees: 21, capacityUsed: null, capacityPlanned: 175000, capacityContract: calculateCapacity(21, 'Set') }, // Employee left
    { name: 'Ott', employees: 21, capacityUsed: null, capacityPlanned: 180000, capacityContract: calculateCapacity(21, 'Ott') },
    { name: 'Nov', employees: 21, capacityUsed: null, capacityPlanned: 182000, capacityContract: calculateCapacity(21, 'Nov') },
    { name: 'Dic', employees: 21, capacityUsed: null, capacityPlanned: 140000, capacityContract: calculateCapacity(21, 'Dic') }, // Holidays
];

export const recentOrdersData = [
    { order: '#3210', customer: 'Olivia Martin', date: 'Feb 20, 2024', status: 'Shipped', total: '$42.50' },
    { order: '#3209', customer: 'Ava Johnson', date: 'Feb 18, 2024', status: 'Processing', total: '$75.00' },
    { order: '#3208', customer: 'Liam Smith', date: 'Feb 15, 2024', status: 'Shipped', total: '$120.00' },
    { order: '#3207', customer: 'Noah Williams', date: 'Feb 14, 2024', status: 'Delivered', total: '$250.00' },
    { order: '#3206', customer: 'Emma Brown', date: 'Feb 12, 2024', status: 'Cancelled', total: '$55.00' },
];

export const bomData = [
    { id: 'BOM001', name: 'Men\'s Classic T-Shirt', variants: 12, created: '2023-01-15' },
    { id: 'BOM002', name: 'Women\'s Skinny Jeans', variants: 18, created: '2023-02-20' },
    { id: 'BOM003', name: 'Summer Floral Dress', variants: 15, created: '2023-03-10' },
    { id: 'BOM004', name: 'Men\'s Leather Belt', variants: 3, created: '2023-04-05' },
    { id: 'BOM005', name: 'Silk Scarf', variants: 6, created: '2023-05-21' },
    { id: 'BOM006', name: 'Wool Sweater', variants: 8, created: '2023-06-01' },
];

export const materialsData = [
    { id: 'MAT001', name: 'Cotton Fabric', supplier: 'Fabricorp', stock: 1500, unit: 'meters' },
    { id: 'MAT002', name: 'Denim Fabric', supplier: 'Denim Dreams', stock: 800, unit: 'meters' },
    { id: 'MAT003', name: 'Polyester Thread', supplier: 'Threads Inc.', stock: 20000, unit: 'meters' },
    { id: 'MAT004', name: 'Zipper', supplier: 'Global Fasteners', stock: 5000, unit: 'piece' },
    { id: 'MAT005', name: 'Leather Strip', supplier: 'Fine Hides Co.', stock: 200, unit: 'meters' },
    { id: 'MAT006', name: 'Wool, Merino', supplier: 'Wooly World', stock: 300, unit: 'kg' },
    { id: 'MAT007', name: 'Button', supplier: 'Global Fasteners', stock: 10000, unit: 'piece' },
    { id: 'MAT008', name: 'Neck Label', supplier: 'LabelMakers', stock: 10000, unit: 'piece' },
    { id: 'MAT009', name: 'Rivets', supplier: 'Global Fasteners', stock: 10000, unit: 'pieces' },
    { id: 'MAT010', name: 'Viscose Fabric, Floral', supplier: 'Fabricorp', stock: 500, unit: 'meters' },
    { id: 'MAT011', name: 'Lining Fabric', supplier: 'Fabricorp', stock: 1000, unit: 'meters' },
    { id: 'MAT012', name: 'Invisible Zipper', supplier: 'Global Fasteners', stock: 2000, unit: 'piece' },
    { id: 'MAT013', name: 'Thread', supplier: 'Threads Inc.', stock: 50000, unit: 'meters' },
    { id: 'MAT014', name: 'Buckle', supplier: 'Global Fasteners', stock: 1000, unit: 'piece' },
    { id: 'MAT015', name: 'Silk Fabric', supplier: 'Fine Fabrics', stock: 100, unit: 'sq. meter' },
];

export const inventoryData = [
    { sku: 'TS-M-BLK-L', product: 'Men\'s Classic T-Shirt', color: 'Black', size: 'L', stock: 150, location: 'A-12-3' },
    { sku: 'JN-W-BLU-28', product: 'Women\'s Skinny Jeans', color: 'Blue', size: '28', stock: 75, location: 'B-04-1' },
    { sku: 'DR-S-FLO-M', product: 'Summer Floral Dress', color: 'Floral', size: 'M', stock: 45, location: 'A-08-5' },
    { sku: 'TS-M-WHT-L', product: 'Men\'s Classic T-Shirt', color: 'White', size: 'L', stock: 200, location: 'A-12-4' },
    { sku: 'JN-W-BLK-30', product: 'Women\'s Skinny Jeans', color: 'Black', size: '30', stock: 60, location: 'B-05-2' },
    { sku: 'SW-U-GRY-M', product: 'Wool Sweater', color: 'Grey', size: 'M', stock: 80, location: 'C-01-1' },
    { sku: 'TS-M-BLU-M', product: 'Men\'s Classic T-Shirt', color: 'Blue', size: 'M', stock: 120, location: 'A-12-5' },
    { sku: 'DR-S-FLO-S', product: 'Summer Floral Dress', color: 'Floral', size: 'S', stock: 30, location: 'A-08-6' },
];

const tShirtBom = {
    components: [
        { name: 'Cotton Fabric', quantity: 1.5, unit: 'meters' },
        { name: 'Polyester Thread', quantity: 50, unit: 'meters' },
        { name: 'Neck Label', quantity: 1, unit: 'piece' },
    ],
    phases: [
        { name: 'Cutting', duration: '20 min' },
        { name: 'Sewing', duration: '45 min' },
        { name: 'Finishing', duration: '15 min' },
    ]
};

const jeansBom = {
    components: [
        { name: 'Denim Fabric', quantity: 2, unit: 'meters' },
        { name: 'Polyester Thread', quantity: 100, unit: 'meters' },
        { name: 'Zipper', quantity: 1, unit: 'piece' },
        { name: 'Button', quantity: 1, unit: 'piece' },
        { name: 'Rivets', quantity: 5, unit: 'pieces' },
    ],
    phases: [
        { name: 'Cutting', duration: '30 min' },
        { name: 'Sewing', duration: '90 min' },
        { name: 'Washing', duration: '60 min' },
        { name: 'Finishing', duration: '25 min' },
    ]
};

const dressBom = {
    components: [
        { name: 'Viscose Fabric, Floral', quantity: 3, unit: 'meters' },
        { name: 'Lining Fabric', quantity: 2.5, unit: 'meters' },
        { name: 'Invisible Zipper', quantity: 1, unit: 'piece' },
        { name: 'Thread', quantity: 150, unit: 'meters' },
    ],
    phases: [
        { name: 'Cutting', duration: '45 min' },
        { name: 'Sewing', duration: '120 min' },
        { name: 'Finishing', duration: '30 min' },
    ]
};

const beltBom = {
    components: [
        { name: 'Leather Strip', quantity: 1.2, unit: 'meters' },
        { name: 'Buckle', quantity: 1, unit: 'piece' },
        { name: 'Thread', quantity: 10, unit: 'meters' },
    ],
    phases: [
        { name: 'Cutting', duration: '15 min' },
        { name: 'Stitching', duration: '25 min' },
        { name: 'Finishing', duration: '10 min' },
    ]
};

const scarfBom = {
    components: [
        { name: 'Silk Fabric', quantity: 1, unit: 'sq. meter' },
        { name: 'Thread', quantity: 20, unit: 'meters' },
    ],
    phases: [
        { name: 'Cutting', duration: '10 min' },
        { name: 'Hemming', duration: '30 min' },
        { name: 'Pressing', duration: '10 min' },
    ]
};

export const productionStages = [
    'Pending',
    'Planning',
    'Procurement',
    'Cutting',
    'Sewing',
    'Printing',
    'Embroidery',
    'Lavanderia',
    'Stiro',
    'Finishing',
    'Controllo Qualità',
    'Packaging',
    'Magazzino',
    'Shipped'
];

const generateStages = (status: string, quantity: number) => {
    const currentIndex = productionStages.indexOf(status);
    let stages = productionStages.map((stageName, index) => {
        let stageQuantity: number | null = null;

        if (index <= currentIndex) {
            stageQuantity = quantity - Math.floor(index * 2);
        }

        // Specific logic to create discrepancies
        if (stageName === 'Procurement' && index <= currentIndex) {
            stageQuantity = quantity - 2; // Simulate a fixed procurement discrepancy
        }

        if (stageName === 'Sewing' && status === 'Finishing') {
            stageQuantity = quantity - 10; // Simulate drop-off at sewing
        }

        if (status === 'Pending' || (status === 'Planning' && stageName !== 'Planning')) {
            stageQuantity = null;
        }
        if (status === 'Planning' && stageName === 'Planning') {
            stageQuantity = quantity;
        }

        if (status === 'Shipped') {
            stageQuantity = quantity - 15 - (index * 2);
        }

        return { name: stageName, quantity: stageQuantity };
    });

    if (status === 'Pending') {
        stages = productionStages.map(stageName => ({ name: stageName, quantity: null }));
    }

    return stages;
};

export const customerOrdersData = [
    {
        id: 'ORD5001', customer: 'Modern Apparel', date: '2024-05-10', items: 2, total: 6250,
        lines: [
            { jobId: 'JOB7001', product: 'Men\'s Classic T-Shirt', sku: 'TS-M-BLK-L', quantity: 100, price: 25, color: 'Black', size: 'L', status: 'Sewing', bom: tShirtBom, stages: generateStages('Sewing', 100), imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwxfHx0JTIwc2hpcnR8ZW58MHx8fHwxNzYzMjAwMTg5fDA&ixlib=rb-4.1.0&q=80&w=1080' },
            { jobId: 'JOB7002', product: 'Men\'s Classic T-Shirt', sku: 'TS-M-WHT-L', quantity: 150, price: 25, color: 'White', size: 'L', status: 'Cutting', bom: tShirtBom, stages: generateStages('Cutting', 150), imageUrl: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwyfHx0JTIwc2hpcnR8ZW58MHx8fHwxNzYzMjAwMTg5fDA&ixlib=rb-4.1.0&q=80&w=1080' },
        ]
    },
    {
        id: 'ORD5002', customer: 'Chic Boutique', date: '2024-05-12', items: 1, total: 3000,
        lines: [
            { jobId: 'JOB7003', product: 'Women\'s Skinny Jeans', sku: 'JN-W-BLU-28', quantity: 50, price: 60, color: 'Blue', size: '28', status: 'Finishing', bom: jeansBom, stages: generateStages('Finishing', 50), imageUrl: 'https://images.unsplash.com/photo-1604176354204-9268737828e4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwxfHxqZWFuc3xlbnwwfHx8fDE3NjMyMDAyMDZ8MA&ixlib=rb-4.1.0&q=80&w=1080' },
        ]
    },
    {
        id: 'ORD5003', customer: 'The Style Hub', date: '2024-05-15', items: 2, total: 20000,
        lines: [
            { jobId: 'JOB7004', product: 'Summer Floral Dress', sku: 'DR-S-FLO-M', quantity: 200, price: 75, color: 'Floral', size: 'M', status: 'Procurement', bom: dressBom, stages: generateStages('Procurement', 200), imageUrl: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwxfHxkcmVzc3xlbnwwfHx8fDE3NjMyMDAyMjR8MA&ixlib=rb-4.1.0&q=80&w=1080' },
            { jobId: 'JOB7007', product: 'Men\'s Classic T-Shirt', sku: 'TS-M-BLU-M', quantity: 100, price: 25, color: 'Blue', size: 'M', status: 'Pending', bom: tShirtBom, stages: generateStages('Pending', 100), imageUrl: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwzfHx0JTIwc2hpcnR8ZW58MHx8fHwxNzYzMjAwMTg5fDA&ixlib=rb-4.1.0&q=80&w=1080' },

        ]
    },
    {
        id: 'ORD5004', customer: 'Urban Threads', date: '2024-05-18', items: 1, total: 4000,
        lines: [
            { jobId: 'JOB7005', product: 'Men\'s Leather Belt', sku: 'BLT-M-BRN-32', quantity: 100, price: 40, color: 'Brown', size: '32', status: 'Controllo Qualità', bom: beltBom, stages: generateStages('Controllo Qualità', 100), imageUrl: 'https://images.unsplash.com/photo-1619085985207-6f1351111667?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwxfHxiZWx0fGVufDB8fHx8MTc2MzIwMDIzN3ww&ixlib=rb-4.1.0&q=80&w=1080' },
        ]
    },
    {
        id: 'ORD5005', customer: 'Classic Wear', date: '2024-05-20', items: 1, total: 1500,
        lines: [
            { jobId: 'JOB7006', product: 'Silk Scarf', sku: 'SCRF-U-MLT-OS', quantity: 50, price: 30, color: 'Multicolor', size: 'One Size', status: 'Shipped', bom: scarfBom, stages: generateStages('Shipped', 50), imageUrl: 'https://images.unsplash.com/photo-1529068133543-859b4d4a7c15?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwxfHxzY2FyZnxlbnwwfHx8fDE3NjMyMDAyNDZ8MA&ixlib=rb-4.1.0&q=80&w=1080' },
        ]
    },
    {
        id: 'ORD5006', customer: 'Modern Apparel', date: '2024-05-21', items: 2, total: 11500,
        lines: [
            { jobId: 'JOB7008', product: 'Women\'s Skinny Jeans', sku: 'JN-W-BLK-30', quantity: 150, price: 60, color: 'Black', size: '30', status: 'Cutting', bom: jeansBom, stages: generateStages('Cutting', 150), imageUrl: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwyfHxqZWFuc3xlbnwwfHx8fDE3NjMyMDAyMDZ8MA&ixlib=rb-4.1.0&q=80&w=1080' },
            { jobId: 'JOB7009', product: 'Men\'s Classic T-Shirt', sku: 'TS-M-GRN-XL', quantity: 100, price: 25, color: 'Green', size: 'XL', status: 'Cutting', bom: tShirtBom, stages: generateStages('Cutting', 100), imageUrl: 'https://images.unsplash.com/photo-1529374255404-311a2a4f1fd9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHw0fHx0JTIwc2hpcnR8ZW58MHx8fHwxNzYzMjAwMTg5fDA&ixlib=rb-4.1.0&q=80&w=1080' },
        ]
    },
    {
        id: 'ORD5007', customer: 'The Style Hub', date: '2024-05-22', items: 1, total: 9000,
        lines: [
            { jobId: 'JOB7010', product: 'Summer Floral Dress', sku: 'DR-S-FLO-S', quantity: 120, price: 75, color: 'Floral', size: 'S', status: 'Cutting', bom: dressBom, stages: generateStages('Cutting', 120), imageUrl: 'https://images.unsplash.com/photo-1589138653655-a223f63b2518?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwyfHxkcmVzc3xlbnwwfHx8fDE3NjMyMDAyMjR8MA&ixlib=rb-4.1.0&q=80&w=1080' },
        ]
    },
    {
        id: 'ORD5008', customer: 'Urban Threads', date: '2024-05-23', items: 2, total: 4750,
        lines: [
            { jobId: 'JOB7011', product: 'Men\'s Classic T-Shirt', sku: 'TS-M-RED-M', quantity: 50, price: 25, color: 'Red', size: 'M', status: 'Pending', bom: tShirtBom, stages: generateStages('Pending', 50), imageUrl: 'https://images.unsplash.com/photo-1581655353421-14b51838159b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHw1fHx0JTIwc2hpcnR8ZW58MHx8fHwxNzYzMjAwMTg5fDA&ixlib=rb-4.1.0&q=80&w=1080' },
            { jobId: 'JOB7012', product: 'Men\'s Leather Belt', sku: 'BLT-M-BLK-34', quantity: 50, price: 70, color: 'Black', size: '34', status: 'Cutting', bom: beltBom, stages: generateStages('Cutting', 50), imageUrl: 'https://images.unsplash.com/photo-1586737389658-1599638b3433?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwyfHxiZWx0fGVufDB8fHx8MTc2MzIwMDIzN3ww&ixlib=rb-4.1.0&q=80&w=1080' },
        ]
    },
    {
        id: 'ORD5009', customer: 'Chic Boutique', date: '2024-05-24', items: 1, total: 15000,
        lines: [
            { jobId: 'JOB7013', product: 'Summer Floral Dress', sku: 'DR-S-FLO-L', quantity: 200, price: 75, color: 'Floral', size: 'L', status: 'Pending', bom: dressBom, stages: generateStages('Pending', 200), imageUrl: 'https://images.unsplash.com/photo-1621331943963-b0818296c561?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwzfHxkcmVzc3xlbnwwfHx8fDE3NjMyMDAyMjR8MA&ixlib=rb-4.1.0&q=80&w=1080' },
        ]
    },
    {
        id: 'ORD5010', customer: 'Classic Wear', date: '2024-05-25', items: 2, total: 8500,
        lines: [
            { jobId: 'JOB7014', product: 'Women\'s Skinny Jeans', sku: 'JN-W-BLU-32', quantity: 100, price: 60, color: 'Blue', size: '32', status: 'Pending', bom: jeansBom, stages: generateStages('Pending', 100), imageUrl: 'https://images.unsplash.com/photo-1598554743714-c157a4563868?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwzfHxqZWFuc3xlbnwwfHx8fDE3NjMyMDAyMDZ8MA&ixlib=rb-4.1.0&q=80&w=1080' },
            { jobId: 'JOB7015', product: 'Silk Scarf', sku: 'SCRF-U-RED-OS', quantity: 50, price: 50, color: 'Red', size: 'One Size', status: 'Planning', bom: scarfBom, stages: generateStages('Planning', 50), imageUrl: 'https://images.unsplash.com/photo-1600244955149-10659695b28d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwyfHxzY2FyZnxlbnwwfHx8fDE3NjMyMDAyNDZ8MA&ixlib=rb-4.1.0&q=80&w=1080' },
        ]
    },
];

export const productionPlanData = [
    { id: 'PROD101', orderId: 'ORD5002', product: 'Women\'s Skinny Jeans', quantity: 200, stage: 'Cutting', startDate: '2024-05-25', endDate: '2024-05-26', status: 'In Progress' },
    { id: 'PROD102', orderId: 'ORD5004', product: 'Men\'s Classic T-Shirt', quantity: 1000, stage: 'Sewing', startDate: '2024-05-26', endDate: '2024-05-29', status: 'Not Started' },
    { id: 'PROD103', orderId: 'ORD5003', product: 'Summer Floral Dress', quantity: 500, stage: 'Finishing', startDate: '2024-05-28', endDate: '2024-05-30', status: 'Not Started' },
    { id: 'PROD104', orderId: 'ORD5001', product: 'Silk Scarf', quantity: 300, stage: 'Quality Control', startDate: '2024-05-29', endDate: '2024-05-29', status: 'Completed' },
];

export const suppliersData = [
    { id: 'SUP001', name: 'Fabricorp', leadTime: '14 days', minOrder: 500, rating: 4.8 },
    { id: 'SUP002', name: 'Denim Dreams', leadTime: '21 days', minOrder: 300, rating: 4.5 },
    { id: 'SUP003', name: 'Threads Inc.', leadTime: '7 days', minOrder: 1000, rating: 4.9 },
    { id: 'SUP004', name: 'Global Fasteners', leadTime: '10 days', minOrder: 2000, rating: 4.6 },
    { id: 'SUP005', name: 'Fine Hides Co.', leadTime: '30 days', minOrder: 100, rating: 4.7 },
    { id: 'SUP006', name: 'Wooly World', leadTime: '25 days', minOrder: 250, rating: 4.6 },
    { id: 'SUP007', name: 'LabelMakers', leadTime: '12 days', minOrder: 5000, rating: 4.9 },
    { id: 'SUP008', name: 'Fine Fabrics', leadTime: '20 days', minOrder: 100, rating: 4.8 },
];

export const jobMarginAnalysisData = [
    {
        jobId: 'JOB7001',
        productName: 'Men\'s T-Shirt',
        customer: 'Modern Apparel',
        margin: 18.5,
        materials: { budget: 1000, actual: 950 }, // Under budget
        hours: { budget: 120, actual: 125 },     // Over budget
        external: { budget: 200, actual: 200 },    // On budget
    },
    {
        jobId: 'JOB7003',
        productName: 'Women\'s Jeans',
        customer: 'Chic Boutique',
        margin: 15.2,
        materials: { budget: 1500, actual: 1550 }, // Over budget
        hours: { budget: 180, actual: 170 },     // Under budget
        external: { budget: 300, actual: 320 },    // Over budget
    },
    {
        jobId: 'JOB7004',
        productName: 'Summer Dress',
        customer: 'The Style Hub',
        margin: 12.8,
        materials: { budget: 2500, actual: 2650 }, // Over budget
        hours: { budget: 240, actual: 250 },     // Over budget
        external: { budget: 400, actual: 400 },    // On budget
    },
    {
        jobId: 'JOB7005',
        productName: 'Leather Belt',
        customer: 'Urban Threads',
        margin: -5.6,
        materials: { budget: 500, actual: 580 }, // Significantly over budget
        hours: { budget: 40, actual: 55 },      // Significantly over budget
        external: { budget: 50, actual: 70 },     // Over budget
    },
    {
        jobId: 'JOB7006',
        productName: 'Silk Scarf',
        customer: 'Classic Wear',
        margin: 25.0,
        materials: { budget: 300, actual: 280 }, // Under budget
        hours: { budget: 20, actual: 18 },      // Under budget
        external: { budget: 0, actual: 0 },       // On budget
    },
    {
        jobId: 'JOB7002',
        productName: 'Men\'s T-Shirt',
        customer: 'Modern Apparel',
        margin: 22.1,
        materials: { budget: 1500, actual: 1450 },
        hours: { budget: 180, actual: 175 },
        external: { budget: 300, actual: 300 },
    },
    {
        jobId: 'JOB7008',
        productName: 'Women\'s Jeans',
        customer: 'Modern Apparel',
        margin: -2.4,
        materials: { budget: 2200, actual: 2400 },
        hours: { budget: 250, actual: 260 },
        external: { budget: 450, actual: 480 },
    },
].sort((a, b) => b.margin - a.margin); // Sort by margin descending

export const costCenterData = [
    { month: 'Gen', budget: { materials: 20000, hours: 15000, external: 5000 }, actual: { materials: 21000, hours: 15500, external: 5200 } },
    { month: 'Feb', budget: { materials: 22000, hours: 16000, external: 5500 }, actual: { materials: 21500, hours: 16200, external: 5500 } },
    { month: 'Mar', budget: { materials: 25000, hours: 18000, external: 6000 }, actual: { materials: 26000, hours: 18500, external: 6100 } },
    { month: 'Apr', budget: { materials: 24000, hours: 17000, external: 5800 }, actual: { materials: 23500, hours: 17500, external: 6000 } },
    { month: 'Mag', budget: { materials: 26000, hours: 19000, external: 6200 }, actual: { materials: 27000, hours: 19500, external: 6300 } },
    { month: 'Giu', budget: { materials: 28000, hours: 20000, external: 6500 }, actual: { materials: null, hours: null, external: null } },
    { month: 'Lug', budget: { materials: 30000, hours: 21000, external: 7000 }, actual: { materials: null, hours: null, external: null } },
    { month: 'Ago', budget: { materials: 18000, hours: 12000, external: 4000 }, actual: { materials: null, hours: null, external: null } },
    { month: 'Set', budget: { materials: 28000, hours: 20000, external: 6500 }, actual: { materials: null, hours: null, external: null } },
    { month: 'Ott', budget: { materials: 32000, hours: 22000, external: 7500 }, actual: { materials: null, hours: null, external: null } },
    { month: 'Nov', budget: { materials: 35000, hours: 24000, external: 8000 }, actual: { materials: null, hours: null, external: null } },
    { month: 'Dic', budget: { materials: 25000, hours: 18000, external: 6000 }, actual: { materials: null, hours: null, external: null } },
];

export const mockPipelines = [
    {
        id: 'pipe_sales_analysis',
        name: 'Analisi Vendite per Prodotto',
        description: 'Estrae e aggrega i dati di vendita per prodotto.',
        nodes: {
            'start': { id: 'start', name: 'Start', icon: 'Play', type: 'start', schedule: { frequency: 'daily', time: '09:00' }, outputs: [{ name: 'Trigger', type: 'trigger' }] },
            'get-orders': { id: 'get-orders', name: 'Estrai Ordini (da mock)', icon: 'Database', iconColor: 'blue-500', script: 'SELECT * FROM customerOrdersData;', previewType: 'table', outputs: [{ name: 'Raw Order Data', type: 'table' }] },
            'group-by-product': { id: 'group-by-product', name: 'Raggruppa per Prodotto (SQL)', icon: 'Sigma', iconColor: 'green-500', script: 'SELECT product, SUM(quantity) as total_quantity FROM ? GROUP BY product;', outputs: [{ name: 'Grouped Data', type: 'table' }] },
            'end-table': { id: 'end-table', name: 'Tabella Risultati', icon: 'Table2', iconColor: 'purple-500', type: 'end', previewType: 'table', outputs: [] }
        },
        edges: [
            { from: 'start', to: 'get-orders', fromPort: 0 },
            { from: 'get-orders', to: 'group-by-product', fromPort: 0 },
            { from: 'group-by-product', to: 'end-table', fromPort: 0 },
        ]
    },
    {
        id: 'pipe_kpi_discount',
        name: 'Calcolo Sconto Medio',
        description: 'Calcola lo sconto medio applicato agli ordini.',
        nodes: {
            'start': { id: 'start', name: 'Start', icon: 'Play', type: 'start', schedule: { frequency: 'manual' }, outputs: [{ name: 'Trigger', type: 'trigger' }] },
            'get-discounts': { id: 'get-discounts', name: 'Estrai Sconti', icon: 'Database', iconColor: 'blue-500', script: 'SELECT discount_percentage FROM orders WHERE discount_percentage > 0;', outputs: [{ name: 'Discount List', type: 'table' }] },
            'calc-avg': { id: 'calc-avg', name: 'Calcola Media', icon: 'Sigma', iconColor: 'green-500', script: 'SELECT AVG(discount_percentage) as avg_discount FROM ?;', outputs: [{ name: 'Average Discount', type: 'variable' }] },
            'end-kpi': { id: 'end-kpi', name: 'KPI Sconto Medio', icon: 'Sigma', iconColor: 'yellow-500', type: 'end', previewType: 'kpi', outputs: [] }
        },
        edges: [
            { from: 'start', to: 'get-discounts', fromPort: 0 },
            { from: 'get-discounts', to: 'calc-avg', fromPort: 0 },
            { from: 'calc-avg', to: 'end-kpi', fromPort: 0 },
        ]
    },
    {
        id: 'pipe_chart_orders',
        name: 'Trend Ordini Mensili',
        description: 'Visualizza il numero di ordini per mese.',
        nodes: {
            'start': { id: 'start', name: 'Start', icon: 'Play', type: 'start', schedule: { frequency: 'weekly', dayOfWeek: '1', time: '02:00' }, outputs: [{ name: 'Trigger', type: 'trigger' }] },
            'get-orders-date': { id: 'get-orders-date', name: 'Estrai Ordini con Data', icon: 'Database', iconColor: 'blue-500', script: "SELECT STRFTIME('%Y-%m', order_date) as month, COUNT(id) as order_count FROM orders GROUP BY 1;", outputs: [{ name: 'Monthly Orders', type: 'table' }] },
            'end-chart': { id: 'end-chart', name: 'Grafico Trend', icon: 'BarChart2', iconColor: 'red-500', type: 'end', previewType: 'chart', outputs: [] }
        },
        edges: [
            { from: 'start', to: 'get-orders-date', fromPort: 0 },
            { from: 'get-orders-date', to: 'end-chart', fromPort: 0 },
        ]
    }
];

export const mockSalesData = [
    { id: 1, product: 'T-Shirt', sales: 150, month: 'January' },
    { id: 2, product: 'Jeans', sales: 250, month: 'January' },
    { id: 3, product: 'Jacket', sales: 80, month: 'January' },
    { id: 4, product: 'T-Shirt', sales: 200, month: 'February' },
    { id: 5, product: 'Jeans', sales: 300, month: 'February' },
    { id: 6, product: 'Jacket', sales: 120, month: 'February' },
    { id: 7, product: 'Scarf', sales: 500, month: 'February' },
];

