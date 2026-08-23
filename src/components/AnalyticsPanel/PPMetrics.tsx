import { DollarSign, BarChart2, Calendar, Clock, XCircle, CreditCard, QrCode } from 'lucide-react';
import { MetricCard, BannerNaoTabulado } from './SubComponents';
import { formatCurrency, calcHO } from '@/lib/index';
import { ValorAnimado } from '@/components/ValorAnimado';

interface PPMetricsProps {
  temLogicaDiretoExtra: boolean;
  /** true = recebido/Pix/Cartão vêm do relatório analítico (fonte certeira). */
  usarAnalitico?: boolean;
  analiticoBruto?: number;
  analiticoHO?: number;
  analiticoQtd?: number;
  pixBruto?: number;
  pixHO?: number;
  cartaoBruto?: number;
  cartaoHO?: number;
  /** Recebido no analítico que ainda não foi tabulado pelo operador. */
  naoTabuladoBruto?: number;
  naoTabuladoQtd?: number;
  valorHODireto: number;
  valorHOExtra: number;
  valorHOMes: number;
  qtdDireto: number;
  qtdExtra: number;
  valorRecebidoDireto: number;
  valorRecebidoExtra: number;
  valorRecebidoMes: number;
  totalAcordosMes: number;
  totalPagosMes: number;
  totalPendentes: number;
  valorAgendadoMes: number;
  valorHOAgendado: number;
  valorAgendadoRestanteMes: number;
  totalAgendadoRestanteMes: number;
  valorNaoPago: number;
  totalNaoPagos: number;
}

export function PPMetrics({
  temLogicaDiretoExtra,
  usarAnalitico = false,
  analiticoBruto = 0, analiticoHO = 0, analiticoQtd = 0,
  pixBruto = 0, pixHO = 0, cartaoBruto = 0, cartaoHO = 0,
  naoTabuladoBruto = 0, naoTabuladoQtd = 0,
  valorHODireto, valorHOExtra, valorHOMes,
  qtdDireto, qtdExtra,
  valorRecebidoDireto, valorRecebidoExtra, valorRecebidoMes,
  totalAcordosMes, totalPagosMes, totalPendentes,
  valorAgendadoMes, valorHOAgendado,
  valorAgendadoRestanteMes, totalAgendadoRestanteMes,
  valorNaoPago, totalNaoPagos,
}: PPMetricsProps) {
  return (
    <div className="space-y-3">
      {/* Aviso: recebimento do analítico ainda não tabulado */}
      {usarAnalitico && (
        <BannerNaoTabulado
          valor={naoTabuladoBruto}
          qtd={naoTabuladoQtd}
          totalAnalitico={analiticoBruto}
        />
      )}

      {/* Pix/Boleto × Cartão — direto do relatório analítico */}
      {usarAnalitico && (
        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            label="Pix/Boleto recebido (analítico)"
            icon={<QrCode className="w-4 h-4" />}
            accentColor="#06b6d4"
            gradientFrom="#06b6d4"
            value={<ValorAnimado valor={pixBruto} formatar={formatCurrency} className="text-cyan-500" />}
            sub={`H.O.: ${formatCurrency(pixHO)}`}
          />
          <MetricCard
            label="Cartão recebido (analítico)"
            icon={<CreditCard className="w-4 h-4" />}
            accentColor="#8b5cf6"
            gradientFrom="#8b5cf6"
            value={<ValorAnimado valor={cartaoBruto} formatar={formatCurrency} className="text-violet-500" />}
            sub={`H.O.: ${formatCurrency(cartaoHO)}`}
          />
        </div>
      )}
      {temLogicaDiretoExtra ? (
        <>
          {/* Grupo 1: H.O. Direto + Extra + Total */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricCard
              label="H.O. Direto"
              icon={<DollarSign className="w-4 h-4" />}
              accentColor="#10b981"
              gradientFrom="#10b981"
              trend="up"
              value={<ValorAnimado valor={valorHODireto} formatar={formatCurrency} className="text-emerald-500" />}
              sub={`${qtdDireto} pago${qtdDireto !== 1 ? 's' : ''} · 24,96% de ${formatCurrency(valorRecebidoDireto)}`}
            />
            <MetricCard
              label="H.O. Extra"
              icon={<DollarSign className="w-4 h-4" />}
              accentColor="#7c3aed"
              gradientFrom="#7c3aed"
              trend="up"
              value={<ValorAnimado valor={valorHOExtra} formatar={formatCurrency} className="text-violet-500" />}
              sub={`${qtdExtra} pago${qtdExtra !== 1 ? 's' : ''} · 24,96% de ${formatCurrency(valorRecebidoExtra)}`}
            />
            <MetricCard
              label="H.O. Total recebido no mês"
              icon={<DollarSign className="w-4 h-4" />}
              accentColor="#22c55e"
              gradientFrom="#22c55e"
              trend="up"
              value={
                <span className="text-emerald-500">
                  {formatCurrency(usarAnalitico ? analiticoHO : valorHOMes)}
                </span>
              }
              sub={usarAnalitico
                ? `Bruto: ${formatCurrency(analiticoBruto)} · ${analiticoQtd} pgtos (analítico)`
                : `Bruto: ${formatCurrency(valorRecebidoMes)} · ${totalPagosMes} pagos`}
            />
          </div>

          {/* Grupo 2: Bruto Direto + Bruto Extra + Acordos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricCard
              label="Recebido Direto do mês (TOTAL)"
              icon={<DollarSign className="w-4 h-4" />}
              accentColor="#22c55e"
              gradientFrom="#22c55e"
              value={<ValorAnimado valor={valorRecebidoDireto} formatar={formatCurrency} className="text-emerald-500" />}
              sub={`${qtdDireto} pago${qtdDireto !== 1 ? 's' : ''}`}
            />
            <MetricCard
              label="Recebido Extra do mês (TOTAL)"
              icon={<DollarSign className="w-4 h-4" />}
              accentColor="#8b5cf6"
              gradientFrom="#8b5cf6"
              value={<ValorAnimado valor={valorRecebidoExtra} formatar={formatCurrency} className="text-violet-500" />}
              sub={`${qtdExtra} pago${qtdExtra !== 1 ? 's' : ''}`}
            />
            <MetricCard
              label="Acordos do Mês"
              icon={<BarChart2 className="w-4 h-4" />}
              accentColor="#3b82f6"
              gradientFrom="#3b82f6"
              value={String(totalAcordosMes)}
              sub={`${totalPagosMes} pagos · ${totalPendentes} pendentes`}
            />
          </div>

          {/* Grupo restante + não pagos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricCard
              label="H.O. Restante agendado no mês"
              icon={<Clock className="w-4 h-4" />}
              accentColor="#a855f7"
              gradientFrom="#a855f7"
              trend={valorAgendadoRestanteMes > 0 ? 'neutral' : 'up'}
              value={
                <span className="text-purple-500">
                  {formatCurrency(calcHO(valorAgendadoRestanteMes))}
                </span>
              }
              sub={`${totalAgendadoRestanteMes} pendente${totalAgendadoRestanteMes !== 1 ? 's' : ''}`}
            />
            <MetricCard
              label="Valor total restante agendado no mês"
              icon={<Clock className="w-4 h-4" />}
              accentColor="#6366f1"
              gradientFrom="#6366f1"
              trend={valorAgendadoRestanteMes > 0 ? 'neutral' : 'up'}
              value={<ValorAnimado valor={valorAgendadoRestanteMes} formatar={formatCurrency} />}
              sub={`${totalAgendadoRestanteMes} pendente${totalAgendadoRestanteMes !== 1 ? 's' : ''} · exclui pago/não pago`}
            />
            <MetricCard
              label="Valor total não pago do mês"
              icon={<XCircle className="w-4 h-4" />}
              accentColor="#ef4444"
              gradientFrom="#ef4444"
              trend={valorNaoPago > 0 ? 'down' : 'neutral'}
              value={<ValorAnimado valor={valorNaoPago} formatar={formatCurrency} className="text-red-500" />}
              sub={`${totalNaoPagos} acordo${totalNaoPagos !== 1 ? 's' : ''} no mês`}
            />
          </div>
        </>
      ) : (
        <>
          {/* Grupo 1: H.O. Total + H.O. Agendado + Bruto Recebido */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricCard
              label="H.O. recebido no mês"
              icon={<DollarSign className="w-4 h-4" />}
              accentColor="#22c55e"
              gradientFrom="#22c55e"
              trend="up"
              value={
                <span className="text-emerald-500">
                  {formatCurrency(usarAnalitico ? analiticoHO : valorHODireto)}
                </span>
              }
              sub={usarAnalitico
                ? `${analiticoQtd} pgtos no analítico · 24,96% do bruto`
                : `${qtdDireto} diretos pagos · 24,96% do bruto`}
            />
            <MetricCard
              label="H.O. agendado no mês"
              icon={<Calendar className="w-4 h-4" />}
              accentColor="#6366f1"
              gradientFrom="#6366f1"
              trend="neutral"
              value={<ValorAnimado valor={valorHOAgendado} formatar={formatCurrency} />}
              sub={`Bruto agendado: ${formatCurrency(valorAgendadoMes)}`}
            />
            <MetricCard
              label="Bruto recebido no mês"
              icon={<DollarSign className="w-4 h-4" />}
              accentColor="#10b981"
              gradientFrom="#10b981"
              value={
                <span className="text-emerald-400">
                  {formatCurrency(usarAnalitico ? analiticoBruto : valorRecebidoMes)}
                </span>
              }
              sub={usarAnalitico
                ? `${analiticoQtd} pgtos no analítico`
                : `${totalPagosMes} acordos pagos`}
            />
          </div>

          {/* Grupo 2: Acordos + H.O. Restante + Não Pago */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricCard
              label="Acordos do Mês"
              icon={<BarChart2 className="w-4 h-4" />}
              accentColor="#3b82f6"
              gradientFrom="#3b82f6"
              value={String(totalAcordosMes)}
              sub={`${totalPagosMes} pagos · ${totalPendentes} pendentes`}
            />
            <MetricCard
              label="H.O. Restante agendado"
              icon={<Clock className="w-4 h-4" />}
              accentColor="#a855f7"
              gradientFrom="#a855f7"
              trend={valorAgendadoRestanteMes > 0 ? 'neutral' : 'up'}
              value={
                <span className="text-purple-500">
                  {formatCurrency(calcHO(valorAgendadoRestanteMes))}
                </span>
              }
              sub={`${totalAgendadoRestanteMes} pendente${totalAgendadoRestanteMes !== 1 ? 's' : ''} · bruto: ${formatCurrency(valorAgendadoRestanteMes)}`}
            />
            <MetricCard
              label="Valor não pago no mês"
              icon={<XCircle className="w-4 h-4" />}
              accentColor="#ef4444"
              gradientFrom="#ef4444"
              trend={valorNaoPago > 0 ? 'down' : 'neutral'}
              value={<ValorAnimado valor={valorNaoPago} formatar={formatCurrency} className="text-red-500" />}
              sub={`${totalNaoPagos} acordo${totalNaoPagos !== 1 ? 's' : ''} no mês`}
            />
          </div>
        </>
      )}
    </div>
  );
}
