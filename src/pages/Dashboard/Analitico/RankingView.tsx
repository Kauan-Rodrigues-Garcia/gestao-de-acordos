/**
 * RankingView — o ranking do Analítico, desenhado como a corrida do mês.
 *
 * Usado na visão do líder e na do operador. Três partes:
 *
 *   • o 1º num cartão largo de liderança, com a vantagem sobre o 2º;
 *   • 2º e 3º como perseguidores, cada um com quanto falta para o de cima;
 *   • do 4º em diante, a PISTA: cada linha tem um trilho onde o marcador fica
 *     na distância real até o líder, o fantasma é quem está logo à frente e o
 *     tracejado entre os dois é o que falta correr.
 *
 * Quem está olhando (`destaqueOperadorId`) ganha a faixa «Sua corrida» no
 * topo — posição, alvo e folga — e a própria linha destacada.
 *
 * Inspirado no Ranking de quitação (medalha só no anel e no numeral, tokens do
 * tema por `color-mix`), mas com outro motivo: a bandeira quadriculada de
 * chegada, no topo do cartão do líder e no fim de cada trilho.
 *
 * ## Os três critérios
 *
 * `recebimento` é o histórico, e é o que a tela faz quando ninguém passa
 * `criterio`. `percentual` troca a régua: a posição e a pista saem do
 * percentual da meta, e as distâncias passam a ser em pontos percentuais — o
 * valor recebido continua na tela, menor. `equipes` troca o SUJEITO: a corrida
 * é de equipes e subgrupos, e a lista de pessoas vem embaixo, como
 * detalhamento.
 *
 * A ordenação não acontece aqui. Ela mora em `rankingCriterio.ts`, que é puro
 * e testado; esta tela recebe as listas já na ordem e só desenha.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, Copy, Crosshair, Flag, ShieldCheck, TrendingUp, Users } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { copiarTexto } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import { AvatarParticipante } from '@/pages/Analitico/Desafios/AvatarParticipante';
import type { ResumoOperadorAnalitico } from '@/services/analitico/analitico.service';
import type { CriterioRanking } from '@/services/analitico/rankingConfig.service';
import type { LinhaRanking, LinhaGrupoRanking } from './rankingCriterio';
import {
  distancia, fracaoNaPista, maiorBase, nomeCurto, resumoDaCorrida,
  type Corredor, type ResumoDaCorrida,
} from './ranking/corrida';
import './ranking/corrida.css';

interface RankingViewProps {
  /**
   * As linhas do ranking, JÁ ORDENADAS.
   *
   * O tipo aceita `ResumoOperadorAnalitico` puro porque as chamadas que não
   * configuram critério nenhum (a visão do operador, por exemplo) passam o
   * resumo cru — `pct` e `grupoNome` chegam como `undefined` e a tela cai no
   * desenho por recebimento.
   */
  resumos: (ResumoOperadorAnalitico | LinhaRanking)[];
  destaqueOperadorId?: string | null;
  /** Exibe o botão "Copiar mensagem" em cada posição (visão líder+). */
  mostrarCopiar?: boolean;
  /** Item 5: ids que somem do ranking (férias/desligado). O recebimento deles
   *  continua nos totais — o filtro é só de exibição. */
  operadoresOcultos?: Set<string>;
  /** Régua da posição. Ausente = `recebimento`, o comportamento histórico. */
  criterio?: CriterioRanking;
  /** Corrida de equipes/subgrupos. Só desenhada quando `criterio` é `equipes`. */
  grupos?: LinhaGrupoRanking[];
  /** operador_id → foto_url. Ausente = iniciais. */
  fotos?: Record<string, string | null>;
}

/** A linha com os campos opcionais do ranking configurável já resolvidos. */
type Linha = ResumoOperadorAnalitico & Partial<Pick<LinhaRanking, 'pct' | 'grupoNome'>>;

/** Um corredor já com o texto que a tela escreve. */
interface Item extends Corredor {
  principal: string;
  legenda: string;
  linha?: Linha;
  grupo?: boolean;
}

/** Ouro, prata e bronze — só no anel, no numeral e no tom dos três cartões. */
const MEDALHA = ['#C9A227', '#A3ADB8', '#B4743F'] as const;

/** Quantas linhas da pista aparecem antes do «ver todos». */
const PISTA_INICIAL = 17;

const pp = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const textoDistancia = (v: number, porPct: boolean) => (porPct ? `${pp(v)} p.p.` : formatBRL(v));

// ── A mensagem do «Copiar» ─────────────────────────────────────────────────

/** Saudação conforme o horário: manhã, tarde ou noite. */
function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/**
 * Mensagem motivacional do ranking (mesmo formato do protótipo HTML).
 *
 * No critério de percentual a mensagem fala de percentual: mandar "faltam
 * R$ X para ultrapassar" para alguém cuja posição é decidida por porcentagem
 * manda a pessoa correr atrás do número errado.
 */
function montarMensagemRanking(
  pos: number, nome: string, r: Linha,
  acima: Linha | null, criterio: CriterioRanking,
): string {
  const ola = saudacao();
  const porPct = criterio === 'percentual' && r.pct != null;
  const meu = porPct ? `${r.pct}% da meta` : `${formatBRL(r.total_recebido)} de recebido geral`;

  if (pos === 1) {
    return `${ola}, ${nome}! Você está em 1º lugar, com ${meu}. Continue nesse ritmo para manter a liderança.`;
  }

  const sufixo = pos === 2 ? 'para assumir a liderança' : 'para ultrapassar o próximo lugar';
  const nomeAcima = acima ? nomeCurto(acima.operador_nome ?? acima.operador_usuario ?? '') : '';

  if (porPct && acima?.pct != null) {
    const falta = Math.max(0, acima.pct - (r.pct ?? 0));
    return `${ola}, ${nome}! Você está em ${pos}º lugar, com ${meu}. À sua frente está ${nomeAcima}, e faltam ${falta} pontos percentuais ${sufixo}.`;
  }

  const gap = acima ? acima.total_recebido - r.total_recebido : 0;
  return `${ola}, ${nome}! Você está em ${pos}º lugar, com ${meu}. À sua frente está ${nomeAcima}, e faltam ${formatBRL(gap)} ${sufixo}.`;
}

function CopiarMsg({
  pos, item, acima, criterio, compacto,
}: {
  pos: number; item: Item; acima: Item | null; criterio: CriterioRanking; compacto?: boolean;
}) {
  if (!item.linha) return null;
  const msg = montarMensagemRanking(pos, nomeCurto(item.nome), item.linha, acima?.linha ?? null, criterio);
  const copiar = (e: React.MouseEvent) => { e.stopPropagation(); void copiarTexto(msg, 'Mensagem copiada'); };
  if (compacto) {
    return (
      <button type="button" onClick={copiar}
        title="Copiar mensagem" aria-label={`Copiar mensagem para ${item.nome}`}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Copy className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <button type="button" onClick={copiar}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Copy className="h-3 w-3 shrink-0" /> Copiar mensagem
    </button>
  );
}

// ── Peças ──────────────────────────────────────────────────────────────────

function Rosto({ item, className }: { item: Item; className?: string }) {
  if (item.grupo) {
    return (
      <span className={cn('flex shrink-0 items-center justify-center rounded-full border border-border bg-primary/10 text-primary', className)}>
        <Users className="h-[45%] w-[45%]" aria-hidden="true" />
      </span>
    );
  }
  return <AvatarParticipante nome={item.nome} fotoUrl={item.foto} className={cn('shrink-0', className)} />;
}

function SeloVoce() {
  return (
    <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-primary">
      Você
    </span>
  );
}

/** O 1º: o cartão largo, com a vantagem sobre o 2º. */
function Pole({ item, segundo, podio, maior, porPct, voce, acao }: {
  item: Item; segundo: Item | null; podio: Item[]; maior: number; porPct: boolean; voce: boolean; acao?: ReactNode;
}) {
  const folga = segundo ? distancia(item, segundo) : null;
  return (
    <article className="rc-pole flex h-full flex-col p-5 sm:p-6" style={{ '--medalha': MEDALHA[0] } as CSSProperties}
      aria-label={`1º lugar: ${item.nome}, ${item.principal}`}>
      <span className="rc-faixa rc-quadriculado" aria-hidden="true" />
      <span className="rc-numeral rc-numeral-topo" aria-hidden="true">1</span>

      <div className="flex items-center gap-4 pr-9 sm:pr-14">
        <div className="relative isolate shrink-0">
          <span className="rc-brilho" aria-hidden="true" />
          <div className="rc-anel rounded-full p-[3px]">
            <Rosto item={item} className="h-16 w-16 border-2 border-card bg-card text-lg sm:h-20 sm:w-20" />
          </div>
        </div>
        <div className="min-w-0">
          <p className="rc-tinta flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]">
            <Flag className="h-3.5 w-3.5" aria-hidden="true" /> 1º lugar<span className="hidden sm:inline"> · lidera o mês</span>
          </p>
          <p className="mt-0.5 flex min-w-0 items-center gap-2 text-lg font-bold leading-tight text-foreground sm:text-xl">
            <span className="truncate">{item.nome}</span>
            {voce && <SeloVoce />}
          </p>
          {item.sub && <p className="truncate font-mono text-xs text-muted-foreground">{item.sub}</p>}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{item.principal}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{item.legenda}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {segundo && folga != null && folga > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur-sm">
              <TrendingUp className="rc-tinta h-3.5 w-3.5" aria-hidden="true" />
              <strong className="font-mono text-foreground">{textoDistancia(folga, porPct)}</strong> à frente do 2º
            </span>
          )}
          {!segundo && (
            <span className="rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">
              Sozinho na pista
            </span>
          )}
          {acao}
        </div>
      </div>

      {podio.length > 1 && <PodioNaPista podio={podio} maior={maior} />}
    </article>
  );
}

/**
 * Os três medalhões na mesma régua do líder: mostra num relance se o pódio é
 * disputado (medalhões encostados) ou se o 1º disparou (medalhões espalhados).
 */
function PodioNaPista({ podio, maior }: { podio: Item[]; maior: number }) {
  const reduzir = useReducedMotion();
  const pos = (f: number) => `calc(${(f * 100).toFixed(2)}% - ${(f * 22).toFixed(2)}px)`;
  return (
    <div className="mt-auto pt-6">
      <p className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Pódio na pista
      </p>
      <div className="rc-trilho rc-trilho-podio" aria-hidden="true">
        <span className="rc-linha" />
        {[0.25, 0.5, 0.75].map(m => <span key={m} className="rc-marca" style={{ left: pos(m) }} />)}
        <span className="rc-chegada rc-quadriculado" />
        {[...podio].reverse().map((c, iRev) => {
          const i = podio.length - 1 - iRev;
          const alvo = pos(fracaoNaPista(c.base, maior));
          return (
            <motion.span key={c.id} className="rc-medalhao"
              title={`${i + 1}º · ${c.nome} · ${c.principal}`}
              style={{ '--medalha': MEDALHA[i], ...(reduzir ? { left: alvo } : {}) } as CSSProperties}
              initial={reduzir ? false : { left: pos(0) }}
              animate={{ left: alvo }}
              transition={{ duration: 0.9, delay: reduzir ? 0 : 0.1 * (2 - i), ease: [0.22, 1, 0.36, 1] }}>
              {i + 1}
            </motion.span>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground" aria-hidden="true">
        <span>largada</span>
        <span>chegada</span>
      </div>
    </div>
  );
}

/** 2º e 3º: quanto falta para quem está logo acima. */
function Perseguidor({ item, posicao, frente, porPct, voce, acao }: {
  item: Item; posicao: 2 | 3; frente: Item; porPct: boolean; voce: boolean; acao?: ReactNode;
}) {
  const falta = distancia(frente, item);
  const proporcao = frente.base && item.base != null ? Math.min(1, item.base / frente.base) : 0;
  return (
    <article className="rc-perseguidor flex flex-col p-4" style={{ '--medalha': MEDALHA[posicao - 1] } as CSSProperties}
      aria-label={`${posicao}º lugar: ${item.nome}, ${item.principal}`}>
      <span className="rc-numeral rc-numeral-topo" aria-hidden="true">{posicao}</span>
      <div className="flex items-center gap-3 pr-9 sm:pr-14">
        <div className="rc-anel shrink-0 rounded-full p-[2px]">
          <Rosto item={item} className="h-11 w-11 border-2 border-card bg-card text-sm" />
        </div>
        <div className="min-w-0">
          <p className="rc-tinta text-[10px] font-bold uppercase tracking-[0.14em]">{posicao}º lugar</p>
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold leading-tight text-foreground">
            <span className="truncate">{item.nome}</span>
            {voce && <SeloVoce />}
          </p>
          {item.sub && <p className="truncate font-mono text-[11px] text-muted-foreground">{item.sub}</p>}
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-xl font-bold tracking-tight text-foreground">{item.principal}</p>
          <p className="text-[11px] text-muted-foreground">{item.legenda}</p>
        </div>
        {acao}
      </div>
      {falta != null && falta > 0 && (
        <div className="mt-auto pt-3">
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground">
              Faltam <strong className="font-mono text-foreground">{textoDistancia(falta, porPct)}</strong> para o {posicao - 1}º
            </span>
            <span className="font-mono tabular-nums text-muted-foreground">{Math.round(proporcao * 100)}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="rc-barra-medalha h-full rounded-full" style={{ width: `${Math.max(3, proporcao * 100)}%` }} />
          </div>
        </div>
      )}
    </article>
  );
}

/** «Sua corrida»: posição, quem perseguir e quanto de folga. */
function SuaCorrida({ r, porPct }: { r: ResumoDaCorrida; porPct: boolean }) {
  return (
    <section aria-label="Sua corrida" className="rc-sua grid overflow-hidden sm:grid-cols-3">
      <div className="flex items-center gap-3 px-4 py-3">
        <Flag className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Sua posição</p>
          <p className="text-sm text-muted-foreground">
            <strong className="font-mono text-xl text-foreground">{r.posicao}º</strong> de {r.de}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <Crosshair className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Seu alvo</p>
          {r.alvo ? (
            <p className="truncate text-sm text-muted-foreground">
              {r.alvo.falta != null
                ? <>Faltam <strong className="font-mono text-foreground">{textoDistancia(r.alvo.falta, porPct)}</strong> para </>
                : <>À frente: </>}
              <span className="text-foreground">{nomeCurto(r.alvo.nome)}</span> ({r.alvo.posicao}º)
            </p>
          ) : (
            <p className="text-sm font-medium text-foreground">Você lidera o mês</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Sua folga</p>
          {r.folga ? (
            <p className="truncate text-sm text-muted-foreground">
              {r.folga.valor != null && <><strong className="font-mono text-foreground">{textoDistancia(r.folga.valor, porPct)}</strong> sobre </>}
              <span className="text-foreground">{nomeCurto(r.folga.nome)}</span> ({r.folga.posicao}º)
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Ninguém atrás de você</p>
          )}
        </div>
      </div>
    </section>
  );
}

/** O trilho de uma linha: o corredor, o fantasma da frente e o que falta. */
function Trilho({ item, frente, maior }: { item: Item; frente: Item | null; maior: number }) {
  const reduzir = useReducedMotion();
  // Até 10 px antes do fim: o último trecho é a chegada quadriculada.
  const pos = (f: number) => `calc(${(f * 100).toFixed(2)}% - ${(f * 10).toFixed(2)}px)`;
  const eu = fracaoNaPista(item.base, maior);
  const ff = frente ? fracaoNaPista(frente.base, maior) : null;
  const semRegua = item.base == null;
  return (
    <div className="rc-trilho" aria-hidden="true">
      <span className="rc-linha" />
      {[0.25, 0.5, 0.75].map(m => <span key={m} className="rc-marca" style={{ left: pos(m) }} />)}
      <span className="rc-chegada rc-quadriculado" />
      {ff != null && !semRegua && ff > eu && (
        <>
          <span className="rc-falta" style={{ left: pos(eu), width: `calc(${((ff - eu) * 100).toFixed(2)}% - ${((ff - eu) * 10).toFixed(2)}px)` }} />
          <span className="rc-fantasma" style={{ left: pos(ff) }} />
        </>
      )}
      {!semRegua && (
        <motion.span
          className="rc-marcador"
          initial={reduzir ? false : { left: pos(0) }}
          animate={{ left: pos(eu) }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          style={reduzir ? { left: pos(eu) } : undefined}
        />
      )}
    </div>
  );
}

/** A pista: do `inicio`º em diante, cada linha com o seu trilho. */
function Pista({
  titulo, itens, todos, inicio, maior, porPct, destaqueId, acao,
}: {
  titulo: string;
  itens: Item[];
  /** A lista inteira, para achar quem está à frente do primeiro da pista. */
  todos: Item[];
  inicio: number;
  maior: number;
  porPct: boolean;
  destaqueId?: string | null;
  acao?: (item: Item, pos: number, frente: Item | null) => ReactNode;
}) {
  const [verTodos, setVerTodos] = useState(false);
  if (itens.length === 0) return null;
  // Quem está olhando nunca fica escondido atrás do «ver todos».
  const idxVoce = destaqueId ? itens.findIndex(i => i.id === destaqueId) : -1;
  const corte = Math.max(PISTA_INICIAL, idxVoce + 1);
  const visiveis = verTodos ? itens : itens.slice(0, corte);

  return (
    <section className="space-y-2" aria-label={titulo}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> posição</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-primary/45" /> quem está à frente</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-primary/55" /> o que falta</span>
          <span className="inline-flex items-center gap-1.5"><span className="rc-quadriculado h-3 w-2 rounded-[2px] opacity-45" /> 1º</span>
        </div>
      </div>

      <ol className="rc-pista overflow-hidden">
        {visiveis.map((item, i) => {
          const pos = inicio + i;
          const frente = todos[pos - 2] ?? null;
          const falta = distancia(frente, item);
          const voce = !!destaqueId && item.id === destaqueId;
          const denso = pos > 10;
          return (
            <li key={item.id}
              aria-label={`${pos}º: ${item.nome}, ${item.principal}${falta ? `, faltam ${textoDistancia(falta, porPct)} para o ${pos - 1}º` : ''}`}
              className={cn(
                'grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 sm:px-4',
                'md:grid-cols-[1.75rem_minmax(11rem,16rem)_minmax(0,1fr)_auto]',
                denso ? 'py-2' : 'py-2.5',
                voce ? 'rc-eu' : 'transition-colors hover:bg-muted/25',
              )}>
              <span className={cn('text-right font-mono font-bold tabular-nums', voce ? 'text-primary' : 'text-muted-foreground', denso ? 'text-xs' : 'text-sm')}>
                {pos}º
              </span>
              <div className="flex min-w-0 items-center gap-2.5">
                <Rosto item={item} className={cn(denso ? 'h-7 w-7 text-[10px]' : 'h-8 w-8 text-xs')} />
                <div className="min-w-0">
                  <p className={cn('flex min-w-0 items-center gap-1.5 font-medium text-foreground', denso ? 'text-xs' : 'text-sm')}>
                    <span className="truncate">{item.nome}</span>
                    {voce && <SeloVoce />}
                  </p>
                  {item.sub && <p className="truncate text-[11px] text-muted-foreground">{item.sub}</p>}
                </div>
              </div>
              <div className="order-last col-span-3 md:order-none md:col-span-1">
                <Trilho item={item} frente={frente} maior={maior} />
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className={cn('font-mono font-bold tabular-nums text-foreground', denso ? 'text-xs' : 'text-sm')}>{item.principal}</p>
                  <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                    {falta != null && falta > 0
                      ? <>faltam <span className="font-mono text-primary">{textoDistancia(falta, porPct)}</span></>
                      : item.legenda}
                  </p>
                </div>
                {acao?.(item, pos, frente)}
              </div>
            </li>
          );
        })}
      </ol>

      {itens.length > corte && (
        <div className="flex justify-center">
          <button type="button" onClick={() => setVerTodos(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', verTodos && 'rotate-180')} />
            {verTodos ? 'Mostrar menos' : `Ver todos (${itens.length - corte} a mais)`}
          </button>
        </div>
      )}
    </section>
  );
}

/** Pódio + pista para uma lista de corredores já ordenada. */
function Corrida({
  itens, porPct, destaqueId, criterio, mostrarCopiar, tituloPista,
}: {
  itens: Item[]; porPct: boolean; destaqueId?: string | null; criterio: CriterioRanking;
  mostrarCopiar?: boolean; tituloPista: string;
}) {
  const maior = maiorBase(itens);
  const [primeiro, segundo, terceiro] = itens;
  const ehVoce = (i?: Item) => !!i && !!destaqueId && i.id === destaqueId;
  const copiar = (item: Item, pos: number, frente: Item | null, compacto?: boolean) =>
    mostrarCopiar ? <CopiarMsg pos={pos} item={item} acima={frente} criterio={criterio} compacto={compacto} /> : null;

  return (
    <div className="space-y-4">
      <div className={cn('grid gap-3', segundo && 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]')}>
        <Pole item={primeiro} segundo={segundo ?? null} podio={itens.slice(0, 3)} maior={maior}
          porPct={porPct} voce={ehVoce(primeiro)}
          acao={copiar(primeiro, 1, null)} />
        {segundo && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Perseguidor item={segundo} posicao={2} frente={primeiro} porPct={porPct} voce={ehVoce(segundo)}
              acao={copiar(segundo, 2, primeiro, true)} />
            {terceiro && (
              <Perseguidor item={terceiro} posicao={3} frente={segundo} porPct={porPct} voce={ehVoce(terceiro)}
                acao={copiar(terceiro, 3, segundo, true)} />
            )}
          </div>
        )}
      </div>

      <Pista
        titulo={tituloPista}
        itens={itens.slice(3)}
        todos={itens}
        inicio={4}
        maior={maior}
        porPct={porPct}
        destaqueId={destaqueId}
        acao={mostrarCopiar ? (item, pos, frente) => copiar(item, pos, frente, true) : undefined}
      />
    </div>
  );
}

// ── O componente ───────────────────────────────────────────────────────────

export function RankingView({
  resumos, destaqueOperadorId, mostrarCopiar, operadoresOcultos,
  criterio = 'recebimento', grupos, fotos,
}: RankingViewProps) {
  // Item 5: férias/desligado saem do ranking (o recebimento deles segue nos totais).
  const todas = resumos as Linha[];
  const lista = operadoresOcultos ? todas.filter(r => !operadoresOcultos.has(r.operador_id)) : todas;
  const porPct = criterio === 'percentual';

  const pessoas: Item[] = lista.map(r => {
    const semMeta = porPct && r.pct == null;
    const pagamentos = `${r.total_pagamentos} ${r.total_pagamentos === 1 ? 'pagamento' : 'pagamentos'}`;
    return {
      id: r.operador_id,
      nome: r.operador_nome ?? r.operador_usuario,
      sub: r.grupoNome ?? r.operador_usuario ?? null,
      foto: fotos?.[r.operador_id] ?? null,
      base: porPct ? (r.pct ?? null) : r.total_recebido,
      principal: porPct ? (semMeta ? 'sem meta' : `${pp(r.pct!)}%`) : formatBRL(r.total_recebido),
      legenda: porPct ? `${formatBRL(r.total_recebido)} · ${pagamentos}` : pagamentos,
      linha: r,
    };
  });

  // Critério de equipes: a corrida é dos grupos, e as pessoas viram detalhamento.
  if (criterio === 'equipes' && grupos) {
    if (grupos.length === 0) {
      return <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma equipe com recebimento neste mês.</p>;
    }
    const times: Item[] = grupos.map((g, i) => ({
      id: g.grupoId ?? `__sem_grupo__${i}`,
      nome: g.grupoNome,
      sub: `${g.operadores} ${g.operadores === 1 ? 'pessoa' : 'pessoas'}`,
      base: g.totalRecebido,
      principal: formatBRL(g.totalRecebido),
      legenda: `${g.totalPagamentos} pagamentos`,
      grupo: true,
    }));
    return (
      <div className="space-y-6">
        <Corrida itens={times} porPct={false} criterio={criterio} tituloPista="A pista das equipes · 4º em diante" />
        {pessoas.length > 0 && (
          <Pista
            titulo="Quem puxou o resultado"
            itens={pessoas}
            todos={pessoas}
            inicio={1}
            maior={maiorBase(pessoas)}
            porPct={false}
            destaqueId={destaqueOperadorId}
          />
        )}
      </div>
    );
  }

  if (pessoas.length === 0) return null;
  const sua = destaqueOperadorId ? resumoDaCorrida(pessoas, destaqueOperadorId) : null;

  return (
    <div className="space-y-4">
      {sua && <SuaCorrida r={sua} porPct={porPct} />}
      <Corrida
        itens={pessoas}
        porPct={porPct}
        destaqueId={destaqueOperadorId}
        criterio={criterio}
        mostrarCopiar={mostrarCopiar}
        tituloPista="A pista · 4º em diante"
      />
    </div>
  );
}
