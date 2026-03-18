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
	LineChart as LineChartIcon,
	PieChart as PieChartIcon,
	TrendingUp,
} from 'lucide-react';
import React from 'react';
import {
	Brush,
	CartesianGrid,
	Cell,
	Line,
	Pie,
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

type WinRatePoint = {
  matchIndex: number;
  label: string;
  date: string;
  winRate: number;
  wins: number;
  total: number;
};

type TFunction = (k: string, options?: any) => string;

const COLORS = {
  wins: 'hsl(var(--chart-2))',
  losses: 'hsl(var(--destructive))',
  leftSide: '#3b82f6',
  rightSide: '#a855f7',
  neutral: 'hsl(var(--muted))',
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
  t: TFunction;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d: PerfPoint = payload[0].payload;
  const res =
    d.result === 1 ? t('Win') : d.result === -1 ? t('Loss') : t('Draw');
  const delta = d.addedPoints > 0 ? `+${d.addedPoints}` : `${d.addedPoints}`;

  return (
    <div className='bg-background/80 backdrop-blur-xl p-3 rounded-2xl shadow-xl ring-1 ring-black/5 dark:ring-white/10 text-sm min-w-[180px]'>
      <div className='font-bold mb-3 text-foreground tracking-tight border-b border-border/50 pb-2'>
        {label}
      </div>
      <div className='space-y-1.5 text-muted-foreground font-medium'>
        <div className='flex justify-between gap-4'>
          <span>{t('Opponent')}:</span>
          <span className='text-foreground'>{d.opponent}</span>
        </div>
        <div className='flex justify-between gap-4'>
          <span>{t('Score')}:</span>
          <span className='font-mono text-foreground'>{d.score}</span>
        </div>
        <div className='flex justify-between gap-4'>
          <span>{t('Result')}:</span>
          <span
            className={d.result === 1 ? 'text-emerald-500' : 'text-red-500'}
          >
            {res}
          </span>
        </div>
        <div className='flex justify-between gap-4'>
          <span>{t('Δ ELO')}:</span>
          <span
            className={`font-bold ${d.addedPoints > 0 ? 'text-emerald-500' : d.addedPoints < 0 ? 'text-red-500' : 'text-muted-foreground'}`}
          >
            {delta}
          </span>
        </div>
        <div className='flex justify-between gap-4 pt-2 border-t border-border/50 mt-2'>
          <span>{t('Total ELO')}:</span>
          <span className='font-black text-primary'>{d.rating}</span>
        </div>
      </div>
    </div>
  );
}

function WinRateTooltip({
  active,
  payload,
  t,
}: {
  active?: boolean;
  payload?: any[];
  t: TFunction;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d: WinRatePoint = payload[0].payload;
  return (
    <div className='bg-background/80 backdrop-blur-xl p-3 rounded-2xl shadow-xl ring-1 ring-black/5 dark:ring-white/10 text-sm min-w-[160px]'>
      <div className='font-bold mb-2 border-b border-border/50 pb-2'>
        {d.date}
      </div>
      <div className='space-y-1.5 text-muted-foreground font-medium'>
        <div className='flex justify-between gap-4'>
          <span>{t('Matches')}:</span>
          <span className='text-foreground'>{d.total}</span>
        </div>
        <div className='flex justify-between gap-4'>
          <span>{t('Wins')}:</span>
          <span className='text-foreground'>{d.wins}</span>
        </div>
        <div className='flex justify-between gap-4 pt-2 border-t border-border/50 mt-2'>
          <span>{t('Win Rate')}:</span>
          <span className='font-black text-primary'>
            {d.winRate.toFixed(1)}%
          </span>
        </div>
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
  winRateTrend,
  selectedOpponentName,
}: {
  t: TFunction;
  pieData: { name: string; value: number }[];
  sidePieData: { name: string; value: number }[];
  sidePieLossData: { name: string; value: number }[];
  perfData: PerfPoint[];
  winRateTrend?: WinRatePoint[] | null;
  selectedOpponentName?: string;
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

  const defaultZoomIndex = React.useMemo(() => {
    if (!hasPerf) return 0;
    return Math.max(0, perfData.length - 15);
  }, [hasPerf, perfData]);

  const winRateZoomIndex = React.useMemo(() => {
    if (!winRateTrend) return 0;
    return Math.max(0, winRateTrend.length - 15);
  }, [winRateTrend]);

  const RenderPieCard = (title: string, data: any[], colorSet: string[]) => (
    <Card className='border-0 rounded-[2rem] glass-panel shadow-lg relative overflow-hidden group'>
      <div className='absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none' />
      <CardHeader className='px-6 pt-6 pb-2 relative z-10'>
        <CardTitle className='flex items-center gap-3 text-lg font-extrabold tracking-tight'>
          <div className='bg-primary/10 p-2 rounded-xl text-primary ring-1 ring-primary/20 shadow-sm'>
            <PieChartIcon className='w-4 h-4' />
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className='h-[280px] relative z-10'>
        <ResponsiveContainer width='100%' height='100%'>
          <RPieChart>
            <Pie
              data={data}
              dataKey='value'
              nameKey='name'
              cx='50%'
              cy='50%'
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              stroke='none'
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={colorSet[index % colorSet.length]}
                />
              ))}
            </Pie>
            <RTooltip
              contentStyle={{
                borderRadius: '1rem',
                border: 'none',
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                background: 'hsl(var(--background))',
              }}
            />
            <RLegend
              verticalAlign='bottom'
              height={36}
              iconType='circle'
              wrapperStyle={{ fontSize: '12px', fontWeight: '600' }}
            />
          </RPieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );

  return (
    <div className='space-y-8 mt-8'>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
        {RenderPieCard(t('Win / Loss'), pieData, [COLORS.wins, COLORS.losses])}
        {RenderPieCard(t('Left vs Right Wins'), sidePieData, [
          COLORS.leftSide,
          COLORS.rightSide,
        ])}
        {RenderPieCard(t('Left vs Right Losses'), sidePieLossData, [
          COLORS.leftSide,
          COLORS.rightSide,
        ])}
      </div>

      <div className=''>
        {winRateTrend && winRateTrend.length > 1 && (
          <Card className='border-0 rounded-[2rem] glass-panel shadow-xl overflow-hidden relative mb-8'>
            <div className='absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none' />
            <CardHeader className='px-8 pt-8'>
              <CardTitle className='flex items-center gap-3 text-2xl font-extrabold tracking-tight'>
                <div className='bg-primary/10 p-2.5 rounded-xl text-primary ring-1 ring-primary/20 shadow-sm'>
                  <TrendingUp className='h-6 w-6' />
                </div>
                {t('Win Rate Trend vs {{name}}', {
                  name: selectedOpponentName || 'Opponent',
                })}
              </CardTitle>
              <CardDescription className='pl-12 font-medium'>
                {t(
                  'Cumulative win percentage over time. Drag the brush below to zoom.',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className='h-[350px] px-8 pb-8'>
              <ResponsiveContainer width='100%' height='100%'>
                <RLineChart
                  data={winRateTrend}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray='3 3'
                    vertical={false}
                    stroke='currentColor'
                    opacity={0.1}
                  />
                  <XAxis
                    dataKey='label'
                    tick={{ fontSize: 12, opacity: 0.5 }}
                    axisLine={false}
                    tickLine={false}
                    dy={10}
                    minTickGap={20}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(val) => `${val}%`}
                    tick={{ fontSize: 12, opacity: 0.5 }}
                    axisLine={false}
                    tickLine={false}
                    dx={-10}
                  />
                  <RTooltip
                    content={<WinRateTooltip t={t} />}
                    cursor={{
                      stroke: 'currentColor',
                      strokeWidth: 1,
                      opacity: 0.2,
                    }}
                  />
                  <Line
                    type='monotone'
                    dataKey='winRate'
                    stroke='hsl(var(--primary))'
                    strokeWidth={4}
                    dot={{ r: 0 }}
                    activeDot={{
                      r: 8,
                      fill: 'hsl(var(--primary))',
                      strokeWidth: 0,
                    }}
                  />
                  <Brush
                    dataKey='label'
                    height={30}
                    stroke='hsl(var(--primary))'
                    fill='transparent'
                    startIndex={winRateZoomIndex}
                    className='opacity-30'
                    tickFormatter={() => ''}
                  />
                </RLineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card className='border-0 rounded-[2rem] glass-panel shadow-2xl relative overflow-hidden group mb-8'>
          <div className='absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none' />
          <CardHeader className='px-8 pt-8 relative z-10'>
            <CardTitle className='flex items-center gap-3 text-2xl font-extrabold tracking-tight'>
              <div className='bg-primary/10 p-2.5 rounded-xl text-primary ring-1 ring-primary/20 shadow-sm'>
                <LineChartIcon className='w-6 h-6' />
              </div>
              {t('ELO History')}
            </CardTitle>
            <CardDescription className='pl-12 font-medium'>
              {t('Ranked progression over time. Drag the brush below to zoom.')}
            </CardDescription>
          </CardHeader>
          <CardContent
            className={`relative z-10 ${isMobile ? 'h-[320px] pt-4' : 'h-[420px] p-8'}`}
          >
            {hasPerf ? (
              <ResponsiveContainer width='100%' height='100%'>
                <RLineChart
                  data={perfData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray='3 3'
                    vertical={false}
                    stroke='currentColor'
                    opacity={0.1}
                  />
                  <XAxis
                    dataKey='label'
                    tick={{ fontSize: 10, opacity: 0.5 }}
                    axisLine={false}
                    tickLine={false}
                    dy={10}
                    minTickGap={30}
                  />
                  {/* Жесткая привязка границ по Y для центрирования линии */}
                  <YAxis
                    domain={['dataMin - 30', 'dataMax + 30']}
                    tick={{ fontSize: 10, opacity: 0.5 }}
                    axisLine={false}
                    tickLine={false}
                    dx={-10}
                  />
                  <RTooltip
                    content={<EloTooltip t={t} />}
                    cursor={{ stroke: 'currentColor', opacity: 0.2 }}
                  />
                  <Line
                    type='monotone'
                    dataKey='rating'
                    stroke='hsl(var(--primary))'
                    strokeWidth={4}
                    dot={{ r: 0 }}
                    activeDot={{
                      r: 8,
                      fill: 'hsl(var(--primary))',
                      strokeWidth: 0,
                    }}
                  />
                  <Brush
                    dataKey='label'
                    height={30}
                    stroke='hsl(var(--primary))'
                    fill='transparent'
                    startIndex={defaultZoomIndex}
                    className='opacity-30'
                    tickFormatter={() => ''}
                  />
                </RLineChart>
              </ResponsiveContainer>
            ) : (
              <div className='flex items-center justify-center h-full text-sm text-muted-foreground font-light'>
                {t('No data available')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
