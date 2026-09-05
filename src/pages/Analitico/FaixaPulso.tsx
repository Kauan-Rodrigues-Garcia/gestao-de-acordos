// src/pages/Analitico/FaixaPulso.tsx
/**
 * A faixa de pulso do recorte Dia.
 *
 * É a razão de o Recebimento diário ter existido como aba: o relatório é
 * importado várias vezes ao dia, e sem `import_index` ninguém sabe o que entrou
 * na última rodada. Os ignorados (próximo contato ≤ data do pagamento) somam no
 * total e saem das listas — dizer isso em voz alta evita a pergunta "por que a
 * soma da lista não bate com o card".
 *
 * A aba morreu; a faixa não.
 */
import { Sparkles, EyeOff, RefreshCw } from 'lucide-react';
import { formatBRL } from '@/lib/money';

interface FaixaPulsoProps {
  /** Nº da última importação do dia (`import_index`). 1 = primeira do dia. */
  importacao: number;
  novos: number;
  valorIgnorado: number;
  qtdIgnorados: number;
  /** ISO da última importação; null enquanto não se sabe. */
  importadoEm: string | null;
}

export function FaixaPulso({
  importacao, novos, valorIgnorado, qtdIgnorados, importadoEm,
}: FaixaPulsoProps) {
  const hora = importadoEm
    ? new Date(importadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-primary/20 bg-primary/[0.04] px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-xs">
        <RefreshCw className="w-3.5 h-3.5 shrink-0 text-primary/70" />
        <span className="text-muted-foreground">Recebimento vivo · importação</span>
        <strong className="text-foreground">nº {importacao}</strong>
        {hora && <span className="text-muted-foreground">· {hora}</span>}
      </span>

      {importacao >= 2 && (
        <span className="inline-flex items-center gap-1.5 text-xs">
          <Sparkles className="w-3.5 h-3.5 shrink-0 text-primary" />
          <strong className="text-primary">{novos}</strong>
          <span className="text-muted-foreground">
            acordo{novos !== 1 ? 's' : ''} novo{novos !== 1 ? 's' : ''} no último relatório
          </span>
        </span>
      )}

      {qtdIgnorados > 0 && (
        <span className="inline-flex items-center gap-1.5 text-xs"
          title="Próximo contato anterior ou igual ao pagamento. O valor soma no total do dia e fica fora das listas.">
          <EyeOff className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          <strong className="font-mono text-foreground">{formatBRL(valorIgnorado)}</strong>
          <span className="text-muted-foreground">
            em {qtdIgnorados} acordo{qtdIgnorados !== 1 ? 's' : ''} ignorado{qtdIgnorados !== 1 ? 's' : ''}
          </span>
        </span>
      )}
    </div>
  );
}
