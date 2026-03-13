// src/components/profile/ProfileCharts.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { Activity, LineChart as LineChartIcon, TrendingUp } from 'lucide-react';
import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
	Brush,
	CartesianGrid,
	Line,
	LineChart,
	Tooltip as RechartTooltip,
	Legend as ReLegend,
	ResponsiveContainer,
	XAxis,
	YAxis,
} from 'recharts';

type PerfData = {
  label: string;
  rating: number;
  diff: number;
  result: number;
  opponent: string;
  score: string;
  addedPoints: number;
};

type MonthlyData = {
  label: string;
  delta: number;
};

interface ProfileChartsProps {
  perfData: PerfData[];
  monthlyData: MonthlyData[];
}

const CustomTooltip: FC<any> = ({ active, payload, label, t }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className='bg-background/80 backdrop-blur-xl p-3 rounded-2xl shadow-xl ring-1 ring-black/5 dark:ring-white/10 text-sm'>
      <div className='font-bold mb-2 text-foreground tracking-tight'>{label}</div>
      <div className="space-y-1 text-muted-foreground font-medium">
        {data.rating !== undefined && (
          <div className="flex justify-between gap-4">
            <span>{t('Your ELO')}:</span>
            <span className="text-primary font-bold">{Math.round(data.rating)}</span>
          </div>
        )}
        {data.opponent && (
          <div className="flex justify-between gap-4">
            <span>{t('Opponent')}:</span>
            <span className="text-foreground">{data.opponent}</span>
          </div>
        )}
        {data.score && (
          <div className="flex justify-between gap-4">
            <span>{t('Score')}:</span>
            <span className="font-mono text-foreground">{data.score}</span>
          </div>
        )}
      </div>
    </div>
  );
};

function ChartCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-0 rounded-[2rem] glass-panel shadow-lg relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <CardHeader className="px-8 pt-8 pb-4 relative z-10">
        <CardTitle className='flex items-center gap-3 text-2xl font-extrabold tracking-tight'>
          <div className="bg-primary/10 p-2.5 rounded-xl text-primary ring-1 ring-primary/20 shadow-sm">
             <Icon className='h-6 w-6' />
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-8 pb-8 relative z-10 pt-4">
        {children}
      </CardContent>
    </Card>
  );
}

export const ProfileCharts: FC<ProfileChartsProps> = ({
  perfData,
  monthlyData,
}) => {
  const { t } = useTranslation();

  return (
    <div className='space-y-8 mt-8'>
      <ChartCard title={t('ELO History (Ranked)')} icon={LineChartIcon}>
        <div className="bg-background/40 backdrop-blur-sm p-4 rounded-2xl ring-1 ring-black/5 dark:ring-white/5">
          <ResponsiveContainer width='100%' height={350}>
            <LineChart data={perfData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray='3 3' stroke="currentColor" opacity={0.1} vertical={false} />
              <XAxis dataKey='label' tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }} axisLine={false} tickLine={false} dy={10} />
              <YAxis domain={['dataMin - 20', 'dataMax + 20']} tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }} axisLine={false} tickLine={false} dx={-10} />
              <RechartTooltip content={<CustomTooltip t={t} />} cursor={{ stroke: 'currentColor', strokeWidth: 1, opacity: 0.2, strokeDasharray: '3 3' }} />
              <Line
                type='monotone'
                name='ELO'
                dataKey='rating'
                stroke='hsl(var(--primary))'
                strokeWidth={3}
                dot={{ r: 0 }}
                activeDot={{ r: 6, strokeWidth: 0, fill: 'hsl(var(--primary))' }}
              />
              <Brush
                dataKey='label'
                height={20}
                stroke='currentColor'
                fill="transparent"
                tickFormatter={() => ''}
                className="opacity-20"
                startIndex={Math.max(0, perfData.length - 30)}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ChartCard title={t('Monthly Δ ELO')} icon={TrendingUp}>
          <div className="bg-background/40 backdrop-blur-sm p-4 rounded-2xl ring-1 ring-black/5 dark:ring-white/5">
            <ResponsiveContainer width='100%' height={250}>
              <LineChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray='3 3' stroke="currentColor" opacity={0.1} vertical={false} />
                <XAxis dataKey='label' tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }} axisLine={false} tickLine={false} dx={-10} />
                <RechartTooltip cursor={{ fill: 'currentColor', opacity: 0.05 }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', background: 'var(--background)' }} />
                <Line type='monotone' dataKey='delta' stroke='hsl(var(--emerald-500))' strokeWidth={3} dot={{ r: 3, fill: 'hsl(var(--emerald-500))', strokeWidth: 0 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title={t('Match Results')} icon={Activity}>
          <div className="bg-background/40 backdrop-blur-sm p-4 rounded-2xl ring-1 ring-black/5 dark:ring-white/5">
            <ResponsiveContainer width='100%' height={250}>
              <LineChart data={perfData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray='3 3' stroke="currentColor" opacity={0.1} vertical={false} />
                <XAxis dataKey='label' tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }} axisLine={false} tickLine={false} dy={10} />
                <YAxis domain={[-1.2, 1.2]} ticks={[-1, 0, 1]} tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }} axisLine={false} tickLine={false} dx={-10} tickFormatter={(v) => v === 1 ? 'W' : v === -1 ? 'L' : ''} />
                <RechartTooltip content={<CustomTooltip t={t} />} cursor={{ stroke: 'currentColor', strokeWidth: 1, opacity: 0.2, strokeDasharray: '3 3' }} />
                <Line
                  type='stepAfter'
                  dataKey='result'
                  stroke='hsl(var(--primary))'
                  strokeWidth={2}
                  dot={{ r: 2, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
    </div>
  );
};