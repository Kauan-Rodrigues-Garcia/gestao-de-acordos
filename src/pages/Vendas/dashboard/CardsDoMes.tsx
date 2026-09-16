/**
 * CardsDoMes — a grade de números do Dashboard do Comercial.
 *
 * É o `MetricCard` da cobrança, o mesmo componente, com os números do
 * Comercial: barrinha de acento à esquerda, gradiente sutil, tipografia mono
 * tabular e o ícone tingido pelo tom do card. Nada aqui foi redesenhado — o
 * pedido de 15/09/2026 foi «a mesma estética, com as informações do Comercial»,
 * e a forma mais segura de obedecer é usar a peça, não copiá-la.
 *
 * ## Card que não tem o que dizer não é renderizado
 *
 * A regra vem do `CardsMetas`, e vale mais ainda aqui: sem meta configurada não
 * há projeção; sem robô não há automação; num mês sem devolução nem
 * cancelamento, uma dupla de «0% / 0%» treina o olho a pular o card inteiro —
 * inclusive no mês em que ele tem número. A grade é `auto-fit`, então card que
 * some não deixa buraco.
 *
 * ## As setas de tendência são de verdade
 *
 * No painel da cobrança o `trend` é decorativo — `trend="up"` escrito na mão em
 * todo card. Aqui ele só aparece quando existe o mesmo número no mês anterior
 * para comparar, e some quando não existe. Hoje ele some em todos: o Comercial
 * tem setembro carregado e agosto ainda não importado.
 *
 * ## A régua aparece na linha de apoio, sempre
 *
 * Todo número desta tela é «confirmada E assinada». O que fica de fora não
 * some — vai no anel «Onde as vendas pararam», ao lado.
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign, ShoppingBag, Receipt, Gauge, PenLine, Percent, Wallet, Undo2,
} from 'lucide-react';
import { MetricCard, type TrendDirection } from '@/components/AnalyticsPanel/SubComponents';
import { containerVariants } from '@/components/AnalyticsPanel/constants';
import { AnelProjecao } from '@/components/PainelMetas/AnelProjecao';
import { ValorAnimado } from '@/components/ValorAnimado';
import { formatBRL } from '@/lib/money';
import { COR_QUARTIL, corProjecao } from '@/lib/diasUteis';
import type { ResumoVendas } from '@/lib/vendas';
import type { TotalDoRecorte } from '@/lib/vendasPlacar';
import type { AndamentoDaMeta } from '@/lib/vendasMeta';
import {
  ticketMedio, aproveitamento, coberturaDeRecebimento, variacao,
} from '@/lib/vendasDashboard';

/** Um card já resolvido — o que a grade precisa saber para desenhar. */
interface Cartao {
  chave: string;
  label: string;
  icone: React.ReactNode;
  cor: string;
  valor: React.ReactNode;
  sub?: string;
  trend?: TrendDirection;
}

interface CardsDoMesProps {
  resumo: ResumoVendas;
  total: TotalDoRecorte;
  /** O andamento da meta do setor, quando há meta. Liga o card de ritmo. */
  andamento: AndamentoDaMeta | null;
  /** O mês anterior, para as setas. `null` quando não há com que comparar. */
  anterior: ResumoVendas | null;
}

function pctTexto(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`;
}

export function CardsDoMes({ resumo, total, andamento, anterior }: CardsDoMesProps) {
  const cartoes = useMemo((): Cartao[] => {
    const ticket = ticketMedio(resumo);
    const aprov = aproveitamento(resumo);
    const cobertura = coberturaDeRecebimento(resumo);
    const pendentes = resumo.porGaveta.pendente_assinatura;
    const perdidas = resumo.porGaveta.devolvida + resumo.porGaveta.cancelada;

    const varDe = (atual: number, pegar: (r: ResumoVendas) => number) =>
      anterior ? variacao(atual, pegar(anterior)) : null;

    const varValor = varDe(resumo.valor, r => r.valor);
    const varQtd = varDe(resumo.quantidade, r => r.quantidade);
    const varTicket = anterior && ticket !== null
      ? variacao(ticket, ticketMedio(anterior) ?? 0)
      : null;

    const lista: Cartao[] = [
      {
        chave: 'faturamento',
        label: 'Faturamento na régua',
        icone: <DollarSign className="w-4 h-4" />,
        cor: COR_QUARTIL[1],
        valor: (
          <ValorAnimado valor={resumo.valor} formatar={formatBRL} className="text-emerald-500" />
        ),
        sub: [
          'confirmada e assinada',
          varValor ? `${varValor.rotulo} vs. mês anterior` : null,
        ].filter(Boolean).join(' · '),
        trend: varValor?.direcao,
      },
      {
        chave: 'vendas',
        label: 'Vendas na meta',
        icone: <ShoppingBag className="w-4 h-4" />,
        cor: '#6366f1',
        valor: <span className="text-indigo-500">{resumo.quantidade}</span>,
        sub: [
          total.pessoasQueVenderam === 1
            ? '1 pessoa vendeu'
            : `${total.pessoasQueVenderam} pessoas venderam`,
          varQtd ? `${varQtd.rotulo} vs. mês anterior` : null,
        ].filter(Boolean).join(' · '),
        trend: varQtd?.direcao,
      },
    ];

    if (ticket !== null) {
      lista.push({
        chave: 'ticket',
        label: 'Ticket médio',
        icone: <Receipt className="w-4 h-4" />,
        cor: '#8b5cf6',
        valor: <ValorAnimado valor={ticket} formatar={formatBRL} className="text-violet-500" />,
        sub: [
          'por venda na régua',
          varTicket ? `${varTicket.rotulo} vs. mês anterior` : null,
        ].filter(Boolean).join(' · '),
        trend: varTicket?.direcao,
      });
    }

    /*
     * O ritmo, como anel — o único card cujo valor não é número escrito.
     *
     * A projeção é uma FRAÇÃO de um todo («quanto do esperado até hoje já foi
     * feito»), e o anel é a forma dela. Sem meta o card não existe: um anel em
     * 0% se leria como mês ruim, e não como configuração faltando.
     */
    const ritmo = andamento?.ritmoOficial ?? null;
    if (ritmo?.projecaoPct != null) {
      const pct = Math.round(ritmo.projecaoPct * 100);
      const cor = corProjecao(pct);
      lista.push({
        chave: 'ritmo',
        label: 'Ritmo do mês',
        icone: <Gauge className="w-4 h-4" />,
        cor,
        valor: (
          <div className="flex justify-center py-1">
            <AnelProjecao pct={pct} cor={cor} />
          </div>
        ),
        sub: 'do esperado até hoje',
        trend: pct >= 100 ? 'up' : 'down',
      });
    }

    if (pendentes > 0) {
      lista.push({
        chave: 'pendente',
        label: 'Esperando assinatura',
        icone: <PenLine className="w-4 h-4" />,
        cor: '#f59e0b',
        valor: (
          <ValorAnimado
            valor={resumo.valorPorGaveta.pendente_assinatura}
            formatar={formatBRL}
            className="text-amber-500"
          />
        ),
        // «Falta de assinatura do contrato» é o maior motivo de cancelamento no
        // relatório: 27 dos 44 de setembro. Por isso o card diz o que fazer.
        sub: `${pendentes} contrato${pendentes === 1 ? '' : 's'} confirmado${pendentes === 1 ? '' : 's'} sem assinatura`,
      });
    }

    if (aprov !== null) {
      const pct = Math.round(aprov * 100);
      lista.push({
        chave: 'aproveitamento',
        label: 'Aproveitamento',
        icone: <Percent className="w-4 h-4" />,
        cor: corProjecao(pct),
        valor: <span style={{ color: corProjecao(pct) }}>{pctTexto(aprov)}</span>,
        sub: 'do que foi confirmado ficou de pé',
      });
    }

    if (resumo.recebido > 0) {
      lista.push({
        chave: 'recebido',
        label: 'Já recebido',
        icone: <Wallet className="w-4 h-4" />,
        cor: '#0ea5e9',
        valor: (
          <ValorAnimado valor={resumo.recebido} formatar={formatBRL} className="text-sky-500" />
        ),
        // Faturado e recebido são medidas diferentes, e a distância entre elas
        // assusta quem compara os dois cards sem esta linha.
        sub: cobertura !== null
          ? `${pctTexto(cobertura)} do faturado · o resto ainda não entrou`
          : 'sobre as vendas da régua',
      });
    }

    if (perdidas > 0) {
      lista.push({
        chave: 'perdas',
        label: 'Devolução / cancelamento',
        icone: <Undo2 className="w-4 h-4" />,
        cor: COR_QUARTIL[4],
        valor: (
          <span className="text-rose-500">
            {pctTexto(resumo.pctDevolucao)} / {pctTexto(resumo.pctCancelamento)}
          </span>
        ),
        sub: `${perdidas} venda${perdidas === 1 ? '' : 's'} · ${formatBRL(
          resumo.valorPorGaveta.devolvida + resumo.valorPorGaveta.cancelada,
        )} fora da régua`,
      });
    }

    return lista;
  }, [resumo, total, andamento, anterior]);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid gap-3 sm:grid-cols-2"
    >
      {cartoes.map(c => (
        <MetricCard
          key={c.chave}
          label={c.label}
          icon={c.icone}
          accentColor={c.cor}
          gradientFrom={c.cor}
          trend={c.trend}
          value={c.valor}
          sub={c.sub || undefined}
        />
      ))}
    </motion.div>
  );
}
