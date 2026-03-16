import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, Legend);

const AreaChart = () => {
  const data = useMemo(
    () => ({
      labels: [1500, 1600, 1700, 1750, 1800, 1850, 1900, 1950, 1999, 2050],
      datasets: [
        {
          data: [86, 114, 106, 106, 107, 111, 133, 221, 783, 2478],
          label: 'Africa',
          borderColor: getCssVariable('--bs-danger'),
          backgroundColor: `${getCssVariable('--bs-danger')}4D`,
          fill: true,
          pointBackgroundColor: getCssVariable('--bs-light'),
          pointHoverBackgroundColor: getCssVariable('--bs-light'),
          pointBorderColor: getCssVariable('--bs-danger'),
          pointHoverBorderColor: getCssVariable('--bs-danger'),
          pointBorderWidth: 2,
          pointHoverBorderWidth: 3,
          tension: 0.3,
        },
        {
          data: [282, 350, 411, 502, 635, 809, 947, 1402, 3700, 5267],
          label: 'Asia',
          borderColor: getCssVariable('--bs-info'),
          backgroundColor: `${getCssVariable('--bs-info')}4D`,
          fill: true,
          pointBackgroundColor: getCssVariable('--bs-light'),
          pointHoverBackgroundColor: getCssVariable('--bs-light'),
          pointBorderColor: getCssVariable('--bs-info'),
          pointHoverBorderColor: getCssVariable('--bs-info'),
          pointBorderWidth: 2,
          pointHoverBorderWidth: 3,
          tension: 0.3,
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

  return <Line options={options} data={data} />;
};

export default React.memo(AreaChart);
