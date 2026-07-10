/**
 * MetaProgressoHeader — progresso pessoal no cabeçalho do Dashboard (PaguePlay).
 *
 * Aparece logo abaixo da saudação para quem tem meta de operador definida e
 * a config do mês (dias úteis/quartis) preenchida na aba Metas. Mostra:
 *   1. Barra da meta do mês (recebido no ANALÍTICO ÷ meta) + meta diária
 *   2. Posição no ranking + quanto falta para ultrapassar quem está acima
 *   3. Barra de quartil (projeção = recebido ÷ esperado até hoje) + quanto
 *      fazer hoje para subir ao próximo quartil
 *
 * Tudo recalcula quando um novo relatório analítico chega (realtime).
 */

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Target, Trophy, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { MetasConfigMes } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useAnaliticoDashboard } from '@/hooks/useAnaliticoDashboard';
import { useTenant } from '@/lib/tenant-config';
import { formatBRL } from '@/lib/money';
import { getTodayISO } from '@/lib/index';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import {
  buscarResumoOperadoresAnalitico,
  type ResumoOperadorAnalitico,
} from '@/services/analitico/analitico.service';
import {
  diasUteisDoMes, diasUteisDecorridos, quartilAtual, proximoQuartil,
} from '@/lib/diasUteis';
import { cn } from '@/lib/utils';

function pct(realizado: number, base: number): number {
  if (!base || base <= 0) return 0;
  return Math.min(Math.round((realizado / base) * 100), 999);
}

export function MetaProgressoHeader() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const isPP = useTenant().isPaguePlay;

  const hoje = new Date();
  const mes = hoje.getMonth() + 1;
  const ano = hoje.getFullYear();
  const mesStr = `${ano}-${String(mes).padStart(2, '0')}`;

  const [metaValor, setMetaValor] = useState<number | null>(null);
  const [config, setConfig]       = useState<MetasConfigMes | null>(null);
  const [ranking, setRanking]     = useState<ResumoOperadorAnalitico[]>([]);
  const [carregado, setCarregado] = useState(false);

  const analitico = useAnaliticoDashboard(isPP);

  // Meta do operador + config do mês
  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      if (!isPP || !perfil?.id || !empresa?.id) { setCarregado(true); return; }
      const [{ data: metaRow }, cfg] = await Promise.all([
        supabase.from('metas').select('meta_valor')
          .eq('tipo', 'operador').eq('referencia_id', perfil.id)
          .eq('empresa_id', empresa.id).eq('mes', mes).eq('ano', ano)
          .maybeSingle(),
        getMetasConfig(empresa.id, mes, ano),
      ]);
      if (cancelado) return;
      setMetaValor(metaRow ? Number((metaRow as { meta_valor: number }).meta_valor) || null : null);
      setConfig(cfg.data);
      setCarregado(true);
    }
    void carregar();
    return () => { cancelado = true; };
  }, [isPP, perfil?.id, empresa?.id, mes, ano]);

  // Ranking — recarrega junto com o analítico (realtime já dispara o hook)
  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      if (!isPP || !empresa?.id || metaValor == null) return;
      const { data } = await buscarResumoOperadoresAnalitico(empresa.id, mesStr);
      if (!cancelado) setRanking(data);
    }
    void carregar();
    return () => { cancelado = true; };
  }, [isPP, empresa?.id, mesStr, metaValor, analitico.linhas]);

  const dados = useMemo(() => {
    if (!perfil?.id || metaValor == null || metaValor <= 0 || !config) return null;

    const recebido = analitico.total.porOperador[perfil.id]?.bruto ?? 0;
    const percMeta = pct(recebido, metaValor);

    const totalUteis = diasUteisDoMes(ano, mes, config.feriados);
    if (totalUteis === 0) return null;
    const decorridos  = diasUteisDecorridos(ano, mes, config.feriados, getTodayISO());
    const metaDiaria  = metaValor / totalUteis;
    const esperado    = metaDiaria * Math.max(decorridos, 1);
    const projecao    = pct(recebido, esperado);
    const quartil     = quartilAtual(projecao, config.quartis);
    const proximo     = proximoQuartil(quartil, config.quartis);
    const paraSubir   = proximo ? Math.max(0, (esperado * proximo.min_pct) / 100 - recebido) : null;

    // Posição no ranking (operador: ranking da própria equipe — via RPC)
    const idx    = ranking.findIndex(r => r.operador_id === perfil.id);
    const acima  = idx > 0 ? ranking[idx - 1] : null;
    const gap    = acima ? Math.max(0, acima.total_recebido - recebido) : 0;

    return {
      recebido, percMeta, metaDiaria, esperado, projecao,
      quartil, proximo, paraSubir,
      posicao: idx >= 0 ? idx + 1 : null,
      acimaNome: acima ? (acima.operador_nome ?? acima.operador_usuario) : null,
      gap,
    };
  }, [perfil?.id, metaValor, config, analitico.total, ranking, ano, mes]);

  if (!isPP || !carregado || !analitico.dbAtiva || !dados) return null;

  const corMeta = dados.percMeta >= 100 ? '#22c55e'
    : dados.percMeta >= 70 ? '#6366f1'
    : dados.percMeta >= 40 ? '#f59e0b'
    : '#ef4444';

  const corQuartil = dados.quartil?.quartil === 1 ? '#22c55e'
    : dados.quartil?.quartil === 2 ? '#6366f1'
    : dados.quartil?.quartil === 3 ? '#f59e0b'
    : '#ef4444';

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-3 w-full max-w-xl space-y-2"
      data-tour="meta-progresso"
    >
      {/* 1 — Meta do mês */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
            <Target className="w-3.5 h-3.5" style={{ color: corMeta }} />
            Meta do mês
            <span className="text-[10px] text-muted-foreground/70">
              · {formatBRL(dados.metaDiaria)}/dia útil
            </span>
          </span>
          <span className="font-bold tabular-nums font-mono" style={{ color: corMeta }}>
            {dados.percMeta}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(dados.percMeta, 100)}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${corMeta}99, ${corMeta})` }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {formatBRL(dados.recebido)} de {formatBRL(metaValor ?? 0)}
        </p>
      </div>

      {/* 2 — Ranking */}
      {dados.posicao !== null && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          {dados.posicao === 1 ? (
            <span><strong className="text-foreground">1º lugar</strong> — você é o líder do ranking! 🏆</span>
          ) : (
            <span>
              Você está em <strong className="text-foreground">{dados.posicao}º lugar</strong> — faltam{' '}
              <strong className="text-foreground">{formatBRL(dados.gap)}</strong> para ultrapassar{' '}
              {dados.acimaNome}
            </span>
          )}
        </p>
      )}

      {/* 3 — Quartil (projeção diária) */}
      {dados.quartil && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
              <TrendingUp className="w-3.5 h-3.5" style={{ color: corQuartil }} />
              <span
                className={cn('font-bold px-1.5 py-0.5 rounded text-[11px]')}
                style={{ background: corQuartil + '22', color: corQuartil }}
              >
                {dados.quartil.quartil}º quartil
              </span>
              projeção do dia
            </span>
            <span className="font-bold tabular-nums font-mono" style={{ color: corQuartil }}>
              {dados.projecao}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(dados.projecao, 100)}%` }}
              transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${corQuartil}99, ${corQuartil})` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {dados.proximo && dados.paraSubir !== null ? (
              <>Deveria estar com {formatBRL(dados.esperado)} — faça{' '}
              <strong className="text-foreground">{formatBRL(dados.paraSubir)}</strong> hoje
              para subir ao {dados.proximo.quartil}º quartil</>
            ) : (
              <>Você está no melhor quartil — mantenha o ritmo! ✨</>
            )}
          </p>
        </div>
      )}
    </motion.div>
  );
}
