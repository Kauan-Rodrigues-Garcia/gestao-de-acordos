/**
 * MonitoramentoUso — quem usa a planilha, quanto, em quais telas, e quem NÃO usa.
 *
 * ## A pergunta que originou a tela
 *
 * "Quais líderes mais utilizam a planilha, quais acessam mais o Painel Líder e o
 * Desempenho Equipes." O ranking de quem usa responde metade; a outra metade —
 * a acionável — é **quem não usa**, e essa lista não sai de `uso_telas`, porque
 * quem não abriu não tem linha. Por isso os blocos de ausência partem de
 * `perfis` (`fn_uso_sem_acesso`, `fn_uso_adocao_tela`).
 *
 * ## O que os números significam
 *
 * **Tempo** é com a aba em foco, não com a aba aberta — ver `RastreioUsoProvider`.
 * **Aberturas** conta entradas na tela; passagem abaixo de 2 segundos não conta.
 * **Dias ativos** é em quantos dias distintos a pessoa usou alguma tela.
 *
 * O CARGO vem gravado na linha de uso: promover alguém não reescreve o
 * histórico dele como se sempre tivesse sido líder. **Setor e equipe** vêm do
 * cadastro de HOJE, e isso é deliberado — eles respondem «de quem eu cobro
 * isso agora», que é sempre sobre a estrutura atual.
 *
 * ## Por que a tela foi redesenhada (24/08/2026)
 *
 * Três defeitos, todos de leitura:
 *
 *   1. **«Atividade por dia» não funcionava.** As RPCs devolvem só os dias COM
 *      uso, e o gráfico desenhava uma barra por linha recebida — sete dias com
 *      uso em dois viravam duas barras coladas, e a tela mostrava uso constante
 *      onde havia uso esporádico. Agora o eixo é o período inteiro
 *      (`serieDiaria.ts`), e dia sem uso é um zero visível;
 *   2. **o cargo nascia em «Líder».** Todo bloco abria recortado sem que o
 *      usuário tivesse pedido, e um período sem líder ativo abria a tela
 *      inteira vazia. O padrão passou a ser «todos»;
 *   3. **tudo numa rolagem só.** Seis blocos empilhados, sem hierarquia. Agora
 *      há quatro abas internas, e os filtros valem para todas.
 *
 * ## As abas
 *
 *   • **Visão geral** — o tamanho do uso, a curva do período e as telas;
 *   • **Pessoas** — quem usa mais, com detalhe por pessoa no clique;
 *   • **Sem acesso** — quem nunca entrou e quem parou de entrar;
 *   • **Adoção de tela** — de UMA tela escolhida, quem abriu e quem não.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Users, Clock, MousePointerClick, CalendarDays, AlertTriangle,
  Loader2, EyeOff, Building2, UserX, TrendingUp, TrendingDown, Minus,
  Search, X, Filter, LayoutGrid, MonitorSmartphone,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { PERFIL_LABELS } from '@/lib/index';
import { supabase } from '@/lib/supabase';
import { useChartColors } from '@/hooks/useChartColors';
import { rotuloDaTela, TELA_LABEL } from '@/lib/telas-catalogo';
import {
  buscarUsoPorPessoa, buscarUsoPorTela, buscarUsoPorDia, buscarAdocaoTela,
  buscarSemAcesso,
  type UsoPorPessoa, type UsoPorTela, type UsoPorDia, type AdocaoTela,
  type UsoSemAcesso,
} from '@/services/uso.service';
import ListaUsuariosUso from './ListaUsuariosUso';
import { numeroBr, tempoRelativo, formatarDuracao } from './formatos';
import { montarSerieDiaria, tendencia, type PontoDia } from './serieDiaria';

/** Períodos oferecidos. 30 dias é o padrão: 7 é curto demais para tendência. */
const PERIODOS = [
  { dias: 7,  label: 'Últimos 7 dias' },
  { dias: 30, label: 'Últimos 30 dias' },
  { dias: 90, label: 'Últimos 90 dias' },
] as const;

/** Cargos que o painel separa. Ordem de hierarquia, não alfabética. */
const CARGOS = [
  'operador', 'ouvidoria', 'lider', 'elite', 'gerencia', 'diretoria',
  'rh', 'administrador', 'super_admin',
] as const;

/**
 * Telas SEMPRE oferecidas no bloco de adoção.
 *
 * Lista curta e escolhida: são as telas de gestão sobre as quais faz sentido
 * perguntar "quem ainda não abriu", e elas precisam aparecer no seletor mesmo
 * quando ninguém as abriu no período — que é justamente o caso interessante.
 */
const TELAS_ADOCAO = [
  'lider:desempenho', 'lider:quartis', 'lider:grafico', 'lider:time',
  'lider', 'analitico', 'admin/metas', 'diretoria',
] as const;

/**
 * Telas que só existem em UMA das operações.
 *
 * Aparecem em "sem uso nenhum" na outra empresa e não significam nada ali — não
 * é abandono, é módulo que aquele tenant não tem. Ficam de fora do card.
 */
const TELAS_EXCLUSIVAS = new Set(['ouvidoria', 'campanha-facil']);

const TODOS = '__todos__';
const TODAS_EMPRESAS = '__todas__';

type AbaUso = 'geral' | 'pessoas' | 'ausentes' | 'adocao';
type Metrica = 'segundos' | 'aberturas' | 'pessoas';

const METRICAS: { key: Metrica; label: string; formatar: (n: number) => string }[] = [
  { key: 'segundos',  label: 'Tempo',     formatar: formatarDuracao },
  { key: 'aberturas', label: 'Aberturas', formatar: numeroBr },
  { key: 'pessoas',   label: 'Pessoas',   formatar: numeroBr },
];

function isoDiasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

// ── Peças visuais ────────────────────────────────────────────────────────────

function Kpi({
  icone, label, valor, sub, tom,
}: {
  icone: React.ReactNode; label: string; valor: string; sub?: string;
  tom?: 'normal' | 'alerta';
}) {
  return (
    <Card className={cn(
      'p-3.5 flex flex-col gap-1 transition-colors',
      tom === 'alerta' && 'border-amber-500/40 bg-amber-500/[0.04]',
    )}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className={cn('text-muted-foreground', tom === 'alerta' && 'text-amber-500')}>
          {icone}
        </span>
      </div>
      <span className={cn(
        'text-xl font-bold font-mono tabular-nums leading-tight',
        tom === 'alerta' && 'text-amber-500',
      )}>
        {valor}
      </span>
      {sub && <span className="text-[10px] text-muted-foreground leading-snug">{sub}</span>}
    </Card>
  );
}

/** Barra proporcional ao maior valor da lista — comparação sem eixo. */
function Barra({ valor, maximo, cor }: { valor: number; maximo: number; cor: string }) {
  const pct = maximo > 0 ? Math.max(2, (valor / maximo) * 100) : 0;
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden min-w-[40px]">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cor }} />
    </div>
  );
}

/** Selo de tendência do período. Só aparece quando há o que comparar. */
function SeloTendencia({ serie }: { serie: PontoDia[] }) {
  const t = tendencia(serie);
  if (!t) return null;

  const meta = {
    subindo: { Icone: TrendingUp,   cls: 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10' },
    caindo:  { Icone: TrendingDown, cls: 'text-red-400 border-red-500/30 bg-red-500/10' },
    estavel: { Icone: Minus,        cls: 'text-muted-foreground border-border bg-muted/40' },
  }[t.direcao];

  return (
    <span
      title="Segunda metade do período comparada com a primeira. Variação de até 10% conta como estável — é ruído de amostragem."
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
        meta.cls,
      )}
    >
      <meta.Icone className="w-3 h-3" />
      {t.direcao === 'estavel' ? 'estável' : `${t.variacao > 0 ? '+' : ''}${t.variacao}%`}
    </span>
  );
}

interface Props {
  /**
   * Empresas que quem está olhando pode escolher. Uma só = o seletor não aparece.
   *
   * A lista vem do pai porque ele já a busca para o filtro da trilha. Ela NÃO é
   * o gate: a policy de `uso_telas` recusa a empresa alheia de todo jeito.
   */
  empresas: { id: string; nome: string }[];
}

interface SetorOpcao { id: string; nome: string }
interface EquipeOpcao { id: string; nome: string; setor_id: string | null }

export default function MonitoramentoUso({ empresas }: Props) {
  const [aba, setAba] = useState<AbaUso>('geral');

  // ── Filtros ────────────────────────────────────────────────────────────────
  const [dias, setDias]   = useState<number>(30);
  // Nasce em TODOS. O padrão anterior era 'lider', e um período sem líder ativo
  // abria a tela inteira vazia — o defeito lido como "o painel não funciona".
  const [cargo, setCargo] = useState<string>(TODOS);
  const [setorId, setSetorId]   = useState<string>(TODOS);
  const [equipeId, setEquipeId] = useState<string>(TODOS);
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>(TODAS_EMPRESAS);
  const [telaAdocao, setTelaAdocao] = useState<string>('lider:desempenho');
  const [metrica, setMetrica] = useState<Metrica>('segundos');

  const empresaId = filtroEmpresa === TODAS_EMPRESAS ? null : filtroEmpresa;

  // ── Opções de setor e equipe ───────────────────────────────────────────────
  //
  // Consulta direta às duas tabelas: a RLS já recorta por empresa, e criar uma
  // RPC para listar dois nomes seria cerimônia. Recarrega ao trocar de empresa
  // porque as listas são por operação.
  const [setores, setSetores] = useState<SetorOpcao[]>([]);
  const [equipes, setEquipes] = useState<EquipeOpcao[]>([]);

  useEffect(() => {
    let cancelado = false;
    void Promise.all([
      empresaId
        ? supabase.from('setores').select('id, nome').eq('empresa_id', empresaId).order('nome')
        : supabase.from('setores').select('id, nome').order('nome'),
      empresaId
        ? supabase.from('equipes').select('id, nome, setor_id').eq('empresa_id', empresaId).order('nome')
        : supabase.from('equipes').select('id, nome, setor_id').order('nome'),
    ]).then(([s, e]) => {
      if (cancelado) return;
      setSetores((s.data as SetorOpcao[]) ?? []);
      setEquipes((e.data as EquipeOpcao[]) ?? []);
    });
    return () => { cancelado = true; };
  }, [empresaId]);

  /*
   * A equipe escolhida tem de pertencer ao setor escolhido.
   *
   * Sem isto, filtrar «Play 5 + Equipe Alfa (do Play 2)» devolve lista vazia e
   * parece defeito — as duas condições são um E no banco. Trocar o setor limpa
   * a equipe que deixou de fazer sentido.
   */
  const equipesDoSetor = useMemo(
    () => (setorId === TODOS ? equipes : equipes.filter(e => e.setor_id === setorId)),
    [equipes, setorId],
  );

  useEffect(() => {
    if (equipeId !== TODOS && !equipesDoSetor.some(e => e.id === equipeId)) {
      setEquipeId(TODOS);
    }
  }, [equipesDoSetor, equipeId]);

  // ── Dados ──────────────────────────────────────────────────────────────────
  const [pessoas, setPessoas]   = useState<UsoPorPessoa[]>([]);
  const [telas, setTelas]       = useState<UsoPorTela[]>([]);
  const [porDia, setPorDia]     = useState<UsoPorDia[]>([]);
  const [adocao, setAdocao]     = useState<AdocaoTela[]>([]);
  const [ausentes, setAusentes] = useState<UsoSemAcesso[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [carregandoAdocao, setCarregandoAdocao] = useState(false);

  const janela = useMemo(() => ({
    empresaId,
    desde: isoDiasAtras(dias),
    ate:   new Date().toISOString().slice(0, 10),
    cargo:    cargo    === TODOS ? null : cargo,
    setorId:  setorId  === TODOS ? null : setorId,
    equipeId: equipeId === TODOS ? null : equipeId,
  }), [empresaId, dias, cargo, setorId, equipeId]);

  /*
   * O que a tela precisa SEMPRE: as três agregações que alimentam os KPIs, o
   * gráfico e as duas listas de tela — mais quem não acessou, que é o número do
   * quinto KPI e fica visível em qualquer aba.
   */
  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    void Promise.all([
      buscarUsoPorPessoa(janela),
      buscarUsoPorTela(janela),
      buscarUsoPorDia(janela),
      buscarSemAcesso(janela),
    ]).then(([p, t, d, sa]) => {
      if (cancelado) return;
      setPessoas(p); setTelas(t); setPorDia(d); setAusentes(sa);
      setCarregando(false);
    });
    return () => { cancelado = true; };
  }, [janela]);

  /*
   * A adoção de tela é a única consulta cujo resultado não aparece em lugar
   * nenhum fora da aba dela — e é a que refaz a cada troca de tela no seletor.
   *
   * Carregá-la junto das outras fazia toda abertura do painel disparar cinco
   * RPCs, e trocar de filtro disparar as cinco de novo, para um bloco que a
   * pessoa talvez nem abra.
   */
  useEffect(() => {
    if (aba !== 'adocao') return;
    let cancelado = false;
    setCarregandoAdocao(true);
    void buscarAdocaoTela(janela, telaAdocao).then(a => {
      if (cancelado) return;
      setAdocao(a);
      setCarregandoAdocao(false);
    });
    return () => { cancelado = true; };
  }, [aba, janela, telaAdocao]);

  // ── Derivados ──────────────────────────────────────────────────────────────

  const serie = useMemo(
    () => montarSerieDiaria(porDia, janela.desde, janela.ate),
    [porDia, janela.desde, janela.ate],
  );

  const totais = useMemo(() => {
    const segundos  = pessoas.reduce((s, p) => s + Number(p.segundos), 0);
    const aberturas = pessoas.reduce((s, p) => s + Number(p.aberturas), 0);
    const ativos    = pessoas.length;
    const mediaDias = ativos
      ? pessoas.reduce((s, p) => s + Number(p.dias_ativos), 0) / ativos
      : 0;
    return { segundos, aberturas, ativos, mediaDias };
  }, [pessoas]);

  /* Nunca acessou × parou de acessar: duas ausências, duas conversas. */
  const nuncaAcessaram = useMemo(() => ausentes.filter(a => !a.ultimo_em), [ausentes]);
  const pararam        = useMemo(() => ausentes.filter(a => !!a.ultimo_em), [ausentes]);

  const nunca = adocao.filter(a => Number(a.aberturas) === 0);
  const maxSegTela    = Math.max(...telas.map(t => Number(t.segundos)), 1);
  const segTotalTelas = telas.reduce((s, t) => s + Number(t.segundos), 0);

  const telasSemUso = useMemo(() => {
    const usadas = new Set(telas.map(t => t.tela));
    return Object.keys(TELA_LABEL)
      .filter(t => !usadas.has(t) && !TELAS_EXCLUSIVAS.has(t))
      .sort((a, b) => rotuloDaTela(a).localeCompare(rotuloDaTela(b), 'pt-BR'));
  }, [telas]);

  const opcoesAdocao = useMemo(() => {
    const fixas = [...TELAS_ADOCAO];
    const extras = telas
      .map(t => t.tela)
      .filter(t => !fixas.includes(t as typeof TELAS_ADOCAO[number]))
      .sort((a, b) => rotuloDaTela(a).localeCompare(rotuloDaTela(b), 'pt-BR'));
    const todas = [...fixas, ...extras] as string[];
    return todas.includes(telaAdocao) ? todas : [...todas, telaAdocao];
  }, [telas, telaAdocao]);

  const resumoAdocao = useMemo(() => {
    const total = adocao.length;
    const abriram = adocao.filter(a => Number(a.aberturas) > 0);
    const segundos = abriram.reduce((s, a) => s + Number(a.segundos), 0);
    return {
      total,
      abriram: abriram.length,
      pct: total > 0 ? Math.round((abriram.length / total) * 100) : 0,
      // Média de quem ABRIU, não da lista inteira: diluir pelos que nunca
      // entraram responde outra pergunta e sempre dá um número menor e inútil.
      mediaAberturas: abriram.length
        ? abriram.reduce((s, a) => s + Number(a.aberturas), 0) / abriram.length
        : 0,
      mediaSegundos: abriram.length ? segundos / abriram.length : 0,
    };
  }, [adocao]);

  const filtrosAtivos = [
    cargo    !== TODOS,
    setorId  !== TODOS,
    equipeId !== TODOS,
    filtroEmpresa !== TODAS_EMPRESAS,
  ].filter(Boolean).length;

  function limparFiltros() {
    setCargo(TODOS); setSetorId(TODOS); setEquipeId(TODOS);
    setFiltroEmpresa(TODAS_EMPRESAS);
  }

  const recorte = [
    cargo !== TODOS ? (PERFIL_LABELS[cargo] ?? cargo) : null,
    setorId !== TODOS ? setores.find(s => s.id === setorId)?.nome : null,
    equipeId !== TODOS ? equipes.find(e => e.id === equipeId)?.nome : null,
  ].filter(Boolean).join(' · ');

  const cores = useChartColors(['--muted-foreground', '--border']);
  const corEixo  = cores['--muted-foreground'] ?? '#94a3b8';
  const corGrade = cores['--border'] ?? '#e5e7eb';

  const ABAS: { key: AbaUso; label: string; Icone: typeof Activity; contador?: number }[] = [
    { key: 'geral',    label: 'Visão geral',    Icone: LayoutGrid },
    { key: 'pessoas',  label: 'Pessoas',        Icone: Users, contador: pessoas.length },
    { key: 'ausentes', label: 'Sem acesso',     Icone: UserX, contador: ausentes.length },
    { key: 'adocao',   label: 'Adoção de tela', Icone: MonitorSmartphone },
  ];

  return (
    <div className="space-y-4">
      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pr-1">
            <Filter className="w-3.5 h-3.5" /> Filtros
          </span>

          <Select value={String(dias)} onValueChange={v => setDias(Number(v))}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODOS.map(p => (
                <SelectItem key={p.dias} value={String(p.dias)}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={cargo} onValueChange={setCargo}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os cargos</SelectItem>
              {CARGOS.map(c => (
                <SelectItem key={c} value={c}>{PERFIL_LABELS[c] ?? c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={setorId} onValueChange={setSetorId}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={TODOS}>Todos os setores</SelectItem>
              {setores.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={equipeId} onValueChange={setEquipeId}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={TODOS}>
                {setorId === TODOS ? 'Todas as equipes' : 'Todas as equipes do setor'}
              </SelectItem>
              {equipesDoSetor.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Uma empresa só não justifica seletor. */}
          {empresas.length > 1 && (
            <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS_EMPRESAS}>Todas as empresas</SelectItem>
                {empresas.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {filtrosAtivos > 0 && (
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={limparFiltros}>
              <X className="w-3.5 h-3.5" /> Limpar ({filtrosAtivos})
            </Button>
          )}

          {carregando && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>
      </Card>

      {/* ── Números do período ─────────────────────────────────────────────
          Ficam FORA das abas de propósito: são o resumo do recorte, e trocar
          de aba não muda o recorte. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi icone={<Users className="w-4 h-4" />} label="Pessoas ativas"
          valor={numeroBr(totais.ativos)}
          sub={recorte || 'com algum uso no período'} />
        <Kpi icone={<Clock className="w-4 h-4" />} label="Tempo total"
          valor={formatarDuracao(totais.segundos)}
          sub={totais.ativos
            ? `${formatarDuracao(totais.segundos / totais.ativos)} por pessoa`
            : 'com a aba em foco'} />
        <Kpi icone={<MousePointerClick className="w-4 h-4" />} label="Aberturas"
          valor={numeroBr(totais.aberturas)} sub="entradas em tela" />
        <Kpi icone={<CalendarDays className="w-4 h-4" />} label="Dias ativos"
          valor={totais.mediaDias.toFixed(1)} sub="média por pessoa" />
        <Kpi icone={<UserX className="w-4 h-4" />} label="Sem acesso"
          valor={numeroBr(ausentes.length)}
          tom={nuncaAcessaram.length > 0 ? 'alerta' : 'normal'}
          sub={nuncaAcessaram.length > 0
            ? `${nuncaAcessaram.length} nunca acessaram`
            : 'ninguém nunca acessou'} />
      </div>

      {/* ── Abas internas ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {ABAS.map(({ key, label, Icone, contador }) => (
          <button
            key={key} onClick={() => setAba(key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
              aba === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            <Icone className="w-3.5 h-3.5" />
            {label}
            {contador !== undefined && contador > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-[10px] font-mono tabular-nums">
                {contador}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══ Visão geral ══════════════════════════════════════════════════ */}
      {aba === 'geral' && (
        <div className="space-y-4">
          {/* Atividade por dia */}
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Atividade por dia
                </p>
                <SeloTendencia serie={serie} />
              </div>
              {/* O eixo muda de pergunta sem recarregar nada: os três números já
                  vieram juntos na mesma consulta. */}
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                {METRICAS.map(m => (
                  <button
                    key={m.key} onClick={() => setMetrica(m.key)}
                    className={cn(
                      'px-2 py-1 rounded-md text-[11px] font-medium transition-colors',
                      metrica === m.key
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {serie.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-8 text-center">
                Período inválido para desenhar a série.
              </p>
            ) : (
              <>
                <div className="h-56 -ml-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="gradUso" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="#6366f1" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={corGrade} vertical={false} />
                      <XAxis
                        dataKey="rotulo" tick={{ fontSize: 10, fill: corEixo }}
                        tickLine={false} axisLine={false} minTickGap={16}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: corEixo }} tickLine={false} axisLine={false}
                        width={54}
                        tickFormatter={(v: number) =>
                          metrica === 'segundos' ? formatarDuracao(v) : numeroBr(v)}
                      />
                      <Tooltip
                        contentStyle={{
                          fontSize: 11, borderRadius: 8,
                          border: `1px solid ${corGrade}`,
                          background: 'var(--popover)', color: 'var(--popover-foreground)',
                        }}
                        labelFormatter={(_l, p) => {
                          const d = p?.[0]?.payload as PontoDia | undefined;
                          return d ? d.dia.split('-').reverse().join('/') : '';
                        }}
                        formatter={(v: number) => {
                          const m = METRICAS.find(x => x.key === metrica)!;
                          return [m.formatar(Number(v)), m.label];
                        }}
                      />
                      <Area
                        type="monotone" dataKey={metrica} stroke="#6366f1" strokeWidth={2}
                        fill="url(#gradUso)" dot={false} activeDot={{ r: 4 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {/* O que o gráfico NÃO conseguiria dizer sozinho: quantos dias
                    do período ficaram sem ninguém. */}
                <p className="text-[10px] text-muted-foreground mt-1">
                  {serie.filter(p => p.vazio).length} de {serie.length} dias sem
                  nenhum uso registrado no recorte.
                </p>
              </>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Telas mais usadas */}
            <Card className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Telas mais usadas{recorte && ` · ${recorte}`}
              </p>
              {telas.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Nenhuma tela com uso registrado neste recorte.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {telas.slice(0, 12).map((t, i) => {
                    const seg = Number(t.segundos);
                    // A fatia do tempo total responde "quanto do dia das pessoas
                    // esta tela ocupa" — a barra sozinha só compara com a
                    // primeira colocada e não diz peso nenhum.
                    const fatia = segTotalTelas > 0
                      ? Math.round((seg / segTotalTelas) * 100) : 0;
                    return (
                      <div key={t.tela} className="min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-medium truncate" title={t.tela}>
                            <span className="text-muted-foreground tabular-nums font-mono mr-1">
                              {i + 1}.
                            </span>
                            {rotuloDaTela(t.tela)}
                          </span>
                          <span className="text-[11px] font-mono tabular-nums font-semibold shrink-0">
                            {formatarDuracao(seg)}
                          </span>
                        </div>
                        <Barra valor={seg} maximo={maxSegTela} cor="#6366f1" />
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {numeroBr(Number(t.aberturas))} aberturas · {t.pessoas} pessoa(s)
                          {' · '}{fatia}% do tempo
                        </span>
                      </div>
                    );
                  })}
                  {telas.length > 12 && (
                    <p className="text-[10px] text-muted-foreground pt-1">
                      e mais {telas.length - 12} tela(s) com menos uso.
                    </p>
                  )}
                </div>
              )}
            </Card>

            {/* Telas sem uso nenhum */}
            <Card className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Telas sem uso no período{recorte && ` · ${recorte}`}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">
                Ninguém deste recorte abriu estas telas no período.
              </p>
              {telasSemUso.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Todas as telas do catálogo tiveram algum uso. 🎉
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {telasSemUso.map(t => (
                    <span key={t} title={t}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                      <EyeOff className="w-3 h-3 shrink-0" />
                      {rotuloDaTela(t)}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-3 leading-snug">
                Sai do catálogo de telas, não do banco: tela sem uso não tem linha
                em <code>uso_telas</code>. Módulos exclusivos de uma operação
                (Ouvidoria, Campanha Fácil) ficam de fora — não é abandono, é
                módulo que o outro tenant não tem.
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* ══ Pessoas ══════════════════════════════════════════════════════ */}
      {aba === 'pessoas' && (
        pessoas.length === 0 && !carregando ? (
          <Card className="p-6 text-center space-y-2">
            <Activity className="w-6 h-6 mx-auto text-muted-foreground" />
            <p className="text-sm font-semibold">Ninguém usou o sistema neste recorte.</p>
            <p className="text-xs text-muted-foreground max-w-lg mx-auto">
              {filtrosAtivos > 0
                ? 'Os filtros acima podem estar estreitos demais — limpe-os para ver o quadro completo.'
                : 'A medição começa a partir do momento em que esta função entra no ar — não há histórico de navegação anterior para recuperar.'}
            </p>
          </Card>
        ) : (
          <ListaUsuariosUso
            pessoas={pessoas}
            mostrarEmpresa={empresaId === null}
            desde={janela.desde}
            ate={janela.ate}
            carregando={carregando}
          />
        )
      )}

      {/* ══ Sem acesso ═══════════════════════════════════════════════════ */}
      {aba === 'ausentes' && (
        <TabelaSemAcesso
          nunca={nuncaAcessaram}
          pararam={pararam}
          mostrarEmpresa={empresaId === null}
          dias={dias}
          carregando={carregando}
        />
      )}

      {/* ══ Adoção de uma tela ═══════════════════════════════════════════ */}
      {aba === 'adocao' && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Adoção de uma tela
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Inclui quem <strong>não</strong> abriu — é a lista acionável.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {carregandoAdocao && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
              <Select value={telaAdocao} onValueChange={setTelaAdocao}>
                <SelectTrigger className="h-8 w-64 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-80">
                  {opcoesAdocao.map(t => (
                    <SelectItem key={t} value={t}>{rotuloDaTela(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Os três números que resumem a adoção. Sem eles é preciso contar
              as linhas da tabela para saber se 5 de 13 é bom ou ruim. */}
          {resumoAdocao.total > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Adoção</p>
                <p className="text-lg font-bold font-mono tabular-nums leading-tight">
                  {resumoAdocao.pct}%
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {resumoAdocao.abriram} de {resumoAdocao.total} abriram
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Aberturas</p>
                <p className="text-lg font-bold font-mono tabular-nums leading-tight">
                  {resumoAdocao.mediaAberturas.toFixed(1)}
                </p>
                <p className="text-[10px] text-muted-foreground">média de quem abriu</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Tempo</p>
                <p className="text-lg font-bold font-mono tabular-nums leading-tight">
                  {formatarDuracao(resumoAdocao.mediaSegundos)}
                </p>
                <p className="text-[10px] text-muted-foreground">média de quem abriu</p>
              </div>
            </div>
          )}

          {nunca.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 mb-3">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-snug">
                <strong>{nunca.length}</strong> pessoa(s) não abriu esta tela nenhuma
                vez no período:{' '}
                <span className="text-muted-foreground">
                  {nunca.slice(0, 8).map(p => p.nome.split(' ')[0]).join(', ')}
                  {nunca.length > 8 && ` e mais ${nunca.length - 8}`}
                </span>
              </p>
            </div>
          )}

          {adocao.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Nenhuma pessoa ativa neste recorte — troque os filtros acima.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left px-2 py-1.5 font-semibold">PESSOA</th>
                    <th className="text-left px-2 py-1.5 font-semibold">CARGO</th>
                    <th className="text-left px-2 py-1.5 font-semibold">SETOR · EQUIPE</th>
                    {/* Com as duas operações juntas, "líder que não abriu" não dá
                        para cobrar sem saber de qual empresa a pessoa é. */}
                    {empresaId === null && <th className="text-left px-2 py-1.5 font-semibold">EMPRESA</th>}
                    <th className="text-right px-2 py-1.5 font-semibold">ABERTURAS</th>
                    <th className="text-right px-2 py-1.5 font-semibold">TEMPO</th>
                    <th className="text-right px-2 py-1.5 font-semibold">ÚLTIMA VEZ</th>
                  </tr>
                </thead>
                <tbody>
                  {adocao.map(p => {
                    const zerado = Number(p.aberturas) === 0;
                    return (
                      <tr key={p.usuario_id}
                        className={cn('border-b border-border/50', zerado && 'bg-destructive/[0.04]')}>
                        <td className="px-2 py-1.5 font-medium truncate max-w-[200px]">{p.nome}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">
                          {p.cargo ? PERFIL_LABELS[p.cargo] ?? p.cargo : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[180px]">
                          {[p.setor_nome, p.equipe_nome].filter(Boolean).join(' · ') || '—'}
                        </td>
                        {empresaId === null && (
                          <td className="px-2 py-1.5 text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="w-3 h-3 shrink-0" />
                              {p.empresa_nome ?? '—'}
                            </span>
                          </td>
                        )}
                        <td className={cn('px-2 py-1.5 text-right font-mono tabular-nums',
                          zerado && 'text-destructive font-semibold')}>
                          {numeroBr(Number(p.aberturas))}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                          {zerado ? '—' : formatarDuracao(Number(p.segundos))}
                        </td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">
                          {p.ultimo_em ? tempoRelativo(p.ultimo_em) : 'nunca'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground">
        Tempo conta só com a aba <strong>em foco</strong> — planilha aberta em
        segundo plano não entra. Passagem abaixo de 2 segundos não conta como
        abertura. O cargo é o que a pessoa tinha no momento do uso; setor e
        equipe são os do cadastro atual. Dado guardado por 180 dias.
      </p>
    </div>
  );
}

// ── Sem acesso ───────────────────────────────────────────────────────────────

/**
 * Quem não usou o sistema no período — separado em duas listas.
 *
 * «Nunca acessou» e «parou de acessar» parecem a mesma ausência e não são: a
 * primeira é onboarding que não aconteceu (conta criada e não entregue), a
 * segunda é abandono. Juntá-las num número só produziria uma lista que ninguém
 * sabe o que fazer com — e a lista existe para virar ação.
 */
function TabelaSemAcesso({
  nunca, pararam, mostrarEmpresa, dias, carregando,
}: {
  nunca: UsoSemAcesso[]; pararam: UsoSemAcesso[];
  mostrarEmpresa: boolean; dias: number; carregando: boolean;
}) {
  const [sub, setSub] = useState<'nunca' | 'pararam'>('nunca');
  const [busca, setBusca] = useState('');

  const lista = sub === 'nunca' ? nunca : pararam;
  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? lista.filter(p =>
        p.nome.toLowerCase().includes(termo)
        || (p.usuario ?? '').toLowerCase().includes(termo)
        || (p.setor_nome ?? '').toLowerCase().includes(termo)
        || (p.equipe_nome ?? '').toLowerCase().includes(termo))
    : lista;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {([
            { key: 'nunca'   as const, label: 'Nunca acessaram', n: nunca.length },
            { key: 'pararam' as const, label: 'Pararam de acessar', n: pararam.length },
          ]).map(o => (
            <button
              key={o.key} onClick={() => setSub(o.key)}
              className={cn(
                'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors inline-flex items-center gap-1.5',
                sub === o.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {o.label}
              <span className="font-mono tabular-nums">{o.n}</span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, setor ou equipe…"
            className="h-8 w-64 pl-8 text-xs"
          />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">
        {sub === 'nunca'
          ? 'Contas ativas que nunca registraram uso — nenhuma tela, nenhum dia, desde que a medição existe. É onboarding que não aconteceu.'
          : `Pessoas que já usaram o sistema antes e não abriram nada nos últimos ${dias} dias. É abandono, e a conversa é outra.`}
        {' '}Segue os filtros de cargo, setor, equipe e empresa acima.
      </p>

      {carregando ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : visiveis.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-10">
          {lista.length === 0
            ? (sub === 'nunca'
                ? 'Todo mundo do recorte já acessou o sistema pelo menos uma vez. 🎉'
                : 'Ninguém do recorte deixou de acessar no período. 🎉')
            : 'Nenhuma pessoa com esse termo.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left px-2 py-1.5 font-semibold">PESSOA</th>
                <th className="text-left px-2 py-1.5 font-semibold">CARGO</th>
                <th className="text-left px-2 py-1.5 font-semibold">SETOR · EQUIPE</th>
                {mostrarEmpresa && <th className="text-left px-2 py-1.5 font-semibold">EMPRESA</th>}
                <th className="text-left px-2 py-1.5 font-semibold">SITUAÇÃO</th>
                <th className="text-right px-2 py-1.5 font-semibold">
                  {sub === 'nunca' ? 'CADASTRADO' : 'ÚLTIMO ACESSO'}
                </th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map(p => (
                <tr key={p.usuario_id} className="border-b border-border/50 hover:bg-accent/20">
                  <td className="px-2 py-1.5 font-medium truncate max-w-[220px]">
                    {p.nome}
                    {p.usuario && (
                      <span className="text-muted-foreground font-normal"> · {p.usuario}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {p.cargo ? PERFIL_LABELS[p.cargo] ?? p.cargo : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[200px]">
                    {[p.setor_nome, p.equipe_nome].filter(Boolean).join(' · ') || '—'}
                  </td>
                  {mostrarEmpresa && (
                    <td className="px-2 py-1.5 text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="w-3 h-3 shrink-0" />
                        {p.empresa_nome ?? '—'}
                      </span>
                    </td>
                  )}
                  <td className="px-2 py-1.5">
                    {/* Férias explica a ausência; ativo não explica nada, e é
                        justamente essa linha que precisa de ação. */}
                    <span className={cn(
                      'text-[10px] font-medium',
                      p.situacao === 'ativo' ? 'text-muted-foreground' : 'text-amber-500',
                    )}>
                      {p.situacao === 'ativo' ? 'Ativo' : p.situacao}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">
                    {sub === 'nunca'
                      ? new Date(p.criado_em).toLocaleDateString('pt-BR')
                      : (p.ultimo_em ? tempoRelativo(p.ultimo_em) : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
