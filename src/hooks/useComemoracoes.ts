/**
 * useComemoracoes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Estado das comemorações de meta — migration 20260731e.
 *
 * Dois hooks:
 *   useComemoracoes     — a lista, com realtime (usado pela aba e pelo overlay)
 *   useComemoracaoNoAr  — qual delas está explodindo na tela AGORA
 *
 * A conta de "está no ar?" mora em `janela.ts`, fora daqui, para ter teste.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { assinarTabela } from '@/lib/realtime';
import {
  buscarComemoracoes, buscarParabens, parabenizar,
  type Comemoracao, type ParabensComemoracao,
} from '@/services/comemoracoes.service';
import { sortearFrase } from '@/pages/Comemoracoes/frases';
import {
  estaNoAr, fimMs, msAteComecar, proximaDaFila, vaiComecar, desvioDoServidor,
} from '@/pages/Comemoracoes/janela';
import { deveExplodir } from '@/pages/Comemoracoes/escopo';

// ── Lista ────────────────────────────────────────────────────────────────────

export function useComemoracoes(empresaId: string | null, habilitado = true) {
  const [comemoracoes, setComemoracoes] = useState<Comemoracao[]>([]);
  const [loading, setLoading]           = useState(true);
  const [dbAtiva, setDbAtiva]           = useState(true);
  const [erro, setErro]                 = useState<string | null>(null);

  /**
   * Diferença entre o relógio do banco e o do navegador.
   *
   * Um PC com a hora adiantada mostraria a comemoração antes de todo mundo — e
   * um atrasado, depois de ela já ter acabado para os colegas.
   */
  const desvioRef = useRef(0);

  const montadoRef = useRef(true);
  useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);

  const recarregar = useCallback(async () => {
    if (!empresaId || !habilitado) { setLoading(false); return; }
    const res = await buscarComemoracoes(empresaId);
    if (!montadoRef.current) return;
    if (res.agoraServidor) {
      desvioRef.current = desvioDoServidor(res.agoraServidor, Date.now());
    }
    setComemoracoes(res.data);
    setDbAtiva(res.dbAtiva);
    setErro(res.erro);
    setLoading(false);
  }, [empresaId, habilitado]);

  const recarregarRef = useRef(recarregar);
  recarregarRef.current = recarregar;

  useEffect(() => { setLoading(true); void recarregar(); }, [recarregar]);

  useEffect(() => {
    if (!empresaId || !habilitado || !dbAtiva) return;
    return assinarTabela(
      {
        topico:  `rt-comemoracoes-${empresaId}`,
        escutas: [{ tabela: 'comemoracoes', filtro: `empresa_id=eq.${empresaId}` }],
      },
      {
        // Relê em vez de aplicar o payload: os homenageados vêm de outra tabela
        // e o `setores_alvo` é preenchido por trigger — o INSERT chega antes de
        // qualquer um dos dois estar pronto.
        onEvento:      () => { void recarregarRef.current(); },
        onReconectado: () => { void recarregarRef.current(); },
      },
    );
  }, [empresaId, habilitado, dbAtiva]);

  /** Agora corrigido pelo relógio do servidor. */
  const agoraCorrigido = useCallback(() => Date.now() + desvioRef.current, []);

  return { comemoracoes, loading, dbAtiva, erro, recarregar, agoraCorrigido };
}

// ── Qual está no ar ──────────────────────────────────────────────────────────

/**
 * A comemoração que deve estar na tela agora, ou null.
 *
 * **Uma de cada vez.** Duas sobrepostas no topo-centro seriam ilegíveis, então
 * a segunda espera a primeira acabar — mesmo padrão do `NotificacaoToast`.
 */
export function useComemoracaoNoAr(params: {
  comemoracoes:   Comemoracao[];
  meuSetorId:     string | null;
  meuUsuarioId:   string | null;
  agoraCorrigido: () => number;
}) {
  const { comemoracoes, meuSetorId, meuUsuarioId, agoraCorrigido } = params;

  const [atual, setAtual] = useState<Comemoracao | null>(null);
  /** Já apareceram nesta sessão — não voltam quando a lista é relida. */
  const exibidasRef = useRef<Set<string>>(new Set());
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Forçar reavaliação quando um timer vence. */
  const [tick, setTick] = useState(0);

  // Só as que explodem para MIM. Líder+ enxerga todas na aba, mas o popup é do
  // setor — ver `escopo.ts`.
  const minhas = useMemo(
    () => comemoracoes.filter((c) => !c.cancelada_em && deveExplodir(c, meuSetorId, meuUsuarioId)),
    [comemoracoes, meuSetorId, meuUsuarioId],
  );

  useEffect(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

    const agora = agoraCorrigido();

    if (atual) {
      // Cancelada no meio da exibição: sai da tela de todo mundo na hora.
      const viva = minhas.find((c) => c.id === atual.id);
      if (!viva) {
        exibidasRef.current.add(atual.id);
        setAtual(null);
        return;
      }
      timerRef.current = setTimeout(() => {
        exibidasRef.current.add(atual.id);
        setAtual(null);
        setTick((t) => t + 1);
      }, Math.max(0, fimMs(atual) - agora));
      return;
    }

    const proxima = proximaDaFila(minhas, agora, exibidasRef.current);
    if (proxima) { setAtual(proxima); return; }

    // Nada no ar: dorme até a próxima começar. Sem isso, uma comemoração
    // agendada só apareceria quando algo mais provocasse um render.
    const esperas = minhas
      .filter((c) => vaiComecar(c, agora))
      .map((c) => msAteComecar(c, agora));
    if (esperas.length) {
      // +50 ms para acordar já dentro da janela, não no limite exato.
      timerRef.current = setTimeout(() => setTick((t) => t + 1), Math.min(...esperas) + 50);
    }

    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [minhas, atual, tick, agoraCorrigido]);

  /** Fecha antes da hora (botão ×). Não volta nesta sessão. */
  const fechar = useCallback(() => {
    setAtual((anterior) => {
      if (anterior) exibidasRef.current.add(anterior.id);
      return null;
    });
    setTick((t) => t + 1);
  }, []);

  return { atual, fechar, estaNoAr: !!atual && estaNoAr(atual, agoraCorrigido()) };
}

// ── Parabéns ─────────────────────────────────────────────────────────────────

/**
 * Os parabéns de UMA comemoração, ao vivo.
 *
 * Tópico por comemoração, e não por empresa: `comemoracao_parabens` não tem
 * `empresa_id`, então é por `comemoracao_id` que o realtime consegue filtrar.
 * O canal vive o tempo do card — segundos — e some junto com ele.
 */
export function useParabens(params: {
  comemoracaoId: string | null;
  empresaId:     string | null;
  usuarioId:     string | null;
}) {
  const { comemoracaoId, empresaId, usuarioId } = params;

  const [parabens, setParabens] = useState<ParabensComemoracao[]>([]);
  const [enviando, setEnviando] = useState(false);

  const montadoRef = useRef(true);
  useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);

  const recarregar = useCallback(async () => {
    if (!comemoracaoId || !empresaId) { setParabens([]); return; }
    const lista = await buscarParabens(comemoracaoId, empresaId);
    if (montadoRef.current) setParabens(lista);
  }, [comemoracaoId, empresaId]);

  const recarregarRef = useRef(recarregar);
  recarregarRef.current = recarregar;

  useEffect(() => { void recarregar(); }, [recarregar]);

  useEffect(() => {
    if (!comemoracaoId) return;
    return assinarTabela(
      {
        topico:  `rt-parabens-${comemoracaoId}`,
        escutas: [{
          tabela: 'comemoracao_parabens',
          filtro: `comemoracao_id=eq.${comemoracaoId}`,
        }],
      },
      {
        // Relê em vez de aplicar o payload: o nome e a foto de quem
        // parabenizou vêm de outra tabela, e o realtime não faz join.
        onEvento:      () => { void recarregarRef.current(); },
        onReconectado: () => { void recarregarRef.current(); },
      },
    );
  }, [comemoracaoId]);

  /** Eu já parabenizei esta comemoração? */
  const jaParabenizei = useMemo(
    () => !!usuarioId && parabens.some((p) => p.usuario_id === usuarioId),
    [parabens, usuarioId],
  );

  const enviarParabens = useCallback(async () => {
    if (!comemoracaoId || !usuarioId || jaParabenizei) return;
    setEnviando(true);
    try {
      // A frase é sorteada AQUI e gravada na linha, para todo mundo ver a
      // mesma. Sortear na exibição faria cada tela mostrar uma diferente.
      await parabenizar({ comemoracaoId, usuarioId, frase: sortearFrase() });
      await recarregarRef.current();
    } finally {
      if (montadoRef.current) setEnviando(false);
    }
  }, [comemoracaoId, usuarioId, jaParabenizei]);

  return { parabens, jaParabenizei, enviando, enviarParabens };
}
