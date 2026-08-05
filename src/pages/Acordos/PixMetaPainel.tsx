/**
 * PixMetaPainel.tsx — meta de Pix automático, equipe a equipe.
 *
 * Responde ao líder, para cada equipe do setor: quanto já fez de Pix no mês,
 * quanto falta e se está no ritmo (projeção). No fim, o total do setor.
 *
 * ## A meta do setor não é digitada
 *
 * Ela é a SOMA das metas das equipes — Bryan, Luciana, Matheus. Guardar também
 * um total do setor criaria dois lugares para a mesma verdade, e um deles
 * ficaria velho na primeira alteração.
 *
 * ## Por que não é a meta de recebimento
 *
 * O valor do Pix automático já entra no recebimento pelo analítico, que é quem
 * faz esse papel. Somar de novo numa meta de recebimento contaria o mesmo
 * dinheiro duas vezes. Esta meta é só do Pix: existe para acompanhar o Pix em
 * si, e por isso mora em tabela própria (`pix_automatico_metas`).
 *
 * Só líder+ vê. Não é segredo — é que o operador enxerga apenas os próprios
 * acordos (RLS), e "faltam X para a equipe" calculado com as linhas de uma
 * pessoa só seria um número errado apresentado como certo.
 *
 * As contas ficam em `calcularMetaPixPorEquipe` (pura, com teste). A projeção
 * usa a mesma mecânica de dias úteis do dashboard, para os dois não discordarem.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Target, TrendingUp, CheckCircle2, Save, RefreshCw, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/index';
import { corProjecao } from '@/lib/diasUteis';
import type { ConsolidadoMetaPix, ResumoMetaPix } from './pixAutomaticoView';

export interface EquipeOpcao { id: string; nome: string }

export interface PixMetaPainelProps {
  consolidado: ConsolidadoMetaPix | null;
  nomeSetor?: string;
  /** Equipes do setor — inclusive as que ainda não têm meta. */
  equipes: EquipeOpcao[];
  /** Metas salvas: equipe_id → valor, para preencher a edição. */
  metasAtuais: Record<string, number>;
  podeEditar: boolean;
  salvando: boolean;
  onSalvar: (equipeId: string, metaValor: number) => void;
  /** Converte "1.234,56" digitado em número — o mesmo parser do resto da tela. */
  parseValor: (v: string) => number;
}

/** Barra + projeção de uma linha (equipe ou total do setor). */
function Progresso({ r }: { r: ResumoMetaPix }) {
  const cor = corProjecao(r.projecao);
  return (
    <div className="space-y-1 min-w-[150px]">
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(r.pctValor, 100)}%`, background: cor }}
        />
      </div>
      <div className="flex items-center justify-between text-[10.5px] text-muted-foreground tabular-nums">
        <span>{r.pctValor}% da meta</span>
        <span className="inline-flex items-center gap-1" style={{ color: cor }}>
          <TrendingUp className="w-3 h-3" /> {r.projecao}%
        </span>
      </div>
    </div>
  );
}

export function PixMetaPainel({
  consolidado, nomeSetor, equipes, metasAtuais,
  podeEditar, salvando, onSalvar, parseValor,
}: PixMetaPainelProps) {
  const [editandoEquipe, setEditandoEquipe] = useState<string | null>(null);
  const [valorInput, setValorInput]         = useState('');

  /**
   * Abrir a edição parte do que está SALVO — não do que ficou digitado numa
   * tentativa anterior, que já não é mais verdade. Feito aqui, no clique, e não
   * num efeito: efeito reagiria também à meta chegando do banco e apagaria o
   * que o líder está digitando no meio da frase.
   */
  function abrir(equipeId: string) {
    const atual = metasAtuais[equipeId] ?? 0;
    setEditandoEquipe(equipeId);
    setValorInput(atual > 0
      ? atual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '');
  }

  function salvar(equipeId: string) {
    const valor = valorInput.trim() ? parseValor(valorInput) : 0;
    if (isNaN(valor) || valor < 0) return;
    onSalvar(equipeId, valor);
    setEditandoEquipe(null);
  }

  const porEquipe = new Map((consolidado?.equipes ?? []).map(e => [e.equipeId, e.resumo]));
  const semNenhumaMeta = !consolidado?.setor;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="border-border">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Target className="w-4 h-4 text-violet-400" />
              Meta de Pix automático{nomeSetor ? ` · ${nomeSetor}` : ''}
            </span>
            {consolidado?.setor && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatCurrency(consolidado.setor.realizado)} de{' '}
                <strong className="text-foreground">{formatCurrency(consolidado.setor.metaValor)}</strong>
                {consolidado.setor.metaBatida && (
                  <span className="ml-1.5 text-emerald-500 font-semibold inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> batida
                  </span>
                )}
              </span>
            )}
          </div>

          {semNenhumaMeta && (
            <p className="text-xs text-muted-foreground">
              Nenhuma equipe com meta de Pix definida neste mês. A meta do setor é a soma das metas das equipes.
            </p>
          )}

          {/* Uma linha por equipe do setor */}
          <div className="rounded-lg border border-border divide-y divide-border">
            {equipes.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground text-center">
                Nenhuma equipe neste setor.
              </p>
            )}
            {equipes.map(eq => {
              const r = porEquipe.get(eq.id) ?? null;
              const emEdicao = editandoEquipe === eq.id;
              return (
                <div key={eq.id} className="px-3 py-2.5 flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-medium min-w-[110px] flex-1 truncate">{eq.nome}</span>

                  {emEdicao ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        value={valorInput}
                        onChange={e => setValorInput(e.target.value)}
                        placeholder="Meta R$"
                        className="h-8 w-32 text-xs"
                      />
                      <Button size="sm" className="h-8 gap-1 text-xs" disabled={salvando}
                        onClick={() => salvar(eq.id)}>
                        {salvando ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Salvar
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 px-2"
                        onClick={() => setEditandoEquipe(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      {r ? (
                        <>
                          <span className="text-xs tabular-nums text-muted-foreground min-w-[150px]">
                            {formatCurrency(r.realizado)} de{' '}
                            <strong className="text-foreground">{formatCurrency(r.metaValor)}</strong>
                            {r.faltaValor > 0 && (
                              <span className="ml-1">· faltam {formatCurrency(r.faltaValor)}</span>
                            )}
                          </span>
                          <span className="text-[10.5px] text-muted-foreground tabular-nums shrink-0">
                            {r.acordos} acordo(s)
                          </span>
                          <Progresso r={r} />
                        </>
                      ) : (
                        <span className="text-[11px] text-muted-foreground flex-1">sem meta definida</span>
                      )}
                      {podeEditar && (
                        <button
                          title={r ? 'Editar a meta desta equipe' : 'Definir a meta desta equipe'}
                          onClick={() => abrir(eq.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-violet-400 hover:bg-violet-500/10 shrink-0"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Total do setor — a soma das equipes acima */}
          {consolidado?.setor && (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold min-w-[110px] flex-1">Total do setor</span>
              <span className="text-xs tabular-nums text-muted-foreground min-w-[150px]">
                {formatCurrency(consolidado.setor.realizado)} de{' '}
                <strong className="text-foreground">{formatCurrency(consolidado.setor.metaValor)}</strong>
                {consolidado.setor.faltaValor > 0 && (
                  <span className="ml-1">· faltam {formatCurrency(consolidado.setor.faltaValor)}</span>
                )}
              </span>
              <span className="text-[10.5px] text-muted-foreground tabular-nums shrink-0">
                {consolidado.setor.acordos} acordo(s)
              </span>
              <Progresso r={consolidado.setor} />
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
