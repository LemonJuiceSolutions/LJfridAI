import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { ApexOptions } from 'apexcharts';
import Chart from 'react-apexcharts';
import { getRevenueValues, getRevenueCategories } from '@/mock/revenueData';

const RevenueChart = () => {
  const options: ApexOptions = useMemo(
    () => ({
      series: [
        {
          name: 'Revenue',
          data: getRevenueValues(),
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
        categories: getRevenueCategories(),
        axisBorder: {
          color: getCssVariable('--gridline-color'),
        },
        axisTicks: {
          color: getCssVariable('--gridline-color'),
        },
        crosshairs: {
          stroke: {
            color: getCssVariable('--bs-secondary'),
          },
        },
      },
      yaxis: {
        min: -10,
        max: 70,
        title: {
          text: 'Revenue ( $1000 x )',
          style: {
            fontSize: '11px',
            color: getCssVariable('--bs-secondary'),
          },
        },
        tickAmount: 4,
        tooltip: {
          enabled: true,
        },
        crosshairs: {
          stroke: {
            color: getCssVariable('--bs-secondary'),
          },
        },
        labels: {
          offsetX: 0,
        },
      },
      markers: {
        size: 0,
      },
      stroke: {
        width: 2,
        curve: 'straight',
      },
    }),
    []
  );

  return <Chart options={options} series={options.series} type="line" height={400} />;
};

export default React.memo(RevenueChart);
