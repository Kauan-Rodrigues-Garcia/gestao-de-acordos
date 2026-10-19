/**
 * O placar completo do desafio do dia — a gaveta que abre da barra superior e
 * a tela do desafio dentro da aba Desafios. Um componente só, para que as duas
 * nunca contem histórias diferentes.
 *
 * Só desenha: o placar chega pronto de `usePlacarDoDia`.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays, Clock, Database, Gauge, Gift, Headset, Hourglass, Radio, Sparkles, Target, Trophy, UserX, Users, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { Skeleton } from '@/components/ui/skeleton';
import { ValorAnimado } from '@/components/ValorAnimado';
import { AvatarParticipante } from '@/pages/Analitico/Desafios/AvatarParticipante';
import type { UsoPlacarDoDia } from '@/hooks/useDesafioDoDia';
import {
  ID_RECEPTIVO, ROTULO_PUBLICO, duracaoCurta, ehLinhaDoSetor, linhasDoPlacar, minutosRestantes,
  rotuloAlvo, rotuloHora, rotuloJanela,
  type Entrada,
} from '@/services/desafios/desafioDoDia';
import type { Desafio } from '@/services/desafios/types';
import { AnelProgresso } from './AnelProgresso';
import { ESTILO_BATIDO, estiloDoDia } from './estilo';

interface Props {
  desafio: Desafio;
  uso: UsoPlacarDoDia;
  operadorId: string | null;
  /** `pagina` ocupa a largura da aba; `gaveta` é a coluna estreita. */
  variante?: 'gaveta' | 'pagina';
}

interface LoteNoFeed { id: number; hora: string; entradas: Entrada[] }

const ROTULO_SITUACAO = {
  rascunho:  'Rascunho — só quem configura vê',
  agendado:  'Ainda não começou',
  valendo:   'Valendo agora',
  apurando:  'Apurando o último lote',
  encerrado: 'Encerrado',
} as const;

function horaCurta(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * O rosto de uma linha do placar: a foto da pessoa, ou o ícone do dinheiro do
 * setor que não é de ninguém (o Receptivo, o «sem operador»).
 */
function RostoDaLinha({ id, nome, fotoUrl, className, classeIcone }: {
  id: string; nome: string; fotoUrl: string | null; className: string; classeIcone: string;
}) {
  if (!ehLinhaDoSetor(id)) return <AvatarParticipante nome={nome} fotoUrl={fotoUrl} className={className} />;
  const Icone = id === ID_RECEPTIVO ? Headset : UserX;
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-muted', className)} aria-hidden="true">
      <Icone className={cn('text-muted-foreground', classeIcone)} />
    </span>
  );
}

/** «10h07» — a próxima passada do robô do 59, no minuto 07 de cada hora. */
function proximaRodada(minutoDoDia: number): string {
  const hora = minutoDoDia % 60 < 7 ? Math.floor(minutoDoDia / 60) : Math.floor(minutoDoDia / 60) + 1;
  return `${String(hora % 24).padStart(2, '0')}h07`;
}

function dataCurta(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function PainelDesafioDoDia({ desafio, uso, operadorId, variante = 'gaveta' }: Props) {
  const diario = desafio.regra.diario!;
  const { resposta, placar, andamento, situacao, minuto, hoje, entradas, loteId, carregando, erro, aoVivo, lidoEm } = uso;
  const bateu = !!andamento?.bateu;
  const estilo = bateu ? ESTILO_BATIDO : estiloDoDia(desafio.visual.acento);
  const porQtd = !!andamento?.porQuantidade;
  const formatar = (v: number) => (porQtd ? `${Math.round(v)}` : formatBRL(v));
  const pagina = variante === 'pagina';

  // O feed de entradas desta sessão: cada lote novo entra no topo.
  const [feed, setFeed] = useState<LoteNoFeed[]>([]);
  useEffect(() => {
    if (!entradas.length) return;
    setFeed(f => [{ id: loteId, hora: horaCurta(new Date().toISOString()) ?? '', entradas }, ...f].slice(0, 6));
  }, [loteId, entradas]);

  if (erro) {
    return <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Não foi possível carregar o desafio: {erro}</p>;
  }
  if (carregando || !resposta) {
    return (
      <div role="status" aria-label="Carregando desafio do dia" className="space-y-4">
        <Skeleton className="h-48 rounded-2xl" /><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (resposta.estado === 'sem_banco') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <p className="text-foreground">
          O desafio do dia está configurado, mas o placar ao vivo depende de uma atualização do banco
          que ainda não foi aplicada <span className="text-muted-foreground">(migration 20261019140000)</span>.
        </p>
      </div>
    );
  }
  if (resposta.estado === 'fora') {
    return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Este desafio não está no seu alcance.</p>;
  }
  if (!placar || !placar.suportado) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        O desafio do dia ainda não mede setores da regra Cofen — lá o «hoje» do Painel vem do diário e da conciliação, que não têm hora.
      </p>
    );
  }

  // As pessoas e, embaixo, o dinheiro do setor (Receptivo, sem operador): as
  // barras dividem o TOTAL do desafio, que conta os dois.
  const linhas = linhasDoPlacar(placar);
  const total = linhas.reduce((s, c) => s + (porQtd ? c.qtd : c.total), 0) || 1;
  const receptivo = placar.contribuicaoReceptivo;
  const restante = minutosRestantes(diario, minuto);
  const horasRestantes = restante / 60;
  const ritmo = situacao === 'valendo' && !bateu && diario.horaFim !== null && andamento?.meta && horasRestantes > 0
    ? andamento.falta / Math.max(horasRestantes, 0.25)
    : null;
  const atualizado = horaCurta(placar.ultimaChegada);

  return (
    <div className={cn('space-y-5', pagina && 'lg:space-y-6')}>
      {/* ── Hero: o anel e a contagem regressiva ─────────────────────────── */}
      <section className={cn('relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5', estilo.hero, estilo.borda, pagina && 'sm:p-7')}>
        <div className={cn('flex flex-col items-center gap-5', pagina ? 'sm:flex-row sm:gap-8' : 'sm:flex-row')}>
          <AnelProgresso
            progresso={andamento?.progresso ?? 0}
            tamanho={pagina ? 184 : 150}
            espessura={pagina ? 14 : 12}
            cor={estilo.traco}
          >
            {bateu
              ? <Trophy className={cn('mb-1 h-6 w-6', estilo.texto)} aria-hidden="true" />
              : <Zap className={cn('mb-1 h-5 w-5', estilo.texto)} aria-hidden="true" />}
            <span className={cn('font-bold tabular-nums leading-none text-foreground', pagina ? 'text-4xl' : 'text-3xl')}>
              {Math.floor(andamento?.progresso ?? 0)}%
            </span>
            <span className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">concluído</span>
          </AnelProgresso>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', estilo.borda, estilo.suave, estilo.texto)}>
              {situacao === 'valendo' && !bateu && <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" /></span>}
              {situacao === 'apurando' && <Hourglass className="h-3 w-3" aria-hidden="true" />}
              {bateu ? 'Desafio batido!' : ROTULO_SITUACAO[situacao]}
            </span>

            {andamento?.meta == null ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {diario.medida === 'meta_diaria'
                  ? `${diario.alvoNome || 'O alvo'} não tem meta do mês cadastrada — sem ela não há meta diária para medir.`
                  : 'Desafio sem alvo definido.'}
              </p>
            ) : bateu ? (
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Já entraram</p>
                <ValorAnimado valor={andamento.realizado} formatar={v => (porQtd ? `${Math.round(v)} pagamentos` : formatBRL(v))}
                  className={cn('block font-bold tabular-nums', pagina ? 'text-5xl' : 'text-4xl', estilo.texto)} />
                <p className="mt-1 text-sm text-muted-foreground">
                  Alvo de {porQtd ? `${andamento.meta} pagamentos` : formatBRL(andamento.meta)} superado
                  {andamento.realizado > andamento.meta && <> em <span className="font-semibold text-foreground">{porQtd ? andamento.realizado - andamento.meta : formatBRL(andamento.realizado - andamento.meta)}</span></>}.
                </p>
              </div>
            ) : (
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Faltam</p>
                <ValorAnimado
                  valor={andamento.falta}
                  formatar={v => (porQtd ? `${Math.ceil(v)} ${Math.ceil(v) === 1 ? 'pagamento' : 'pagamentos'}` : formatBRL(v))}
                  className={cn('block font-bold tabular-nums tracking-tight', pagina ? 'text-5xl' : 'text-4xl', estilo.texto)}
                  classeDescendo="opacity-80"
                  aria-label="Quanto falta"
                />
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-semibold tabular-nums text-foreground">{formatar(andamento.realizado)}</span>
                  {porQtd ? ' pagamentos' : ''} de {porQtd ? `${andamento.meta}` : formatBRL(andamento.meta)}
                </p>
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-center gap-1.5 text-[11px] sm:justify-start">
              <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-1 text-muted-foreground">
                <Users className="h-3 w-3" aria-hidden="true" />{diario.alvoNome || ROTULO_PUBLICO[diario.publico]}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-1 text-muted-foreground">
                <CalendarDays className="h-3 w-3" aria-hidden="true" />
                {desafio.dataInicio === hoje ? 'Hoje' : dataCurta(desafio.dataInicio)}, {rotuloJanela(diario)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-1 text-muted-foreground">
                <Target className="h-3 w-3" aria-hidden="true" />{rotuloAlvo(diario, formatBRL)}
              </span>
              {!porQtd && receptivo.total > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-1 text-muted-foreground">
                  <Headset className="h-3 w-3" aria-hidden="true" />
                  inclui <span className="font-semibold tabular-nums text-foreground">{formatBRL(receptivo.total)}</span> do Receptivo
                </span>
              )}
              {situacao === 'valendo' && diario.horaFim !== null && (
                <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold', estilo.suave, estilo.texto)}>
                  <Clock className="h-3 w-3" aria-hidden="true" />termina em {duracaoCurta(restante)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Barra cheia embaixo do Hero: a mesma leitura da pílula. */}
        <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-background/60" aria-hidden="true">
          <motion.div
            className={cn('h-full rounded-full', estilo.barra)}
            initial={false}
            animate={{ width: `${Math.min(100, andamento?.progresso ?? 0)}%` }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </section>

      <div className={cn('grid gap-5', pagina && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]')}>
        <div className="space-y-5">
          {ritmo !== null && (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', estilo.suave)}>
                <Gauge className={cn('h-5 w-5', estilo.texto)} aria-hidden="true" />
              </span>
              <p className="text-sm text-foreground">
                Para bater, o ritmo é de{' '}
                <span className={cn('font-bold tabular-nums', estilo.texto)}>
                  {porQtd ? `${Math.ceil(ritmo)} pagamentos` : formatBRL(ritmo)}
                </span>{' '}
                por hora até as {rotuloHora(diario.horaFim!)}.
              </p>
            </div>
          )}

          {(desafio.premio || desafio.descricao) && (
            <div className="space-y-2">
              {desafio.premio && (
                <p className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-foreground">
                  <Gift className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />{desafio.premio}
                </p>
              )}
              {desafio.descricao && <p className="text-sm leading-relaxed text-muted-foreground">{desafio.descricao}</p>}
            </div>
          )}

          {/* ── Quem está fazendo acontecer ──────────────────────────────── */}
          <section aria-label="Quem já contribuiu" className="rounded-xl border border-border bg-card">
            <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">Quem está fazendo acontecer</h3>
              <span className="text-xs text-muted-foreground">{placar.contribuintes.length} {placar.contribuintes.length === 1 ? 'pessoa' : 'pessoas'}</span>
            </header>
            {linhas.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {situacao === 'agendado' ? 'O desafio ainda não começou.' : 'Ainda não entrou nenhum pagamento. O primeiro a fazer entrar aparece aqui.'}
              </p>
            ) : (
              <ol className="divide-y divide-border">
                {linhas.map((c, i) => {
                  const valor = porQtd ? c.qtd : c.total;
                  const parte = Math.max(2, (valor / total) * 100);
                  const voce = c.id === operadorId;
                  const doSetor = ehLinhaDoSetor(c.id);
                  return (
                    <motion.li
                      layout
                      key={c.id}
                      className={cn('flex items-center gap-3 px-4 py-2.5', voce && estilo.suave, doSetor && 'bg-muted/30')}
                    >
                      <span className="w-5 text-right text-xs font-semibold tabular-nums text-muted-foreground">{doSetor ? '' : i + 1}</span>
                      <RostoDaLinha id={c.id} nome={c.nome} fotoUrl={c.fotoUrl} className="h-8 w-8" classeIcone="h-4 w-4" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {c.id === ID_RECEPTIVO ? 'Contribuição do Receptivo' : doSetor ? 'Pagamento sem operador' : c.nome}
                          {voce && <span className={cn('ml-1.5 text-[10px] font-semibold uppercase', estilo.texto)}>você</span>}
                        </p>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                          <motion.div className={cn('h-full rounded-full', estilo.barra)} initial={false} animate={{ width: `${parte}%` }} transition={{ duration: 0.6 }} />
                        </div>
                      </div>
                      <div className="text-right">
                        <ValorAnimado valor={valor} formatar={formatar} className="block text-sm font-semibold tabular-nums text-foreground" />
                        {!porQtd && <span className="text-[10px] text-muted-foreground">{c.qtd} {c.qtd === 1 ? 'pagamento' : 'pagamentos'}</span>}
                      </div>
                    </motion.li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-5">
          {/* ── Entrou agora ─────────────────────────────────────────────── */}
          <section aria-label="Entrou agora" className="rounded-xl border border-border bg-card">
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Sparkles className={cn('h-4 w-4', estilo.texto)} aria-hidden="true" />
              <h3 className="text-sm font-semibold text-foreground">Entrou agora</h3>
            </header>
            {feed.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs leading-relaxed text-muted-foreground">
                Fique de olho: cada pagamento que entrar aparece aqui, e a contagem lá em cima diminui.
              </p>
            ) : (
              <ul className="space-y-2 p-3">
                <AnimatePresence initial={false}>
                  {feed.map(lote => (
                    <motion.li
                      key={lote.id}
                      initial={{ opacity: 0, y: -8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className={cn('rounded-lg border p-2.5', estilo.borda, estilo.suave)}
                    >
                      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{lote.hora}</p>
                      <ul className="space-y-1">
                        {lote.entradas.slice(0, 5).map(e => (
                          <li key={e.id} className="flex items-center gap-2 text-xs">
                            <RostoDaLinha id={e.id} nome={e.nome} fotoUrl={e.fotoUrl} className="h-5 w-5" classeIcone="h-3 w-3" />
                            <span className="min-w-0 flex-1 truncate text-foreground">
                              {e.id === ID_RECEPTIVO ? 'Contribuição do Receptivo' : e.nome}
                            </span>
                            <span className={cn('font-semibold tabular-nums', estilo.texto)}>
                              {porQtd ? `+${e.qtd}` : `+${formatBRL(e.valor)}`}
                            </span>
                          </li>
                        ))}
                        {lote.entradas.length > 5 && <li className="text-[11px] text-muted-foreground">e mais {lote.entradas.length - 5}</li>}
                      </ul>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>

          <div className="space-y-1.5 rounded-xl border border-dashed border-border p-3 text-[11px] leading-relaxed text-muted-foreground">
            {situacao !== 'encerrado' && situacao !== 'agendado' && (
              <p className="flex items-start gap-1.5">
                <Radio className={cn('mt-0.5 h-3 w-3 shrink-0', aoVivo && estilo.texto)} aria-hidden="true" />
                {aoVivo ? (
                  <span>
                    <span className={cn('font-semibold', estilo.texto)}>Ao vivo.</span> O placar se atualiza sozinho a cada
                    rodada do relatório; a próxima é por volta das <span className="font-medium text-foreground">{proximaRodada(minuto)}</span>.
                    {lidoEm && <> Lido às <span className="font-medium text-foreground">{horaCurta(new Date(lidoEm).toISOString())}</span>.</>}
                  </span>
                ) : (
                  <span>Você não está neste desafio: o placar é o de quando você abriu.</span>
                )}
              </p>
            )}
            <p className="flex items-start gap-1.5">
              <Database className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              <span>
                Mesma conta do Painel do Líder: o Analítico, alimentado pelo relatório 58 e reconciliado pelo 59.
                {placar.publico === 'setor' && ' Conta tudo o que entrou no setor com pagamento do dia, a Contribuição do Receptivo incluída.'}
                {atualizado && <> Última chegada às <span className="font-medium text-foreground">{atualizado}</span>.</>}
              </span>
            </p>
            {diario.horaInicio !== null && diario.horaFim !== null && (
              <p className="flex items-start gap-1.5">
                <Clock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                <span>
                  O relatório não traz a hora do pagamento: conta o que chega ao sistema na janela. O robô do 59 passa
                  no minuto 07 de cada hora, então o placar fecha às {rotuloHora(diario.horaFim % 24)}07.
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
