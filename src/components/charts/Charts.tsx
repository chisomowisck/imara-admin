import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { useTheme } from '@/hooks/useTheme';

const PALETTE = ['#0d9488', '#6366f1', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#22c55e', '#64748b'];

function base(dark: boolean): ApexOptions {
  return {
    chart: { toolbar: { show: false }, fontFamily: 'Inter, sans-serif', foreColor: dark ? '#a1a1aa' : '#52525b', background: 'transparent' },
    theme: { mode: dark ? 'dark' : 'light' },
    grid: { borderColor: dark ? '#27272a' : '#e4e4e7', strokeDashArray: 3 },
    colors: PALETTE,
    dataLabels: { enabled: false },
    legend: { position: 'bottom', fontSize: '12px' },
    tooltip: { theme: dark ? 'dark' : 'light' },
  };
}

const mwk = (v: number) => `MWK ${Math.round(v).toLocaleString()}`;

export function RevenueChart({ series }: { series: { month: string; revenue: number; invoiced: number }[] }) {
  const { theme } = useTheme();
  const options: ApexOptions = {
    ...base(theme === 'dark'),
    xaxis: { categories: series.map((s) => s.month) },
    yaxis: { labels: { formatter: (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)) } },
    tooltip: { y: { formatter: mwk } },
    plotOptions: { bar: { borderRadius: 3, columnWidth: '45%' } },
  };
  return (
    <Chart
      type="bar"
      height={280}
      options={options}
      series={[
        { name: 'Revenue received', data: series.map((s) => s.revenue) },
        { name: 'Invoiced', data: series.map((s) => s.invoiced) },
      ]}
    />
  );
}

export function DistributionChart({ data }: { data: { label: string; value: number }[] }) {
  const { theme } = useTheme();
  if (!data.length) return <p className="py-10 text-center text-[13px] text-zinc-500">No live subscriptions yet.</p>;
  const options: ApexOptions = {
    ...base(theme === 'dark'),
    labels: data.map((d) => d.label),
    stroke: { width: 0 },
    plotOptions: { pie: { donut: { size: '62%', labels: { show: true, total: { show: true, label: 'Clients' } } } } },
  };
  return <Chart type="donut" height={280} options={options} series={data.map((d) => d.value)} />;
}
