/**
 * QuartisOperadores — aba do Painel do Líder: tabela dos operadores em foco com
 * meta, recebimento, ritmo diário, o esperado até hoje, a diferença, a % de
 * projeção e o quartil. Ao lado, a distribuição dos operadores por quartil.
 *
 * Mesma matemática do header do dashboard (lib/projecaoMetas): projeção =
 * recebido no analítico ÷ (meta diária × dias úteis trabalhados); os quartis vêm
 * da configuração da aba Metas.
 *
 * ## O recorte é do pai
 *
 * `setorId` e `equipeId` chegam prontos de `resolverEscopoPainel`, e `setorId`
 * nulo significa "todos os setores". Nada aqui os completa.
 *
 * Esta tela tinha filtro PRÓPRIO, com dois defeitos: a lista de cargos era
 * escrita à mão (gerência com `ver_todos_setores` via tudo e não ganhava
 * seletor), e "Todos os setores" gravava `''` — que, num `filtroSetor ||
 * setorProprio`, voltava para o setor da própria pessoa. Escolher "todos"
 * mostrava um. O seletor subiu para o cabeçalho do painel, onde vale para as três
 * abas de uma vez.
 *
 * ## Os dias úteis podem ser menos que o mês
 *
 * Operador de equipe em TREINAMENTO é projetado contra os dias a partir do início
 * dela, não contra o mês cheio. Sem isso, esta tabela punha em faixa pior quem a
 * aba Desempenho Equipes — que já reduzia — punha em faixa melhor: o mesmo
 * operador, duas faixas, duas abas do mesmo painel.
 *
 * ## A linha abre
 *
 * Clicar num operador expande o detalhe dele, no mesmo espírito do card de
 * Desempenho Equipes. A linha fechada diz ONDE a pessoa está; a aberta diz o que
 * fazer com isso:
 *
 *   • **estimativa de fechamento** — onde o mês termina mantendo a média atual,
 *     e quanto isso sobra ou falta contra a meta;
 *   • **degraus de quartil** — quanto falta para CADA faixa, não só para a
 *     atual. Quem está no 4º precisa ver o 3º, o 2º e o 1º;
 *   • **os números por trás do valor** — pagamentos, ticket médio, H.O. `[PP]`,
 *     posição e participação no grupo exibido.
 *
 * As contas ficam em `detalheOperador.ts`, testado à parte, e o ritmo vem de
 * `lib/projecaoMetas` — o mesmo que o card de equipe usa. Aqui não se calcula
 * nada além de cor e largura.
 */

import { Fragment, useState, useEffect, useMemo, useId } from 'react';
import { ChevronDown, Target, CalendarClock, BarChart3 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { QuartilConfig } from '@/lib/supabase';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { getTodayISO, PERFIS_QUE_CONTAM_NO_RECEBIMENTO } from '@/lib/index';
import { useTenant } from '@/lib/tenant-config';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import {
  diasUteisDoMes, diasUteisDecorridos, QUARTIS_PADRAO, COR_QUARTIL,
} from '@/lib/diasUteis';
import { calcularProjecao } from '@/lib/projecaoMetas';
import {
  mapaSetorDaEquipe, setoresDoOperador,
  type ResumoOperadorAnalitico, type EquipeAnalitico, type OperadorEquipeInfo,
} from '@/services/analitico/analitico.service';
import { PizzaQuartis3D } from './PizzaQuartis3D';
import { detalharOperador } from './detalheOperador';

interface QuartisOperadoresProps {
  empresaId: string;
  mes: string;                 // 'yyyy-MM'
  /**
   * Setor em foco. `null` = todos os setores. AUTORITATIVA — ver o cabeçalho.
   */
  setorId: string | null;
  /** Equipe em foco. `null` = todas as equipes do setor. */
  equipeId?: string | null;
  equipes: EquipeAnalitico[];
  resumos: ResumoOperadorAnalitico[];
  operadorEquipeMap: Record<string, OperadorEquipeInfo>;
  /** Equipes em que cada operador é CLONE — ele conta no setor delas também. */
  equipesExtrasPorOperador?: Record<string, string[]>;
  loading: boolean;
}

interface PerfilOp { id: string; nome: string; foto_url: string | null; setor_id: string | null; equipe_id: string | null; situacao?: string | null }
interface MetaOpRow { referencia_id: string; meta_valor: number }

interface LinhaQuartil {
  op: PerfilOp;
  equipeNome: string;
  meta: number | null;
  recebido: number;
  diaria: number | null;
  hoje: number | null;
  diferenca: number | null;
  projecao: number | null;
  quartil: QuartilConfig | null;
  /** Pagamentos e H.O. do analítico — alimentam a linha expandida. */
  pagamentos: number;
  ho: number;
  /**
   * Dias úteis DESTE operador, já reduzidos por equipe em treinamento.
   *
   * Guardados na linha, e não recalculados ao abrir: a área expandida tem de
   * usar exatamente a mesma contagem que produziu a % da linha fechada, senão a
   * mesma pessoa mostra duas leituras com a linha aberta e fechada.
   */
  dias: { totalUteis: number; decorridos: number };
}

// ── A linha expandida ────────────────────────────────────────────────────────

/** Bloco de leitura da área expandida. Mesmo desenho do card de Desempenho. */
function Bloco({
  Icone, titulo, children,
}: { Icone: typeof Target; titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Icone className="w-3.5 h-3.5 shrink-0" /> {titulo}
      </p>
      {children}
    </div>
  );
}

function LinhaValor({
  label, valor, cor, hint, forte,
}: { label: string; valor: string; cor?: string; hint?: string; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2" title={hint}>
      <span className="text-[11px] text-muted-foreground min-w-0 truncate">{label}</span>
      <span
        className={cn('text-[11px] tabular-nums font-mono font-semibold shrink-0',
          forte && 'text-xs font-bold')}
        style={cor ? { color: cor } : undefined}
      >
        {valor}
      </span>
    </div>
  );
}

/** Uma faixa na lista de degraus: quanto falta, ou o carimbo de alcançada. */
function Degrau({
  quartil, falta, alcancado, ehAtual,
}: { quartil: number; falta: number; alcancado: boolean; ehAtual: boolean }) {
  const cor = COR_QUARTIL[quartil] ?? '#6366f1';
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-md px-1.5 py-1',
      ehAtual && 'ring-1',
    )}
      style={ehAtual ? { background: cor + '14', boxShadow: `inset 0 0 0 1px ${cor}55` } : undefined}
    >
      <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: cor }} />
      <span className="text-[11px] flex-1 min-w-0 truncate">
        {quartil}º quartil
        {ehAtual && <span className="text-[10px] text-muted-foreground"> · atual</span>}
      </span>
      <span className="text-[11px] tabular-nums font-mono font-semibold shrink-0"
        style={{ color: alcancado ? COR_QUARTIL[1] : cor }}>
        {alcancado ? 'alcançado' : `faltam ${formatBRL(falta)}`}
      </span>
    </div>
  );
}

/**
 * O detalhe de um operador — abre no clique da linha.
 *
 * Responde o que a linha fechada não responde, e nada além: onde o mês fecha no
 * ritmo de hoje, quanto falta para CADA faixa (a linha só mostra a faixa atual)
 * e o que o recebimento tem dentro — pagamentos, ticket e o peso da pessoa no
 * setor. As contas vêm todas de `detalheOperador.ts`, testado à parte.
 */
function DetalheOperador({
  linha, quartis, recebidosDoGrupo, mostrarHO, nomeDoGrupo,
}: {
  linha: LinhaQuartil;
  quartis: QuartilConfig[];
  recebidosDoGrupo: readonly number[];
  mostrarHO: boolean;
  nomeDoGrupo: string;
}) {
  const d = detalharOperador({
    recebido:   linha.recebido,
    meta:       linha.meta,
    totalUteis: linha.dias.totalUteis,
    decorridos: linha.dias.decorridos,
    quartis,
    pagamentos: linha.pagamentos,
    ho:         linha.ho,
    recebidosDoGrupo,
  });

  const corRitmo = d.ritmoNecessario !== null && d.ritmoNecessario > d.mediaDiaria
    ? COR_QUARTIL[4] : COR_QUARTIL[1];

  return (
    <div className="grid gap-5 md:grid-cols-3 px-3 py-3 bg-muted/20">
      {/* ── Degraus de quartil ─────────────────────────────────────────── */}
      <Bloco Icone={Target} titulo="Quanto falta por faixa">
        {d.degraus.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Sem meta configurada — não há faixa a alcançar.
          </p>
        ) : (
          <div className="space-y-1">
            {d.degraus.map(g => (
              <Degrau key={g.quartil} quartil={g.quartil} falta={g.falta}
                alcancado={g.alcancado} ehAtual={d.faixaAtual?.quartil === g.quartil} />
            ))}
            <p className="text-[10px] text-muted-foreground pt-0.5">
              Medido contra o esperado até hoje, igual à % da linha.
            </p>
          </div>
        )}
      </Bloco>

      {/* ── Ritmo e fechamento ─────────────────────────────────────────── */}
      <Bloco Icone={CalendarClock} titulo="Ritmo e fechamento">
        <div className="space-y-1.5">
          <LinhaValor
            label="Fecha o mês em"
            valor={formatBRL(d.projecaoFechamento)}
            cor={d.fechaBatendo === null ? undefined
              : d.fechaBatendo ? COR_QUARTIL[1] : COR_QUARTIL[4]}
            hint="Estimativa mantendo a média diária atual até o fim do mês"
            forte
          />
          {d.sobraProjetada !== null && (
            <LinhaValor
              label={d.sobraProjetada >= 0 ? 'Sobra projetada' : 'Falta projetada'}
              valor={`${d.sobraProjetada >= 0 ? '+' : '−'}${formatBRL(Math.abs(d.sobraProjetada))}`}
              cor={d.sobraProjetada >= 0 ? COR_QUARTIL[1] : COR_QUARTIL[4]}
              hint="Estimativa de fechamento menos a meta do mês"
            />
          )}
          <LinhaValor
            label="Média diária atual" valor={formatBRL(d.mediaDiaria)}
            hint="Recebimento ÷ dias úteis trabalhados"
          />
          <LinhaValor
            label="Precisa por dia restante"
            valor={d.ritmoNecessario !== null ? formatBRL(d.ritmoNecessario) : '—'}
            cor={d.ritmoNecessario !== null ? corRitmo : undefined}
            hint={d.ritmoNecessario === null
              ? 'Sem meta, meta já batida, ou sem dia útil sobrando'
              : 'O que falta para a meta ÷ dias úteis que restam'}
          />
          <LinhaValor
            label="Falta para a meta"
            valor={d.faltaMeta === null ? '—'
              : d.faltaMeta === 0 ? 'Batida! 🎉' : formatBRL(d.faltaMeta)}
            cor={d.faltaMeta === 0 ? COR_QUARTIL[1] : undefined}
          />
          <LinhaValor
            label="Dias úteis"
            valor={`${d.diasTrabalhados} de ${linha.dias.totalUteis}`}
            hint="Reduzidos quando a equipe é de treinamento"
          />
          <LinhaValor label="Dias úteis restantes" valor={String(d.diasRestantes)} />
        </div>
      </Bloco>

      {/* ── O que há dentro do recebimento ─────────────────────────────── */}
      <Bloco Icone={BarChart3} titulo="Números do mês">
        <div className="space-y-1.5">
          <LinhaValor
            label="% da meta do mês"
            valor={d.pctMeta !== null ? `${d.pctMeta}%` : '—'}
            hint="Recebimento ÷ meta cheia. Diferente da % da linha, que mede contra o esperado até hoje"
          />
          <LinhaValor
            label="Esperado até hoje"
            valor={d.esperadoHoje !== null ? formatBRL(d.esperadoHoje) : '—'}
            hint="Meta diária × dias úteis trabalhados"
          />
          <LinhaValor
            label="Pagamentos"
            valor={d.pagamentos !== null ? String(d.pagamentos) : '—'}
            hint="Linhas do analítico que compõem o recebimento"
          />
          <LinhaValor
            label="Ticket médio"
            valor={d.ticketMedio !== null ? formatBRL(d.ticketMedio) : '—'}
            hint="Recebimento ÷ pagamentos"
          />
          {mostrarHO && (
            <LinhaValor label="H.O." valor={formatBRL(d.ho ?? 0)} />
          )}
          <LinhaValor
            label={`Posição em ${nomeDoGrupo}`}
            valor={d.posicao !== null ? `${d.posicao}º de ${d.tamanhoGrupo}` : '—'}
            hint="Por recebimento, entre os operadores exibidos"
          />
          <LinhaValor
            label="Participação"
            valor={d.participacaoPct !== null ? `${d.participacaoPct}%` : '—'}
            hint="Fatia do recebimento do grupo exibido"
          />
        </div>
      </Bloco>
    </div>
  );
}

export function QuartisOperadores({
  empresaId, mes, setorId, equipeId = null, equipes, resumos,
  operadorEquipeMap, equipesExtrasPorOperador = {}, loading,
}: QuartisOperadoresProps) {
  // O recorte vem do pai, resolvido por `resolverEscopoPainel`. Nada aqui o
  // completa nem o reinterpreta — ver o cabeçalho do arquivo.
  const setorEfetivo = setorId;
  const filtroEquipe = equipeId;
  const [anoNum, mesNum] = mes.split('-').map(Number);
  const isPP = useTenant().isPaguePlay;

  /** Operador com a linha aberta. Um por vez: duas abertas viram rolagem. */
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const painelId = useId();

  const [operadores, setOperadores] = useState<PerfilOp[]>([]);
  const [metasOp, setMetasOp]       = useState<Record<string, number>>({});
  const [feriados, setFeriados]     = useState<string[]>([]);
  const [quartis, setQuartis]       = useState<QuartilConfig[]>(QUARTIS_PADRAO);
  const [setores, setSetores]       = useState<Record<string, string>>({});
  // equipe_id → data de início do treinamento (só as `treinamento = true`).
  const [treinoMap, setTreinoMap]   = useState<Record<string, string | null>>({});
  // metas_config_mes.contar_dia_atual — padrão false (o dia de hoje ainda corre)
  const [contarHoje, setContarHoje] = useState(false);
  const [carregado, setCarregado]   = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      try {
        const [{ data: ops }, { data: metasData }, cfg, { data: setoresData }, { data: equipesData }] = await Promise.all([
          // A lista de cargos sai de `PERFIS_QUE_CONTAM_NO_RECEBIMENTO`, e não
          // escrita à mão: era uma das quatro cópias da mesma pergunta, e o
          // Pix Automático tinha a sua discordando (elite sumia de lá).
          // `.eq('ativo', true)`: um usuário DESATIVADO aparecia aqui e não
          // aparecia na aba Acompanhamento, que sempre filtrou. O filtro de
          // `situacao` (férias/desligado) é outra coisa e continua adiante — em
          // agosto/2026 havia 1 pessoa desativada com `situacao = 'ativo'`, então
          // um dos dois filtros sozinho não cobria o outro.
          supabase.from('perfis').select('id, nome, foto_url, setor_id, equipe_id, situacao')
            .eq('empresa_id', empresaId)
            .in('perfil', [...PERFIS_QUE_CONTAM_NO_RECEBIMENTO])
            .eq('ativo', true)
            .order('nome'),
          supabase.from('metas').select('referencia_id, meta_valor')
            .eq('empresa_id', empresaId).eq('tipo', 'operador')
            .eq('mes', mesNum).eq('ano', anoNum),
          getMetasConfig(empresaId, mesNum, anoNum),
          supabase.from('setores').select('id, nome').eq('empresa_id', empresaId),
          // Equipes de treinamento: dias úteis reduzidos para quem está nelas.
          // Busca tolerante — coluna ausente devolve erro e o mapa fica vazio, o
          // que só faz a tabela voltar ao comportamento de mês cheio.
          supabase.from('equipes').select('id, treinamento, treinamento_inicio')
            .eq('empresa_id', empresaId),
        ]);
        if (cancelado) return;
        setOperadores((ops as PerfilOp[]) ?? []);
        const mMap: Record<string, number> = {};
        for (const m of (metasData as MetaOpRow[]) ?? []) {
          const v = Number(m.meta_valor) || 0;
          if (v > 0) mMap[m.referencia_id] = v;
        }
        setMetasOp(mMap);
        setFeriados(cfg.data?.feriados ?? []);
        setContarHoje(cfg.data?.contar_dia_atual === true);
        setQuartis(cfg.data?.quartis ?? QUARTIS_PADRAO);
        const sMap: Record<string, string> = {};
        for (const s of (setoresData as { id: string; nome: string }[]) ?? []) sMap[s.id] = s.nome;
        setSetores(sMap);
        const tMap: Record<string, string | null> = {};
        for (const e of (equipesData as { id: string; treinamento: boolean | null; treinamento_inicio: string | null }[]) ?? []) {
          if (e.treinamento) tMap[e.id] = e.treinamento_inicio ?? null;
        }
        setTreinoMap(tMap);
      } catch { /* sem dados — lista vazia */ }
      if (!cancelado) setCarregado(true);
    }
    void carregar();
    return () => { cancelado = true; };
  }, [empresaId, mesNum, anoNum]);

  const setorDaEquipe = useMemo(() => mapaSetorDaEquipe(equipes), [equipes]);
  const nomeDaEquipe  = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of equipes) m.set(e.id, e.nome);
    return m;
  }, [equipes]);

  const grupos = useMemo(() => {
    const totalUteis = diasUteisDoMes(anoNum, mesNum, feriados);
    const decorridos = Math.max(
      diasUteisDecorridos(anoNum, mesNum, feriados, getTodayISO(), undefined, contarHoje), 1,
    );
    const recebidoMap: Record<string, number> = {};
    // Pagamentos e H.O. vêm do mesmo resumo do analítico que já traz o recebido
    // — a linha expandida mostra ticket médio e H.O. sem uma segunda consulta.
    const pagamentosMap: Record<string, number> = {};
    const hoMap: Record<string, number> = {};
    for (const r of resumos) {
      recebidoMap[r.operador_id]   = r.total_recebido;
      pagamentosMap[r.operador_id] = Number(r.total_pagamentos) || 0;
      hoMap[r.operador_id]         = Number(r.total_ho) || 0;
    }

    /**
     * Dias úteis de UM operador, reduzidos quando a equipe dele é de treinamento.
     *
     * Esta tabela usava o mês cheio para todo mundo, enquanto Desempenho Equipes
     * já reduzia os dias da equipe em treinamento. O mesmo operador aparecia em
     * duas faixas diferentes em duas abas do mesmo painel — e a de treinamento
     * saía sempre pior, porque era cobrada por dias em que a equipe nem existia.
     */
    const diasDoOperador = (op: PerfilOp): { totalUteis: number; decorridos: number } => {
      const inicio = op.equipe_id ? treinoMap[op.equipe_id] : null;
      if (!inicio) return { totalUteis, decorridos };
      return {
        totalUteis: diasUteisDoMes(anoNum, mesNum, feriados, inicio),
        decorridos: Math.max(
          diasUteisDecorridos(anoNum, mesNum, feriados, getTodayISO(), inicio, contarHoje), 1,
        ),
      };
    };

    // Clone: o operador conta no setor da equipe clonada, não só no dele.
    // Mesma fonte usada pelo Total recebido e por Desempenho Equipes.
    const visiveis = operadores
      // Item 5: férias/desligado somem do quartil (recebimento segue nos totais).
      .filter(o => (o.situacao ?? 'ativo') === 'ativo')
      .filter(o => !setorEfetivo || setoresDoOperador(
        o.id, operadorEquipeMap, equipesExtrasPorOperador, setorDaEquipe,
      ).has(setorEfetivo))
      .filter(o => !filtroEquipe
        || o.equipe_id === filtroEquipe
        || (equipesExtrasPorOperador[o.id] ?? []).includes(filtroEquipe));

    const porSetor = new Map<string, LinhaQuartil[]>();

    for (const op of visiveis) {
      // Agrupa pelo setor em exibição quando há um; senão, pelo setor de origem
      const sid = setorEfetivo ?? op.setor_id ?? 'sem_setor';
      const meta = metasOp[op.id] ?? null;
      const recebido = recebidoMap[op.id] ?? 0;
      const dias = diasDoOperador(op);

      // Sem `limitePct`: esta tabela nunca saturou a %, ao contrário do header
      // pessoal. Ver `EntradaProjecao` em lib/projecaoMetas.
      const proj = calcularProjecao({
        meta, recebido, totalUteis: dias.totalUteis, decorridos: dias.decorridos, quartis,
      });
      const diaria: number | null    = proj?.metaDiaria ?? null;
      const hoje: number | null      = proj?.esperado ?? null;
      const diferenca: number | null = proj?.diferenca ?? null;
      const projecao: number | null  = proj?.projecaoPct ?? null;
      const q: QuartilConfig | null  = proj?.quartil ?? null;

      const equipeNome = (op.equipe_id ? nomeDaEquipe.get(op.equipe_id) : null)
        ?? operadorEquipeMap[op.id]?.equipe_nome
        ?? 'Sem equipe';

      if (!porSetor.has(sid)) porSetor.set(sid, []);
      porSetor.get(sid)!.push({
        op, equipeNome, meta, recebido, diaria, hoje, diferenca, projecao, quartil: q,
        pagamentos: pagamentosMap[op.id] ?? 0,
        ho:         hoMap[op.id] ?? 0,
        dias,
      });
    }

    // Melhor projeção primeiro; sem meta vai para o fim
    for (const lista of porSetor.values()) {
      lista.sort((a, b) => (b.projecao ?? -1) - (a.projecao ?? -1));
    }
    return porSetor;
  }, [anoNum, mesNum, feriados, contarHoje, quartis, resumos, operadores, metasOp,
      setorEfetivo, filtroEquipe, operadorEquipeMap, equipesExtrasPorOperador,
      setorDaEquipe, nomeDaEquipe, treinoMap]);

  // Distribuição por quartil — só quem tem meta entra na base do 100%
  const distribuicao = useMemo(() => {
    const cont = new Map<number, number>();
    let total = 0;
    for (const lista of grupos.values()) {
      for (const l of lista) {
        if (!l.quartil) continue;
        cont.set(l.quartil.quartil, (cont.get(l.quartil.quartil) ?? 0) + 1);
        total++;
      }
    }
    const ordem = [...quartis].sort((a, b) => a.quartil - b.quartil);
    return {
      total,
      fatias: ordem.map(q => ({ quartil: q.quartil, qtd: cont.get(q.quartil) ?? 0 })),
    };
  }, [grupos, quartis]);

  if (loading || !carregado) {
    return (
      <div className="space-y-2 animate-pulse">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-8 bg-muted rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grupos.size === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">
          Nenhum operador encontrado com os filtros atuais.
        </p>
      )}

      {grupos.size > 0 && (
        <div className="flex flex-col xl:flex-row gap-4 items-start">
          {/* Tabela */}
          <div className="flex-1 min-w-0 space-y-4">
            {[...grupos.entries()].map(([sid, lista]) => {
              // Base da posição e da participação da linha expandida: o grupo é
              // o que está NA TELA, não o setor inteiro do banco. Quem filtrou
              // por equipe compara com a equipe, que é o que ele está lendo.
              const recebidosDoGrupo = lista.map(l => l.recebido);
              const nomeDoGrupo = setores[sid] ?? 'Sem setor';
              return (
              <div key={sid} className="space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
                  {nomeDoGrupo}
                </p>
                <div className="rounded-xl border border-border bg-card overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border">
                        <th className="text-left  px-2 py-1.5 font-semibold text-muted-foreground">OPERADOR</th>
                        <th className="text-left  px-2 py-1.5 font-semibold text-muted-foreground">EQUIPE</th>
                        <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground">META</th>
                        <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground">RECEBIMENTO</th>
                        <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground"
                          title="Quanto o operador deve receber por dia útil para bater a meta">DIÁRIO</th>
                        <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground"
                          title="Quanto deveria ter recebido até hoje (diário × dias úteis trabalhados)">HOJE</th>
                        <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground"
                          title="Recebimento menos o esperado até hoje">FALTA/SOBRA</th>
                        <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground">%</th>
                        <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">QUARTIL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map(l => {
                        const cor = l.quartil ? COR_QUARTIL[l.quartil.quartil] ?? '#6366f1' : undefined;
                        const aberto = abertoId === l.op.id;
                        const alterna = () => setAbertoId(v => (v === l.op.id ? null : l.op.id));
                        return (
                          <Fragment key={l.op.id}>
                          {/* A linha inteira é o alvo do clique. `<tr>` com
                              role/tabIndex em vez de um <button> dentro de uma
                              célula: o botão só cobriria a coluna dele, e o
                              clique nas outras oito não faria nada. */}
                          <tr
                            role="button"
                            tabIndex={0}
                            aria-expanded={aberto}
                            aria-controls={`${painelId}-${l.op.id}`}
                            onClick={alterna}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alterna(); }
                            }}
                            className="group border-t border-border/50 cursor-pointer transition-shadow focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            style={cor ? {
                              background: cor + (aberto ? '26' : '14'),
                              boxShadow: `inset ${aberto ? 5 : 3}px 0 0 0 ${cor}`,
                            } : aberto ? { background: 'hsl(var(--muted))' } : undefined}
                          >
                            <td className="px-2 py-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <ChevronDown className={cn(
                                  'w-3 h-3 shrink-0 text-muted-foreground transition-transform group-hover:text-primary',
                                  aberto && 'rotate-180 text-primary',
                                )} />
                                {l.op.foto_url ? (
                                  <img src={l.op.foto_url} alt={l.op.nome}
                                    className="w-5 h-5 rounded-full object-cover border border-border/60 shrink-0" />
                                ) : (
                                  <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground shrink-0">
                                    {l.op.nome.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <span className="font-medium truncate max-w-[150px]" title={l.op.nome}>
                                  {l.op.nome}
                                </span>
                              </div>
                            </td>
                            <td className="px-2 py-1 text-muted-foreground truncate max-w-[110px]" title={l.equipeNome}>
                              {l.equipeNome}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums font-mono">
                              {l.meta !== null ? formatBRL(l.meta) : '—'}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums font-mono font-semibold">
                              {formatBRL(l.recebido)}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums font-mono text-muted-foreground">
                              {l.diaria !== null ? formatBRL(l.diaria) : '—'}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums font-mono text-muted-foreground">
                              {l.hoje !== null ? formatBRL(l.hoje) : '—'}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums font-mono font-semibold"
                              style={l.diferenca === null ? undefined
                                : { color: l.diferenca >= 0 ? COR_QUARTIL[1] : COR_QUARTIL[4] }}>
                              {l.diferenca === null ? '—'
                                : `${l.diferenca >= 0 ? '+' : '−'}${formatBRL(Math.abs(l.diferenca))}`}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums font-mono font-bold"
                              style={cor ? { color: cor } : undefined}>
                              {l.projecao !== null ? `${l.projecao}%` : '—'}
                            </td>
                            <td className="px-2 py-1 text-center">
                              {l.quartil ? (
                                <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
                                  style={{ background: (cor ?? '#6366f1') + '26', color: cor }}>
                                  {l.quartil.quartil}º
                                </span>
                              ) : (
                                <span className="text-muted-foreground italic text-[10px]">sem meta</span>
                              )}
                            </td>
                          </tr>

                          {aberto && (
                            <tr id={`${painelId}-${l.op.id}`} className="border-t border-border/50">
                              {/* `colSpan` fixo em 9: é o número de colunas do
                                  cabeçalho acima. Mexeu numa, mexa aqui. */}
                              <td colSpan={9} className="p-0">
                                <DetalheOperador
                                  linha={l}
                                  quartis={quartis}
                                  recebidosDoGrupo={recebidosDoGrupo}
                                  mostrarHO={isPP}
                                  nomeDoGrupo={nomeDoGrupo}
                                />
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              );
            })}
          </div>

          {/* Distribuição por quartil. O título fica FORA do card, irmão do
              rótulo do setor: assim o topo do card alinha com o cabeçalho da
              tabela sem depender de um margin-top chutado. */}
          <div className="w-full xl:w-64 shrink-0 space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
              Distribuição
            </p>
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex justify-center">
                <PizzaQuartis3D fatias={distribuicao.fatias} total={distribuicao.total} />
              </div>
              <table className="w-full text-[11px] mt-2">
                <tbody>
                  {distribuicao.fatias.map(f => {
                    const cor = COR_QUARTIL[f.quartil] ?? '#6366f1';
                    const pct = distribuicao.total > 0
                      ? Math.round((f.qtd / distribuicao.total) * 100) : 0;
                    return (
                      <tr key={f.quartil} className="border-t border-border/40">
                        <td className="py-1 pr-1 w-3">
                          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: cor }} />
                        </td>
                        <td className="py-1 font-medium">{f.quartil}º quartil</td>
                        <td className="py-1 text-right tabular-nums font-mono text-muted-foreground">{pct}%</td>
                        <td className="py-1 text-right tabular-nums font-mono font-bold w-8" style={{ color: cor }}>
                          {f.qtd}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-border">
                    <td />
                    <td className="py-1 font-semibold text-muted-foreground">Total</td>
                    <td />
                    <td className="py-1 text-right tabular-nums font-mono font-bold">{distribuicao.total}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        <strong>Clique na linha</strong> para ver a estimativa de fechamento do mês,
        quanto falta para cada quartil e os números do operador. ·
        Diário = meta ÷ dias úteis do mês · Hoje = diário × dias úteis trabalhados ·
        Falta/sobra = recebimento − hoje · % = recebimento ÷ hoje ·
        faixas de quartil configuradas na aba Metas.
      </p>
    </div>
  );
}
