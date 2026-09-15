/**
 * Conciliação — as três camadas lado a lado.
 *
 * ## A pergunta que esta tela responde
 *
 * «No que eu preciso mexer?». Por isso ela abre com a contagem e só lista
 * quando alguém pede: uma lista de 2.800 linhas não responde nada.
 *
 * E a ordem não é alfabética nem por valor — é por trabalho:
 *
 *   1. divergente — prévia e geral discordam. Alguém tem de olhar.
 *   2. pendente   — a prévia tem, o geral ainda não. Continua contando.
 *   3. so_manual  — lançado na aba e nenhum relatório viu.
 *   4. so_geral   — normal, e fica por último de propósito.
 *
 * ## Pendente não é erro
 *
 * É a mesma regra que o 58 tem em relação ao 59 na cobrança: o que a prévia
 * trouxe e o oficial ainda não confirmou **continua contando**, marcado. O
 * relatório do setor é exportado num horário e o geral noutro — defasagem
 * dentro do dia é normal, e tratá-la como divergência produziria um alarme por
 * dia que ninguém mais leria.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Scale, ChevronRight, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  resumoDaConciliacao, buscarConciliacao,
  CLASSIFICACAO_LABEL,
  type ResumoConciliacao, type LinhaConciliacao, type ClassificacaoConciliacao,
} from '@/services/vendas/importacaoVendas.service';

const TOM: Record<ClassificacaoConciliacao, string> = {
  divergente: 'bg-destructive/15 text-destructive border-destructive/30',
  pendente:   'bg-warning/15 text-warning border-warning/30',
  so_manual:  'bg-warning/15 text-warning border-warning/30',
  so_geral:   'bg-muted text-muted-foreground border-border',
  conforme:   'bg-success/15 text-success border-success/30',
};

/** O que cada classificação quer dizer, na linguagem de quem vai agir. */
const EXPLICACAO: Record<ClassificacaoConciliacao, string> = {
  divergente: 'A prévia do setor e o relatório geral discordam em situação, assinatura ou valor. O geral é quem manda — confira o que mudou.',
  pendente:   'A prévia do setor trouxe e o geral ainda não. Continua contando, marcado. Se não aparecer no próximo geral, vale investigar.',
  so_manual:  'Alguém lançou na aba Vendas e nenhum dos dois relatórios viu. Ou é venda de hoje que ainda não entrou, ou é lançamento que não existe.',
  so_geral:   'Só o relatório geral tem. É o caso normal de venda cujo mês de VENDA é outro — o recorte da prévia não a alcança.',
  conforme:   'Prévia e geral dizem a mesma coisa.',
};

interface Props {
  empresaId: string | null;
  /** 'yyyy-MM' */
  mes: string;
}

function Celula({ existe, situacao, assinado, valor }: {
  existe: boolean; situacao: string | null; assinado: boolean | null; valor: number | null;
}) {
  if (!existe) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="whitespace-nowrap">
      {situacao ?? '?'}
      {assinado === true && <span className="ml-1 text-success" title="assinado">✓</span>}
      {assinado === false && <span className="ml-1 text-muted-foreground" title="sem assinatura">○</span>}
      {valor !== null && (
        <span className="ml-1.5 tabular-nums text-muted-foreground">{formatBRL(valor)}</span>
      )}
    </span>
  );
}

export function Conciliacao({ empresaId, mes }: Props) {
  const [resumo, setResumo] = useState<ResumoConciliacao[]>([]);
  const [linhas, setLinhas] = useState<LinhaConciliacao[]>([]);
  const [aberta, setAberta] = useState<ClassificacaoConciliacao | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [disponivel, setDisponivel] = useState(true);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    const r = await resumoDaConciliacao(empresaId, mes);
    setCarregando(false);
    if (!r.ok) {
      // A tela não grita quando a migration ainda não foi aplicada: ela some.
      setDisponivel(!/não foi instalada|does not exist/i.test(r.erro ?? ''));
      setResumo([]);
      return;
    }
    setDisponivel(true);
    setResumo(r.dado ?? []);
  }, [empresaId, mes]);

  useEffect(() => { void carregar(); setAberta(null); setLinhas([]); }, [carregar]);

  async function abrir(c: ClassificacaoConciliacao) {
    if (aberta === c) { setAberta(null); return; }
    if (!empresaId) return;
    setAberta(c);
    if (linhas.length === 0) {
      setCarregando(true);
      const r = await buscarConciliacao(empresaId, mes);
      setCarregando(false);
      if (!r.ok) { toast.error(r.erro ?? 'Não foi possível carregar a conciliação.'); return; }
      setLinhas(r.dado ?? []);
    }
  }

  const daClasse = useMemo(
    () => (aberta ? linhas.filter(l => l.classificacao === aberta) : []),
    [aberta, linhas],
  );

  const total = resumo.reduce((s, r) => s + r.linhas, 0);

  if (!disponivel) return null;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold">
          <Scale className="h-4 w-4 text-muted-foreground" aria-hidden />
          5. Conciliação — lançado × prévia × geral
        </h2>
        <p className="text-[11px] text-muted-foreground">
          {mes} · {total} NR{total === 1 ? '' : 's'}
        </p>
      </div>

      {total === 0 ? (
        <p className="py-6 text-center text-[12px] text-muted-foreground">
          {carregando
            ? 'Conferindo…'
            : 'Nada a conciliar neste mês. Importe a prévia do setor e o geral para comparar.'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {resumo.map(r => (
            <div key={r.classificacao}>
              <button
                type="button"
                onClick={() => void abrir(r.classificacao)}
                aria-expanded={aberta === r.classificacao}
                className={cn(
                  'flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-left transition-colors',
                  'hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  r.classificacao === 'divergente' ? 'border-destructive/30'
                  : r.classificacao === 'pendente' ? 'border-amber-500/40'
                  : 'border-border',
                )}
              >
                <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform',
                  aberta === r.classificacao && 'rotate-90')} aria-hidden />
                <Badge variant="outline" className={cn('text-[10px]', TOM[r.classificacao])}>
                  {CLASSIFICACAO_LABEL[r.classificacao]}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                  {EXPLICACAO[r.classificacao]}
                </span>
                <span className="tabular-nums text-[13px] font-semibold">{r.linhas}</span>
                <span className="w-32 text-right tabular-nums text-[12px] text-muted-foreground">
                  {formatBRL(r.valor)}
                </span>
              </button>

              {aberta === r.classificacao && (
                <div className="mt-1 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[720px] text-[12px]">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="py-1.5 pl-3 pr-3">NR</th>
                        <th className="py-1.5 pr-3">Operador</th>
                        <th className="py-1.5 pr-3">Registrada</th>
                        <th className="py-1.5 pr-3">Prévia do setor</th>
                        <th className="py-1.5 pr-3">Geral</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daClasse.slice(0, 200).map(l => (
                        <tr key={l.nr_documento} className="border-b border-border/50 last:border-b-0">
                          <td className="py-1.5 pl-3 pr-3 font-mono tabular-nums">{l.nr_documento}</td>
                          <td className="py-1.5 pr-3">{l.operador_nome ?? '—'}</td>
                          <td className="py-1.5 pr-3">
                            <Celula existe={l.venda_existe} situacao={l.venda_situacao}
                              assinado={l.venda_assinado} valor={l.venda_valor} />
                          </td>
                          <td className="py-1.5 pr-3">
                            <Celula existe={l.previa_existe} situacao={l.previa_situacao}
                              assinado={l.previa_assinado} valor={l.previa_valor} />
                          </td>
                          <td className="py-1.5 pr-3">
                            <Celula existe={l.geral_existe} situacao={l.geral_situacao}
                              assinado={l.geral_assinado} valor={l.geral_valor} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {daClasse.length > 200 && (
                    <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                      Mostrando 200 de {daClasse.length}.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}

          <div className="flex items-start gap-2 pt-1 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <p>
              A prévia recorta por <strong>data da venda</strong> e o geral por
              <strong> data de confirmação</strong>. Um NR que aparece só num dos dois pode
              estar certo nos dois — o «só no geral» é justamente isso.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
