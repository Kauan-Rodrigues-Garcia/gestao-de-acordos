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
import { FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react';
import { getTodayISO } from '@/lib/index';
import { SkeletonCard, BannerNaoTabulado } from '@/components/AnalyticsPanel/SubComponents';
import { usePainelMetas } from '@/hooks/usePainelMetas';
import { FaixaDiasUteis } from './FaixaDiasUteis';
import { CardsMetas } from './CardsMetas';
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
  secundarios,
}: PainelMetasProps) {
  const [secundariosAbertos, setSecundariosAbertos] = useState(false);

  const dados = usePainelMetas({
    mes,
    setorId:    setorFiltro,
    equipeId:   equipeFiltroExterno,
    operadorId: operadorFiltroExterno,
    temLogicaDiretoExtra,
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

          <EvolucaoDiaria
            porDia={dados.porDia}
            agendadoPorDia={dados.agendadoPorDia}
            mes={mes}
            metaDiaria={dados.projecao?.metaDiaria ?? null}
            // Mês fechado não tem "hoje" para destacar. `getTodayISO` e não
            // `new Date()`: o dia tem que ser o de São Paulo, não o da máquina.
            diaDeHoje={dados.noMesAtual ? Number(getTodayISO().slice(8, 10)) : null}
          />
        </>
      )}

      {secundarios && (
        <div className="space-y-2">
          <button
            onClick={() => setSecundariosAbertos(v => !v)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {secundariosAbertos
              ? <ChevronUp className="w-3.5 h-3.5" />
              : <ChevronDown className="w-3.5 h-3.5" />}
            {secundariosAbertos ? 'Ocultar' : 'Ver'} agendamentos e conversão
          </button>
          {secundariosAbertos && secundarios}
        </div>
      )}
    </motion.div>
  );
}
