/**
 * AnaliticoLider — visão líder/gerência/admin
 *
 * Carrega apenas resumos agregados por operador na abertura (1 query RPC).
 * As linhas individuais de cada operador só são buscadas quando o card
 * correspondente é expandido (lazy loading sob demanda).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Upload, Users, Trophy, AlertCircle, ChevronDown, ChevronRight,
  Trash2, Loader2, Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import {
  buscarResumoOperadoresAnalitico,
  buscarAnalitico,
  buscarDestaquesDoMes,
  removerLinhaAnalitico,
  removerOrfaosDoMes,
  type ResumoOperadorAnalitico,
  type DestaqueDiaAnalitico,
} from '@/services/analitico/analitico.service';
import { toast } from 'sonner';
import { TabulacaoCell } from './TabulacaoCell';
import { ImportarModal } from './ImportarModal';
import { useAnaliticoImport } from '@/hooks/useAnaliticoImport';

const ORFAOS_PAGE = 100;

interface AnaliticoLiderProps {
  empresaId: string;
  mes: string;                  // 'yyyy-MM'
  temPermissaoImportar: boolean;
  operadorId: string;           // ID do líder logado (para TabulacaoCell)
  operadorNome: string;
  liderId?: string | null;
  onAbrirNovoAcordo: (dados: {
    instituicao: string;
    nomeCliente: string;
    forma: 'boleto_pix' | 'cartao';
    valor: number;
  }) => void;
  onVerAcordo: (acordoId: string) => void;
  onRefetch: () => void;
}

export function AnaliticoLider({
  empresaId, mes, temPermissaoImportar,
  operadorId, operadorNome, liderId,
  onAbrirNovoAcordo, onVerAcordo, onRefetch,
}: AnaliticoLiderProps) {
  const importHook = useAnaliticoImport();

  const [modalImportar, setModalImportar] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<'operadores' | 'ranking' | 'destaques' | 'orfaos'>('operadores');

  // ── Resumos ───────────────────────────────────────────────────────────────
  const [resumos,        setResumos]        = useState<ResumoOperadorAnalitico[]>([]);
  const [loadingResumos, setLoadingResumos] = useState(true);

  // ── Linhas expandidas (lazy) ──────────────────────────────────────────────
  const [expandidos,    setExpandidos]    = useState<Set<string>>(new Set());
  const [linhasMap,     setLinhasMap]     = useState<Map<string, AnaliticoRecebimento[]>>(new Map());
  const [loadingLinhas, setLoadingLinhas] = useState<Set<string>>(new Set());

  // ── Órfãos ────────────────────────────────────────────────────────────────
  const [orfaos,          setOrfaos]          = useState<AnaliticoRecebimento[]>([]);
  const [loadingOrfaos,   setLoadingOrfaos]   = useState(false);
  const [orfaosVisiveis,  setOrfaosVisiveis]  = useState(ORFAOS_PAGE);
  const [removendoId,     setRemovendoId]     = useState<string | null>(null);
  const [removendoTodos,  setRemovendoTodos]  = useState(false);

  // ── Destaques do dia ──────────────────────────────────────────────────────
  const [destaques,        setDestaques]        = useState<DestaqueDiaAnalitico[]>([]);
  const [loadingDestaques, setLoadingDestaques] = useState(false);

  const carregarResumos = useCallback(async () => {
    if (!empresaId || !mes) return;
    setLoadingResumos(true);
    setExpandidos(new Set());
    setLinhasMap(new Map());

    const { data, error } = await buscarResumoOperadoresAnalitico(empresaId, mes);
    if (error) toast.error(`Erro ao carregar resumo: ${error}`);
    setResumos(data);
    setLoadingResumos(false);
  }, [empresaId, mes]);

  const carregarOrfaos = useCallback(async () => {
    if (!empresaId || !mes) return;
    setLoadingOrfaos(true);
    setOrfaosVisiveis(ORFAOS_PAGE);
    const { data } = await buscarAnalitico({ empresaId, mes, operadorId: null });
    setOrfaos(data);
    setLoadingOrfaos(false);
  }, [empresaId, mes]);

  const carregarDestaques = useCallback(async () => {
    if (!empresaId || !mes) return;
    setLoadingDestaques(true);
    const { data, error } = await buscarDestaquesDoMes(empresaId, mes);
    if (error) toast.error(`Erro ao carregar destaques: ${error}`);
    setDestaques(data);
    setLoadingDestaques(false);
  }, [empresaId, mes]);

  useEffect(() => { void carregarResumos(); }, [carregarResumos]);

  useEffect(() => {
    if (abaAtiva === 'orfaos')     void carregarOrfaos();
    if (abaAtiva === 'destaques')  void carregarDestaques();
  }, [abaAtiva, carregarOrfaos, carregarDestaques]);

  async function toggleExpandido(opId: string) {
    const jáAberto = expandidos.has(opId);
    setExpandidos(prev => {
      const next = new Set(prev);
      jáAberto ? next.delete(opId) : next.add(opId);
      return next;
    });

    if (!jáAberto && !linhasMap.has(opId)) {
      setLoadingLinhas(prev => new Set(prev).add(opId));
      const { data } = await buscarAnalitico({ empresaId, mes, operadorId: opId });
      setLinhasMap(prev => new Map(prev).set(opId, data));
      setLoadingLinhas(prev => { const s = new Set(prev); s.delete(opId); return s; });
    }
  }

  async function removerOrfao(id: string) {
    setRemovendoId(id);
    const { error } = await removerLinhaAnalitico(id);
    if (error) toast.error(`Erro ao remover: ${error}`);
    else {
      toast.success('Linha removida.');
      setOrfaos(prev => prev.filter(o => o.id !== id));
      onRefetch();
    }
    setRemovendoId(null);
  }

  async function removerTodosOrfaos() {
    setRemovendoTodos(true);
    const { error } = await removerOrfaosDoMes(empresaId, mes);
    if (error) toast.error(`Erro ao remover: ${error}`);
    else {
      toast.success('Todos os registros sem operador foram removidos.');
      setOrfaos([]);
      onRefetch();
    }
    setRemovendoTodos(false);
  }

  function handlePosImport() {
    setModalImportar(false);
    if (importHook.estado === 'done') {
      void carregarResumos();
      void carregarOrfaos();
      void carregarDestaques();
      onRefetch();
    }
  }

  // ── Helpers de exibição dos destaques ─────────────────────────────────────
  const [mesAnoStr, mesNumStr] = mes.split('-');
  const diasNoMes = new Date(Number(mesAnoStr), Number(mesNumStr), 0).getDate();
  const hojeISO = new Date().toISOString().split('T')[0];

  // Mapa dia → destaque para lookup rápido
  const destaquesMap = new Map(destaques.map(d => [d.dia, d]));

  const DIAS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const MESES_PT = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
  ];

  function diaLabel(diaStr: string) {
    const d = new Date(diaStr + 'T12:00:00');
    return DIAS_PT[d.getDay()];
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 border-b border-border">
          {([
            { key: 'operadores', label: 'Por operador',    Icon: Users },
            { key: 'ranking',    label: 'Ranking',         Icon: Trophy },
            { key: 'destaques',  label: 'Destaques do dia', Icon: Star },
            { key: 'orfaos',     label: 'Sem operador',    Icon: AlertCircle },
          ] as const).map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setAbaAtiva(key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                abaAtiva === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {temPermissaoImportar && (
          <Button size="sm" className="gap-1.5" onClick={() => setModalImportar(true)}>
            <Upload className="w-4 h-4" /> Importar relatório
          </Button>
        )}
      </div>

      {/* ── Aba: Por operador ─────────────────────────────────────────────── */}
      {abaAtiva === 'operadores' && (
        <div className="space-y-3">
          {loadingResumos && (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 bg-muted rounded-lg" />
              ))}
            </div>
          )}

          {!loadingResumos && resumos.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Nenhum dado para este mês.</p>
            </div>
          )}

          {!loadingResumos && resumos.map(r => {
            const aberto     = expandidos.has(r.operador_id);
            const carregando = loadingLinhas.has(r.operador_id);
            const linhas     = linhasMap.get(r.operador_id) ?? [];

            return (
              <Card key={r.operador_id} className="border-border">
                <CardHeader
                  className="p-3 cursor-pointer select-none"
                  onClick={() => void toggleExpandido(r.operador_id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {carregando
                        ? <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                        : aberto
                          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      }
                      <div>
                        <CardTitle className="text-sm">
                          {r.operador_nome ?? r.operador_usuario}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground font-mono">
                          {r.operador_usuario}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <p className="text-sm font-bold text-primary">{formatBRL(r.total_recebido)}</p>
                        <p className="text-xs text-muted-foreground">recebido</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{formatBRL(r.total_ho)}</p>
                        <p className="text-xs text-muted-foreground">HO</p>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {r.total_pagamentos} pgto.
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                {aberto && (
                  <CardContent className="p-0 border-t">
                    {carregando ? (
                      <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" /> Carregando pagamentos…
                      </div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/30">
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">CÓDIGO</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">FORMA</th>
                            <th className="text-right px-3 py-2 font-semibold text-muted-foreground">RECEBIDO</th>
                            <th className="text-right px-3 py-2 font-semibold text-muted-foreground">HO</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">DATA</th>
                            <th className="text-right px-3 py-2 font-semibold text-muted-foreground">AÇÃO</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {linhas.map(linha => (
                            <tr key={linha.id} className="hover:bg-muted/20">
                              <td className="px-3 py-2">
                                <span className="font-semibold">{linha.codigo}</span>
                                {linha.nome_cliente && (
                                  <span className="block text-muted-foreground truncate max-w-[120px]">
                                    {linha.nome_cliente}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className={
                                  linha.forma_pagamento === 'cartao'
                                    ? 'text-xs border-purple-300 text-purple-700'
                                    : 'text-xs border-blue-300 text-blue-700'
                                }>
                                  {linha.forma_pagamento === 'cartao' ? 'Cartão' : 'Boleto/Pix'}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-right font-mono">{formatBRL(linha.valor_recebido)}</td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatBRL(linha.total_ho)}</td>
                              <td className="px-3 py-2 tabular-nums">
                                {new Date(linha.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <TabulacaoCell
                                  linha={linha}
                                  empresaId={empresaId}
                                  operadorId={r.operador_id}
                                  operadorNome={r.operador_nome ?? r.operador_usuario}
                                  liderId={liderId}
                                  onAbrirNovoAcordo={onAbrirNovoAcordo}
                                  onVerAcordo={onVerAcordo}
                                  onRefetch={onRefetch}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Aba: Ranking ─────────────────────────────────────────────────── */}
      {abaAtiva === 'ranking' && (
        <Card className="border-border">
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-3 font-semibold text-muted-foreground">#</th>
                  <th className="text-left px-3 py-3 font-semibold text-muted-foreground">OPERADOR</th>
                  <th className="text-right px-3 py-3 font-semibold text-muted-foreground">RECEBIDO</th>
                  <th className="text-right px-3 py-3 font-semibold text-muted-foreground">TOTAL HO</th>
                  <th className="text-right px-3 py-3 font-semibold text-muted-foreground">PGTOS.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loadingResumos
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={5} className="px-3 py-2">
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </td>
                      </tr>
                    ))
                  : resumos.map((r, idx) => (
                      <tr key={r.operador_id} className={cn(
                        'hover:bg-muted/30',
                        idx === 0 && 'bg-yellow-50/50 dark:bg-yellow-950/10',
                      )}>
                        <td className="px-3 py-2.5 font-bold text-muted-foreground">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-medium">{r.operador_nome ?? r.operador_usuario}</span>
                          <span className="block text-muted-foreground font-mono">{r.operador_usuario}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-primary">
                          {formatBRL(r.total_recebido)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                          {formatBRL(r.total_ho)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Badge variant="outline">{r.total_pagamentos}</Badge>
                        </td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Aba: Destaques do dia ─────────────────────────────────────────── */}
      {abaAtiva === 'destaques' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              {MESES_PT[Number(mesNumStr) - 1]} de {mesAnoStr}
            </p>
            <p className="text-xs text-muted-foreground">Destaque de recebimento por dia</p>
          </div>

          {loadingDestaques && (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 bg-muted rounded-lg" />
              ))}
            </div>
          )}

          {!loadingDestaques && (
            <div className="space-y-2">
              {Array.from({ length: diasNoMes }, (_, i) => {
                const d = i + 1;
                const diaStr = `${mes}-${String(d).padStart(2, '0')}`;
                const destaque = destaquesMap.get(diaStr);
                const isHoje = diaStr === hojeISO;
                const isFuturo = diaStr > hojeISO;

                return (
                  <div
                    key={diaStr}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border px-4 py-3',
                      isHoje && 'border-primary/40 bg-primary/5',
                      !isHoje && !isFuturo && destaque && 'border-border bg-card',
                      isFuturo && 'border-border/50 bg-muted/20 opacity-50',
                      !destaque && !isFuturo && 'border-border/50 bg-muted/10',
                    )}
                  >
                    {/* Data */}
                    <div className="text-center shrink-0 w-10">
                      <p className={cn(
                        'text-lg font-bold leading-none',
                        isHoje ? 'text-primary' : 'text-foreground',
                      )}>
                        {String(d).padStart(2, '0')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {diaLabel(diaStr)}
                      </p>
                    </div>

                    {/* Separador */}
                    <div className={cn(
                      'w-px self-stretch',
                      isHoje ? 'bg-primary/30' : 'bg-border',
                    )} />

                    {/* Destaque ou vazio */}
                    {destaque ? (
                      <>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Star className="w-3.5 h-3.5 text-amber-500 shrink-0 fill-amber-400" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {destaque.operador_nome ?? destaque.operador_usuario}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">
                              destaque do dia
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-primary font-mono">
                            {formatBRL(destaque.total_recebido)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {destaque.total_pagamentos} pgto{destaque.total_pagamentos !== 1 ? 's' : ''}.
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground italic flex-1">
                        {isFuturo ? '—' : 'Sem recebimentos'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Aba: Sem operador (órfãos) ───────────────────────────────────── */}
      {abaAtiva === 'orfaos' && (
        <div className="space-y-3">
          {loadingOrfaos && (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded-lg" />
              ))}
            </div>
          )}

          {!loadingOrfaos && orfaos.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Nenhuma linha sem operador. ✓</p>
            </div>
          )}

          {!loadingOrfaos && orfaos.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {orfaos.length} linha{orfaos.length !== 1 ? 's' : ''} não vinculada{orfaos.length !== 1 ? 's' : ''} a nenhum operador.
                </p>
                <Button
                  size="sm" variant="destructive"
                  className="gap-1.5 h-7 text-xs"
                  onClick={() => void removerTodosOrfaos()}
                  disabled={removendoTodos}
                >
                  {removendoTodos
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Trash2 className="w-3 h-3" />
                  }
                  Remover todos
                </Button>
              </div>

              <Card className="border-border">
                <CardContent className="p-0">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">COBRADORA</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">CÓDIGO</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">FORMA</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">RECEBIDO</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">DATA</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">REMOVER</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {orfaos.slice(0, orfaosVisiveis).map(linha => (
                        <tr key={linha.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-mono text-amber-600">{linha.operador_usuario}</td>
                          <td className="px-3 py-2 font-semibold">{linha.codigo}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className={
                              linha.forma_pagamento === 'cartao'
                                ? 'text-xs border-purple-300 text-purple-700'
                                : 'text-xs border-blue-300 text-blue-700'
                            }>
                              {linha.forma_pagamento === 'cartao' ? 'Cartão' : 'Boleto/Pix'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{formatBRL(linha.valor_recebido)}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {new Date(linha.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                              onClick={() => void removerOrfao(linha.id)}
                              disabled={removendoId === linha.id}
                            >
                              {removendoId === linha.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />
                              }
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {orfaosVisiveis < orfaos.length && (
                <div className="flex justify-center pt-1">
                  <Button
                    variant="outline" size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => setOrfaosVisiveis(prev => prev + ORFAOS_PAGE)}
                  >
                    Carregar mais ({orfaos.length - orfaosVisiveis} restantes)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <ImportarModal
        aberto={modalImportar}
        onFechar={handlePosImport}
        hook={importHook}
      />
    </div>
  );
}
