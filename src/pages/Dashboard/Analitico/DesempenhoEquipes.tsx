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

import { useState, useEffect, useMemo } from 'react';
import { Building2, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { formatBRL } from '@/lib/money';
import { getTodayISO, PP_HO_PERCENTUAL } from '@/lib/index';
import { useTenant } from '@/lib/tenant-config';
import { cn } from '@/lib/utils';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { diasUteisDoMes, diasUteisDecorridos } from '@/lib/diasUteis';
import { buscarTotaisSemVinculoDiarioMes } from '@/services/diario/diario.service';
import type {
  ResumoOperadorAnalitico, EquipeAnalitico, OperadorEquipeInfo,
} from '@/services/analitico/analitico.service';

interface DesempenhoEquipesProps {
  empresaId: string;
  mes: string;                 // 'yyyy-MM'
  setorId?: string | null;
  equipes: EquipeAnalitico[];
  resumos: ResumoOperadorAnalitico[];
  operadorEquipeMap: Record<string, OperadorEquipeInfo>;
  loading: boolean;
}

interface MetaRow { tipo: string; referencia_id: string; meta_valor: number }
interface LiderInfo { nome: string; foto_url: string | null }

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
  titulo, subtitulo, fotoUrl, ehSetor, acumulado, acumuladoHO, mostrarHO, meta, totalUteis, decorridos,
}: {
  titulo: string;
  subtitulo?: string;
  fotoUrl?: string | null;
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

  const corProjecao = projecao === null ? undefined :
    projecao >= 100 ? '#22c55e' : projecao >= 80 ? '#f59e0b' : '#ef4444';

  const hojeLabel = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short',
  });

  return (
    <div className={cn(
      'rounded-2xl border bg-card p-4 sm:p-5 shadow-sm',
      ehSetor && 'border-primary/40 ring-1 ring-primary/10 bg-gradient-to-br from-primary/[0.06] to-transparent',
    )}>
      {/* Cabeçalho: foto + nome + data | projeção */}
      <div className="flex items-center gap-3.5">
        {fotoUrl ? (
          <img src={fotoUrl} alt={titulo}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-border shadow-sm shrink-0" />
        ) : (
          <div className={cn(
            'w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center border-2 border-border shrink-0',
            ehSetor ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
          )}>
            {ehSetor ? <Building2 className="w-7 h-7" /> : <Users className="w-7 h-7" />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-base sm:text-lg font-bold leading-tight truncate">{titulo}</p>
          <p className="text-xs text-muted-foreground truncate">
            {subtitulo}{subtitulo ? ' · ' : ''}{hojeLabel}
          </p>
        </div>
        {/* Projeção em destaque */}
        <div
          className="shrink-0 rounded-2xl px-4 py-2 text-center"
          style={corProjecao ? { background: corProjecao + '1a' } : undefined}
        >
          <p
            className="text-2xl sm:text-3xl font-extrabold tabular-nums font-mono leading-none"
            style={{ color: corProjecao ?? 'var(--muted-foreground)' }}
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

// ── Aba ───────────────────────────────────────────────────────────────────────

export function DesempenhoEquipes({
  empresaId, mes, setorId, equipes, resumos, operadorEquipeMap, loading,
}: DesempenhoEquipesProps) {
  const { perfil } = useAuth();
  const isPP = useTenant().isPaguePlay;
  // O usuário só vê o PRÓPRIO setor: sem filtro externo, usa o setor do
  // perfil. Só quem não tem setor (admin/diretoria) enxerga todos.
  const setorEfetivo = setorId ?? perfil?.setor_id ?? null;
  const [metas, setMetas]       = useState<MetaRow[]>([]);
  const [feriados, setFeriados] = useState<string[]>([]);
  const [lideres, setLideres]   = useState<Record<string, LiderInfo>>({});  // equipe_id → líder
  const [setores, setSetores]   = useState<Record<string, string>>({});    // setor_id → nome
  // PP (setor único): linhas do RECEBIMENTO DIÁRIO sem operador somam no
  // consolidado do setor (H.O. derivado de 24,96%)
  const [semVinculo, setSemVinculo] = useState({ total: 0, qtd: 0 });
  const [carregado, setCarregado] = useState(false);

  const [anoNum, mesNum] = mes.split('-').map(Number);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      try {
        const [{ data: metasData }, cfg, { data: lideresData }, { data: setoresData }] = await Promise.all([
          supabase.from('metas').select('tipo, referencia_id, meta_valor')
            .eq('empresa_id', empresaId).eq('mes', mesNum).eq('ano', anoNum)
            .in('tipo', ['setor', 'equipe']),
          getMetasConfig(empresaId, mesNum, anoNum),
          supabase.from('perfis').select('nome, foto_url, equipe_id')
            .eq('empresa_id', empresaId).eq('perfil', 'lider').not('equipe_id', 'is', null),
          supabase.from('setores').select('id, nome').eq('empresa_id', empresaId),
        ]);
        if (cancelado) return;
        setMetas((metasData as MetaRow[]) ?? []);
        setFeriados(cfg.data?.feriados ?? []);
        const lMap: Record<string, LiderInfo> = {};
        for (const l of (lideresData as { nome: string; foto_url: string | null; equipe_id: string }[]) ?? []) {
          if (!lMap[l.equipe_id]) lMap[l.equipe_id] = { nome: l.nome, foto_url: l.foto_url };
        }
        setLideres(lMap);
        const sMap: Record<string, string> = {};
        for (const s of (setoresData as { id: string; nome: string }[]) ?? []) sMap[s.id] = s.nome;
        setSetores(sMap);
        if (isPP) {
          const semVinc = await buscarTotaisSemVinculoDiarioMes(empresaId, mes);
          if (!cancelado) setSemVinculo(semVinc);
        }
      } catch { /* sem metas/config — painéis mostram "—" */ }
      if (!cancelado) setCarregado(true);
    }
    void carregar();
    return () => { cancelado = true; };
  }, [empresaId, mes, mesNum, anoNum, isPP]);

  const dados = useMemo(() => {
    const totalUteis = diasUteisDoMes(anoNum, mesNum, feriados);
    const decorridos = diasUteisDecorridos(anoNum, mesNum, feriados, getTodayISO());

    // Acumulado (bruto + H.O.) por equipe e por setor a partir do analítico
    const porEquipe: Record<string, { bruto: number; ho: number }> = {};
    const porSetor:  Record<string, { bruto: number; ho: number }> = {};
    const somar = (map: typeof porEquipe, id: string, r: ResumoOperadorAnalitico) => {
      if (!map[id]) map[id] = { bruto: 0, ho: 0 };
      map[id].bruto += r.total_recebido;
      map[id].ho    += Number(r.total_ho) || 0;
    };
    for (const r of resumos) {
      const info = operadorEquipeMap[r.operador_id];
      if (!info?.equipe_id) continue;
      somar(porEquipe, info.equipe_id, r);
      if (info.setor_id) somar(porSetor, info.setor_id, r);
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
  }, [anoNum, mesNum, feriados, resumos, operadorEquipeMap, equipes, metas, setorEfetivo]);

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
          {/* Painel consolidado do setor — na PP (setor único) as linhas
              sem operador entram aqui */}
          <PainelPlacar
            titulo={setores[sid] ?? 'Setor'}
            subtitulo={
              isPP && semVinculo.total > 0
                ? `Setor geral · inclui ${formatBRL(semVinculo.total)} sem vínculo (diário)`
                : 'Setor geral'
            }
            ehSetor
            mostrarHO={isPP}
            acumulado={(dados.porSetor[sid]?.bruto ?? 0) + (isPP ? semVinculo.total : 0)}
            acumuladoHO={(dados.porSetor[sid]?.ho ?? 0) + (isPP ? semVinculo.total * PP_HO_PERCENTUAL : 0)}
            meta={dados.metaDe('setor', sid)}
            totalUteis={dados.totalUteis}
            decorridos={dados.decorridos}
          />
          {/* Equipes do setor, maiores acumulados primeiro */}
          {eqs
            .slice()
            .sort((a, b) => (dados.porEquipe[b.id]?.bruto ?? 0) - (dados.porEquipe[a.id]?.bruto ?? 0))
            .map(eq => (
              <PainelPlacar
                key={eq.id}
                titulo={lideres[eq.id]?.nome ?? eq.nome}
                subtitulo={`Equipe ${eq.nome}`}
                fotoUrl={lideres[eq.id]?.foto_url}
                mostrarHO={isPP}
                acumulado={dados.porEquipe[eq.id]?.bruto ?? 0}
                acumuladoHO={dados.porEquipe[eq.id]?.ho ?? 0}
                meta={dados.metaDe('equipe', eq.id)}
                totalUteis={dados.totalUteis}
                decorridos={dados.decorridos}
              />
            ))}
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">
        Acumulado e diário vêm do relatório analítico · meta, dias úteis e feriados
        vêm da aba Metas ({dados.decorridos} de {dados.totalUteis} dias úteis trabalhados).
      </p>
    </div>
  );
}
