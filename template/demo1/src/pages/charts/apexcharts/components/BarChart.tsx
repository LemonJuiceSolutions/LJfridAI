import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { ApexOptions } from 'apexcharts';
import Chart from 'react-apexcharts';

const BarChart = () => {
  const options: ApexOptions = useMemo(
    () => ({
      series: [
        {
          name: 'sales',
          data: [30, 40, 45, 50, 49, 60, 70, 91, 125],
        },
      ],
      chart: {
        parentHeightOffset: 0,
        foreColor: getCssVariable('--bs-secondary'),
        toolbar: {
          show: false,
        },
        zoom: {
          enabled: false,
        },
      },
      colors: [getCssVariable('--bs-primary')],
      fill: {
        opacity: 1,
      },
      grid: {
        padding: {
          bottom: -4,
        },
        borderColor: getCssVariable('--gridline-color'),
        xaxis: {
          lines: {
            show: true,
          },
        },
      },
      xaxis: {
        type: 'datetime',
        categories: [
          '01/01/1991',
          '01/01/1992',
          '01/01/1993',
          '01/01/1994',
          '01/01/1995',
          '01/01/1996',
          '01/01/1997',
          '01/01/1998',
          '01/01/1999',
        ],
        axisBorder: {
          color: getCssVariable('--gridline-color'),
        },
        axisTicks: {
          color: getCssVariable('--gridline-color'),
        },
      },
      yaxis: {
        labels: {
          offsetX: 0,
        },
      },
      plotOptions: {
        bar: {
          borderRadius: 4,
        },
      },
    }),
    []
  );

  return <Chart options={options} series={options.series} type="bar" height={320} />;
};

export default React.memo(BarChart);
