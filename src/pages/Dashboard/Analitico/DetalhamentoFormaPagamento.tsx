/**
 * DetalhamentoFormaPagamento — detalhamento do recebimento por forma de pagamento.
 *
 * Compartilhado por dois escopos via prop `modo`:
 *   • 'operador' — recebe os próprios `dados` (a RPC já escopa ao operador);
 *     campo de operador travado, sem filtros de equipe/setor, coluna Usuário oculta.
 *   • 'lider'    — busca do banco e aplica escopo de setor/clone/órfão
 *     (setoresDoOperador), com autocomplete de operador e filtros de equipe.
 *
 * Estrutura inspirada no dashboard de referência (cards por forma → distribuição
 * → filtros dos registros → registros detalhados), com a estética do Gestão de
 * Acordos. Só apresenta: a agregação vem do service (agruparPorFormaPagamento).
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { Filter, X, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatBRL } from '@/lib/money';
import { rotuloFormaPagamento, corFormaPagamento } from '@/lib/formaPagamento';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import {
  buscarAnalitico, agruparPorFormaPagamento,
  mapaSetorDaEquipe, setoresDoOperador,
  type EquipeAnalitico, type OperadorEquipeInfo,
} from '@/services/analitico/analitico.service';

type Props =
  | {
      modo: 'operador';
      dados: AnaliticoRecebimento[];
      loading: boolean;
      operadorNome: string;
    }
  | {
      modo: 'lider';
      empresaId: string;
      mes: string;
      setorId?: string | null;
      equipes: EquipeAnalitico[];
      operadorEquipeMap: Record<string, OperadorEquipeInfo>;
      equipesExtrasPorOperador?: Record<string, string[]>;
    };

const REGISTROS_PAGE = 50;

// Referências estáveis para o modo operador (evita novo [] / {} a cada render)
const EQUIPES_VAZIO: EquipeAnalitico[] = [];
const MAP_VAZIO: Record<string, OperadorEquipeInfo> = {};
const EXTRAS_VAZIO: Record<string, string[]> = {};

interface OperadorOpcao { id: string; nome: string; usuario: string }

export function DetalhamentoFormaPagamento(props: Props) {
  const ehLider = props.modo === 'lider';

  // ── Fonte de linhas ─────────────────────────────────────────────────────────
  const liderEmpresaId = props.modo === 'lider' ? props.empresaId : null;
  const liderMes       = props.modo === 'lider' ? props.mes : null;

  const [linhasLider, setLinhasLider] = useState<AnaliticoRecebimento[]>([]);
  const [loadingLider, setLoadingLider] = useState(ehLider);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!liderEmpresaId || !liderMes) return;
    let cancelado = false;
    setLoadingLider(true);
    setErro(null);
    void buscarAnalitico({ empresaId: liderEmpresaId, mes: liderMes }).then(({ data, error }) => {
      if (cancelado) return;
      setLinhasLider(data);
      setErro(error);
      setLoadingLider(false);
    });
    return () => { cancelado = true; };
  }, [liderEmpresaId, liderMes]);

  const loading = props.modo === 'operador' ? props.loading : loadingLider;

  // ── Filtros do topo ───────────────────────────────────────────────────────
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim]       = useState('');
  const [filtroEquipe, setFiltroEquipe] = useState('');
  const [operadorBusca, setOperadorBusca] = useState('');
  const [operadorSelId, setOperadorSelId] = useState<string | null>(null);
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Filtros dos registros ─────────────────────────────────────────────────
  const [fCliente, setFCliente]   = useState('');
  const [fDocumento, setFDocumento] = useState('');
  const [fForma, setFForma]       = useState('');   // '' = todas
  const [fData, setFData]         = useState('');

  const [registrosVisiveis, setRegistrosVisiveis] = useState(REGISTROS_PAGE);

  // Reseta filtro de equipe quando muda o setor externo (líder)
  const setorId = props.modo === 'lider' ? (props.setorId ?? null) : null;
  useEffect(() => { setFiltroEquipe(''); }, [setorId]);

  const equipes = props.modo === 'lider' ? props.equipes : EQUIPES_VAZIO;
  const operadorEquipeMap = props.modo === 'lider' ? props.operadorEquipeMap : MAP_VAZIO;
  const equipesExtras = props.modo === 'lider' ? (props.equipesExtrasPorOperador ?? EXTRAS_VAZIO) : EXTRAS_VAZIO;
  const setorDaEquipe = useMemo(() => mapaSetorDaEquipe(equipes), [equipes]);

  const equipesDoSetor = useMemo(
    () => equipes.filter(e => !setorId || e.setor_id === setorId),
    [equipes, setorId],
  );

  const linhasBase = props.modo === 'operador' ? props.dados : linhasLider;

  function contaNoSetor(l: AnaliticoRecebimento): boolean {
    if (!setorId) return true;
    if (l.operador_id) {
      return setoresDoOperador(l.operador_id, operadorEquipeMap, equipesExtras, setorDaEquipe).has(setorId);
    }
    return (l.setor_id ?? operadorEquipeMap[l.importado_por_id ?? '']?.setor_id) === setorId;
  }

  function contaNaEquipe(l: AnaliticoRecebimento): boolean {
    if (!filtroEquipe) return true;
    if (!l.operador_id) return false;
    return operadorEquipeMap[l.operador_id]?.equipe_id === filtroEquipe
      || (equipesExtras[l.operador_id] ?? []).includes(filtroEquipe);
  }

  // Escopo (líder): setor + equipe + período — SEM o filtro de operador
  const linhasEscopo = useMemo(() => {
    return linhasBase.filter(l => {
      if (ehLider && !contaNoSetor(l)) return false;
      if (ehLider && !contaNaEquipe(l)) return false;
      if (dataInicio && l.data_pagamento < dataInicio) return false;
      if (dataFim   && l.data_pagamento > dataFim)     return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhasBase, ehLider, setorId, filtroEquipe, dataInicio, dataFim,
      operadorEquipeMap, equipesExtras, setorDaEquipe]);

  const operadoresDisponiveis = useMemo<OperadorOpcao[]>(() => {
    if (!ehLider) return [];
    const mapa = new Map<string, OperadorOpcao>();
    for (const l of linhasEscopo) {
      if (!l.operador_id || mapa.has(l.operador_id)) continue;
      mapa.set(l.operador_id, {
        id: l.operador_id,
        nome: l.perfis?.nome ?? l.operador_usuario,
        usuario: l.perfis?.usuario ?? l.operador_usuario,
      });
    }
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [ehLider, linhasEscopo]);

  const sugestoes = useMemo(() => {
    const q = operadorBusca.trim().toLowerCase();
    if (!ehLider || !q || operadorSelId) return [];
    return operadoresDisponiveis
      .filter(o => o.nome.toLowerCase().includes(q) || o.usuario.toLowerCase().includes(q))
      .slice(0, 8);
  }, [ehLider, operadorBusca, operadorSelId, operadoresDisponiveis]);

  // Resultado final: escopo + operador + filtros dos registros
  const linhasFiltradas = useMemo(() => {
    const qOp  = operadorBusca.trim().toLowerCase();
    const qCli = fCliente.trim().toLowerCase();
    const qDoc = fDocumento.trim().toLowerCase();
    return linhasEscopo.filter(l => {
      if (ehLider) {
        if (operadorSelId) { if (l.operador_id !== operadorSelId) return false; }
        else if (qOp) {
          const nome = (l.perfis?.nome ?? l.operador_usuario ?? '').toLowerCase();
          const usu  = (l.perfis?.usuario ?? '').toLowerCase();
          if (!nome.includes(qOp) && !usu.includes(qOp)) return false;
        }
      }
      if (qCli && !(l.nome_cliente ?? '').toLowerCase().includes(qCli)) return false;
      if (qDoc && !(l.codigo ?? '').toLowerCase().includes(qDoc)) return false;
      if (fForma && rotuloFormaPagamento(l.forma_pagamento, l.forma_detalhe) !== fForma) return false;
      if (fData && l.data_pagamento !== fData) return false;
      return true;
    });
  }, [linhasEscopo, ehLider, operadorSelId, operadorBusca, fCliente, fDocumento, fForma, fData]);

  const agregado = useMemo(() => agruparPorFormaPagamento(linhasFiltradas), [linhasFiltradas]);

  useEffect(() => { setRegistrosVisiveis(REGISTROS_PAGE); }, [linhasFiltradas]);

  // Formas presentes (para o select do filtro de registros)
  const formasPresentes = useMemo(() => {
    const s = new Set<string>();
    for (const l of linhasEscopo) s.add(rotuloFormaPagamento(l.forma_pagamento, l.forma_detalhe));
    return [...s].sort();
  }, [linhasEscopo]);

  const temFiltroTopo = !!(dataInicio || dataFim || operadorBusca || filtroEquipe);
  const temFiltroReg  = !!(fCliente || fDocumento || fForma || fData);

  function limparTopo() {
    setDataInicio(''); setDataFim(''); setFiltroEquipe('');
    setOperadorBusca(''); setOperadorSelId(null); setDropdownAberto(false);
  }
  function limparRegistros() { setFCliente(''); setFDocumento(''); setFForma(''); setFData(''); }

  function selecionarOperador(o: OperadorOpcao) {
    setOperadorBusca(o.nome); setOperadorSelId(o.id); setDropdownAberto(false);
  }

  const operadorTravadoNome = props.modo === 'operador' ? props.operadorNome : '';

  return (
    <div className="space-y-4">
      {/* ── Filtros do topo ──────────────────────────────────────────────────── */}
      <Card className="border-border">
        <CardContent className="p-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Data início</label>
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                className="h-8 px-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Data fim</label>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                className="h-8 px-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>

            {/* Operador */}
            <div className="flex flex-col gap-1 min-w-[200px] flex-1 relative">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Operador</label>
              {props.modo === 'operador' ? (
                <div className="h-8 px-2 flex items-center gap-1.5 text-xs border border-border rounded-md bg-muted/40 text-muted-foreground">
                  <Lock className="w-3 h-3 shrink-0" /> {operadorTravadoNome}
                </div>
              ) : (
                <>
                  <input type="text" value={operadorBusca}
                    onChange={e => { setOperadorBusca(e.target.value); setOperadorSelId(null); setDropdownAberto(true); }}
                    onFocus={() => setDropdownAberto(true)}
                    onBlur={() => {
                      if (blurTimer.current) clearTimeout(blurTimer.current);
                      blurTimer.current = setTimeout(() => setDropdownAberto(false), 150);
                    }}
                    placeholder="Digite o nome…"
                    className="h-8 px-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                  {dropdownAberto && sugestoes.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-20 rounded-md border border-border bg-popover shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                      {sugestoes.map(o => (
                        <button key={o.id} type="button"
                          onMouseDown={e => { e.preventDefault(); selecionarOperador(o); }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/60 transition-colors">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate">{o.nome}</p>
                            <p className="text-[10px] text-muted-foreground">Operador</p>
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground truncate shrink-0">{o.usuario}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {ehLider && equipesDoSetor.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Equipe</label>
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <Select value={filtroEquipe || '__todas__'} onValueChange={v => setFiltroEquipe(v === '__todas__' ? '' : v)}>
                    <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__todas__">Todas as equipes</SelectItem>
                      {equipesDoSetor.map(eq => (<SelectItem key={eq.id} value={eq.id}>{eq.nome}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {temFiltroTopo && (
              <Button size="sm" variant="ghost" className="h-8 px-2 gap-1 text-xs text-muted-foreground" onClick={limparTopo}>
                <X className="w-3 h-3" /> Limpar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando recebimentos do mês…
        </div>
      ) : erro ? (
        <p className="text-sm text-destructive text-center py-10">{erro}</p>
      ) : agregado.formas.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">Nenhum recebimento no período.</p>
        </div>
      ) : (
        <>
          {/* ── Cards por forma + Total Geral ─────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {agregado.formas.map(f => {
              const cor = corFormaPagamento(f.rotulo);
              return (
                <Card key={f.rotulo} className="border-border relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: cor }} />
                  <CardContent className="p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground truncate">{f.rotulo}</p>
                    <p className="text-lg font-bold font-mono tabular-nums leading-tight mt-1" style={{ color: cor }}>{formatBRL(f.valor)}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">{f.perc}% · {f.qtd} registro{f.qtd !== 1 ? 's' : ''}</p>
                  </CardContent>
                </Card>
              );
            })}
            <Card className="border-primary/40 bg-primary/5 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />
              <CardContent className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/80 truncate">Total Geral (agrupado)</p>
                <p className="text-lg font-bold font-mono tabular-nums leading-tight mt-1 text-primary">{formatBRL(agregado.totalValor)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">{agregado.totalQtd} registro{agregado.totalQtd !== 1 ? 's' : ''} agrupado{agregado.totalQtd !== 1 ? 's' : ''}</p>
              </CardContent>
            </Card>
          </div>

          {/* ── Distribuição ──────────────────────────────────────────────────── */}
          <Card className="border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Distribuição por forma de pagamento</p>
                <p className="text-xs text-muted-foreground">Total: {formatBRL(agregado.totalValor)}</p>
              </div>
              <div className="space-y-2.5">
                {agregado.formas.map(f => {
                  const cor = corFormaPagamento(f.rotulo);
                  const w = agregado.totalValor > 0 ? Math.max(2, Math.round((f.valor / agregado.totalValor) * 100)) : 0;
                  return (
                    <div key={f.rotulo} className="flex items-center gap-3">
                      <span className="text-xs font-medium w-32 shrink-0 truncate text-right">{f.rotulo}</span>
                      <div className="flex-1 min-w-0 h-5 rounded-full bg-muted/50 overflow-hidden relative">
                        <div className="h-full rounded-full flex items-center justify-end pr-2 transition-all"
                          style={{ width: `${w}%`, background: `linear-gradient(90deg, ${cor}bb, ${cor})` }}>
                          <span className="text-[10px] font-bold text-white tabular-nums">{f.perc}%</span>
                        </div>
                      </div>
                      <span className="text-xs font-mono tabular-nums font-semibold w-28 shrink-0 text-right" style={{ color: cor }}>
                        {formatBRL(f.valor)}<span className="text-muted-foreground font-normal"> ({f.qtd})</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* ── Filtros dos Registros ─────────────────────────────────────────── */}
          <Card className="border-border">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">Filtros dos Registros</p>
                {temFiltroReg && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs text-muted-foreground" onClick={limparRegistros}>
                    <X className="w-3 h-3" /> Limpar filtros
                  </Button>
                )}
              </div>
              <div className="flex items-end gap-3 flex-wrap">
                <div className="flex flex-col gap-1 min-w-[160px] flex-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cliente</label>
                  <input type="text" value={fCliente} onChange={e => setFCliente(e.target.value)} placeholder="Nome do cliente…"
                    className="h-8 px-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1 min-w-[140px]">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Documento (NR)</label>
                  <input type="text" value={fDocumento} onChange={e => setFDocumento(e.target.value)} placeholder="Nº do documento…"
                    className="h-8 px-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Forma pagamento</label>
                  <Select value={fForma || '__todas__'} onValueChange={v => setFForma(v === '__todas__' ? '' : v)}>
                    <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__todas__">Todas</SelectItem>
                      {formasPresentes.map(f => (<SelectItem key={f} value={f}>{f}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">DtPgto</label>
                  <input type="date" value={fData} onChange={e => setFData(e.target.value)}
                    className="h-8 px-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Registros Detalhados ──────────────────────────────────────────── */}
          <Card className="border-border">
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold">Registros Detalhados</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  Total: {agregado.totalQtd.toLocaleString('pt-BR')} registro{agregado.totalQtd !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {ehLider && <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">USUÁRIO</th>}
                      <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">CLIENTE</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">DOCUMENTO</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">FORMA PAGAMENTO</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">DT.PGTO</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">VALOR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {linhasFiltradas.slice(0, registrosVisiveis).map(l => {
                      const rotulo = rotuloFormaPagamento(l.forma_pagamento, l.forma_detalhe);
                      const cor = corFormaPagamento(rotulo);
                      return (
                        <tr key={l.id} className="hover:bg-muted/20 transition-colors">
                          {ehLider && <td className="px-3 py-2 font-medium">{l.perfis?.nome ?? l.operador_usuario}</td>}
                          <td className="px-3 py-2 text-muted-foreground truncate max-w-[240px]" title={l.nome_cliente ?? ''}>
                            {l.nome_cliente ?? '—'}
                          </td>
                          <td className="px-3 py-2 font-mono">{l.codigo}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-[11px] font-semibold rounded-full px-2.5 py-0.5" style={{ background: cor + '1e', borderColor: cor + '55', color: cor }}>
                              {rotulo}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {new Date(l.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">{formatBRL(l.valor_recebido)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {registrosVisiveis < linhasFiltradas.length && (
                <div className="flex justify-center py-3 border-t border-border">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                    onClick={() => setRegistrosVisiveis(v => v + REGISTROS_PAGE)}>
                    Carregar mais ({(linhasFiltradas.length - registrosVisiveis).toLocaleString('pt-BR')} restantes)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
