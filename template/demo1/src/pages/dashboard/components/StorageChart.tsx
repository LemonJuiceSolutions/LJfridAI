import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { ApexOptions } from 'apexcharts';
import Chart from 'react-apexcharts';

const StorageChart = () => {
  const options: ApexOptions = useMemo(
    () => ({
      series: [67],
      chart: {},
      colors: [getCssVariable('--bs-primary')],
      plotOptions: {
        radialBar: {
          hollow: {
            margin: 15,
            size: '70%',
          },
          track: {
            show: true,
            background: getCssVariable('--gridline-color'),
            strokeWidth: '100%',
            opacity: 1,
            margin: 5,
          },
          dataLabels: {
            show: true,
            name: {
              offsetY: -8,
              show: true,
              color: getCssVariable('--bs-secondary'),
              fontSize: '13px',
            },
            value: {
              color: getCssVariable('--bs-secondary'),
              fontSize: '30px',
              show: true,
            },
          },
        },
      },
      fill: {
        opacity: 1,
      },
      stroke: {
        lineCap: 'round',
      },
      labels: ['Storage Used'],
    }),
    []
  );

  return <Chart options={options} series={options.series} type="radialBar" height={260} />;
};

export default React.memo(StorageChart);
