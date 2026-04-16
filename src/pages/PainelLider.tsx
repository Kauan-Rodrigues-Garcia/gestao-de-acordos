/**
 * PainelLider.tsx — v2 (multi-tenant fix)
 *
 * CORREÇÕES APLICADAS:
 * 1. Guard !empresa?.id no início do componente — não executa queries sem empresa definida
 * 2. Query de operadores garante .eq('empresa_id', empresa.id) SEMPRE
 * 3. Para líder: filtra por setor_id do próprio perfil (.eq('setor_id', perfil.setor_id))
 * 4. Para admin: mostra todos os operadores da empresa (sem filtro de setor)
 * 5. Query de acordos garante .eq('empresa_id', empresa.id) como filtro obrigatório
 * 6. Query de equipes já tinha empresa_id — mantida
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, CheckCircle2, Clock, AlertTriangle, ArrowRight, Calendar,
  BarChart3, BarChart2, ChevronRight, RefreshCw, X, Trophy, Target,
  TrendingUp, Loader2, DollarSign, Hash, Building2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase, Perfil, Acordo } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { formatBRL, safeNum, sumSafe, pct } from '@/lib/money';
import { formatDate, STATUS_LABELS, STATUS_COLORS, getTodayISO, getStatusLabels, isPaguePlay, isPerfilAdmin, isPerfilLider } from '@/lib/index';
import { calcularMetricasMes } from '@/services/acordos.service';
import { cn } from '@/lib/utils';

// ─── Tipos ────────────────────────────────────────────────────────────────

interface EquipeInfo {
  id: string;
  nome: string;
  setor_id: string;
  empresa_id: string;
  membros?: { count: number }[];
}

interface OperadorResumo {
  perfil:        Perfil;
  totalAcordos:  number;
  pagos:         number;
  abertos:       number;
  vencidos:      number;
  vencendoHoje:  number;
  valorPago:     number;
  valorAberto:   number;
}

function buildResumo(perfil: Perfil, acordos: Acordo[]): OperadorResumo {
  const hoje    = getTodayISO();
  const pagos   = acordos.filter(a => a.status === 'pago');
  const abertos = acordos.filter(a => !['pago','nao_pago'].includes(a.status));
  const vencidos = abertos.filter(a => a.vencimento < hoje);
  return {
    perfil,
    totalAcordos: acordos.length,
    pagos:        pagos.length,
    abertos:      abertos.length,
    vencidos:     vencidos.length,
    vencendoHoje: abertos.filter(a => a.vencimento === hoje).length,
    valorPago:    sumSafe(pagos.map(a => a.valor)),
    valorAberto:  sumSafe(abertos.map(a => a.valor)),
  };
}

// ─── Card de operador (lista) ─────────────────────────────────────────────

function CardOperador({
  resumo, selecionado, onClick,
}: { resumo: OperadorResumo; selecionado: boolean; onClick: () => void }) {
  const total = resumo.valorPago + resumo.valorAberto;
  const perc  = pct(resumo.valorPago, total);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <Card
        onClick={onClick}
        className={cn(
          'cursor-pointer transition-all duration-150 hover:shadow-md hover:border-primary/40',
          selecionado ? 'border-primary bg-primary/5 shadow-md ring-1 ring-primary/30' : 'border-border',
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="w-9 h-9 flex-shrink-0">
              <AvatarFallback className={cn(
                'text-xs font-bold',
                selecionado ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}>
                {resumo.perfil.nome.split(' ').map(n => n[0]).slice(0,2).join('')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{resumo.perfil.nome}</p>
              <p className="text-xs text-muted-foreground">{resumo.totalAcordos} acordos</p>
            </div>
            <ChevronRight className={cn(
              'w-4 h-4 flex-shrink-0 text-muted-foreground transition-transform duration-200',
              selecionado && 'rotate-90 text-primary'
            )} />
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { val: resumo.pagos,         label: 'Pagos',   cls: 'text-success' },
              { val: resumo.abertos,        label: 'Abertos', cls: 'text-warning' },
              { val: resumo.vencidos,       label: 'Vencidos',cls: 'text-destructive' },
            ].map(({ val, label, cls }) => (
              <div key={label} className="text-center">
                <p className={cn('text-base font-bold font-mono', cls)}>{val}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Em aberto</span>
              <span className="font-mono font-semibold text-primary">{formatBRL(resumo.valorAberto)}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-success rounded-full transition-all" style={{ width: `${perc}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground text-right">{perc}% pago</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Analítico do operador selecionado ───────────────────────────────────

interface AnaliticoOperadorProps {
  operadorId:   string;
  operadorNome: string;
  onFechar:     () => void;
}

function AnaliticoOperador({ operadorId, operadorNome, onFechar }: AnaliticoOperadorProps) {
  const { tenantSlug } = useEmpresa();
  const statusLabels = getStatusLabels(tenantSlug);
  const nrLabel = isPaguePlay(tenantSlug) ? 'CPF' : 'NR';

  const [acordos,       setAcordos]       = useState<Acordo[]>([]);
  const [loadingLocal,  setLoadingLocal]  = useState(true);
  const [erroLocal,     setErroLocal]     = useState<string | null>(null);
  const [filtroStatus,  setFiltroStatus]  = useState<string>('all');

  const carregarAcordos = useCallback(async () => {
    setLoadingLocal(true);
    setErroLocal(null);
    try {
      const { data, error } = await supabase
        .from('acordos')
        .select('id, nome_cliente, nr_cliente, vencimento, valor, status, tipo, operador_id, setor_id, parcelas, whatsapp, observacoes, data_cadastro, criado_em, atualizado_em')
        .eq('operador_id', operadorId)
        .order('vencimento', { ascending: true });
      if (error) throw error;
      setAcordos((data as Acordo[]) ?? []);
    } catch (e) {
      setErroLocal(e instanceof Error ? e.message : 'Erro ao carregar acordos');
    } finally {
      setLoadingLocal(false);
    }
  }, [operadorId]);

  useEffect(() => {
    carregarAcordos();
  }, [carregarAcordos]);

  const hoje = getTodayISO();
  const mes  = calcularMetricasMes(acordos);

  const abertos  = acordos.filter(a => !['pago','nao_pago'].includes(a.status));
  const pagos    = acordos.filter(a => a.status === 'pago');
  const vencidos = abertos.filter(a => a.vencimento < hoje);

  const acordosFiltrados = acordos
    .filter(a => filtroStatus === 'all' || a.status === filtroStatus)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  const initials = operadorNome.split(' ').map(n => n[0]).slice(0,2).join('');

  return (
    <motion.div
      key={operadorId}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ type: 'spring', stiffness: 280, damping: 30 }}
      className="space-y-4"
    >
      {/* Header do operador */}
      <Card className="border-primary/30 bg-primary/3">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <Avatar className="w-10 h-10">
              <AvatarFallback className="bg-primary text-primary-foreground font-bold text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="font-bold text-foreground">{operadorNome}</h3>
              <p className="text-xs text-muted-foreground">
                {loadingLocal ? 'Carregando...' : `${acordos.length} acordos na carteira`}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="w-7 h-7" onClick={carregarAcordos} title="Recarregar">
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onFechar}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {loadingLocal ? (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Carregando acordos...</span>
            </div>
          ) : erroLocal ? (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              {erroLocal}
              <Button size="sm" variant="link" className="text-destructive ml-2 h-auto p-0" onClick={carregarAcordos}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'A receber/mês', value: formatBRL(mes.valorAReceber),  cls: 'text-primary',     sub: `${mes.pendentesNoMes} aberto(s) no mês` },
                { label: 'Recebido/mês',  value: formatBRL(mes.valorRecebido),  cls: 'text-success',     sub: `${mes.pagosNoMes} pago(s) no mês` },
                { label: 'Total vencidos',value: String(vencidos.length),       cls: 'text-destructive', sub: `${formatBRL(sumSafe(vencidos.map(a=>a.valor)))} em atraso` },
                { label: 'Total pagos',   value: String(pagos.length),          cls: 'text-success',     sub: formatBRL(sumSafe(pagos.map(a=>a.valor))) },
              ].map(({ label, value, cls, sub }) => (
                <div key={label} className="p-3 bg-background rounded-lg border border-border">
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className={cn('text-base font-bold font-mono mt-0.5', cls)}>{value}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de acordos */}
      {!loadingLocal && !erroLocal && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Hash className="w-4 h-4 text-primary" />
                Painel da Equipe
              </CardTitle>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="h-7 w-36 text-xs">
                  <SelectValue placeholder="Todos status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(statusLabels).filter(([k]) => !!k).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {acordosFiltrados.length === 0 ? (
              <p className="text-sm text-center text-muted-foreground py-8">Nenhum acordo encontrado</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">{nrLabel}</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">CLIENTE</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">VENCIMENTO</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">VALOR</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">STATUS</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {acordosFiltrados.map(a => {
                      const venceHoje = a.vencimento === hoje;
                      const atrasado  = a.vencimento < hoje && !['pago','nao_pago'].includes(a.status);
                      return (
                        <tr key={a.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2 font-mono text-muted-foreground">{a.nr_cliente}</td>
                          <td className="px-4 py-2 font-medium text-foreground max-w-[160px] truncate">{a.nome_cliente}</td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {formatDate(a.vencimento)}
                            {venceHoje && <Badge className="ml-1 text-[10px] bg-warning/20 text-warning border-warning/30 h-4 px-1">Hoje</Badge>}
                            {atrasado  && <Badge className="ml-1 text-[10px] bg-destructive/10 text-destructive border-destructive/20 h-4 px-1">Atrasado</Badge>}
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-semibold text-foreground">{formatBRL(a.valor)}</td>
                          <td className="px-4 py-2">
                            <Badge
                              className={cn('text-[10px] h-5 px-1.5', STATUS_COLORS[a.status as keyof typeof STATUS_COLORS])}
                              variant="outline"
                            >
                              {statusLabels[a.status] ?? STATUS_LABELS[a.status] ?? a.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-2">
                            <Link to={`../acordo/${a.id}`} className="text-primary hover:underline text-[10px]">
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}


// ─── Componente principal ─────────────────────────────────────────────────

type Aba = 'equipe';

interface OperadorInfo { id: string; nome: string; perfil: Perfil; }

export default function PainelLider() {
  const { perfil } = useAuth();
  const { empresa, tenantSlug } = useEmpresa();
  const statusLabels = getStatusLabels(tenantSlug);
  const nrLabel = isPaguePlay(tenantSlug) ? 'CPF' : 'NR';

  const [operadores,          setOperadores]          = useState<Perfil[]>([]);
  const [acordosPorOperador,  setAcordosPorOperador]  = useState<Record<string, Acordo[]>>({});
  const [loading,             setLoading]             = useState(true);
  const [erro,                setErro]                = useState<string | null>(null);
  const [opSel,               setOpSel]               = useState<OperadorInfo | null>(null);
  const [equipes,             setEquipes]             = useState<EquipeInfo[]>([]);
  const [filtroEquipe,        setFiltroEquipe]        = useState<string>('todas');

  // ── Derivar role ──────────────────────────────────────────────────────────
  // Admin e Diretoria vêem todos os operadores da empresa sem filtro de setor
  const isAdmin = isPerfilAdmin(perfil?.perfil ?? '') || perfil?.perfil === 'diretoria';
  // Elite e Gerência têm as mesmas permissões de líder (filtra por setor)
  const isLiderOuSimilar = isPerfilLider(perfil?.perfil ?? '') && !isAdmin;

  const carregarDados = useCallback(async () => {
    // ── GUARD: não executar sem empresa ou perfil definidos ────────────────
    if (!perfil || !empresa?.id) return;

    setLoading(true);
    setErro(null);

    try {
      // 0. Buscar equipes do setor do líder (ou de toda a empresa para admin)
      if (empresa.id) {
        let eqQuery = supabase
          .from('equipes')
          .select('*, membros:perfis(count)')
          .eq('empresa_id', empresa.id);   // ← sempre filtrar por empresa

        // Líder, Elite e Gerência vêem apenas equipes do seu setor
        if (!isAdmin && isLiderOuSimilar && perfil.setor_id) {
          eqQuery = eqQuery.eq('setor_id', perfil.setor_id);
        }

        const { data: eqData } = await eqQuery;
        if (eqData) setEquipes(eqData as EquipeInfo[]);
      }

      // 1. Buscar operadores — SEMPRE com empresa_id obrigatório
      //    Líder: apenas do seu próprio setor
      //    Admin: todos os operadores da empresa
      let q = supabase
        .from('perfis')
        .select('*, setores(id, nome)')
        .eq('empresa_id', empresa.id)      // ← FILTRO OBRIGATÓRIO — evita cross-tenant
        .eq('perfil', 'operador')
        .eq('ativo', true);

      if (!isAdmin && isLiderOuSimilar && perfil.setor_id) {
        // Líder/Elite/Gerência: apenas operadores do seu próprio setor
        q = q.eq('setor_id', perfil.setor_id);
      }
      // Admin: sem filtro adicional de setor — vê todos da empresa

      const { data: ops, error: opsErr } = await q.order('nome');
      if (opsErr) throw new Error(`Operadores: ${opsErr.message}`);

      const listaOps = (ops as Perfil[]) || [];
      setOperadores(listaOps);

      if (listaOps.length === 0) { setLoading(false); return; }

      // 2. Buscar acordos de todos os operadores filtrados
      //    empresa_id obrigatório para garantir isolamento multi-tenant
      const ids = listaOps.map(o => o.id);
      const { data: acData, error: acErr } = await supabase
        .from('acordos')
        .select('id, nome_cliente, nr_cliente, vencimento, valor, status, tipo, operador_id, setor_id, parcelas, whatsapp, observacoes, data_cadastro, criado_em, atualizado_em')
        .eq('empresa_id', empresa.id)      // ← FILTRO OBRIGATÓRIO — isolamento cross-tenant
        .in('operador_id', ids)
        .order('vencimento', { ascending: true });

      if (acErr) throw new Error(`Acordos: ${acErr.message}`);

      // 3. Agrupar por operador_id
      const agrupado: Record<string, Acordo[]> = {};
      listaOps.forEach(op => { agrupado[op.id] = []; });
      ((acData as Acordo[]) || []).forEach(ac => {
        if (agrupado[ac.operador_id] !== undefined) {
          agrupado[ac.operador_id].push(ac);
        }
      });

      setAcordosPorOperador(agrupado);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      setErro(msg);
      console.error('[PainelLider]', e);
    } finally {
      setLoading(false);
    }
  }, [perfil?.id, perfil?.perfil, perfil?.setor_id, empresa?.id, isAdmin]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Resumos para os cards e analítico do setor
  const resumos = useMemo<OperadorResumo[]>(() =>
    operadores.map(op => buildResumo(op, acordosPorOperador[op.id] ?? [])),
    [operadores, acordosPorOperador]
  );

  // Operadores filtrados pela equipe selecionada
  const operadoresFiltrados = useMemo(() => {
    if (filtroEquipe === 'todas') return operadores;
    return operadores.filter(op => (op as any).equipe_id === filtroEquipe);
  }, [operadores, filtroEquipe, equipes]);

  const resumosFiltrados = useMemo<OperadorResumo[]>(() =>
    operadoresFiltrados.map(op => buildResumo(op, acordosPorOperador[op.id] ?? [])),
    [operadoresFiltrados, acordosPorOperador]
  );

  function selecionarOperador(op: Perfil) {
    if (opSel?.id === op.id) {
      setOpSel(null);
    } else {
      setOpSel({ id: op.id, nome: op.nome, perfil: op });
    }
  }

  // ── GUARD: empresa ainda não carregou ─────────────────────────────────
  if (!empresa?.id) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando empresa...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando painel da equipe...</p>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-3" />
            <p className="font-semibold text-destructive">Erro ao carregar painel</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">{erro}</p>
            <Button onClick={carregarDados} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" /> Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const nomeSetor = (perfil?.setores as { nome?: string } | undefined)?.nome;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> Painel da Equipe
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {operadores.length} operador(es)
            {nomeSetor && <span className="text-primary font-medium"> · {nomeSetor}</span>}
          </p>
          {empresa && (
            <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {empresa.nome}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={carregarDados}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Atualizar
        </Button>
      </div>

      {/* Aviso analítico */}
      <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1">
        <BarChart2 className="w-3.5 h-3.5" />
        Os dados analíticos do setor estão disponíveis no Dashboard → "Exibir Dados Analíticos"
      </p>

      {/* Seção: Minhas Equipes */}
      {equipes.length > 0 && (
        <div className="mb-5">
          <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-primary" /> Minhas Equipes
          </h2>
          <div className="flex flex-wrap gap-2">
            {equipes.map(eq => {
              const qtd = eq.membros?.[0]?.count ?? 0;
              return (
                <div key={eq.id} className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border border-border rounded-lg text-sm">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-medium text-foreground">{eq.nome}</span>
                  <span className="text-xs text-muted-foreground bg-background rounded px-1.5 py-0.5 border">
                    {qtd} {qtd === 1 ? 'membro' : 'membros'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtro por equipe */}
      {equipes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            onClick={() => setFiltroEquipe('todas')}
            className={cn(
              'px-3 py-1 rounded-lg text-xs font-medium border transition-colors',
              filtroEquipe === 'todas'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
            )}
          >
            Todas as equipes
          </button>
          {equipes.map(eq => (
            <button
              key={eq.id}
              onClick={() => setFiltroEquipe(eq.id)}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium border transition-colors',
                filtroEquipe === eq.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
              )}
            >
              {eq.nome}
            </button>
          ))}
        </div>
      )}



      {/* Equipe */}
      {(
        operadores.length === 0 ? (
          <Card className="border-border">
            <CardContent className="p-10 text-center text-muted-foreground">
              <Users className="w-10 h-10 opacity-30 mx-auto mb-3" />
              <p className="font-medium">Nenhum operador neste setor</p>
              <p className="text-xs mt-1">Verifique se os usuários foram vinculados ao setor correto.</p>
            </CardContent>
          </Card>
        ) : (
          <div className={cn(
            'grid gap-4',
            opSel
              ? 'grid-cols-1 lg:grid-cols-[300px_1fr]'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          )}>
            {/* Coluna esquerda: cards dos operadores (respeitando filtro de equipe) */}
            <div className="space-y-3">
              {resumosFiltrados.map(resumo => (
                <CardOperador
                  key={resumo.perfil.id}
                  resumo={resumo}
                  selecionado={opSel?.id === resumo.perfil.id}
                  onClick={() => selecionarOperador(resumo.perfil)}
                />
              ))}
            </div>

            {/* Coluna direita: analítico do operador selecionado */}
            <AnimatePresence mode="wait">
              {opSel && (
                <AnaliticoOperador
                  key={opSel.id}
                  operadorId={opSel.id}
                  operadorNome={opSel.nome}
                  onFechar={() => setOpSel(null)}
                />
              )}
            </AnimatePresence>
          </div>
        )
      )}

    </div>
  );
}
