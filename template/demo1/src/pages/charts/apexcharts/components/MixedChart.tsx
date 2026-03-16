import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { ApexOptions } from 'apexcharts';
import Chart from 'react-apexcharts';

const MixedChart = () => {
  const options: ApexOptions = useMemo(
    () => ({
      series: [
        {
          name: 'Team A',
          type: 'column',
          data: [23, 11, 22, 27, 13, 22, 37, 21, 44, 22, 30],
        },
        {
          name: 'Team B',
          type: 'area',
          data: [44, 55, 41, 67, 22, 43, 21, 41, 56, 27, 43],
        },
      ],
      chart: {
        stacked: false,
        parentHeightOffset: 0,
        foreColor: getCssVariable('--bs-secondary'),
        toolbar: {
          show: false,
        },
        zoom: {
          enabled: false,
        },
      },
      colors: [getCssVariable('--bs-danger'), getCssVariable('--bs-info')],
      grid: {
        borderColor: getCssVariable('--gridline-color'),
        padding: {
          bottom: -4,
        },
        xaxis: {
          lines: {
            show: true,
          },
        },
      },
      stroke: {
        width: [0, 3],
        curve: 'smooth',
      },
      plotOptions: {
        bar: {
          columnWidth: '50%',
        },
      },
      legend: {
        show: true,
        position: 'top',
        horizontalAlign: 'center',
        itemMargin: {
          horizontal: 8,
          vertical: 0,
        },
      },
      fill: {
        opacity: [0.75, 0.25],
      },
      labels: [
        '01/01/2003',
        '02/01/2003',
        '03/01/2003',
        '04/01/2003',
        '05/01/2003',
        '06/01/2003',
        '07/01/2003',
        '08/01/2003',
        '09/01/2003',
        '10/01/2003',
        '11/01/2003',
      ],
      markers: {
        size: 0,
      },
      xaxis: {
        type: 'datetime',
        axisBorder: {
          color: getCssVariable('--gridline-color'),
        },
        axisTicks: {
          color: getCssVariable('--gridline-color'),
        },
      },
      yaxis: {
        title: {
          text: 'Points',
        },
        labels: {
          offsetX: 0,
        },
      },
      tooltip: {
        shared: true,
        intersect: false,
        y: [
          {
            formatter: (y: number) => {
              if (typeof y !== 'undefined') {
                return y.toFixed(0) + ' points';
              }
              return y;
            },
          },
          {
            formatter: (y: number) => {
              if (typeof y !== 'undefined') {
                return y.toFixed(2) + ' $';
              }
              return y;
            },
          },
        ],
      },
    }),
    []
  );

  return <Chart options={options} series={options.series} type="line" height={320} />;
};

export default React.memo(MixedChart);
