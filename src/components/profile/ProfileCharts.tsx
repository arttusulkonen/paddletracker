// src/components/profile/ProfileCharts.tsx
'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import {
  Calendar,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Users,
} from 'lucide-react';
import React from 'react';
import {
  Bar,
  Brush,
  CartesianGrid,
  Line,
  Pie,
  BarChart as RBarChart,
  ResponsiveContainer,
  Legend as RLegend,
  LineChart as RLineChart,
  PieChart as RPieChart,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';

type PerfPoint = {
  label: string;
  ts?: number;
  rating: number;
  diff: number;
  result: -1 | 0 | 1;
  opponent: string;
  score: string;
  addedPoints: number;
};
type MonthlyPoint = {
  month: string;
  wins: number;
  losses: number;
  total: number;
};
type OpponentPoint = {
  name: string;
  count: number;
  wins: number;
  losses: number;
};

function EloTooltip({
  active,
  payload,
  label,
  t,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  t: (k: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d: PerfPoint = payload[0].payload;
  const res =
    d.result === 1 ? t('Win') : d.result === -1 ? t('Loss') : t('Draw');
  const delta = d.addedPoints > 0 ? `+${d.addedPoints}` : `${d.addedPoints}`;
  return (
    <div className='bg-white p-2 rounded shadow text-sm'>
      <div className='font-semibold mb-1'>{label}</div>
      <div>
        {t('Opponent')}: {d.opponent}
      </div>
      <div>
        {t('Score')}: {d.score}
      </div>
      <div>
        {t('Result')}: {res}
      </div>
      <div>
        {t('ΔELO')}: {delta}
      </div>
      <div>
        {t('ELO')}: {d.rating}
      </div>
    </div>
  );
}

export default function ProfileCharts({
  t,
  pieData,
  sidePieData,
  sidePieLossData,
  perfData,
  monthlyData,
  oppStats,
  compact = false,
}: {
  t: (k: string) => string;
  pieData: { name: string; value: number; fill?: string }[];
  sidePieData: { name: string; value: number; fill?: string }[];
  sidePieLossData: { name: string; value: number; fill?: string }[];
  perfData: PerfPoint[];
  monthlyData: MonthlyPoint[];
  oppStats: OpponentPoint[];
  compact?: boolean;
}) {
  const hasPerf = perfData && perfData.length > 0;
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 640px)');
    const onChange = (e: MediaQueryListEvent | MediaQueryList) =>
      setIsMobile('matches' in e ? e.matches : (e as MediaQueryList).matches);
    setIsMobile(mql.matches);
    mql.addEventListener('change', onChange as EventListener);
    return () => mql.removeEventListener('change', onChange as EventListener);
  }, []);

  const lastMonthStartIndex = React.useMemo(() => {
    if (!hasPerf) return 0;
    const now = perfData[perfData.length - 1].ts ?? Date.now();
    const monthAgo = now - 30 * 24 * 3600 * 1000;
    let idx = perfData.findIndex((p) => (p.ts ?? 0) >= monthAgo);
    if (idx < 0) idx = Math.max(Math.floor(perfData.length * 0.8), 0);
    return idx;
  }, [hasPerf, perfData]);

  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <PieChartIcon /> {t('Win / Loss')}
            </CardTitle>
          </CardHeader>
          <CardContent className='h-[320px]'>
            <ResponsiveContainer width='100%' height='100%'>
              <RPieChart>
                <Pie
                  data={pieData}
                  dataKey='value'
                  nameKey='name'
                  cx='50%'
                  cy='50%'
                  outerRadius={90}
                  label
                />
                <RLegend />
                <RTooltip />
              </RPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <PieChartIcon /> {t('Left vs Right Wins')}
            </CardTitle>
          </CardHeader>
          <CardContent className='h-[320px]'>
            <ResponsiveContainer width='100%' height='100%'>
              <RPieChart>
                <Pie
                  data={sidePieData}
                  dataKey='value'
                  nameKey='name'
                  cx='50%'
                  cy='50%'
                  outerRadius={90}
                  label
                />
                <RLegend />
                <RTooltip />
              </RPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <PieChartIcon /> {t('Left vs Right Losses')}
            </CardTitle>
          </CardHeader>
          <CardContent className='h-[320px]'>
            <ResponsiveContainer width='100%' height='100%'>
              <RPieChart>
                <Pie
                  data={sidePieLossData}
                  dataKey='value'
                  nameKey='name'
                  cx='50%'
                  cy='50%'
                  outerRadius={90}
                  label
                />
                <RLegend />
                <RTooltip />
              </RPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className={isMobile ? 'pb-2' : undefined}>
          <CardTitle className='flex items-center gap-2'>
            <LineChartIcon /> {t('ELO History')}
          </CardTitle>
          <CardDescription>{t('Ranked progression over time')}</CardDescription>
        </CardHeader>
        <CardContent className={isMobile ? 'h-[320px] pt-0' : 'h-[420px]'}>
          {hasPerf ? (
            <ResponsiveContainer width='100%' height='100%'>
              <RLineChart
                data={perfData}
                syncId='profilePerf'
                margin={{
                  top: isMobile ? 8 : 16,
                  right: isMobile ? 8 : 16,
                  bottom: isMobile ? 8 : 16,
                  left: isMobile ? 8 : 24,
                }}
              >
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis
                  dataKey='label'
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                  tickMargin={isMobile ? 4 : 8}
                  minTickGap={isMobile ? 10 : 5}
                />
                <YAxis
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                  tickMargin={isMobile ? 4 : 8}
                  width={isMobile ? 28 : 40}
                />
                <RTooltip content={<EloTooltip t={t} />} />
                {!isMobile && <RLegend wrapperStyle={{ fontSize: 12 }} />}
                <Line
                  type='monotone'
                  dataKey='rating'
                  dot={{ r: isMobile ? 2 : 3 }}
                  activeDot={{ r: isMobile ? 4 : 5 }}
                />
                <Brush
                  dataKey='label'
                  height={isMobile ? 14 : 20}
                  travellerWidth={isMobile ? 8 : 10}
                  startIndex={lastMonthStartIndex}
                />
              </RLineChart>
            </ResponsiveContainer>
          ) : (
            <div className='text-center text-sm text-muted-foreground'>
              {t('No data available')}
            </div>
          )}
        </CardContent>
      </Card>

      {!compact && (
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <LineChartIcon /> {t('Match Result Timeline')}
              </CardTitle>
              <CardDescription>{t('Win = 1, Loss = -1')}</CardDescription>
            </CardHeader>
            <CardContent className='h-[380px]'>
              {hasPerf ? (
                <ResponsiveContainer width='100%' height='100%'>
                  <RLineChart data={perfData} syncId='profilePerf'>
                    <CartesianGrid strokeDasharray='3 3' />
                    <XAxis dataKey='label' />
                    <YAxis domain={[-1.2, 1.2]} ticks={[-1, 0, 1]} />
                    <RTooltip />
                    <RLegend />
                    <Line
                      type='stepAfter'
                      dataKey='result'
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    <Brush
                      dataKey='label'
                      height={20}
                      travellerWidth={10}
                      startIndex={lastMonthStartIndex}
                    />
                  </RLineChart>
                </ResponsiveContainer>
              ) : (
                <div className='text-center text-sm text-muted-foreground'>
                  {t('No data available')}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <LineChartIcon /> {t('Score Difference')}
              </CardTitle>
              <CardDescription>{t('Per ranked match')}</CardDescription>
            </CardHeader>
            <CardContent className='h-[380px]'>
              {hasPerf ? (
                <ResponsiveContainer width='100%' height='100%'>
                  <RLineChart data={perfData} syncId='profilePerf'>
                    <CartesianGrid strokeDasharray='3 3' />
                    <XAxis dataKey='label' />
                    <YAxis />
                    <RTooltip />
                    <RLegend />
                    <Line
                      type='monotone'
                      dataKey='diff'
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    <Brush
                      dataKey='label'
                      height={20}
                      travellerWidth={10}
                      startIndex={lastMonthStartIndex}
                    />
                  </RLineChart>
                </ResponsiveContainer>
              ) : (
                <div className='text-center text-sm text-muted-foreground'>
                  {t('No data available')}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
