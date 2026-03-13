// src/components/RankedInsights.tsx
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui';
import { Lightbulb } from 'lucide-react';
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
    <Card className='border-0 rounded-[2rem] glass-panel shadow-lg overflow-hidden relative mt-8'>
      <div className='absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent mix-blend-overlay pointer-events-none' />
      <CardHeader className='px-8 pt-8 pb-4 relative z-10'>
        <CardTitle className='flex items-center gap-3 text-2xl font-extrabold tracking-tight'>
          <div className='bg-amber-500/10 p-2.5 rounded-xl ring-1 ring-amber-500/20 text-amber-500'>
            <Lightbulb className='w-6 h-6' />
          </div>
          {t('Smart Analysis')}
        </CardTitle>
        <CardDescription className='text-base font-light text-muted-foreground'>
          {t('AI-powered breakdown of your recent performance')}
        </CardDescription>
      </CardHeader>
      <CardContent className='px-8 pb-8 relative z-10'>
        <ul className='grid gap-4 sm:grid-cols-2'>
          {insights.map((item, idx) => (
            <li
              key={idx}
              className='flex items-start gap-4 p-4 rounded-2xl bg-background/50 hover:bg-background/80 transition-colors border-0 ring-1 ring-black/5 dark:ring-white/10 shadow-sm backdrop-blur-sm group'
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] ring-1 ring-black/5 dark:ring-white/10 shadow-sm group-hover:scale-105 transition-transform ${item.bg}`}
              >
                <item.icon className={`h-6 w-6 ${item.color}`} />
              </div>
              <div className='space-y-1.5'>
                <p className='text-base font-bold leading-tight tracking-tight'>
                  {item.title}
                </p>
                <div
                  className='text-sm text-muted-foreground leading-relaxed font-light'
                  dangerouslySetInnerHTML={{ __html: item.description }}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
