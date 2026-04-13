/**
 * src/components/StatCard.tsx
 * Componente reutilizável de card de estatística para o Dashboard.
 */
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } },
};

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
  trend?: 'up' | 'down' | 'neutral';
  loading?: boolean;
}

export function StatCard({ title, value, subtitle, icon: Icon, color, trend, loading }: StatCardProps) {
  return (
    <motion.div variants={fadeUp}>
      <Card className="border-border hover:border-primary/30 transition-colors">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', color)}>
              <Icon className="w-5 h-5" />
            </div>
            {!loading && trend && (
              <span className={cn(
                'flex items-center gap-1 text-xs font-medium',
                trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground',
              )}>
                {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : trend === 'down' ? <TrendingDown className="w-3 h-3" /> : null}
              </span>
            )}
          </div>
          <div className="mt-3">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
            ) : (
              <>
                <p className="text-2xl font-bold font-mono text-foreground">{value}</p>
                <p className="text-xs font-medium text-muted-foreground mt-0.5">{title}</p>
                {subtitle && <p className="text-xs text-muted-foreground/70 mt-0.5">{subtitle}</p>}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
