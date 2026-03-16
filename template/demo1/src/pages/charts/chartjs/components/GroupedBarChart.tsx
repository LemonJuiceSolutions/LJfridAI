import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const GroupedBarChart = () => {
  const data = useMemo(
    () => ({
      labels: ['1900', '1950', '1999', '2050'],
      datasets: [
        {
          label: 'Africa',
          backgroundColor: getCssVariable('--bs-danger'),
          hoverBackgroundColor: getCssVariable('--bs-danger'),
          borderColor: getCssVariable('--bs-danger'),
          hoverBorderColor: getCssVariable('--bs-danger'),
          data: [133, 221, 783, 2478],
        },
        {
          label: 'Europe',
          backgroundColor: getCssVariable('--bs-primary'),
          hoverBackgroundColor: getCssVariable('--bs-primary'),
          borderColor: getCssVariable('--bs-primary'),
          hoverBorderColor: getCssVariable('--bs-primary'),
          data: [408, 547, 675, 734],
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

  return <Bar options={options} data={data} />;
};

export default React.memo(GroupedBarChart);
