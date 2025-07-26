// src/components/ProfileCharts.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { safeFormatDate } from '@/lib/utils/date';
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

// Типы данных для графиков
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

// Пропсы для компонента
interface ProfileChartsProps {
  perfData: PerfData[];
  monthlyData: MonthlyData[];
}

const CustomTooltip: FC<any> = ({ active, payload, label, t }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className='bg-background p-2 rounded shadow-lg text-sm border'>
      <div className='font-semibold mb-1'>{label}</div>
      {data.rating !== undefined && (
        <div>
          {t('Your ELO')}: {data.rating}
        </div>
      )}
      {data.opponent && <div>{t('Opponent')}: {data.opponent}</div>}
      {data.score && <div>{t('Score')}: {data.score}</div>}
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
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Icon className='h-5 w-5' /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export const ProfileCharts: FC<ProfileChartsProps> = ({ perfData, monthlyData }) => {
  const { t } = useTranslation();

  return (
    <div className='space-y-8'>
      <ChartCard title={t('ELO History (Ranked)')} icon={LineChartIcon}>
        <ResponsiveContainer width='100%' height={400}>
          <LineChart data={perfData}>
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis dataKey='label' tick={{ fontSize: 12 }} />
            <YAxis domain={['dataMin - 20', 'dataMax + 20']} />
            <RechartTooltip content={<CustomTooltip t={t} />} />
            <ReLegend />
            <Line
              type='monotone'
              name='ELO'
              dataKey='rating'
              stroke='hsl(var(--primary))'
              dot={{ r: 2 }}
              activeDot={{ r: 6 }}
            />
            <Brush dataKey='label' height={20} stroke='hsl(var(--primary))' startIndex={Math.max(0, perfData.length - 30)} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title={t('Monthly Δ ELO (Ranked)')} icon={LineChartIcon}>
          <ResponsiveContainer width='100%' height={300}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis dataKey='label' />
              <YAxis />
              <ReLegend />
              <RechartTooltip />
              <Line type='monotone' dataKey='delta' strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title={t('Match Result (Ranked)')} icon={Activity}>
          <ResponsiveContainer width='100%' height={450}>
            <LineChart data={perfData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis dataKey='label' tick={{ fontSize: 12 }} />
              <YAxis domain={[-1.2, 1.2]} ticks={[-1, 0, 1]} />
              <RechartTooltip content={<CustomTooltip t={t} />} />
              <ReLegend />
              <Line
                type='stepAfter'
                dataKey='result'
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Brush
                dataKey='label'
                height={20}
                travellerWidth={10}
                startIndex={Math.floor(perfData.length * 0.8)}
                endIndex={perfData.length - 1}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title={t('Score Difference (Ranked)')} icon={TrendingUp}>
          <ResponsiveContainer width='100%' height={450}>
            <LineChart data={perfData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis dataKey='label' tick={{ fontSize: 12 }} />
              <YAxis />
              <RechartTooltip content={<CustomTooltip t={t} />} />
              <ReLegend />
              <Line
                type='monotone'
                dataKey='diff'
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Brush
                dataKey='label'
                height={20}
                travellerWidth={10}
                startIndex={Math.floor(perfData.length * 0.8)}
                endIndex={perfData.length - 1}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
    </div>
  );
};