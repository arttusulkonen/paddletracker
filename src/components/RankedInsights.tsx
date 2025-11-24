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
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Lightbulb className='text-yellow-500' />
          {t('Smart Analysis')}
        </CardTitle>
        <CardDescription>
          {t('AI-powered breakdown of your recent performance')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className='grid gap-4 sm:grid-cols-2'>
          {insights.map((item, idx) => (
            <li
              key={idx}
              className='flex items-start gap-3 p-3 rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors border'
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.bg}`}
              >
                <item.icon className={`h-6 w-6 ${item.color}`} />
              </div>
              <div className='space-y-1'>
                <p className='text-sm font-medium leading-none'>{item.title}</p>
                {/* ВАЖНО: dangerouslySetInnerHTML позволяет тегам <b> работать */}
                <div
                  className='text-xs text-muted-foreground leading-snug'
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
