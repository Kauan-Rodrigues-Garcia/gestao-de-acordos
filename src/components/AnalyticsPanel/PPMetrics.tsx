import { DollarSign, BarChart2, Calendar, Clock, XCircle } from 'lucide-react';
import { MetricCard } from './SubComponents';
import { formatCurrency, calcHO } from '@/lib/index';

interface PPMetricsProps {
  temLogicaDiretoExtra: boolean;
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
              value={<span className="text-emerald-500">{formatCurrency(valorHODireto)}</span>}
              sub={`${qtdDireto} pago${qtdDireto !== 1 ? 's' : ''} · 24,96% de ${formatCurrency(valorRecebidoDireto)}`}
            />
            <MetricCard
              label="H.O. Extra"
              icon={<DollarSign className="w-4 h-4" />}
              accentColor="#7c3aed"
              gradientFrom="#7c3aed"
              trend="up"
              value={<span className="text-violet-500">{formatCurrency(valorHOExtra)}</span>}
              sub={`${qtdExtra} pago${qtdExtra !== 1 ? 's' : ''} · 24,96% de ${formatCurrency(valorRecebidoExtra)}`}
            />
            <MetricCard
              label="H.O. Total recebido no mês"
              icon={<DollarSign className="w-4 h-4" />}
              accentColor="#22c55e"
              gradientFrom="#22c55e"
              trend="up"
              value={<span className="text-emerald-500">{formatCurrency(valorHOMes)}</span>}
              sub={`Bruto: ${formatCurrency(valorRecebidoMes)} · ${totalPagosMes} pagos`}
            />
          </div>

          {/* Grupo 2: Bruto Direto + Bruto Extra + Acordos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricCard
              label="Recebido Direto do mês (TOTAL)"
              icon={<DollarSign className="w-4 h-4" />}
              accentColor="#22c55e"
              gradientFrom="#22c55e"
              value={<span className="text-emerald-500">{formatCurrency(valorRecebidoDireto)}</span>}
              sub={`${qtdDireto} pago${qtdDireto !== 1 ? 's' : ''}`}
            />
            <MetricCard
              label="Recebido Extra do mês (TOTAL)"
              icon={<DollarSign className="w-4 h-4" />}
              accentColor="#8b5cf6"
              gradientFrom="#8b5cf6"
              value={<span className="text-violet-500">{formatCurrency(valorRecebidoExtra)}</span>}
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
              value={formatCurrency(valorAgendadoRestanteMes)}
              sub={`${totalAgendadoRestanteMes} pendente${totalAgendadoRestanteMes !== 1 ? 's' : ''} · exclui pago/não pago`}
            />
            <MetricCard
              label="Valor total não pago do mês"
              icon={<XCircle className="w-4 h-4" />}
              accentColor="#ef4444"
              gradientFrom="#ef4444"
              trend={valorNaoPago > 0 ? 'down' : 'neutral'}
              value={<span className="text-red-500">{formatCurrency(valorNaoPago)}</span>}
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
              value={<span className="text-emerald-500">{formatCurrency(valorHODireto)}</span>}
              sub={`${qtdDireto} diretos pagos · 24,96% do bruto`}
            />
            <MetricCard
              label="H.O. agendado no mês"
              icon={<Calendar className="w-4 h-4" />}
              accentColor="#6366f1"
              gradientFrom="#6366f1"
              trend="neutral"
              value={formatCurrency(valorHOAgendado)}
              sub={`Bruto agendado: ${formatCurrency(valorAgendadoMes)}`}
            />
            <MetricCard
              label="Bruto recebido no mês"
              icon={<DollarSign className="w-4 h-4" />}
              accentColor="#10b981"
              gradientFrom="#10b981"
              value={<span className="text-emerald-400">{formatCurrency(valorRecebidoMes)}</span>}
              sub={`${totalPagosMes} acordos pagos`}
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
              value={<span className="text-red-500">{formatCurrency(valorNaoPago)}</span>}
              sub={`${totalNaoPagos} acordo${totalNaoPagos !== 1 ? 's' : ''} no mês`}
            />
          </div>
        </>
      )}
    </div>
  );
}
