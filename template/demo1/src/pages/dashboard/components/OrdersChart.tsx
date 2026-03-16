import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { ApexOptions } from 'apexcharts';
import Chart from 'react-apexcharts';

const OrdersChart = () => {
  const options: ApexOptions = useMemo(
    () => ({
      series: [
        {
          name: '',
          data: [36, 77, 52, 90, 74, 35, 55, 23, 47, 10, 63],
        },
      ],
      chart: {
        sparkline: {
          enabled: !0,
        },
      },
      colors: [getCssVariable('--bs-primary')],
      plotOptions: {
        bar: {
          borderRadius: 2,
          columnWidth: '60%',
        },
      },
      xaxis: {
        type: 'datetime',
        categories: [
          'Jan 01 2026',
          'Jan 02 2026',
          'Jan 03 2026',
          'Jan 04 2026',
          'Jan 05 2026',
          'Jan 06 2026',
          'Jan 07 2026',
          'Jan 08 2026',
          'Jan 09 2026',
          'Jan 10 2026',
          'Jan 11 2026',
        ],
      },
      yaxis: {
        min: 0,
        max: 90,
        tickAmount: 4,
        labels: {
          show: false,
        },
      },
    }),
    []
  );

  return <Chart options={options} series={options.series} type="bar" height={60} />;
};

export default React.memo(OrdersChart);
