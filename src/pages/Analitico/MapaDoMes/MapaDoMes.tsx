/**
 * MapaDoMes — o mês do setor (ou de um operador), por dia ou por baixa.
 *
 *   • o topo é um filtro de operador, com a foto de cada um — o líder toca na
 *     pessoa e o mapa inteiro passa a ser o mês dela;
 *   • «Por dia» é um calendário de segunda a domingo, com a D.U. de cada dia;
 *   • «Por baixa» é a régua da operação: uma casa por dia útil (D.U. 1 … 21),
 *     com o fim de semana e o feriado somados na baixa do dia útil anterior —
 *     a coluna D.U. da planilha;
 *   • ao lado, o ranking do mês, o retrato do operador escolhido ou quem
 *     recebeu na casa clicada.
 *
 * Sem escala de cor por valor: o fundo da casa não muda com o dinheiro. Quem
 * diz «quanto» é o número e a barrinha; a cor fica para estado (hoje, melhor
 * casa, casa aberta).
 *
 * As células chegam JÁ escopadas por quem chama; este componente não decide
 * quem enxerga o quê.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  CalendarDays, CalendarRange, Crown, Flame, Layers, Search, TrendingUp, Users, Wallet, X,
} from 'lucide-react';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { KpiTile } from '@/components/KpiTile';
import { getTodayISO } from '@/lib/index';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { AvatarParticipante } from '@/pages/Analitico/Desafios/AvatarParticipante';
import {
  baixasDoMes, montarMapa, quemRecebeuNaCasa, resumirCasas, semanasDoMes, valorDaCasa,
  type Baixa, type Casa, type CelulaDoMapa, type DiaDoCalendario, type OperadorDoMapa,
} from './contas';

export type { CelulaDoMapa } from './contas';

type Visao = 'dia' | 'baixa';

/* Tipada aqui, e não com genérico no JSX: o `lovable-tagger` do dev não
   entende `<AbasSegmentadas<T>>` (ver `AnaliticoLider`). */
const VISOES: AbaSegmentada<Visao>[] = [
  { key: 'dia',   label: 'Por dia',   Icon: CalendarDays },
  { key: 'baixa', label: 'Por baixa', Icon: Layers },
];

interface MapaDoMesProps {
  /** Células do mês, JÁ escopadas por quem chama. */
  linhas: readonly CelulaDoMapa[];
  /** 'yyyy-MM' — o mês da lente. `null` enquanto ela não resolveu. */
  mes: string | null;
  nomeDoOperador: (id: string) => string;
  /** operador_id → foto_url. Ausente = iniciais. */
  fotos: Readonly<Record<string, string | null>>;
  /** Dias que não abrem baixa além de sábado e domingo ('yyyy-MM-dd'). */
  feriados: readonly string[];
  /** Nome da equipe, para o retrato do operador. Opcional. */
  equipeDoOperador?: (id: string) => string | null;
  /** Injetável para teste. */
  hojeISO?: string;
}

const SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const SIGLA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const compacto = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1,
});
/** R$ 12.480,50 → «R$ 12,5 mil». Cabe na casa. */
const brlCurto = (v: number) => compacto.format(v);

/** '2026-09-08' → '08/09'. */
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function diaDaSemana(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).getDay();
}

/** '2026-09-08' → 'ter, 08/09'. */
const diaCurto = (iso: string) => `${SIGLA[diaDaSemana(iso)]}, ${diaMes(iso)}`;

function rotuloDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

/** Os dias que a baixa carrega além do dia útil: '+ sáb 03 e dom 04'. */
function extrasDaBaixa(b: Baixa, feriados: ReadonlySet<string>): string | null {
  const extras = b.dias.slice(1).sort();
  if (extras.length === 0) return null;
  const nomes = extras.map(d => `${feriados.has(d) ? 'feriado' : SIGLA[diaDaSemana(d)]} ${d.slice(8, 10)}`);
  return `+ ${nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0]}`;
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

export function MapaDoMes({
  linhas, mes, nomeDoOperador, fotos, feriados, equipeDoOperador, hojeISO = getTodayISO(),
}: MapaDoMesProps) {
  const reduzirMovimento = useReducedMotion();
  const [visao, setVisao] = useState<Visao>('dia');
  const [focoId, setFocoId] = useState<string | null>(null);
  const [casaAberta, setCasaAberta] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  // Trocar de mês ou de visão fecha a casa aberta: ela era de outra régua.
  useEffect(() => { setCasaAberta(null); }, [mes, visao]);

  const mapa = useMemo(() => montarMapa({
    celulas: linhas,
    mes: mes ?? '',
    nomeDoOperador,
    fotoDoOperador: id => fotos[id] ?? null,
    equipeDoOperador: id => equipeDoOperador?.(id) ?? null,
  }), [linhas, mes, nomeDoOperador, fotos, equipeDoOperador]);

  const feriadosSet = useMemo(() => new Set(feriados), [feriados]);
  const semanas = useMemo(() => (mes ? semanasDoMes(mes, hojeISO) : []), [mes, hojeISO]);
  const baixas = useMemo(
    () => (mes ? baixasDoMes(mes, feriadosSet, hojeISO) : []),
    [mes, feriadosSet, hojeISO],
  );
  /** dia → baixa em que ele cai. É a coluna D.U. da planilha. */
  const baixaDoDia = useMemo(() => {
    const m = new Map<string, Baixa>();
    for (const b of baixas) for (const d of b.dias) m.set(d, b);
    return m;
  }, [baixas]);

  const casas = useMemo<Casa[]>(() => (visao === 'baixa'
    ? baixas.map(b => ({ chave: b.diaUtil, dias: b.dias, futuro: b.futuro }))
    : semanas.flat().filter((d): d is DiaDoCalendario => d !== null)
      .map(d => ({ chave: d.iso, dias: [d.iso], futuro: d.futuro }))),
  [visao, baixas, semanas]);

  // Operador escolhido que não recebeu neste mês volta para «Todos».
  const foco = focoId ? mapa.operadores.find(o => o.operadorId === focoId) ?? null : null;
  const porDia = foco ? foco.porDia : mapa.totalPorDia;
  const resumo = useMemo(() => resumirCasas(casas, porDia), [casas, porDia]);
  const maiorCasa = resumo.melhor?.valor ?? 0;

  const operadoresFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    if (!termo) return mapa.operadores;
    return mapa.operadores.filter(o => o.nome.toLocaleLowerCase('pt-BR').includes(termo));
  }, [busca, mapa.operadores]);

  if (!mes) return null;

  if (mapa.operadores.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-16 text-center">
        <CalendarRange className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm font-medium">Nenhum recebimento vinculado a operador em {rotuloDoMes(mes)}.</p>
        {mapa.totalSemOperador > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Há {formatBRL(mapa.totalSemOperador)} sem operador vinculado — veja a aba «Sem operador».
          </p>
        )}
      </div>
    );
  }

  const porBaixa = visao === 'baixa';
  const unidade = porBaixa ? 'baixa' : 'dia';
  const unidades = porBaixa ? 'baixas' : 'dias';

  const escolher = (id: string | null) => {
    setFocoId(atual => (atual === id ? null : id));
    setCasaAberta(null);
  };

  /** Como uma casa se chama no painel e nos números do topo. */
  const nomeDaCasa = (chave: string) => {
    if (!porBaixa) return diaCurto(chave);
    const b = baixaDoDia.get(chave);
    return b ? `Baixa ${b.numero} · ${diaCurto(b.diaUtil)}` : diaCurto(chave);
  };
  const casaDoPainel = casaAberta ? casas.find(c => c.chave === casaAberta) ?? null : null;

  return (
    <div className="space-y-4">
      {/* ── Filtro de operador ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ver o mês de
          </p>
          {mapa.operadores.length > 8 && (
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar operador…"
                aria-label="Buscar operador no mapa"
                className="h-8 w-48 rounded-lg border border-border bg-background pl-8 pr-2 text-xs outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
              />
            </label>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          <ChipOperador
            ativo={!foco}
            onClick={() => escolher(null)}
            rotulo="Todos"
            valor={mapa.totalGeral}
            avatar={(
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground ring-1 ring-border">
                <Users className="h-4 w-4" />
              </span>
            )}
          />
          {operadoresFiltrados.map(o => (
            <ChipOperador
              key={o.operadorId}
              ativo={foco?.operadorId === o.operadorId}
              onClick={() => escolher(o.operadorId)}
              rotulo={primeiroNome(o.nome)}
              titulo={o.nome}
              valor={o.total}
              posicao={o.posicao}
              avatar={<AvatarParticipante nome={o.nome} fotoUrl={o.fotoUrl} className="h-9 w-9" />}
            />
          ))}
          {operadoresFiltrados.length === 0 && (
            <p className="self-center px-2 text-xs text-muted-foreground">Ninguém com «{busca.trim()}».</p>
          )}
        </div>
      </div>

      {/* ── Números do recorte ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          rotulo={foco ? `Recebido por ${primeiroNome(foco.nome)}` : 'Recebido no mês'}
          valor={formatBRL(resumo.total)}
          valorNumerico={resumo.total}
          formatar={formatBRL}
          sub={foco && mapa.totalGeral > 0
            ? `${((foco.total / mapa.totalGeral) * 100).toFixed(1).replace('.', ',')}% do total`
            : `${mapa.operadores.length} ${mapa.operadores.length === 1 ? 'operador' : 'operadores'}`}
          Icon={Wallet}
          tom="primario"
        />
        <KpiTile
          rotulo={porBaixa ? 'Melhor baixa' : 'Melhor dia'}
          valor={resumo.melhor ? formatBRL(resumo.melhor.valor) : '—'}
          sub={resumo.melhor ? nomeDaCasa(resumo.melhor.chave) : 'sem recebimento'}
          Icon={Flame}
          tom="neutro"
        />
        <KpiTile
          rotulo={`Média por ${unidade}`}
          valor={formatBRL(resumo.mediaPorAtiva)}
          sub={`só conta ${porBaixa ? 'as baixas' : 'os dias'} com recebimento`}
          Icon={TrendingUp}
          tom="neutro"
        />
        <KpiTile
          rotulo={`${porBaixa ? 'Baixas' : 'Dias'} com recebimento`}
          valor={`${resumo.ativas} de ${resumo.corridas}`}
          sub={porBaixa
            ? `${baixas.length} dias úteis no mês`
            : resumo.corridas > 0 ? 'dias corridos até hoje' : 'o mês ainda não começou'}
          Icon={CalendarDays}
          tom="neutro"
        />
      </div>

      {/* ── Mapa + painel lateral ───────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <motion.div
          key={`${foco?.operadorId ?? 'todos'}-${visao}`}
          initial={reduzirMovimento ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              {foco && <AvatarParticipante nome={foco.nome} fotoUrl={foco.fotoUrl} className="h-8 w-8" />}
              <div>
                <p className="text-sm font-semibold capitalize leading-tight">{rotuloDoMes(mes)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {foco ? `O mês de ${foco.nome}` : 'Todos os operadores'}
                  {porBaixa ? ` · ${baixas.length} baixas` : ''} · toque {porBaixa ? 'numa baixa' : 'num dia'} para ver o detalhe
                </p>
              </div>
            </div>
            <AbasSegmentadas abas={VISOES} ativa={visao} onTrocar={(k: Visao) => setVisao(k)} rotulo="Ver o mapa por" />
          </div>

          {porBaixa ? (
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {SEMANA.slice(0, 5).map(s => <CabecaColuna key={s} texto={s} />)}
              {semanas.filter(s => s.slice(0, 5).some(Boolean)).flatMap((semana, w) => semana.slice(0, 5).map((dia, i) => {
                const b = dia ? baixaDoDia.get(dia.iso) : undefined;
                if (!dia) return <div key={`v-${w}-${i}`} aria-hidden />;
                if (!b || b.diaUtil !== dia.iso) {
                  // Dia útil da semana que não abre baixa: feriado.
                  return (
                    <div key={dia.iso} className="flex min-h-[84px] flex-col justify-between rounded-xl border border-dashed border-border/70 p-2 text-muted-foreground sm:min-h-[104px]">
                      <span className="text-[11px] font-semibold tabular-nums">{diaMes(dia.iso)}</span>
                      <span className="text-[10px] leading-tight">Feriado{b ? ` · entra na baixa ${b.numero}` : ''}</span>
                    </div>
                  );
                }
                return (
                  <CasaDoMapa
                    key={b.diaUtil}
                    titulo={`Baixa ${b.numero}`}
                    subtitulo={diaMes(b.diaUtil)}
                    extra={extrasDaBaixa(b, feriadosSet)}
                    valor={valorDaCasa({ chave: b.diaUtil, dias: b.dias, futuro: b.futuro }, porDia)}
                    maximo={maiorCasa}
                    futuro={b.futuro}
                    atual={b.atual}
                    melhor={resumo.melhor?.chave === b.diaUtil}
                    aberta={casaAberta === b.diaUtil}
                    destaques={foco ? [] : quemRecebeuNaCasa(mapa.operadores, b.dias).slice(0, 3).map(x => x.operador)}
                    onClick={() => setCasaAberta(a => (a === b.diaUtil ? null : b.diaUtil))}
                  />
                );
              }))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {SEMANA.map((s, i) => <CabecaColuna key={s} texto={s} fraca={i >= 5} />)}
              {semanas.flat().map((dia, i) => {
                if (!dia) return <div key={`v-${i}`} aria-hidden />;
                const b = baixaDoDia.get(dia.iso);
                const util = b?.diaUtil === dia.iso;
                return (
                  <CasaDoMapa
                    key={dia.iso}
                    titulo={String(dia.numero)}
                    subtitulo={b ? `D.U. ${b.numero}` : undefined}
                    valor={porDia.get(dia.iso) ?? 0}
                    maximo={maiorCasa}
                    futuro={dia.futuro}
                    atual={dia.ehHoje}
                    naoUtil={!util}
                    melhor={resumo.melhor?.chave === dia.iso}
                    aberta={casaAberta === dia.iso}
                    destaques={foco ? [] : quemRecebeuNaCasa(mapa.operadores, [dia.iso]).slice(0, 3).map(x => x.operador)}
                    onClick={() => setCasaAberta(a => (a === dia.iso ? null : dia.iso))}
                  />
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Painel ao lado: a casa aberta, o retrato do operador ou o ranking. */}
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          {foco ? (
            <RetratoDoOperador
              operador={foco}
              totalDeOperadores={mapa.operadores.length}
              totalGeral={mapa.totalGeral}
              casas={casas}
              nomeDaCasa={nomeDaCasa}
              unidades={unidades}
              casaAberta={casaDoPainel}
              onVoltar={() => escolher(null)}
            />
          ) : casaDoPainel ? (
            <PainelDaCasa
              titulo={nomeDaCasa(casaDoPainel.chave)}
              recebidos={quemRecebeuNaCasa(mapa.operadores, casaDoPainel.dias)}
              unidade={unidade}
              onFechar={() => setCasaAberta(null)}
              onEscolher={id => escolher(id)}
            />
          ) : (
            <RankingDoMes operadores={mapa.operadores} onEscolher={id => escolher(id)} />
          )}
        </div>
      </div>

      {/* Sem esta nota o total do mapa parece divergir do card «Total recebido». */}
      {mapa.totalSemOperador > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Fora do mapa: <strong>{formatBRL(mapa.totalSemOperador)}</strong> sem operador vinculado
          (órfãos e «sem vínculo»). Conta no total da empresa, mas não pertence a nenhuma pessoa.
        </p>
      )}
    </div>
  );
}

// ── Peças ────────────────────────────────────────────────────────────────────

function CabecaColuna({ texto, fraca }: { texto: string; fraca?: boolean }) {
  return (
    <div className={cn(
      'pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground',
      fraca && 'text-muted-foreground/60',
    )}>
      {texto}
    </div>
  );
}

function ChipOperador({ ativo, onClick, rotulo, titulo, valor, posicao, avatar }: {
  ativo: boolean;
  onClick: () => void;
  rotulo: string;
  titulo?: string;
  valor: number;
  posicao?: number;
  avatar: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo ?? rotulo}
      aria-pressed={ativo}
      className={cn(
        'group flex shrink-0 items-center gap-2 rounded-xl border py-1.5 pl-1.5 pr-3 text-left transition-all',
        ativo
          ? 'border-foreground/40 bg-foreground/[0.04] shadow-sm ring-2 ring-foreground/10'
          : 'border-border bg-background hover:border-foreground/25 hover:bg-accent/40',
      )}
    >
      <span className="relative">
        {avatar}
        {posicao !== undefined && posicao <= 3 && (
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[9px] font-bold text-background ring-2 ring-card">
            {posicao}
          </span>
        )}
      </span>
      <span className="leading-tight">
        <span className="block text-xs font-semibold">{rotulo}</span>
        <span className="block text-[10px] tabular-nums text-muted-foreground">{brlCurto(valor)}</span>
      </span>
    </button>
  );
}

function CasaDoMapa({
  titulo, subtitulo, extra, valor, maximo, futuro, atual, naoUtil, melhor, aberta, destaques, onClick,
}: {
  titulo: string;
  subtitulo?: string;
  extra?: string | null;
  valor: number;
  maximo: number;
  futuro: boolean;
  atual: boolean;
  naoUtil?: boolean;
  melhor: boolean;
  aberta: boolean;
  destaques: OperadorDoMapa[];
  onClick: () => void;
}) {
  if (futuro) {
    return (
      <div className="flex min-h-[84px] flex-col rounded-xl border border-dashed border-border/60 p-2 text-muted-foreground/50 sm:min-h-[104px]">
        <span className="text-[11px] font-semibold tabular-nums sm:text-xs">{titulo}</span>
        {subtitulo && <span className="text-[10px]">{subtitulo}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${titulo}${subtitulo ? ` · ${subtitulo}` : ''} · ${formatBRL(valor)}`}
      className={cn(
        'relative flex min-h-[84px] flex-col rounded-xl border p-2 text-left transition-all sm:min-h-[104px]',
        'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        naoUtil ? 'bg-muted/40' : 'bg-background',
        aberta ? 'border-foreground/60 ring-2 ring-foreground/15' : 'border-border',
        atual && !aberta && 'border-primary',
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="min-w-0 leading-tight">
          <span className={cn(
            'block text-[11px] font-semibold tabular-nums sm:text-xs',
            valor === 0 && 'text-muted-foreground',
          )}>
            {titulo}
          </span>
          {subtitulo && (
            <span className="block truncate text-[9px] uppercase tracking-wide text-muted-foreground sm:text-[10px]">
              {subtitulo}{atual ? ' · hoje' : ''}
            </span>
          )}
        </span>
        {melhor && valor > 0 && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Melhor" />}
      </div>
      {extra && <span className="mt-0.5 hidden truncate text-[10px] text-muted-foreground sm:block">{extra}</span>}

      <div className="mt-auto space-y-1">
        {valor > 0 ? (
          <span className="block truncate text-[11px] font-bold tabular-nums sm:text-sm">{brlCurto(valor)}</span>
        ) : (
          <span className="block text-[11px] text-muted-foreground/50">—</span>
        )}
        {/* Barrinha: quanto a casa pesa diante da maior do recorte. */}
        <span className="block h-1 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-foreground/70"
            style={{ width: `${maximo > 0 && valor > 0 ? Math.max(3, (valor / maximo) * 100) : 0}%` }}
          />
        </span>
        {destaques.length > 0 && (
          <span className="hidden -space-x-1.5 pt-0.5 sm:flex">
            {destaques.map(o => (
              <AvatarParticipante
                key={o.operadorId}
                nome={o.nome}
                fotoUrl={o.fotoUrl}
                className="h-5 w-5 border-2 border-card text-[8px]"
              />
            ))}
          </span>
        )}
      </div>
    </button>
  );
}

function LinhaRanking({ posicao, operador, valor, maximo, onClick, sub }: {
  posicao: number;
  operador: OperadorDoMapa;
  valor: number;
  maximo: number;
  onClick: () => void;
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-accent/50"
    >
      <span className="w-5 shrink-0 text-right text-xs font-bold tabular-nums text-muted-foreground">
        {posicao}
      </span>
      <AvatarParticipante nome={operador.nome} fotoUrl={operador.fotoUrl} className="h-9 w-9 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">{operador.nome}</span>
          <span className="shrink-0 text-xs font-semibold tabular-nums">{formatBRL(valor)}</span>
        </span>
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-foreground/70"
            style={{ width: `${maximo > 0 ? Math.max(2, (valor / maximo) * 100) : 0}%` }}
          />
        </span>
        {sub && <span className="mt-0.5 block text-[10px] text-muted-foreground">{sub}</span>}
      </span>
    </button>
  );
}

function CabecalhoPainel({ titulo, sub, acao }: { titulo: string; sub?: string; acao?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
      <div>
        <p className="text-sm font-semibold capitalize">{titulo}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
      {acao}
    </div>
  );
}

function RankingDoMes({ operadores, onEscolher }: {
  operadores: OperadorDoMapa[];
  onEscolher: (id: string) => void;
}) {
  const maximo = operadores[0]?.total ?? 0;
  return (
    <>
      <CabecalhoPainel titulo="Quem mais recebeu no mês" sub="Toque em alguém para ver o mês dessa pessoa" />
      <div className="max-h-[620px] space-y-0.5 overflow-y-auto p-2">
        {operadores.map(o => (
          <LinhaRanking
            key={o.operadorId}
            posicao={o.posicao}
            operador={o}
            valor={o.total}
            maximo={maximo}
            onClick={() => onEscolher(o.operadorId)}
            sub={`${o.porDia.size} ${o.porDia.size === 1 ? 'dia' : 'dias'} com recebimento`}
          />
        ))}
      </div>
    </>
  );
}

function PainelDaCasa({ titulo, recebidos, unidade, onFechar, onEscolher }: {
  titulo: string;
  recebidos: { operador: OperadorDoMapa; valor: number }[];
  unidade: string;
  onFechar: () => void;
  onEscolher: (id: string) => void;
}) {
  const total = recebidos.reduce((s, r) => s + r.valor, 0);
  const maximo = recebidos[0]?.valor ?? 0;
  return (
    <>
      <CabecalhoPainel
        titulo={titulo}
        sub={recebidos.length > 0
          ? `${formatBRL(total)} · ${recebidos.length} ${recebidos.length === 1 ? 'operador' : 'operadores'}`
          : `Nenhum recebimento nesta ${unidade === 'dia' ? 'data' : 'baixa'}`}
        acao={(
          <button type="button" onClick={onFechar} aria-label="Fechar"
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      />
      <div className="max-h-[620px] space-y-0.5 overflow-y-auto p-2">
        {recebidos.map((r, i) => (
          <LinhaRanking
            key={r.operador.operadorId}
            posicao={i + 1}
            operador={r.operador}
            valor={r.valor}
            maximo={maximo}
            onClick={() => onEscolher(r.operador.operadorId)}
            sub={total > 0 ? `${Math.round((r.valor / total) * 100)}% d${unidade === 'dia' ? 'o dia' : 'a baixa'}` : undefined}
          />
        ))}
        {recebidos.length === 0 && (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">Ninguém recebeu aqui.</p>
        )}
      </div>
    </>
  );
}

function RetratoDoOperador({
  operador, totalDeOperadores, totalGeral, casas, nomeDaCasa, unidades, casaAberta, onVoltar,
}: {
  operador: OperadorDoMapa;
  totalDeOperadores: number;
  totalGeral: number;
  casas: readonly Casa[];
  nomeDaCasa: (chave: string) => string;
  unidades: string;
  casaAberta: Casa | null;
  onVoltar: () => void;
}) {
  const melhores = casas
    .map(c => ({ chave: c.chave, valor: valorDaCasa(c, operador.porDia) }))
    .filter(x => x.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5);
  const maximo = melhores[0]?.valor ?? 0;
  const valorDaAberta = casaAberta ? valorDaCasa(casaAberta, operador.porDia) : 0;
  const participacao = totalGeral > 0 ? (operador.total / totalGeral) * 100 : 0;

  return (
    <>
      <div className="relative border-b border-border px-4 pb-4 pt-5 text-center">
        <button type="button" onClick={onVoltar}
          className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
          <Users className="h-3 w-3" /> Todos
        </button>
        <AvatarParticipante nome={operador.nome} fotoUrl={operador.fotoUrl}
          className="mx-auto h-20 w-20 border-4 border-card text-xl shadow-md" />
        <p className="mt-2 text-base font-semibold leading-tight">{operador.nome}</p>
        {operador.equipe && <p className="text-xs text-muted-foreground">{operador.equipe}</p>}
        <p className="mt-3 text-2xl font-bold tabular-nums">{formatBRL(operador.total)}</p>
        <div className="mt-2 flex items-center justify-center gap-2 text-[11px]">
          <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">
            {operador.posicao}º de {totalDeOperadores}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5">
            {participacao.toFixed(1).replace('.', ',')}% do total
          </span>
        </div>
      </div>

      {casaAberta && (
        <div className="mx-4 mt-3 rounded-xl border border-border bg-muted/40 px-3 py-2">
          <p className="text-[11px] capitalize text-muted-foreground">{nomeDaCasa(casaAberta.chave)}</p>
          <p className="text-sm font-semibold tabular-nums">
            {valorDaAberta ? formatBRL(valorDaAberta) : 'Sem recebimento aqui'}
          </p>
        </div>
      )}

      <div className="px-4 pb-4 pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Melhores {unidades}
        </p>
        <div className="space-y-2">
          {melhores.map(({ chave, valor }) => (
            <div key={chave} className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0 truncate capitalize text-muted-foreground">{nomeDaCasa(chave)}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-foreground/70"
                  style={{ width: `${maximo > 0 ? (valor / maximo) * 100 : 0}%` }} />
              </span>
              <span className="w-20 shrink-0 text-right font-semibold tabular-nums">{brlCurto(valor)}</span>
            </div>
          ))}
          {melhores.length === 0 && <p className="text-xs text-muted-foreground">Nada recebido ainda.</p>}
        </div>
      </div>
    </>
  );
}
