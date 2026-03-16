import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { Chart as ChartJS, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js';
import { Radar } from 'react-chartjs-2';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const RadarChart = () => {
  const data = useMemo(
    () => ({
      labels: ['Africa', 'Asia', 'Europe', 'Latin America', 'North America'],
      datasets: [
        {
          label: '1950',
          fill: true,
          backgroundColor: `${getCssVariable('--bs-danger')}4D`,
          borderColor: getCssVariable('--bs-danger'),
          pointBorderColor: getCssVariable('--bs-danger'),
          pointHoverBorderColor: getCssVariable('--bs-danger'),
          pointBackgroundColor: getCssVariable('--bs-light'),
          pointHoverBackgroundColor: getCssVariable('--bs-light'),
          pointBorderWidth: 2,
          pointHoverBorderWidth: 3,
          data: [8.77, 55.61, 21.69, 6.62, 6.82],
        },
        {
          label: '2050',
          fill: true,
          backgroundColor: `${getCssVariable('--bs-info')}4D`,
          borderColor: getCssVariable('--bs-info'),
          pointBorderColor: getCssVariable('--bs-info'),
          pointHoverBorderColor: getCssVariable('--bs-info'),
          pointBackgroundColor: getCssVariable('--bs-light'),
          pointHoverBackgroundColor: getCssVariable('--bs-light'),
          pointBorderWidth: 2,
          pointHoverBorderWidth: 3,
          data: [25.48, 54.16, 7.61, 8.06, 4.45],
        },
      ],
    }),
    []
  );

  const options = useMemo(
    () => ({
      responsive: true,
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
          suggestedMin: 0,
          suggestedMax: 60,
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

  return <Radar options={options} data={data} />;
};

export default React.memo(RadarChart);
