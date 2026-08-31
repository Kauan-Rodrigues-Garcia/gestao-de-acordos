/**
 * PainelMetas — o corpo do painel de métricas do Dashboard.
 *
 * Substitui o conteúdo antigo (cards soltos + dois gráficos) em vez de somar
 * mais um bloco à tela. A faixa "Dados Analíticos" continua sendo o cabeçalho,
 * com o seletor de mês — este componente é o que vem abaixo dela, e por isso
 * recebe o `mes` de fora em vez de ter um seletor próprio: duas navegações de
 * mês na mesma área é como os dois lados saem de sincronia.
 *
 * Divisão de trabalho:
 *   `usePainelMetas`  decide os números (e delega escopo e matemática)
 *   este arquivo      decide o que aparece
 *   `CardsMetas` e `EvolucaoDiaria`  desenham
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileSpreadsheet, ChevronDown, ChevronUp, CalendarClock } from 'lucide-react';
import { getTodayISO } from '@/lib/index';
import { SkeletonCard, BannerNaoTabulado } from '@/components/AnalyticsPanel/SubComponents';
import { usePainelMetas } from '@/hooks/usePainelMetas';
import type { UnidadeValor } from '@/lib/unidadeValor';
import { FaixaDiasUteis } from './FaixaDiasUteis';
import { CardsMetas } from './CardsMetas';
import { CardMetaDupla } from './CardMetaDupla';
import { EvolucaoDiaria } from './EvolucaoDiaria';

interface PainelMetasProps {
  /** Mês em análise — controlado pelo cabeçalho "Dados Analíticos". */
  mes: string;
  /** Os MESMOS filtros que o painel de cima usa para resolver o escopo. */
  setorFiltro?: string | null;
  equipeFiltroExterno?: string | null;
  operadorFiltroExterno?: string | null;
  temLogicaDiretoExtra?: boolean;
  /**
   * H.O. ou bruto. Vem de fora pelo mesmo motivo que o `mes`: o alternador
   * mora na faixa "Dados Analíticos", que é o cabeçalho deste painel. Dois
   * controles da mesma coisa em alturas diferentes é como os lados divergem.
   */
  unidade?: UnidadeValor;
  /**
   * Cards que sobreviveram do painel antigo (Agendado, Não Pagos, Ticket
   * médio…). Ficam recolhidos: são úteis, mas competiriam com os números de
   * meta, que são o motivo desta tela existir.
   */
  secundarios?: React.ReactNode;
}

export function PainelMetas({
  mes,
  setorFiltro,
  equipeFiltroExterno,
  operadorFiltroExterno,
  temLogicaDiretoExtra = false,
  unidade,
  secundarios,
}: PainelMetasProps) {
  const [secundariosAbertos, setSecundariosAbertos] = useState(false);

  const dados = usePainelMetas({
    mes,
    setorId:    setorFiltro,
    equipeId:   equipeFiltroExterno,
    operadorId: operadorFiltroExterno,
    temLogicaDiretoExtra,
    unidade,
  });

  if (dados.carregando) {
    return (
      <div className="space-y-3">
        <div className="h-9 rounded-lg bg-muted/30 animate-pulse" />
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="h-[270px] rounded-xl bg-muted/25 animate-pulse" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-3"
      data-tour="meta-progresso"
    >
      <FaixaDiasUteis
        passados={dados.diasUteisPassados}
        restantes={dados.diasUteisRestantes}
        total={dados.diasUteisTotal}
      />

      {/* Relatório ausente: a régua do mês continua útil, o resto não. Uma
          parede de R$ 0,00 pareceria desempenho ruim, e não falta de dado. */}
      {dados.semRelatorio ? (
        <div className="flex items-start gap-2.5 px-4 py-4 rounded-xl border border-border bg-muted/20">
          <FileSpreadsheet className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <p className="font-semibold text-foreground">
              Nenhum recebimento importado neste mês
            </p>
            <p className="text-muted-foreground">
              Os números aparecem assim que o relatório analítico for importado.
              Enquanto isso, a contagem de dias úteis acima já vale.
            </p>
          </div>
        </div>
      ) : (
        <>
          <BannerNaoTabulado
            valor={dados.naoTabulado}
            qtd={dados.naoTabuladoQtd}
            totalAnalitico={dados.totalRecebido}
          />

          <CardsMetas dados={dados} mes={mes} />

          {/* Só para quem tem meta indireta ligada. O card grande acima já
              mostra a SOMA das duas frentes — este diz de onde ela vem. */}
          <CardMetaDupla
            dupla={dados.metaDupla}
            rotuloUnidade={dados.unidade === 'ho' ? 'H.O.' : 'valor bruto'}
          />

          <EvolucaoDiaria
            porDia={dados.porDia}
            agendadoPorDia={dados.agendadoPorDia}
            mes={mes}
            unidade={dados.unidade}
            metaDiaria={dados.projecao?.metaDiaria ?? null}
            // Mês fechado não tem "hoje" para destacar. `getTodayISO` e não
            // `new Date()`: o dia tem que ser o de São Paulo, não o da máquina.
            diaDeHoje={dados.noMesAtual ? Number(getTodayISO().slice(8, 10)) : null}
          />
        </>
      )}

      {secundarios && (
        <div className="space-y-3">
          {/*
            Era um link de 11px em `text-muted-foreground`, indistinguível de
            legenda: quem não sabia que existia não achava. Vira um alvo de
            largura inteira, com area de toque de dedo e contraste de card.
          */}
          <button
            type="button"
            onClick={() => setSecundariosAbertos(v => !v)}
            aria-expanded={secundariosAbertos}
            className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarClock className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">
                Agendamentos e conversão
              </span>
              <span className="block text-xs text-muted-foreground">
                {secundariosAbertos
                  ? 'Clique para ocultar'
                  : 'Agendado por dia, taxa de conversão e quebra por tipo'}
              </span>
            </span>
            {secundariosAbertos
              ? <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
              : <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />}
          </button>
          {secundariosAbertos && secundarios}
        </div>
      )}
    </motion.div>
  );
}
