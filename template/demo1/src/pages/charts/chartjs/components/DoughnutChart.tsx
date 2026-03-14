import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

const DoughnutChart = () => {
  const data = useMemo(
    () => ({
      labels: ['Africa', 'Asia', 'Europe'],
      datasets: [
        {
          label: 'Population (millions)',
          backgroundColor: [getCssVariable('--bs-primary'), getCssVariable('--bs-danger'), getCssVariable('--bs-info')],
          hoverBackgroundColor: [
            getCssVariable('--bs-primary'),
            getCssVariable('--bs-danger'),
            getCssVariable('--bs-info'),
          ],
          borderColor: getCssVariable('--bs-light'),
          hoverBorderColor: [
            getCssVariable('--bs-primary'),
            getCssVariable('--bs-danger'),
            getCssVariable('--bs-info'),
          ],
          data: [2478, 4267, 1334],
        },
      ],
    }),
    []
  );

  const options = useMemo(
    () => ({
      aspectRatio: 2,
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
    }),
    []
  );

  return <Doughnut options={options} data={data} />;
};

export default React.memo(DoughnutChart);
