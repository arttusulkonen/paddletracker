// src/components/RankedInsights.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { BrainCircuit, Sparkles } from 'lucide-react';
import { FC } from 'react';

export type InsightItem = {
  icon: any;
  color: string;
  bg: string;
  title: string;
  description: string;
};

interface RankedInsightsProps {
  insights: InsightItem[];
  t: (key: string) => string;
}

export const RankedInsights: FC<RankedInsightsProps> = ({ insights, t }) => {
  if (!insights || insights.length === 0) return null;

  return (
    <Card className='border-0 rounded-[2.5rem] glass-panel shadow-2xl overflow-hidden relative mt-10'>
      {/* AI Glow Effect */}
      <div className='absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none animate-pulse' />
      <div
        className='absolute -bottom-24 -left-24 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl pointer-events-none animate-pulse'
        style={{ animationDelay: '2s' }}
      />
      <div className='absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 mix-blend-overlay pointer-events-none' />

      <CardHeader className='px-8 pt-8 pb-6 relative z-10 flex flex-row items-start justify-between'>
        <div>
          <CardTitle className='flex items-center gap-3 text-3xl font-extrabold tracking-tight'>
            <div className='bg-indigo-500/10 p-3 rounded-2xl ring-1 ring-indigo-500/20 text-indigo-500 shadow-sm'>
              <BrainCircuit className='w-7 h-7' />
            </div>
            <span className='bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-600'>
              {t('Pro Analytics')}
            </span>
          </CardTitle>
          <p className='text-base font-medium text-muted-foreground mt-3 max-w-lg'>
            {t('Smart breakdown of your performance, trends, and playstyle.')}
          </p>
        </div>
        <div className='hidden sm:flex items-center gap-1.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-black ring-1 ring-indigo-500/30 shadow-sm'>
          <Sparkles className='w-3 h-3' /> AI Powered
        </div>
      </CardHeader>

      <CardContent className='px-6 pb-8 relative z-10'>
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {insights.map((item, idx) => (
            <div
              key={idx}
              className='flex flex-col gap-4 p-5 rounded-3xl bg-background/60 hover:bg-background/90 transition-all duration-300 border-0 ring-1 ring-black/5 dark:ring-white/10 shadow-sm hover:shadow-xl backdrop-blur-md group'
            >
              <div className='flex items-center gap-3'>
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ring-black/5 dark:ring-white/10 shadow-inner group-hover:scale-110 transition-transform duration-300 ease-out ${item.bg}`}
                >
                  <item.icon className={`h-6 w-6 ${item.color}`} />
                </div>
                <p className='text-lg font-extrabold leading-tight tracking-tight text-foreground'>
                  {item.title}
                </p>
              </div>
              <div
                className='text-sm text-muted-foreground font-medium leading-relaxed'
                dangerouslySetInnerHTML={{ __html: item.description }}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
