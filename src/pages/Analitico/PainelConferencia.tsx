// src/pages/Analitico/PainelConferencia.tsx
/**
 * Conferência do relatório — o que é manutenção, num lugar só.
 *
 * Até 25/10/2026 isso estava espalhado pela tela: a validação numa faixa acima
 * de tudo, a composição do acumulado logo abaixo dos números, e as linhas sem
 * operador como uma aba ao lado do Ranking. Nenhuma das três é leitura do mês;
 * são ajustes de quem responde pelo relatório. Agora ficam fechadas numa faixa,
 * e o cabeçalho diz em uma linha se há algo pedindo atenção.
 */
import { useState, type ReactNode } from 'react';
import { ChevronDown, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ResumoConferencia {
  texto: string;
  tom: 'alerta' | 'neutro';
}

export interface SecaoConferencia {
  chave: string;
  titulo: string;
  conteudo: ReactNode;
}

interface PainelConferenciaProps {
  resumos: ResumoConferencia[];
  secoes: SecaoConferencia[];
  /** Avisado ao abrir: quem carrega dados sob demanda espera por isto. */
  onAbrir?: () => void;
}

export function PainelConferencia({ resumos, secoes, onAbrir }: PainelConferenciaProps) {
  const [aberto, setAberto] = useState(false);
  if (secoes.length === 0) return null;
  const temAlerta = resumos.some(r => r.tom === 'alerta');

  return (
    <div className={cn(
      'overflow-hidden rounded-xl border bg-card',
      temAlerta ? 'border-warning/40' : 'border-border',
    )}>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => { if (!aberto) onAbrir?.(); setAberto(a => !a); }}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
          <ClipboardCheck className={cn('h-4 w-4', temAlerta ? 'text-warning' : 'text-muted-foreground')} aria-hidden="true" />
          Conferência do relatório
        </span>
        {resumos.map(r => (
          <span key={r.texto} className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-medium',
            r.tom === 'alerta' ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground',
          )}>
            {r.texto}
          </span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary">
          {aberto ? 'Fechar' : 'Abrir'}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform motion-reduce:transition-none', aberto && 'rotate-180')} aria-hidden="true" />
        </span>
      </button>

      {aberto && (
        <div className="divide-y divide-border border-t border-border">
          {secoes.map(s => (
            <section key={s.chave} aria-label={s.titulo} className="space-y-2 px-4 py-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{s.titulo}</h3>
              {s.conteudo}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
