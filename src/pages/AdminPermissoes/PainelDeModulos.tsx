/**
 * PainelDeModulos — os módulos numa lista curta, e um módulo aberto por vez.
 *
 * Até 03/11/2026 os vinte e tantos cards ficavam empilhados: configurar o
 * Analítico de um cargo era rolar até ele, abrir, e rolar de novo até achar o
 * que se queria. Agora a lista à esquerda mostra todos os módulos de uma vez —
 * com o «Exibir aba» de cada um — e o lado direito mostra só o escolhido.
 *
 * A busca filtra a lista e o conteúdo do módulo aberto; quando o aberto sai do
 * filtro, abre o primeiro que casa.
 */
import { useState, type ReactNode } from 'react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { BlocoDeAba } from '@/lib/permissoes-abas';
import type { PermissaoMeta } from '@/lib/permissoes-catalogo';
import { BlocoAba } from './BlocoAba';
import { blocoCasa, chavesDoBloco } from './modulos';

interface Props {
  blocos: BlocoDeAba[];
  valorDe: (chave: string) => boolean;
  alternar?: (chave: string) => void;
  alterada: (chave: string) => boolean;
  somenteLeitura: boolean;
  filtro: string;
  renderControle?: (permissao: PermissaoMeta, contexto: { disabled: boolean; cabecalho?: boolean }) => ReactNode;
  /**
   * O «Exibir aba» de cada módulo fica na lista. Por pessoa ele é o seletor
   * herda/sim/não, largo demais para a lista, e fica no módulo aberto.
   */
  interruptorNaLista: boolean;
}

export function PainelDeModulos({
  blocos, valorDe, alternar, alterada, somenteLeitura, filtro, renderControle, interruptorNaLista,
}: Props) {
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const visiveis = blocos.filter(b => blocoCasa(b, filtro));
  const atual = visiveis.find(b => b.aba === escolhido) ?? visiveis[0];

  if (!atual) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        Nenhuma permissão encontrada para «{filtro}».
      </p>
    );
  }

  return (
    <div className="grid items-start gap-3 xl:grid-cols-[16rem_minmax(0,1fr)]">
      <nav
        aria-label="Módulos"
        className="max-h-[18rem] divide-y divide-border/60 overflow-y-auto rounded-xl border border-border bg-card xl:max-h-[calc(100vh-14rem)]"
      >
        {visiveis.map(b => {
          const ligada = valorDe(b.interruptor.key);
          const ativo = b.aba === atual.aba;
          const mudou = chavesDoBloco(b).some(alterada);
          const opcoes = b.acoes;
          const ligadas = opcoes.filter(p => valorDe(p.key)).length;
          return (
            <div
              key={b.aba}
              className={cn(
                'flex items-center gap-2 pr-3 transition-colors',
                ativo ? 'bg-primary/10' : 'hover:bg-muted/40',
              )}
            >
              <button
                type="button"
                onClick={() => setEscolhido(b.aba)}
                aria-current={ativo ? 'true' : undefined}
                className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-2 text-left"
              >
                <span className={cn('h-7 w-1 shrink-0 rounded-full', ativo ? 'bg-primary' : 'bg-transparent')} />
                <span className="min-w-0">
                  <span className={cn(
                    'flex items-center gap-1.5 truncate text-[13px] font-medium',
                    ligada ? 'text-foreground' : 'text-muted-foreground',
                  )}>
                    {b.rotulo}
                    {mudou && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Alterado, não salvo" />}
                  </span>
                  <span className="block text-[10px] tabular-nums text-muted-foreground">
                    {!ligada ? 'aba desligada' : opcoes.length > 0 ? `${ligadas}/${opcoes.length} opções` : 'aba ligada'}
                  </span>
                </span>
              </button>
              {interruptorNaLista && (
                <Switch
                  checked={ligada}
                  disabled={somenteLeitura}
                  onCheckedChange={() => alternar?.(b.interruptor.key)}
                  aria-label={b.interruptor.label}
                  className={cn(alterada(b.interruptor.key) && 'ring-2 ring-amber-500/60 ring-offset-1')}
                />
              )}
            </div>
          );
        })}
      </nav>

      <BlocoAba
        key={atual.aba}
        bloco={atual}
        valorDe={valorDe}
        alternar={alternar}
        alterada={alterada}
        somenteLeitura={somenteLeitura}
        filtro={filtro}
        renderControle={renderControle}
        sempreAberto
        semInterruptor={interruptorNaLista}
      />
    </div>
  );
}
