import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { ApexOptions } from 'apexcharts';
import Chart from 'react-apexcharts';

const AreaChart = () => {
  // Generating demo data for area chart
  const generateDayWiseTimeSeries = (s: number, count: number) => {
    const values = [
      [4, 3, 10, 9, 29, 19, 25, 9, 12, 7, 19, 5, 13, 9, 17, 2, 7, 5],
      [2, 3, 8, 7, 22, 16, 23, 7, 11, 5, 12, 5, 10, 4, 15, 2, 6, 2],
    ];
    let i = 0;
    const series: [number, number][] = [];
    let x = new Date().getTime();
    while (i < count) {
      series.push([x, values[s][i]]);
      x += 86400000;
      i++;
    }
    return series;
  };

  // Memoize the series data to prevent regeneration on every render
  const series = useMemo(
    () => [
      {
        name: 'Total Views',
        data: generateDayWiseTimeSeries(0, 18),
      },
      {
        name: 'Unique Views',
        data: generateDayWiseTimeSeries(1, 18),
      },
    ],
    []
  );

  // Memoize the options object to prevent recreation on every render
  const options: ApexOptions = useMemo(
    () => ({
      series,
      chart: {
        parentHeightOffset: 0,
        foreColor: getCssVariable('--bs-secondary'),
        toolbar: {
          show: false,
        },
        zoom: {
          enabled: false,
        },
        stacked: true,
      },
      colors: [getCssVariable('--bs-danger'), getCssVariable('--bs-info')],
      fill: {
        type: 'solid',
        opacity: [0.4, 0.25],
      },
      stroke: {
        curve: 'smooth',
        width: 3,
      },
      dataLabels: {
        enabled: false,
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
          text: 'Views',
        },
        // tickAmount: 4,
        min: 0,
        labels: {
          offsetX: 0,
        },
        tooltip: {
          enabled: true,
        },
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
      tooltip: {
        shared: true,
        x: {
          format: 'dd MMM yyyy',
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
    }),
    [series]
  );

  return <Chart options={options} series={options.series} type="area" height={320} />;
};

export default React.memo(AreaChart);
