/**
 * ComposicaoAcumulado.tsx — "de onde vieram estes reais?"
 *
 * Fica logo abaixo do card do acumulado do setor: uma linha discreta que abre
 * a lista das ORIGENS que apareceram no relatório importado, com o valor de
 * cada uma e uma caixa marcada.
 *
 * Existe porque o ERP às vezes manda, no relatório de um setor, linhas de gente
 * de outro — em agosto/2026 o relatório do Play 5 trouxe R$ 1.933,21 de
 * operadores do Play Mix Marília e do Play 4, e o card do Play 5 exibia como se
 * fossem dele. Desmarcar a origem tira aquele dinheiro do acumulado.
 *
 * Três decisões que valem a pena estarem escritas:
 *
 *   • **Tudo marcado por padrão.** A tabela vazia reproduz o comportamento de
 *     sempre; ninguém precisa configurar nada para o número continuar o que era.
 *   • **A origem do próprio setor não tem caixa.** Desmarcá-la não é uma opção
 *     que faça sentido, e uma caixa que existe só para nunca ser clicada é um
 *     convite a um erro caro.
 *   • **O que saiu aparece em vermelho, somado.** Dinheiro tirado de um card não
 *     migra para o card de outro setor (cada setor soma o carimbo do relatório
 *     DELE), então ele só existe no total da empresa. Esconder isso faria a soma
 *     dos setores não fechar com a empresa sem nenhuma pista do motivo.
 */
import { useState } from 'react';
import { ChevronDown, Loader2, Info } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import {
  ORIGEM_SEM_OPERADOR,
  type OrigemDoAcumulado,
  type OrigemKey,
} from '@/services/analitico/composicaoAcumulado';

interface Props {
  origens: OrigemDoAcumulado[];
  /** Nome de exibição de um setor. Setor apagado cai num rótulo neutro. */
  nomeDoSetor: (id: string) => string | undefined;
  /** Líder+ edita; os demais só leem a composição. */
  podeEditar: boolean;
  salvando: boolean;
  /** Recebe o conjunto COMPLETO de origens que ficam fora. */
  onSalvar: (excluidas: Set<OrigemKey>) => void;
}

function rotulo(origem: OrigemDoAcumulado, nomeDoSetor: Props['nomeDoSetor']): string {
  if (origem.chave === ORIGEM_SEM_OPERADOR) return 'Sem operador vinculado';
  return nomeDoSetor(origem.chave) ?? 'Setor removido';
}

export function ComposicaoAcumulado({
  origens, nomeDoSetor, podeEditar, salvando, onSalvar,
}: Props) {
  const [aberto, setAberto] = useState(false);

  // Uma origem só: o relatório veio limpo, não há o que compor. A linha some em
  // vez de virar um controle que nunca faz nada.
  if (origens.length < 2) return null;

  const excluidas = origens.filter(o => o.excluida);
  const totalFora = excluidas.reduce((s, o) => s + o.total, 0);

  function alternar(origem: OrigemDoAcumulado) {
    if (!podeEditar || origem.propria) return;
    const proximas = new Set(origens.filter(o => o.excluida).map(o => o.chave));
    if (origem.excluida) proximas.delete(origem.chave);
    else proximas.add(origem.chave);
    onSalvar(proximas);
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        aria-expanded={aberto}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', aberto && 'rotate-180')} />
        <span>Composição do acumulado</span>
        <span className="text-muted-foreground/70">({origens.length} origens)</span>
        {totalFora > 0 && (
          <span className="text-destructive font-medium">
            − {formatBRL(totalFora)} fora
          </span>
        )}
      </button>

      {aberto && (
        <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>
              Setores que apareceram no relatório importado. Desmarcar tira aquele
              recebimento do acumulado deste setor — o valor continua no total da
              empresa, mas não entra em nenhum card de setor.
            </span>
          </p>

          <ul className="space-y-1">
            {origens.map(origem => {
              const nome = rotulo(origem, nomeDoSetor);
              const bloqueada = origem.propria || !podeEditar;
              return (
                <li
                  key={origem.chave}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                    origem.excluida ? 'opacity-60' : 'bg-background/60',
                  )}
                >
                  <Checkbox
                    checked={!origem.excluida}
                    disabled={bloqueada || salvando}
                    onCheckedChange={() => alternar(origem)}
                    aria-label={`Incluir ${nome} no acumulado`}
                  />
                  <span className={cn('flex-1 truncate', origem.excluida && 'line-through')}>
                    {nome}
                    {origem.propria && (
                      <span className="ml-1.5 text-xs text-muted-foreground">· este setor</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {origem.qtd} {origem.qtd === 1 ? 'linha' : 'linhas'}
                  </span>
                  <span className={cn(
                    'font-mono text-sm tabular-nums w-28 text-right',
                    origem.excluida && 'text-destructive line-through',
                  )}>
                    {formatBRL(origem.total)}
                  </span>
                </li>
              );
            })}
          </ul>

          {salvando && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Salvando…
            </p>
          )}
          {!podeEditar && (
            <p className="text-xs text-muted-foreground">
              Só líder ou acima pode mudar a composição.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
