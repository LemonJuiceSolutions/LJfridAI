import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { Chart as ChartJS, RadialLinearScale, ArcElement, Tooltip, Legend } from 'chart.js';
import { PolarArea } from 'react-chartjs-2';

ChartJS.register(RadialLinearScale, ArcElement, Tooltip, Legend);

const PolarAreaChart = () => {
  const data = useMemo(
    () => ({
      labels: ['Africa', 'Asia', 'Europe', 'Latin America'],
      datasets: [
        {
          label: 'Population (millions)',
          backgroundColor: [
            getCssVariable('--bs-primary'),
            getCssVariable('--bs-danger'),
            getCssVariable('--bs-success'),
            getCssVariable('--bs-info'),
          ],
          hoverBackgroundColor: [
            getCssVariable('--bs-primary'),
            getCssVariable('--bs-danger'),
            getCssVariable('--bs-success'),
            getCssVariable('--bs-info'),
          ],
          borderColor: getCssVariable('--bs-light'),
          hoverBorderColor: [
            getCssVariable('--bs-primary'),
            getCssVariable('--bs-danger'),
            getCssVariable('--bs-success'),
            getCssVariable('--bs-info'),
          ],
          data: [3578, 5000, 1034, 2034],
        },
      ],
    }),
    []
  );

  const options = useMemo(
    () => ({
      aspectRatio: 2,
      scales: {
        r: {
          angleLines: {
            display: true,
            color: getCssVariable('--gridline-color'),
          },
          grid: {
            color: getCssVariable('--gridline-color'),
          },
          suggestedMin: 1000,
          suggestedMax: 5500,
          ticks: {
            backdropColor: getCssVariable('--bs-light'),
            color: getCssVariable('--bs-secondary'),
            font: {
              size: 11,
              family: getCssVariable('--bs-font-sans-serif'),
            },
          },
          pointLabels: {
            color: getCssVariable('--bs-secondary'),
            font: {
              family: getCssVariable('--bs-font-sans-serif'),
              size: 13,
            },
          },
        },
      },
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

  return <PolarArea options={options} data={data} />;
};

export default React.memo(PolarAreaChart);
