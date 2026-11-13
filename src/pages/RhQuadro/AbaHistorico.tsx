/**
 * AbaHistorico — o que aconteceu com as pessoas num mês (13/11/2026).
 *
 * Transferências, mudanças de cargo, desligamentos, reativações, afastamentos,
 * férias, entradas e trocas de equipe, separados por cidade. Só leitura: tudo
 * vem de `fn_rh_historico_mes`, que lê o log de cadastro e as ausências.
 *
 * Carrega ao abrir, uma vez por (empresas, mês), e guarda enquanto a tela está
 * aberta. O «Atualizar» do topo apaga a memória e relê.
 *
 * Spec: docs/superpowers/specs/2026-11-13-rh-historico-do-mes-design.md
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowRight, ArrowRightLeft, ChevronDown, ChevronLeft, ChevronRight, Download,
  HeartPulse, History, Lock, MapPin, Shuffle, Sun, TrendingDown, TrendingUp, UserCheck, UserMinus, UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  PRIMEIRO_MES, ROTULO_TIPO, SEM_DATA_DE_VOLTA, TIPOS_EVENTO,
  agruparPorTipo, cidadesDoMes, contarPorCidade, cruzaCidades, filtrar, linhasDoHistorico, mesDe,
  rotuloMes, setoresDoMes, somarMes,
  type EventoRh, type TipoEvento,
} from '@/services/rh/historicoMes';
import { SemAcessoHistorico, carregarHistoricoMes } from '@/services/rh/historicoMes.service';
import { baixarPlanilha } from '@/services/rh/quadroPessoalPlanilha';
import { registrarLog } from '@/services/logs.service';
import { dataCurta, rotuloCargo } from './formato';
import { historicoDeExemplo } from './historicoExemplo';

const META: Record<TipoEvento, { Icone: LucideIcon; cor: string; fundo: string }> = {
  transferencia: { Icone: ArrowRightLeft, cor: 'text-primary',          fundo: 'bg-primary/10' },
  cargo:         { Icone: TrendingUp,     cor: 'text-info',             fundo: 'bg-info/10' },
  desligamento:  { Icone: UserMinus,      cor: 'text-destructive',      fundo: 'bg-destructive/10' },
  reativacao:    { Icone: UserCheck,      cor: 'text-success',          fundo: 'bg-success/10' },
  afastamento:   { Icone: HeartPulse,     cor: 'text-warning',          fundo: 'bg-warning/10' },
  ferias:        { Icone: Sun,            cor: 'text-warning',          fundo: 'bg-warning/10' },
  entrada:       { Icone: UserPlus,       cor: 'text-success',          fundo: 'bg-success/10' },
  troca_equipe:  { Icone: Shuffle,        cor: 'text-muted-foreground', fundo: 'bg-muted' },
};

/** Seções que nascem recolhidas: são muitas e dizem pouco ao RH. */
const RECOLHIDAS: ReadonlySet<TipoEvento> = new Set(['troca_equipe']);

function paraArquivo(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export default function AbaHistorico({
  empresas, rotuloAlvo, versao, previa, onPessoa,
}: {
  /** Ids das empresas do seletor do topo. */
  empresas: readonly string[];
  rotuloAlvo: string;
  /** Muda quando o «Atualizar» do topo é apertado. */
  versao: number;
  /** Dados de exemplo, sem banco (só em desenvolvimento). */
  previa: boolean;
  /** Abre a pessoa no quadro de hoje; `false` se ela não está mais no quadro. */
  onPessoa: (pessoaId: string) => boolean;
}) {
  const mesAtual = mesDe(new Date());
  const [mes, setMes] = useState(mesAtual);
  const [cidade, setCidade] = useState<string | null>(null);
  const [setor, setSetor] = useState<string | null>(null);
  const [abertas, setAbertas] = useState<Set<TipoEvento>>(() => new Set(TIPOS_EVENTO.filter(t => !RECOLHIDAS.has(t))));

  const [eventos, setEventos] = useState<EventoRh[] | null>(null);
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
    const chave = `${chaveEmpresas}|${mes}|${previa ? 'previa' : ''}`;
    const guardado = memoria.current.get(chave);
    if (guardado) { setEventos(guardado); setErro(null); return; }
    if (!chaveEmpresas) { setEventos([]); return; }
    setCarregando(true);
    try {
      const lista = previa ? historicoDeExemplo(mes) : await carregarHistoricoMes(chaveEmpresas.split(','), mes);
      memoria.current.set(chave, lista);
      setEventos(lista);
      setErro(null);
    } catch (e) {
      const semAcesso = e instanceof SemAcessoHistorico;
      setErro({ msg: e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e), semAcesso });
    } finally {
      setCarregando(false);
    }
  }, [chaveEmpresas, mes, versao, previa]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Trocar de mês ou de empresa limpa o setor (pode não existir no outro recorte).
  useEffect(() => { setSetor(null); }, [mes, chaveEmpresas]);

  const cidades = useMemo(() => cidadesDoMes(eventos ?? []), [eventos]);
  const contagem = useMemo(() => contarPorCidade(eventos ?? []), [eventos]);
  const setores = useMemo(() => setoresDoMes(filtrar(eventos ?? [], { cidade, setor: null })), [eventos, cidade]);
  const visiveis = useMemo(() => filtrar(eventos ?? [], { cidade, setor }), [eventos, cidade, setor]);
  const secoes = useMemo(() => agruparPorTipo(visiveis), [visiveis]);

  const irPara = useCallback((tipo: TipoEvento, cid: string) => {
    setCidade(cid);
    setSetor(null);
    setAbertas(a => new Set(a).add(tipo));
    window.setTimeout(() => {
      document.getElementById(`historico-${tipo}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, []);

  const alternar = (tipo: TipoEvento) => setAbertas(a => {
    const n = new Set(a);
    if (n.has(tipo)) n.delete(tipo); else n.add(tipo);
    return n;
  });

  const exportar = useCallback(async () => {
    if (!visiveis.length) return;
    try {
      const abas = linhasDoHistorico(visiveis, rotuloCargo);
      const recorte = [rotuloAlvo, cidades.find(c => c.chave === cidade)?.nome, setores.find(s => s.id === setor)?.nome]
        .filter(Boolean).join(' ');
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
          detalhes: { mes, eventos: visiveis.length },
        });
      }
    } catch (e) {
      toast.error('Não foi possível gerar a planilha: ' + (e instanceof Error ? e.message : String(e)));
    }
  }, [visiveis, rotuloAlvo, cidades, cidade, setores, setor, mes, previa, empresas]);

  const podeVoltar = mes > PRIMEIRO_MES;
  const podeAvancar = mes < mesAtual;

  return (
    <section className="space-y-4" aria-label="Histórico do mês">
      {/* Barra: mês, cidade, setor, exportar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-9 items-center rounded-md border border-input bg-background">
          <button
            type="button"
            onClick={() => setMes(m => somarMes(m, -1))}
            disabled={!podeVoltar}
            className="inline-flex h-full w-9 items-center justify-center rounded-l-md text-muted-foreground hover:bg-muted disabled:opacity-40"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-[9.5rem] px-2 text-center text-sm font-semibold tabular-nums text-foreground">
            {rotuloMes(mes)}
          </span>
          <button
            type="button"
            onClick={() => setMes(m => somarMes(m, 1))}
            disabled={!podeAvancar}
            className="inline-flex h-full w-9 items-center justify-center rounded-r-md text-muted-foreground hover:bg-muted disabled:opacity-40"
            aria-label="Próximo mês"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        {mes === mesAtual && <span className="text-xs text-muted-foreground">até agora</span>}

        <div className="inline-flex h-9 items-center rounded-md border border-input bg-background p-0.5" role="group" aria-label="Cidade">
          {[{ chave: null as string | null, nome: 'Todas' }, ...cidades].map(c => (
            <button
              key={c.chave ?? 'todas'}
              type="button"
              aria-pressed={cidade === c.chave}
              onClick={() => { setCidade(c.chave); setSetor(null); }}
              className={cn(
                'h-full rounded px-3 text-xs font-medium transition-colors',
                cidade === c.chave ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {c.nome}
            </button>
          ))}
        </div>

        <label className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm">
          <MapPin className="size-4 text-muted-foreground" />
          <select
            value={setor ?? ''}
            onChange={e => setSetor(e.target.value || null)}
            className="max-w-[12rem] bg-transparent text-foreground outline-none"
            aria-label="Setor"
          >
            <option value="">Todos os setores</option>
            {setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </label>

        <Button size="sm" variant="outline" className="ml-auto h-9 gap-1.5" onClick={() => void exportar()} disabled={!visiveis.length}>
          <Download className="size-4" /> Exportar mês
        </Button>
      </div>

      {previa && (
        <p className="rounded-md border border-dashed border-warning/50 bg-warning/5 px-3 py-2 text-xs text-warning">
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
            {erro.semAcesso ? 'Ele abre para quem tem o RH Gestão com o alcance «todos os setores».' : erro.msg}
          </p>
          {!erro.semAcesso && <Button size="sm" variant="outline" onClick={() => void carregar()}>Tentar de novo</Button>}
        </div>
      ) : eventos === null || carregando ? (
        <Esqueleto />
      ) : eventos.length === 0 ? (
        <div className="mx-auto max-w-md space-y-2 py-16 text-center">
          <History className="mx-auto size-8 opacity-40" />
          <p className="text-sm font-medium">Nenhuma movimentação em {rotuloMes(mes)}.</p>
          <p className="text-xs text-muted-foreground">Transferências, cargos, desligamentos, afastamentos e férias aparecem aqui.</p>
        </div>
      ) : (
        <>
          {/* Uma carta por cidade */}
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
            {cidades.map(c => {
              const cont = contagem.get(c.chave);
              const total = cont ? TIPOS_EVENTO.reduce((s, t) => s + cont[t], 0) : 0;
              return (
                <div
                  key={c.chave}
                  className={cn(
                    'rounded-xl border bg-card p-4 shadow-sm transition-colors',
                    cidade === c.chave ? 'border-primary/50' : 'border-border',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => { setCidade(cidade === c.chave ? null : c.chave); setSetor(null); }}
                      className="text-left"
                    >
                      <span className="font-semibold text-foreground">{c.nome}</span>
                      {c.marca && <span className="text-sm text-muted-foreground"> · {c.marca}</span>}
                    </button>
                    <span className="text-xs tabular-nums text-muted-foreground">{total} no mês</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {TIPOS_EVENTO.filter(t => cont && cont[t] > 0).map(t => {
                      const { Icone, cor, fundo } = META[t];
                      const n = cont![t];
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => irPara(t, c.chave)}
                          className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium hover:ring-1 hover:ring-border', fundo)}
                          title={`Ver ${ROTULO_TIPO[t].varios} de ${c.nome}`}
                        >
                          <Icone className={cn('size-3.5', cor)} />
                          <strong className="tabular-nums text-foreground">{n}</strong>
                          <span className="text-muted-foreground">{n === 1 ? ROTULO_TIPO[t].um : ROTULO_TIPO[t].varios}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* As seções */}
          {secoes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nada com esse filtro.</p>
          ) : (
            <div className="space-y-3">
              {secoes.map(({ tipo, eventos: evs }) => {
                const { Icone, cor, fundo } = META[tipo];
                const aberta = abertas.has(tipo);
                return (
                  <div key={tipo} id={`historico-${tipo}`} className="scroll-mt-4 overflow-hidden rounded-xl border border-border bg-card">
                    <button
                      type="button"
                      onClick={() => alternar(tipo)}
                      aria-expanded={aberta}
                      className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-muted/40"
                    >
                      <span className={cn('inline-flex size-7 items-center justify-center rounded-lg', fundo)}>
                        <Icone className={cn('size-4', cor)} />
                      </span>
                      <span className="font-semibold text-foreground">{ROTULO_TIPO[tipo].aba}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{evs.length}</span>
                      <ChevronDown className={cn('ml-auto size-4 text-muted-foreground transition-transform', aberta && 'rotate-180')} />
                    </button>
                    {aberta && (
                      <ul className="divide-y divide-border border-t border-border">
                        {evs.map((e, i) => <Linha key={`${e.pessoa_id}-${e.dia}-${i}`} e={e} onPessoa={onPessoa} />)}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Linha({ e, onPessoa }: { e: EventoRh; onPessoa: (id: string) => boolean }) {
  const nome = e.pessoa_id ? (
    <button
      type="button"
      onClick={() => { if (!onPessoa(e.pessoa_id!)) toast.info(`${e.pessoa_nome} não está mais no quadro de hoje.`); }}
      className="font-medium text-foreground hover:text-primary hover:underline"
    >
      {e.pessoa_nome}
    </button>
  ) : <span className="font-medium text-foreground">{e.pessoa_nome}</span>;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
      <span className="w-12 shrink-0 tabular-nums text-xs text-muted-foreground">{dataCurta(e.dia).slice(0, 5)}</span>
      <span className="min-w-[10rem] flex-1">
        {nome}
        {e.cargo && <span className="text-xs text-muted-foreground"> · {rotuloCargo(e.cargo)}</span>}
      </span>
      <span className="flex min-w-0 flex-[2] flex-wrap items-center gap-1.5 text-muted-foreground">
        <Detalhe e={e} />
      </span>
      {e.feito_por && <span className="shrink-0 text-xs text-muted-foreground">por {e.feito_por}</span>}
    </li>
  );
}

function DePara({ de, para }: { de: string; para: string }) {
  return (
    <>
      <span>{de}</span>
      <ArrowRight className="size-3.5 shrink-0" />
      <span className="text-foreground">{para}</span>
    </>
  );
}

function Etiqueta({ children, tom }: { children: ReactNode; tom: 'warning' | 'info' | 'destructive' | 'success' | 'muted' }) {
  const cls = {
    warning: 'bg-warning/15 text-warning ring-warning/30',
    info: 'bg-info/15 text-info ring-info/30',
    destructive: 'bg-destructive/15 text-destructive ring-destructive/30',
    success: 'bg-success/15 text-success ring-success/30',
    muted: 'bg-muted text-muted-foreground ring-border',
  }[tom];
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-semibold ring-1', cls)}>{children}</span>;
}

function periodo(e: EventoRh): string {
  const ini = dataCurta(e.inicio);
  if (!e.fim || e.fim.startsWith(SEM_DATA_DE_VOLTA)) return `desde ${ini} · sem data de volta`;
  return `${ini} → ${dataCurta(e.fim)}`;
}

function Detalhe({ e }: { e: EventoRh }) {
  const setor = e.setor_para_nome ?? e.setor_de_nome ?? 'Sem setor';
  switch (e.tipo) {
    case 'transferencia':
      return (
        <>
          <DePara de={e.setor_de_nome ?? 'Sem setor'} para={e.setor_para_nome ?? 'Sem setor'} />
          {cruzaCidades(e) && <Etiqueta tom="info">{e.cidade_de ?? 'Sem cidade'} → {e.cidade_para ?? 'Sem cidade'}</Etiqueta>}
        </>
      );
    case 'cargo':
      return (
        <>
          <DePara de={e.valor_de ? rotuloCargo(e.valor_de) : '—'} para={e.valor_para ? rotuloCargo(e.valor_para) : '—'} />
          {e.sentido === 'promocao' && <Etiqueta tom="success"><TrendingUp className="size-3" /> promoção</Etiqueta>}
          {e.sentido === 'rebaixamento' && <Etiqueta tom="destructive"><TrendingDown className="size-3" /> rebaixamento</Etiqueta>}
          <span className="text-xs">· {setor}</span>
        </>
      );
    case 'troca_equipe':
      return (
        <>
          <DePara de={e.valor_de ?? 'Sem equipe'} para={e.valor_para ?? 'Sem equipe'} />
          <span className="text-xs">· {setor}</span>
        </>
      );
    case 'afastamento':
    case 'ferias':
      return (
        <>
          <Etiqueta tom={e.tipo === 'ferias' ? 'warning' : 'muted'}>{e.ausencia_rotulo ?? (e.tipo === 'ferias' ? 'Férias' : 'Afastamento')}</Etiqueta>
          <span className="tabular-nums">{periodo(e)}</span>
          <span className="text-xs">· {setor}</span>
        </>
      );
    case 'desligamento':
      return <span>Desligado · {setor}</span>;
    case 'reativacao':
      return <span>Reativado · {setor}</span>;
    case 'entrada':
      return <span>Entrou em <span className="text-foreground">{setor}</span></span>;
  }
}

function Esqueleto() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
    </div>
  );
}
