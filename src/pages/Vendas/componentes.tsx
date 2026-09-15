/**
 * componentes.tsx — as peças que os painéis do Comercial repetem.
 *
 * Nasceu na Fase 9, quando a terceira tela ia copiar o mesmo `Faixa` e o mesmo
 * cabeçalho de bloco pela terceira vez. Três cópias de uma caixa de aviso é
 * como uma delas para de combinar com as outras sem ninguém notar.
 *
 * Só o que é forma. Nenhuma conta mora aqui — elas estão em `@/lib/vendas`,
 * `@/lib/vendasPlacar` e `@/lib/vendasMeta`, e é de propósito: um componente
 * que soma é um componente que precisa de teste de render para provar a soma.
 */
import type { LucideIcon } from 'lucide-react';
import { TriangleAlert, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { GAVETA_LABELS, GAVETA_COLORS, type GavetaVenda } from '@/lib/vendas';
import type { FatiaSimples, LinhaDoPlacar } from '@/lib/vendasPlacar';
import type { ReguaMeta } from '@/lib/vendasMeta';

/**
 * A caixa de aviso das telas de Vendas.
 *
 * `alerta` é âmbar e não vermelho: quase todo aviso daqui é «falta aplicar uma
 * migration» ou «o cadastro não respondeu» — coisas a fazer, não perdas. Quem
 * pinta de vermelho o que ainda dá para resolver ensina a ignorar vermelho.
 */
export function Faixa({
  tom, children,
}: { tom: 'alerta' | 'info'; children: React.ReactNode }) {
  const Icone = tom === 'alerta' ? TriangleAlert : Info;
  return (
    <div className={cn(
      'flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px]',
      tom === 'alerta'
        ? 'border-amber-500/40 bg-amber-500/5 text-foreground'
        : 'border-border bg-muted/30 text-muted-foreground',
    )}>
      <Icone className={cn('mt-0.5 h-4 w-4 shrink-0',
        tom === 'alerta' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Um bloco com cabeçalho e, quando não há o que desenhar, uma frase no lugar.
 *
 * `vazio` é texto e não `boolean` porque a frase certa muda: «ninguém devendo
 * assinatura» é notícia boa, «nenhuma pessoa no seu alcance» é explicação de
 * permissão, e «o cadastro não respondeu» é defeito. Um estado vazio genérico
 * apagaria a diferença entre os três.
 */
export function Bloco({
  titulo, Icone, sub, acao, children, vazio,
}: {
  titulo: string;
  Icone: LucideIcon;
  sub?: string;
  /** Um botão ou link no canto direito do cabeçalho. */
  acao?: React.ReactNode;
  children?: React.ReactNode;
  vazio?: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <Icone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="text-[13px] font-semibold">{titulo}</h2>
        {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
        {acao && <div className="ml-auto">{acao}</div>}
      </header>
      {vazio
        ? <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">{vazio}</p>
        : <div>{children}</div>}
    </section>
  );
}

export function EtiquetaGaveta({ gaveta }: { gaveta: GavetaVenda }) {
  return (
    <Badge variant="outline" className={cn('text-[10px] font-medium', GAVETA_COLORS[gaveta])}>
      {GAVETA_LABELS[gaveta]}
    </Badge>
  );
}

/**
 * A barra de uma fatia — estado, forma de pagamento, setor.
 *
 * Largura em porcentagem, `div` dentro de `div`, sem biblioteca de gráfico. As
 * variáveis de tema deste projeto são `oklch`, e `hsl(var(--primary))` — a
 * forma que todo exemplo de biblioteca usa — apaga o gráfico sem erro nenhum
 * no console. Para uma barra horizontal, CSS puro é mais barato do que acertar
 * a ponte. Ver `useChartColors` para o caso em que a ponte vale a pena.
 *
 * O piso de 2% existe para a fatia minúscula continuar visível: uma barra de
 * largura zero se lê como ausência, e ausência é outra coisa.
 */
export function Barra({
  fatia, formatar = formatBRL,
}: { fatia: FatiaSimples; formatar?: (v: number) => string }) {
  return (
    <div className="space-y-1 px-3 py-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="min-w-0 truncate font-medium">{fatia.rotulo}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {fatia.quantidade} · <strong className="text-foreground">{formatar(fatia.valor)}</strong>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary/70"
          style={{ width: `${Math.max(2, Math.round(fatia.fracao * 100))}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Uma linha de ranking de pessoa.
 *
 * A régua decide o que vai em negrito à direita e o que vai em cinza ao lado —
 * a leitura que não decide continua na tela, porque um setor que bate o
 * dinheiro com metade das vendas está vendendo caro, e isso é informação.
 *
 * Devolução e cancelamento só aparecem quando existem. Uma coluna de «0% / 0%»
 * repetida trinta vezes treina o olho a pular a coluna inteira, inclusive na
 * linha em que ela tem número.
 */
export function LinhaDoRanking({
  linha, posicao, regua, equipeVisivel = true,
}: {
  linha: LinhaDoPlacar;
  /** `null` esconde a coluna — usada quando a lista não é uma disputa. */
  posicao: number | null;
  regua: ReguaMeta;
  equipeVisivel?: boolean;
}) {
  const r = linha.resumo;
  const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
  const perdeu = (r.pctDevolucao ?? 0) + (r.pctCancelamento ?? 0) > 0;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-accent/30">
      {posicao !== null && (
        <span className="w-5 shrink-0 text-right text-[12px] font-semibold tabular-nums text-muted-foreground">
          {posicao}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{linha.nome}</span>
      {equipeVisivel && linha.equipeNome && (
        <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
          {linha.equipeNome}
        </span>
      )}
      {r.porGaveta.pendente_assinatura > 0 && (
        <Badge variant="outline" className={cn('text-[10px]', GAVETA_COLORS.pendente_assinatura)}>
          {r.porGaveta.pendente_assinatura} sem assinar
        </Badge>
      )}
      {perdeu && (
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          dev {pct(r.pctDevolucao)} · canc {pct(r.pctCancelamento)}
        </span>
      )}
      <span className="w-14 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
        {regua === 'quantidade' ? formatBRL(r.valor) : `${r.quantidade}v`}
      </span>
      <span className="w-24 shrink-0 text-right text-[13px] font-semibold tabular-nums">
        {regua === 'quantidade' ? r.quantidade : formatBRL(r.valor)}
      </span>
    </div>
  );
}

/**
 * A faixa «Fora da meta»: o que a régua deixou de fora, com nome e valor.
 *
 * Existe em toda tela de Vendas pelo mesmo motivo — o que não conta não some.
 * Some `na_meta` da lista, que é justamente o que está dentro.
 */
export function ForaDaMeta({
  porGaveta, valorPorGaveta, ordem,
}: {
  porGaveta: Record<GavetaVenda, number>;
  valorPorGaveta: Record<GavetaVenda, number>;
  ordem: readonly GavetaVenda[];
}) {
  const visiveis = ordem.filter(g => g !== 'na_meta' && porGaveta[g] > 0);
  if (visiveis.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Fora da meta
      </span>
      {visiveis.map(g => (
        <span key={g} className="flex items-center gap-1.5 text-[12px]">
          <EtiquetaGaveta gaveta={g} />
          <span className="tabular-nums text-muted-foreground">
            {porGaveta[g]} · {formatBRL(valorPorGaveta[g])}
          </span>
        </span>
      ))}
    </div>
  );
}
