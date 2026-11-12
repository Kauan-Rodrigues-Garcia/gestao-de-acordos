/**
 * DetalheRelatorioDoSetor — o 1017 da Manutenção de forma visual (12/11/2026).
 *
 * Lê as linhas vivas do mês (`relatorio_setor_linhas`, o último lote) e mostra:
 * os cards por tipo, o gráfico por dia de pagamento (os picos são os
 * vencimentos fixos da recorrência — é o que faz a projeção oscilar) e a
 * tabela com busca por NR, cliente e franquia. Clicar numa barra recorta a
 * tabela naquele dia.
 *
 * Só leitura. O dinheiro que soma no setor continua vindo de
 * `fn_ajustes_recebimento`; aqui é o raio-x do que foi importado.
 */
import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Loader2, Search, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@/lib/money';
import { corDaForma } from '@/lib/formasPagamento';
import { useAxisColors } from '@/hooks/useChartColors';
import { RELATORIOS_DO_SETOR, type CodigoRelatorioDoSetor } from '@/lib/relatoriosDoSetor';
import {
  listarLinhasDoMes, type LinhaDoRelatorio, type LoteDoRelatorio,
} from '@/services/relatorio1017/relatorioDoSetor.service';
import { filtrarLinhas, porDia, tiposDoMes } from '@/services/relatorio1017/detalhe';

interface Props {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  setorId: string;
  relatorio: CodigoRelatorioDoSetor;
  /** 'yyyy-MM'. */
  mes: string;
  nomeDoSetor?: string;
  lote: LoteDoRelatorio | null;
}

/** No 1017, «Pix» é o Pix automático e «Cartão» o recorrente: a cor do Painel para essas formas. */
function corDoTipo(tipo: string): string {
  const n = tipo.toLowerCase();
  if (n.includes('pix')) return corDaForma('Pix Automático');
  if (n.includes('cart')) return corDaForma('Cartão Recorrente');
  return corDaForma(tipo);
}

const LIMITE_TABELA = 300;
const dataBR = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const compacto = (v: number) =>
  v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil` : String(Math.round(v));

export function DetalheRelatorioDoSetor({ aberto, onAbertoChange, setorId, relatorio, mes, nomeDoSetor, lote }: Props) {
  const [linhas, setLinhas] = useState<LinhaDoRelatorio[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [dia, setDia] = useState<string | null>(null);
  const { tickColor, gridColor } = useAxisColors();

  useEffect(() => {
    if (!aberto) return;
    let cancelado = false;
    setLinhas(null);
    setErro(null);
    setDia(null);
    void listarLinhasDoMes(setorId, relatorio, mes).then(r => {
      if (cancelado) return;
      setLinhas(r.linhas);
      setErro(r.erro);
    });
    return () => { cancelado = true; };
  }, [aberto, setorId, relatorio, mes, lote?.id]);

  const tipos = useMemo(() => tiposDoMes(linhas ?? []), [linhas]);
  const pontos = useMemo(() => porDia(linhas ?? [], mes).map(p => ({ ...p, ...p.porTipo })), [linhas, mes]);
  const total = useMemo(() => tipos.reduce((s, t) => s + t.valor, 0), [tipos]);
  const qtd = linhas?.length ?? 0;
  const filtradas = useMemo(() => filtrarLinhas(linhas ?? [], busca, dia), [linhas, busca, dia]);
  const somaFiltradas = useMemo(() => filtradas.reduce((s, l) => s + l.valor, 0), [filtradas]);
  const maiorDia = useMemo(() => pontos.reduce<typeof pontos[number] | null>((m, p) => (!m || p.total > m.total ? p : m), null), [pontos]);

  const catalogo = RELATORIOS_DO_SETOR[relatorio];

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {catalogo.nome}{nomeDoSetor ? ` · ${nomeDoSetor}` : ''} ·{' '}
            {new Date(`${mes}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </DialogTitle>
          <DialogDescription>
            O que foi importado no mês, por dia de pagamento e linha a linha. Soma só no recebimento geral do setor.
          </DialogDescription>
        </DialogHeader>

        {!linhas && !erro && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando as linhas…
          </div>
        )}

        {erro && <p className="text-sm text-destructive">Não consegui ler o relatório: {erro}</p>}

        {linhas && !erro && qtd === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">Nada importado neste mês.</p>
        )}

        {linhas && qtd > 0 && (
          <div className="space-y-5 text-sm">
            {/* Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total no setor</p>
                <p className="text-lg font-semibold tabular-nums">{formatBRL(total)}</p>
                <p className="text-xs text-muted-foreground">{qtd.toLocaleString('pt-BR')} pagamentos</p>
              </div>
              {tipos.slice(0, 2).map(t => (
                <div key={t.tipo} className="rounded-lg border border-l-4 p-3" style={{ borderLeftColor: corDoTipo(t.tipo) }}>
                  <p className="text-xs text-muted-foreground">{t.tipo}</p>
                  <p className="text-lg font-semibold tabular-nums">{formatBRL(t.valor)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.linhas.toLocaleString('pt-BR')} · {total ? Math.round((t.valor / total) * 100) : 0}%
                  </p>
                </div>
              ))}
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Fora (já no 59)</p>
                <p className="text-lg font-semibold tabular-nums">{formatBRL(lote?.valorIgnorado59 ?? 0)}</p>
                <p className="text-xs text-muted-foreground">{lote?.ignoradas59 ?? 0} linhas</p>
              </div>
            </div>

            {/* Gráfico por dia */}
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">Por dia de pagamento</p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {tipos.map(t => (
                    <span key={t.tipo} className="flex items-center gap-1">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: corDoTipo(t.tipo) }} />
                      {t.tipo}
                    </span>
                  ))}
                  {maiorDia && maiorDia.total > 0 && <span>Maior dia: {maiorDia.dia} · {formatBRL(maiorDia.total)}</span>}
                </div>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pontos} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                    onClick={e => {
                      const data = (e?.activePayload?.[0]?.payload as { data?: string } | undefined)?.data;
                      if (data) setDia(atual => (atual === data ? null : data));
                    }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="dia" tick={{ fontSize: 10, fill: tickColor }} stroke="transparent"
                      tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={6} />
                    <YAxis tick={{ fontSize: 10, fill: tickColor }} stroke="transparent" tickLine={false}
                      axisLine={false} tickFormatter={compacto} width={48} />
                    <Tooltip
                      cursor={{ fill: gridColor, fillOpacity: 0.25 }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as { data: string; total: number; porTipo: Record<string, number> };
                        return (
                          <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                            <p className="font-medium">{dataBR(p.data)} · {formatBRL(p.total)}</p>
                            {Object.entries(p.porTipo).map(([t, v]) => (
                              <p key={t} className="flex items-center gap-1.5">
                                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: corDoTipo(t) }} />
                                {t}: {formatBRL(v)}
                              </p>
                            ))}
                            <p className="mt-1 text-muted-foreground">Clique para ver as linhas do dia</p>
                          </div>
                        );
                      }}
                    />
                    {tipos.map((t, i) => (
                      <Bar key={t.tipo} dataKey={t.tipo} stackId="1" fill={corDoTipo(t.tipo)}
                        radius={i === tipos.length - 1 ? [3, 3, 0, 0] : 0} className="cursor-pointer">
                        {pontos.map(p => (
                          <Cell key={p.data} fillOpacity={!dia || dia === p.data ? 1 : 0.3} />
                        ))}
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabela */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={busca} onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar NR, código do cliente ou franquia" className="pl-8" />
                </div>
                {dia && (
                  <Button size="sm" variant="secondary" className="gap-1" onClick={() => setDia(null)}>
                    Dia {dataBR(dia)} <X className="h-3.5 w-3.5" />
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">
                  {filtradas.length.toLocaleString('pt-BR')} linhas · {formatBRL(somaFiltradas)}
                </span>
              </div>
              <div className="max-h-80 overflow-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr className="text-left">
                      <th className="px-2 py-1.5 font-medium">Pagamento</th>
                      <th className="px-2 py-1.5 font-medium">NR</th>
                      <th className="px-2 py-1.5 font-medium">Cliente</th>
                      <th className="px-2 py-1.5 font-medium hidden sm:table-cell">Franquia</th>
                      <th className="px-2 py-1.5 font-medium">Tipo</th>
                      <th className="px-2 py-1.5 font-medium text-right">Parc.</th>
                      <th className="px-2 py-1.5 font-medium text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.slice(0, LIMITE_TABELA).map(l => (
                      <tr key={`${l.nr}|${l.pagamento}|${l.parcela ?? 0}`} className="border-t">
                        <td className="px-2 py-1 tabular-nums">{dataBR(l.pagamento)}</td>
                        <td className="px-2 py-1 tabular-nums">{l.nr}</td>
                        <td className="px-2 py-1 tabular-nums">{l.codCliente ?? '—'}</td>
                        <td className="px-2 py-1 hidden sm:table-cell truncate max-w-[180px]">{l.franquia ?? '—'}</td>
                        <td className="px-2 py-1">
                          <span className="inline-flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: corDoTipo(l.tipo ?? '') }} />
                            {l.tipo ?? '—'}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{l.parcela ?? '—'}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{formatBRL(l.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtradas.length > LIMITE_TABELA && (
                  <p className="border-t px-2 py-1.5 text-center text-xs text-muted-foreground">
                    Mostrando {LIMITE_TABELA} de {filtradas.length.toLocaleString('pt-BR')}. Busque ou clique num dia para achar a linha.
                  </p>
                )}
                {filtradas.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nenhuma linha com essa busca.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
