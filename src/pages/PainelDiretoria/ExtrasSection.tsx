import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Building2, Users2, User, ArrowUpRight, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePickerField } from '@/components/DatePickerField';
import { cn } from '@/lib/utils';
import { formatBRL, safeNum, sumSafe } from '@/lib/money';
import { PP_HO_PERCENTUAL } from '@/lib/index';

interface ExtrasSectionProps {
  extrasAcordos: any[];
  extrasOperadoresMap: Map<string, string>;
  extrasOpEquipeMap: Map<string, string>;
  extrasEquipesMap: Map<string, string>;
  loadingExtras: boolean;
  setores: { id: string; nome: string }[];
}

export function ExtrasSection({
  extrasAcordos,
  extrasOperadoresMap,
  extrasOpEquipeMap,
  extrasEquipesMap,
  loadingExtras,
  setores,
}: ExtrasSectionProps) {
  const [extraSetorFiltro, setExtraSetorFiltro] = useState<string | null>(null);
  const [extraEquipeFiltro, setExtraEquipeFiltro] = useState<string | null>(null);
  const [extraOperadorFiltro, setExtraOperadorFiltro] = useState<string | null>(null);
  const [extraDataInicio, setExtraDataInicio] = useState('');
  const [extraDataFim, setExtraDataFim] = useState('');
  const [extraDataInicioAplicada, setExtraDataInicioAplicada] = useState('');
  const [extraDataFimAplicada, setExtraDataFimAplicada] = useState('');

  const extrasSetores = useMemo(() => {
    const setMap = new Map<string, string>();
    extrasAcordos.forEach(a => {
      if (a.setor_id) {
        const s = setores.find((x: any) => x.id === a.setor_id);
        if (s) setMap.set(s.id, s.nome);
      }
    });
    return Array.from(setMap.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [extrasAcordos, setores]);

  const extrasEquipes = useMemo(() => {
    const eqSet = new Set<string>();
    extrasAcordos
      .filter(a => !extraSetorFiltro || a.setor_id === extraSetorFiltro)
      .forEach(a => {
        if (a.operador_id) {
          const eqId = extrasOpEquipeMap.get(a.operador_id);
          if (eqId) eqSet.add(eqId);
        }
      });
    return Array.from(eqSet).map(id => ({ id, nome: extrasEquipesMap.get(id) ?? id })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [extrasAcordos, extraSetorFiltro, extrasOpEquipeMap, extrasEquipesMap]);

  const extrasOperadores = useMemo(() => {
    const opMap = new Map<string, string>();
    extrasAcordos
      .filter(a => {
        if (extraSetorFiltro && a.setor_id !== extraSetorFiltro) return false;
        if (extraEquipeFiltro) {
          const opEq = a.operador_id ? extrasOpEquipeMap.get(a.operador_id) : null;
          if (opEq !== extraEquipeFiltro) return false;
        }
        return true;
      })
      .forEach(a => {
        if (a.operador_id && extrasOperadoresMap.has(a.operador_id)) {
          opMap.set(a.operador_id, extrasOperadoresMap.get(a.operador_id)!);
        }
      });
    return Array.from(opMap.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [extrasAcordos, extraSetorFiltro, extraEquipeFiltro, extrasOperadoresMap, extrasOpEquipeMap]);

  const extrasFiltrados = useMemo(() => {
    return extrasAcordos.filter(a => {
      if (extraSetorFiltro && a.setor_id !== extraSetorFiltro) return false;
      if (extraEquipeFiltro) {
        const opEq = a.operador_id ? extrasOpEquipeMap.get(a.operador_id) : null;
        if (opEq !== extraEquipeFiltro) return false;
      }
      if (extraOperadorFiltro && a.operador_id !== extraOperadorFiltro) return false;
      if (extraDataInicioAplicada && a.vencimento < extraDataInicioAplicada) return false;
      if (extraDataFimAplicada   && a.vencimento > extraDataFimAplicada)    return false;
      return true;
    });
  }, [extrasAcordos, extraSetorFiltro, extraEquipeFiltro, extraOperadorFiltro, extrasOpEquipeMap, extraDataInicioAplicada, extraDataFimAplicada]);

  const extrasKpis = useMemo(() => {
    const pagos = extrasFiltrados.filter(a => a.status === 'pago');
    const naoPagos = extrasFiltrados.filter(a => a.status === 'nao_pago');
    const totalAgendado = sumSafe(extrasFiltrados.map(a => a.valor));
    const totalRecebido = sumSafe(pagos.map(a => a.valor));
    const totalNaoPago = sumSafe(naoPagos.map(a => a.valor));
    return {
      totalAgendado, totalRecebido,
      hoAgendado: totalAgendado * PP_HO_PERCENTUAL,
      hoRecebido: totalRecebido * PP_HO_PERCENTUAL,
      totalNaoPago,
      hoNaoPago: totalNaoPago * PP_HO_PERCENTUAL,
      totalAcordos: extrasFiltrados.length,
      totalPagos: pagos.length,
    };
  }, [extrasFiltrados]);

  const extrasPorOperador = useMemo(() => {
    const map = new Map<string, { nome: string; acordos: number; recebido: number; agendado: number; pagos: number }>();
    extrasFiltrados.forEach(a => {
      const opId = a.operador_id ?? '__sem__';
      const opNome = a.operador_id ? (extrasOperadoresMap.get(a.operador_id) ?? 'Desconhecido') : 'Sem operador';
      if (!map.has(opId)) map.set(opId, { nome: opNome, acordos: 0, recebido: 0, agendado: 0, pagos: 0 });
      const entry = map.get(opId)!;
      entry.acordos++;
      entry.agendado += safeNum(a.valor);
      if (a.status === 'pago') { entry.recebido += safeNum(a.valor); entry.pagos++; }
    });
    return Array.from(map.entries()).map(([id, d]) => ({ id, ...d })).sort((a, b) => b.recebido - a.recebido);
  }, [extrasFiltrados, extrasOperadoresMap]);

  function limparFiltros() {
    setExtraSetorFiltro(null);
    setExtraEquipeFiltro(null);
    setExtraOperadorFiltro(null);
    setExtraDataInicio('');
    setExtraDataFim('');
    setExtraDataInicioAplicada('');
    setExtraDataFimAplicada('');
  }

  const temFiltroAtivo = !!(extraSetorFiltro || extraEquipeFiltro || extraOperadorFiltro || extraDataInicioAplicada || extraDataFimAplicada);

  return (
    <div className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
            <ArrowUpRight className="w-4 h-4 text-violet-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Recebimentos Extra</h3>
            <p className="text-[11px] text-muted-foreground">Acordos com tipo_vinculo = extra no mês</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {extrasSetores.length > 0 && (
            <Select value={extraSetorFiltro ?? 'all'} onValueChange={v => { setExtraSetorFiltro(v === 'all' ? null : v); setExtraEquipeFiltro(null); setExtraOperadorFiltro(null); }}>
              <SelectTrigger className="w-40 h-8 text-xs rounded-xl border-border/50 bg-background/60">
                <Building2 className="w-3 h-3 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Todos os setores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os setores</SelectItem>
                {extrasSetores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {extrasEquipes.length > 0 && (
            <Select value={extraEquipeFiltro ?? 'all'} onValueChange={v => { setExtraEquipeFiltro(v === 'all' ? null : v); setExtraOperadorFiltro(null); }}>
              <SelectTrigger className="w-40 h-8 text-xs rounded-xl border-border/50 bg-background/60">
                <Users2 className="w-3 h-3 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Todas as equipes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as equipes</SelectItem>
                {extrasEquipes.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {extrasOperadores.length > 0 && (
            <Select value={extraOperadorFiltro ?? 'all'} onValueChange={v => setExtraOperadorFiltro(v === 'all' ? null : v)}>
              <SelectTrigger className="w-40 h-8 text-xs rounded-xl border-border/50 bg-background/60">
                <User className="w-3 h-3 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Todos os operadores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os operadores</SelectItem>
                {extrasOperadores.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-1.5">
            <div className="w-36">
              <DatePickerField value={extraDataInicio} onChange={v => { setExtraDataInicio(v); if (extraDataFim && v > extraDataFim) setExtraDataFim(''); }} placeholder="De" triggerClassName="h-8 text-xs rounded-xl border-border/50 bg-background/60" />
            </div>
            <span className="text-[11px] text-muted-foreground font-medium select-none">–</span>
            <div className="w-36">
              <DatePickerField value={extraDataFim} onChange={setExtraDataFim} placeholder="Até" minDate={extraDataInicio || undefined} triggerClassName="h-8 text-xs rounded-xl border-border/50 bg-background/60" />
            </div>
            <button
              type="button"
              onClick={() => { setExtraDataInicioAplicada(extraDataInicio); setExtraDataFimAplicada(extraDataFim); }}
              disabled={!extraDataInicio && !extraDataFim}
              className="h-8 px-3 flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[11px] font-semibold hover:bg-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              Confirmar
            </button>
            {(extraDataInicioAplicada || extraDataFimAplicada) && (
              <button
                type="button"
                onClick={() => { setExtraDataInicio(''); setExtraDataFim(''); setExtraDataInicioAplicada(''); setExtraDataFimAplicada(''); }}
                className="h-8 w-8 flex items-center justify-center rounded-xl border border-border/50 bg-background/60 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                title="Limpar filtro de data"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {loadingExtras ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : extrasAcordos.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
              <ArrowUpRight className="w-6 h-6 opacity-30" />
            </div>
            <p className="text-sm font-medium">Nenhum recebimento extra no mês</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Dados aparecerão quando houver acordos do tipo extra</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-success/20 bg-success/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Total recebido</p>
                <p className="text-xl font-extrabold font-mono text-success leading-none">{formatBRL(extrasKpis.totalRecebido)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{extrasKpis.totalPagos} acordos pagos</p>
              </div>
              <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">H.O. recebido</p>
                <p className="text-xl font-extrabold font-mono text-orange-500 leading-none">{formatBRL(extrasKpis.hoRecebido)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{(PP_HO_PERCENTUAL * 100).toFixed(2)}% do bruto</p>
              </div>
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Total agendado</p>
                <p className="text-xl font-extrabold font-mono text-primary leading-none">{formatBRL(extrasKpis.totalAgendado)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">H.O.: {formatBRL(extrasKpis.hoAgendado)}</p>
              </div>
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Não pagos</p>
                <p className="text-xl font-extrabold font-mono text-destructive leading-none">{formatBRL(extrasKpis.totalNaoPago)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">H.O.: {formatBRL(extrasKpis.hoNaoPago)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-[11px]">{extrasKpis.totalAcordos} acordos extra</Badge>
              {temFiltroAtivo && (
                <button onClick={limparFiltros} className="text-[11px] text-muted-foreground underline hover:text-foreground transition-colors">
                  Limpar filtros
                </button>
              )}
            </div>

            {extrasPorOperador.length > 0 && (
              <div className="rounded-xl border border-border/40 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border/30 bg-muted/30">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Breakdown por operador</p>
                </div>
                <div className="divide-y divide-border/30">
                  {extrasPorOperador.map((op, i) => {
                    const percRec = op.agendado > 0 ? Math.round((op.recebido / op.agendado) * 100) : 0;
                    const maxRec = extrasPorOperador[0]?.recebido ?? 1;
                    const barW = maxRec > 0 ? Math.round((op.recebido / maxRec) * 100) : 0;
                    return (
                      <motion.div
                        key={op.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-accent/10 transition-colors"
                      >
                        <span className={cn(
                          'w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-extrabold flex-shrink-0 border',
                          i === 0 ? 'bg-yellow-400/20 text-yellow-600 border-yellow-400/30'
                          : i === 1 ? 'bg-slate-300/20 text-slate-500 border-slate-300/30'
                          : i === 2 ? 'bg-amber-600/20 text-amber-700 border-amber-600/30'
                          : 'bg-muted text-muted-foreground border-border/30'
                        )}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-xs font-semibold text-foreground truncate">{op.nome}</span>
                            <div className="flex items-center gap-3 flex-shrink-0 text-[11px]">
                              <span className="text-muted-foreground">{op.acordos} acordos</span>
                              <span className="font-mono font-bold text-success">{formatBRL(op.recebido)}</span>
                              <span className="font-mono text-orange-500 hidden sm:inline">{formatBRL(op.recebido * PP_HO_PERCENTUAL)} H.O.</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                              <motion.div
                                className="h-full rounded-full bg-violet-500"
                                initial={{ width: 0 }}
                                animate={{ width: `${barW}%` }}
                                transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.05 }}
                              />
                            </div>
                            <span className={cn(
                              'text-[10px] font-bold w-8 text-right tabular-nums flex-shrink-0',
                              percRec >= 80 ? 'text-success' : percRec >= 50 ? 'text-warning' : 'text-muted-foreground'
                            )}>{percRec}%</span>
                          </div>
                          <div className="flex gap-3 mt-0.5 text-[10px] text-muted-foreground">
                            <span>Agend.: <span className="font-mono font-semibold">{formatBRL(op.agendado)}</span></span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
