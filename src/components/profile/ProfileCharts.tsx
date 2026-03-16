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
	Activity,
	LineChart as LineChartIcon,
	PieChart as PieChartIcon,
	TrendingUp,
} from 'lucide-react';
import React from 'react';
import {
	Bar,
	BarChart,
	Brush,
	CartesianGrid,
	Cell,
	Line,
	Pie, // Добавлено для раскраски секторов
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

// Цветовая схема Apple/Glass стиле
const COLORS = {
  wins: 'hsl(var(--chart-2))', // Зеленый (из твоего globals.css)
  losses: 'hsl(var(--destructive))', // Красный
  leftSide: '#3b82f6', // Blue 500
  rightSide: '#a855f7', // Purple 500
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
    <div className='bg-background/80 backdrop-blur-xl p-3 rounded-2xl shadow-xl ring-1 ring-black/5 dark:ring-white/10 text-sm'>
      <div className='font-bold mb-2 text-foreground tracking-tight'>
        {label}
      </div>
      <div className='space-y-1 text-muted-foreground font-medium'>
        <div>
          {t('Opponent')}: <span className='text-foreground'>{d.opponent}</span>
        </div>
        <div>
          {t('Score')}:{' '}
          <span className='font-mono text-foreground'>{d.score}</span>
        </div>
        <div>
          {t('Result')}:{' '}
          <span
            className={d.result === 1 ? 'text-emerald-500' : 'text-red-500'}
          >
            {res}
          </span>
        </div>
        <div>
          {t('ΔELO')}: <span className='font-bold text-primary'>{delta}</span>
        </div>
        <div className='pt-1 border-t border-black/5 mt-1'>
          {t('ELO')}:{' '}
          <span className='font-black text-foreground'>{d.rating}</span>
        </div>
      </div>
    </div>
  );
}

function ResultTooltip({ active, payload, label, t }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  const isWin = d.result === 1;
  return (
    <div className='bg-background/80 backdrop-blur-xl p-3 rounded-2xl shadow-xl ring-1 ring-black/5 dark:ring-white/10 text-sm'>
      <div className='font-bold mb-1 text-foreground'>{label}</div>
      <div className='flex items-center gap-2'>
        <div
          className={`w-2 h-2 rounded-full ${isWin ? 'bg-emerald-500' : 'bg-red-500'}`}
        />
        <span className='font-bold uppercase tracking-wider text-[10px]'>
          {isWin ? t('Win') : t('Loss')}
        </span>
      </div>
      <div className='text-muted-foreground mt-1'>
        {t('Opponent')}:{' '}
        <span className='text-foreground font-medium'>{d.opponent}</span>
      </div>
      <div className='text-muted-foreground'>
        {t('Score')}:{' '}
        <span className='font-mono text-foreground'>{d.score}</span>
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
    <div className='bg-background/80 backdrop-blur-xl p-3 rounded-2xl shadow-xl ring-1 ring-black/5 dark:ring-white/10 text-sm'>
      <div className='font-bold mb-1'>{d.date}</div>
      <div className='text-muted-foreground'>
        <div>
          {t('Matches')}: {d.total}
        </div>
        <div>
          {t('Wins')}: {d.wins}
        </div>
        <div className='font-black text-primary mt-1'>
          {t('Win Rate')}: {d.winRate.toFixed(1)}%
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

  const lastMonthStartIndex = React.useMemo(() => {
    if (!hasPerf) return 0;
    const now = perfData[perfData.length - 1].ts ?? Date.now();
    const monthAgo = now - 30 * 24 * 3600 * 1000;
    let idx = perfData.findIndex((p) => (p.ts ?? 0) >= monthAgo);
    if (idx < 0) idx = Math.max(Math.floor(perfData.length * 0.8), 0);
    return idx;
  }, [hasPerf, perfData]);

  // Хелпер для отрисовки карточек с PieChart
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
        {/* 1. Общий Win/Loss */}
        {RenderPieCard(t('Win / Loss'), pieData, [COLORS.wins, COLORS.losses])}

        {/* 2. Победы по сторонам - Разные цвета! */}
        {RenderPieCard(t('Left vs Right Wins'), sidePieData, [
          COLORS.leftSide,
          COLORS.rightSide,
        ])}

        {/* 3. Поражения по сторонам - Разные цвета! */}
        {RenderPieCard(t('Left vs Right Losses'), sidePieLossData, [
          COLORS.leftSide,
          COLORS.rightSide,
        ])}
      </div>

      {winRateTrend && winRateTrend.length > 1 && (
        <Card className='border-0 rounded-[2rem] glass-panel shadow-xl overflow-hidden relative'>
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
              {t('Cumulative win percentage over time')}
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
                  dot={{ r: 4, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                  activeDot={{ r: 8, strokeWidth: 0 }}
                />
              </RLineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ELO History */}
      <Card className='border-0 rounded-[2rem] glass-panel shadow-2xl relative overflow-hidden group'>
        <div className='absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none' />
        <CardHeader className='px-8 pt-8 relative z-10'>
          <CardTitle className='flex items-center gap-3 text-2xl font-extrabold tracking-tight'>
            <div className='bg-primary/10 p-2.5 rounded-xl text-primary ring-1 ring-primary/20 shadow-sm'>
              <LineChartIcon className='w-6 h-6' />
            </div>
            {t('ELO History')}
          </CardTitle>
          <CardDescription className='pl-12 font-medium'>
            {t('Ranked progression over time')}
          </CardDescription>
        </CardHeader>
        <CardContent
          className={`relative z-10 ${isMobile ? 'h-[320px] pt-4' : 'h-[420px] p-8'}`}
        >
          {hasPerf ? (
            <ResponsiveContainer width='100%' height='100%'>
              <RLineChart
                data={perfData}
                syncId='profilePerf'
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
                />
                <YAxis
                  tick={{ fontSize: 10, opacity: 0.5 }}
                  axisLine={false}
                  tickLine={false}
                  dx={-10}
                />
                <RTooltip
                  content={<EloTooltip t={t} />}
                  cursor={{ stroke: 'currentColor', opacity: 0.2 }}
                />
                {!isMobile && (
                  <RLegend verticalAlign='top' align='right' height={36} />
                )}
                <Line
                  type='monotone'
                  dataKey='rating'
                  stroke='hsl(var(--primary))'
                  strokeWidth={3}
                  dot={{ r: 0 }}
                  activeDot={{
                    r: 6,
                    fill: 'hsl(var(--primary))',
                    strokeWidth: 0,
                  }}
                />
                <Brush
                  dataKey='label'
                  height={20}
                  stroke='currentColor'
                  fill='transparent'
                  startIndex={lastMonthStartIndex}
                  className='opacity-10'
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

      {/* Match Results DNA (Tendency) */}
      <Card className='border-0 rounded-[2rem] glass-panel shadow-2xl relative overflow-hidden group mt-8'>
        <div className='absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none' />
        <CardHeader className='px-8 pt-8 relative z-10'>
          <CardTitle className='flex items-center gap-3 text-2xl font-extrabold tracking-tight'>
            <div className='bg-emerald-500/10 p-2.5 rounded-xl text-emerald-600 ring-1 ring-emerald-500/20 shadow-sm'>
              <Activity className='w-6 h-6' />
            </div>
            {t('Performance Trend')}
          </CardTitle>
          <CardDescription className='pl-12 font-medium'>
            {t('Win/Loss sequence for recent matches')}
          </CardDescription>
        </CardHeader>

        <CardContent
          className={`relative z-10 ${isMobile ? 'h-[200px] pt-4' : 'h-[250px] p-8'}`}
        >
          {hasPerf ? (
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart
                data={perfData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                barGap={2}
              >
                <CartesianGrid
                  strokeDasharray='3 3'
                  vertical={false}
                  stroke='currentColor'
                  opacity={0.05}
                />
                <XAxis dataKey='label' hide />
                <YAxis
                  domain={[-1, 1]}
                  ticks={[-1, 0, 1]}
                  tick={{ fontSize: 10, opacity: 0.3 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) =>
                    val === 1 ? 'W' : val === -1 ? 'L' : ''
                  }
                />
                <RTooltip
                  content={<ResultTooltip t={t} />}
                  cursor={{ fill: 'currentColor', opacity: 0.05 }}
                />
                <Bar dataKey='result' barSize={isMobile ? 8 : 12}>
                  {perfData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.result === 1
                          ? 'hsl(var(--chart-2))'
                          : 'hsl(var(--destructive))'
                      }
                      // Добавляем as any, чтобы TS не ругался на массив
                      radius={
                        (entry.result === 1
                          ? [4, 4, 0, 0]
                          : [0, 0, 4, 4]) as any
                      }
                    />
                  ))}
                </Bar>
                <Brush
                  dataKey='label'
                  height={20}
                  stroke='currentColor'
                  fill='transparent'
                  startIndex={lastMonthStartIndex}
                  className='opacity-10'
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className='flex items-center justify-center h-full text-sm text-muted-foreground font-light'>
              {t('No data available')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
