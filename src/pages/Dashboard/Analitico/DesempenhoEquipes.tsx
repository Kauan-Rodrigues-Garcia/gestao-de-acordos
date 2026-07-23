/**
 * DesempenhoEquipes — aba do Analítico (BookPlay, líder+).
 *
 * Painel por equipe no estilo "placar": foto e nome do líder, acumulado do
 * analítico, média diária real e projeção vs o que deveria ter acumulado
 * (meta da aba Metas ÷ dias úteis × dias trabalhados). Antes das equipes,
 * o mesmo painel consolidado do setor.
 *
 * Cada usuário vê apenas as equipes do próprio setor (prop setorId); admin
 * sem setor vê todos os setores em sequência.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Building2, Users, Headset, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { formatBRL } from '@/lib/money';
import { getTodayISO, PP_HO_PERCENTUAL } from '@/lib/index';
import { useTenant } from '@/lib/tenant-config';
import { cn } from '@/lib/utils';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { diasUteisDoMes, diasUteisDecorridos, corProjecao } from '@/lib/diasUteis';
import {
  mapaSetorDaEquipe, setoresDoOperador,
  type ResumoOperadorAnalitico, type EquipeAnalitico, type OperadorEquipeInfo,
} from '@/services/analitico/analitico.service';

interface DesempenhoEquipesProps {
  empresaId: string;
  mes: string;                 // 'yyyy-MM'
  setorId?: string | null;
  equipes: EquipeAnalitico[];
  resumos: ResumoOperadorAnalitico[];
  operadorEquipeMap: Record<string, OperadorEquipeInfo>;
  /** Equipes em que cada operador é CLONE — o recebimento dele soma nelas também. */
  equipesExtrasPorOperador?: Record<string, string[]>;
  /** Total dos órfãos (sem operador) por setor — entram no card do setor. */
  orfaosPorSetor?: Record<string, { total: number; qtd: number }>;
  loading: boolean;
  /** Nome da fonte no rodapé (padrão: "relatório analítico"). */
  fonteLabel?: string;
}

interface MetaRow { tipo: string; referencia_id: string; meta_valor: number }
interface LiderInfo { nome: string; foto_url: string | null }

/** Avatares dos líderes da equipe, lado a lado (item 1: clone mantém foto/tag
 *  e uma equipe pode ter vários líderes). Cai no ícone quando não há líder. */
function AvataresLideres({ lideres, ehSetor }: { lideres: LiderInfo[]; ehSetor?: boolean }) {
  if (lideres.length === 0) {
    return (
      <div className={cn(
        'w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center border-2 border-border shrink-0',
        ehSetor ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
      )}>
        {ehSetor ? <Building2 className="w-7 h-7" /> : <Users className="w-7 h-7" />}
      </div>
    );
  }
  return (
    <div className="flex -space-x-3 shrink-0">
      {lideres.map((l, i) => (
        l.foto_url ? (
          <img key={i} src={l.foto_url} alt={l.nome} title={l.nome}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-card shadow-sm bg-card" />
        ) : (
          <div key={i} title={l.nome}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center border-2 border-card bg-muted text-muted-foreground text-lg font-bold shadow-sm">
            {l.nome.charAt(0).toUpperCase()}
          </div>
        )
      ))}
    </div>
  );
}

// ── Painel de desempenho (setor ou equipe) ───────────────────────────────────

/** Fonte diminui conforme o número cresce, para nunca cortar dígitos. */
function fonteDoValor(valor: string, destaque?: boolean): string {
  const n = valor.length;
  if (n > 13) return destaque ? 'text-sm sm:text-base font-extrabold' : 'text-xs sm:text-sm font-bold';
  if (n > 10) return destaque ? 'text-base sm:text-lg font-extrabold' : 'text-sm sm:text-base font-bold';
  return destaque ? 'text-xl sm:text-2xl font-extrabold' : 'text-lg sm:text-xl font-bold';
}

function Tile({
  label, valor, destaque, cor, hint, sub,
}: { label: string; valor: string; destaque?: boolean; cor?: string; hint?: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-muted/40 border border-border/50 px-3 py-2.5 min-w-0" title={hint}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
        {label}
      </p>
      <p
        className={cn('tabular-nums font-mono leading-tight mt-0.5 whitespace-nowrap', fonteDoValor(valor, destaque))}
        style={cor ? { color: cor } : undefined}
      >
        {valor}
      </p>
      {sub && (
        <p className="text-[11px] text-muted-foreground tabular-nums font-mono truncate mt-0.5">{sub}</p>
      )}
    </div>
  );
}

function PainelPlacar({
  titulo, subtitulo, lideres, ehSetor, acumulado, acumuladoHO, mostrarHO, meta, totalUteis, decorridos,
}: {
  titulo: string;
  subtitulo?: string;
  /** Líderes da equipe (fotos lado a lado). Vazio/omisso = ícone. */
  lideres?: LiderInfo[];
  ehSetor?: boolean;
  acumulado: number;
  /** PaguePlay: H.O. do acumulado (soma de total_ho do analítico). */
  acumuladoHO?: number;
  mostrarHO?: boolean;
  meta: number | null;
  totalUteis: number;
  decorridos: number;
}) {
  const mediaDiaria = acumulado / Math.max(decorridos, 1);
  const metaDiaria  = meta && totalUteis > 0 ? meta / totalUteis : null;
  const esperado    = metaDiaria !== null ? metaDiaria * decorridos : null;
  const projecao    = esperado && esperado > 0 ? Math.round((acumulado / esperado) * 100) : null;
  const faltaMeta   = meta !== null ? Math.max(0, meta - acumulado) : null;
  const metaBatida  = faltaMeta !== null && faltaMeta === 0;

  const corDaProjecao = projecao === null ? undefined : corProjecao(projecao);

  const hojeLabel = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short',
  });

  return (
    <div className={cn(
      'rounded-2xl border bg-card p-4 sm:p-5 shadow-sm',
      ehSetor && 'border-primary/40 ring-1 ring-primary/10 bg-gradient-to-br from-primary/[0.06] to-transparent',
    )}>
      {/* Cabeçalho: foto(s) do(s) líder(es) + nome + data | projeção */}
      <div className="flex items-center gap-3.5">
        <AvataresLideres lideres={lideres ?? []} ehSetor={ehSetor} />
        <div className="flex-1 min-w-0">
          <p className="text-base sm:text-lg font-bold leading-tight truncate">{titulo}</p>
          <p className="text-xs text-muted-foreground truncate">
            {subtitulo}{subtitulo ? ' · ' : ''}{hojeLabel}
          </p>
        </div>
        {/* Projeção em destaque */}
        <div
          className="shrink-0 rounded-2xl px-4 py-2 text-center"
          style={corDaProjecao ? { background: corDaProjecao + '1a' } : undefined}
        >
          <p
            className="text-2xl sm:text-3xl font-extrabold tabular-nums font-mono leading-none"
            style={{ color: corDaProjecao ?? 'var(--muted-foreground)' }}
          >
            {projecao !== null ? `${projecao}%` : '—'}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">
            projeção
          </p>
        </div>
      </div>

      {/* Números */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 mt-4">
        <Tile label="Acumulado" valor={formatBRL(acumulado)} destaque cor="#10b981"
          sub={mostrarHO ? `H.O. ${formatBRL(acumuladoHO ?? 0)}` : undefined} />
        <Tile label="Média diária" valor={formatBRL(mediaDiaria)}
          hint="Acumulado ÷ dias úteis trabalhados" />
        <Tile label="Meta" valor={meta ? formatBRL(meta) : '—'}
          sub={mostrarHO && meta ? `H.O. ${formatBRL(meta * PP_HO_PERCENTUAL)}` : undefined} />
        <Tile label="Falta p/ meta"
          valor={faltaMeta === null ? '—' : metaBatida ? 'Batida! 🎉' : formatBRL(faltaMeta)}
          cor={faltaMeta === null ? undefined : metaBatida ? '#22c55e' : '#6366f1'}
          hint="Quanto falta para bater a meta do mês" />
        <Tile label="Diária p/ meta" valor={metaDiaria !== null ? formatBRL(metaDiaria) : '—'}
          hint="Valor por dia útil para bater a meta" />
        <Tile label="Deveria ter" valor={esperado !== null ? formatBRL(esperado) : '—'} cor="#f59e0b"
          hint="Quanto deveria ter acumulado até hoje" />
      </div>
    </div>
  );
}

// ── Contribuição Receptivo (card manual por setor — BookPlay) ─────────────────
// Card visual idêntico ao placar, preenchido À MÃO (acumulado + meta) pelo
// botão de editar ao lado. Sem banco: fica no localStorage, por setor e mês.

interface ContribReceptivo { acumulado: number; meta: number }

function chaveContribuicao(empresaId: string, setorId: string, mes: string): string {
  return `contribuicao-receptivo::${empresaId}::${setorId}::${mes}`;
}

function lerContribuicao(chave: string): ContribReceptivo | null {
  try {
    const raw = localStorage.getItem(chave);
    if (!raw) return null;
    const v = JSON.parse(raw) as ContribReceptivo;
    if (typeof v?.acumulado !== 'number') return null;
    return { acumulado: v.acumulado, meta: Number(v.meta) || 0 };
  } catch { return null; }
}

/** Aceita "12.345,67", "12345,67" ou "12345.67". */
function parseValorBR(s: string): number {
  const limpo = s.trim().replace(/[R$\s]/g, '');
  if (!limpo) return 0;
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo;
  const n = parseFloat(normalizado);
  return isNaN(n) ? 0 : n;
}

function CardContribuicaoReceptivo({
  empresaId, setorId, mes, totalUteis, decorridos, onReport,
}: {
  empresaId: string; setorId: string; mes: string; totalUteis: number; decorridos: number;
  /** Reporta o acumulado ao pai para somar no card consolidado do setor. */
  onReport?: (setorId: string, acumulado: number) => void;
}) {
  const chave = chaveContribuicao(empresaId, setorId, mes);
  const [dados, setDados]         = useState<ContribReceptivo | null>(() => lerContribuicao(chave));
  const [editando, setEditando]   = useState(false);
  const [acumuladoStr, setAcumuladoStr] = useState('');
  const [metaStr, setMetaStr]           = useState('');

  // Troca de setor/mês → recarrega o valor salvo daquela chave e reporta ao pai
  useEffect(() => {
    const salvo = lerContribuicao(chave);
    setDados(salvo);
    setEditando(false);
    onReport?.(setorId, salvo?.acumulado ?? 0);
  }, [chave, setorId, onReport]);

  function abrirEdicao() {
    setAcumuladoStr(dados ? String(dados.acumulado).replace('.', ',') : '');
    setMetaStr(dados && dados.meta > 0 ? String(dados.meta).replace('.', ',') : '');
    setEditando(true);
  }

  function salvar() {
    const novo: ContribReceptivo = {
      acumulado: parseValorBR(acumuladoStr),
      meta:      parseValorBR(metaStr),
    };
    try { localStorage.setItem(chave, JSON.stringify(novo)); } catch { /* noop */ }
    setDados(novo);
    setEditando(false);
    onReport?.(setorId, novo.acumulado);
  }

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <PainelPlacar
          titulo="Contribuição Receptivo"
          subtitulo="Preenchido manualmente"
          acumulado={dados?.acumulado ?? 0}
          meta={dados && dados.meta > 0 ? dados.meta : null}
          totalUteis={totalUteis}
          decorridos={decorridos}
        />
      </div>
      {/* Botão de editar ao lado (fora) do card */}
      <div className="flex flex-col gap-2 shrink-0 pt-4">
        {!editando ? (
          <Button
            variant="outline" size="icon" className="h-8 w-8"
            title="Preencher Contribuição Receptivo"
            onClick={abrirEdicao}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <div className="w-44 rounded-xl border border-border bg-card p-3 space-y-2 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Headset className="w-3 h-3" /> Receptivo
            </p>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Acumulado (R$)</label>
              <Input
                autoFocus
                inputMode="decimal"
                placeholder="0,00"
                value={acumuladoStr}
                onChange={e => setAcumuladoStr(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') setEditando(false); }}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Meta (R$)</label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={metaStr}
                onChange={e => setMetaStr(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') setEditando(false); }}
                className="h-7 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5 pt-0.5">
              <Button size="sm" className="h-6 px-2 text-[11px] gap-1 flex-1" onClick={salvar}>
                <Check className="w-3 h-3" /> Salvar
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] gap-1"
                onClick={() => setEditando(false)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Aba ───────────────────────────────────────────────────────────────────────

export function DesempenhoEquipes({
  empresaId, mes, setorId, equipes, resumos, operadorEquipeMap,
  equipesExtrasPorOperador = {}, orfaosPorSetor = {}, loading,
  fonteLabel = 'relatório analítico',
}: DesempenhoEquipesProps) {
  const { perfil } = useAuth();
  const isPP = useTenant().isPaguePlay;
  // O usuário só vê o PRÓPRIO setor: sem filtro externo, usa o setor do
  // perfil. Só quem não tem setor (admin/diretoria) enxerga todos.
  const setorEfetivo = setorId ?? perfil?.setor_id ?? null;
  const [metas, setMetas]       = useState<MetaRow[]>([]);
  const [feriados, setFeriados] = useState<string[]>([]);
  // metas_config_mes.contar_dia_atual — padrão false (o dia de hoje ainda corre)
  const [contarHoje, setContarHoje] = useState(false);
  const [lideres, setLideres]   = useState<Record<string, LiderInfo[]>>({});  // equipe_id → líderes (inclui clones)
  const [setores, setSetores]   = useState<Record<string, string>>({});    // setor_id → nome
  const [carregado, setCarregado] = useState(false);
  // Contribuição Receptivo (manual, localStorage) reportada por cada card-filho;
  // soma no acumulado do card consolidado do setor.
  const [contribPorSetor, setContribPorSetor] = useState<Record<string, number>>({});
  const reportContrib = useCallback((sid: string, acumulado: number) => {
    setContribPorSetor(prev => (prev[sid] === acumulado ? prev : { ...prev, [sid]: acumulado }));
  }, []);
  // Equipes de treinamento: equipe_id → data de início (só as treinamento=true).
  // Fetch isolado e tolerante — coluna ausente não quebra o painel principal.
  const [treinoMap, setTreinoMap] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let cancel = false;
    void (async () => {
      const { data, error } = await supabase.from('equipes')
        .select('id, treinamento, treinamento_inicio').eq('empresa_id', empresaId);
      if (cancel || error || !data) return;
      const m: Record<string, string | null> = {};
      for (const e of data as { id: string; treinamento: boolean | null; treinamento_inicio: string | null }[]) {
        if (e.treinamento) m[e.id] = e.treinamento_inicio ?? null;
      }
      setTreinoMap(m);
    })();
    return () => { cancel = true; };
  }, [empresaId]);

  const [anoNum, mesNum] = mes.split('-').map(Number);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      try {
        const [{ data: metasData }, cfg, { data: lideresData }, { data: setoresData }, { data: clonesData }] = await Promise.all([
          supabase.from('metas').select('tipo, referencia_id, meta_valor')
            .eq('empresa_id', empresaId).eq('mes', mesNum).eq('ano', anoNum)
            .in('tipo', ['setor', 'equipe']),
          getMetasConfig(empresaId, mesNum, anoNum),
          // TODOS os líderes (id/nome/foto + equipe de origem). Sem filtro de
          // equipe_id: um líder pode ser só clone (sem equipe própria).
          supabase.from('perfis').select('id, nome, foto_url, equipe_id')
            .eq('empresa_id', empresaId).eq('perfil', 'lider'),
          supabase.from('setores').select('id, nome').eq('empresa_id', empresaId),
          // Clones: líder clonado numa equipe deve mostrar foto/tag lá também.
          // Tabela pode não existir (migration 20260712a pendente) → vazio.
          supabase.from('equipe_operadores_clones').select('equipe_id, operador_id')
            .eq('empresa_id', empresaId),
        ]);
        if (cancelado) return;
        setMetas((metasData as MetaRow[]) ?? []);
        setFeriados(cfg.data?.feriados ?? []);
        setContarHoje(cfg.data?.contar_dia_atual === true);
        // Identidade de cada líder + equipe → líderes (origem + clones).
        const lideresById = new Map<string, LiderInfo>();
        const lMap: Record<string, LiderInfo[]> = {};
        const addLider = (equipeId: string | null, info: LiderInfo) => {
          if (!equipeId) return;
          const lista = (lMap[equipeId] ??= []);
          if (!lista.some(x => x.nome === info.nome)) lista.push(info);
        };
        for (const l of (lideresData as { id: string; nome: string; foto_url: string | null; equipe_id: string | null }[]) ?? []) {
          const info = { nome: l.nome, foto_url: l.foto_url };
          lideresById.set(l.id, info);
          addLider(l.equipe_id, info);   // equipe de origem
        }
        for (const c of (clonesData as { equipe_id: string; operador_id: string }[]) ?? []) {
          const info = lideresById.get(c.operador_id);
          if (info) addLider(c.equipe_id, info);   // líder clonado nesta equipe
        }
        setLideres(lMap);
        const sMap: Record<string, string> = {};
        for (const s of (setoresData as { id: string; nome: string }[]) ?? []) sMap[s.id] = s.nome;
        setSetores(sMap);
      } catch { /* sem metas/config — painéis mostram "—" */ }
      if (!cancelado) setCarregado(true);
    }
    void carregar();
    return () => { cancelado = true; };
  }, [empresaId, mes, mesNum, anoNum]);

  const dados = useMemo(() => {
    const totalUteis = diasUteisDoMes(anoNum, mesNum, feriados);
    const decorridos = diasUteisDecorridos(anoNum, mesNum, feriados, getTodayISO(), undefined, contarHoje);

    // Acumulado (bruto + H.O.) por equipe e por setor a partir do analítico.
    // O card do SETOR soma TODOS os operadores do setor — inclusive quem está
    // sem equipe (o setor vem da equipe ou, na falta dela, do próprio perfil);
    // sem isso o consolidado do setor ficava menor que o card Total recebido.
    const porEquipe: Record<string, { bruto: number; ho: number }> = {};
    const porSetor:  Record<string, { bruto: number; ho: number }> = {};
    const somar = (map: typeof porEquipe, id: string, r: ResumoOperadorAnalitico) => {
      if (!map[id]) map[id] = { bruto: 0, ho: 0 };
      map[id].bruto += r.total_recebido;
      map[id].ho    += Number(r.total_ho) || 0;
    };
    // Setor de cada equipe — o clone credita o setor DONO da equipe clonada
    const setorDaEquipe = mapaSetorDaEquipe(equipes);

    for (const r of resumos) {
      const info = operadorEquipeMap[r.operador_id];
      if (info?.equipe_id) somar(porEquipe, info.equipe_id, r);
      // Clones: o recebimento conta TAMBÉM nas equipes clonadas
      for (const eqId of equipesExtrasPorOperador[r.operador_id] ?? []) {
        if (eqId !== info?.equipe_id) somar(porEquipe, eqId, r);
      }
      // Setores: o próprio + os das equipes clonadas (setor misto emprestando
      // para play 4 / play 5). O Set já deduplica, então clone dentro do
      // próprio setor não conta duas vezes. Mesma regra do "Total recebido"
      // no AnaliticoLider — as duas telas TÊM que concordar.
      for (const sid of setoresDoOperador(
        r.operador_id, operadorEquipeMap, equipesExtrasPorOperador, setorDaEquipe,
      )) {
        somar(porSetor, sid, r);
      }
    }

    // Órfãos (sem operador) pertencem ao setor da importação
    for (const [sid, o] of Object.entries(orfaosPorSetor)) {
      if (!porSetor[sid]) porSetor[sid] = { bruto: 0, ho: 0 };
      porSetor[sid].bruto += o.total;
    }

    const metaDe = (tipo: string, id: string): number | null => {
      const m = metas.find(x => x.tipo === tipo && x.referencia_id === id);
      const v = m ? Number(m.meta_valor) || 0 : 0;
      return v > 0 ? v : null;
    };

    // Agrupa por setor; com setor efetivo definido, só o setor do usuário
    const visiveis = setorEfetivo ? equipes.filter(e => e.setor_id === setorEfetivo) : equipes;
    const grupos = new Map<string, EquipeAnalitico[]>();
    for (const eq of visiveis) {
      const sid = eq.setor_id ?? 'sem_setor';
      if (!grupos.has(sid)) grupos.set(sid, []);
      grupos.get(sid)!.push(eq);
    }

    return { totalUteis, decorridos, porEquipe, porSetor, metaDe, grupos };
  }, [anoNum, mesNum, feriados, contarHoje, resumos, operadorEquipeMap, equipesExtrasPorOperador,
      orfaosPorSetor, equipes, metas, setorEfetivo]);

  if (loading || !carregado) {
    return (
      <div className="space-y-3 animate-pulse">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 bg-muted rounded-2xl" />)}
      </div>
    );
  }

  if (dados.grupos.size === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-10">
        Nenhuma equipe encontrada{setorEfetivo ? ' neste setor' : ''}.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {[...dados.grupos.entries()].map(([sid, eqs]) => (
        <div key={sid} className="space-y-3">
          {/* Painel consolidado do setor — soma do analítico das equipes */}
          <PainelPlacar
            titulo={setores[sid] ?? 'Setor'}
            subtitulo="Setor geral"
            ehSetor
            mostrarHO={isPP}
            acumulado={(dados.porSetor[sid]?.bruto ?? 0) + (contribPorSetor[sid] ?? 0)}
            acumuladoHO={dados.porSetor[sid]?.ho ?? 0}
            meta={dados.metaDe('setor', sid)}
            totalUteis={dados.totalUteis}
            decorridos={dados.decorridos}
          />
          {/* Contribuição Receptivo — card manual do setor (BookPlay) */}
          {!isPP && sid !== 'sem_setor' && (
            <CardContribuicaoReceptivo
              empresaId={empresaId}
              setorId={sid}
              mes={mes}
              totalUteis={dados.totalUteis}
              decorridos={dados.decorridos}
              onReport={reportContrib}
            />
          )}
          {/* Equipes do setor, maiores acumulados primeiro */}
          {eqs
            .slice()
            .sort((a, b) => (dados.porEquipe[b.id]?.bruto ?? 0) - (dados.porEquipe[a.id]?.bruto ?? 0))
            .map(eq => {
              // Equipe de treinamento com data de início → dias úteis reduzidos.
              const inicioTreino = treinoMap[eq.id] ?? undefined;
              const eqUteis = inicioTreino
                ? diasUteisDoMes(anoNum, mesNum, feriados, inicioTreino)
                : dados.totalUteis;
              const eqDecorridos = inicioTreino
                ? diasUteisDecorridos(anoNum, mesNum, feriados, getTodayISO(), inicioTreino, contarHoje)
                : dados.decorridos;
              return (
                <PainelPlacar
                  key={eq.id}
                  titulo={(lideres[eq.id]?.length === 1 ? lideres[eq.id][0].nome : eq.nome)}
                  subtitulo={inicioTreino ? `Equipe ${eq.nome} · treino` : `Equipe ${eq.nome}`}
                  lideres={lideres[eq.id] ?? []}
                  mostrarHO={isPP}
                  acumulado={dados.porEquipe[eq.id]?.bruto ?? 0}
                  acumuladoHO={dados.porEquipe[eq.id]?.ho ?? 0}
                  meta={dados.metaDe('equipe', eq.id)}
                  totalUteis={eqUteis}
                  decorridos={eqDecorridos}
                />
              );
            })}
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">
        Acumulado e diário vêm do {fonteLabel} · meta, dias úteis e feriados
        vêm da aba Metas ({dados.decorridos} de {dados.totalUteis} dias úteis trabalhados).
      </p>
    </div>
  );
}
