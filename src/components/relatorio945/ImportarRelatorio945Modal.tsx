/**
 * ImportarRelatorio945Modal — a única porta de entrada do relatório 945.
 *
 * Abre do recorte Dia do Analítico (origem `diario`) e do Painel Diretoria ›
 * Relatório de pagamento (origem `diretoria`). Uma confirmação grava as duas
 * tabelas. A prévia mostra o que o arquivo é, até onde vai, se começa cedo o
 * bastante, o que o banco tem que o arquivo não trouxe, e quem é cada operador.
 */

import { useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, FileSpreadsheet, Loader2, Upload, Users,
} from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { formatarCentavos } from '@/services/relatorioPaguePlay/modelo';
import { dataBR, horaDoCorteLocal, somaQuantidade } from '@/services/relatorio945/modelo';
import type { Importacao945 } from '@/hooks/useImportacao945';
import { FaixaCobertura945 } from './FaixaCobertura945';

const TITULO = 'Importar relatório 945 — recebimento diário (regra Cofen)';

function Aviso({ tom, children }: { tom: 'erro' | 'atencao' | 'info'; children: React.ReactNode }) {
  const cor = tom === 'erro'
    ? 'border-destructive/40 bg-destructive/10 text-destructive'
    : tom === 'atencao'
      ? 'border-amber-300/70 bg-amber-50 text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/20 dark:text-amber-300'
      : 'border-primary/30 bg-primary/5 text-muted-foreground';
  return <div role={tom === 'erro' ? 'alert' : 'status'} className={`rounded-lg border p-3 text-xs ${cor}`}>{children}</div>;
}

export function ImportarRelatorio945Modal({ aberto, onFechar, imp }: {
  aberto: boolean;
  /** `concluiu`: houve gravação — a tela de trás recarrega. */
  onFechar: (concluiu: boolean) => void;
  imp: Importacao945;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [detectadosAbertos, setDetectadosAbertos] = useState(false);

  function fechar() {
    if (imp.etapa === 'gravando') return;
    const concluiu = imp.etapa === 'concluido';
    imp.cancelar();
    onFechar(concluiu);
  }
  function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void imp.carregarArquivo(f);
    if (inputRef.current) inputRef.current.value = '';
  }

  // ── Concluído ────────────────────────────────────────────────────────────
  if (imp.etapa === 'concluido' && imp.resultado) {
    const r = imp.resultado;
    return (
      <Dialog open={aberto} onOpenChange={fechar}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" /> Relatório 945 importado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div className="rounded-lg border p-3">
              <p className="font-medium">Relatório de pagamento (diretoria)</p>
              <p className="text-muted-foreground">
                {r.inseridos} novas · {r.atualizados} atualizadas · {r.ignorados} já iguais
                {r.removidos > 0 && ` · ${r.removidos} removidas`}
              </p>
            </div>
            {r.diario ? (
              <div className="rounded-lg border p-3">
                <p className="font-medium">Recebimento diário</p>
                <p className="text-muted-foreground">
                  {r.diario.inseridos} novas · {r.diario.atualizados} atualizadas (valor, data, operador ou tabulação)
                  {r.diario.removidos_sem_id > 0 && ` · ${r.diario.removidos_sem_id} sem Id.Baixa removidas`}
                  {r.diario.removidos_ausentes > 0 && ` · ${r.diario.removidos_ausentes} ausentes removidas`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.diario.novos_por_operador.length
                    ? `${r.diario.novos_por_operador.length} operador(es) avisado(s) dos pagamentos novos.`
                    : 'Nenhum operador com pagamento novo para avisar.'}
                </p>
              </div>
            ) : (
              <Aviso tom="atencao">O arquivo não tinha a coluna Operador: o recebimento diário não foi alterado.</Aviso>
            )}
            <FaixaCobertura945 cobertura={imp.cobertura} erro={imp.erroCobertura} dias={7} />
          </div>
          <DialogFooter><Button onClick={fechar}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Erro de leitura ──────────────────────────────────────────────────────
  if (imp.etapa === 'erro') {
    return (
      <Dialog open={aberto} onOpenChange={fechar}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" /> Arquivo recusado
            </DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap rounded bg-muted p-3 text-sm">{imp.erro}</p>
          <p className="text-xs text-muted-foreground">Nada foi gravado.</p>
          <DialogFooter>
            <Button variant="outline" onClick={imp.cancelar}>Escolher outro arquivo</Button>
            <Button variant="destructive" onClick={fechar}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Prévia / gravando ────────────────────────────────────────────────────
  if ((imp.etapa === 'previa' || imp.etapa === 'gravando') && imp.previa) {
    const { relatorio, conferencia, matches, naoEncontrados, todosPerfis } = imp.previa;
    const gravando = imp.etapa === 'gravando';
    const detectados = Object.entries(matches).filter(([, m]) => m !== null);
    const semVinculo = naoEncontrados.filter(u => !imp.vinculos[u]).length;
    const semId = conferencia.sem_id_diario;
    const ausentes = somaQuantidade(conferencia.ausentes_diretoria) + somaQuantidade(conferencia.ausentes_diario);
    const diasAusentes = [...new Set([...conferencia.ausentes_diretoria, ...conferencia.ausentes_diario].map(x => x.data))].sort();
    const comOperador = Object.values(relatorio.diario).filter(d => d.operador).length;

    return (
      <Dialog open={aberto} onOpenChange={fechar}>
        <DialogContent aria-describedby={undefined} className="flex max-h-[88vh] max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" /> Prévia do relatório 945
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1 text-sm">
            <div className="rounded-lg border p-3">
              <p className="font-medium">
                {imp.previa.arquivo} · 945 de pagamento · {dataBR(relatorio.inicio)} a {dataBR(relatorio.fim)}
              </p>
              <p className="text-muted-foreground">
                {relatorio.linhas.length} baixas · {formatarCentavos(relatorio.totais.total)} · Pague Play {formatarCentavos(relatorio.totais.pp)} ·
                Coren {formatarCentavos(relatorio.totais.coren)} · Cofen {formatarCentavos(relatorio.totais.cofen)}
              </p>
              <p className="text-xs text-muted-foreground">
                Dados até <strong>{horaDoCorteLocal(relatorio.corte)}</strong>
                {relatorio.corte?.startsWith(conferencia.hoje) && ' — hoje ainda está parcial'}
                {' · '}{relatorio.rodapeConferido ? 'rodapé conferido' : 'sem rodapé completo para conferir'}
                {relatorio.estornos > 0 && ` · ${relatorio.estornos} estorno(s) de cartão juntado(s) no valor líquido`}
                {relatorio.duplicadas > 0 && ` · ${relatorio.duplicadas} linha(s) repetida(s) ignorada(s)`}
              </p>
            </div>

            <label className="flex flex-wrap items-center gap-2 text-xs">
              Exportado a partir de
              <input
                type="date" value={imp.inicio} max={relatorio.inicio} disabled={gravando}
                onChange={e => void imp.definirInicio(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1"
              />
              <span className="text-muted-foreground">
                (a primeira baixa é de {dataBR(relatorio.inicio)}; recue só se o ERP foi exportado antes e não houve baixa nesses dias)
              </span>
              {imp.conferindo && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </label>

            {imp.bloqueio && <Aviso tom="erro"><strong>Não dá para gravar.</strong> {imp.bloqueio}</Aviso>}
            {imp.erro && <Aviso tom="erro">{imp.erro}</Aviso>}

            <FaixaCobertura945 cobertura={conferencia} dias={14} />

            {semId.length > 0 && (
              <Aviso tom="atencao">
                <p className="font-semibold">
                  {somaQuantidade(semId)} linha(s) no recebimento diário sem Id.Baixa nesse período
                  ({formatBRL(semId.reduce((s, x) => s + Number(x.valor ?? 0), 0))})
                </p>
                <p className="mt-0.5">
                  Nenhuma veio de um 945 — costuma ser o relatório 58 importado no lugar dele. Dias:{' '}
                  {semId.map(x => dataBR(x.data).slice(0, 5)).join(', ')}.
                </p>
                <label className="mt-1.5 flex items-center gap-2 font-medium">
                  <input type="checkbox" checked={imp.removerSemId} disabled={gravando}
                    onChange={e => imp.setRemoverSemId(e.target.checked)} />
                  Remover essas linhas ao importar
                </label>
              </Aviso>
            )}

            {ausentes > 0 && (
              <Aviso tom="atencao">
                <p className="font-semibold">
                  O banco tem {ausentes} baixa(s) nesse período que este arquivo não trouxe
                  (relatório de pagamento: {somaQuantidade(conferencia.ausentes_diretoria)}, recebimento diário: {somaQuantidade(conferencia.ausentes_diario)})
                </p>
                <p className="mt-0.5">
                  Dias: {diasAusentes.map(d => dataBR(d).slice(0, 5)).join(', ')}. Se o arquivo foi exportado com algum filtro, cancele e exporte de novo sem filtro.
                  Só marque a remoção se o ERP realmente excluiu essas baixas.
                </p>
                <label className="mt-1.5 flex items-center gap-2 font-medium">
                  <input type="checkbox" checked={imp.removerAusentes} disabled={gravando}
                    onChange={e => imp.setRemoverAusentes(e.target.checked)} />
                  Remover do banco as baixas que não vieram no arquivo
                </label>
              </Aviso>
            )}

            {relatorio.inicio < conferencia.piso_diario && (
              <Aviso tom="info">
                O arquivo começa em {dataBR(relatorio.inicio)}. O Relatório de pagamento recebe tudo; o recebimento diário guarda a partir de {dataBR(conferencia.piso_diario)}.
              </Aviso>
            )}

            {relatorio.temOperador ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border bg-primary/5 p-2">
                  <p className="text-lg font-bold text-primary">{comOperador}</p>
                  <p className="text-[11px] text-muted-foreground">baixas com operador</p>
                </div>
                <div className="rounded-lg border bg-muted p-2">
                  <p className="text-lg font-bold">{relatorio.linhas.length - comOperador}</p>
                  <p className="text-[11px] text-muted-foreground">sem operador (Coren, IA…)</p>
                </div>
                <div className="rounded-lg border bg-muted p-2">
                  <p className={`text-lg font-bold ${semVinculo ? 'text-amber-700 dark:text-amber-500' : 'text-emerald-600 dark:text-emerald-500'}`}>{semVinculo}</p>
                  <p className="text-[11px] text-muted-foreground">logins sem usuário</p>
                </div>
              </div>
            ) : (
              <Aviso tom="atencao">Sem a coluna Operador: só o Relatório de pagamento será atualizado.</Aviso>
            )}

            {detectados.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/20">
                <button type="button" onClick={() => setDetectadosAbertos(v => !v)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Operadores reconhecidos ({detectados.length})</span>
                  {detectadosAbertos ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {detectadosAbertos && (
                  <div className="max-h-44 space-y-1 overflow-y-auto border-t border-emerald-200 px-3 py-2 dark:border-emerald-800/60">
                    {detectados.map(([u, m]) => (
                      <div key={u} className="flex items-center gap-2 text-xs">
                        <span className="font-mono">{u}</span><ArrowRight className="h-3 w-3 shrink-0" />
                        <span className="font-mono">{m!.usuarioDB}</span><span className="truncate text-muted-foreground">({m!.nome})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {naoEncontrados.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/20">
                <p className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  <Users className="h-3.5 w-3.5" /> Logins sem usuário ({naoEncontrados.length}) — vincule ou deixe sem vínculo
                </p>
                <div className="max-h-56 space-y-2 overflow-y-auto border-t border-amber-200 px-3 py-2 dark:border-amber-800/60">
                  {naoEncontrados.map(u => (
                    <div key={u} className="flex items-center gap-2">
                      <span className="w-44 shrink-0 truncate font-mono text-xs">{u}</span>
                      <ArrowRight className="h-3 w-3 shrink-0" />
                      <Select value={imp.vinculos[u] ?? '__nenhum__'} disabled={gravando}
                        onValueChange={v => imp.definirVinculo(u, v === '__nenhum__' ? null : v)}>
                        <SelectTrigger className="h-7 flex-1 bg-background text-xs"><SelectValue placeholder="Sem vínculo" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__nenhum__"><span className="text-muted-foreground">Sem vínculo (fica só no geral)</span></SelectItem>
                          {todosPerfis.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              <span className="font-mono">{p.usuario}</span><span className="ml-1.5 text-muted-foreground">— {p.nome}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <p className="px-3 pb-2 text-[10px] text-amber-700 dark:text-amber-400">
                  O vínculo fica guardado na linha: as próximas importações mantêm enquanto o login do arquivo for o mesmo.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="mt-3 border-t pt-3">
            <Button variant="outline" onClick={imp.cancelar} disabled={gravando}>Cancelar</Button>
            <Button onClick={() => void imp.confirmar()} disabled={gravando || imp.conferindo || !!imp.bloqueio}>
              {gravando
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gravando… {imp.progresso}%</>
                : `Gravar ${relatorio.linhas.length} baixas`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Escolher o arquivo ───────────────────────────────────────────────────
  const lendo = imp.etapa === 'lendo';
  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogContent aria-describedby={undefined} className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-primary" /> {TITULO}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-sm text-muted-foreground">
            O 945 é o relatório com <strong>Id.Baixa, UF Coren e Split (Pague Play | Coren | Cofen)</strong>. Uma importação atualiza o
            recebimento diário e o Relatório de pagamento da diretoria. O relatório 58 (pagamento mensal) não entra aqui: ele vai no recorte Mês.
          </p>
          <FaixaCobertura945 cobertura={imp.cobertura} erro={imp.erroCobertura} dias={14} />
          <label className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-7 transition-colors ${lendo ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-primary/5'}`}>
            {lendo ? (
              <><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-sm font-medium text-primary">Lendo e conferindo o arquivo…</p></>
            ) : (
              <><FileSpreadsheet className="h-8 w-8 text-muted-foreground" /><p className="text-sm font-medium">Escolher o arquivo do 945</p><p className="text-xs text-muted-foreground">.xlsx · .xls</p></>
            )}
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" disabled={lendo} onChange={escolher} />
          </label>
        </div>
        <DialogFooter><Button variant="outline" onClick={fechar}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
