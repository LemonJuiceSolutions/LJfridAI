import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { ApexOptions } from 'apexcharts';
import Chart from 'react-apexcharts';

const LineChart = () => {
  const options: ApexOptions = useMemo(
    () => ({
      series: [
        {
          name: 'Data a',
          data: [45, 52, 38, 45],
        },
        {
          name: 'Data b',
          data: [12, 42, 68, 33],
        },
        {
          name: 'Data c',
          data: [8, 32, 48, 53],
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
      colors: [getCssVariable('--bs-primary'), getCssVariable('--bs-danger'), getCssVariable('--bs-warning')],
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
        categories: ['2015', '2016', '2017', '2018'],
        labels: {
          show: true,
        },
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
      markers: {
        size: 0,
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
      stroke: {
        width: 3,
        curve: 'smooth',
        lineCap: 'round',
      },
    }),
    []
  );

  return <Chart options={options} series={options.series} type="line" height={320} />;
};

export default React.memo(LineChart);
