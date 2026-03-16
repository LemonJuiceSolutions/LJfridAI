import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { ApexOptions } from 'apexcharts';
import Chart from 'react-apexcharts';

const SalesChart = () => {
  const options: ApexOptions = useMemo(
    () => ({
      series: [
        {
          name: 'Sales',
          data: [152, 109, 93, 113, 126, 161, 188, 143, 102, 113, 116, 124],
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
        opacity: 0.9,
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
        type: 'category',
        categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        axisBorder: {
          color: getCssVariable('--gridline-color'),
        },
        axisTicks: {
          color: getCssVariable('--gridline-color'),
        },
      },
      yaxis: {
        title: {
          text: 'Number of Sales',
          style: {
            fontSize: '11px',
            color: getCssVariable('--bs-secondary'),
          },
        },
        labels: {
          offsetX: 0,
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
      stroke: {
        width: 0,
      },
      dataLabels: {
        enabled: true,
        style: {
          fontSize: '10px',
        },
        offsetY: -27,
      },
      plotOptions: {
        bar: {
          columnWidth: '50%',
          borderRadius: 4,
          dataLabels: {
            position: 'top',
            orientation: 'vertical',
          },
        },
      },
    }),
    []
  );

  return <Chart options={options} series={options.series} type="bar" height={330} />;
};

export default React.memo(SalesChart);
