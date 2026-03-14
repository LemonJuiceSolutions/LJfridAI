import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { ApexOptions } from 'apexcharts';
import Chart from 'react-apexcharts';

const RadarChart = () => {
  const options: ApexOptions = useMemo(
    () => ({
      series: [
        {
          name: 'Series 1',
          data: [80, 50, 30, 40, 100, 20],
        },
        {
          name: 'Series 2',
          data: [20, 30, 40, 80, 20, 80],
        },
        {
          name: 'Series 3',
          data: [44, 76, 78, 13, 43, 10],
        },
      ],
      chart: {
        parentHeightOffset: 0,
        foreColor: getCssVariable('--bs-secondary'),
        toolbar: {
          show: false,
        },
      },
      colors: [getCssVariable('--bs-primary'), getCssVariable('--bs-warning'), getCssVariable('--bs-danger')],
      grid: {
        padding: {
          bottom: -6,
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
      labels: ['2011', '2012', '2013', '2014', '2015', '2016'],
      stroke: {
        width: 0,
      },
      fill: {
        opacity: 0.75,
      },
      xaxis: {
        categories: ['April', 'May', 'June', 'July', 'August', 'September'],
        labels: {
          show: true,
          style: {
            colors: [
              getCssVariable('--bs-secondary'),
              getCssVariable('--bs-secondary'),
              getCssVariable('--bs-secondary'),
              getCssVariable('--bs-secondary'),
              getCssVariable('--bs-secondary'),
              getCssVariable('--bs-secondary'),
            ],
            fontSize: '14px',
          },
        },
      },
      yaxis: {
        labels: {
          show: true,
          style: {
            colors: getCssVariable('--bs-secondary'),
            fontSize: '11px',
          },
        },
      },
      markers: {
        size: 0,
      },
      plotOptions: {
        radar: {
          polygons: {
            strokeColors: getCssVariable('--gridline-color'),
            strokeWidth: '1',
            connectorColors: getCssVariable('--gridline-color'),
            fill: {
              colors: ['transparent'],
            },
          },
        },
      },
    }),
    []
  );

  return <Chart options={options} series={options.series} type="radar" height={320} />;
};

export default React.memo(RadarChart);
