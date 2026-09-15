/**
 * AndamentoDasMetas — como cada setor está indo, na régua dele.
 *
 * ## Só aparece no eixo da confirmação, e isso não é limitação
 *
 * A meta conta pela **data de confirmação** — é o eixo oficial. A aba Vendas
 * deixa trocar para o eixo da venda, e ali o mesmo mês tem outro conjunto de
 * linhas: venda de junho confirmada em setembro sai, venda de setembro ainda
 * aberta entra.
 *
 * Calcular a meta sobre esse recorte daria um número que parece certo e não é.
 * Então, no eixo da venda, este bloco diz que não está medindo — em vez de
 * medir errado.
 *
 * ## Uma linha por setor, não um total
 *
 * Somar metas de setores medidos por réguas diferentes não significa nada:
 * 161 vendas mais R$ 962.136,00 não dá número nenhum. Cada setor aparece com a
 * régua dele, e a outra leitura vai ao lado em cinza.
 */
import { useMemo } from 'react';
import { Target, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { resumirVendas, type EixoDaVenda } from '@/lib/vendas';
import { progressoDaMeta, REGUA_LABEL } from '@/lib/vendasMeta';
import type { Venda } from '@/services/vendas/vendas.service';
import type { MetaDeRecorte } from '@/services/vendas/metasVendas.service';

interface Props {
  vendas: Venda[];
  metas: MetaDeRecorte[];
  eixo: EixoDaVenda;
  /** Dias úteis do mês e quantos já passaram — de `@/lib/diasUteis`. */
  uteis: number;
  trabalhados: number;
}

export function AndamentoDasMetas({ vendas, metas, eixo, uteis, trabalhados }: Props) {
  /*
   * Só setor. A meta de equipe existe e é gravável, mas mostrá-la aqui
   * exigiria `equipe_id` preenchido em toda venda — e a projeção só o preenche
   * quando o vendedor tem equipe no cadastro. Setor vem da franquia e está
   * sempre lá.
   */
  const comRegua = useMemo(
    () => metas.filter(m => m.tipo === 'setor' && m.regua !== null),
    [metas],
  );

  const porSetor = useMemo(() => {
    const mapa = new Map<string, Venda[]>();
    for (const v of vendas) {
      if (!v.setor_id) continue;
      const lista = mapa.get(v.setor_id);
      if (lista) lista.push(v); else mapa.set(v.setor_id, [v]);
    }
    return mapa;
  }, [vendas]);

  if (comRegua.length === 0) return null;

  if (eixo !== 'confirmacao') {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          A meta conta pela <strong className="text-foreground">data de confirmação</strong>, e a
          tela está no eixo da venda. Volte para «Confirmação» para ver o andamento — medir sobre
          este recorte daria um número que parece certo e não é.
        </div>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <Target className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="text-[13px] font-semibold">Meta do mês, por setor</h2>
        <span className="text-[11px] text-muted-foreground">
          {trabalhados} de {uteis} dias úteis
        </span>
      </header>

      <div>
        {comRegua.map(m => {
          const resumo = resumirVendas(porSetor.get(m.referencia_id) ?? []);
          const a = progressoDaMeta({
            meta: { regua: m.regua, quantidade: m.quantidade, valor: m.valor },
            resumo, uteis, trabalhados,
          });
          const of = a.oficial!;
          const ritmo = a.ritmoOficial;
          const pct = of.pct === null ? 0 : Math.round(of.pct * 100);
          const noRitmo = (ritmo?.projecaoPct ?? 0) >= 1;

          // A leitura que NÃO decide, em cinza ao lado.
          const outra = m.regua === 'quantidade'
            ? `${formatBRL(a.valor.feito)}${a.valor.alvo > 0 ? ` de ${formatBRL(a.valor.alvo)}` : ''}`
            : `${a.quantidade.feito} venda${a.quantidade.feito === 1 ? '' : 's'}`
              + (a.quantidade.alvo > 0 ? ` de ${a.quantidade.alvo}` : '');

          return (
            <div key={m.referencia_id}
              className="space-y-1.5 border-b border-border/60 px-3 py-2.5 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="flex items-center gap-2 text-[13px] font-medium">
                  {m.nome}
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {REGUA_LABEL[m.regua!]}
                  </Badge>
                </span>
                <span className="text-[12px] tabular-nums">
                  <strong className={cn(of.bateu && 'text-success')}>
                    {m.regua === 'quantidade' ? of.feito : formatBRL(of.feito)}
                  </strong>
                  <span className="text-muted-foreground">
                    {' de '}
                    {m.regua === 'quantidade' ? of.alvo : formatBRL(of.alvo)}
                    {' · '}{pct}%
                  </span>
                </span>
              </div>

              <Progress value={Math.min(pct, 100)} className="h-1.5" />

              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>{outra}</span>
                {ritmo && (
                  <span className={cn('tabular-nums', !noRitmo && 'text-amber-600 dark:text-amber-400')}>
                    {of.bateu
                      ? 'Meta batida'
                      : ritmo.precisaPorDia !== null
                        ? <>Precisa de{' '}
                            <strong>
                              {m.regua === 'quantidade'
                                ? `${Math.ceil(ritmo.precisaPorDia)} por dia`
                                : `${formatBRL(ritmo.precisaPorDia)} por dia`}
                            </strong>
                          </>
                        : <>Faltou{' '}
                            {m.regua === 'quantidade' ? of.falta : formatBRL(of.falta)}
                          </>}
                    {ritmo.projecaoPct !== null && !of.bateu && (
                      <> · ritmo {Math.round(ritmo.projecaoPct * 100)}%</>
                    )}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
