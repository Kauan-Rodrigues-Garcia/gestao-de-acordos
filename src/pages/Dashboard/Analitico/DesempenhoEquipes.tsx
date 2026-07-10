/**
 * DesempenhoEquipes — aba do Analítico (PaguePlay, líder+).
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
import { supabase } from '@/lib/supabase';
import { formatBRL } from '@/lib/money';
import { getTodayISO } from '@/lib/index';
import { cn } from '@/lib/utils';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { diasUteisDoMes, diasUteisDecorridos } from '@/lib/diasUteis';
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

// ── Painel no estilo do placar (setor ou equipe) ─────────────────────────────

function PainelPlacar({
  titulo, subtitulo, fotoUrl, ehSetor, acumulado, meta, totalUteis, decorridos,
}: {
  titulo: string;
  subtitulo?: string;
  fotoUrl?: string | null;
  ehSetor?: boolean;
  acumulado: number;
  meta: number | null;
  totalUteis: number;
  decorridos: number;
}) {
  const diasBase   = Math.max(decorridos, 1);
  const mediaDiaria = acumulado / diasBase;
  const metaDiaria  = meta && totalUteis > 0 ? meta / totalUteis : null;
  const esperado    = metaDiaria !== null ? metaDiaria * decorridos : null;
  const projecao    = esperado && esperado > 0 ? Math.round((acumulado / esperado) * 100) : null;

  const corProjecao = projecao === null ? '' :
    projecao >= 100 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    : projecao >= 80 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
    : 'bg-red-500/15 text-red-600 dark:text-red-400';

  const hojeLabel = new Date().toLocaleDateString('pt-BR');

  return (
    <div className={cn(
      'flex items-center gap-4 rounded-2xl border p-4',
      ehSetor ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
    )}>
      {/* Foto do líder / ícone do setor */}
      <div className="shrink-0">
        {fotoUrl ? (
          <img src={fotoUrl} alt={titulo}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-border shadow" />
        ) : (
          <div className={cn(
            'w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center border-2 border-border shadow',
            ehSetor ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
          )}>
            {ehSetor ? <Building2 className="w-8 h-8" /> : <Users className="w-8 h-8" />}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        {/* Barra de título */}
        <div className="rounded-lg bg-gradient-to-r from-blue-700 to-blue-500 text-white text-center py-1.5 px-3">
          <p className="text-sm font-bold uppercase tracking-wide truncate">{titulo}</p>
          {subtitulo && <p className="text-[10px] text-blue-100 leading-none">{subtitulo}</p>}
        </div>

        {/* Linha 1 — realizado */}
        <div className="grid grid-cols-4 gap-px rounded-lg overflow-hidden border border-border text-center text-xs">
          {['Data', 'Acumulado', 'Diário', 'Projeção'].map(h => (
            <div key={h} className="bg-blue-600/90 text-white font-semibold uppercase text-[10px] py-1">{h}</div>
          ))}
          <div className="bg-muted/40 py-1.5 tabular-nums">{hojeLabel}</div>
          <div className="bg-muted/40 py-1.5 font-bold tabular-nums font-mono">{formatBRL(acumulado)}</div>
          <div className="bg-muted/40 py-1.5 tabular-nums font-mono">{formatBRL(mediaDiaria)}</div>
          <div className={cn('py-1.5 font-bold tabular-nums', projecao !== null ? corProjecao : 'bg-muted/40 text-muted-foreground')}>
            {projecao !== null ? `${projecao}%` : '—'}
          </div>
        </div>

        {/* Linha 2 — meta */}
        <div className="grid grid-cols-4 gap-px rounded-lg overflow-hidden border border-border text-center text-xs">
          <div className="bg-blue-600/90 text-white font-semibold uppercase text-[10px] py-1.5 flex items-center justify-center">Meta</div>
          <div className="bg-muted/40 py-1.5 font-bold tabular-nums font-mono">{meta ? formatBRL(meta) : '—'}</div>
          <div className="bg-muted/40 py-1.5 tabular-nums font-mono" title="Valor por dia útil para bater a meta">
            {metaDiaria !== null ? formatBRL(metaDiaria) : '—'}
          </div>
          <div className="bg-orange-500/15 text-orange-600 dark:text-orange-400 py-1.5 font-semibold tabular-nums font-mono"
            title="Quanto deveria ter acumulado até hoje">
            {esperado !== null ? formatBRL(esperado) : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Aba ───────────────────────────────────────────────────────────────────────

export function DesempenhoEquipes({
  empresaId, mes, setorId, equipes, resumos, operadorEquipeMap, loading,
}: DesempenhoEquipesProps) {
  const [metas, setMetas]       = useState<MetaRow[]>([]);
  const [feriados, setFeriados] = useState<string[]>([]);
  const [lideres, setLideres]   = useState<Record<string, LiderInfo>>({});  // equipe_id → líder
  const [setores, setSetores]   = useState<Record<string, string>>({});    // setor_id → nome
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
      } catch { /* sem metas/config — painéis mostram "—" */ }
      if (!cancelado) setCarregado(true);
    }
    void carregar();
    return () => { cancelado = true; };
  }, [empresaId, mesNum, anoNum]);

  const dados = useMemo(() => {
    const totalUteis = diasUteisDoMes(anoNum, mesNum, feriados);
    const decorridos = diasUteisDecorridos(anoNum, mesNum, feriados, getTodayISO());

    // Acumulado por equipe e por setor a partir do resumo do analítico
    const porEquipe: Record<string, number> = {};
    const porSetor:  Record<string, number> = {};
    for (const r of resumos) {
      const info = operadorEquipeMap[r.operador_id];
      if (!info?.equipe_id) continue;
      porEquipe[info.equipe_id] = (porEquipe[info.equipe_id] ?? 0) + r.total_recebido;
      if (info.setor_id) porSetor[info.setor_id] = (porSetor[info.setor_id] ?? 0) + r.total_recebido;
    }

    const metaDe = (tipo: string, id: string): number | null => {
      const m = metas.find(x => x.tipo === tipo && x.referencia_id === id);
      const v = m ? Number(m.meta_valor) || 0 : 0;
      return v > 0 ? v : null;
    };

    // Agrupa por setor; com setorId definido, só o setor do usuário
    const visiveis = setorId ? equipes.filter(e => e.setor_id === setorId) : equipes;
    const grupos = new Map<string, EquipeAnalitico[]>();
    for (const eq of visiveis) {
      const sid = eq.setor_id ?? 'sem_setor';
      if (!grupos.has(sid)) grupos.set(sid, []);
      grupos.get(sid)!.push(eq);
    }

    return { totalUteis, decorridos, porEquipe, porSetor, metaDe, grupos };
  }, [anoNum, mesNum, feriados, resumos, operadorEquipeMap, equipes, metas, setorId]);

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
        Nenhuma equipe encontrada{setorId ? ' neste setor' : ''}.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {[...dados.grupos.entries()].map(([sid, eqs]) => (
        <div key={sid} className="space-y-3">
          {/* Painel consolidado do setor */}
          <PainelPlacar
            titulo={setores[sid] ?? 'Setor'}
            subtitulo="Setor geral"
            ehSetor
            acumulado={dados.porSetor[sid] ?? 0}
            meta={dados.metaDe('setor', sid)}
            totalUteis={dados.totalUteis}
            decorridos={dados.decorridos}
          />
          {/* Equipes do setor, maiores acumulados primeiro */}
          {eqs
            .slice()
            .sort((a, b) => (dados.porEquipe[b.id] ?? 0) - (dados.porEquipe[a.id] ?? 0))
            .map(eq => (
              <PainelPlacar
                key={eq.id}
                titulo={lideres[eq.id]?.nome ?? eq.nome}
                subtitulo={`Equipe ${eq.nome}`}
                fotoUrl={lideres[eq.id]?.foto_url}
                acumulado={dados.porEquipe[eq.id] ?? 0}
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
