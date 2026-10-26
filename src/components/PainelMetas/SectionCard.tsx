/**
 * SectionCard — a moldura dos cartões da tela Configurar Metas: ícone, título,
 * contador opcional e descrição. Saiu de `pages/MetasConfig.tsx` (22/10/2026)
 * junto com os cartões do mês, que também a usam.
 */
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function SectionCard({ title, description, icon, children, badge, className }: {
  title: string; description?: string; icon: ReactNode;
  children: ReactNode; badge?: string | number;
  className?: string;
}) {
  return (
    <Card className={cn('border border-border shadow-sm', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          <CardTitle className="text-base">{String(title ?? '')}</CardTitle>
          {badge !== undefined && (
            <Badge variant="secondary" className="text-xs ml-auto">{String(badge)}</Badge>
          )}
        </div>
        {description && <CardDescription className="text-xs">{String(description)}</CardDescription>}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}
