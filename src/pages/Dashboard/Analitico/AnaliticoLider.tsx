/**
 * AnaliticoLider — visão líder/gerência/admin
 * Por operador + Ranking + bucket de órfãos + botão de importar
 */

import { useState } from 'react';
import { Upload, Users, Trophy, AlertCircle, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import { removerLinhaAnalitico } from '@/services/analitico/analitico.service';
import { toast } from 'sonner';
import { TabulacaoCell } from './TabulacaoCell';
import { ImportarModal } from './ImportarModal';
import { useAnaliticoImport } from '@/hooks/useAnaliticoImport';

interface AnaliticoLiderProps {
  dados: AnaliticoRecebimento[];
  loading: boolean;
  empresaId: string;
  /** Lista de linhas sem operador vinculado */
  orfaos: AnaliticoRecebimento[];
  loadingOrfaos: boolean;
  temPermissaoImportar: boolean;
  operadorId: string;
  operadorNome: string;
  liderId?: string | null;
  /** Filtro de operador selecionado pelo líder */
  filtroOperadorId: string | null;
  setFiltroOperadorId: (id: string | null) => void;
  onAbrirNovoAcordo: (dados: {
    instituicao: string;
    nomeCliente: string;
    forma: 'boleto_pix' | 'cartao';
    valor: number;
  }) => void;
  onVerAcordo: (acordoId: string) => void;
  onRefetch: () => void;
}

interface GrupoOperador {
  operadorId:   string | null;
  operadorNome: string;
  usuario:      string;
  linhas:       AnaliticoRecebimento[];
  totalRec:     number;
  totalHO:      number;
}

function agruparPorOperador(dados: AnaliticoRecebimento[]): GrupoOperador[] {
  const map = new Map<string, GrupoOperador>();
  for (const d of dados) {
    const key = d.operador_id ?? `__sem_${d.operador_usuario}`;
    if (!map.has(key)) {
      map.set(key, {
        operadorId:   d.operador_id,
        operadorNome: (d.perfis as { nome?: string } | null)?.nome ?? d.operador_usuario,
        usuario:      d.operador_usuario,
        linhas:       [],
        totalRec:     0,
        totalHO:      0,
      });
    }
    const g = map.get(key)!;
    g.linhas.push(d);
    g.totalRec += d.valor_recebido;
    g.totalHO  += d.total_ho;
  }
  return [...map.values()].sort((a, b) => b.totalRec - a.totalRec);
}

export function AnaliticoLider({
  dados, loading, empresaId, orfaos, loadingOrfaos,
  temPermissaoImportar, operadorId, operadorNome, liderId,
  filtroOperadorId, setFiltroOperadorId,
  onAbrirNovoAcordo, onVerAcordo, onRefetch,
}: AnaliticoLiderProps) {
  const importHook = useAnaliticoImport();
  const [modalImportar,  setModalImportar]  = useState(false);
  const [abaAtiva,       setAbaAtiva]       = useState<'operadores' | 'ranking' | 'orfaos'>('operadores');
  const [expandidos,     setExpandidos]     = useState<Set<string>>(new Set());
  const [removendoId,    setRemovendoId]    = useState<string | null>(null);

  function toggleExpandido(key: string) {
    setExpandidos(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function removerOrfao(id: string) {
    setRemovendoId(id);
    const { error } = await removerLinhaAnalitico(id);
    if (error) toast.error(`Erro ao remover: ${error}`);
    else { toast.success('Linha removida.'); onRefetch(); }
    setRemovendoId(null);
  }

  const grupos = agruparPorOperador(dados.filter(d => d.operador_id !== null));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 border-b border-border">
          {([
            { key: 'operadores', label: 'Por operador', Icon: Users },
            { key: 'ranking',    label: 'Ranking',       Icon: Trophy },
            { key: 'orfaos',     label: `Sem operador (${orfaos.length})`, Icon: AlertCircle },
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
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setModalImportar(true)}
          >
            <Upload className="w-4 h-4" /> Importar relatório
          </Button>
        )}
      </div>

      {/* ── Aba: Por operador ─────────────────────────────────────────────── */}
      {abaAtiva === 'operadores' && (
        <div className="space-y-3">
          {loading && (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 bg-muted rounded-lg" />
              ))}
            </div>
          )}

          {!loading && grupos.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Nenhum dado para este mês.</p>
            </div>
          )}

          {!loading && grupos.map(g => {
            const key = g.operadorId ?? g.usuario;
            const aberto = expandidos.has(key);
            const isFiltrado = filtroOperadorId === g.operadorId;
            return (
              <Card key={key} className={cn('border-border', isFiltrado && 'ring-1 ring-primary')}>
                <CardHeader
                  className="p-3 cursor-pointer select-none"
                  onClick={() => toggleExpandido(key)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {aberto
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      }
                      <div>
                        <CardTitle className="text-sm">{g.operadorNome}</CardTitle>
                        <p className="text-xs text-muted-foreground font-mono">{g.usuario}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <p className="text-sm font-bold text-primary">{formatBRL(g.totalRec)}</p>
                        <p className="text-xs text-muted-foreground">recebido</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{formatBRL(g.totalHO)}</p>
                        <p className="text-xs text-muted-foreground">HO</p>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {g.linhas.length} pgto.
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                {aberto && (
                  <CardContent className="p-0 border-t">
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
                        {g.linhas.map(linha => (
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
                                operadorId={g.operadorId ?? operadorId}
                                operadorNome={g.operadorNome}
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
                {grupos.map((g, idx) => (
                  <tr key={g.operadorId ?? g.usuario} className={cn(
                    'hover:bg-muted/30',
                    idx === 0 && 'bg-yellow-50/50 dark:bg-yellow-950/10',
                  )}>
                    <td className="px-3 py-2.5 font-bold text-muted-foreground">
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium">{g.operadorNome}</span>
                      <span className="block text-muted-foreground font-mono">{g.usuario}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-primary">
                      {formatBRL(g.totalRec)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                      {formatBRL(g.totalHO)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Badge variant="outline">{g.linhas.length}</Badge>
                    </td>
                  </tr>
                ))}
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
        onFechar={() => { setModalImportar(false); if (importHook.estado === 'done') onRefetch(); }}
        hook={importHook}
      />
    </div>
  );
}
