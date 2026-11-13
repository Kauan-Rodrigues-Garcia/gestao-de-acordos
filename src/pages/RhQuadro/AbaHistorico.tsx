/**
 * AbaHistorico — o que aconteceu com as pessoas num mês (13/11/2026).
 *
 * Transferências, mudanças de cargo, desligamentos, reativações, afastamentos,
 * férias, entradas e trocas de equipe. Só leitura: tudo vem de
 * `fn_rh_historico_mes`, que lê o log de cadastro e as ausências.
 *
 * ## O desenho (refeito em 13/11/2026)
 *
 * O primeiro era uma lista por tipo — informação certa, leitura cansativa (o
 * Cleber: «mais dinâmico, mais agradável, profissional»). Agora são três
 * camadas, do geral para o detalhe:
 *
 *   1. **Resumo** — o saldo do quadro (entradas × desligamentos) e um painel
 *      por tipo, com o mês anterior ao lado e a divisão por cidade. O painel é
 *      também o filtro.
 *   2. **Ritmo do mês** — barras por dia, empilhadas por tipo. Clicar num dia
 *      filtra a linha do tempo.
 *   3. **Linha do tempo** — os eventos em cartões, agrupados por dia, com a
 *      foto da pessoa e o «de → para» de cada um.
 *
 * A cidade é a do topo do Quadro; aqui só mês, setor, tipo e dia.
 *
 * Carrega o mês e o anterior (para a comparação), uma vez por (empresas, mês),
 * e guarda enquanto a tela está aberta. O «Atualizar» do topo apaga a memória.
 *
 * Spec: docs/superpowers/specs/2026-11-13-rh-historico-do-mes-design.md
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowRight, ArrowRightLeft, CalendarDays, ChevronLeft, ChevronRight, Download,
  HeartPulse, History, Lock, MapPin, Minus, Shuffle, Sun, TrendingDown, TrendingUp, UserCheck, UserMinus, UserPlus, X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { marcaDaCidade } from '@/lib/marca';
import { cn } from '@/lib/utils';
import {
  PRIMEIRO_MES, ROTULO_TIPO, SEM_DATA_DE_VOLTA, TIPOS_EVENTO,
  cidadesDoMes, contarPorCidade, contarTipos, cruzaCidades, filtrar, linhasDoHistorico, mesDe, porDia,
  rotuloMes, setoresDoMes, somarMes,
  type EventoRh, type TipoEvento,
} from '@/services/rh/historicoMes';
import { SemAcessoHistorico, carregarHistoricoMes } from '@/services/rh/historicoMes.service';
import { baixarPlanilha } from '@/services/rh/quadroPessoalPlanilha';
import { iniciais } from '@/services/rh/quadroPessoal';
import { registrarLog } from '@/services/logs.service';
import { dataCurta, rotuloCargo } from './formato';
import { historicoDeExemplo } from './historicoExemplo';
import { SeletorFiltro } from './SeletorFiltro';

/**
 * Cor e ícone de cada tipo. A cor é variável de tema usada CRUA (`var(--x)`):
 * as variáveis são oklch, e embrulhar em `hsl()` apaga a cor (memória «cor de
 * gráfico nunca é hsl(var(--x))»).
 */
const META: Record<TipoEvento, { Icone: LucideIcon; cor: string }> = {
  transferencia: { Icone: ArrowRightLeft, cor: 'var(--chart-1)' },
  cargo:         { Icone: TrendingUp,     cor: 'var(--chart-4)' },
  desligamento:  { Icone: UserMinus,      cor: 'var(--chart-5)' },
  reativacao:    { Icone: UserCheck,      cor: 'var(--info)' },
  afastamento:   { Icone: HeartPulse,     cor: 'var(--chart-3)' },
  ferias:        { Icone: Sun,            cor: 'var(--warning)' },
  entrada:       { Icone: UserPlus,       cor: 'var(--chart-2)' },
  troca_equipe:  { Icone: Shuffle,        cor: 'var(--muted-foreground)' },
};

/** Fundo suave e texto na cor do tipo, sem depender de classe gerada. */
const tingido = (cor: string, forca = 14): CSSProperties => ({
  backgroundColor: `color-mix(in oklch, ${cor} ${forca}%, transparent)`,
  color: cor,
});

/** As trocas de equipe são muitas (centenas na virada) e dizem pouco ao RH: fora da linha do tempo até serem pedidas. */
const FORA_POR_PADRAO: ReadonlySet<TipoEvento> = new Set(['troca_equipe']);

/** Quantos cartões a linha do tempo desenha antes do «mostrar mais». */
const PAGINA = 60;

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function paraArquivo(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export default function AbaHistorico({
  empresas, rotuloAlvo, cidade, onCidade, versao, previa, onPessoa, fotoDe,
}: {
  /** Ids das operações que o quadro lê. */
  empresas: readonly string[];
  rotuloAlvo: string;
  /** A cidade do topo do Quadro (chave do histórico; `~` = sem cidade), ou null. */
  cidade: string | null;
  /** Troca a cidade do topo (os atalhos dos painéis levam até lá). */
  onCidade: (chave: string) => void;
  /** Muda quando o «Atualizar» do topo é apertado. */
  versao: number;
  /** Dados de exemplo, sem banco (só em desenvolvimento). */
  previa: boolean;
  /** Abre a pessoa no quadro de hoje; `false` se ela não está mais no quadro. */
  onPessoa: (pessoaId: string) => boolean;
  /** A foto de hoje da pessoa, quando ela está no quadro. */
  fotoDe: (pessoaId: string) => string | null;
}) {
  const mesAtual = mesDe(new Date());
  const [mes, setMes] = useState(mesAtual);
  const [setor, setSetor] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoEvento | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [limite, setLimite] = useState(PAGINA);

  const [eventos, setEventos] = useState<EventoRh[] | null>(null);
  const [anteriores, setAnteriores] = useState<EventoRh[] | null>(null);
  const [erro, setErro] = useState<{ msg: string; semAcesso: boolean } | null>(null);
  const [carregando, setCarregando] = useState(false);

  const memoria = useRef(new Map<string, EventoRh[]>());
  const versaoVista = useRef(versao);
  const chaveEmpresas = empresas.join(',');

  const carregar = useCallback(async () => {
    if (versaoVista.current !== versao) {
      memoria.current.clear();
      versaoVista.current = versao;
    }
    if (!chaveEmpresas) { setEventos([]); setAnteriores([]); return; }
    const ler = async (m: string): Promise<EventoRh[]> => {
      if (m < PRIMEIRO_MES) return [];
      const chave = `${chaveEmpresas}|${m}|${previa ? 'previa' : ''}`;
      const guardado = memoria.current.get(chave);
      if (guardado) return guardado;
      const lista = previa ? historicoDeExemplo(m) : await carregarHistoricoMes(chaveEmpresas.split(','), m);
      memoria.current.set(chave, lista);
      return lista;
    };
    setCarregando(true);
    try {
      const [agora, antes] = await Promise.all([ler(mes), ler(somarMes(mes, -1))]);
      setEventos(agora);
      setAnteriores(antes);
      setErro(null);
    } catch (e) {
      const semAcesso = e instanceof SemAcessoHistorico;
      setErro({ msg: e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e), semAcesso });
    } finally {
      setCarregando(false);
    }
  }, [chaveEmpresas, mes, versao, previa]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Trocar de mês ou de cidade limpa os recortes (podem não existir no outro).
  useEffect(() => { setSetor(null); setDia(null); }, [mes, chaveEmpresas, cidade]);
  useEffect(() => { setLimite(PAGINA); }, [mes, cidade, setor, tipo, dia]);

  // ── Recortes ───────────────────────────────────────────────────────────────

  const doRecorte = useMemo(() => filtrar(eventos ?? [], { cidade, setor }), [eventos, cidade, setor]);
  const doRecorteAntes = useMemo(() => filtrar(anteriores ?? [], { cidade, setor }), [anteriores, cidade, setor]);
  const contagem = useMemo(() => contarTipos(doRecorte), [doRecorte]);
  const contagemAntes = useMemo(() => contarTipos(doRecorteAntes), [doRecorteAntes]);
  const porCidade = useMemo(() => contarPorCidade(filtrar(eventos ?? [], { cidade: null, setor })), [eventos, setor]);
  const cidades = useMemo(() => cidadesDoMes(eventos ?? []), [eventos]);
  const setores = useMemo(() => setoresDoMes(filtrar(eventos ?? [], { cidade, setor: null })), [eventos, cidade]);

  /** O gráfico respeita o tipo escolhido; a linha do tempo, tipo e dia. */
  const doTipo = useMemo(
    () => doRecorte.filter(e => (tipo ? e.tipo === tipo : !FORA_POR_PADRAO.has(e.tipo))),
    [doRecorte, tipo],
  );
  const dias = useMemo(() => porDia(doTipo, mes), [doTipo, mes]);
  const linhaDoTempo = useMemo(
    () => doTipo
      .filter(e => !dia || e.dia === dia)
      .sort((a, b) => b.dia.localeCompare(a.dia) || a.pessoa_nome.localeCompare(b.pessoa_nome, 'pt-BR')),
    [doTipo, dia],
  );
  const porDiaNaLinha = useMemo(() => {
    const grupos: { dia: string; eventos: EventoRh[] }[] = [];
    for (const e of linhaDoTempo.slice(0, limite)) {
      const ultimo = grupos[grupos.length - 1];
      if (ultimo?.dia === e.dia) ultimo.eventos.push(e); else grupos.push({ dia: e.dia, eventos: [e] });
    }
    return grupos;
  }, [linhaDoTempo, limite]);

  const exportar = useCallback(async () => {
    if (!doRecorte.length) return;
    try {
      const abas = linhasDoHistorico(doRecorte, rotuloCargo);
      const recorte = [rotuloAlvo, setores.find(s => s.id === setor)?.nome].filter(Boolean).join(' ');
      await baixarPlanilha(abas, `historico_rh_${mes}_${paraArquivo(recorte) || 'quadro'}.xlsx`);
      toast.success(`Histórico de ${rotuloMes(mes)} baixado.`);
      if (!previa) {
        void registrarLog({
          acao: 'rh_historico_exportado',
          categoria: 'usuario',
          severidade: 'aviso',
          descricao: `Exportou o histórico do RH de ${rotuloMes(mes)} (${recorte})`,
          empresaId: empresas.length === 1 ? empresas[0] : null,
          alvoTipo: 'empresa',
          alvoRotulo: recorte,
          detalhes: { mes, eventos: doRecorte.length },
        });
      }
    } catch (e) {
      toast.error('Não foi possível gerar a planilha: ' + (e instanceof Error ? e.message : String(e)));
    }
  }, [doRecorte, rotuloAlvo, setores, setor, mes, previa, empresas]);

  const podeVoltar = mes > PRIMEIRO_MES;
  const podeAvancar = mes < mesAtual;
  const mesAnterior = somarMes(mes, -1);
  const temAnterior = mesAnterior >= PRIMEIRO_MES;

  return (
    <section className="space-y-5" aria-label="Histórico do mês">
      {/* Barra: mês, setor, exportar (a cidade é a do topo do Quadro) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-10 items-center rounded-xl border border-border bg-card shadow-sm">
          <button
            type="button"
            onClick={() => setMes(m => somarMes(m, -1))}
            disabled={!podeVoltar}
            className="inline-flex h-full w-10 items-center justify-center rounded-l-xl text-muted-foreground transition hover:bg-muted disabled:opacity-40"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="inline-flex min-w-[11rem] items-center justify-center gap-2 px-2 text-sm font-semibold tabular-nums text-foreground">
            <CalendarDays className="size-4 text-primary" /> {rotuloMes(mes)}
          </span>
          <button
            type="button"
            onClick={() => setMes(m => somarMes(m, 1))}
            disabled={!podeAvancar}
            className="inline-flex h-full w-10 items-center justify-center rounded-r-xl text-muted-foreground transition hover:bg-muted disabled:opacity-40"
            aria-label="Próximo mês"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        {mes === mesAtual && (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">mês em andamento · até agora</span>
        )}

        <SeletorFiltro
          valor={setor}
          onTrocar={setSetor}
          Icone={MapPin}
          rotulo="Setor"
          rotuloTodos="Todos os setores"
          placeholderBusca="Buscar setor…"
          vazio="Nenhum setor com esse nome."
          className="h-10 max-w-[16rem]"
          opcoes={setores.map(s => ({
            valor: s.id,
            rotulo: s.nome,
            grupo: s.cidade ? [s.cidade, marcaDaCidade(s.cidade)?.nome].filter(Boolean).join(' · ') : 'Sem cidade',
            contagem: s.eventos,
          }))}
        />

        <Button size="sm" variant="outline" className="ml-auto h-10 gap-1.5" onClick={() => void exportar()} disabled={!doRecorte.length}>
          <Download className="size-4" /> Exportar mês
        </Button>
      </div>

      {previa && (
        <p className="rounded-lg border border-dashed border-warning/50 bg-warning/5 px-3 py-2 text-xs text-warning">
          Prévia com dados inventados — nada aqui veio do banco.
        </p>
      )}
      {mes === PRIMEIRO_MES && (
        <p className="text-xs text-muted-foreground">
          O histórico de cadastro começa em 12/08/2026: agosto mostra só o que aconteceu daquele dia em diante.
        </p>
      )}

      {erro ? (
        <div className="mx-auto max-w-md space-y-3 py-12 text-center">
          {erro.semAcesso ? <Lock className="mx-auto size-8 opacity-40" /> : <AlertTriangle className="mx-auto size-8 text-warning" />}
          <p className="text-sm font-medium">{erro.semAcesso ? 'Sem acesso ao histórico.' : 'Não foi possível carregar o histórico.'}</p>
          <p className="text-xs text-muted-foreground">
            {erro.semAcesso ? 'Ele abre para quem tem a chave «Aba Quadro de Pessoal (RH)», em Configurações › Permissões.' : erro.msg}
          </p>
          {!erro.semAcesso && <Button size="sm" variant="outline" onClick={() => void carregar()}>Tentar de novo</Button>}
        </div>
      ) : eventos === null || carregando ? (
        <Esqueleto />
      ) : doRecorte.length === 0 ? (
        <div className="mx-auto max-w-md space-y-2 py-16 text-center">
          <History className="mx-auto size-8 opacity-40" />
          <p className="text-sm font-medium">Nenhuma movimentação em {rotuloMes(mes)}{setor || cidade !== null ? ' com esse recorte' : ''}.</p>
          <p className="text-xs text-muted-foreground">Transferências, cargos, desligamentos, afastamentos e férias aparecem aqui.</p>
        </div>
      ) : (
        <>
          {/* ── 1. Resumo ─────────────────────────────────────────────────── */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <SaldoDoQuadro
              entradas={contagem.entrada + contagem.reativacao}
              saidas={contagem.desligamento}
              entradasAntes={contagemAntes.entrada + contagemAntes.reativacao}
              saidasAntes={contagemAntes.desligamento}
              mesAnterior={temAnterior ? rotuloMes(mesAnterior) : null}
            />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {TIPOS_EVENTO.map(t => (
                <PainelTipo
                  key={t}
                  tipo={t}
                  valor={contagem[t]}
                  antes={temAnterior ? contagemAntes[t] : null}
                  ativo={tipo === t}
                  divisao={cidade === null
                    ? cidades.filter(c => (porCidade.get(c.chave)?.[t] ?? 0) > 0)
                      .map(c => ({ chave: c.chave, nome: c.nome, n: porCidade.get(c.chave)?.[t] ?? 0 }))
                    : []}
                  onCidade={onCidade}
                  onClick={() => { setTipo(tipo === t ? null : t); setDia(null); }}
                />
              ))}
            </div>
          </div>

          {/* ── 2. Ritmo do mês ──────────────────────────────────────────── */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
            <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-base font-semibold text-foreground">Ritmo do mês</h3>
              <p className="text-sm text-muted-foreground">
                {tipo ? `${ROTULO_TIPO[tipo].aba} por dia` : 'Movimentações por dia, sem as trocas de equipe'} · clique num dia para ver só ele
              </p>
            </header>
            <GraficoDias dias={dias} diaAtivo={dia} onDia={d => setDia(dia === d ? null : d)} />
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              {TIPOS_EVENTO.filter(t => dias.some(d => d.porTipo[t] > 0)).map(t => (
                <li key={t} className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2.5 rounded-sm" style={{ backgroundColor: META[t].cor }} />
                  {ROTULO_TIPO[t].aba}
                </li>
              ))}
            </ul>
          </section>

          {/* ── 3. Linha do tempo ────────────────────────────────────────── */}
          <section className="rounded-2xl border border-border bg-card shadow-sm">
            <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 md:px-5">
              <h3 className="text-base font-semibold text-foreground">Linha do tempo</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                {linhaDoTempo.length}
              </span>
              {tipo && <Recorte onTirar={() => setTipo(null)}>{ROTULO_TIPO[tipo].aba}</Recorte>}
              {dia && <Recorte onTirar={() => setDia(null)}>{dataCurta(dia)}</Recorte>}
              {!tipo && contagem.troca_equipe > 0 && (
                <button
                  type="button"
                  onClick={() => setTipo('troca_equipe')}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                >
                  <Shuffle className="size-3" /> Ver as {contagem.troca_equipe} trocas de equipe
                </button>
              )}
            </header>

            {linhaDoTempo.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">Nada com esse recorte.</p>
            ) : (
              <ol className="relative space-y-6 p-4 md:p-5">
                {porDiaNaLinha.map(g => (
                  <li key={g.dia} className="grid gap-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                    <DataDoDia dia={g.dia} quantos={g.eventos.length} />
                    <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),1fr))]">
                      {g.eventos.map((e, i) => (
                        <CartaoEvento key={`${e.pessoa_id}-${e.tipo}-${i}`} e={e} foto={e.pessoa_id ? fotoDe(e.pessoa_id) : null} onPessoa={onPessoa} />
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {linhaDoTempo.length > limite && (
              <div className="border-t border-border p-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setLimite(l => l + PAGINA)}>
                  Mostrar mais {Math.min(PAGINA, linhaDoTempo.length - limite)} de {linhaDoTempo.length - limite}
                </Button>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}

// ── Resumo ───────────────────────────────────────────────────────────────────

function SaldoDoQuadro({
  entradas, saidas, entradasAntes, saidasAntes, mesAnterior,
}: { entradas: number; saidas: number; entradasAntes: number; saidasAntes: number; mesAnterior: string | null }) {
  const saldo = entradas - saidas;
  const maior = Math.max(1, entradas, saidas);
  const Seta = saldo > 0 ? TrendingUp : saldo < 0 ? TrendingDown : Minus;
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Saldo do quadro</p>
      <p className="mt-2 flex items-center gap-2 leading-none">
        <span
          className="text-5xl font-bold tabular-nums tracking-tight"
          style={{ color: saldo > 0 ? 'var(--chart-2)' : saldo < 0 ? 'var(--chart-5)' : undefined }}
        >
          {saldo > 0 ? `+${saldo}` : saldo}
        </span>
        <Seta className="size-6 text-muted-foreground" />
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {saldo === 0 ? 'Entrou tanta gente quanto saiu.' : saldo > 0 ? 'Entrou mais gente do que saiu.' : 'Saiu mais gente do que entrou.'}
      </p>
      <div className="mt-5 space-y-3">
        <BarraSaldo rotulo="Entradas e reativações" valor={entradas} maior={maior} cor="var(--chart-2)" />
        <BarraSaldo rotulo="Desligamentos" valor={saidas} maior={maior} cor="var(--chart-5)" />
      </div>
      {mesAnterior && (
        <p className="mt-auto pt-4 text-xs text-muted-foreground">
          Em {mesAnterior}: {entradasAntes} {entradasAntes === 1 ? 'entrada' : 'entradas'} e {saidasAntes} {saidasAntes === 1 ? 'desligamento' : 'desligamentos'}.
        </p>
      )}
    </div>
  );
}

function BarraSaldo({ rotulo, valor, maior, cor }: { rotulo: string; valor: number; maior: number; cor: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-foreground/80">{rotulo}</span>
        <strong className="tabular-nums text-foreground">{valor}</strong>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(valor / maior) * 100}%`, backgroundColor: cor }} />
      </div>
    </div>
  );
}

function PainelTipo({
  tipo, valor, antes, ativo, divisao, onCidade, onClick,
}: {
  tipo: TipoEvento; valor: number; antes: number | null; ativo: boolean;
  divisao: { chave: string; nome: string; n: number }[];
  onCidade: (chave: string) => void;
  onClick: () => void;
}) {
  const { Icone, cor } = META[tipo];
  const delta = antes === null ? null : valor - antes;
  const vazio = valor === 0;
  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-2xl border bg-card p-3.5 shadow-sm transition',
        ativo ? 'ring-2' : 'border-border hover:-translate-y-0.5 hover:shadow-md',
        vazio && !ativo && 'opacity-55',
      )}
      style={ativo ? { borderColor: cor, ['--tw-ring-color' as string]: `color-mix(in oklch, ${cor} 35%, transparent)` } : undefined}
    >
      <button type="button" onClick={onClick} aria-pressed={ativo} className="absolute inset-0 rounded-2xl" aria-label={`Ver ${ROTULO_TIPO[tipo].varios}`} />
      <div className="flex items-center justify-between">
        <span className="inline-flex size-8 items-center justify-center rounded-xl" style={tingido(cor)}>
          <Icone className="size-4" />
        </span>
        {delta !== null && delta !== 0 && (
          <span
            title={`No mês anterior: ${antes}`}
            className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
              'bg-muted text-muted-foreground')}
          >
            {delta > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {delta > 0 ? `+${delta}` : delta}
          </span>
        )}
      </div>
      <p className="mt-3 text-3xl font-bold leading-none tabular-nums tracking-tight text-foreground">{valor}</p>
      <p className="mt-1 text-xs font-medium text-foreground/75">{ROTULO_TIPO[tipo].aba}</p>
      {divisao.length > 1 && (
        <p className="relative mt-2 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
          {divisao.map(d => (
            <button
              key={d.chave}
              type="button"
              onClick={() => onCidade(d.chave)}
              className="rounded hover:text-foreground hover:underline"
              title={`Ver só ${d.nome}`}
            >
              {d.nome} <strong className="tabular-nums">{d.n}</strong>
            </button>
          ))}
        </p>
      )}
    </div>
  );
}

// ── Ritmo do mês ─────────────────────────────────────────────────────────────

function GraficoDias({
  dias, diaAtivo, onDia,
}: { dias: ReturnType<typeof porDia>; diaAtivo: string | null; onDia: (dia: string) => void }) {
  const maior = Math.max(1, ...dias.map(d => d.total));
  const hoje = new Date().toISOString().slice(0, 10);
  return (
    <div className="mt-4">
      <div className="flex h-36 items-end gap-[3px] sm:gap-1" role="img" aria-label="Movimentações por dia do mês">
        {dias.map(d => {
          const ativo = diaAtivo === d.dia;
          const apagado = diaAtivo !== null && !ativo;
          const futuro = d.dia > hoje;
          return (
            <button
              key={d.dia}
              type="button"
              onClick={() => d.total > 0 && onDia(d.dia)}
              disabled={d.total === 0}
              title={`${dataCurta(d.dia)} · ${d.total} ${d.total === 1 ? 'movimentação' : 'movimentações'}${
                d.total ? ': ' + TIPOS_EVENTO.filter(t => d.porTipo[t]).map(t => `${d.porTipo[t]} ${ROTULO_TIPO[t].aba.toLowerCase()}`).join(', ') : ''}`}
              className={cn(
                'group flex h-full min-w-0 flex-1 flex-col justify-end rounded-md transition',
                d.fimDeSemana && 'bg-muted/50',
                ativo && 'bg-primary/10 ring-1 ring-primary/40',
                d.total > 0 && 'cursor-pointer hover:bg-muted',
                apagado && 'opacity-35',
                futuro && 'opacity-40',
              )}
            >
              <span className="mb-0.5 text-center text-[10px] font-semibold tabular-nums text-foreground/70 opacity-0 transition group-hover:opacity-100">
                {d.total || ''}
              </span>
              <span className="flex flex-col-reverse overflow-hidden rounded-[4px]" style={{ height: `${(d.total / maior) * 100}%` }}>
                {TIPOS_EVENTO.filter(t => d.porTipo[t] > 0).map(t => (
                  <span key={t} style={{ flexGrow: d.porTipo[t], backgroundColor: META[t].cor }} className="min-h-[3px]" />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[3px] sm:gap-1">
        {dias.map((d, i) => (
          <span key={d.dia} className={cn('min-w-0 flex-1 text-center text-[10px] tabular-nums text-muted-foreground', diaAtivo === d.dia && 'font-bold text-primary')}>
            {i === 0 || (i + 1) % 5 === 0 || diaAtivo === d.dia ? i + 1 : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Linha do tempo ───────────────────────────────────────────────────────────

function DataDoDia({ dia, quantos }: { dia: string; quantos: number }) {
  const d = new Date(`${dia}T12:00:00`);
  return (
    <div className="flex items-center gap-2 sm:sticky sm:top-4 sm:flex-col sm:items-start sm:gap-0 sm:self-start">
      <span className="flex size-14 flex-col items-center justify-center rounded-2xl border border-border bg-background shadow-sm">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{DIAS_SEMANA[d.getDay()]}</span>
        <span className="text-xl font-bold leading-none tabular-nums text-foreground">{d.getDate()}</span>
      </span>
      <span className="text-[11px] text-muted-foreground sm:mt-1.5 sm:pl-1">{quantos} {quantos === 1 ? 'evento' : 'eventos'}</span>
    </div>
  );
}

function CartaoEvento({ e, foto, onPessoa }: { e: EventoRh; foto: string | null; onPessoa: (id: string) => boolean }) {
  const { Icone, cor } = META[e.tipo];
  const abrir = () => {
    if (e.pessoa_id && !onPessoa(e.pessoa_id)) toast.info(`${e.pessoa_nome} não está mais no quadro de hoje.`);
  };
  return (
    <article
      className="relative overflow-hidden rounded-xl border border-border bg-background p-3 pl-4 transition hover:shadow-md"
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: cor }} aria-hidden />
      <div className="flex items-start gap-3">
        <span className="relative shrink-0">
          <span className="inline-flex size-10 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground">
            {foto ? <img src={foto} alt="" loading="lazy" className="size-full object-cover" /> : iniciais(e.pessoa_nome)}
          </span>
          <span className="absolute -bottom-1 -right-1 inline-flex size-5 items-center justify-center rounded-full ring-2 ring-background" style={{ backgroundColor: cor }}>
            <Icone className="size-3 text-white" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <button
                type="button"
                onClick={abrir}
                disabled={!e.pessoa_id}
                className="block max-w-full truncate text-left text-sm font-semibold text-foreground hover:text-primary hover:underline disabled:no-underline"
              >
                {e.pessoa_nome}
              </button>
              <p className="truncate text-xs text-muted-foreground">
                {e.cargo ? rotuloCargo(e.cargo) : 'Sem cargo'} · <span style={{ color: cor }} className="font-medium">{ROTULO_TIPO[e.tipo].um}</span>
              </p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <Detalhe e={e} cor={cor} />
          </div>
          {e.feito_por && <p className="mt-2 text-[11px] text-muted-foreground">por {e.feito_por}</p>}
        </div>
      </div>
    </article>
  );
}

function Pilula({ children, forte, cor }: { children: ReactNode; forte?: boolean; cor?: string }) {
  return (
    <span
      className={cn('inline-flex max-w-full items-center truncate rounded-md px-2 py-0.5 font-medium', !forte && 'bg-muted text-foreground/80')}
      style={forte && cor ? tingido(cor, 16) : undefined}
    >
      {children}
    </span>
  );
}

function DePara({ de, para, cor }: { de: string; para: string; cor: string }) {
  return (
    <>
      <Pilula>{de}</Pilula>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
      <Pilula forte cor={cor}>{para}</Pilula>
    </>
  );
}

function periodo(e: EventoRh): string {
  const ini = dataCurta(e.inicio);
  if (!e.fim || e.fim.startsWith(SEM_DATA_DE_VOLTA)) return `desde ${ini} · sem data de volta`;
  return `${ini} → ${dataCurta(e.fim)}`;
}

function Detalhe({ e, cor }: { e: EventoRh; cor: string }) {
  const setor = e.setor_para_nome ?? e.setor_de_nome ?? 'Sem setor';
  switch (e.tipo) {
    case 'transferencia':
      return (
        <>
          <DePara de={e.setor_de_nome ?? 'Sem setor'} para={e.setor_para_nome ?? 'Sem setor'} cor={cor} />
          {cruzaCidades(e) && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={tingido('var(--info)')}>
              <MapPin className="size-3" /> {e.cidade_de ?? 'Sem cidade'} → {e.cidade_para ?? 'Sem cidade'}
            </span>
          )}
        </>
      );
    case 'cargo':
      return (
        <>
          <DePara de={e.valor_de ? rotuloCargo(e.valor_de) : '—'} para={e.valor_para ? rotuloCargo(e.valor_para) : '—'} cor={cor} />
          {e.sentido === 'promocao' && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={tingido('var(--chart-2)')}>
              <TrendingUp className="size-3" /> promoção
            </span>
          )}
          {e.sentido === 'rebaixamento' && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={tingido('var(--chart-5)')}>
              <TrendingDown className="size-3" /> rebaixamento
            </span>
          )}
          <span className="text-muted-foreground">· {setor}</span>
        </>
      );
    case 'troca_equipe':
      return (
        <>
          <DePara de={e.valor_de ?? 'Sem equipe'} para={e.valor_para ?? 'Sem equipe'} cor={cor} />
          <span className="text-muted-foreground">· {setor}</span>
        </>
      );
    case 'afastamento':
    case 'ferias':
      return (
        <>
          <Pilula forte cor={cor}>{e.ausencia_rotulo ?? (e.tipo === 'ferias' ? 'Férias' : 'Afastamento')}</Pilula>
          <span className="tabular-nums text-foreground/80">{periodo(e)}</span>
          <span className="text-muted-foreground">· {setor}</span>
        </>
      );
    case 'desligamento':
      return <><Pilula forte cor={cor}>Desligado</Pilula><span className="text-muted-foreground">· {setor}</span></>;
    case 'reativacao':
      return <><Pilula forte cor={cor}>Reativado</Pilula><span className="text-muted-foreground">· {setor}</span></>;
    case 'entrada':
      return <><span className="text-muted-foreground">Entrou em</span><Pilula forte cor={cor}>{setor}</Pilula></>;
  }
}

function Recorte({ children, onTirar }: { children: ReactNode; onTirar: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-foreground ring-1 ring-primary/30">
      {children}
      <button type="button" onClick={onTirar} className="rounded-full p-0.5 hover:bg-primary/20" aria-label="Tirar recorte">
        <X className="size-3" />
      </button>
    </span>
  );
}

function Esqueleto() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <Skeleton className="h-64 rounded-2xl" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      </div>
      <Skeleton className="h-52 rounded-2xl" />
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}
