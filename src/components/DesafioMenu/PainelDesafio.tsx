/**
 * PainelDesafio — a gaveta de acompanhamento da campanha.
 *
 * ## O que ela responde
 *
 * «Como está o desafio agora?» — e só isso. Ranking, quanto falta para quem
 * está na frente, quanto o grupo já somou e quantos dias restam. Não configura
 * nada, não edita nada e não abre o Analítico: quem quer mexer na campanha vai
 * para a aba, que é onde a configuração mora.
 *
 * ## Por que gaveta lateral, e não página
 *
 * Pela mesma razão do Desempenho do Dia: ela é consultada NO MEIO de outra
 * coisa. Sai da direita, cobre um terço da tela e fecha no `Esc` — o que estava
 * por baixo continua lá.
 *
 * ## O tempo real
 *
 * `useResultadoDesafio` já escuta `analitico_recebimentos` pelo canal do
 * Analítico. Chegou relatório novo, o quadro é recalculado e as posições se
 * reordenam sozinhas — `layout` no item da lista é o que faz a linha DESLIZAR
 * para a posição nova em vez de piscar nela.
 */
import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays, Gift, Medal, TrendingUp, Trophy, Users, X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useMovimentoPreferido } from '@/hooks/useMovimentoPreferido';
import { useResultadoDesafio } from '@/hooks/useDesafios';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { AvatarParticipante } from '@/pages/Analitico/Desafios/AvatarParticipante';
import {
  dataBR, estiloDaCampanha, hojeISO, percentualCurto,
} from '@/pages/Analitico/Desafios/tema';
import { diasRestantes } from '@/services/desafios/calcularDesafio';
import type { Desafio } from '@/services/desafios/types';

export interface PainelDesafioProps {
  desafio: Desafio | null;
  aberto: boolean;
  onClose: () => void;
}

/** A medalha das três primeiras posições. Da quarta em diante, o número. */
const CORES_POSICAO = [
  'text-amber-500',
  'text-slate-400',
  'text-orange-600 dark:text-orange-400',
];

export function PainelDesafio({ desafio, aberto, onClose }: PainelDesafioProps) {
  const { perfil } = useAuth();
  const { semMovimento } = useMovimentoPreferido();

  const { resultado, carregando } = useResultadoDesafio(
    aberto ? desafio : null,
    { operadorId: perfil?.id ?? null, setorDeCadastro: perfil?.setor_id ?? null },
  );

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, onClose]);

  const estilo = useMemo(() => estiloDaCampanha(desafio?.visual), [desafio?.visual]);

  const eu = useMemo(
    () => resultado?.individual.find(i => i.pessoa.id === perfil?.id) ?? null,
    [resultado, perfil?.id],
  );

  if (!desafio) return null;

  const { Icone } = estilo;

  /*
   * A arte de divulgação manda no topo, e o destaque é o plano B.
   *
   * A gaveta é onde o cartaz da campanha faz mais sentido — é a tela que a
   * pessoa abre para olhar a campanha. Sem arte, o selo continua servindo:
   * é o que a campanha tinha antes de as duas imagens existirem.
   */
  const usandoArte = !!desafio.arteUrl;
  const imagemTopo = desafio.arteUrl ?? desafio.midiaUrl;
  const ajusteTopo = usandoArte ? desafio.visual.ajusteArte : desafio.visual.ajusteMidia;

  const restam = diasRestantes(desafio.dataFim, hojeISO());
  const lista = resultado?.individual ?? [];
  const premios = desafio.regra.premios;

  return (
    <AnimatePresence>
      {aberto && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="veu-desfocado fixed inset-0 z-30 bg-black/25"
          />

          <motion.aside
            role="dialog"
            aria-label={`Andamento do desafio ${desafio.nome}`}
            initial={semMovimento ? { opacity: 0 } : { opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={semMovimento ? { opacity: 0 } : { opacity: 0, x: 30 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className={cn(
              'fixed right-0 top-0 z-40 flex h-full w-[420px] max-w-[calc(100vw-2rem)]',
              'flex-col border-l bg-card shadow-2xl',
              estilo.borda,
            )}
          >
            {/* ── Cabeçalho: a mídia, quando existe, é o próprio cabeçalho ── */}
            <header className="relative flex-shrink-0 overflow-hidden border-b border-border">
              {imagemTopo ? (
                <div className={cn(
                  'relative w-full',
                  // A arte é um cartaz e merece altura; o destaque é um selo e
                  // uma faixa basta.
                  usandoArte ? 'h-56' : 'h-32',
                  ajusteTopo === 'conter' && 'bg-muted/40',
                )}>
                  <img
                    src={imagemTopo}
                    alt=""
                    className={cn(
                      'h-full w-full',
                      ajusteTopo === 'conter' ? 'object-contain' : 'object-cover',
                    )}
                  />
                  {/* O véu é o que deixa o nome legível por cima da arte. Com
                      a imagem inteira ele fica só no rodapé, para não lavar o
                      cartaz no meio. */}
                  <div className={cn(
                    'absolute inset-x-0 bottom-0',
                    ajusteTopo === 'conter'
                      ? 'h-20 bg-gradient-to-t from-card to-transparent'
                      : 'inset-y-0 bg-gradient-to-t from-card via-card/50 to-transparent',
                  )} />
                </div>
              ) : (
                <div className={cn('h-20 w-full bg-gradient-to-br', estilo.gradiente)} />
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="absolute right-2 top-2 h-7 w-7 bg-card/70 backdrop-blur"
              >
                <X className="h-4 w-4" />
              </Button>

              <div className="absolute bottom-3 left-4 right-12">
                <div className="flex items-center gap-2">
                  <Icone className={cn('h-4 w-4 flex-shrink-0', estilo.destaque)} />
                  <h2 className="truncate text-sm font-semibold text-foreground">
                    {desafio.nome}
                  </h2>
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <CalendarDays className="h-3 w-3" />
                  {dataBR(desafio.dataInicio)} — {dataBR(desafio.dataFim)}
                  <span className="mx-1">·</span>
                  {restam > 0
                    ? `${restam} ${restam === 1 ? 'dia restante' : 'dias restantes'}`
                    : 'encerrado'}
                </p>
              </div>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {/* ── Os três números do grupo ── */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-border bg-background/50 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Somado
                  </p>
                  <p className={cn('mt-0.5 truncate text-sm font-semibold', estilo.destaque)}>
                    {carregando ? '—' : formatBRL(resultado?.totalRecebido ?? 0)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background/50 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Disputam
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-foreground">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    {carregando ? '—' : resultado?.totalParticipantes ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background/50 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Sua posição
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">
                    {eu ? `${eu.posicao}º` : '—'}
                  </p>
                </div>
              </div>

              {/* ── A sua linha, quando você disputa ── */}
              {eu && (
                <div className={cn(
                  'rounded-lg border p-3',
                  eu.bateuMeta
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : `${estilo.borda} bg-background/50`,
                )}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">
                      {eu.bateuMeta ? 'Meta batida' : 'Você'}
                    </span>
                    <span className={cn('text-sm font-semibold', estilo.destaque)}>
                      {formatBRL(eu.recebido)}
                    </span>
                  </div>

                  {eu.meta !== null && eu.meta > 0 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className={cn('h-full rounded-full', estilo.barra)}
                        initial={false}
                        animate={{ width: `${Math.min(eu.progresso, 100)}%` }}
                        transition={{ type: 'spring', stiffness: 120, damping: 22 }}
                      />
                    </div>
                  )}

                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {eu.paraUltrapassar !== null && eu.nomeAcima
                      ? (
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          Faltam {formatBRL(eu.paraUltrapassar)} para passar {eu.nomeAcima}
                        </span>
                      )
                      : eu.meta
                        ? `${percentualCurto(eu.progresso)} da meta`
                        : 'Você lidera a corrida'}
                  </p>
                </div>
              )}

              {/* ── A premiação por colocação ── */}
              {premios.length > 0 && (
                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Gift className={cn('h-3.5 w-3.5', estilo.destaque)} />
                    Premiação
                  </h3>
                  <ul className="space-y-1">
                    {premios.map(p => {
                      const dono = lista.find(i => i.posicao === p.posicao);
                      return (
                        <li
                          key={p.posicao}
                          className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-2.5 py-1.5 text-[11px]"
                        >
                          <span className={cn(
                            'w-6 flex-shrink-0 font-semibold',
                            CORES_POSICAO[p.posicao - 1] ?? 'text-muted-foreground',
                          )}>
                            {p.posicao}º
                          </span>
                          <span className="flex-1 truncate text-foreground">
                            {p.icone ? `${p.icone} ` : ''}{p.premio}
                          </span>
                          {/* Quem está levando o prêmio AGORA. É a informação
                              que transforma a lista de brindes em placar. */}
                          {dono && (
                            <span className="max-w-[8rem] truncate text-muted-foreground">
                              {dono.pessoa.nome}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {/* ── O ranking ── */}
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Trophy className={cn('h-3.5 w-3.5', estilo.destaque)} />
                  Ranking
                </h3>

                {carregando ? (
                  <div className="space-y-1.5">
                    {[0, 1, 2, 3, 4].map(i => (
                      <Skeleton key={i} className="h-11 w-full rounded-md" />
                    ))}
                  </div>
                ) : lista.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    Ninguém pontuou ainda nesta campanha.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {lista.slice(0, 20).map(item => (
                      <motion.li
                        key={item.pessoa.id}
                        // `layout` é o que faz a linha DESLIZAR para a posição
                        // nova quando chega relatório — sem ele, a lista
                        // reordenada pisca e ninguém percebe a ultrapassagem.
                        layout={!semMovimento && desafio.visual.animarUltrapassagem}
                        transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                        className={cn(
                          'flex items-center gap-2 rounded-md border px-2.5 py-1.5',
                          item.pessoa.id === perfil?.id
                            ? `${estilo.borda} bg-background`
                            : 'border-transparent bg-background/40',
                        )}
                      >
                        <span className={cn(
                          'w-6 flex-shrink-0 text-center text-xs font-semibold',
                          CORES_POSICAO[item.posicao - 1] ?? 'text-muted-foreground',
                        )}>
                          {item.posicao <= 3
                            ? <Medal className="mx-auto h-3.5 w-3.5" />
                            : item.posicao}
                        </span>

                        <AvatarParticipante
                          nome={item.pessoa.nome}
                          fotoUrl={item.pessoa.fotoUrl}
                          mostrarFoto={desafio.visual.mostrarFotos}
                          className="h-7 w-7 flex-shrink-0 text-[10px]"
                        />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">
                            {item.pessoa.nome}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {item.pessoa.equipeNome}
                          </p>
                        </div>

                        <div className="flex-shrink-0 text-right">
                          <p className="text-xs font-semibold text-foreground">
                            {formatBRL(item.recebido)}
                          </p>
                          {item.meta !== null && item.meta > 0 && (
                            <p className={cn(
                              'text-[10px]',
                              item.bateuMeta
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-muted-foreground',
                            )}>
                              {percentualCurto(item.progresso)}
                            </p>
                          )}
                        </div>
                      </motion.li>
                    ))}
                  </ul>
                )}

                {lista.length > 20 && (
                  <p className="mt-2 text-center text-[11px] text-muted-foreground">
                    +{lista.length - 20} na aba Desafios
                  </p>
                )}
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
