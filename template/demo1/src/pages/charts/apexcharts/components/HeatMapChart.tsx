import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { ApexOptions } from 'apexcharts';
import Chart from 'react-apexcharts';

const HeatMapChart = () => {
  // Generating demo data for area chart
  const generateData = (count: number, yrange: { min: number; max: number }) => {
    let i = 0;
    const series = [];
    while (i < count) {
      const x = 'w' + (i + 1).toString();
      const y = Math.floor(Math.random() * (yrange.max - yrange.min + 1)) + yrange.min;

      series.push({
        x: x,
        y: y,
      });
      i++;
    }
    return series;
  };

  // Memoize the series data to prevent regeneration on every render
  const series = useMemo(
    () => [
      {
        name: 'Metric1',
        data: generateData(18, {
          min: 0,
          max: 90,
        }),
      },
      {
        name: 'Metric2',
        data: generateData(18, {
          min: 0,
          max: 90,
        }),
      },
      {
        name: 'Metric3',
        data: generateData(18, {
          min: 0,
          max: 90,
        }),
      },
      {
        name: 'Metric4',
        data: generateData(18, {
          min: 0,
          max: 90,
        }),
      },
      {
        name: 'Metric5',
        data: generateData(18, {
          min: 0,
          max: 90,
        }),
      },
      {
        name: 'Metric6',
        data: generateData(18, {
          min: 0,
          max: 90,
        }),
      },
      {
        name: 'Metric7',
        data: generateData(18, {
          min: 0,
          max: 90,
        }),
      },
      {
        name: 'Metric8',
        data: generateData(18, {
          min: 0,
          max: 90,
        }),
      },
      {
        name: 'Metric9',
        data: generateData(18, {
          min: 0,
          max: 90,
        }),
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
        background: 'transparent',
        toolbar: {
          show: false,
        },
      },
      colors: [getCssVariable('--bs-info')],
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
      dataLabels: {
        enabled: false,
      },
      stroke: {
        colors: [getCssVariable('--gridline-color')],
      },
      xaxis: {
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
      title: {
        text: 'HeatMap Chart (Single color)',
        align: 'center',
        style: {
          fontWeight: 'normal',
        },
      },
      plotOptions: {
        heatmap: {
          radius: 0,
        },
      },
      theme: {
        mode: 'light',
      },
    }),
    [series]
  );

  return <Chart options={options} series={options.series} type="heatmap" height={320} />;
};

export default React.memo(HeatMapChart);
