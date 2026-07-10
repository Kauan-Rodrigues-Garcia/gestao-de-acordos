/**
 * QuartisOperadores — aba do Analítico (líder+): lista simples dos operadores
 * do setor com o quartil atual, a % de projeção e quanto falta para subir.
 *
 * Mesma matemática do header do dashboard (lib/diasUteis): projeção =
 * recebido no analítico ÷ (meta diária × dias úteis trabalhados); os
 * quartis vêm da configuração da aba Metas.
 */

import { useState, useEffect, useMemo } from 'react';
import { Building2, Layers } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { QuartilConfig } from '@/lib/supabase';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatBRL } from '@/lib/money';
import { getTodayISO } from '@/lib/index';
import { cn } from '@/lib/utils';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import {
  diasUteisDoMes, diasUteisDecorridos, quartilAtual, proximoQuartil, QUARTIS_PADRAO,
} from '@/lib/diasUteis';
import type { ResumoOperadorAnalitico, EquipeAnalitico } from '@/services/analitico/analitico.service';

interface QuartisOperadoresProps {
  empresaId: string;
  mes: string;                 // 'yyyy-MM'
  setorId?: string | null;
  equipes: EquipeAnalitico[];
  resumos: ResumoOperadorAnalitico[];
  loading: boolean;
}

interface PerfilOp { id: string; nome: string; foto_url: string | null; setor_id: string | null; equipe_id: string | null }
interface MetaOpRow { referencia_id: string; meta_valor: number }

const COR_QUARTIL: Record<number, string> = {
  1: '#22c55e', 2: '#6366f1', 3: '#f59e0b', 4: '#ef4444',
};

export function QuartisOperadores({
  empresaId, mes, setorId, equipes, resumos, loading,
}: QuartisOperadoresProps) {
  const { perfil } = useAuth();
  // Admin/diretoria podem alternar entre setores; os demais ficam no próprio
  const podeFiltrarSetor = ['administrador', 'super_admin', 'diretoria']
    .includes(perfil?.perfil ?? '');
  const [filtroSetor,  setFiltroSetor]  = useState<string>('');   // '' = todos
  const [filtroEquipe, setFiltroEquipe] = useState<string>('');   // '' = todas
  const setorProprio = setorId ?? perfil?.setor_id ?? null;
  const setorEfetivo = podeFiltrarSetor ? (filtroSetor || setorProprio) : setorProprio;
  const [anoNum, mesNum] = mes.split('-').map(Number);

  const [operadores, setOperadores] = useState<PerfilOp[]>([]);
  const [metasOp, setMetasOp]       = useState<Record<string, number>>({});
  const [feriados, setFeriados]     = useState<string[]>([]);
  const [quartis, setQuartis]       = useState<QuartilConfig[]>(QUARTIS_PADRAO);
  const [setores, setSetores]       = useState<Record<string, string>>({});
  const [carregado, setCarregado]   = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      try {
        const [{ data: ops }, { data: metasData }, cfg, { data: setoresData }] = await Promise.all([
          supabase.from('perfis').select('id, nome, foto_url, setor_id, equipe_id')
            .eq('empresa_id', empresaId).in('perfil', ['operador', 'elite']).order('nome'),
          supabase.from('metas').select('referencia_id, meta_valor')
            .eq('empresa_id', empresaId).eq('tipo', 'operador')
            .eq('mes', mesNum).eq('ano', anoNum),
          getMetasConfig(empresaId, mesNum, anoNum),
          supabase.from('setores').select('id, nome').eq('empresa_id', empresaId),
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
        setQuartis(cfg.data?.quartis ?? QUARTIS_PADRAO);
        const sMap: Record<string, string> = {};
        for (const s of (setoresData as { id: string; nome: string }[]) ?? []) sMap[s.id] = s.nome;
        setSetores(sMap);
      } catch { /* sem dados — lista vazia */ }
      if (!cancelado) setCarregado(true);
    }
    void carregar();
    return () => { cancelado = true; };
  }, [empresaId, mesNum, anoNum]);

  const grupos = useMemo(() => {
    const totalUteis = diasUteisDoMes(anoNum, mesNum, feriados);
    const decorridos = Math.max(diasUteisDecorridos(anoNum, mesNum, feriados, getTodayISO()), 1);
    const recebidoMap: Record<string, number> = {};
    for (const r of resumos) recebidoMap[r.operador_id] = r.total_recebido;

    const visiveis = operadores
      .filter(o => !setorEfetivo || o.setor_id === setorEfetivo)
      .filter(o => !filtroEquipe || o.equipe_id === filtroEquipe);

    const porSetor = new Map<string, {
      op: PerfilOp; recebido: number; projecao: number | null;
      quartil: QuartilConfig | null; faltaProximo: number | null; proximoNum: number | null;
    }[]>();

    for (const op of visiveis) {
      const sid = op.setor_id ?? 'sem_setor';
      const meta = metasOp[op.id];
      const recebido = recebidoMap[op.id] ?? 0;
      let projecao: number | null = null;
      let q: QuartilConfig | null = null;
      let faltaProximo: number | null = null;
      let proximoNum: number | null = null;

      if (meta && totalUteis > 0) {
        const esperado = (meta / totalUteis) * decorridos;
        projecao = esperado > 0 ? Math.round((recebido / esperado) * 100) : 0;
        q = quartilAtual(projecao, quartis);
        const prox = proximoQuartil(q, quartis);
        if (prox) {
          proximoNum   = prox.quartil;
          faltaProximo = Math.max(0, (esperado * prox.min_pct) / 100 - recebido);
        }
      }
      if (!porSetor.has(sid)) porSetor.set(sid, []);
      porSetor.get(sid)!.push({ op, recebido, projecao, quartil: q, faltaProximo, proximoNum });
    }

    // Melhor projeção primeiro; sem meta vai para o fim
    for (const lista of porSetor.values()) {
      lista.sort((a, b) => (b.projecao ?? -1) - (a.projecao ?? -1));
    }
    return porSetor;
  }, [anoNum, mesNum, feriados, quartis, resumos, operadores, metasOp, setorEfetivo, filtroEquipe]);

  // Equipes disponíveis no seletor: só as do setor em exibição
  const equipesDoSetor = useMemo(
    () => equipes.filter(e => !setorEfetivo || e.setor_id === setorEfetivo),
    [equipes, setorEfetivo],
  );

  if (loading || !carregado) {
    return (
      <div className="space-y-2 animate-pulse">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 bg-muted rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros: setor (admin/diretoria) + equipe */}
      <div className="flex items-center gap-3 flex-wrap">
        {podeFiltrarSetor && Object.keys(setores).length > 0 && (
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Select value={filtroSetor || '__todos__'}
              onValueChange={v => { setFiltroSetor(v === '__todos__' ? '' : v); setFiltroEquipe(''); }}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__todos__">Todos os setores</SelectItem>
                {Object.entries(setores).map(([id, nome]) => (
                  <SelectItem key={id} value={id}>{nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {equipesDoSetor.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Select value={filtroEquipe || '__todas__'}
              onValueChange={v => setFiltroEquipe(v === '__todas__' ? '' : v)}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__todas__">Todas as equipes</SelectItem>
                {equipesDoSetor.map(eq => (
                  <SelectItem key={eq.id} value={eq.id}>{eq.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {grupos.size === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">
          Nenhum operador encontrado com os filtros atuais.
        </p>
      )}

      {[...grupos.entries()].map(([sid, lista]) => (
        <div key={sid} className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            {setores[sid] ?? 'Sem setor'}
          </p>
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {lista.map(({ op, projecao, quartil, faltaProximo, proximoNum }, i) => {
              const cor = quartil ? COR_QUARTIL[quartil.quartil] ?? '#6366f1' : undefined;
              return (
                <div key={op.id} className={cn(
                  'flex items-center gap-3 px-3.5 py-2.5',
                  i > 0 && 'border-t border-border/60',
                )}>
                  {op.foto_url ? (
                    <img src={op.foto_url} alt={op.nome}
                      className="w-8 h-8 rounded-full object-cover border border-border shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                      {op.nome.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="flex-1 min-w-0 text-sm font-medium truncate">{op.nome}</span>

                  {quartil ? (
                    <>
                      <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                        {faltaProximo !== null && proximoNum !== null ? (
                          <>faltam <strong className="text-foreground">{formatBRL(faltaProximo)}</strong> p/ o {proximoNum}º</>
                        ) : (
                          <span className="text-emerald-500 font-medium">melhor quartil ✨</span>
                        )}
                      </span>
                      <span className="w-14 text-right font-bold tabular-nums font-mono text-sm shrink-0" style={{ color: cor }}>
                        {projecao}%
                      </span>
                      <span
                        className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold"
                        style={{ background: (cor ?? '#6366f1') + '1a', color: cor }}
                      >
                        {quartil.quartil}º quartil
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground italic shrink-0">sem meta definida</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">
        Projeção = recebido no analítico ÷ esperado até hoje (meta diária × dias úteis
        trabalhados) · faixas de quartil configuradas na aba Metas.
      </p>
    </div>
  );
}
