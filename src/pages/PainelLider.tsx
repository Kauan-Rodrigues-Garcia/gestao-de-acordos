/**
 * PainelLider.tsx — versão corrigida definitivamente.
 *
 * Causa raiz do bug do analítico:
 * - statsOperadorSel era derivado via useMemo de statsLista.find()
 * - Se o perfil ainda não tinha carregado ou o id não batia, retornava null
 * - AnimatePresence + condição dupla (operadorSelecionado && statsOperadorSel) causava
 *   o componente nunca renderizar quando statsLista ainda estava vazia na primeira passagem
 *
 * CORREÇÃO:
 * - AnaliticoOperador recebe o id do operador e carrega seus próprios acordos
 *   diretamente do banco — completamente independente do estado da lista
 * - Isso elimina toda dependência de sincronização entre estados
 * - Estado local com loading/erro/vazio dentro do próprio analítico
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, CheckCircle2, Clock, AlertTriangle, ArrowRight, Calendar,
  BarChart3, ChevronRight, RefreshCw, X, Trophy, Target,
  TrendingUp, Loader2, DollarSign, Hash
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase, Perfil, Acordo } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { formatBRL, safeNum, sumSafe, pct } from '@/lib/money';
import { formatDate, STATUS_LABELS, STATUS_COLORS, getTodayISO } from '@/lib/index';
import { calcularMetricasMes } from '@/services/acordos.service';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';

// ─── Tipos ────────────────────────────────────────────────────────────────

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
  const abertos = acordos.filter(a => !['pago','cancelado'].includes(a.status));
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
              { val: resumo.pagos,   label: 'Pagos',    cls: 'bg-success/8 text-success' },
              { val: resumo.abertos, label: 'Abertos',  cls: 'bg-warning/8 text-warning' },
              { val: resumo.vencidos,label: 'Vencidos', cls: 'bg-destructive/8 text-destructive' },
            ].map(({ val, label, cls }) => (
              <div key={label} className={cn('text-center p-1.5 rounded-lg', cls)}>
                <p className="text-base font-bold">{val}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          <div className="p-2.5 bg-primary/5 border border-primary/15 rounded-lg mb-2">
            <p className="text-[10px] text-muted-foreground">Em aberto</p>
            <p className="text-sm font-bold font-mono text-primary">{formatBRL(resumo.valorAberto)}</p>
          </div>

          <div>
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>Recebido</span>
              <span className="font-medium">{perc}% · {formatBRL(resumo.valorPago)}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-success rounded-full transition-all duration-500" style={{ width: `${perc}%` }} />
            </div>
          </div>

          {(resumo.vencendoHoje > 0 || resumo.vencidos > 0) && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {resumo.vencendoHoje > 0 && (
                <Badge className="text-[10px] h-4 px-1.5 bg-warning/20 text-warning border-0">
                  {resumo.vencendoHoje} vence hoje
                </Badge>
              )}
              {resumo.vencidos > 0 && (
                <Badge className="text-[10px] h-4 px-1.5 bg-destructive/20 text-destructive border-0">
                  {resumo.vencidos} vencido(s)
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Analítico INDEPENDENTE do operador ───────────────────────────────────
// Carrega seus próprios dados — não depende de estado externo

interface AnaliticoOperadorProps {
  operadorId:   string;
  operadorNome: string;
  onFechar:     () => void;
}

function AnaliticoOperador({ operadorId, operadorNome, onFechar }: AnaliticoOperadorProps) {
  const [acordos,       setAcordos]       = useState<Acordo[]>([]);
  const [loadingLocal,  setLoadingLocal]  = useState(true);
  const [erroLocal,     setErroLocal]     = useState<string | null>(null);
  const [filtroStatus,  setFiltroStatus]  = useState('');

  const carregarAcordos = useCallback(async () => {
    setLoadingLocal(true);
    setErroLocal(null);
    try {
      const { data, error } = await supabase
        .from('acordos')
        .select('*')
        .eq('operador_id', operadorId)
        .order('vencimento', { ascending: true });

      if (error) throw new Error(error.message);
      setAcordos((data as Acordo[]) || []);
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

  const abertos  = acordos.filter(a => !['pago','cancelado'].includes(a.status));
  const pagos    = acordos.filter(a => a.status === 'pago');
  const vencidos = abertos.filter(a => a.vencimento < hoje);

  const acordosFiltrados = acordos
    .filter(a => !filtroStatus || a.status === filtroStatus)
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
                Acordos
                <Badge variant="secondary">{acordosFiltrados.length}</Badge>
              </CardTitle>
              <Select
                value={filtroStatus || 'all'}
                onValueChange={(v) => setFiltroStatus(v === 'all' ? '' : v)}
              >
                <SelectTrigger className="w-40 h-7 text-xs">
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k,v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {acordosFiltrados.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Clock className="w-8 h-8 opacity-30 mx-auto mb-2" />
                <p className="text-sm">Nenhum acordo encontrado</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/70 backdrop-blur-sm border-b border-border z-10">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">NR</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">CLIENTE</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">VENCIMENTO</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground">VALOR</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">STATUS</th>
                      <th className="px-3 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {acordosFiltrados.map((a, i) => {
                      const atrasado  = a.vencimento < hoje && !['pago','cancelado'].includes(a.status);
                      const venceHoje = a.vencimento === hoje && a.status !== 'pago';
                      return (
                        <tr
                          key={a.id}
                          className={cn(
                            'border-b border-border/50 hover:bg-accent/40 transition-colors',
                            i % 2 === 0 && 'bg-muted/10',
                            atrasado   && 'bg-destructive/5',
                            venceHoje  && 'bg-warning/5',
                          )}
                        >
                          <td className="px-3 py-2">
                            <span className="font-mono font-bold text-primary text-[11px] bg-primary/8 px-1.5 py-0.5 rounded border border-primary/20">
                              <Hash className="w-2.5 h-2.5 inline mr-0.5" />{a.nr_cliente}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-medium text-foreground max-w-[150px] truncate">{a.nome_cliente}</td>
                          <td className="px-3 py-2">
                            <span className={cn('font-mono text-[11px]', atrasado && 'text-destructive font-bold', venceHoje && 'text-warning font-bold')}>
                              {formatDate(a.vencimento)}
                            </span>
                            {venceHoje && <Badge className="ml-1 text-[9px] h-3.5 px-1 bg-warning/20 text-warning border-0">Hoje</Badge>}
                            {atrasado  && <Badge className="ml-1 text-[9px] h-3.5 px-1 bg-destructive/20 text-destructive border-0">Atrasado</Badge>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold">{formatBRL(a.valor)}</td>
                          <td className="px-3 py-2">
                            <span className={cn('inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium border', STATUS_COLORS[a.status] ?? 'bg-muted text-muted-foreground border-border')}>
                              {STATUS_LABELS[a.status] ?? a.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <Button asChild variant="ghost" size="icon" className="w-6 h-6">
                              <Link to={`/acordos/${a.id}`}><ArrowRight className="w-3 h-3" /></Link>
                            </Button>
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

// ─── Analítico consolidado do setor ──────────────────────────────────────

function AnaliticoSetor({ resumos }: { resumos: OperadorResumo[] }) {
  const totalAberto   = sumSafe(resumos.map(r => r.valorAberto));
  const totalPago     = sumSafe(resumos.map(r => r.valorPago));
  const totalVencidos = resumos.reduce((s, r) => s + r.vencidos, 0);
  const totalAbertos  = resumos.reduce((s, r) => s + r.abertos, 0);
  const vencendoHoje  = resumos.reduce((s, r) => s + r.vencendoHoje, 0);

  const d = new Date();
  const fimMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];

  const chartData = resumos.map(r => ({
    name:        r.perfil.nome.split(' ')[0],
    'Em aberto': safeNum(r.valorAberto),
    'Recebido':  safeNum(r.valorPago),
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Em aberto/carteira', value: formatBRL(totalAberto),  icon: DollarSign,    cls: 'bg-primary/10 text-primary',         big: true },
          { label: 'Total recebido',     value: formatBRL(totalPago),    icon: CheckCircle2,  cls: 'bg-success/10 text-success',         big: true },
          { label: 'Qtd em aberto',      value: String(totalAbertos),    icon: Clock,         cls: 'bg-warning/10 text-warning',         big: false },
          { label: 'Vencidos',           value: String(totalVencidos),   icon: AlertTriangle, cls: 'bg-destructive/10 text-destructive', big: false },
          { label: 'Vencem hoje',        value: String(vencendoHoje),    icon: Calendar,      cls: 'bg-warning/10 text-warning',         big: false },
        ].map(({ label, value, icon: Icon, cls, big }) => (
          <Card key={label} className="border-border">
            <CardContent className="p-3">
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center mb-2', cls)}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <p className={cn('font-bold font-mono text-foreground', big ? 'text-sm' : 'text-xl')}>{value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {chartData.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Em aberto vs Recebido por operador
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barSize={22}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Bar dataKey="Recebido"   fill="hsl(var(--chart-2))" radius={[3,3,0,0]} />
                <Bar dataKey="Em aberto"  fill="hsl(var(--chart-4))" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="w-4 h-4 text-warning" />
            Ranking — até {formatDate(fimMes)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {resumos.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground py-4">Nenhum operador</p>
          ) : (
            [...resumos]
              .sort((a, b) => b.valorAberto - a.valorAberto)
              .map((r, i) => {
                const total = r.valorPago + r.valorAberto;
                const perc  = pct(r.valorPago, total);
                return (
                  <div key={r.perfil.id} className="flex items-center gap-3">
                    <span className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                      i === 0 ? 'bg-warning text-white' : 'bg-muted text-muted-foreground'
                    )}>{i+1}</span>
                    <p className="text-xs font-medium text-foreground w-28 truncate flex-shrink-0">
                      {r.perfil.nome.split(' ')[0]}
                    </p>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-success rounded-full" style={{ width: `${perc}%` }} />
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-mono font-bold text-primary">{formatBRL(r.valorAberto)}</p>
                      <p className="text-[10px] text-muted-foreground">{perc}% pago</p>
                    </div>
                  </div>
                );
              })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────

type Aba = 'equipe' | 'analitico';

interface OperadorInfo { id: string; nome: string; perfil: Perfil; }

export default function PainelLider() {
  const { perfil } = useAuth();

  const [operadores,          setOperadores]          = useState<Perfil[]>([]);
  const [acordosPorOperador,  setAcordosPorOperador]  = useState<Record<string, Acordo[]>>({});
  const [loading,             setLoading]             = useState(true);
  const [erro,                setErro]                = useState<string | null>(null);
  const [opSel,               setOpSel]               = useState<OperadorInfo | null>(null);
  const [aba,                 setAba]                 = useState<Aba>('equipe');

  const carregarDados = useCallback(async () => {
    if (!perfil) return;
    setLoading(true);
    setErro(null);

    try {
      // 1. Buscar operadores (filtrado por setor se for líder)
      let q = supabase
        .from('perfis')
        .select('*, setores(id, nome)')
        .eq('perfil', 'operador')
        .eq('ativo', true);

      if (perfil.perfil === 'lider' && perfil.setor_id) {
        q = q.eq('setor_id', perfil.setor_id);
      }

      const { data: ops, error: opsErr } = await q.order('nome');
      if (opsErr) throw new Error(`Operadores: ${opsErr.message}`);

      const listaOps = (ops as Perfil[]) || [];
      setOperadores(listaOps);

      if (listaOps.length === 0) { setLoading(false); return; }

      // 2. Buscar acordos de todos os operadores de uma vez
      const ids = listaOps.map(o => o.id);
      const { data: acData, error: acErr } = await supabase
        .from('acordos')
        .select('id, nome_cliente, nr_cliente, vencimento, valor, status, tipo, operador_id, setor_id, parcelas, whatsapp, observacoes, data_cadastro, criado_em, atualizado_em')
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
  }, [perfil?.id, perfil?.perfil, perfil?.setor_id]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Resumos para os cards e analítico do setor
  const resumos = useMemo<OperadorResumo[]>(() =>
    operadores.map(op => buildResumo(op, acordosPorOperador[op.id] ?? [])),
    [operadores, acordosPorOperador]
  );

  function selecionarOperador(op: Perfil) {
    if (opSel?.id === op.id) {
      setOpSel(null);
    } else {
      setOpSel({ id: op.id, nome: op.nome, perfil: op });
    }
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
        </div>
        <Button variant="outline" size="sm" onClick={carregarDados}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Atualizar
        </Button>
      </div>

      {/* Abas */}
      <div className="flex gap-1 p-1 bg-muted/40 rounded-xl mb-5 w-fit">
        {([
          { key: 'equipe',    label: 'Minha Equipe',     icon: Users },
          { key: 'analitico', label: 'Analítico do Setor', icon: BarChart3 },
        ] as { key: Aba; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setAba(key); if (key === 'analitico') setOpSel(null); }}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              aba === key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Aba: Equipe */}
      {aba === 'equipe' && (
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
            {/* Coluna esquerda: cards dos operadores */}
            <div className="space-y-3">
              {resumos.map(resumo => (
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

      {/* Aba: Analítico do setor */}
      {aba === 'analitico' && (
        resumos.length === 0 ? (
          <Card className="border-border">
            <CardContent className="p-10 text-center text-muted-foreground">
              <TrendingUp className="w-10 h-10 opacity-30 mx-auto mb-3" />
              <p className="font-medium">Sem dados para exibir</p>
              <p className="text-xs mt-1">Adicione operadores ao setor para visualizar o analítico.</p>
            </CardContent>
          </Card>
        ) : (
          <AnaliticoSetor resumos={resumos} />
        )
      )}
    </div>
  );
}
