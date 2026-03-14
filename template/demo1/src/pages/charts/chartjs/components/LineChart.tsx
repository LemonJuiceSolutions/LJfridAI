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
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const LineChart = () => {
  const data = useMemo(
    () => ({
      labels: ['1991', '1992', '1993', '1994', '1995', '1996', '1997'],
      datasets: [
        {
          data: [45, 52, 38, 45, 50, 60, 55],
          label: 'Data a',
          borderColor: getCssVariable('--bs-primary'),
          backgroundColor: 'transparent',
          fill: true,
          pointBackgroundColor: getCssVariable('--bs-light'),
          pointHoverBackgroundColor: getCssVariable('--bs-light'),
          pointBorderColor: getCssVariable('--bs-primary'),
          pointHoverBorderColor: getCssVariable('--bs-primary'),
          pointBorderWidth: 2,
          pointHoverBorderWidth: 3,
          tension: 0.3,
        },
        {
          data: [12, 42, 68, 33, 40, 45, 48],
          label: 'Data b',
          borderColor: getCssVariable('--bs-danger'),
          backgroundColor: 'transparent',
          fill: true,
          pointBackgroundColor: getCssVariable('--bs-light'),
          pointHoverBackgroundColor: getCssVariable('--bs-light'),
          pointBorderColor: getCssVariable('--bs-danger'),
          pointHoverBorderColor: getCssVariable('--bs-danger'),
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
              family: getCssVariable('--bs-font-sans-serrif'),
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

export default React.memo(LineChart);
