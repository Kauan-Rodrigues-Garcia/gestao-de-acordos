/**
 * pages/Acordos/PixAutomatico.tsx — aba destacada "Pix Automático" (BookPlay)
 * ─────────────────────────────────────────────────────────────────────────
 * Acompanhamento de comissão de acordos fechados no Pix automático, SEM
 * vínculo com a tabela `acordos`.
 *
 * Operador: registra NR + valor (nasce pendente), vê os próprios registros e
 * a comissão por linha + totais pendente/aprovado. Pode limpar desaprovados.
 * Líder+: vê tudo, filtra por operador/equipe, aprova/desaprova cada linha e
 * configura o % de comissão do próprio setor (padrão 0,25%).
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Zap, Plus, RefreshCw, Search, X, Check, XCircle, Trash2, Undo2,
  Clock, CheckCircle2, Percent, Hash, DollarSign, User, Layers, Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { supabase } from '@/lib/supabase';
import { formatCurrency, parseCurrencyInput, isPerfilAdminOuLider } from '@/lib/index';
import { cn } from '@/lib/utils';
import {
  PixAutoAcordo, PixAutoStatus, PIX_AUTO_PCT_PADRAO,
  fetchAcordosPix, criarAcordoPix, avaliarAcordoPix, reavaliarAcordoPix,
  excluirAcordoPix, limparDesaprovados, fetchConfigsPix, upsertConfigPix,
  comissaoDe,
} from '@/services/pix_automatico.service';

const STATUS_INFO: Record<PixAutoStatus, { label: string; cls: string }> = {
  pendente:    { label: 'Pendente',    cls: 'bg-sky-500/10 text-sky-500 border-sky-500/30' },
  aprovado:    { label: 'Aprovado',    cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
  desaprovado: { label: 'Desaprovado', cls: 'bg-red-500/10 text-red-500 border-red-500/30' },
};

function fmtPct(pct: number): string {
  return `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
}

interface OperadorInfo { id: string; nome: string; equipe_id: string | null; setor_id: string | null; }

export function PixAutomatico() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();

  const ehLider = isPerfilAdminOuLider(perfil?.perfil ?? '');

  const [itens, setItens]           = useState<PixAutoAcordo[]>([]);
  const [pctPorSetor, setPctPorSetor] = useState<Record<string, number>>({});
  const [operadores, setOperadores] = useState<OperadorInfo[]>([]);
  const [equipes, setEquipes]       = useState<{ id: string; nome: string }[]>([]);
  const [loading, setLoading]       = useState(true);

  // Form de registro
  const [nrNovo, setNrNovo]       = useState('');
  const [valorNovo, setValorNovo] = useState('');
  const [salvando, setSalvando]   = useState(false);

  // Filtros (líder)
  const [busca, setBusca]                   = useState('');
  const [filtroStatus, setFiltroStatus]     = useState<'todos' | PixAutoStatus>('todos');
  const [filtroOperador, setFiltroOperador] = useState('');
  const [filtroEquipe, setFiltroEquipe]     = useState('');

  // Config % (líder)
  const [pctInput, setPctInput]     = useState('');
  const [salvandoPct, setSalvandoPct] = useState(false);
  const [avaliandoId, setAvaliandoId] = useState<string | null>(null);
  const [limpando, setLimpando]       = useState(false);

  const setorDoLider = perfil?.setor_id ?? null;
  const pctDoMeuSetor = setorDoLider != null
    ? (pctPorSetor[setorDoLider] ?? PIX_AUTO_PCT_PADRAO)
    : PIX_AUTO_PCT_PADRAO;

  const carregar = useCallback(async () => {
    if (!empresa?.id || !perfil?.id) return;
    setLoading(true);
    try {
      const [lista, configs] = await Promise.all([
        fetchAcordosPix(empresa.id, ehLider ? undefined : { operadorId: perfil.id }),
        fetchConfigsPix(empresa.id),
      ]);
      setItens(lista);
      const mapa: Record<string, number> = {};
      configs.forEach(c => { mapa[c.setor_id] = Number(c.pct); });
      setPctPorSetor(mapa);

      if (ehLider) {
        // Nomes/equipes para filtros e coluna Operador
        const [{ data: ops }, { data: eqs }] = await Promise.all([
          supabase.from('perfis').select('id, nome, equipe_id, setor_id')
            .eq('empresa_id', empresa.id).order('nome'),
          supabase.from('equipes').select('id, nome')
            .eq('empresa_id', empresa.id).order('nome'),
        ]);
        setOperadores(((ops ?? []) as OperadorInfo[]));
        setEquipes(((eqs ?? []) as { id: string; nome: string }[]));
      }
    } finally {
      setLoading(false);
    }
  }, [empresa?.id, perfil?.id, ehLider]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { setPctInput(String(pctDoMeuSetor).replace('.', ',')); }, [pctDoMeuSetor]);

  // ── Derivados ───────────────────────────────────────────────────────────
  const operadorEquipe = useMemo(() => {
    const m: Record<string, string | null> = {};
    operadores.forEach(o => { m[o.id] = o.equipe_id; });
    return m;
  }, [operadores]);

  const visiveis = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return itens.filter(i => {
      if (filtroStatus !== 'todos' && i.status !== filtroStatus) return false;
      if (filtroOperador && i.operador_id !== filtroOperador) return false;
      if (filtroEquipe && operadorEquipe[i.operador_id] !== filtroEquipe) return false;
      if (!b) return true;
      return i.nr_cliente.toLowerCase().includes(b) || (i.operador_nome ?? '').toLowerCase().includes(b);
    });
  }, [itens, busca, filtroStatus, filtroOperador, filtroEquipe, operadorEquipe]);

  // Totais SEMPRE sobre o conjunto visível (líder filtrando vê o recorte)
  const totais = useMemo(() => {
    const soma = (status: PixAutoStatus) => {
      const doStatus = visiveis.filter(i => i.status === status);
      return {
        qtd:      doStatus.length,
        valor:    doStatus.reduce((acc, i) => acc + Number(i.valor), 0),
        comissao: doStatus.reduce((acc, i) => acc + comissaoDe(i, pctPorSetor), 0),
      };
    };
    return { pendente: soma('pendente'), aprovado: soma('aprovado'), desaprovado: soma('desaprovado') };
  }, [visiveis, pctPorSetor]);

  const meusDesaprovados = itens.filter(i => i.operador_id === perfil?.id && i.status === 'desaprovado').length;

  // ── Ações ───────────────────────────────────────────────────────────────
  async function registrar() {
    if (!empresa?.id || !perfil?.id) return;
    const nr = nrNovo.trim();
    const valor = parseCurrencyInput(valorNovo);
    if (!nr) { toast.error('Informe o NR do acordo'); return; }
    if (isNaN(valor) || valor <= 0) { toast.error('Valor inválido'); return; }
    setSalvando(true);
    try {
      const { ok, error } = await criarAcordoPix({
        empresaId:    empresa.id,
        operadorId:   perfil.id,
        operadorNome: perfil.nome ?? perfil.email ?? '—',
        setorId:      perfil.setor_id ?? null,
        nrCliente:    nr,
        valor,
      });
      if (!ok) { toast.error('Erro ao registrar: ' + error); return; }
      toast.success('Acordo Pix registrado — aguardando verificação do líder.');
      setNrNovo('');
      setValorNovo('');
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function avaliar(item: PixAutoAcordo, aprovar: boolean) {
    if (!perfil?.id) return;
    setAvaliandoId(item.id);
    try {
      const pctDaLinha = item.setor_id != null
        ? (pctPorSetor[item.setor_id] ?? PIX_AUTO_PCT_PADRAO)
        : PIX_AUTO_PCT_PADRAO;
      const { ok, error } = await avaliarAcordoPix({
        id: item.id,
        aprovar,
        pctAtual: pctDaLinha,
        avaliadorId: perfil.id,
        avaliadorNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) { toast.error('Erro ao avaliar: ' + error); return; }
      toast.success(aprovar ? 'Acordo aprovado!' : 'Acordo desaprovado.');
      await carregar();
    } finally {
      setAvaliandoId(null);
    }
  }

  async function voltarPendente(item: PixAutoAcordo) {
    setAvaliandoId(item.id);
    try {
      const { ok, error } = await reavaliarAcordoPix(item.id);
      if (!ok) { toast.error('Erro: ' + error); return; }
      toast.success('Acordo voltou para pendente.');
      await carregar();
    } finally {
      setAvaliandoId(null);
    }
  }

  async function excluir(item: PixAutoAcordo) {
    const { ok, error } = await excluirAcordoPix(item.id);
    if (!ok) { toast.error('Erro ao excluir: ' + error); return; }
    toast.success('Registro excluído.');
    await carregar();
  }

  async function limparMeusDesaprovados() {
    if (!empresa?.id || !perfil?.id) return;
    setLimpando(true);
    try {
      const { ok, count, error } = await limparDesaprovados(empresa.id, perfil.id);
      if (!ok) { toast.error('Erro ao limpar: ' + error); return; }
      toast.success(`${count} registro${count !== 1 ? 's' : ''} desaprovado${count !== 1 ? 's' : ''} removido${count !== 1 ? 's' : ''}.`);
      await carregar();
    } finally {
      setLimpando(false);
    }
  }

  async function salvarPct() {
    if (!empresa?.id || !perfil?.id || !setorDoLider) return;
    const pct = parseFloat(pctInput.replace(',', '.'));
    if (isNaN(pct) || pct < 0 || pct > 100) { toast.error('Percentual inválido (0 a 100)'); return; }
    setSalvandoPct(true);
    try {
      const { ok, error } = await upsertConfigPix({
        empresaId: empresa.id,
        setorId: setorDoLider,
        pct,
        atualizadoPor: perfil.id,
        atualizadoPorNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) { toast.error('Erro ao salvar percentual: ' + error); return; }
      toast.success(`Percentual do setor atualizado para ${fmtPct(pct)}. Vale para novas aprovações.`);
      await carregar();
    } finally {
      setSalvandoPct(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const statsCards = [
    {
      label: 'Pendente', qtd: totais.pendente.qtd,
      valor: totais.pendente.valor, comissao: totais.pendente.comissao,
      cls: 'from-sky-500/15 to-sky-600/5 border-sky-500/25', icon: <Clock className="w-4 h-4 text-sky-400" />,
      comissaoCls: 'text-sky-400',
    },
    {
      label: 'Aprovado', qtd: totais.aprovado.qtd,
      valor: totais.aprovado.valor, comissao: totais.aprovado.comissao,
      cls: 'from-emerald-500/15 to-emerald-600/5 border-emerald-500/25', icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
      comissaoCls: 'text-emerald-400',
    },
  ];

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho da aba ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 border border-violet-500/25 flex items-center justify-center">
            <Zap className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground leading-tight">Pix Automático</h2>
            <p className="text-[11px] text-muted-foreground">
              Comissão de {fmtPct(pctDoMeuSetor)} por acordo aprovado — sem vínculo com a lista de acordos.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={carregar} disabled={loading}
            className="gap-1.5 h-8 text-xs rounded-lg">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Atualizar
          </Button>
          {meusDesaprovados > 0 && (
            <Button variant="ghost" size="sm" onClick={limparMeusDesaprovados} disabled={limpando}
              className="gap-1.5 h-8 text-xs rounded-lg text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 hover:text-red-300">
              <Trash2 className="w-3.5 h-3.5" />
              {limpando ? 'Limpando...' : `Limpar desaprovados (${meusDesaprovados})`}
            </Button>
          )}
        </div>
      </div>

      {/* ── Registrar novo ── */}
      <Card className="border-violet-500/20 bg-violet-500/[0.03]">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="space-y-1 flex-1 max-w-[220px]">
              <Label className="text-xs font-medium flex items-center gap-1"><Hash className="w-3 h-3" /> NR do acordo *</Label>
              <Input value={nrNovo} onChange={e => setNrNovo(e.target.value)}
                placeholder="NR" className="h-9 text-sm font-mono" />
            </div>
            <div className="space-y-1 flex-1 max-w-[220px]">
              <Label className="text-xs font-medium flex items-center gap-1"><DollarSign className="w-3 h-3" /> Valor total do acordo *</Label>
              <Input value={valorNovo} onChange={e => setValorNovo(e.target.value)}
                placeholder="0,00" className="h-9 text-sm font-mono"
                onKeyDown={e => { if (e.key === 'Enter') registrar(); }} />
            </div>
            {valorNovo && !isNaN(parseCurrencyInput(valorNovo)) && parseCurrencyInput(valorNovo) > 0 && (
              <p className="text-[11px] text-muted-foreground pb-2.5">
                Comissão estimada:{' '}
                <span className="font-mono font-semibold text-violet-400">
                  {formatCurrency(Math.round(parseCurrencyInput(valorNovo) * pctDoMeuSetor) / 100)}
                </span>
              </p>
            )}
            <Button size="sm" onClick={registrar} disabled={salvando}
              className="h-9 gap-1.5 text-xs sm:ml-auto">
              {salvando ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Registrar Acordo Pix
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Todo registro entra como <strong>verificação pendente</strong> — o líder aprova ou desaprova.
          </p>
        </CardContent>
      </Card>

      {/* ── Totais pendente × aprovado ── */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {statsCards.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}>
              <div className={cn('rounded-xl border bg-gradient-to-br p-4 flex items-center justify-between gap-3', s.cls)}>
                <div className="flex items-center gap-3">
                  {s.icon}
                  <div>
                    <p className="text-[11px] text-muted-foreground">{s.label} · {s.qtd} acordo{s.qtd !== 1 ? 's' : ''}</p>
                    <p className="text-lg font-bold font-mono text-foreground leading-tight">{formatCurrency(s.valor)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">Comissão Pix</p>
                  <p className={cn('text-lg font-bold font-mono leading-tight', s.comissaoCls)}>{formatCurrency(s.comissao)}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none" />
          <Input placeholder={ehLider ? 'Buscar por NR ou operador...' : 'Buscar por NR...'}
            value={busca} onChange={e => setBusca(e.target.value)}
            className="pl-9 pr-8 h-9 text-sm rounded-lg" />
          {busca && (
            <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setBusca('')}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Select value={filtroStatus} onValueChange={v => setFiltroStatus(v as typeof filtroStatus)}>
          <SelectTrigger className="h-9 w-36 text-xs rounded-lg"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
            <SelectItem value="aprovado">Aprovados</SelectItem>
            <SelectItem value="desaprovado">Desaprovados</SelectItem>
          </SelectContent>
        </Select>
        {ehLider && (
          <>
            <Select value={filtroEquipe || '__todas__'}
              onValueChange={v => setFiltroEquipe(v === '__todas__' ? '' : v)}>
              <SelectTrigger className="h-9 w-40 text-xs rounded-lg">
                <Layers className="w-3 h-3 mr-1 shrink-0" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__todas__">Todas as equipes</SelectItem>
                {equipes.map(eq => <SelectItem key={eq.id} value={eq.id}>{eq.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroOperador || '__todos__'}
              onValueChange={v => setFiltroOperador(v === '__todos__' ? '' : v)}>
              <SelectTrigger className="h-9 w-44 text-xs rounded-lg">
                <User className="w-3 h-3 mr-1 shrink-0" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__todos__">Todos os operadores</SelectItem>
                {operadores.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        )}

        {/* Config % do setor (líder) */}
        {ehLider && setorDoLider && (
          <div className="flex items-center gap-1.5 sm:ml-auto rounded-lg border border-border bg-card px-2.5 py-1.5">
            <Percent className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span className="text-[11px] text-muted-foreground shrink-0">% do setor:</span>
            <Input value={pctInput} onChange={e => setPctInput(e.target.value)}
              className="h-7 w-16 text-xs text-center font-mono" />
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-violet-400 hover:text-violet-300"
              onClick={salvarPct} disabled={salvandoPct} title="Salvar percentual do setor">
              {salvandoPct ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            </Button>
          </div>
        )}
      </div>

      {/* ── Tabela ── */}
      <Card className="border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-5 space-y-2.5">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}
            </div>
          ) : visiveis.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Zap className="w-8 h-8 opacity-20" />
              <p className="text-sm">
                {itens.length === 0 ? 'Nenhum acordo Pix registrado ainda.' : 'Nenhum resultado para os filtros.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/20">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">NR</th>
                    {ehLider && <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Operador</th>}
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Valor</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Comissão Pix</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Registrado em</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((item, i) => {
                    const comissao = comissaoDe(item, pctPorSetor);
                    const pctLinha = item.status === 'aprovado' && item.pct_comissao != null
                      ? Number(item.pct_comissao)
                      : (item.setor_id != null ? (pctPorSetor[item.setor_id] ?? PIX_AUTO_PCT_PADRAO) : PIX_AUTO_PCT_PADRAO);
                    const sInfo = STATUS_INFO[item.status];
                    const desaprovado = item.status === 'desaprovado';
                    return (
                      <motion.tr key={item.id}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.02, 0.3), duration: 0.25 }}
                        className={cn(
                          'border-b border-border/30 group transition-colors hover:bg-accent/20',
                          desaprovado && 'opacity-60',
                        )}>
                        <td className="px-4 py-3 font-mono font-bold text-foreground">{item.nr_cliente}</td>
                        {ehLider && (
                          <td className="px-4 py-3 text-foreground/80 max-w-[160px]">
                            <span className="truncate block">{item.operador_nome ?? '—'}</span>
                          </td>
                        )}
                        <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                          {formatCurrency(item.valor)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn('font-mono font-bold', desaprovado ? 'text-muted-foreground line-through' : 'text-violet-400')}>
                            {formatCurrency(comissao)}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-1">({fmtPct(pctLinha)})</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={cn('text-[10px] font-semibold', sInfo.cls)}>{sInfo.label}</Badge>
                          {item.status !== 'pendente' && item.avaliado_por_nome && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">por {item.avaliado_por_nome}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {new Date(item.criado_em).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {ehLider && item.status === 'pendente' && (
                              <>
                                <button title="Aprovar" disabled={avaliandoId === item.id}
                                  onClick={() => avaliar(item, true)}
                                  className="h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50">
                                  <Check className="w-3 h-3" /> Aprovar
                                </button>
                                <button title="Desaprovar" disabled={avaliandoId === item.id}
                                  onClick={() => avaliar(item, false)}
                                  className="h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50">
                                  <XCircle className="w-3 h-3" /> Desaprovar
                                </button>
                              </>
                            )}
                            {ehLider && item.status !== 'pendente' && (
                              <button title="Voltar para pendente" disabled={avaliandoId === item.id}
                                onClick={() => voltarPendente(item)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60 disabled:opacity-50">
                                <Undo2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {(ehLider || (desaprovado && item.operador_id === perfil?.id)) && (
                              <button title="Excluir registro" onClick={() => excluir(item)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
