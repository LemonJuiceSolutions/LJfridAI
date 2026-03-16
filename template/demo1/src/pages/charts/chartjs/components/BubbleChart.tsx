import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { Chart as ChartJS, LinearScale, PointElement, Tooltip, Legend } from 'chart.js';
import { Bubble } from 'react-chartjs-2';

ChartJS.register(LinearScale, PointElement, Tooltip, Legend);

const BubbleChart = () => {
  const data = useMemo(
    () => ({
      labels: [],
      datasets: [
        {
          label: 'China',
          backgroundColor: `${getCssVariable('--bs-info')}4D`,
          hoverBackgroundColor: `${getCssVariable('--bs-info')}4D`,
          borderColor: getCssVariable('--bs-info'),
          hoverBorderColor: getCssVariable('--bs-info'),
          data: [
            {
              x: 21269017,
              y: 5.245,
              r: 15,
            },
          ],
        },
        {
          label: 'Denmark',
          backgroundColor: `${getCssVariable('--bs-danger')}4D`,
          hoverBackgroundColor: `${getCssVariable('--bs-danger')}4D`,
          borderColor: getCssVariable('--bs-danger'),
          hoverBorderColor: getCssVariable('--bs-danger'),
          data: [
            {
              x: 258702,
              y: 7.526,
              r: 10,
            },
          ],
        },
        {
          label: 'Germany',
          backgroundColor: `${getCssVariable('--bs-primary')}4D`,
          hoverBackgroundColor: `${getCssVariable('--bs-primary')}4D`,
          borderColor: getCssVariable('--bs-primary'),
          hoverBorderColor: getCssVariable('--bs-primary'),
          data: [
            {
              x: 3979083,
              y: 6.994,
              r: 15,
            },
          ],
        },
        {
          label: 'Japan',
          backgroundColor: `${getCssVariable('--bs-warning')}4D`,
          hoverBackgroundColor: `${getCssVariable('--bs-warning')}4D`,
          borderColor: getCssVariable('--bs-warning'),
          hoverBorderColor: getCssVariable('--bs-warning'),
          data: [
            {
              x: 4931877,
              y: 5.921,
              r: 15,
            },
          ],
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
          title: {
            display: true,
            text: 'GDP (PPP)',
            color: getCssVariable('--bs-secondary'),
            font: {
              family: getCssVariable('--bs-font-sans-serif'),
            },
          },
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
          display: true,
          title: {
            display: true,
            text: 'Happiness',
            color: getCssVariable('--bs-secondary'),
            font: {
              family: getCssVariable('--bs-font-sans-serif'),
            },
          },
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

  return <Bubble options={options} data={data} />;
};

export default React.memo(BubbleChart);
