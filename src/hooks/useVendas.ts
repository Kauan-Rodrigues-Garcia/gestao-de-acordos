/**
 * useVendas — o que a aba Vendas precisa saber, num lugar só.
 *
 * ## O eixo é uma escolha da tela, e ela tem consequência
 *
 * `confirmacao` é o eixo oficial: define mês, meta e valor. `venda` é o eixo do
 * trabalho do dia — e o único que enxerga o que ainda está em aberto, porque
 * venda aberta não tem data de confirmação.
 *
 * Trocar o eixo não filtra a mesma lista de outro jeito: **remonta a pergunta**.
 * Uma venda feita em junho e confirmada em setembro aparece em setembro pelo
 * eixo oficial e em junho pelo eixo do trabalho. As duas leituras estão certas,
 * e é por isso que a tela mostra qual está no ar.
 *
 * ## Nada calculado é guardado
 *
 * O resumo sai de `resumirVendas` a cada render sobre a lista em memória. Não
 * há total gravado para envelhecer quando o líder confirma uma venda numa aba e
 * o operador olha noutra — o tempo real recarrega, e a conta refaz sozinha.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { assinarSinal } from '@/lib/sinais';
import { criarAgrupador } from '@/lib/agrupador';
import { primeiroDiaDoMes, ultimoDiaDoMes } from '@/lib/mesReferencia';
import {
  resumirVendas,
  type EixoDaVenda, type ResumoVendas, type SituacaoVenda,
} from '@/lib/vendas';
import {
  buscarVendas, buscarPendentes, salvarVenda, confirmarVenda, excluirVenda,
  type Venda, type EntradaVenda, type Resultado,
} from '@/services/vendas/vendas.service';

interface Params {
  empresaId: string | null;
  /** 'yyyy-MM' */
  mes: string;
  eixo: EixoDaVenda;
  /** `false` congela: não busca nem assina. */
  ativo: boolean;
}

export interface VendasDaTela {
  vendas: Venda[];
  /**
   * O resumo do mês INTEIRO, sem filtro de tela.
   *
   * O agrupamento por dia não mora aqui de propósito: a tela filtra por
   * operador antes de agrupar, e um `porDia` calculado sobre a lista completa
   * seria ou ignorado ou — pior — usado por engano, mostrando os dias de todo
   * mundo sob um placar de uma pessoa só. Quem filtra agrupa.
   */
  resumo: ResumoVendas;
  /**
   * A fila do líder — aberta, ou confirmada sem assinatura. Não se limita ao
   * mês em foco: uma venda de agosto esperando assinatura continua sendo
   * trabalho de hoje, e escondê-la ao virar o mês seria perdê-la de vista.
   */
  pendentes: Venda[];
  carregando: boolean;
  /** A migration foi aplicada neste banco? */
  disponivel: boolean;
  erro: string | null;
  recarregar: () => void;
  salvar: (entrada: Omit<EntradaVenda, 'empresaId'>) => Promise<Resultado>;
  confirmar: (params: {
    id: string;
    situacao: SituacaoVenda;
    assinado: boolean;
    dataConfirmacao: string | null;
    valorRecebido: number | null;
    motivo: string | null;
  }) => Promise<Resultado>;
  excluir: (id: string, motivo: string | null) => Promise<Resultado>;
}

const RESUMO_VAZIO = resumirVendas([]);

export function useVendas({ empresaId, mes, eixo, ativo }: Params): VendasDaTela {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [pendentes, setPendentes] = useState<Venda[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [disponivel, setDisponivel] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!empresaId || !ativo) return;
    setCarregando(true);
    const [doMes, fila] = await Promise.all([
      buscarVendas({ empresaId, de: primeiroDiaDoMes(mes), ate: ultimoDiaDoMes(mes), eixo }),
      buscarPendentes(empresaId),
    ]);
    setVendas(doMes.vendas);
    setPendentes(fila.vendas);
    setDisponivel(doMes.disponivel);
    // O erro de «tabela não existe» já virou `disponivel: false`, e a tela diz
    // isso com outras palavras. Repeti-lo aqui mostraria as duas mensagens.
    setErro(doMes.disponivel ? doMes.erro : null);
    setCarregando(false);
  }, [empresaId, mes, eixo, ativo]);

  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => {
    if (!empresaId || !ativo) return;
    const agrupador = criarAgrupador(() => { void carregar(); }, { esperaMs: 1_000, tetoMs: 5_000 });
    // `vendas` nunca esteve na publicação `supabase_realtime`: a escuta por
    // linha não recebia nada. O banco avisa por sinal (migration 20260917110000).
    const cancelar = assinarSinal('vendas', empresaId, {
      onMudou: agrupador.avisar, onReconectado: () => { void carregar(); },
    });
    return () => { agrupador.cancelar(); cancelar(); };
  }, [empresaId, ativo, carregar]);

  const resumo = useMemo(
    () => (vendas.length ? resumirVendas(vendas) : RESUMO_VAZIO),
    [vendas],
  );

  /*
   * Recarregar depois de cada escrita, e não só confiar no tempo real.
   *
   * O evento de `postgres_changes` chega — mas quem acabou de clicar merece ver
   * o resultado sem depender de a rede colaborar. As duas coisas juntas custam
   * uma leitura e removem a classe inteira de «salvei e não mudou nada».
   */
  const salvar = useCallback(async (entrada: Omit<EntradaVenda, 'empresaId'>) => {
    if (!empresaId) return { ok: false, id: null, erro: 'Sem empresa ativa.' };
    const r = await salvarVenda({ ...entrada, empresaId });
    if (r.ok) await carregar();
    return r;
  }, [empresaId, carregar]);

  const confirmar = useCallback(async (params: Parameters<VendasDaTela['confirmar']>[0]) => {
    const r = await confirmarVenda(params);
    if (r.ok) await carregar();
    return r;
  }, [carregar]);

  const excluir = useCallback(async (id: string, motivo: string | null) => {
    const r = await excluirVenda(id, motivo);
    if (r.ok) await carregar();
    return r;
  }, [carregar]);

  return {
    vendas, resumo, pendentes, carregando, disponivel, erro,
    recarregar: () => { void carregar(); },
    salvar, confirmar, excluir,
  };
}
