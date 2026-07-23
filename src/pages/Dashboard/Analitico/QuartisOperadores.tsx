/**
 * QuartisOperadores — aba do Analítico (líder+): tabela dos operadores do setor
 * com meta, recebimento, ritmo diário, o esperado até hoje, a diferença, a % de
 * projeção e o quartil. Ao lado, a distribuição dos operadores por quartil.
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
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import {
  diasUteisDoMes, diasUteisDecorridos, quartilAtual, QUARTIS_PADRAO, COR_QUARTIL,
} from '@/lib/diasUteis';
import {
  mapaSetorDaEquipe, setoresDoOperador,
  type ResumoOperadorAnalitico, type EquipeAnalitico, type OperadorEquipeInfo,
} from '@/services/analitico/analitico.service';
import { PizzaQuartis3D } from './PizzaQuartis3D';

interface QuartisOperadoresProps {
  empresaId: string;
  mes: string;                 // 'yyyy-MM'
  setorId?: string | null;
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
}

export function QuartisOperadores({
  empresaId, mes, setorId, equipes, resumos,
  operadorEquipeMap, equipesExtrasPorOperador = {}, loading,
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
  // metas_config_mes.contar_dia_atual — padrão false (o dia de hoje ainda corre)
  const [contarHoje, setContarHoje] = useState(false);
  const [carregado, setCarregado]   = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      try {
        const [{ data: ops }, { data: metasData }, cfg, { data: setoresData }] = await Promise.all([
          supabase.from('perfis').select('id, nome, foto_url, setor_id, equipe_id, situacao')
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
        setContarHoje(cfg.data?.contar_dia_atual === true);
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
    for (const r of resumos) recebidoMap[r.operador_id] = r.total_recebido;

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
      let diaria: number | null = null;
      let hoje: number | null = null;
      let diferenca: number | null = null;
      let projecao: number | null = null;
      let q: QuartilConfig | null = null;

      if (meta && totalUteis > 0) {
        diaria    = meta / totalUteis;
        hoje      = diaria * decorridos;
        diferenca = recebido - hoje;
        projecao  = hoje > 0 ? Math.round((recebido / hoje) * 100) : 0;
        q = quartilAtual(projecao, quartis);
      }

      const equipeNome = (op.equipe_id ? nomeDaEquipe.get(op.equipe_id) : null)
        ?? operadorEquipeMap[op.id]?.equipe_nome
        ?? 'Sem equipe';

      if (!porSetor.has(sid)) porSetor.set(sid, []);
      porSetor.get(sid)!.push({ op, equipeNome, meta, recebido, diaria, hoje, diferenca, projecao, quartil: q });
    }

    // Melhor projeção primeiro; sem meta vai para o fim
    for (const lista of porSetor.values()) {
      lista.sort((a, b) => (b.projecao ?? -1) - (a.projecao ?? -1));
    }
    return porSetor;
  }, [anoNum, mesNum, feriados, contarHoje, quartis, resumos, operadores, metasOp,
      setorEfetivo, filtroEquipe, operadorEquipeMap, equipesExtrasPorOperador,
      setorDaEquipe, nomeDaEquipe]);

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

  // Equipes disponíveis no seletor: só as do setor em exibição
  const equipesDoSetor = useMemo(
    () => equipes.filter(e => !setorEfetivo || e.setor_id === setorEfetivo),
    [equipes, setorEfetivo],
  );

  if (loading || !carregado) {
    return (
      <div className="space-y-2 animate-pulse">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-8 bg-muted rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      {grupos.size > 0 && (
        <div className="flex flex-col xl:flex-row gap-4 items-start">
          {/* Tabela */}
          <div className="flex-1 min-w-0 space-y-4">
            {[...grupos.entries()].map(([sid, lista]) => (
              <div key={sid} className="space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
                  {setores[sid] ?? 'Sem setor'}
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
                        return (
                          <tr
                            key={l.op.id}
                            className="border-t border-border/50"
                            style={cor ? {
                              background: cor + '14',
                              boxShadow: `inset 3px 0 0 0 ${cor}`,
                            } : undefined}
                          >
                            <td className="px-2 py-1">
                              <div className="flex items-center gap-1.5 min-w-0">
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
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
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
        Diário = meta ÷ dias úteis do mês · Hoje = diário × dias úteis trabalhados ·
        Falta/sobra = recebimento − hoje · % = recebimento ÷ hoje ·
        faixas de quartil configuradas na aba Metas.
      </p>
    </div>
  );
}
