/**
 * DiarioLider — visão líder/elite/gerência/admin da aba Recebimento diário.
 *
 * • Cards de resumo do dia (total, operadores, acordos, pagamentos, data)
 *   + total acumulado do mês
 * • Lista de operadores ordenada por recebido, com subtotais Pix/Boleto/Cartão
 *   e tag "+N novos" após a 2ª importação do dia — detalhe expande ao clicar
 * • Aba "Sem operador": pagamentos importados sem vínculo (órfãos)
 * • Card "Acordos ignorados": próximo contato ≤ hoje, fora dos totais
 * • Importar relatório + limpar dia (permissão importar_diario)
 */

import { useState, useMemo, useCallback } from 'react';
import {
  Upload, Users, AlertCircle, ChevronDown, ChevronRight, Trash2, Loader2,
  TrendingUp, Calendar, BarChart3, Search, Wallet, CalendarRange, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/money';
import { getTodayISO } from '@/lib/index';
import { cn } from '@/lib/utils';
import type { DiarioRecebimento } from '@/lib/supabase';
import { useDiario } from '@/hooks/useDiario';
import { useDiarioImport } from '@/hooks/useDiarioImport';
import { fmtCPF } from '@/services/diario/diarioParser';
import {
  removerLinhaDiario, removerOrfaosDoDia, limparDadosDoDia,
} from '@/services/diario/diario.service';
import {
  linhasVivas, consolidarItens, consolidarIgnorados, agregarPorOperador,
  acordoKey, dataLabel, fmtDataISO,
  type ResumoOperadorDiario,
} from './helpers';
import { FormaChip } from './FormaChip';
import { ImportarDiarioModal } from './ImportarDiarioModal';

interface DiarioLiderProps {
  empresaId: string;
  dia: string | null;
  temPermissaoImportar: boolean;
  /** Total acumulado do mês (RPC) — atualizado pelo componente pai */
  totalMes: number | null;
  /** Recarrega dados externos (último dia com dados + total do mês) */
  onDadosImportados: (dia: string) => void;
}

export function DiarioLider({
  empresaId, dia, temPermissaoImportar, totalMes, onDadosImportados,
}: DiarioLiderProps) {
  const importHook = useDiarioImport();
  const { dados, loading, refetch } = useDiario({ dia });

  const [modalImportar, setModalImportar]  = useState(false);
  const [abaAtiva, setAbaAtiva]            = useState<'operadores' | 'orfaos'>('operadores');
  const [busca, setBusca]                  = useState('');
  const [expandidos, setExpandidos]        = useState<Set<string>>(new Set());
  const [removendoId, setRemovendoId]      = useState<string | null>(null);
  const [removendoOrfaos, setRemovendoOrfaos]     = useState(false);
  const [confirmandoLimpeza, setConfirmandoLimpeza] = useState(false);
  const [limpando, setLimpando]            = useState(false);

  const hojeISO = getTodayISO();

  // ── Agregações ────────────────────────────────────────────────────────────
  const {
    vinculadas, orfaos, ignorados, resumoOps, maxImportIndex, totalDia,
    nAcordos, nPagamentos,
  } = useMemo(() => {
    const vivasCalc      = linhasVivas(dados, hojeISO);
    const vinculadasCalc = vivasCalc.filter(r => r.operador_id);
    const orfaosCalc     = vivasCalc.filter(r => !r.operador_id);
    const maxIdx         = dados.reduce((m, r) => Math.max(m, r.import_index), 0);
    const resumo         = agregarPorOperador(vinculadasCalc, maxIdx);
    const acordosSet     = new Set<string>();
    for (const r of vivasCalc) {
      acordosSet.add(`${r.operador_usuario}::${acordoKey(r)}`);
    }
    return {
      vinculadas:     vinculadasCalc,
      orfaos:         orfaosCalc,
      ignorados:      consolidarIgnorados(dados, hojeISO),
      resumoOps:      resumo,
      maxImportIndex: maxIdx,
      totalDia:       vivasCalc.reduce((s, r) => s + r.valor_recebido, 0),
      nAcordos:       acordosSet.size,
      nPagamentos:    vivasCalc.length,
    };
  }, [dados, hojeISO]);

  const totalNovos = useMemo(
    () => resumoOps.reduce((s, r) => s + r.novos, 0),
    [resumoOps],
  );

  const resumoFiltrado = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return resumoOps;
    return resumoOps.filter(r =>
      (r.nome ?? '').toLowerCase().includes(q) || r.usuario.toLowerCase().includes(q));
  }, [resumoOps, busca]);

  const maxTotal = resumoOps[0]?.total || 1;

  // ── Ações ─────────────────────────────────────────────────────────────────
  function toggleExpandido(opId: string) {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(opId)) next.delete(opId);
      else next.add(opId);
      return next;
    });
  }

  async function removerOrfao(id: string) {
    setRemovendoId(id);
    const { error } = await removerLinhaDiario(id);
    if (error) toast.error(`Erro ao remover: ${error}`);
    else { toast.success('Pagamento removido.'); void refetch(); }
    setRemovendoId(null);
  }

  async function removerTodosOrfaos() {
    if (!dia) return;
    setRemovendoOrfaos(true);
    const { error } = await removerOrfaosDoDia(empresaId, dia);
    if (error) toast.error(`Erro ao remover: ${error}`);
    else { toast.success('Pagamentos sem operador removidos.'); void refetch(); }
    setRemovendoOrfaos(false);
  }

  async function limparDia() {
    if (!dia || !dados.length) return;
    setLimpando(true);
    const { error } = await limparDadosDoDia(empresaId, dia);
    if (error) {
      toast.error(`Erro ao limpar: ${error}`);
    } else {
      toast.success(`Dados de ${fmtDataISO(dia)} excluídos. Reimporte o relatório quando necessário.`);
      setConfirmandoLimpeza(false);
      void refetch();
    }
    setLimpando(false);
  }

  const handlePosImport = useCallback(() => {
    setModalImportar(false);
    if (importHook.estado === 'done' && importHook.preview) {
      onDadosImportados(importHook.preview.dia);
      void refetch();
    }
  }, [importHook.estado, importHook.preview, onDadosImportados, refetch]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Cards de resumo do dia */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : dados.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total do dia</p>
                  <p className="text-base font-bold text-primary font-mono leading-tight mt-1 truncate">
                    {formatBRL(totalDia)}
                  </p>
                </div>
                <TrendingUp className="w-4 h-4 text-primary/50 shrink-0 mt-0.5" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total do mês</p>
                  <p className="text-base font-bold font-mono leading-tight mt-1 truncate">
                    {totalMes != null ? formatBRL(totalMes) : '—'}
                  </p>
                </div>
                <Wallet className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Operadores</p>
                  <p className="text-xl font-bold leading-tight mt-1">{resumoOps.length}</p>
                </div>
                <Users className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Acordos pagos</p>
                  <p className="text-xl font-bold leading-tight mt-1">{nAcordos.toLocaleString('pt-BR')}</p>
                </div>
                <BarChart3 className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Pagamentos</p>
                  <p className="text-xl font-bold leading-tight mt-1">{nPagamentos.toLocaleString('pt-BR')}</p>
                </div>
                <CalendarRange className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Data</p>
                  <p className="text-sm font-semibold leading-tight mt-1.5">{dia ? fmtDataISO(dia) : '—'}</p>
                </div>
                <Calendar className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Nota da importação */}
      {!loading && dados.length > 0 && (
        <p className="text-xs text-muted-foreground px-1">
          {maxImportIndex >= 2 ? (
            <>
              Importação <strong className="text-foreground">nº {maxImportIndex}</strong> do dia ·{' '}
              <strong className="text-primary">{totalNovos}</strong> novo{totalNovos !== 1 ? 's' : ''} acordo{totalNovos !== 1 ? 's' : ''} no último relatório.
              As listas separam pagamentos anteriores dos novos.
            </>
          ) : (
            <>Importação nº 1 do dia. Ao importar outro relatório hoje, os pagamentos novos aparecem destacados.</>
          )}
        </p>
      )}

      {/* Tabs + ações */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 border-b border-border">
          {([
            { key: 'operadores', label: 'Por operador',  Icon: Users },
            { key: 'orfaos',     label: 'Sem operador',  Icon: AlertCircle },
          ] as const).map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setAbaAtiva(key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                abaAtiva === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
              {key === 'orfaos' && orfaos.length > 0 && (
                <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-700 rounded-full px-1.5">
                  {orfaos.length}
                </span>
              )}
            </button>
          ))}
        </div>
        {temPermissaoImportar && (
          <div className="flex items-center gap-2">
            {dados.length > 0 && (
              <Button
                size="sm" variant="outline"
                className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmandoLimpeza(true)}
              >
                <Trash2 className="w-4 h-4" /> Limpar dia
              </Button>
            )}
            <Button size="sm" className="gap-1.5" onClick={() => setModalImportar(true)}>
              <Upload className="w-4 h-4" /> Importar relatório
            </Button>
          </div>
        )}
      </div>

      {/* ── Aba: Por operador ─────────────────────────────────────────────── */}
      {abaAtiva === 'operadores' && (
        <div className="space-y-3">
          {loading && (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-muted rounded-lg" />)}
            </div>
          )}

          {!loading && !dados.length && (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-sm">Nenhum relatório importado{dia ? ` para ${fmtDataISO(dia)}` : ''}.</p>
              {temPermissaoImportar && (
                <p className="text-xs mt-1">Use o botão <strong>Importar relatório</strong> acima para começar.</p>
              )}
            </div>
          )}

          {!loading && resumoOps.length > 0 && (
            <>
              {/* Busca */}
              <div className="relative max-w-xs">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar operador…"
                  className="h-8 w-full pl-8 pr-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {busca && (
                  <button
                    onClick={() => setBusca('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {resumoFiltrado.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Nenhum operador encontrado.
                </div>
              )}

              <div className="space-y-2">
                {resumoFiltrado.map(r => (
                  <OperadorCardDiario
                    key={r.operadorId}
                    resumo={r}
                    posicao={resumoOps.indexOf(r) + 1}
                    maxTotal={maxTotal}
                    aberto={expandidos.has(r.operadorId)}
                    onToggle={() => toggleExpandido(r.operadorId)}
                    linhas={vinculadas.filter(v => v.operador_id === r.operadorId)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Acordos ignorados */}
          {!loading && ignorados.length > 0 && (
            <Card className="border-amber-300/60 dark:border-amber-700/40">
              <CardHeader className="p-3 bg-amber-50/60 dark:bg-amber-950/20 border-b border-amber-200/60 dark:border-amber-800/40">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    Acordos ignorados · próximo contato ≤ hoje ({fmtDataISO(hojeISO)})
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {ignorados.length} acordo{ignorados.length !== 1 ? 's' : ''} ·{' '}
                    {formatBRL(ignorados.reduce((s, i) => s + i.valor, 0))} · fora dos totais e das listas
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">OPERADOR</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">CPF / NOME</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">FORMA</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">VALOR</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">PRÓX. CONTATO</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {ignorados.map((it, i) => (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium">{it.operador}</td>
                          <td className="px-3 py-2">
                            <span className="font-semibold tabular-nums">
                              {fmtCPF(it.cpf) || '—'}
                              {it.n > 1 && (
                                <span className="ml-1.5 text-[10px] font-semibold text-purple-700 dark:text-purple-400">{it.n}x</span>
                              )}
                            </span>
                            {it.nome_cliente && (
                              <span className="block text-muted-foreground truncate max-w-[160px]">{it.nome_cliente}</span>
                            )}
                          </td>
                          <td className="px-3 py-2"><FormaChip forma={it.forma_pagamento} /></td>
                          <td className="px-3 py-2 text-right font-mono">{formatBRL(it.valor)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtDataISO(it.proxContato)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border bg-muted/30 font-semibold">
                        <td colSpan={3} className="px-3 py-2.5">Total ignorado</td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          {formatBRL(ignorados.reduce((s, i) => s + i.valor, 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Aba: Sem operador ─────────────────────────────────────────────── */}
      {abaAtiva === 'orfaos' && (
        <div className="space-y-3">
          {loading && (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-muted rounded-lg" />)}
            </div>
          )}
          {!loading && orfaos.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Nenhum pagamento sem operador. ✓</p>
            </div>
          )}
          {!loading && orfaos.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {orfaos.length} pagamento{orfaos.length !== 1 ? 's' : ''} sem vínculo com operador do sistema ·{' '}
                  {formatBRL(orfaos.reduce((s, o) => s + o.valor_recebido, 0))}
                </p>
                {temPermissaoImportar && (
                  <Button size="sm" variant="destructive" className="gap-1.5 h-7 text-xs"
                    onClick={() => void removerTodosOrfaos()} disabled={removendoOrfaos}>
                    {removendoOrfaos
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Trash2 className="w-3 h-3" />}
                    Remover todos
                  </Button>
                )}
              </div>
              <Card className="border-border">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground">OPERADOR (ARQUIVO)</th>
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground">CPF / NOME</th>
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground">FORMA</th>
                          <th className="text-right px-3 py-2 font-semibold text-muted-foreground">VALOR</th>
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground">DATA</th>
                          {temPermissaoImportar && (
                            <th className="text-right px-3 py-2 font-semibold text-muted-foreground">REMOVER</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {orfaos.map(linha => (
                          <tr key={linha.id} className="hover:bg-muted/20">
                            <td className="px-3 py-2 font-mono text-amber-600">{linha.operador_usuario}</td>
                            <td className="px-3 py-2">
                              <span className="font-semibold tabular-nums">{fmtCPF(linha.cpf) || '—'}</span>
                              {linha.nome_cliente && (
                                <span className="block text-muted-foreground truncate max-w-[160px]">{linha.nome_cliente}</span>
                              )}
                            </td>
                            <td className="px-3 py-2"><FormaChip forma={linha.forma_pagamento} /></td>
                            <td className="px-3 py-2 text-right font-mono">{formatBRL(linha.valor_recebido)}</td>
                            <td className="px-3 py-2 tabular-nums">{fmtDataISO(linha.data_pagamento)}</td>
                            {temPermissaoImportar && (
                              <td className="px-3 py-2 text-right">
                                <Button size="sm" variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                  onClick={() => void removerOrfao(linha.id)}
                                  disabled={removendoId === linha.id}>
                                  {removendoId === linha.id
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Trash2 className="w-3.5 h-3.5" />}
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Confirmação de limpeza do dia */}
      <AlertDialog open={confirmandoLimpeza} onOpenChange={setConfirmandoLimpeza}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" /> Limpar dados do dia
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <p>
                Todos os pagamentos importados de{' '}
                <strong>{dia ? fmtDataISO(dia) : '—'}</strong>{' '}
                serão excluídos permanentemente.
              </p>
              <p className="text-xs text-muted-foreground">
                Esta ação não pode ser desfeita. Após a exclusão, reimporte o relatório para restaurar os dados.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={limpando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void limparDia()}
              disabled={limpando}
              className="bg-destructive hover:bg-destructive/90 text-white gap-1.5"
            >
              {limpando && <Loader2 className="w-4 h-4 animate-spin" />}
              {limpando ? 'Excluindo…' : 'Confirmar exclusão'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportarDiarioModal aberto={modalImportar} onFechar={handlePosImport} hook={importHook} />
    </div>
  );
}

// ── Sub-componente: card expansível do operador ───────────────────────────────

interface OperadorCardDiarioProps {
  resumo: ResumoOperadorDiario;
  posicao: number;
  maxTotal: number;
  aberto: boolean;
  onToggle: () => void;
  linhas: DiarioRecebimento[];
}

function OperadorCardDiario({
  resumo, posicao, maxTotal, aberto, onToggle, linhas,
}: OperadorCardDiarioProps) {
  // Detalhe consolidado apenas quando expandido (lazy render)
  const itens = useMemo(
    () => (aberto ? consolidarItens(linhas, new Set()) : []),
    [aberto, linhas],
  );

  const barra = Math.max(4, Math.round((resumo.total / maxTotal) * 100));

  return (
    <Card className="border-border">
      <CardHeader className="p-3 cursor-pointer select-none" onClick={onToggle}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {aberto
              ? <ChevronDown  className="w-4 h-4 text-muted-foreground shrink-0" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
            <span className={cn(
              'text-xs font-bold w-6 text-right shrink-0',
              posicao <= 3 ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground',
            )}>
              {posicao}º
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-sm">{resumo.nome ?? resumo.usuario}</CardTitle>
                {resumo.novos > 0 && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 rounded-full px-2 py-0.5">
                    +{resumo.novos} novo{resumo.novos !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono">{resumo.usuario}</p>
              <div className="mt-1.5 h-1 rounded-full bg-border overflow-hidden max-w-[280px]">
                <div className="h-full rounded-full bg-primary/50" style={{ width: `${barra}%` }} />
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {resumo.pix > 0 && (
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/40 rounded-full px-2 py-0.5 font-mono">
                    Pix {formatBRL(resumo.pix)}
                  </span>
                )}
                {resumo.boleto > 0 && (
                  <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-100/70 dark:bg-amber-950/40 rounded-full px-2 py-0.5 font-mono">
                    Boleto {formatBRL(resumo.boleto)}
                  </span>
                )}
                {resumo.cartao > 0 && (
                  <span className="text-[10px] font-semibold text-purple-700 dark:text-purple-400 bg-purple-100/70 dark:bg-purple-950/40 rounded-full px-2 py-0.5 font-mono">
                    Cartão {formatBRL(resumo.cartao)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-primary font-mono">{formatBRL(resumo.total)}</p>
            <p className="text-xs text-muted-foreground">
              {resumo.nAcordos} acordo{resumo.nAcordos !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </CardHeader>

      {aberto && (
        <CardContent className="p-0 border-t">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">CPF / NOME</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">FORMA</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">VALOR</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">DATA PGT.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {itens.map(item => (
                  <tr key={item.key} className="hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <span className="font-semibold tabular-nums">
                        {fmtCPF(item.cpf) || '—'}
                        {item.n > 1 && (
                          <span className="ml-1.5 text-[10px] font-semibold text-purple-700 dark:text-purple-400">{item.n}x</span>
                        )}
                      </span>
                      {item.nome_cliente && (
                        <span className="block text-muted-foreground truncate max-w-[200px]">{item.nome_cliente}</span>
                      )}
                    </td>
                    <td className="px-3 py-2"><FormaChip forma={item.forma_pagamento} /></td>
                    <td className="px-3 py-2 text-right font-mono">{formatBRL(item.valor)}</td>
                    <td className="px-3 py-2 tabular-nums">{dataLabel(item)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  <td colSpan={2} className="px-3 py-2.5">Total</td>
                  <td className="px-3 py-2.5 text-right font-mono text-primary">{formatBRL(resumo.total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
