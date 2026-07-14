/**
 * GraficoRecebimento — aba do Analítico (líder+): total recebido em cada dia do
 * mês, com o valor rotulado sobre cada ponto da linha.
 *
 * Escopo: segue o filtro de setor da tela. A pergunta "este recebimento conta
 * neste setor?" usa setoresDoOperador — o operador clonado credita o setor da
 * equipe que o clonou, igual a Desempenho Equipes e ao card Total recebido.
 * Órfãos (linha sem operador) pertencem ao setor da importação.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
  ResponsiveContainer,
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
}

const COR_LINHA = '#10b981';

/** Abrevia no eixo Y — R$ 205.944,66 por tick não caberia. */
function formatYAxis(v: number): string {
  if (v >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `R$${(v / 1_000).toFixed(0)}k`;
  return `R$${v}`;
}

/** Rótulo sobre o ponto: some nos dias zerados para não poluir a linha base. */
function rotuloValor(v: number): string {
  if (!v) return '';
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}

export function GraficoRecebimento({
  empresaId, mes, setorId, equipes,
  operadorEquipeMap, equipesExtrasPorOperador = {},
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
  }, [empresaId, mes]);

  const setorDaEquipe = useMemo(() => mapaSetorDaEquipe(equipes), [equipes]);

  const { dados, total, maiorDia } = useMemo(() => {
    const [ano, mesNum] = mes.split('-').map(Number);
    const diasNoMes = new Date(ano, mesNum, 0).getDate();
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

    return {
      dados: porDia.map((valor, i) => ({ dia: i + 1, valor })),
      total: porDia.reduce((s, v) => s + v, 0),
      maiorDia: Math.max(...porDia, 0),
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
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Melhor dia</p>
            <p className="text-base font-bold tabular-nums font-mono">{formatBRL(maiorDia)}</p>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <AreaChart data={dados} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradRecebimentoDia" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={COR_LINHA} stopOpacity={0.4} />
              <stop offset="100%" stopColor={COR_LINHA} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
          <XAxis dataKey="dia" tick={{ fontSize: 10 }} stroke="transparent"
            tickLine={false} axisLine={false} interval={0} />
          <YAxis tick={{ fontSize: 10 }} stroke="transparent" tickLine={false}
            axisLine={false} tickFormatter={formatYAxis} width={56}
            domain={[0, 'dataMax']} />
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
            labelFormatter={(d: number) => `Dia ${d}`}
          />
          <Area
            type="monotone"
            dataKey="valor"
            name="Recebido"
            stroke={COR_LINHA}
            fill="url(#gradRecebimentoDia)"
            strokeWidth={2.5}
            dot={{ r: 2.5, fill: COR_LINHA, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: COR_LINHA, strokeWidth: 0 }}
            isAnimationActive={false}
          >
            <LabelList dataKey="valor" position="top" offset={8}
              formatter={rotuloValor}
              style={{ fontSize: 9, fill: 'var(--muted-foreground)', fontWeight: 600 }} />
          </Area>
        </AreaChart>
      </ResponsiveContainer>

      <p className="text-[11px] text-muted-foreground">
        Valor recebido em cada dia do mês, do relatório analítico. Rótulos em milhares
        (ex.: 12.5k = R$ 12.500); passe o mouse para o valor exato.
      </p>
    </div>
  );
}
