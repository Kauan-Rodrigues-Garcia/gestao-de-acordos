/**
 * CardsMetas — a grade de cards do painel de metas.
 *
 * ## Organização
 *
 * Duas faixas, cada uma respondendo uma pergunta:
 *
 *   1. **quanto entrou**  — total, a separação por vínculo e a última baixa
 *   2. **estou no ritmo** — o donut da meta à esquerda e, à direita, os quatro
 *      números de projeção num bloco 2×2 que estica para casar a altura
 *
 * O donut ocupa uma coluna inteira e os cards de projeção ficam colados a ele:
 * é a comparação que o operador faz de relance (o quanto já fiz × o quanto
 * deveria ter feito), e separá-los em faixas distintas obrigava a subir e
 * descer os olhos.
 *
 * As formas de pagamento (Pix, Boleto, Cartão…) NÃO ficam aqui: viraram o
 * breakdown do próprio donut. Como fileira de cards eram sete ou oito números
 * competindo com meta e projeção, que é o que a tela veio dizer.
 *
 * Card que não tem o que dizer NÃO é renderizado. Um R$ 0,00 na tela parece
 * dado real e não é: sem meta some a faixa 2 inteira, sem a lógica Direto/Extra
 * somem os cards de vínculo. Os grids são `auto-fit` para não abrir buraco.
 */

import { motion } from 'framer-motion';
import {
  DollarSign, Wallet, Sparkles, Target, CalendarCheck, Gauge, Layers,
  TrendingUp, TrendingDown, History, FileWarning,
} from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { COR_QUARTIL, corProjecao } from '@/lib/diasUteis';
import { MetricCard } from '@/components/AnalyticsPanel/SubComponents';
import { containerVariants } from '@/components/AnalyticsPanel/constants';
import { CardMetaDonut } from './CardMetaDonut';
import type { DadosPainelMetas } from '@/hooks/usePainelMetas';

/** Grade que se reacomoda sozinha conforme cards entram e saem. */
const DIAS_SEMANA = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado',
] as const;

/** "Segunda-feira (10/08/2026)" a partir do dia do mês. */
function rotuloDoDia(dia: number, mes: string): string {
  const [ano, m] = mes.split('-').map(Number);
  const d = new Date(ano, m - 1, dia);
  const dd = String(dia).padStart(2, '0');
  return `${DIAS_SEMANA[d.getDay()]} (${dd}/${String(m).padStart(2, '0')}/${ano})`;
}

/** Percentual com uma casa e vírgula decimal — o resto da tela é pt-BR. */
function formatarPct(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

interface CardsMetasProps {
  dados: DadosPainelMetas;
  mes: string;
}

export function CardsMetas({ dados, mes }: CardsMetasProps) {
  const {
    totalRecebido, totalRecebidoOposto, diretoExtra, extraTabulado, meta, metaOposta,
    projecao, escopoRotulo, modoAgregado,
    diasUteisTotal, diasUteisPassados, baixaAnterior, porForma, unidade,
  } = dados;

  /**
   * A PaguePlay alterna entre H.O. e bruto; a BookPlay só tem bruto e nunca
   * mostra a linha secundária (seria "Bruto: R$ 0,00" ao lado do próprio total).
   */
  const mostraOposta = unidade === 'ho';
  const rotuloTotal = unidade === 'ho' ? 'H.O. recebido' : 'Total recebido';

  /**
   * Só vale separar por vínculo quando existe vínculo para separar.
   *
   * Setor que ainda não tabulou devolve direto = extra = 0 e tudo em "sem
   * vínculo" — três cards para dizer "não sabemos", sendo que dois deles são
   * R$ 0,00. O aviso de não tabulado logo acima já conta essa história.
   */
  const temVinculoParaMostrar = !!diretoExtra
    && (diretoExtra.direto > 0 || diretoExtra.extra > 0 || (extraTabulado?.bruto ?? 0) > 0);

  /**
   * PaguePlay: o extra vem da TABULAÇÃO, não do relatório — lá ele nunca chega
   * pelo analítico (0 de 1.859 linhas com "Tipo comissão" em agosto/2026).
   *
   * Quando existe, ele SUBSTITUI o número do analítico neste card, porque o do
   * analítico é zero por construção. Fora da PaguePlay é `null` e o card segue
   * lendo o vínculo do relatório, como sempre.
   */
  const extraDeTabulacao = extraTabulado && extraTabulado.qtd > 0 ? extraTabulado : null;

  /**
   * Os três valores de vínculo na unidade ativa.
   *
   * A DECISÃO de mostrar continua sendo pelo bruto (acima): "existe vínculo
   * classificado" é um fato do relatório, não da unidade — e no H.O. um valor
   * pequeno arredondaria para perto de zero sem que o vínculo tivesse sumido.
   */
  const vinculo = diretoExtra && {
    direto:      unidade === 'ho' ? diretoExtra.diretoHO      : diretoExtra.direto,
    extra:       unidade === 'ho' ? diretoExtra.extraHO       : diretoExtra.extra,
    naoTabulado: unidade === 'ho' ? diretoExtra.naoTabuladoHO : diretoExtra.naoTabulado,
  };

  const corProj = projecao ? corProjecao(projecao.projecaoPct) : COR_QUARTIL[4];
  const corQuartil = projecao?.quartil
    ? COR_QUARTIL[projecao.quartil.quartil] ?? COR_QUARTIL[2]
    : COR_QUARTIL[2];

  // Meta batida não mostra "faltam -R$ 4.000" — mostra que bateu.
  const faltaParaMeta = meta !== null ? meta - totalRecebido : null;
  const metaBatida = faltaParaMeta !== null && faltaParaMeta <= 0;
  const pctDaMeta = meta && meta > 0
    ? Math.round((totalRecebido / meta) * 1000) / 10
    : 0;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-3"
    >
      {/* UMA grade só: à esquerda todos os cards de valor em duas colunas
          iguais, à direita o donut ocupando a terceira.

          Antes eram duas faixas independentes, e o número de cards de cada uma
          mudava conforme o setor: sem Direto/Extra a primeira ficava com dois
          cards esticados enquanto a de baixo tinha quatro estreitos, e a tela
          parecia montada errada. Com uma grade só, card que some é card que
          não ocupa trilha — o resto continua alinhado sozinho. */}
      <div className="grid gap-3 lg:grid-cols-3 items-start">
        <div className="lg:col-span-2 grid gap-3 sm:grid-cols-2">
        <MetricCard
          label={rotuloTotal}
          icon={<DollarSign className="w-4 h-4" />}
          accentColor={COR_QUARTIL[1]}
          gradientFrom={COR_QUARTIL[1]}
          trend="up"
          value={<span className="text-emerald-500">{formatBRL(totalRecebido)}</span>}
          sub={[
            meta !== null ? `Meta ${escopoRotulo}: ${formatBRL(meta)}` : null,
            // A outra unidade fica na MESMA linha de apoio, não num card ao
            // lado: dois números grandes competindo foi o defeito que este
            // painel veio corrigir.
            mostraOposta
              ? `Bruto: ${formatBRL(totalRecebidoOposto)}${metaOposta !== null ? ` de ${formatBRL(metaOposta)}` : ''}`
              : null,
            modoAgregado ? 'Receptivo não entra: é por setor' : null,
          ].filter(Boolean).join(' · ') || undefined}
        />

        {/* Direto × Extra saem do MESMO analítico do total acima: a linha é
            classificada pelo vínculo do acordo tabulado. O que não tem acordo
            vira "sem vínculo", e por isso os três fecham o total. */}
        {temVinculoParaMostrar && diretoExtra && vinculo && (
          <>
            <MetricCard
              label="Recebimento direto"
              icon={<Wallet className="w-4 h-4" />}
              accentColor="#6366f1"
              gradientFrom="#6366f1"
              value={<span className="text-indigo-500">{formatBRL(vinculo.direto)}</span>}
              sub={`${diretoExtra.qtdDireto} pagamento${diretoExtra.qtdDireto !== 1 ? 's' : ''}`}
            />
            {/* O extra da PaguePlay sai da tabulação e NÃO está somado no total
                acima — não conta em meta, projeção nem quartil. A linha de
                apoio diz isso, senão alguém soma de cabeça e estranha a
                diferença. */}
            <MetricCard
              label="Recebimento extra"
              icon={<Sparkles className="w-4 h-4" />}
              accentColor="#f59e0b"
              gradientFrom="#f59e0b"
              value={
                <span className="text-amber-500">
                  {formatBRL(extraDeTabulacao
                    ? (unidade === 'ho' ? extraDeTabulacao.ho : extraDeTabulacao.bruto)
                    : vinculo.extra)}
                </span>
              }
              sub={extraDeTabulacao
                ? `${extraDeTabulacao.qtd} acordo${extraDeTabulacao.qtd !== 1 ? 's' : ''} pago${extraDeTabulacao.qtd !== 1 ? 's' : ''} · fora da meta, só acompanhamento`
                : `${diretoExtra.qtdExtra} pagamento${diretoExtra.qtdExtra !== 1 ? 's' : ''}`}
            />
            {diretoExtra.naoTabulado > 0 && (
              <MetricCard
                label="Sem vínculo definido"
                icon={<FileWarning className="w-4 h-4" />}
                accentColor="#94a3b8"
                gradientFrom="#94a3b8"
                value={<span className="text-muted-foreground">{formatBRL(vinculo.naoTabulado)}</span>}
                sub={`${diretoExtra.qtdNaoTabulado} pagamento${diretoExtra.qtdNaoTabulado !== 1 ? 's' : ''} sem acordo tabulado`}
              />
            )}
          </>
        )}

        {baixaAnterior && (
          <MetricCard
            label="Recebido baixa anterior"
            icon={<History className="w-4 h-4" />}
            accentColor="#0ea5e9"
            gradientFrom="#0ea5e9"
            value={<span className="text-sky-500">{formatBRL(baixaAnterior.bruto)}</span>}
            sub={`${rotuloDoDia(baixaAnterior.dia, mes)} · ${baixaAnterior.qtd} registro${baixaAnterior.qtd !== 1 ? 's' : ''}`}
          />
        )}

        {/* Os quatro números de projeção. Todos são o MESMO componente que os
            de cima, de propósito: mesma altura, mesmo respiro, mesma
            hierarquia de tipografia. */}
        {projecao && (
          <>
            <MetricCard
              label="Projeção"
              icon={<Gauge className="w-4 h-4" />}
              accentColor={corProj}
              gradientFrom={corProj}
              trend={projecao.projecaoPct >= 100 ? 'up' : 'down'}
              value={<span style={{ color: corProj }}>{projecao.projecaoPct}%</span>}
              sub="do esperado até hoje"
            />

            <MetricCard
              label="Valor esperado"
              icon={<CalendarCheck className="w-4 h-4" />}
              accentColor="#6366f1"
              gradientFrom="#6366f1"
              value={formatBRL(projecao.esperado)}
              sub={`Com base em ${diasUteisPassados} de ${diasUteisTotal} dias úteis`}
            />

            <MetricCard
              label="Diferença para projeção"
              icon={projecao.diferenca >= 0
                ? <TrendingUp className="w-4 h-4" />
                : <TrendingDown className="w-4 h-4" />}
              accentColor={projecao.diferenca >= 0 ? COR_QUARTIL[1] : COR_QUARTIL[4]}
              gradientFrom={projecao.diferenca >= 0 ? COR_QUARTIL[1] : COR_QUARTIL[4]}
              trend={projecao.diferenca >= 0 ? 'up' : 'down'}
              value={(
                <span style={{ color: projecao.diferenca >= 0 ? COR_QUARTIL[1] : COR_QUARTIL[4] }}>
                  {projecao.diferenca >= 0 ? '+ ' : '− '}
                  {formatBRL(Math.abs(projecao.diferenca))}
                </span>
              )}
              sub={projecao.diferenca >= 0 ? 'Acima da meta projetada' : 'Abaixo da meta projetada'}
            />

            {projecao.quartil && (
              <MetricCard
                label="Análise por quartil"
                icon={<Layers className="w-4 h-4" />}
                accentColor={corQuartil}
                gradientFrom={corQuartil}
                value={(
                  <span style={{ color: corQuartil }}>
                    {projecao.quartil.quartil}º Quartil
                  </span>
                )}
                sub={metaBatida
                  ? `Meta alcançada — ${formatarPct(pctDaMeta)}% dela`
                  : `Faltam ${formatBRL(faltaParaMeta ?? 0)} · ${formatarPct(pctDaMeta)}% da meta`}
              />
            )}
          </>
        )}
        </div>

        {/* O donut fecha a grade pela DIREITA: os números correm da esquerda
            para a direita e o anel é a conclusão deles, não a abertura. */}
        {meta !== null && (
          <CardMetaDonut
            recebido={totalRecebido}
            meta={meta}
            escopoRotulo={escopoRotulo}
            porForma={porForma}
          />
        )}
      </div>

      {/* Ranking e "faça X hoje para subir de quartil" nunca ficaram aqui: eram
          do `MetaProgressoHeader`, abaixo da saudação, removido em 16/08/2026.
          O Dashboard não mostra mais ranking pessoal em lugar nenhum — quem
        quiser trazer de volta, traga para UM lugar só. */}

      {/* Sem meta o painel não fica mudo: diz por que a faixa de projeção não
          está lá, em vez de simplesmente não ter nada. */}
      {!projecao && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1">
          <Target className="w-3.5 h-3.5 shrink-0" />
          Sem meta cadastrada para este mês — progresso da meta, projeção, valor
          esperado e quartil aparecem assim que a meta for definida na aba Metas.
        </p>
      )}
    </motion.div>
  );
}
