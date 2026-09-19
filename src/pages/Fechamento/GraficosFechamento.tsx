/**
 * GraficosFechamento — os quatro gráficos da planilha, como cards do Gestão.
 *
 *   Funcionários por quartil ... barras, uma por faixa, nas cores de `COR_QUARTIL`
 *   Percentual por quartil ..... a pizza da aba Quartis (`PizzaQuartis3D`)
 *   Funcionários por situação .. barras na ordem da planilha, as treze
 *   Percentual por situação .... barras da maior para a menor, só quem tem gente
 *
 * ## Por que situação não ganha treze cores
 *
 * Treze matizes não se distinguem — e a identidade de cada barra já está escrita
 * no eixo. A situação usa um tom só (o mesmo azul do gráfico do Dashboard – ADM);
 * cor por categoria fica para o quartil, que tem quatro faixas e cores que o
 * Gestão inteiro já associa a elas.
 *
 * O texto nunca veste a cor da série: valor e rótulo ficam na tinta do tema.
 */
import { useTheme } from 'next-themes';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAxisColors } from '@/hooks/useChartColors';
import { ehTemaEscuro } from '@/lib/temas';
import { COR_QUARTIL } from '@/lib/diasUteis';
import { cn } from '@/lib/utils';
import { PizzaQuartis3D } from '@/pages/Dashboard/Analitico/PizzaQuartis3D';
import { rotuloSituacao } from '@/services/fechamentoOperadores/situacoes';
import type { ResumoFechamento } from '@/services/fechamentoOperadores/calculoFechamento';

const COR_SITUACAO = { claro: '#0075a9', escuro: '#0096c9' };

function formatarPct(fracao: number): string {
  return `${(fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function operadores(qtd: number): string {
  return `${qtd} ${qtd === 1 ? 'operador' : 'operadores'}`;
}

interface PontoBarra {
  rotulo: string;
  qtd: number;
  pct: number;
  cor: string;
}

interface PropsTooltip {
  active?: boolean;
  payload?: { payload?: PontoBarra }[];
}

function TooltipBarra({ active, payload }: PropsTooltip) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      <p className="flex items-center gap-2 font-medium text-foreground">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.cor }} aria-hidden />
        {p.rotulo}
      </p>
      <p className="mt-1 tabular-nums text-muted-foreground">
        {operadores(p.qtd)} · {formatarPct(p.pct)}
      </p>
    </div>
  );
}

function CardGrafico({
  titulo, sub, children, className,
}: { titulo: string; sub: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('h-full', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{titulo}</CardTitle>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Vazio({ texto, altura }: { texto: string; altura: number }) {
  return (
    <p className="flex items-center justify-center text-center text-xs italic text-muted-foreground"
       style={{ height: altura }}>
      {texto}
    </p>
  );
}

function BarrasHorizontais({
  pontos, altura, larguraRotulo, valor,
}: {
  pontos: PontoBarra[];
  altura: number;
  larguraRotulo: number;
  valor: 'qtd' | 'pct';
}) {
  const { tickColor } = useAxisColors();
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={pontos} layout="vertical" margin={{ top: 0, right: 44, bottom: 0, left: 0 }}
                barCategoryGap={4}>
        <XAxis type="number" hide allowDecimals={false} domain={[0, 'dataMax']} />
        <YAxis
          type="category" dataKey="rotulo" width={larguraRotulo}
          tick={{ fontSize: 10, fill: tickColor }} tickLine={false} axisLine={false}
        />
        <Tooltip content={<TooltipBarra />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
        <Bar dataKey={valor} radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false}>
          {pontos.map(p => <Cell key={p.rotulo} fill={p.cor} />)}
          <LabelList
            dataKey={valor}
            position="right"
            formatter={(v: number) => (valor === 'pct' ? formatarPct(v) : String(v))}
            style={{ fill: tickColor, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GraficosFechamento({ resumo }: { resumo: ResumoFechamento }) {
  const { resolvedTheme } = useTheme();
  const corSituacao = ehTemaEscuro(resolvedTheme) ? COR_SITUACAO.escuro : COR_SITUACAO.claro;

  const quartis: PontoBarra[] = resumo.porQuartil.map(q => ({
    rotulo: `${q.quartil}º quartil`,
    qtd: q.qtd,
    pct: q.pct,
    cor: COR_QUARTIL[q.quartil] ?? '#6366f1',
  }));

  const situacoes: PontoBarra[] = resumo.porSituacao.map(s => ({
    rotulo: rotuloSituacao(s.codigo),
    qtd: s.qtd,
    pct: s.pct,
    cor: corSituacao,
  }));

  const situacoesComGente = situacoes
    .filter(s => s.qtd > 0)
    .sort((a, b) => b.pct - a.pct);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <CardGrafico
        titulo="Funcionários por quartil"
        sub={`Operadores com meta no mês · ${operadores(resumo.totalComQuartil)}`}
      >
        {resumo.totalComQuartil === 0
          ? <Vazio texto="Nenhum operador com meta neste recorte." altura={150} />
          : <BarrasHorizontais pontos={quartis} altura={150} larguraRotulo={72} valor="qtd" />}
      </CardGrafico>

      <CardGrafico
        titulo="Percentual por quartil"
        sub="Representatividade de cada faixa entre os operadores com meta"
      >
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <PizzaQuartis3D fatias={resumo.porQuartil} total={resumo.totalComQuartil} largura={220} />
          {resumo.totalComQuartil > 0 && (
            <ul className="space-y-1.5 text-xs">
              {quartis.map(q => (
                <li key={q.rotulo} className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: q.cor }} aria-hidden />
                  <span className="w-20 text-muted-foreground">{q.rotulo}</span>
                  <span className="font-mono font-semibold tabular-nums text-foreground">{formatarPct(q.pct)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardGrafico>

      <CardGrafico
        titulo="Funcionários por situação"
        sub={`Situação informada no fechamento · ${operadores(resumo.comSituacao)}`}
      >
        {resumo.comSituacao === 0
          ? <Vazio texto="Nenhuma situação preenchida neste mês." altura={200} />
          : <BarrasHorizontais pontos={situacoes} altura={situacoes.length * 22} larguraRotulo={118} valor="qtd" />}
      </CardGrafico>

      <CardGrafico
        titulo="Percentual por situação"
        sub="Sobre quem tem situação preenchida — só as situações com operador"
      >
        {situacoesComGente.length === 0
          ? <Vazio texto="Nenhuma situação preenchida neste mês." altura={200} />
          : (
            <BarrasHorizontais
              pontos={situacoesComGente}
              altura={Math.max(situacoesComGente.length * 28, 90)}
              larguraRotulo={118}
              valor="pct"
            />
          )}
      </CardGrafico>
    </div>
  );
}
