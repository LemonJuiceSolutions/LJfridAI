import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const BarChart = () => {
  const data = useMemo(
    () => ({
      labels: ['China', 'America', 'India', 'Germany', 'Oman'],
      datasets: [
        {
          label: 'Population',
          backgroundColor: [
            getCssVariable('--bs-primary'),
            getCssVariable('--bs-danger'),
            getCssVariable('--bs-warning'),
            getCssVariable('--bs-success'),
            getCssVariable('--bs-info'),
          ],
          hoverBackgroundColor: [
            getCssVariable('--bs-primary'),
            getCssVariable('--bs-danger'),
            getCssVariable('--bs-warning'),
            getCssVariable('--bs-success'),
            getCssVariable('--bs-info'),
          ],
          borderColor: [
            getCssVariable('--bs-primary'),
            getCssVariable('--bs-danger'),
            getCssVariable('--bs-warning'),
            getCssVariable('--bs-success'),
            getCssVariable('--bs-info'),
          ],
          hoverBorderColor: [
            getCssVariable('--bs-primary'),
            getCssVariable('--bs-danger'),
            getCssVariable('--bs-warning'),
            getCssVariable('--bs-success'),
            getCssVariable('--bs-info'),
          ],
          data: [2478, 5267, 734, 2084, 1433],
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
          display: false,
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

  return <Bar options={options} data={data} />;
};

export default React.memo(BarChart);
