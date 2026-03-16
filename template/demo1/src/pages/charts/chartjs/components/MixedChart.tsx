import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import {
  Chart as ChartJS,
  LinearScale,
  CategoryScale,
  BarElement,
  PointElement,
  LineElement,
  Legend,
  Tooltip,
  LineController,
  BarController,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';

ChartJS.register(
  LinearScale,
  CategoryScale,
  BarElement,
  PointElement,
  LineElement,
  Legend,
  Tooltip,
  LineController,
  BarController
);

const MixedChart = () => {
  const data = useMemo(
    () => ({
      labels: ['1900', '1950', '1999', '2050'],
      datasets: [
        {
          label: 'Europe',
          type: 'line' as const,
          borderColor: getCssVariable('--bs-danger'),
          backgroundColor: 'transparent',
          data: [408, 547, 675, 734],
          fill: false,
          pointBackgroundColor: getCssVariable('--bs-light'),
          pointHoverBackgroundColor: getCssVariable('--bs-light'),
          pointBorderColor: getCssVariable('--bs-danger'),
          pointHoverBorderColor: getCssVariable('--bs-danger'),
          pointBorderWidth: 2,
          pointHoverBorderWidth: 3,
          tension: 0.3,
        },
        {
          label: 'Africa',
          type: 'line' as const,
          borderColor: getCssVariable('--bs-primary'),
          backgroundColor: 'transparent',
          data: [133, 221, 783, 2478],
          fill: false,
          pointBackgroundColor: getCssVariable('--bs-light'),
          pointHoverBackgroundColor: getCssVariable('--bs-light'),
          pointBorderColor: getCssVariable('--bs-primary'),
          pointHoverBorderColor: getCssVariable('--bs-primary'),
          pointBorderWidth: 2,
          pointHoverBorderWidth: 3,
          tension: 0.3,
        },
        {
          label: 'Europe',
          type: 'bar' as const,
          backgroundColor: getCssVariable('--bs-danger'),
          hoverBackgroundColor: getCssVariable('--bs-danger'),
          borderColor: '',
          data: [408, 547, 675, 734],
        },
        {
          label: 'Africa',
          type: 'bar' as const,
          backgroundColor: getCssVariable('--bs-primary'),
          hoverBackgroundColor: getCssVariable('--bs-primary'),
          borderColor: '',
          data: [133, 221, 783, 2478],
        },
      ],
    }),
    []
  );

  const options = useMemo(
    () => ({
      responsive: true,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: getCssVariable('--bs-secondary'),
            font: {
              size: 13,
              family: getCssVariable('--bs-font-sans-serif'),
            },
          },
        },
      },
      scales: {
        x: {
          display: true,
          grid: {
            display: true,
            color: getCssVariable('--gridline-color'),
          },
          ticks: {
            color: getCssVariable('--bs-secondary'),
            font: {
              size: 12,
            },
          },
        },
        y: {
          grid: {
            display: true,
            color: getCssVariable('--gridline-color'),
          },
          ticks: {
            color: getCssVariable('--bs-secondary'),
            font: {
              size: 12,
            },
          },
        },
      },
    }),
    []
  );

  return <Chart type="bar" options={options} data={data} />;
};

export default React.memo(MixedChart);
