import { useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle, CheckCircle2, Upload, Loader2, Users, FileSpreadsheet,
  ChevronDown, ChevronUp, ArrowRight,
} from 'lucide-react';
import { formatBRL } from '@/lib/money';
import type { UseAnaliticoImport } from './types';

interface ImportarModalProps {
  aberto: boolean;
  onFechar: () => void;
  hook: ReturnType<UseAnaliticoImport>;
}

export function ImportarModal({ aberto, onFechar, hook }: ImportarModalProps) {
  const {
    estado, preview, resultado, erroGeral,
    vinculosManuais,
    carregarArquivo, confirmarImportacao, cancelar, definirVinculo,
  } = hook;

  const inputRef = useRef<HTMLInputElement>(null);
  const [detectadosExpandido, setDetectadosExpandido] = useState(false);

  function handleFechar() {
    cancelar();
    onFechar();
  }

  function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void carregarArquivo(file);
    if (inputRef.current) inputRef.current.value = '';
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  if (estado === 'done' && resultado) {
    return (
      <Dialog open={aberto} onOpenChange={handleFechar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" /> Importação concluída
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-600">{resultado.inseridos}</p>
                <p className="text-xs text-muted-foreground">pagamentos inseridos</p>
              </div>
              <div className="rounded-lg border bg-muted p-3 text-center">
                <p className="text-2xl font-bold">{resultado.duplicados}</p>
                <p className="text-xs text-muted-foreground">já existiam</p>
              </div>
            </div>
            {resultado.erros.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1">
                <p className="text-xs font-semibold text-amber-700">Avisos:</p>
                {resultado.erros.map((e, i) => (
                  <p key={i} className="text-xs text-amber-600">{e}</p>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Todos os operadores foram notificados sobre a atualização.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={handleFechar}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (estado === 'error') {
    return (
      <Dialog open={aberto} onOpenChange={handleFechar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" /> Erro ao processar arquivo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <pre className="text-xs bg-muted rounded p-3 whitespace-pre-wrap">{erroGeral}</pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelar}>Tentar novamente</Button>
            <Button variant="destructive" onClick={handleFechar}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  if (estado === 'preview' && preview) {
    const detectados = Object.entries(preview.matches).filter(([, m]) => m !== null);
    const naoDetectados = preview.operadoresNaoEncontrados;
    const vinculadosManuaisCount = Object.keys(vinculosManuais).length;

    return (
      <Dialog open={aberto} onOpenChange={handleFechar}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              Preview — {preview.mes ? new Date(preview.mes + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : 'Relatório'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 pr-1">
            {/* Contadores */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-primary/5 p-3 text-center">
                <p className="text-xl font-bold text-primary">{preview.linhasNovas}</p>
                <p className="text-xs text-muted-foreground">a inserir</p>
              </div>
              <div className="rounded-lg border bg-muted p-3 text-center">
                <p className="text-xl font-bold">{preview.linhasTotais}</p>
                <p className="text-xs text-muted-foreground">no arquivo</p>
              </div>
              <div className="rounded-lg border bg-muted p-3 text-center">
                <p className={`text-xl font-bold ${naoDetectados.length - vinculadosManuaisCount > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {naoDetectados.length - vinculadosManuaisCount}
                </p>
                <p className="text-xs text-muted-foreground">sem operador</p>
              </div>
            </div>

            {/* Operadores detectados automaticamente */}
            {detectados.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20">
                <button
                  type="button"
                  onClick={() => setDetectadosExpandido(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                >
                  <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Operadores detectados ({detectados.length})
                  </span>
                  {detectadosExpandido
                    ? <ChevronUp className="w-3.5 h-3.5 text-emerald-600" />
                    : <ChevronDown className="w-3.5 h-3.5 text-emerald-600" />
                  }
                </button>

                {detectadosExpandido && (
                  <div className="px-3 pb-3 space-y-1 border-t border-emerald-200">
                    <p className="text-[10px] text-emerald-600 py-1.5">
                      Nome no arquivo → usuário vinculado no sistema
                    </p>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {detectados.map(([usuarioArquivo, match]) => (
                        <div
                          key={usuarioArquivo}
                          className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-emerald-100/60 dark:bg-emerald-900/20"
                        >
                          <span className="font-mono text-emerald-800 dark:text-emerald-300 shrink-0">
                            {usuarioArquivo}
                          </span>
                          <ArrowRight className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span className="font-mono text-emerald-700 dark:text-emerald-400 shrink-0">
                            {match!.usuarioDB}
                          </span>
                          <span className="text-muted-foreground truncate">
                            ({match!.nome})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Operadores não detectados — com seleção manual */}
            {naoDetectados.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                <div className="px-3 py-2.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-amber-600" />
                  <p className="text-xs font-semibold text-amber-700">
                    Não detectados ({naoDetectados.length}) — vincule manualmente ou deixe em branco
                  </p>
                </div>

                <div className="px-3 pb-3 border-t border-amber-200 space-y-2 max-h-64 overflow-y-auto">
                  {naoDetectados.map(u => {
                    const vinculoAtual = vinculosManuais[u] ?? '';
                    return (
                      <div key={u} className="flex items-center gap-2">
                        <span className="font-mono text-xs text-amber-800 dark:text-amber-300 w-44 shrink-0 truncate">
                          {u}
                        </span>
                        <ArrowRight className="w-3 h-3 text-amber-400 shrink-0" />
                        <Select
                          value={vinculoAtual || '__nenhum__'}
                          onValueChange={val => definirVinculo(u, val === '__nenhum__' ? null : val)}
                        >
                          <SelectTrigger className="h-7 text-xs flex-1 bg-white dark:bg-background">
                            <SelectValue placeholder="Sem vínculo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__nenhum__">
                              <span className="text-muted-foreground">Sem vínculo (órfão)</span>
                            </SelectItem>
                            {preview.todosPerfis.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                <span className="font-mono">{p.usuario}</span>
                                <span className="text-muted-foreground ml-1.5">— {p.nome}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>

                {vinculadosManuaisCount < naoDetectados.length && (
                  <p className="text-[10px] text-amber-600 px-3 pb-2.5">
                    {naoDetectados.length - vinculadosManuaisCount} sem vínculo serão importados como órfãos (visíveis apenas para líderes).
                  </p>
                )}
              </div>
            )}

            {/* Erros de parse */}
            {preview.errosParse.length > 0 && (
              <div className="rounded-lg border border-muted bg-muted/30 p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">
                  Avisos de parse ({preview.errosParse.length}):
                </p>
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {preview.errosParse.map((e, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{e}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Tabela de preview */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Primeiros {Math.min(preview.linhas.length, 20)} de {preview.linhas.length} registros:
              </p>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Cobradora</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Código</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Forma</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Recebido</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Total HO</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Data</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Vinc.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.linhas.slice(0, 20).map((l, i) => {
                      const vinculadoAuto = preview.operadoresMap[l.operador_usuario] !== null;
                      const vinculadoManual = !!vinculosManuais[l.operador_usuario];
                      const vinculado = vinculadoAuto || vinculadoManual;
                      return (
                        <tr key={i} className="hover:bg-muted/30">
                          <td className="px-3 py-1.5 font-mono">{l.operador_usuario}</td>
                          <td className="px-3 py-1.5">
                            <span className="font-medium">{l.codigo}</span>
                            {l.nome_cliente && (
                              <span className="block text-muted-foreground truncate max-w-[120px]">
                                {l.nome_cliente}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            <Badge variant="outline" className={
                              l.forma_pagamento === 'cartao'
                                ? 'border-purple-300 text-purple-700'
                                : 'border-blue-300 text-blue-700'
                            }>
                              {l.forma_pagamento === 'cartao' ? 'Cartão' : 'Boleto/Pix'}
                            </Badge>
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">{formatBRL(l.valor_recebido)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{formatBRL(l.total_ho)}</td>
                          <td className="px-3 py-1.5">{l.data_pagamento.toLocaleDateString('pt-BR')}</td>
                          <td className="px-3 py-1.5">
                            {vinculado
                              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              : <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 border-t pt-4">
            <Button variant="outline" onClick={cancelar}>Cancelar</Button>
            <Button onClick={() => void confirmarImportacao()} disabled={estado === 'confirming'}>
              {estado === 'confirming'
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Importando…</>
                : `Confirmar (${preview.linhasNovas} registro${preview.linhasNovas !== 1 ? 's' : ''})`
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Idle / Parsing ────────────────────────────────────────────────────────
  return (
    <Dialog open={aberto} onOpenChange={handleFechar}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" /> Importar relatório de recebimentos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Selecione o arquivo Excel exportado do ERP (relatório analítico de recebimentos).
            Os dados serão mesclados com os existentes — registros duplicados são ignorados.
          </p>

          <label
            className={`
              flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed
              rounded-xl cursor-pointer transition-colors
              ${estado === 'parsing'
                ? 'border-primary/40 bg-primary/5'
                : 'border-border hover:border-primary/40 hover:bg-primary/5'}
            `}
          >
            {estado === 'parsing' ? (
              <>
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-sm font-medium text-primary">Processando arquivo…</p>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm font-medium">Clique para selecionar o arquivo</p>
                <p className="text-xs text-muted-foreground">.xlsx · .xls</p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleArquivo}
              disabled={estado === 'parsing'}
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleFechar} disabled={estado === 'parsing'}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
