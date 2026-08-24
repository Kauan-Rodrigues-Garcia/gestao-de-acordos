/**
 * RankingEquipes — a disputa entre equipes.
 *
 * Cada equipe é um card com posição, total, alvo, faltante e barra. Clicar
 * expande e mostra os integrantes, já ordenados pelo mesmo critério da
 * campanha.
 *
 * ## Projeção não é meta
 *
 * Quando ninguém definiu meta PARA a equipe, o número da linha é a soma dos
 * desafios de quem está nela (`metaDerivada`). Nesse caso a tela diz
 * «projeção», e não «meta»: numa campanha em que só os operadores têm desafio,
 * chamar a soma de meta inventaria um alvo que a equipe não tem — e o líder
 * cobraria a equipe por um número que ninguém combinou com ela.
 *
 * O que a equipe ganha em troca é o que serve de verdade ao líder: quantos dos
 * integrantes já concluíram o próprio desafio.
 *
 * Expansão em vez de modal ou rota: é o padrão que a aba Analítico já usa para
 * abrir o detalhe de um operador, e uma gincana não justifica uma navegação
 * nova.
 *
 * ## De onde vem a equipe
 *
 * De `pessoa.equipeId`, resolvido no servidor pela mesma regra do resto do
 * sistema — cadastro, com o vínculo explícito de `equipe_lideres` no lugar do
 * cadastro em branco. Não há aqui nenhum `operador.equipe_id === equipe.id`
 * improvisado, e o agrupamento usa a equipe do CADASTRO, nunca a lista de
 * clones: somar pelos clones colocaria a mesma pessoa em dois cards.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { ValorAnimado } from '@/components/ValorAnimado';
import type { ResultadoEquipe } from '@/services/desafios/calcularDesafio';
import type { EstiloTema } from './tema';
import { percentualCurto } from './tema';
import { RankingDesafio } from './RankingDesafio';

interface Props {
  equipes: ResultadoEquipe[];
  tema: EstiloTema;
  mostrarFotos: boolean;
  animar: boolean;
  voceId?: string | null;
}

export function RankingEquipes({ equipes, tema, mostrarFotos, animar, voceId }: Props) {
  const [aberta, setAberta] = useState<string | null>(null);

  if (!equipes.length) return null;

  return (
    <ul className="space-y-2">
      <AnimatePresence initial={false}>
        {equipes.map(eq => {
          const expandida = aberta === eq.equipeId;
          return (
            <motion.li
              key={eq.equipeId}
              layout={animar}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <button
                type="button"
                onClick={() => setAberta(expandida ? null : eq.equipeId)}
                aria-expanded={expandida}
                className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40"
              >
                <span className={cn(
                  'w-7 shrink-0 text-center text-sm font-bold tabular-nums',
                  eq.posicao <= 3 ? tema.destaque : 'text-muted-foreground',
                )}>
                  {eq.posicao}º
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {eq.equipeNome}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {eq.integrantes.length} participante{eq.integrantes.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-2 max-w-[420px] flex-1 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className={cn('h-full rounded-full', tema.barra)}
                        initial={false}
                        animate={{ width: `${Math.max(0, Math.min(100, eq.progresso))}%` }}
                        transition={{ type: 'spring', stiffness: 160, damping: 26 }}
                      />
                    </div>
                    {eq.meta ? (
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {percentualCurto(eq.progresso)}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {eq.concluiram} de {eq.integrantes.length} concluíram o desafio
                    </span>
                    {eq.meta && (
                      <>
                        {' · '}
                        {eq.metaDerivada ? 'Projeção' : 'Meta'} {formatBRL(eq.meta)}
                        {eq.falta > 0 && <> · faltam {formatBRL(eq.falta)}</>}
                      </>
                    )}
                    {eq.paraUltrapassar !== null && eq.paraUltrapassar > 0 && (
                      <> · ↑ {formatBRL(eq.paraUltrapassar)} para alcançar o {eq.posicao - 1}º</>
                    )}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <ValorAnimado
                    valor={eq.recebido}
                    formatar={formatBRL}
                    className="text-sm font-semibold text-foreground"
                    classeSubindo="text-emerald-500"
                  />
                </div>

                <ChevronDown className={cn(
                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                  expandida && 'rotate-180',
                )} />
              </button>

              <AnimatePresence initial={false}>
                {expandida && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="border-t border-border bg-muted/20"
                  >
                    <div className="p-2">
                      <RankingDesafio
                        lista={eq.integrantes}
                        tema={tema}
                        mostrarFotos={mostrarFotos}
                        // Dentro da equipe a lista não reordena sozinha; animar
                        // aqui duplicaria o `layoutId` dos cards de fora.
                        animar={false}
                        voceId={voceId}
                        ocultarEquipe
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

export default RankingEquipes;
