/**
 * GraficoRecebimento — aba do Analítico (líder+): total recebido em cada dia do
 * mês, com o valor rotulado sobre cada ponto e a média diária de referência.
 *
 * Escopo: segue o filtro de setor da tela. A pergunta "este recebimento conta
 * neste setor?" usa setoresDoOperador — o operador clonado credita o setor da
 * equipe que o clonou, igual a Desempenho Equipes e ao card Total recebido.
 * Órfãos (linha sem operador) pertencem ao setor da importação.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Loader2 } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import {
  buscarRecebidoPorDia, mapaSetorDaEquipe, setoresDoOperador,
  type EquipeAnalitico, type OperadorEquipeInfo, type LinhaRecebidaDia,
} from '@/services/analitico/analitico.service';

interface GraficoRecebimentoProps {
  empresaId: string;
  mes: string;                 // 'yyyy-MM'
  setorId?: string | null;
  equipes: EquipeAnalitico[];
  operadorEquipeMap: Record<string, OperadorEquipeInfo>;
  equipesExtrasPorOperador?: Record<string, string[]>;
  /** Linhas já carregadas de outra fonte (Painel Líder — recebimento diário).
   *  Quando presente, o componente NÃO busca o analítico. */
  linhasExternas?: LinhaRecebidaDia[];
  /** Nome da fonte no rodapé (padrão: "relatório analítico"). */
  fonteLabel?: string;
}

const COR_LINHA = '#10b981';
const MESES_ABREV = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

/** Cada dia precisa de largura para caber "R$ 95.441,22" sem encavalar. */
const PX_POR_DIA = 44;

interface Ponto {
  dia: number;
  /** null = dia sem recebimento. Vira buraco na linha (connectNulls liga os
   *  vizinhos), não um vale até o zero — fim de semana não é queda de venda. */
  valor: number | null;
  /** 0 ou 1 — alterna a altura do rótulo. Com ~44px por dia e o rótulo em
   *  ~62px, vizinhos colidiriam; em alturas alternadas a distância entre dois
   *  rótulos do mesmo nível dobra e eles passam limpos. */
  nivel: number;
}

/** Abrevia no eixo Y — R$ 205.944,66 por tick não caberia. */
function formatYAxis(v: number): string {
  if (v >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `R$${(v / 1_000).toFixed(0)}k`;
  return `R$${v}`;
}

export function GraficoRecebimento({
  empresaId, mes, setorId, equipes,
  operadorEquipeMap, equipesExtrasPorOperador = {},
  linhasExternas, fonteLabel = 'relatório analítico',
}: GraficoRecebimentoProps) {
  const [linhas, setLinhas]   = useState<LinhaRecebidaDia[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro]       = useState<string | null>(null);
  const [setorNome, setSetorNome] = useState<string | null>(null);

  useEffect(() => {
    if (!setorId) { setSetorNome(null); return; }
    let cancelado = false;
    void supabase.from('setores').select('nome').eq('id', setorId).maybeSingle()
      .then(({ data }) => {
        if (!cancelado) setSetorNome((data as { nome: string } | null)?.nome ?? null);
      });
    return () => { cancelado = true; };
  }, [setorId]);

  useEffect(() => {
    // Fonte externa (recebimento diário): usa as linhas recebidas por prop
    if (linhasExternas) {
      setLinhas(linhasExternas);
      setErro(null);
      setLoading(false);
      return;
    }
    let cancelado = false;
    setLoading(true);
    setErro(null);
    void buscarRecebidoPorDia(empresaId, mes).then(({ data, error }) => {
      if (cancelado) return;
      setLinhas(data);
      setErro(error);
      setLoading(false);
    });
    return () => { cancelado = true; };
  }, [empresaId, mes, linhasExternas]);

  const setorDaEquipe = useMemo(() => mapaSetorDaEquipe(equipes), [equipes]);

  const { dados, total, maiorDia, media, diasComRecebimento, mesNum } = useMemo(() => {
    const [ano, mesN] = mes.split('-').map(Number);
    const diasNoMes = new Date(ano, mesN, 0).getDate();
    const porDia = new Array<number>(diasNoMes).fill(0);

    for (const l of linhas) {
      if (setorId) {
        const conta = l.operador_id
          ? setoresDoOperador(
              l.operador_id, operadorEquipeMap, equipesExtrasPorOperador, setorDaEquipe,
            ).has(setorId)
          // Órfão: setor da importação; sem setor_id, o setor de quem importou
          : (l.setor_id ?? operadorEquipeMap[l.importado_por_id ?? '']?.setor_id) === setorId;
        if (!conta) continue;
      }
      const dia = Number(l.data_pagamento.slice(8, 10));
      if (dia >= 1 && dia <= diasNoMes) porDia[dia - 1] += Number(l.valor_recebido) || 0;
    }

    // Alterna o nível só entre os dias que têm rótulo — se contasse os buracos,
    // dois pontos vizinhos poderiam cair no mesmo nível.
    let n = 0;
    const pontos: Ponto[] = porDia.map((v, i) => ({
      dia: i + 1,
      valor: v > 0 ? v : null,
      nivel: v > 0 ? n++ % 2 : 0,
    }));

    const comValor = porDia.filter(v => v > 0);
    const soma = comValor.reduce((s, v) => s + v, 0);

    return {
      dados: pontos,
      total: soma,
      maiorDia: Math.max(...porDia, 0),
      media: comValor.length ? soma / comValor.length : 0,
      diasComRecebimento: comValor.length,
      mesNum: mesN,
    };
  }, [linhas, mes, setorId, operadorEquipeMap, equipesExtrasPorOperador, setorDaEquipe]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando recebimentos do mês…
      </div>
    );
  }

  if (erro) {
    return <p className="text-sm text-destructive text-center py-10">{erro}</p>;
  }

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-10">
        Nenhum recebimento neste mês{setorNome ? ` em ${setorNome}` : ''}.
      </p>
    );
  }

  const rotuloEixoX = (d: number) =>
    `${String(d).padStart(2, '0')}/${MESES_ABREV[mesNum - 1]}`;

  /** Pílula com o valor cheio sobre o ponto, na altura alternada do datum. */
  function RotuloValor(props: {
    x?: number; y?: number; value?: number | null; index?: number;
  }) {
    const { x, y, value, index } = props;
    if (value == null || x == null || y == null || index == null) return null;
    const texto  = formatBRL(value);
    const largura = texto.length * 5.3 + 10;
    const alto   = dados[index]?.nivel === 1;
    const topo   = y - (alto ? 32 : 14);
    return (
      <g style={{ pointerEvents: 'none' }}>
        <rect
          x={x - largura / 2} y={topo - 10} width={largura} height={14} rx={3}
          fill="var(--card)" stroke={COR_LINHA} strokeOpacity={0.35} strokeWidth={0.75}
        />
        <text
          x={x} y={topo} textAnchor="middle"
          style={{ fontSize: 9, fontWeight: 600, fill: 'var(--foreground)' }}
        >
          {texto}
        </text>
      </g>
    );
  }

  const larguraMin = dados.length * PX_POR_DIA;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md shrink-0"
            style={{ background: COR_LINHA + '22' }}>
            <TrendingUp className="w-4 h-4" style={{ color: COR_LINHA }} />
          </div>
          <div>
            <p className="text-sm font-semibold">Recebimento por dia</p>
            <p className="text-xs text-muted-foreground">
              {setorNome ?? 'Todos os setores'} ·{' '}
              {new Date(mes + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-5 text-right">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total do mês</p>
            <p className="text-base font-bold tabular-nums font-mono" style={{ color: COR_LINHA }}>
              {formatBRL(total)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Média/dia</p>
            <p className="text-base font-bold tabular-nums font-mono">{formatBRL(media)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Melhor dia</p>
            <p className="text-base font-bold tabular-nums font-mono">{formatBRL(maiorDia)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dias c/ receb.</p>
            <p className="text-base font-bold tabular-nums font-mono">{diasComRecebimento}</p>
          </div>
        </div>
      </div>

      {/* Em tela estreita o gráfico rola na horizontal em vez de espremer os
          rótulos até virarem tarja ilegível. */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: larguraMin }}>
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={dados} margin={{ top: 44, right: 24, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="gradRecebimentoDia" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={COR_LINHA} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={COR_LINHA} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
              <XAxis
                dataKey="dia"
                tickFormatter={rotuloEixoX}
                tick={{ fontSize: 10 }}
                stroke="transparent"
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={-45}
                textAnchor="end"
                height={52}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="transparent"
                tickLine={false}
                axisLine={false}
                tickFormatter={formatYAxis}
                width={64}
                domain={[0, 'dataMax']}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.2)',
                  background: 'var(--popover)',
                  color: 'var(--popover-foreground)',
                  fontSize: '12px',
                  padding: '6px 10px',
                }}
                formatter={(v: number) => [formatBRL(v), 'Recebido']}
                labelFormatter={rotuloEixoX}
              />
              <ReferenceLine
                y={media}
                stroke="var(--muted-foreground)"
                strokeDasharray="5 4"
                strokeOpacity={0.55}
                label={{
                  value: `média ${formatBRL(media)}`,
                  position: 'insideTopRight',
                  style: { fontSize: 9.5, fill: 'var(--muted-foreground)', fontWeight: 600 },
                }}
              />
              <Area
                type="monotone"
                dataKey="valor"
                name="Recebido"
                stroke={COR_LINHA}
                fill="url(#gradRecebimentoDia)"
                strokeWidth={2.5}
                connectNulls
                dot={{ r: 3, fill: 'var(--card)', stroke: COR_LINHA, strokeWidth: 2 }}
                activeDot={{ r: 5.5, fill: COR_LINHA, strokeWidth: 0 }}
                isAnimationActive={false}
              >
                <LabelList dataKey="valor" content={RotuloValor} />
              </Area>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Valor recebido em cada dia do mês, do {fonteLabel}. Dias sem recebimento
        (fim de semana, feriado) não aparecem como zero — a linha liga os dias vizinhos.
        Média = total ÷ {diasComRecebimento} dia{diasComRecebimento !== 1 ? 's' : ''} com recebimento.
      </p>
    </div>
  );
}
