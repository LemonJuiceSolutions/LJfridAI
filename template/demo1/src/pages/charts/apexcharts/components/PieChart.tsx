import React, { useMemo } from 'react';
import { getCssVariable } from '@/utils/getCssVariable';
import { ApexOptions } from 'apexcharts';
import Chart from 'react-apexcharts';

const PieChart = () => {
  const options: ApexOptions = useMemo(
    () => ({
      series: [44, 55, 13, 33],
      chart: {
        foreColor: getCssVariable('--bs-secondary'),
        toolbar: {
          show: false,
        },
      },
      colors: [
        getCssVariable('--bs-primary'),
        getCssVariable('--bs-warning'),
        getCssVariable('--bs-danger'),
        getCssVariable('--bs-info'),
      ],
      stroke: {
        colors: ['rgba(0,0,0,0)'],
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
      dataLabels: {
        enabled: false,
      },
    }),
    []
  );

  return <Chart options={options} series={options.series} type="pie" height={320} />;
};

export default React.memo(PieChart);
