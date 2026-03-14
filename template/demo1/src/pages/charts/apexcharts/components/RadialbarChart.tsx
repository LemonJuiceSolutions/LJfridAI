import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { ApexOptions } from 'apexcharts';
import Chart from 'react-apexcharts';

const RadialbarChart = () => {
  const options: ApexOptions = useMemo(
    () => ({
      series: [44, 55, 67, 83],
      chart: {
        height: 300,
        type: 'radialBar',
        parentHeightOffset: 0,
        foreColor: getCssVariable('--bs-secondary'),
        toolbar: {
          show: false,
        },
      },
      colors: [
        getCssVariable('--bs-primary'),
        getCssVariable('--bs-warning'),
        getCssVariable('--bs-danger'),
        getCssVariable('--bs-info'),
      ],
      grid: {
        padding: {
          top: 10,
        },
      },
      plotOptions: {
        radialBar: {
          dataLabels: {
            total: {
              show: true,
              label: 'TOTAL',
              fontSize: '14px',
            },
          },
          track: {
            background: getCssVariable('--gridline-color'),
            strokeWidth: '100%',
            opacity: 1,
            margin: 5,
          },
        },
      },
      labels: ['Apples', 'Oranges', 'Bananas', 'Berries'],
      legend: {
        show: true,
        position: 'top',
        horizontalAlign: 'center',
        itemMargin: {
          horizontal: 8,
          vertical: 0,
        },
      },
    }),
    []
  );

  return <Chart options={options} series={options.series} type="radialBar" height={280} />;
};

export default React.memo(RadialbarChart);
