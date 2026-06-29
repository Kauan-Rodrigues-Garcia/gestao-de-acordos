/**
 * AnaliticoLider — visão líder/gerência/admin
 *
 * Carrega apenas resumos agregados por operador na abertura (1 query RPC).
 * As linhas individuais de cada operador só são buscadas quando o card
 * correspondente é expandido (lazy loading sob demanda).
 */

import { useState, useEffect, useCallback } from 'react';
import { Upload, Users, Trophy, AlertCircle, ChevronDown, ChevronRight, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import {
  buscarResumoOperadoresAnalitico,
  buscarAnalitico,
  removerLinhaAnalitico,
  type ResumoOperadorAnalitico,
} from '@/services/analitico/analitico.service';
import { toast } from 'sonner';
import { TabulacaoCell } from './TabulacaoCell';
import { ImportarModal } from './ImportarModal';
import { useAnaliticoImport } from '@/hooks/useAnaliticoImport';

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

  const [modalImportar,   setModalImportar]   = useState(false);
  const [abaAtiva,        setAbaAtiva]        = useState<'operadores' | 'ranking' | 'orfaos'>('operadores');

  // ── Resumos ───────────────────────────────────────────────────────────────
  const [resumos,         setResumos]         = useState<ResumoOperadorAnalitico[]>([]);
  const [loadingResumos,  setLoadingResumos]  = useState(true);

  // ── Linhas expandidas (lazy) ──────────────────────────────────────────────
  const [expandidos,      setExpandidos]      = useState<Set<string>>(new Set());
  const [linhasMap,       setLinhasMap]       = useState<Map<string, AnaliticoRecebimento[]>>(new Map());
  const [loadingLinhas,   setLoadingLinhas]   = useState<Set<string>>(new Set());

  // ── Órfãos ────────────────────────────────────────────────────────────────
  const [orfaos,          setOrfaos]          = useState<AnaliticoRecebimento[]>([]);
  const [loadingOrfaos,   setLoadingOrfaos]   = useState(false);
  const [removendoId,     setRemovendoId]     = useState<string | null>(null);

  // Busca resumos + órfãos sempre que empresa ou mês mudar
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
    const { data } = await buscarAnalitico({ empresaId, mes, operadorId: null });
    setOrfaos(data);
    setLoadingOrfaos(false);
  }, [empresaId, mes]);

  useEffect(() => {
    void carregarResumos();
  }, [carregarResumos]);

  useEffect(() => {
    if (abaAtiva === 'orfaos') void carregarOrfaos();
  }, [abaAtiva, carregarOrfaos]);

  // Expande/colapsa card; carrega linhas na primeira abertura
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
    else { toast.success('Linha removida.'); void carregarOrfaos(); onRefetch(); }
    setRemovendoId(null);
  }

  function handlePosImport() {
    setModalImportar(false);
    if (importHook.estado === 'done') {
      void carregarResumos();
      void carregarOrfaos();
      onRefetch();
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 border-b border-border">
          {([
            { key: 'operadores', label: 'Por operador',                     Icon: Users },
            { key: 'ranking',    label: 'Ranking',                          Icon: Trophy },
            { key: 'orfaos',     label: `Sem operador (${orfaos.length})`,  Icon: AlertCircle },
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
            const aberto       = expandidos.has(r.operador_id);
            const carregando   = loadingLinhas.has(r.operador_id);
            const linhas       = linhasMap.get(r.operador_id) ?? [];

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
              <p className="text-xs text-muted-foreground">
                Estas linhas não foram vinculadas a nenhum operador do sistema.
                Você pode removê-las individualmente.
              </p>
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
                      {orfaos.map(linha => (
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
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
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
