/**
 * PixMetaPainel.tsx — a meta de Pix automático do setor.
 *
 * Responde ao líder: quanto o setor já fez de Pix no mês, quanto falta e se
 * está no ritmo (projeção).
 *
 * Só líder+ vê. Não é segredo — é que o operador enxerga apenas os próprios
 * acordos (RLS), e "faltam X para o setor" calculado com as linhas de uma
 * pessoa só seria um número errado apresentado como certo. `podeEditar` existe
 * para o dia em que houver um cargo que lê a meta sem poder mexer nela.
 *
 * ## Por que não é a meta de recebimento
 *
 * O valor do Pix automático já entra no recebimento pelo analítico, que é quem
 * faz esse papel. Somar de novo numa meta de recebimento contaria o mesmo
 * dinheiro duas vezes. Esta meta é só do Pix: existe para acompanhar o Pix em
 * si, e por isso mora em tabela própria (`pix_automatico_metas`).
 *
 * As contas ficam em `calcularMetaPix` (pura, com teste). A projeção usa a
 * mesma mecânica de dias úteis do dashboard, para os dois não discordarem.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Target, TrendingUp, CheckCircle2, Save, RefreshCw, Hash, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/index';
import { corProjecao } from '@/lib/diasUteis';
import { cn } from '@/lib/utils';
import type { ResumoMetaPix } from './pixAutomaticoView';

export interface PixMetaPainelProps {
  /** `null` = nenhuma meta definida para o setor neste mês. */
  resumo: ResumoMetaPix | null;
  nomeSetor?: string;
  /** Líder+ edita a meta; operador só lê. */
  podeEditar: boolean;
  /** Valores atuais no banco, para preencher os campos de edição. */
  metaValorAtual: number;
  metaAcordosAtual: number;
  salvando: boolean;
  onSalvar: (metaValor: number, metaAcordos: number) => void;
  /** Converte "1.234,56" digitado em número — o mesmo parser do resto da tela. */
  parseValor: (v: string) => number;
}

export function PixMetaPainel({
  resumo, nomeSetor, podeEditar,
  metaValorAtual, metaAcordosAtual, salvando, onSalvar, parseValor,
}: PixMetaPainelProps) {
  const [editando, setEditando]   = useState(false);
  const [valorInput, setValorInput]     = useState('');
  const [acordosInput, setAcordosInput] = useState('');

  /**
   * Abrir a edição sempre parte do que está SALVO — não do que ficou digitado
   * numa tentativa anterior, que já não é mais verdade. Feito aqui, no clique,
   * e não num efeito: efeito reagiria também à meta chegando do banco e
   * apagaria o que o líder está digitando no meio da frase.
   */
  function abrirEdicao() {
    setValorInput(metaValorAtual > 0
      ? metaValorAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '');
    setAcordosInput(metaAcordosAtual > 0 ? String(metaAcordosAtual) : '');
    setEditando(true);
  }

  function salvar() {
    const valor = valorInput.trim() ? parseValor(valorInput) : 0;
    const acordos = acordosInput.trim() ? parseInt(acordosInput.replace(/\D/g, ''), 10) : 0;
    if (isNaN(valor) || valor < 0)     return;
    if (isNaN(acordos) || acordos < 0) return;
    onSalvar(valor, Number.isFinite(acordos) ? acordos : 0);
    setEditando(false);
  }

  // ── Formulário de definição da meta ──────────────────────────────────────
  if (editando) {
    return (
      <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.03] p-4 space-y-3">
        <p className="text-xs font-semibold text-foreground">
          Meta de Pix Automático{nomeSetor ? ` · ${nomeSetor}` : ''} — mês atual
        </p>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
          <div className="space-y-1 flex-1 max-w-[220px]">
            <Label className="text-xs font-medium flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Meta de valor
            </Label>
            <Input value={valorInput} onChange={e => setValorInput(e.target.value)}
              placeholder="0,00" className="h-9 text-sm font-mono" />
          </div>
          <div className="space-y-1 flex-1 max-w-[180px]">
            <Label className="text-xs font-medium flex items-center gap-1">
              <Hash className="w-3 h-3" /> Meta de acordos
            </Label>
            <Input value={acordosInput} onChange={e => setAcordosInput(e.target.value)}
              placeholder="0" inputMode="numeric" className="h-9 text-sm font-mono" />
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <Button size="sm" variant="ghost" onClick={() => setEditando(false)}
              className="h-9 text-xs text-muted-foreground">
              Cancelar
            </Button>
            <Button size="sm" onClick={salvar} disabled={salvando} className="h-9 gap-1.5 text-xs">
              {salvando ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar meta
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Deixe em branco (ou zero) para não usar aquela meta. Esta meta é só do
          Pix automático — ela <strong>não</strong> entra na meta de recebimento,
          onde o valor do Pix já é contado pelo analítico.
        </p>
      </div>
    );
  }

  // ── Sem meta definida ────────────────────────────────────────────────────
  if (!resumo) {
    if (!podeEditar) return null;
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-4 py-3 flex flex-wrap items-center gap-3">
        <Target className="w-4 h-4 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground flex-1 min-w-[200px]">
          Nenhuma meta de Pix automático definida para{' '}
          {nomeSetor ? <strong>{nomeSetor}</strong> : 'este setor'} neste mês.
        </p>
        <Button size="sm" variant="outline" onClick={abrirEdicao} className="h-8 text-xs gap-1.5">
          <Target className="w-3.5 h-3.5" /> Definir meta
        </Button>
      </div>
    );
  }

  // ── Painel de acompanhamento ─────────────────────────────────────────────
  const pctBarra = Math.min(resumo.pctValor, 100);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className={cn(
        'rounded-xl border bg-gradient-to-br p-4',
        resumo.metaBatida
          ? 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/40'
          : 'from-sky-500/12 to-indigo-600/5 border-sky-500/25',
      )}>
        <div className="flex items-start gap-3">
          {resumo.metaBatida
            ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            : <Target className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-[11px] text-muted-foreground">
                Meta de Pix Automático{nomeSetor ? ` · ${nomeSetor}` : ''} — mês atual
              </p>
              {podeEditar && (
                <button onClick={abrirEdicao}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2">
                  Editar meta
                </button>
              )}
            </div>

            {/* Realizado × meta */}
            <div className="flex flex-wrap items-baseline gap-x-2 mt-0.5">
              <span className={cn('text-xl font-bold font-mono leading-tight',
                resumo.metaBatida ? 'text-emerald-400' : 'text-sky-400')}>
                {formatCurrency(resumo.realizado)}
              </span>
              {resumo.metaValor > 0 && (
                <span className="text-[11px] text-muted-foreground font-mono">
                  de {formatCurrency(resumo.metaValor)} · {resumo.pctValor}%
                </span>
              )}
            </div>

            {resumo.metaValor > 0 && (
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all',
                    resumo.metaBatida ? 'bg-emerald-400' : 'bg-sky-400')}
                  style={{ width: `${pctBarra}%` }}
                />
              </div>
            )}

            {/* Quanto falta, quantidade e projeção */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs">
              {resumo.metaValor > 0 && !resumo.metaBatida && (
                <span className="text-muted-foreground">
                  Faltam{' '}
                  <strong className="font-mono text-foreground">{formatCurrency(resumo.faltaValor)}</strong>
                </span>
              )}
              <span className="text-muted-foreground">
                <strong className="font-mono text-foreground">{resumo.acordos}</strong> acordo
                {resumo.acordos !== 1 ? 's' : ''}
                {resumo.metaAcordos > 0 && (
                  <>
                    {' '}de <span className="font-mono">{resumo.metaAcordos}</span>
                    {resumo.faltaAcordos > 0 && (
                      <> · faltam <strong className="font-mono text-foreground">{resumo.faltaAcordos}</strong></>
                    )}
                  </>
                )}
              </span>
              {resumo.projecao > 0 && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <TrendingUp className="w-3 h-3" />
                  Projeção{' '}
                  <strong className={cn('font-mono', corProjecao(resumo.projecao))}>
                    {resumo.projecao}%
                  </strong>
                </span>
              )}
            </div>

            {resumo.metaBatida ? (
              <p className="text-xs font-semibold text-emerald-400 mt-1.5">
                🏆 Meta de Pix batida neste mês!
              </p>
            ) : resumo.projecao > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {resumo.projecao >= 100
                  ? 'No ritmo de bater a meta até o fim do mês.'
                  : 'Abaixo do ritmo necessário para bater a meta até o fim do mês.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
