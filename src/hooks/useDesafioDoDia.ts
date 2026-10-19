/**
 * useDesafioDoDia — o placar ao vivo de um desafio do dia, e a lista que a
 * barra superior mostra.
 *
 * ## O tempo real
 *
 * O mesmo gatilho do Desafios e do Analítico: o sinal `analitico:<empresa>`
 * que o banco manda a cada importação do 58 e a cada rodada do robô do 59, com
 * o mesmo debounce de 1,5 s (uma importação manda alguns sinais seguidos). O
 * tópico é compartilhado por contagem de referências — a barra entra de carona
 * no canal que já existe.
 *
 * O relógio anda a cada 30 s para o tempo restante e a virada de situação
 * (agendado → valendo → apurando → encerrado), sem ida ao banco.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getTodayISO } from '@/lib';
import { assinarSinal } from '@/lib/sinais';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useDesafioEmCartaz } from '@/hooks/useDesafios';
import { ouvirPrevias, previasDaBarra } from '@/lib/previaDesafioDoDia';
import { buscarPlacarDoDia, type RespostaPlacarDoDia } from '@/services/desafios/desafios.service';
import {
  andamentoDoDia, ehDesafioDoDia, entradasNovas, minutoAgoraSaoPaulo, situacaoDoDia,
  type AndamentoDoDia, type Entrada, type PlacarDoDia, type SituacaoDoDia,
} from '@/services/desafios/desafioDoDia';
import type { Desafio } from '@/services/desafios/types';

const DEBOUNCE_IMPORTACAO_MS = 1_500;
/** Reserva para o sinal perdido: a cada 5 min relê mesmo sem aviso. */
const RELEITURA_MS = 5 * 60 * 1000;
const PASSO_RELOGIO_MS = 30_000;
/** Quanto tempo uma entrada fica anunciada na tela. */
const ENTRADA_VISIVEL_MS = 9_000;

// ── O relógio da operação ────────────────────────────────────────────────────

export interface RelogioSP { hoje: string; minuto: number }

export function useRelogioSaoPaulo(passoMs = PASSO_RELOGIO_MS): RelogioSP {
  const [agora, setAgora] = useState<RelogioSP>(() => ({ hoje: getTodayISO(), minuto: minutoAgoraSaoPaulo() }));
  useEffect(() => {
    const id = setInterval(() => {
      setAgora(a => {
        const proximo = { hoje: getTodayISO(), minuto: minutoAgoraSaoPaulo() };
        return proximo.hoje === a.hoje && proximo.minuto === a.minuto ? a : proximo;
      });
    }, passoMs);
    return () => clearInterval(id);
  }, [passoMs]);
  return agora;
}

// ── O placar de um desafio ───────────────────────────────────────────────────

export interface UsoPlacarDoDia {
  resposta: RespostaPlacarDoDia | null;
  placar: PlacarDoDia | null;
  andamento: AndamentoDoDia | null;
  situacao: SituacaoDoDia;
  minuto: number;
  hoje: string;
  /** O lote que acabou de entrar — some sozinho depois de alguns segundos. */
  entradas: Entrada[];
  /** Muda a cada lote novo: chave de animação. */
  loteId: number;
  carregando: boolean;
  erro: string | null;
}

export function usePlacarDoDia(desafio: Desafio | null, ativo = true): UsoPlacarDoDia {
  const { empresa } = useEmpresa();
  const queryClient = useQueryClient();
  const empresaId = empresa?.id ?? null;
  const diario = desafio?.regra.diario ?? null;
  const desafioId = desafio && diario && ativo ? desafio.id : null;
  const relogio = useRelogioSaoPaulo();
  // Dia que já passou não muda mais (fora a correção tardia do 59): lê uma vez,
  // sem escutar o tempo real.
  const aoVivo = !!desafio && desafio.dataInicio >= relogio.hoje;

  const chave = useMemo(() => ['desafio-do-dia', desafioId] as const, [desafioId]);

  const query = useQuery({
    queryKey: chave,
    enabled: !!desafioId,
    queryFn: () => buscarPlacarDoDia(desafioId as string),
    refetchInterval: aoVivo ? RELEITURA_MS : false,
    staleTime: aoVivo ? 20_000 : 10 * 60 * 1000,
  });

  useEffect(() => {
    if (!desafioId || !empresaId || !aoVivo) return;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const invalidar = () => { void queryClient.invalidateQueries({ queryKey: chave }); };
    const cancelar = assinarSinal('analitico', empresaId, {
      onMudou: () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => { debounce = null; invalidar(); }, DEBOUNCE_IMPORTACAO_MS);
      },
      onReconectado: invalidar,
    });
    return () => {
      if (debounce) clearTimeout(debounce);
      cancelar();
    };
  }, [desafioId, empresaId, aoVivo, queryClient, chave]);

  const resposta = query.data ?? null;
  const placar = resposta?.estado === 'ok' ? resposta.placar : null;

  // ── O que entrou desde a última leitura ───────────────────────────────────
  const anterior = useRef<PlacarDoDia | null>(null);
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [loteId, setLoteId] = useState(0);
  useEffect(() => {
    if (!placar) return;
    const antes = anterior.current;
    anterior.current = placar;
    // A primeira leitura não é «entrada»: é o placar que já existia.
    if (!antes) return;
    const novas = entradasNovas(antes.contribuintes, placar.contribuintes);
    if (!novas.length) return;
    setEntradas(novas);
    setLoteId(n => n + 1);
    const t = setTimeout(() => setEntradas([]), ENTRADA_VISIVEL_MS);
    return () => clearTimeout(t);
  }, [placar]);

  const andamento = useMemo(
    () => (diario && placar && desafio ? andamentoDoDia(diario, placar, desafio.dataInicio) : null),
    [diario, placar, desafio],
  );

  const situacao: SituacaoDoDia = desafio && diario
    ? situacaoDoDia({
        status: desafio.status, diaISO: desafio.dataInicio,
        hojeISO: relogio.hoje, minutoAgora: relogio.minuto, diario,
      })
    : 'encerrado';

  return {
    resposta,
    placar,
    andamento,
    situacao,
    minuto: relogio.minuto,
    hoje: relogio.hoje,
    entradas,
    loteId,
    carregando: !!desafioId && query.isPending,
    erro: query.error instanceof Error ? query.error.message : null,
  };
}

// ── O que a barra superior anuncia ───────────────────────────────────────────

/**
 * Os desafios do dia de HOJE que a pessoa enxerga, mais os rascunhos que ela
 * pediu para pré-visualizar.
 *
 * Quem participa é decidido depois, pelo placar (`participo`): enxergar pela
 * RLS não é estar no desafio — o líder do setor vê o desafio de um operador e
 * não precisa dele na barra.
 */
export function useDesafiosDoDiaNaBarra(ativo: boolean): { desafios: Desafio[]; previas: Set<string> } {
  const { emCartaz } = useDesafioEmCartaz(ativo);
  const previas = useSyncExternalStore(ouvirPrevias, previasDaBarra, previasDaBarra);
  const hoje = getTodayISO();

  return useMemo(() => {
    const doDia = emCartaz.filter(d => ehDesafioDoDia(d) && d.dataInicio === hoje);
    const ids = new Set(doDia.map(d => d.id));
    const extras = ativo ? previas.filter(d => ehDesafioDoDia(d) && !ids.has(d.id)) : [];
    return { desafios: [...doDia, ...extras], previas: new Set(previas.map(d => d.id)) };
  }, [emCartaz, previas, hoje, ativo]);
}
