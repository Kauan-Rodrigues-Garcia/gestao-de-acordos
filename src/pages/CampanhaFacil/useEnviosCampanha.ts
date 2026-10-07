/**
 * Quem encaminha a campanha, e as campanhas que o líder já lançou
 * (20260929100000, 20261007150000, 20261007190000).
 *
 * A lista vem do setor: o líder só vê operadores do próprio setor (com os
 * clones), filtra pelo nome, marca quem vai mandar e libera. Cada um recebe
 * uma notificação e acha a parte dele na aba Campanhas de WhatsApp.
 *
 * O histórico é das campanhas DESTE líder: as abertas com o andamento ao vivo,
 * as encerradas com o placar congelado. Dali ele repassa, desativa, edita,
 * relança e exclui.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import type { Perfil } from '@/lib/supabase';
import type { CampaignItem, Discounts } from './lib/campaign-core';
import { casaNome, repartirPorOperador, type OperadorCampanha, type ParteRedistribuida } from './envios';
import {
  listarOperadoresParaCampanha, listarSetoresParaCampanha,
  liberarCampanha, listarHistorico, repassarEnvios, ativarLote, excluirLote, editarLote,
  mensagemDoErro, type EnvioResumo, type LoteCampanha,
} from './campanhaFacilEnvios.service';

/** O que a liberação leva além da campanha. */
export interface DadosLiberacao {
  titulo: string;
  arquivoNome: string;
  modelo: string;
  semValores: boolean;
  discounts: Partial<Discounts>;
}

export function useEnviosCampanha(empresaId: string | null, perfil: Perfil | null) {
  // Preso ao próprio setor quem não tem `campanha_escopo_todos_setores` no
  // painel. Até a fase 3 de cargos era a lista `PERFIS_VISAO_SETOR`.
  const { temPermissao } = useCargoPermissoes();
  const setorFixo = !!perfil && !temPermissao('campanha_escopo_todos_setores');
  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([]);
  const [setorEscolhido, setSetorEscolhido] = useState<string | null>(null);
  const setorId = setorFixo ? (perfil?.setor_id ?? null) : setorEscolhido;

  const [operadores, setOperadores] = useState<OperadorCampanha[]>([]);
  const [carregandoOperadores, setCarregandoOperadores] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  /** A lista do passo 3, filtrada pelo nome. A seleção vale para todos, filtrados ou não. */
  const operadoresVisiveis = useMemo(
    () => operadores.filter((o) => casaNome(o.nome, busca)),
    [operadores, busca],
  );

  const [historico, setHistorico] = useState<LoteCampanha[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);
  const [liberando, setLiberando] = useState(false);

  const autorId = perfil?.id ?? null;

  // Gerência para cima escolhe o setor; começa pelo dela, se tiver.
  useEffect(() => {
    if (setorFixo || !empresaId) return;
    let ativo = true;
    listarSetoresParaCampanha(empresaId)
      .then((lista) => {
        if (!ativo) return;
        setSetores(lista);
        setSetorEscolhido((atual) => atual ?? perfil?.setor_id ?? lista[0]?.id ?? null);
      })
      .catch((err) => console.error('[CampanhaFacil] setores:', err));
    return () => { ativo = false; };
  }, [setorFixo, empresaId, perfil?.setor_id]);

  // Operadores do setor. Todos começam marcados: o comum é a equipe inteira
  // mandar, e desmarcar quem faltou é menos clique do que marcar quem veio.
  useEffect(() => {
    if (!empresaId || !setorId) { setOperadores([]); setSelecionados(new Set()); return; }
    let ativo = true;
    setCarregandoOperadores(true);
    listarOperadoresParaCampanha(empresaId, setorId)
      .then((lista) => {
        if (!ativo) return;
        setOperadores(lista);
        setSelecionados(new Set(lista.map((o) => o.id)));
      })
      .catch((err) => {
        console.error('[CampanhaFacil] operadores:', err);
        if (ativo) toast.error('Não foi possível carregar os operadores do setor.');
      })
      .finally(() => { if (ativo) setCarregandoOperadores(false); });
    return () => { ativo = false; };
  }, [empresaId, setorId]);

  const recarregarHistorico = useCallback(async () => {
    if (!autorId) return;
    try {
      setHistorico(await listarHistorico(autorId));
    } catch (err) {
      console.warn('[CampanhaFacil] histórico:', err);
    } finally {
      setCarregandoHistorico(false);
    }
  }, [autorId]);

  useEffect(() => { void recarregarHistorico(); }, [recarregarHistorico]);

  const alternar = useCallback((id: string) => {
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);
  const marcarTodos = useCallback(() => setSelecionados(new Set(operadores.map((o) => o.id))), [operadores]);
  const desmarcarTodos = useCallback(() => setSelecionados(new Set()), []);

  /** Na ordem da lista (alfabética) — é a ordem do rodízio. */
  const operadoresSelecionados = useMemo(
    () => operadores.filter((o) => selecionados.has(o.id)),
    [operadores, selecionados],
  );

  /**
   * Libera a campanha: um envio por operador marcado, com notificação.
   *
   * `campanhaPorId` é a campanha gerada com os IDs no lugar dos nomes — ver
   * `repartirPorOperador`.
   */
  const liberar = useCallback(async (campanhaPorId: CampaignItem[], d: DadosLiberacao): Promise<boolean> => {
    if (!empresaId || !autorId) return false;
    const partes = repartirPorOperador(campanhaPorId, operadoresSelecionados, d.discounts);
    if (partes.length === 0) { toast.error('Marque ao menos um operador.'); return false; }
    setLiberando(true);
    try {
      const n = await liberarCampanha({
        empresaId, setorId, titulo: d.titulo, arquivoNome: d.arquivoNome,
        modelo: d.modelo, semValores: d.semValores, partes,
      });
      toast.success(`Campanha liberada para ${n} ${n === 1 ? 'operador' : 'operadores'}. Cada um já vê a parte dele em Campanhas de WhatsApp.`);
      await recarregarHistorico();
      return true;
    } catch (err) {
      console.error('[CampanhaFacil] liberar:', err);
      toast.error(mensagemDoErro(err, 'Não foi possível liberar a campanha. Nada foi enviado — tente de novo.'));
      return false;
    } finally {
      setLiberando(false);
    }
  }, [empresaId, autorId, setorId, operadoresSelecionados, recarregarHistorico]);

  const repassar = useCallback(async (
    faltaram: EnvioResumo[], recebedores: OperadorCampanha[],
  ): Promise<boolean> => {
    try {
      const n = await repassarEnvios({ faltaram, recebedores });
      toast.success(`Repasse feito para ${n} ${n === 1 ? 'operador' : 'operadores'}.`);
      return true;
    } catch (err) {
      console.error('[CampanhaFacil] repassar:', err);
      toast.error(mensagemDoErro(err, 'Não foi possível repassar. Tente de novo.'));
      return false;
    }
  }, []);

  const ativar = useCallback(async (lote: LoteCampanha, ativa: boolean): Promise<boolean> => {
    try {
      await ativarLote(lote.id, ativa);
      toast.success(ativa
        ? 'Campanha liberada de novo. Os operadores foram avisados e têm mais 2 dias.'
        : 'Campanha desativada. Ela sumiu da aba dos operadores.');
      return true;
    } catch (err) {
      console.error('[CampanhaFacil] ativar:', err);
      toast.error(mensagemDoErro(err, ativa ? 'Não foi possível relançar a campanha.' : 'Não foi possível desativar a campanha.'));
      return false;
    } finally {
      await recarregarHistorico();
    }
  }, [recarregarHistorico]);

  const excluir = useCallback(async (lote: LoteCampanha): Promise<boolean> => {
    try {
      await excluirLote(lote.id);
      toast.success('Campanha excluída.');
      return true;
    } catch (err) {
      console.error('[CampanhaFacil] excluir:', err);
      toast.error(mensagemDoErro(err, 'Não foi possível excluir a campanha.'));
      return false;
    } finally {
      await recarregarHistorico();
    }
  }, [recarregarHistorico]);

  const editar = useCallback(async (p: {
    lote: LoteCampanha; titulo: string; modelo: string | null; partes: ParteRedistribuida[];
  }): Promise<boolean> => {
    try {
      await editarLote({ loteId: p.lote.id, titulo: p.titulo, modelo: p.modelo, partes: p.partes });
      toast.success('Campanha atualizada. Libere de novo quando quiser que os operadores vejam.');
      return true;
    } catch (err) {
      console.error('[CampanhaFacil] editar:', err);
      toast.error(mensagemDoErro(err, 'Não foi possível salvar a edição.'));
      return false;
    } finally {
      await recarregarHistorico();
    }
  }, [recarregarHistorico]);

  return {
    setorFixo, setores, setorId, setSetorId: setSetorEscolhido,
    operadores, operadoresVisiveis, busca, setBusca,
    carregandoOperadores, selecionados, operadoresSelecionados,
    alternar, marcarTodos, desmarcarTodos,
    empresaId, historico, carregandoHistorico, recarregarHistorico,
    liberando, liberar, repassar, ativar, excluir, editar,
  };
}
