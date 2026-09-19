/**
 * CardDoMes — o anel do Dashboard do Comercial, com três vistas.
 *
 * ## É o `CardMetaDonut` da cobrança, com o assunto trocado
 *
 * Mesma estrutura, mesmas proporções, mesma altura fixa (`ALTURA_CARD_PROGRESSO`):
 * cabeçalho com ícone em quadrado tingido, anel de 180px, rodapé com o valor
 * escrito. O time já lê essa peça de relance na cobrança, e ensinar outra forma
 * para dizer a mesma coisa custaria a leitura de relance sem devolver nada.
 *
 * O que muda é que aqui há **três** perguntas, e não duas:
 *
 *   Meta ....... quanto do alvo já foi feito. Só existe com meta configurada.
 *   Régua ...... das vendas do mês, quantas ficaram de pé — e onde foram parar
 *                as que não ficaram.
 *   Formas ..... como o cliente pagou.
 *
 * ## A vista de abertura depende do que existe
 *
 * Com meta, abre na meta: é a pergunta que a liderança faz primeiro. **Sem
 * meta, abre na régua** — e não numa meta vazia. O Comercial tem zero metas
 * configuradas hoje, e um anel em 0% com «R$ 0,00 de R$ 0,00» se lê como mês
 * ruim, não como configuração faltando. O convite para configurar vai no
 * rodapé, onde ele é acionável em vez de decorativo.
 *
 * ## A régua é a vista que o Comercial não tinha em lugar nenhum
 *
 * «Fora da meta» existia como uma fileira de etiquetas, sem proporção: 9
 * pendentes ao lado de 131 na régua ocupavam o mesmo espaço visual. No anel a
 * fatia tem o tamanho do dinheiro que ela representa, que é como a perda se
 * enxerga.
 */
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Target, Scale, CreditCard, ArrowUpRight, ChevronRight } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DonutChart } from '@/components/AnalyticsPanel/SubComponents';
import { BREAKDOWN_COLORS } from '@/components/AnalyticsPanel/constants';
import { ALTURA_CARD_PROGRESSO } from '@/components/PainelMetas/tamanhoCards';
import { corDaMeta } from '@/components/PainelMetas/metaDonut';
import { PontoDaLegenda } from '@/components/PainelMetas/PontoDaLegenda';
import { formatBRL } from '@/lib/money';
import { pctLimitado } from '@/lib/projecaoMetas';
import { ROUTE_PATHS } from '@/lib/index';
import { cn } from '@/lib/utils';
import { GAVETAS_EM_ORDEM, type ResumoVendas } from '@/lib/vendas';
import { fatiasDaRegua } from '@/lib/vendasDashboard';
import type { FatiaSimples } from '@/lib/vendasPlacar';
import type { ReguaMeta } from '@/lib/vendasMeta';
import { corTexto } from '@/lib/temas';

type Vista = 'meta' | 'regua' | 'formas';

const TITULO: Record<Vista, string> = {
  meta:   'Progresso da meta',
  regua:  'Onde as vendas pararam',
  formas: 'Formas de pagamento',
};

const ICONE: Record<Vista, typeof Target> = {
  meta: Target, regua: Scale, formas: CreditCard,
};

function formatarPct(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

interface CardDoMesProps {
  resumo: ResumoVendas;
  /** As formas de pagamento já fatiadas, de `vendasPorFormaDePagamento`. */
  formas: readonly FatiaSimples[];
  /**
   * A meta do setor, quando existe. `null` tira a vista «Meta» do card e liga
   * o convite do rodapé.
   */
  meta: { alvo: number; feito: number; regua: ReguaMeta; nome: string } | null;
  /** Liga o link para a tela de metas. Sem a chave, o rodapé só informa. */
  podeConfigurarMeta: boolean;
}

export function CardDoMes({ resumo, formas, meta, podeConfigurarMeta }: CardDoMesProps) {
  const fatiasRegua = useMemo(
    () => fatiasDaRegua(resumo, GAVETAS_EM_ORDEM),
    [resumo],
  );

  // As vistas possíveis HOJE. Sem meta são duas, e o botão alterna entre elas;
  // com uma só ele desaparece, em vez de virar um botão que não faz nada.
  const vistas = useMemo((): Vista[] => {
    const v: Vista[] = [];
    if (meta) v.push('meta');
    if (fatiasRegua.length > 0) v.push('regua');
    if (formas.length > 0) v.push('formas');
    return v;
  }, [meta, fatiasRegua.length, formas.length]);

  const [vista, setVista] = useState<Vista>(meta ? 'meta' : 'regua');
  // A vista guardada pode ter deixado de existir — trocar de mês tira a meta,
  // e um card preso numa vista vazia mostraria um anel em branco.
  const atual = vistas.includes(vista) ? vista : (vistas[0] ?? 'regua');
  const proxima = vistas[(vistas.indexOf(atual) + 1) % Math.max(1, vistas.length)];

  const Icone = ICONE[atual];
  const pctMeta = meta ? pctLimitado(meta.feito, meta.alvo) : 0;
  const corTopo = atual === 'meta' ? corDaMeta(pctMeta) : '#6366f1';

  if (vistas.length === 0) {
    return (
      <Card className={cn('flex flex-col border-border/70 bg-card shadow-sm', ALTURA_CARD_PROGRESSO)}>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-muted">
              <Scale className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            Onde as vendas pararam
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center pb-5">
          <p className="max-w-[220px] text-center text-xs text-muted-foreground">
            Nenhuma venda neste mês. O anel volta assim que a primeira for
            confirmada — ou assim que o relatório do mês for importado.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('flex flex-col border-border/70 bg-card shadow-sm', ALTURA_CARD_PROGRESSO)}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 min-w-0">
            <div
              className="flex items-center justify-center w-6 h-6 rounded-md shrink-0"
              style={{ background: corTopo + '22' }}
            >
              <Icone className="w-3.5 h-3.5" style={{ color: corTexto(corTopo) }} />
            </div>
            <span className="truncate">{TITULO[atual]}</span>
          </CardTitle>
          {vistas.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-foreground px-2 shrink-0"
              onClick={() => setVista(proxima)}
            >
              {TITULO[proxima]}
              <ChevronRight className="w-3 h-3" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 pb-4">
        <AnimatePresence mode="wait">
          {atual === 'meta' && meta ? (
            <Transicao key="meta">
              <div className="flex h-full flex-col items-center justify-center gap-4">
                <DonutChart
                  percent={pctMeta}
                  label={`${pctMeta}%`}
                  sublabel="da meta"
                  color={corDaMeta(pctMeta)}
                  size={180}
                />
                <div className="text-center space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono tabular-nums font-semibold text-foreground">
                      {meta.regua === 'quantidade' ? meta.feito : formatBRL(meta.feito)}
                    </span>
                    {' de '}
                    <span className="font-mono tabular-nums">
                      {meta.regua === 'quantidade' ? meta.alvo : formatBRL(meta.alvo)}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground/80">
                    meta de {meta.nome}
                  </p>
                  {pctMeta >= 100 && (
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-500 flex items-center justify-center gap-1">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      Meta atingida!
                    </p>
                  )}
                </div>
              </div>
            </Transicao>
          ) : atual === 'regua' ? (
            <Transicao key="regua">
              <Anel
                fatias={fatiasRegua.map(f => ({
                  label: f.rotulo, valor: f.valor, qtd: f.quantidade, perc: f.perc, cor: f.cor,
                }))}
                rodape={!meta ? (
                  <ConviteDeMeta podeConfigurar={podeConfigurarMeta} />
                ) : null}
              />
            </Transicao>
          ) : (
            <Transicao key="formas">
              <Anel
                fatias={formas.map((f, i) => ({
                  label: f.rotulo,
                  valor: f.valor,
                  qtd: f.quantidade,
                  perc: Math.round(f.fracao * 1000) / 10,
                  cor: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length],
                }))}
                rodape={null}
              />
            </Transicao>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

/** A moldura de transição das três vistas — a mesma do `CardMetaDonut`. */
function Transicao({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.22 }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}

interface FatiaDoAnel {
  label: string;
  valor: number;
  qtd: number;
  perc: number;
  cor: string;
}

/**
 * O anel com legenda — a vista de breakdown, igual à das formas na cobrança.
 *
 * A lista rola por dentro em vez de esticar o card: a altura é fixa para o
 * card não pular a cada clique no alternador, que foi pedido em 14/09/2026.
 */
function Anel({ fatias, rodape }: { fatias: FatiaDoAnel[]; rodape: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex shrink-0 flex-col items-center">
        <ResponsiveContainer width="100%" height={146}>
          <PieChart>
            <Pie
              data={fatias}
              cx="50%" cy="50%"
              innerRadius={42}
              outerRadius={66}
              paddingAngle={3}
              dataKey="valor"
              isAnimationActive
              animationBegin={60}
              animationDuration={700}
            >
              {fatias.map(f => (
                <Cell key={f.label} fill={f.cor} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: '10px',
                border: '1px solid rgba(148,163,184,0.2)',
                background: 'var(--popover)',
                color: 'var(--popover-foreground)',
                fontSize: '11px',
                padding: '6px 10px',
              }}
              formatter={(valor: number, _nome: string, props: { payload?: FatiaDoAnel }) => [
                `${formatBRL(valor)} (${formatarPct(props.payload?.perc ?? 0)}%)`,
                props.payload?.label ?? '',
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {fatias.map(f => <LinhaDaFatia key={f.label} fatia={f} />)}
      </div>

      {rodape}
    </div>
  );
}

function LinhaDaFatia({ fatia }: { fatia: FatiaDoAnel }) {
  return (
    <div className="flex items-center gap-2.5">
      <PontoDaLegenda cor={fatia.cor} />
      <span className="text-xs flex-1 truncate font-medium">{fatia.label}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-muted-foreground tabular-nums font-mono">
          {formatBRL(fatia.valor)}
        </span>
        <span className="text-[11px] text-muted-foreground">{fatia.qtd}</span>
        <span
          className="text-xs font-bold tabular-nums font-mono px-1.5 py-0.5 rounded"
          style={{ background: fatia.cor + '18', color: corTexto(fatia.cor) }}
        >
          {formatarPct(fatia.perc)}%
        </span>
      </div>
    </div>
  );
}

/**
 * O rodapé que aparece no lugar da vista «Meta» enquanto não houver meta.
 *
 * É um convite, e não um aviso de erro: não há nada quebrado em um setor que
 * ainda não configurou a meta do mês. Sem a chave de metas ele não vira link —
 * mandar alguém para uma tela que a permissão fecha é pior do que não mandar.
 */
function ConviteDeMeta({ podeConfigurar }: { podeConfigurar: boolean }) {
  const texto = 'Sem meta configurada neste mês — o anel do progresso aparece assim que ela existir.';
  return (
    <div className="shrink-0 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2">
      <p className="text-[11px] leading-snug text-muted-foreground">
        {podeConfigurar ? (
          <>
            {texto}{' '}
            <Link to={`${ROUTE_PATHS.ADMIN_USUARIOS}?tab=metas`} className="font-medium text-primary hover:underline">
              Configurar agora
            </Link>
          </>
        ) : texto}
      </p>
    </div>
  );
}
