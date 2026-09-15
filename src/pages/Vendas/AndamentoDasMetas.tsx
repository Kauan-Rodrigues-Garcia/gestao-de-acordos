/**
 * AndamentoDasMetas — como cada setor e cada equipe está indo, na régua dele.
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
 * ## Uma linha por recorte, nunca um total
 *
 * Somar metas medidas por réguas diferentes não significa nada: 161 vendas
 * mais R$ 962.136,00 não dá número nenhum. Cada linha aparece com a régua
 * dela, e a outra leitura vai ao lado em cinza.
 *
 * ## A equipe só entra quando alguém souber dizer qual é
 *
 * Até a Fase 8 este bloco mostrava apenas setor, e o motivo estava escrito
 * aqui: a meta de equipe era gravável, mas mostrá-la exigiria `equipe_id`
 * preenchido em toda venda — e a projeção só o preenche quando o vendedor tem
 * equipe no cadastro.
 *
 * A Fase 9 resolveu isso noutro lugar: `fn_vendas_placar_pessoas` devolve, por
 * pessoa, a equipe que CREDITA — a que o líder lidera, nunca `perfis.equipe_id`
 * (ver `fn_vendas_equipe_que_credita`, migration 20260915160000). Com o
 * cadastro na mão, `placarPorEquipe` monta o recorte sem depender do que ficou
 * congelado na venda.
 *
 * Sem o cadastro (`pessoas` ausente, ou a migration não aplicada), o bloco
 * volta a mostrar só setor. Ficar sem a linha de equipe é melhor do que
 * mostrá-la contando metade da equipe.
 *
 * ## A meta encolhe com a ausência, e diz que encolheu
 *
 * `presencaPorRecorte` liga a meta proporcional — o item que sobrou da Fase 8.
 * Uma equipe de 5 com 21 dias úteis tem 105 dias de trabalho; se dois
 * atestados comeram 10, ela teve 95, e cobrar 100% da meta é cobrar por um
 * trabalho que ninguém podia fazer.
 *
 * O número cheio continua na tela, riscado ao lado do ajustado. Meta que desce
 * sem explicação se lê como defeito, e a primeira pessoa a notar vai perguntar
 * se o sistema está somando direito.
 */
import { useMemo } from 'react';
import { Target, TriangleAlert, UserMinus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { resumirVendas, type EixoDaVenda, type ResumoVendas } from '@/lib/vendas';
import {
  progressoDaMeta, REGUA_LABEL,
  fatorDePresenca, ajustarMetaPorPresenca, rotuloDaPresenca,
  type PresencaDoRecorte,
} from '@/lib/vendasMeta';
import { placarPorEquipe, type IndicePessoas } from '@/lib/vendasPlacar';
import type { Venda } from '@/services/vendas/vendas.service';
import type { MetaDeRecorte } from '@/services/vendas/metasVendas.service';

interface Props {
  vendas: Venda[];
  metas: MetaDeRecorte[];
  eixo: EixoDaVenda;
  /** Dias úteis do mês e quantos já passaram — de `@/lib/diasUteis`. */
  uteis: number;
  trabalhados: number;
  /**
   * O cadastro de `fn_vendas_placar_pessoas`. Presente, liga a linha de equipe.
   */
  pessoas?: IndicePessoas;
  /**
   * A presença de cada recorte, por `referencia_id`. Presente, a meta daquele
   * recorte encolhe na proporção do mês que ele teve.
   */
  presencaPorRecorte?: ReadonlyMap<string, PresencaDoRecorte>;
}

/** Um recorte pronto para virar linha: a meta configurada e o que foi feito. */
interface LinhaDeMeta {
  chave: string;
  nome: string;
  tipo: 'setor' | 'equipe';
  meta: MetaDeRecorte;
  resumo: Pick<ResumoVendas, 'quantidade' | 'valor'>;
}

export function AndamentoDasMetas({
  vendas, metas, eixo, uteis, trabalhados, pessoas, presencaPorRecorte,
}: Props) {
  const linhas = useMemo((): LinhaDeMeta[] => {
    const comRegua = metas.filter(m => m.regua !== null);
    if (comRegua.length === 0) return [];

    // Setor vem da franquia e está sempre preenchido na venda projetada.
    const porSetor = new Map<string, Venda[]>();
    for (const v of vendas) {
      if (!v.setor_id) continue;
      const lista = porSetor.get(v.setor_id);
      if (lista) lista.push(v); else porSetor.set(v.setor_id, [v]);
    }

    // Equipe vem do cadastro, e só existe quando ele chegou.
    const porEquipe = pessoas
      ? new Map(placarPorEquipe(vendas, pessoas)
          .filter(e => e.equipeId !== null)
          .map(e => [e.equipeId as string, e.resumo]))
      : null;

    const saida: LinhaDeMeta[] = [];
    for (const m of comRegua) {
      if (m.tipo === 'setor') {
        saida.push({
          chave: `setor:${m.referencia_id}`, nome: m.nome, tipo: 'setor',
          meta: m, resumo: resumirVendas(porSetor.get(m.referencia_id) ?? []),
        });
      } else if (porEquipe) {
        saida.push({
          chave: `equipe:${m.referencia_id}`, nome: m.nome, tipo: 'equipe',
          meta: m, resumo: porEquipe.get(m.referencia_id) ?? resumirVendas([]),
        });
      }
    }

    // Setor antes de equipe: a conta do setor é a que fecha o mês, e a da
    // equipe é o detalhe dentro dela.
    return saida.sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === 'setor' ? -1 : 1;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }, [metas, vendas, pessoas]);

  if (linhas.length === 0) return null;

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
        <h2 className="text-[13px] font-semibold">Meta do mês</h2>
        <span className="text-[11px] text-muted-foreground">
          {trabalhados} de {uteis} dias úteis
        </span>
      </header>

      <div>
        {linhas.map(linha => (
          <LinhaDoAndamento
            key={linha.chave} linha={linha} uteis={uteis} trabalhados={trabalhados}
            presenca={presencaPorRecorte?.get(linha.meta.referencia_id)}
          />
        ))}
      </div>
    </section>
  );
}

function LinhaDoAndamento({
  linha, uteis, trabalhados, presenca,
}: {
  linha: LinhaDeMeta;
  uteis: number;
  trabalhados: number;
  presenca?: PresencaDoRecorte;
}) {
  const m = linha.meta;
  const cheia = { regua: m.regua, quantidade: m.quantidade, valor: m.valor };
  const fator = presenca ? fatorDePresenca(presenca) : null;
  const meta = ajustarMetaPorPresenca(cheia, fator);
  const explicacao = presenca ? rotuloDaPresenca(presenca, fator) : null;

  const a = progressoDaMeta({ meta, resumo: linha.resumo, uteis, trabalhados });
  const of = a.oficial!;
  const ritmo = a.ritmoOficial;
  const pct = of.pct === null ? 0 : Math.round(of.pct * 100);
  const noRitmo = (ritmo?.projecaoPct ?? 0) >= 1;

  const emRegua = (v: number) => (m.regua === 'quantidade' ? String(v) : formatBRL(v));
  const alvoCheio = m.regua === 'quantidade' ? cheia.quantidade : cheia.valor;

  // A leitura que NÃO decide, em cinza ao lado.
  const outra = m.regua === 'quantidade'
    ? `${formatBRL(a.valor.feito)}${a.valor.alvo > 0 ? ` de ${formatBRL(a.valor.alvo)}` : ''}`
    : `${a.quantidade.feito} venda${a.quantidade.feito === 1 ? '' : 's'}`
      + (a.quantidade.alvo > 0 ? ` de ${a.quantidade.alvo}` : '');

  return (
    <div className="space-y-1.5 border-b border-border/60 px-3 py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
          {linha.nome}
          {linha.tipo === 'equipe' && (
            <Badge variant="secondary" className="text-[10px] font-normal">equipe</Badge>
          )}
          <Badge variant="outline" className="text-[10px] font-normal">
            {REGUA_LABEL[m.regua!]}
          </Badge>
        </span>
        <span className="text-[12px] tabular-nums">
          <strong className={cn(of.bateu && 'text-success')}>{emRegua(of.feito)}</strong>
          <span className="text-muted-foreground">
            {' de '}{emRegua(of.alvo)}
            {/* O número cheio fica visível, riscado: a meta encolheu, e quem
                olha tem de conseguir ver de quanto ela encolheu. */}
            {explicacao && (
              <span className="ml-1 line-through opacity-60">{emRegua(alvoCheio)}</span>
            )}
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
                : <>Faltou {emRegua(of.falta)}</>}
            {ritmo.projecaoPct !== null && !of.bateu && (
              <> · ritmo {Math.round(ritmo.projecaoPct * 100)}%</>
            )}
          </span>
        )}
      </div>

      {explicacao && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <UserMinus className="h-3 w-3 shrink-0" aria-hidden />
          {explicacao}
        </p>
      )}
    </div>
  );
}
