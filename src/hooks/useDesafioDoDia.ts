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
 *
 * ## Ao vivo só para quem participa (19/10/2026)
 *
 * O tempo real (o sinal e a releitura de 5 min) fica ligado só para quem está
 * no desafio (`participo`), para quem o criou (`acompanho`) e na prévia — é
 * para eles que a pílula aparece. Quem só ENXERGA o desafio pela RLS (o gerente
 * que vê o desafio de outro setor) lê uma vez, ao abrir. Antes, cada pessoa da
 * empresa com a aba Desafios relia o placar a cada lote do 59, mesmo com a
 * pílula escondida.
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
  andamentoDoDia, ehDesafioDoDia, entradasNovas, linhasDoPlacar, minutoAgoraSaoPaulo, situacaoDoDia,
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
  /** O placar acompanha o relatório sozinho (ver «Ao vivo só para quem participa»). */
  aoVivo: boolean;
  /** Quando o placar foi lido pela última vez (ms), para o «atualizado às». */
  lidoEm: number | null;
}

/** Quem acompanha ao vivo: quem está no desafio ou quem o criou. */
function acompanhaAoVivo(resposta: RespostaPlacarDoDia | undefined): boolean {
  return resposta?.estado === 'ok' && (resposta.placar.participo || resposta.placar.acompanho);
}

export function usePlacarDoDia(
  desafio: Desafio | null,
  ativo = true,
  /** A prévia do rascunho: quem configura acompanha, mesmo fora do alvo. */
  opcoes: { sempreAoVivo?: boolean } = {},
): UsoPlacarDoDia {
  const sempreAoVivo = opcoes.sempreAoVivo === true;
  const { empresa } = useEmpresa();
  const queryClient = useQueryClient();
  const empresaId = empresa?.id ?? null;
  const diario = desafio?.regra.diario ?? null;
  const desafioId = desafio && diario && ativo ? desafio.id : null;
  const relogio = useRelogioSaoPaulo();
  // Dia que já passou não muda mais (fora a correção tardia do 59): lê uma vez,
  // sem escutar o tempo real.
  const diaVigente = !!desafio && desafio.dataInicio >= relogio.hoje;

  const chave = useMemo(() => ['desafio-do-dia', desafioId] as const, [desafioId]);

  const query = useQuery({
    queryKey: chave,
    enabled: !!desafioId,
    queryFn: () => buscarPlacarDoDia(desafioId as string),
    // A releitura de reserva só para quem acompanha: decide pela resposta.
    refetchInterval: q => (diaVigente && (sempreAoVivo || acompanhaAoVivo(q.state.data)) ? RELEITURA_MS : false),
    staleTime: diaVigente ? 20_000 : 10 * 60 * 1000,
  });

  const aoVivo = diaVigente && (sempreAoVivo || acompanhaAoVivo(query.data));

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
    // Pessoas e o dinheiro do setor (o Receptivo, o «sem operador»): os dois
    // entram no total, e os dois são anunciados.
    const novas = entradasNovas(linhasDoPlacar(antes), linhasDoPlacar(placar));
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
    aoVivo,
    lidoEm: query.dataUpdatedAt || null,
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
