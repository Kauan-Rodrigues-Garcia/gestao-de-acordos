/**
 * DetalheGrupoForma — «quem recebeu por qual forma», em lista.
 *
 * Substitui (14/10/2026) a tabela cruzada de uma coluna em reais por forma. Com
 * cinco formas eram sete colunas de números por linha, e a pergunta da seção —
 * «essa pessoa vive de quê?» — exigia comparar os valores de cabeça.
 *
 * Agora cada linha é o nome, UMA barra com a divisão entre as formas (nas cores
 * dos cards logo acima) e o total. A forma principal vai escrita embaixo do
 * total. Os valores de cada forma continuam a um clique: a linha abre e mostra
 * forma a forma, em reais e em porcentagem.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { corDaForma } from '@/lib/formasPagamento';
import {
  somaDasFormas, formatarShare, fatiasDoGrupo, CHAVE_SEM_OPERADOR, type GrupoFormas,
} from './agregacaoFormas';

// «operador» + «s» dava «operadors» — a tabela antiga já errava assim.
const PLURAL = { operador: 'operadores', equipe: 'equipes' } as const;

interface DetalheGrupoFormaProps {
  grupos: GrupoFormas[];
  /** Quantas linhas mostrar (o «carregar mais» é de quem chama). */
  visiveis: number;
  formas: readonly string[];
  /** Formas escolhidas nos cards; `null` = todas. */
  selecao: ReadonlySet<string> | null;
  total: number;
  /** «operador» / «equipe» — para o rodapé. */
  unidade: 'operador' | 'equipe';
}

export function DetalheGrupoForma({
  grupos, visiveis, formas, selecao, total, unidade,
}: DetalheGrupoFormaProps) {
  const [aberto, setAberto] = useState<string | null>(null);

  return (
    <div>
      {/* Legenda: a mesma cor dos cards, para a barra se ler sem procurar. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2">
        {formas.map(rotulo => (
          <span key={rotulo} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: corDaForma(rotulo) }} />
            {rotulo}
          </span>
        ))}
      </div>

      <ul className="divide-y divide-border">
        {grupos.slice(0, visiveis).map(g => {
          const valor = somaDasFormas(g.porForma, selecao);
          const fatias = fatiasDoGrupo(g, formas);
          const forte = fatias[0];
          const orfa = g.chave === CHAVE_SEM_OPERADOR;
          const expandido = aberto === g.chave;

          return (
            <li key={g.chave}>
              <button
                type="button"
                onClick={() => setAberto(expandido ? null : g.chave)}
                aria-expanded={expandido}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-left transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)_auto]"
              >
                <span className="min-w-0">
                  <span className={cn(
                    'block truncate text-sm font-medium',
                    orfa && 'text-amber-600 dark:text-amber-400',
                  )}>
                    {g.rotulo}
                  </span>
                  {g.detalhe && (
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">
                      {g.detalhe}
                    </span>
                  )}
                </span>

                {/* Na tela estreita a barra desce para a linha de baixo. */}
                <span
                  className="order-last col-span-2 flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-muted/50 md:order-none md:col-span-1"
                  role="img"
                  aria-label={fatias.map(f => `${f.rotulo} ${formatarShare(f.share)}`).join(', ')}
                >
                  {fatias.map(f => (
                    <span
                      key={f.rotulo}
                      className="h-full first:rounded-l-full last:rounded-r-full"
                      style={{ width: `${f.share}%`, background: corDaForma(f.rotulo) }}
                      title={`${f.rotulo} · ${formatBRL(f.valor)} (${formatarShare(f.share)})`}
                    />
                  ))}
                </span>

                <span className="flex items-center gap-2">
                  <span className="text-right">
                    <span className="block font-mono text-sm font-semibold tabular-nums">
                      {formatBRL(valor)}
                    </span>
                    {forte && (
                      <span className="block text-[11px] text-muted-foreground">
                        {forte.rotulo} {formatarShare(forte.share)}
                      </span>
                    )}
                  </span>
                  <ChevronDown className={cn(
                    'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                    expandido && 'rotate-180',
                  )} />
                </span>
              </button>

              {expandido && (
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 bg-muted/20 px-4 py-2.5 md:pl-[232px]">
                  {fatias.map(f => (
                    <span key={f.rotulo} className="inline-flex items-center gap-1.5 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ background: corDaForma(f.rotulo) }} />
                      <span className="text-muted-foreground">{f.rotulo}</span>
                      <span className="font-mono font-medium tabular-nums">{formatBRL(f.valor)}</span>
                      <span className="text-muted-foreground tabular-nums">{formatarShare(f.share)}</span>
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-2 text-xs">
        <span className="text-muted-foreground">
          {grupos.length} {grupos.length === 1 ? unidade : PLURAL[unidade]}
        </span>
        <span className="font-mono font-semibold tabular-nums">{formatBRL(total)}</span>
      </div>
    </div>
  );
}
