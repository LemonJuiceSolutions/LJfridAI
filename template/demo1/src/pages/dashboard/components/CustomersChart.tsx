import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { ApexOptions } from 'apexcharts';
import Chart from 'react-apexcharts';

const CustomersChart = () => {
  const options: ApexOptions = useMemo(
    () => ({
      series: [
        {
          name: '',
          data: [3844, 3855, 3841, 3867, 3822, 3843, 3821, 3841, 3856, 3827, 3843],
        },
      ],
      chart: {
        sparkline: {
          enabled: !0,
        },
      },
      colors: [getCssVariable('--bs-primary')],
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
        min: 3820,
        max: 3870,
        tickAmount: 4,
        labels: {
          show: false,
        },
      },
      stroke: {
        width: 2,
        curve: 'smooth',
      },
      markers: {
        size: 0,
      },
    }),
    []
  );

  return <Chart options={options} series={options.series} type="line" height={60} />;
};

export default React.memo(CustomersChart);
