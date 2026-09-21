/**
 * MinhaParteNaMeta — o bloco de meta de quem só enxerga as próprias vendas.
 *
 * ## O defeito que isto conserta
 *
 * Até 21/09/2026 o operador via o mesmo «Meta do mês» do líder: a meta do
 * SETOR inteiro contra as vendas DELE — a RLS só entrega as dele. Um operador
 * com R$ 40 mil lia «R$ 40.000 de R$ 900.000 · 4%» e entendia que o setor
 * estava em 4%. O número parecia certo e não era.
 *
 * Agora a pergunta é outra, e tem resposta honesta com o que ele enxerga:
 * **quanto da meta da minha equipe eu já fiz, e onde eu chego no ritmo de
 * hoje.** A meta é a da equipe que credita a venda dele (a de
 * `fn_vendas_placar_pessoas`); sem ela, a do setor; sem nenhuma, o bloco
 * mostra só o ritmo.
 */
import { Target, TrendingUp } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { formatBRL } from '@/lib/money';
import type { ResumoVendas } from '@/lib/vendas';
import type { MetaDeRecorte } from '@/services/vendas/metasVendas.service';
import type { PessoaComAusencia } from '@/services/vendas/placar.service';

interface Props {
  metas: readonly MetaDeRecorte[];
  eu: PessoaComAusencia | null;
  resumo: Pick<ResumoVendas, 'quantidade' | 'valor'>;
  uteis: number;
  trabalhados: number;
}

export function MinhaParteNaMeta({ metas, eu, resumo, uteis, trabalhados }: Props) {
  const daEquipe = eu?.equipe_id
    ? metas.find(m => m.tipo === 'equipe' && m.referencia_id === eu.equipe_id && m.regua)
    : undefined;
  const doSetor = eu?.setor_id
    ? metas.find(m => m.tipo === 'setor' && m.referencia_id === eu.setor_id && m.regua)
    : undefined;
  const meta = daEquipe ?? doSetor ?? null;

  const porQuantidade = meta?.regua === 'quantidade';
  const feito = porQuantidade ? resumo.quantidade : resumo.valor;
  const alvo = meta ? (porQuantidade ? meta.quantidade : meta.valor) : 0;
  const escrever = (v: number) => (porQuantidade ? `${Math.round(v)} venda${Math.round(v) === 1 ? '' : 's'}` : formatBRL(v));

  // Projeção linear por dia útil — a mesma conta do ritmo do líder.
  const projecao = trabalhados > 0 ? (feito / trabalhados) * uteis : null;
  const pct = alvo > 0 ? Math.round((feito / alvo) * 100) : null;

  if (feito === 0 && !meta) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <Target className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="text-[13px] font-semibold">Sua parte no mês</h2>
        <span className="text-[11px] text-muted-foreground">{trabalhados} de {uteis} dias úteis</span>
      </header>
      <div className="grid gap-4 px-3 py-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          {meta ? (
            <>
              <p className="text-[12px] text-muted-foreground">
                Você fez <strong className="font-mono text-foreground">{escrever(feito)}</strong>
                {pct !== null && <> — <strong className="text-foreground">{pct}%</strong></>} da meta
                {daEquipe ? ' da equipe ' : ' do setor '}
                <strong className="text-foreground">{meta.nome}</strong> ({escrever(alvo)}).
              </p>
              <Progress value={Math.min(pct ?? 0, 100)} className="h-1.5" />
            </>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              Você fez <strong className="font-mono text-foreground">{escrever(feito)}</strong> na meta este mês.
              A meta da equipe ainda não foi configurada.
            </p>
          )}
        </div>
        {projecao !== null && feito > 0 && (
          <p className="flex items-start gap-2 text-[12px] text-muted-foreground">
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            <span>
              No seu ritmo de hoje, você fecha o mês com{' '}
              <strong className="font-mono text-foreground">{escrever(projecao)}</strong>
              {' '}— {escrever(feito / trabalhados)} por dia útil.
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
