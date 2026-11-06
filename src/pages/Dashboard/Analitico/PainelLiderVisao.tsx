/**
 * PainelLiderVisao — o Painel do Líder redesenhado (MODELO, 06/11/2026).
 *
 * Pedido do Cleber: uma aba que o líder abre e entende na hora «como está o
 * setor, como está cada equipe, e o que precisa entrar para amanhã».
 *
 * ## Só a apresentação é nova
 *
 * Os números chegam prontos de `DesempenhoEquipes` — o mesmo acumulado, a
 * mesma meta, os mesmos dias úteis (inclusive equipe em treino) e as mesmas
 * pessoas que os cards de hoje usam. As contas são as de sempre:
 * `detalharEquipe` (equipe e setor) e `calcularProjecao`/`degrausComAmanha`
 * (pessoas). Aqui não nasce regra nenhuma; só se decide o que aparece onde.
 *
 * ## A leitura, de cima para baixo
 *
 *   1. **O setor numa frase** — «está a 92% do ritmo da meta» — e as três
 *      respostas que o líder procura: até hoje, para amanhã, onde fecha.
 *   2. **A pista das equipes** — cada equipe numa raia, na régua do ritmo
 *      (0% a 130%), com as faixas de quartil ao fundo e a linha dos 100%. Quem
 *      está onde se lê sem número. Clicar numa raia abre a equipe.
 *   3. **A equipe aberta** — as mesmas três respostas, a escada de faixas
 *      (hoje e amanhã) e as pessoas, cada uma na mesma régua.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Copy, Users, Flame, LifeBuoy, SlidersHorizontal, GraduationCap, Building2, Loader2,
} from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { COR_QUARTIL, corProjecao } from '@/lib/diasUteis';
import { calcularProjecao, degrausComAmanha } from '@/lib/projecaoMetas';
import { corTexto } from '@/lib/temas';
import { cn } from '@/lib/utils';
import { copiarTexto } from '@/lib/clipboard';
import { rotuloDoMes, type MesRef } from '@/lib/mesReferencia';
import type { QuartilConfig } from '@/lib/supabase';
import { detalharEquipe, type DetalheEquipe, type OperadorNaEquipe } from './desempenhoEquipe';
import { montarMensagemEquipe } from './mensagemEquipe';
import type { LiderInfo } from './lideresDaEquipe';
import { rotuloUnidade, type UnidadeValor } from '@/lib/unidadeValor';
import { SeletorUnidade } from '@/components/PainelMetas/SeletorUnidade';

// ── Contrato com DesempenhoEquipes ───────────────────────────────────────────

/** Um setor ou uma equipe, com os números que o card de hoje recebe. */
export interface AlvoPainel {
  id: string;
  titulo: string;
  subtitulo?: string;
  lideres: LiderInfo[];
  /** Foto do setor (só no setor). */
  foto?: string | null;
  treino?: boolean;
  acumulado: number;
  acumuladoHO: number;
  ajusteManual: number;
  meta: number | null;
  metaHO: number | null;
  /** Lê em H.O.: setor da regra Cofen com a chave em H.O. */
  mostrarHO: boolean;
  /** Setor da regra Cofen — tem H.O. e bruto, e a chave alterna entre os dois. */
  cofen?: boolean;
  totalUteis: number;
  decorridos: number;
  quartis: QuartilConfig[];
  operadores?: readonly OperadorNaEquipe[];
}

export interface GrupoPainel {
  setorId: string;
  /** Setor da regra Cofen (`setores.regra`): mostra a chave H.O. ⇄ bruto. */
  cofen?: boolean;
  nomeSetor: string;
  /** `null` com filtro de equipe: o número do setor contradiria o recorte. */
  setor: AlvoPainel | null;
  /** O setor Cofen espera a conciliação. */
  estadoSetor?: { tipo: 'carregando' } | { tipo: 'erro'; tentar: () => void };
  /** Card da Contribuição Receptivo (BookPlay), como é hoje. */
  extra?: ReactNode;
  equipes: AlvoPainel[];
}

interface Props {
  grupos: GrupoPainel[];
  mes: string;
  rodape: string;
  /** A equipe do líder: abre selecionada. */
  equipePreferida?: string | null;
  /** H.O. ou bruto — só tem efeito nos setores da regra Cofen. */
  unidade: UnidadeValor;
  onUnidade: (u: UnidadeValor) => void;
}

// ── Leitura de um alvo ───────────────────────────────────────────────────────

/** A régua da pista vai de 0% a ESCALA% do ritmo. */
const ESCALA = 130;

interface Leitura {
  alvo: AlvoPainel;
  acum: number;
  meta: number | null;
  emHO: boolean;
  /** 'H.O.' ou 'Bruto' no setor Cofen; `null` onde só existe uma unidade. */
  rotulo: string | null;
  d: DetalheEquipe;
  esperado: number | null;
  pct: number | null;
  cor: string;
}

function ler(alvo: AlvoPainel): Leitura {
  // A mesma unidade do CardEquipe: em H.O., barra, projeção e falta em H.O.
  const emHO = alvo.mostrarHO;
  const acum = emHO ? alvo.acumuladoHO : alvo.acumulado;
  const meta = emHO ? (alvo.metaHO != null && alvo.metaHO > 0 ? alvo.metaHO : null) : alvo.meta;
  const d = detalharEquipe({
    acumulado: acum, meta, totalUteis: alvo.totalUteis, decorridos: alvo.decorridos,
    quartis: alvo.quartis, operadores: alvo.operadores ?? [],
  });
  const esperado = meta !== null && meta > 0 && alvo.totalUteis > 0
    ? (meta / alvo.totalUteis) * Math.max(alvo.decorridos, 1)
    : null;
  const pct = d.projecaoPct;
  const rotulo = emHO ? 'H.O.' : alvo.cofen ? 'Bruto' : null;
  return { alvo, acum, meta, emHO, rotulo, d, esperado, pct, cor: pct !== null ? corProjecao(pct) : 'var(--muted-foreground)' };
}

const sinal = (v: number) => `${v >= 0 ? '+' : '−'}${formatBRL(Math.abs(v))}`;

// ── Peças pequenas ───────────────────────────────────────────────────────────

function Avatar({ nome, foto, tamanho = 'md' }: { nome: string; foto?: string | null; tamanho?: 'sm' | 'md' | 'lg' }) {
  const t = tamanho === 'lg' ? 'w-14 h-14 text-lg' : tamanho === 'md' ? 'w-9 h-9 text-sm' : 'w-7 h-7 text-[11px]';
  return foto
    ? <img src={foto} alt={nome} title={nome} className={cn(t, 'rounded-full object-cover border-2 border-card bg-card shrink-0')} />
    : (
      <span title={nome} className={cn(t, 'rounded-full border-2 border-card bg-muted text-muted-foreground font-bold flex items-center justify-center shrink-0')}>
        {nome.charAt(0).toUpperCase()}
      </span>
    );
}

function Lideres({ lideres, tamanho = 'md' }: { lideres: LiderInfo[]; tamanho?: 'sm' | 'md' | 'lg' }) {
  if (!lideres.length) {
    return (
      <span className={cn(
        'rounded-full bg-muted text-muted-foreground flex items-center justify-center shrink-0 border-2 border-card',
        tamanho === 'lg' ? 'w-14 h-14' : 'w-9 h-9',
      )}>
        <Users className="w-4 h-4" />
      </span>
    );
  }
  return (
    <span className="flex -space-x-2.5 shrink-0">
      {lideres.slice(0, 3).map((l, i) => <Avatar key={i} nome={l.nome} foto={l.foto_url} tamanho={tamanho} />)}
    </span>
  );
}

function ChipFaixa({ quartil }: { quartil: number | null | undefined }) {
  if (!quartil) return null;
  const c = COR_QUARTIL[quartil] ?? '#6366f1';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: c + '1f', color: corTexto(c) }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      {quartil}º quartil
    </span>
  );
}

/** Liga a animação de entrada um quadro depois de montar (a régua «corre»). */
function useMontado() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setM(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return m;
}

/**
 * A régua do ritmo: as faixas de quartil ao fundo, a linha dos 100% e o
 * preenchimento até onde o alvo está. É a mesma régua na pista das equipes e
 * na linha de cada pessoa — o olho aprende uma vez.
 */
function Trilho({
  pct, quartis, cor, marcador, compacto,
}: {
  pct: number | null; quartis: QuartilConfig[]; cor: string;
  marcador?: ReactNode; compacto?: boolean;
}) {
  const montado = useMontado();
  const faixas = useMemo(() => {
    const asc = [...quartis].sort((a, b) => a.min_pct - b.min_pct);
    return asc.map((q, i) => ({
      quartil: q.quartil,
      de: Math.min(q.min_pct, ESCALA),
      ate: Math.min(asc[i + 1]?.min_pct ?? ESCALA, ESCALA),
    }));
  }, [quartis]);
  const pos = pct === null ? null : Math.max(0, Math.min(100, (pct / ESCALA) * 100));
  const posVis = montado ? pos : 0;
  const cem = (100 / ESCALA) * 100;
  const h = compacto ? 'h-1.5' : 'h-2.5';

  return (
    <div className={cn('relative', compacto ? 'h-5' : 'h-11')}>
      <div className={cn('absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full overflow-hidden bg-muted', h)}>
        {faixas.map(f => (
          <div key={f.quartil} className="absolute inset-y-0"
            style={{
              left: `${(f.de / ESCALA) * 100}%`, width: `${((f.ate - f.de) / ESCALA) * 100}%`,
              background: (COR_QUARTIL[f.quartil] ?? '#6366f1') + '2e',
            }} />
        ))}
        {pos !== null && (
          <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{ width: `${posVis}%`, background: cor }} />
        )}
      </div>
      {/* 100% = no ritmo da meta */}
      <div className="absolute top-0 bottom-0 w-px bg-foreground/35" style={{ left: `${cem}%` }} />
      {pos !== null && marcador && (
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-700 ease-out motion-reduce:transition-none"
          style={{ left: `${posVis}%` }}>
          {marcador}
        </div>
      )}
    </div>
  );
}

/** Uma das três respostas: a pergunta, o número e as linhas de apoio. */
function Resposta({
  pergunta, valor, cor, unidade, children,
}: { pergunta: string; valor: string; cor?: string; unidade?: string; children?: ReactNode }) {
  return (
    <div className="p-5 sm:p-6 min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{pergunta}</p>
      <p className="mt-2 font-mono tabular-nums font-bold text-2xl leading-none whitespace-nowrap"
        style={cor ? { color: corTexto(cor) } : undefined}>
        {valor}
        {unidade && <span className="ml-1.5 font-sans text-xs font-medium text-muted-foreground">{unidade}</span>}
      </p>
      <div className="mt-3 space-y-1.5">{children}</div>
    </div>
  );
}

function Linha({ rotulo, valor, cor, dica }: { rotulo: string; valor: string; cor?: string; dica?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs" title={dica}>
      <span className="text-muted-foreground min-w-0 truncate">{rotulo}</span>
      <span className="font-mono tabular-nums font-semibold shrink-0" style={cor ? { color: corTexto(cor) } : undefined}>
        {valor}
      </span>
    </div>
  );
}

/** Até hoje · Para amanhã · Onde o mês fecha. Iguais no setor e na equipe. */
function TresRespostas({ l }: { l: Leitura }) {
  const { d, acum, meta, esperado, emHO, rotulo, alvo } = l;
  const atual = d.degraus.find(g => g.quartil === d.faixaAtual?.quartil);
  const acima = [...d.degraus].reverse().find(g => !g.alcancado);
  const metaBatida = d.faltaMeta === 0;
  const rot = rotulo ? ` ${rotulo.toLowerCase() === 'bruto' ? 'bruta' : rotulo}` : '';

  return (
    <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/70">
      <Resposta pergunta="Até hoje" valor={formatBRL(acum)} unidade={rotulo ?? undefined}>
        {esperado !== null && <Linha rotulo="Deveria ter" valor={formatBRL(esperado)} dica="Meta ÷ dias úteis × dias trabalhados" />}
        {esperado !== null && (
          <Linha rotulo={acum >= esperado ? 'À frente do ritmo' : 'Atrás do ritmo'}
            valor={sinal(acum - esperado)} cor={acum >= esperado ? COR_QUARTIL[1] : COR_QUARTIL[4]} />
        )}
        <Linha rotulo={`Meta do mês${rot}`} valor={meta ? formatBRL(meta) : 'sem meta'} />
        {/* A outra unidade, de apoio: no Cofen as duas leituras interessam. */}
        {emHO && <Linha rotulo="Bruto recebido" valor={formatBRL(alvo.acumulado)} />}
        {!emHO && alvo.cofen && <Linha rotulo="H.O. recebido" valor={formatBRL(alvo.acumuladoHO)} />}
      </Resposta>

      <Resposta
        pergunta="Para amanhã"
        valor={meta === null ? '—' : metaBatida ? 'Meta batida' : d.ritmoNecessario !== null ? formatBRL(d.ritmoNecessario) : '—'}
        unidade={meta !== null && !metaBatida && d.ritmoNecessario !== null ? 'por dia útil' : undefined}
        cor={metaBatida ? COR_QUARTIL[1] : d.ritmoNecessario !== null && d.ritmoNecessario > d.mediaDiaria ? COR_QUARTIL[4] : undefined}
      >
        {meta === null && <p className="text-xs text-muted-foreground">Sem meta cadastrada na aba Metas.</p>}
        {atual && atual.faltaAmanha !== null && (
          <Linha rotulo={`Para seguir no ${atual.quartil}º amanhã`}
            valor={atual.faltaAmanha === 0 ? 'garantido' : formatBRL(atual.faltaAmanha)}
            cor={atual.faltaAmanha === 0 ? COR_QUARTIL[1] : COR_QUARTIL[atual.quartil]}
            dica="Quanto ainda precisa entrar hoje para continuar nesta faixa amanhã — a régua sobe um dia útil" />
        )}
        {acima && (
          <Linha rotulo={`Para subir ao ${acima.quartil}º hoje`} valor={formatBRL(acima.falta)}
            cor={COR_QUARTIL[acima.quartil]} dica="Quanto falta para entrar nesta faixa agora" />
        )}
        <Linha rotulo="Média atual" valor={`${formatBRL(d.mediaDiaria)}/dia`} />
        <Linha rotulo="Dias úteis restantes" valor={String(d.diasRestantes)} />
      </Resposta>

      <Resposta pergunta="Onde o mês fecha" valor={formatBRL(d.projecaoFechamento)}
        cor={d.sobraProjetada === null ? undefined : d.sobraProjetada >= 0 ? COR_QUARTIL[1] : undefined}>
        {d.sobraProjetada !== null && (
          <Linha rotulo={d.sobraProjetada >= 0 ? 'Acima da meta' : 'Abaixo da meta'} valor={sinal(d.sobraProjetada)}
            cor={d.sobraProjetada >= 0 ? COR_QUARTIL[1] : COR_QUARTIL[4]} />
        )}
        <Linha rotulo="Mantendo a média de" valor={`${formatBRL(d.mediaDiaria)}/dia`} />
        {d.totalOperadores > 0 && (
          <Linha rotulo={`Média por pessoa (${d.totalOperadores})`} valor={formatBRL(d.mediaPorOperador)} />
        )}
      </Resposta>
    </div>
  );
}

function BotaoCopiar({ l, mes, ehSetor }: { l: Leitura; mes: string; ehSetor?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => {
        void copiarTexto(
          montarMensagemEquipe({
            titulo: l.alvo.titulo, ehSetor, mes,
            acumulado: l.acum, meta: l.meta,
            rotuloUnidade: l.rotulo,
            acumuladoHO: !l.emHO && l.alvo.cofen ? l.alvo.acumuladoHO : null,
            acumuladoBruto: l.emHO ? l.alvo.acumulado : null,
            detalhe: l.d,
          }),
          'Texto copiado — é só colar no WhatsApp.',
          'Não foi possível copiar o texto.',
        );
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium
        hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
    >
      <Copy className="w-3.5 h-3.5" />
      {ehSetor ? 'Copiar resumo do setor' : 'Copiar para a equipe'}
    </button>
  );
}

// ── 1. O setor ───────────────────────────────────────────────────────────────

function Frase({ l, mes }: { l: Leitura; mes: string }) {
  if (l.pct === null) {
    return (
      <>
        {l.alvo.titulo} recebeu <span className="text-primary">{formatBRL(l.acum)}</span> em {rotuloDoMes(mes as MesRef).toLowerCase()}
      </>
    );
  }
  return (
    <>
      {l.alvo.titulo} está a{' '}
      <span className="font-mono tabular-nums" style={{ color: corTexto(l.cor) }}>{l.pct}%</span>{' '}
      do ritmo da meta
    </>
  );
}

function HeroSetor({ l, mes, fonte }: { l: Leitura; mes: string; fonte?: string }) {
  const { alvo, d } = l;
  return (
    <section className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="p-5 sm:p-8"
        style={{ background: l.pct !== null ? `linear-gradient(120deg, ${l.cor}14, transparent 55%)` : undefined }}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {alvo.foto
              ? <img src={alvo.foto} alt={alvo.titulo} className="w-11 h-11 rounded-2xl object-cover shrink-0" />
              : <span className="w-11 h-11 rounded-2xl bg-primary/12 text-primary flex items-center justify-center shrink-0"><Building2 className="w-5 h-5" /></span>}
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Setor</p>
              {fonte && <p className="text-xs text-muted-foreground truncate">{fonte}</p>}
            </div>
          </div>
          <BotaoCopiar l={l} mes={mes} ehSetor />
        </div>

        <h2 className="mt-5 text-[1.65rem] sm:text-4xl font-extrabold tracking-tight leading-[1.1] text-balance">
          <Frase l={l} mes={mes} />
        </h2>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <ChipFaixa quartil={d.faixaAtual?.quartil} />
          <span>{alvo.decorridos} de {alvo.totalUteis} dias úteis trabalhados</span>
          {!!alvo.ajusteManual && (
            <span className="inline-flex items-center gap-1 text-violet-500" title="Lançado em Ajuste de recebimento. Já está somado.">
              <SlidersHorizontal className="w-3 h-3" />
              {alvo.ajusteManual > 0 ? 'inclui' : 'desconta'} {formatBRL(Math.abs(alvo.ajusteManual))} de ajuste manual{l.emHO ? ' (no bruto)' : ''}
            </span>
          )}
        </div>

        <BarraDoMes l={l} />
      </div>
      <div className="border-t border-border/70">
        <TresRespostas l={l} />
      </div>
    </section>
  );
}

/** Acumulado, o esperado até hoje e a meta no mesmo eixo — o mês inteiro. */
function BarraDoMes({ l }: { l: Leitura }) {
  const montado = useMontado();
  const teto = Math.max(l.meta ?? 0, l.acum, 1);
  const pA = Math.min(100, (l.acum / teto) * 100);
  const pE = l.esperado !== null ? Math.min(100, (l.esperado / teto) * 100) : null;
  return (
    <div className="mt-6">
      <div className="relative h-3 rounded-full bg-muted overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${montado ? pA : 0}%`, background: l.cor }} />
      </div>
      {pE !== null && (
        <div className="relative h-0">
          <div className="absolute -top-[17px] w-0.5 h-[22px] rounded-full bg-foreground/75" style={{ left: `calc(${pE}% - 1px)` }} />
          <span className="absolute top-1.5 -translate-x-1/2 text-[10px] font-medium text-foreground/70 whitespace-nowrap"
            style={{ left: `${Math.min(Math.max(pE, 8), 92)}%` }}>
            hoje deveria ter
          </span>
        </div>
      )}
      <div className="mt-6 flex justify-between text-[11px] text-muted-foreground font-mono tabular-nums">
        <span>R$ 0</span>
        <span>{l.meta ? `meta ${formatBRL(l.meta)}` : 'sem meta'}</span>
      </div>
    </div>
  );
}

// ── 2. A pista das equipes ───────────────────────────────────────────────────

function Legenda({ quartis }: { quartis: QuartilConfig[] }) {
  const asc = [...quartis].sort((a, b) => a.quartil - b.quartil);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {asc.map(q => (
        <span key={q.quartil} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COR_QUARTIL[q.quartil] }} />
          {q.quartil}º · {q.min_pct}%+
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="w-px h-3 bg-foreground/50" /> 100% = no ritmo da meta
      </span>
    </div>
  );
}

function Pista({
  leituras, selecionada, onSelecionar, quartis,
}: {
  leituras: Leitura[]; selecionada: string | null; onSelecionar: (id: string) => void; quartis: QuartilConfig[];
}) {
  return (
    <section className="rounded-3xl border border-border bg-card shadow-sm">
      <div className="px-5 sm:px-6 pt-5 pb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold tracking-tight">Como está cada equipe</h3>
          <p className="text-xs text-muted-foreground">Toque numa equipe para ver o detalhe e as pessoas.</p>
        </div>
        <Legenda quartis={quartis} />
      </div>
      <ul className="px-2 sm:px-3 pb-3">
        {leituras.map((l, i) => {
          const ativa = selecionada === l.alvo.id;
          return (
            <li key={l.alvo.id}>
              <button
                type="button"
                aria-pressed={ativa}
                onClick={() => onSelecionar(l.alvo.id)}
                className={cn(
                  'w-full text-left rounded-2xl px-3 sm:px-4 py-2.5 grid items-center gap-x-4 gap-y-1',
                  'grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,13rem)_1fr_7.5rem]',
                  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  ativa ? 'bg-primary/[0.07] ring-1 ring-primary/30' : 'hover:bg-muted/60',
                )}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="w-5 text-[11px] font-mono tabular-nums text-muted-foreground shrink-0">{i + 1}º</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold truncate">{l.alvo.titulo}</span>
                      {l.alvo.treino && <GraduationCap className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-label="em treino" />}
                    </span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {l.alvo.lideres.map(x => x.nome.split(' ')[0]).join(' · ') || 'sem líder'}
                    </span>
                  </span>
                </span>
                <span className="text-right sm:order-last">
                  <span className="block font-mono tabular-nums font-bold text-lg leading-none" style={{ color: corTexto(l.cor) }}>
                    {l.pct !== null ? `${l.pct}%` : '—'}
                  </span>
                  <span className="block text-[11px] font-mono tabular-nums text-muted-foreground mt-1">{formatBRL(l.acum)}</span>
                </span>
                <span className="col-span-2 sm:col-span-1">
                  {l.pct !== null ? (
                    <Trilho pct={l.pct} quartis={quartis} cor={l.cor}
                      marcador={
                        <span className="block rounded-full p-0.5 shadow-md" style={{ background: l.cor }}>
                          <Lideres lideres={l.alvo.lideres.slice(0, 1)} tamanho="sm" />
                        </span>
                      } />
                  ) : (
                    <span className="flex h-11 items-center text-[11px] text-muted-foreground">sem meta de equipe cadastrada</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── 3. A equipe aberta ───────────────────────────────────────────────────────

function Escada({ d }: { d: DetalheEquipe }) {
  if (!d.degraus.length) {
    return <p className="text-xs text-muted-foreground">Sem meta — não há faixa a alcançar.</p>;
  }
  return (
    <div>
      <div className="grid grid-cols-[1fr_6rem_6rem] gap-2 px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Faixa</span><span className="text-right">entrar hoje</span><span className="text-right">ficar amanhã</span>
      </div>
      <div className="space-y-1">
        {d.degraus.map(g => {
          const c = COR_QUARTIL[g.quartil] ?? '#6366f1';
          const atual = d.faixaAtual?.quartil === g.quartil;
          return (
            <div key={g.quartil}
              className={cn('grid grid-cols-[1fr_6rem_6rem] gap-2 items-center rounded-xl px-3 py-2', atual ? 'bg-muted/70' : 'bg-muted/25')}
              style={atual ? { boxShadow: `inset 3px 0 0 ${c}` } : undefined}>
              <span className="flex items-center gap-2 text-xs min-w-0">
                <span className="w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0"
                  style={{ background: c + '26', color: corTexto(c) }}>{g.quartil}º</span>
                <span className="truncate text-muted-foreground">{atual ? 'faixa atual' : `${g.minPct}% do ritmo`}</span>
              </span>
              <span className="text-right text-xs font-mono tabular-nums font-semibold"
                style={g.alcancado ? { color: corTexto(COR_QUARTIL[1]) } : undefined}>
                {g.alcancado ? '✓' : formatBRL(g.falta)}
              </span>
              <span className="text-right text-xs font-mono tabular-nums text-muted-foreground">
                {g.faltaAmanha === null ? '—' : g.faltaAmanha === 0 ? '✓' : formatBRL(g.faltaAmanha)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
        A régua sobe {d.metaDiaria !== null ? formatBRL(d.metaDiaria) : 'um dia de meta'} a cada dia útil:
        quem só entra na faixa hoje amanhece fora dela.
      </p>
    </div>
  );
}

interface PessoaLida {
  op: OperadorNaEquipe;
  pct: number | null;
  quartil: number | null;
  paraSubir: number | null;
  proximo: number | null;
  ficarAmanha: number | null;
}

function lerPessoas(alvo: AlvoPainel): PessoaLida[] {
  const restantes = Math.max(0, alvo.totalUteis - alvo.decorridos);
  return (alvo.operadores ?? []).map(op => {
    const p = calcularProjecao({
      meta: op.meta, recebido: op.recebido, totalUteis: alvo.totalUteis, decorridos: alvo.decorridos, quartis: alvo.quartis,
    });
    const atual = p?.quartil?.quartil ?? null;
    const degraus = p
      ? degrausComAmanha({ recebido: op.recebido, esperado: p.esperado, metaDiaria: p.metaDiaria, diasRestantes: restantes, quartis: alvo.quartis })
      : [];
    return {
      op,
      pct: p?.projecaoPct ?? null,
      quartil: atual,
      paraSubir: p?.paraSubir ?? null,
      proximo: p?.proximo?.quartil ?? null,
      ficarAmanha: degraus.find(g => g.quartil === atual)?.faltaAmanha ?? null,
    };
  }).sort((a, b) => {
    if (a.pct === null && b.pct === null) return b.op.recebido - a.op.recebido;
    if (a.pct === null) return 1;
    if (b.pct === null) return -1;
    return b.pct - a.pct || b.op.recebido - a.op.recebido;
  });
}

function Pessoas({ alvo, d, rotulo }: { alvo: AlvoPainel; d: DetalheEquipe; rotulo: string | null }) {
  const pessoas = useMemo(() => lerPessoas(alvo), [alvo]);
  if (!pessoas.length) return <p className="text-xs text-muted-foreground">Ninguém vinculado a esta equipe no mês.</p>;
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {d.destaque && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px]">
            <Flame className="w-3.5 h-3.5" style={{ color: corTexto(COR_QUARTIL[3]) }} />
            Quem mais recebeu: <strong className="font-semibold">{d.destaque.nome.split(' ')[0]}</strong>
          </span>
        )}
        {d.atencao && d.atencao.id !== d.destaque?.id && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px]">
            <LifeBuoy className="w-3.5 h-3.5" style={{ color: corTexto(COR_QUARTIL[4]) }} />
            Precisa de apoio: <strong className="font-semibold">{d.atencao.nome.split(' ')[0]}</strong>
          </span>
        )}
      </div>
      <div className="hidden md:grid grid-cols-[minmax(0,12rem)_1fr_4rem_8.5rem_8.5rem] gap-3 px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Pessoa</span><span>Ritmo</span><span className="text-right">%</span>
        <span className="text-right">Recebido / meta</span><span className="text-right">Próximo passo</span>
      </div>
      <ul className="divide-y divide-border/60">
        {pessoas.map(p => {
          const cor = p.pct !== null ? corProjecao(p.pct) : 'var(--muted-foreground)';
          return (
            <li key={p.op.id}
              className="grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,12rem)_1fr_4rem_8.5rem_8.5rem] gap-x-3 gap-y-1 items-center px-2 py-2.5">
              <span className="flex items-center gap-2.5 min-w-0">
                <Avatar nome={p.op.nome} foto={p.op.fotoUrl} tamanho="sm" />
                <span className="text-sm font-medium truncate">{p.op.nome}</span>
              </span>
              <span className="md:order-none order-last col-span-2 md:col-span-1">
                {p.pct !== null
                  ? <Trilho compacto pct={p.pct} quartis={alvo.quartis} cor={cor}
                      marcador={<span className="block w-3 h-3 rounded-full border-2 border-card shadow" style={{ background: cor }} />} />
                  : <span className="text-[11px] text-muted-foreground">sem meta individual</span>}
              </span>
              <span className="text-right font-mono tabular-nums font-bold text-sm" style={{ color: corTexto(cor) }}>
                {p.pct !== null ? `${p.pct}%` : '—'}
              </span>
              <span className="hidden md:block text-right text-xs font-mono tabular-nums">
                {formatBRL(p.op.recebido)}
                <span className="block text-[10px] text-muted-foreground">{p.op.meta ? `de ${formatBRL(p.op.meta)}` : 'sem meta'}</span>
              </span>
              <span className="hidden md:block text-right text-xs">
                {p.pct === null ? <span className="text-muted-foreground">—</span>
                  : p.proximo && p.paraSubir !== null ? (
                    <>
                      <span className="font-mono tabular-nums font-semibold" style={{ color: corTexto(COR_QUARTIL[p.proximo]) }}>
                        {formatBRL(p.paraSubir)}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">para o {p.proximo}º hoje</span>
                    </>
                  ) : (
                    <>
                      <span className="font-mono tabular-nums font-semibold">
                        {p.ficarAmanha ? formatBRL(p.ficarAmanha) : '✓'}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">{p.ficarAmanha ? 'para seguir no 1º' : 'no 1º amanhã'}</span>
                    </>
                  )}
              </span>
            </li>
          );
        })}
      </ul>
      {(d.semMeta > 0 || rotulo) && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {d.semMeta > 0 && `${d.semMeta} sem meta individual — fora das faixas. `}
          {rotulo === 'H.O.' && 'Valores das pessoas em H.O. (coluna HO do relatório), contra a meta individual em H.O. da aba Metas.'}
          {rotulo === 'Bruto' && 'Valores das pessoas em bruto, contra a meta individual em bruto.'}
        </p>
      )}
    </div>
  );
}

function DetalheDaEquipe({ l, mes }: { l: Leitura; mes: string }) {
  const { alvo, d } = l;
  return (
    <section className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="p-5 sm:p-6 flex flex-wrap items-center gap-4">
        <Lideres lideres={alvo.lideres} tamanho="lg" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Equipe{alvo.treino ? ' · em treino' : ''}
          </p>
          <h3 className="text-2xl font-extrabold tracking-tight truncate">{alvo.titulo}</h3>
          <p className="text-xs text-muted-foreground truncate">
            {alvo.lideres.map(x => x.nome).join(' · ') || 'Sem líder definido'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-mono tabular-nums font-extrabold text-3xl leading-none" style={{ color: corTexto(l.cor) }}>
              {l.pct !== null ? `${l.pct}%` : '—'}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">do ritmo</p>
          </div>
          <BotaoCopiar l={l} mes={mes} />
        </div>
      </div>
      <div className="border-y border-border/70">
        <TresRespostas l={l} />
      </div>
      <div className="grid lg:grid-cols-[22rem_1fr] divide-y lg:divide-y-0 lg:divide-x divide-border/70">
        <div className="p-5 sm:p-6">
          <h4 className="text-sm font-bold mb-3">Quanto falta por faixa</h4>
          <Escada d={d} />
        </div>
        <div className="p-5 sm:p-6 min-w-0">
          <h4 className="text-sm font-bold mb-3">Pessoas ({d.totalOperadores})</h4>
          <Pessoas alvo={alvo} d={d} rotulo={l.rotulo} />
        </div>
      </div>
    </section>
  );
}

// ── Um setor inteiro ─────────────────────────────────────────────────────────

function BlocoSetor({ g, mes, equipePreferida, mostrarNome }: {
  g: GrupoPainel; mes: string; equipePreferida?: string | null; mostrarNome: boolean;
}) {
  const setorLido = useMemo(() => (g.setor ? ler(g.setor) : null), [g.setor]);
  const equipes = useMemo(() => g.equipes.map(ler).sort((a, b) => {
    if (a.pct === null && b.pct === null) return b.acum - a.acum;
    if (a.pct === null) return 1;
    if (b.pct === null) return -1;
    return b.pct - a.pct || b.acum - a.acum;
  }), [g.equipes]);

  const [sel, setSel] = useState<string | null>(null);
  const selecionada = equipes.find(e => e.alvo.id === sel)
    ?? equipes.find(e => e.alvo.id === equipePreferida)
    ?? equipes[0] ?? null;
  const quartis = g.setor?.quartis ?? g.equipes[0]?.quartis ?? [];

  return (
    <div className="space-y-5">
      {mostrarNome && (
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{g.nomeSetor}</p>
      )}
      {g.estadoSetor ? (
        <div role="status" className="rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground flex items-center gap-2">
          {g.estadoSetor.tipo === 'carregando'
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Carregando a conciliação do setor…</>
            : (() => {
                const tentar = g.estadoSetor.tentar;
                return <>Não foi possível carregar a conciliação do setor.
                  <button type="button" className="text-primary underline" onClick={tentar}>Tentar de novo</button></>;
              })()}
        </div>
      ) : setorLido && <HeroSetor l={setorLido} mes={mes} fonte={g.setor?.subtitulo} />}
      {g.extra}
      {equipes.length > 0 && (
        <Pista leituras={equipes} selecionada={selecionada?.alvo.id ?? null} onSelecionar={setSel} quartis={quartis} />
      )}
      {selecionada && <DetalheDaEquipe key={selecionada.alvo.id} l={selecionada} mes={mes} />}
    </div>
  );
}

export function PainelLiderVisao({ grupos, mes, rodape, equipePreferida, unidade, onUnidade }: Props) {
  // A chave aparece só quando há setor da regra Cofen na tela: Nosso produto
  // não tem H.O., e escolher entre um número e zero não é uma escolha.
  const temCofen = grupos.some(g => g.cofen);
  return (
    <div className="space-y-10">
      {temCofen && (
        <div className="-mb-5 flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>
            Valores em <strong className="text-foreground">{rotuloUnidade(unidade)}</strong>
            {grupos.length > 1 ? ' nos setores da regra Cofen' : ''} — setor, equipes e pessoas
          </span>
          <SeletorUnidade valor={unidade} onChange={onUnidade} />
        </div>
      )}
      {grupos.map(g => (
        <BlocoSetor key={g.setorId} g={g} mes={mes} equipePreferida={equipePreferida} mostrarNome={grupos.length > 1} />
      ))}
      <p className="text-[11px] text-muted-foreground px-1">{rodape}</p>
    </div>
  );
}
