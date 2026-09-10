/**
 * Mestre59Diferenca — onde está cada centavo da diferença de um setor.
 *
 * ## Duas camadas, e a ordem importa
 *
 * **Estrutura** primeiro: as parcelas que separam os dois lados POR CONSTRUÇÃO
 * — Integral recebido, colchão fora da meta, equipe emprestada, ajuste manual.
 * Elas não são erro, e vê-las antes evita a caça a um defeito que não existe.
 *
 * **NRs** depois: a linha em que os dois lados discordam de verdade, com o
 * paradeiro do que falta — em outro setor, com outro operador, ou em lugar
 * nenhum.
 *
 * ## O «não explicado» aparece
 *
 * A soma das parcelas fecha com a diferença oficial em 9 dos 10 setores
 * vinculados, ao centavo. No Receptivo sobra R$ 307.160,04 — ele é a origem de
 * todo o Integral da operação, e o analítico dele tem NRs que nenhuma carteira
 * dele traz no 59.
 *
 * Mostrar zero ali seria mentir. A linha vermelha é o que faz alguém ir olhar.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  buscarDetalheDaDiferenca,
  type DiferencaDetalhe, type SituacaoNr,
} from '@/services/mestre/mestre.service';

/** O rótulo de cada paradeiro, na voz de quem lê a tela. */
const ROTULO: Record<SituacaoNr, string> = {
  so_no_59:               'Só no 59 — não existe no sistema',
  outro_setor:            'No sistema, mas em OUTRO setor',
  so_no_sistema:          'Só no sistema — nenhuma carteira do 59 traz',
  sistema_em_outro_setor: 'No 59, mas em carteira de OUTRO setor',
  valor_difere:           'Nos dois, com valores diferentes',
};

const COR: Record<SituacaoNr, string> = {
  so_no_59:               'text-warning',
  outro_setor:            'text-chart-4',
  so_no_sistema:          'text-destructive',
  sistema_em_outro_setor: 'text-chart-4',
  valor_difere:           'text-muted-foreground',
};

interface Props { empresaId: string; mes: string; setorId: string }

export function Mestre59Diferenca({ empresaId, mes, setorId }: Props) {
  const [d, setD] = useState<DiferencaDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<SituacaoNr | 'todos'>('todos');

  useEffect(() => {
    let vivo = true;
    setCarregando(true); setErro(null);
    buscarDetalheDaDiferenca(empresaId, mes, setorId)
      .then(r => { if (vivo) setD(r); })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao detalhar.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [empresaId, mes, setorId]);

  if (carregando) {
    return <div className="space-y-2 p-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-8" />)}</div>;
  }
  if (erro) {
    return <p className="px-4 py-3 text-xs text-destructive">{erro}</p>;
  }
  if (!d) return null;

  // Só as parcelas que existem. Uma linha «R$ 0,00» por parcela ausente vira
  // ruído numa tela cujo trabalho é destacar o que não é zero.
  const estrutura = d.estrutura.filter(e => Math.abs(e.valor) >= 0.01);
  const nrs = filtro === 'todos' ? d.nrs : d.nrs.filter(x => x.situacao === filtro);

  const situacoesPresentes = [...new Set(d.nrs.map(x => x.situacao))];

  return (
    <div className="space-y-4 bg-muted/20 px-5 py-4">

      {/* ── A conta, em linha ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="text-muted-foreground">Mestre</span>
        <span className="font-mono tabular-nums text-foreground">{formatBRL(d.mestreTotal)}</span>
        {Math.abs(d.contribIntegral) >= 0.01 && (
          <>
            <span className="text-muted-foreground">−</span>
            <span className="font-mono tabular-nums text-chart-4">{formatBRL(d.contribIntegral)}</span>
            <span className="text-[10px] text-muted-foreground">(Integral)</span>
          </>
        )}
        <span className="text-muted-foreground">=</span>
        <span className="font-mono tabular-nums font-semibold text-foreground">{formatBRL(d.comparavel)}</span>
        <span className="text-muted-foreground">−</span>
        <span className="font-mono tabular-nums text-muted-foreground">{formatBRL(d.sistemaTotal)}</span>
        <span className="text-[10px] text-muted-foreground">(sistema)</span>
        <span className="text-muted-foreground">=</span>
        <span className={cn('font-mono tabular-nums font-bold',
          d.diferenca < 0 ? 'text-destructive' : 'text-warning')}>
          {d.diferenca > 0 ? '+' : ''}{formatBRL(d.diferenca)}
        </span>
      </div>

      {/* ── Estrutura ─────────────────────────────────────────────────────── */}
      {estrutura.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Por que os dois lados diferem
          </h4>
          <div className="space-y-1">
            {estrutura.map(e => (
              <div key={e.chave} className="flex items-start gap-3 rounded-lg bg-card/60 px-3 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-foreground">{e.rotulo}</span>
                  <span className="block text-[10px] leading-snug text-muted-foreground">{e.nota}</span>
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">
                  {formatBRL(e.valor)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Os NRs ────────────────────────────────────────────────────────── */}
      {d.resumo.qtd === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum NR diverge: os dois lados têm exatamente os mesmos documentos, com os
          mesmos valores. A diferença é toda estrutural.
        </p>
      ) : (
        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {d.resumo.qtd} {d.resumo.qtd === 1 ? 'NR diverge' : 'NRs divergem'}
            </h4>
            <button type="button" onClick={() => setFiltro('todos')}
              className={cn('rounded border px-1.5 py-0.5 text-[10px] transition-colors',
                filtro === 'todos'
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground')}>
              todos
            </button>
            {situacoesPresentes.map(sit => (
              <button key={sit} type="button" onClick={() => setFiltro(sit)}
                className={cn('rounded border px-1.5 py-0.5 text-[10px] transition-colors',
                  filtro === sit
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground')}>
                {ROTULO[sit]}
              </button>
            ))}
          </div>

          <div className="max-h-80 overflow-y-auto rounded-lg border border-border/50">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-2.5 py-1.5 text-left font-semibold">NR</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">59</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">Sistema</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">Δ</th>
                  <th className="px-2.5 py-1.5 text-left font-semibold">Onde está</th>
                </tr>
              </thead>
              <tbody>
                {nrs.map(x => (
                  <tr key={x.nr} className="border-t border-border/30">
                    <td className="px-2.5 py-1.5 font-mono text-foreground">{x.nr}</td>
                    <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                      {x.mestre > 0 ? formatBRL(x.mestre) : '—'}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                      {x.sistema > 0 ? formatBRL(x.sistema) : '—'}
                    </td>
                    <td className={cn('px-2.5 py-1.5 text-right font-mono tabular-nums font-medium',
                      x.delta < 0 ? 'text-destructive' : 'text-warning')}>
                      {x.delta > 0 ? '+' : ''}{formatBRL(x.delta)}
                    </td>
                    <td className="px-2.5 py-1.5">
                      <span className={cn('text-[11px]', COR[x.situacao])}>{ROTULO[x.situacao]}</span>
                      {x.onde && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <ArrowRight className="h-2.5 w-2.5" />{x.onde}
                        </span>
                      )}
                      {/* Quem cobrou × quem lançou. É onde «outro operador»
                          aparece sem precisar de uma coluna própria. */}
                      {(x.cobradora || x.operador) && (
                        <span className="block text-[10px] text-muted-foreground">
                          {x.cobradora && <>59: {x.cobradora}</>}
                          {x.cobradora && x.operador && ' · '}
                          {x.operador && <>sistema: {x.operador}</>}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {d.nrsTruncado > 0 && (
            <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
              <Search className="h-2.5 w-2.5" />
              mostrando os {d.nrs.length} maiores · mais {d.nrsTruncado} não listados
            </p>
          )}
        </div>
      )}

      {/* ── O que não fecha ───────────────────────────────────────────────── */}
      {Math.abs(d.naoExplicado) >= 0.01 && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <div className="text-[11px] leading-relaxed">
            <span className="font-semibold text-destructive">
              {formatBRL(d.naoExplicado)} que as parcelas acima não explicam.
            </span>
            <span className="block text-muted-foreground">
              As parcelas fecham ao centavo na maioria dos setores. Aqui sobra — e sobrar
              significa dinheiro que só um dos lados conhece, por um caminho que esta tela
              ainda não mapeia. Vale investigar antes de usar o número.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
