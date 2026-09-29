/**
 * Quem encaminha a campanha, e o que já foi liberado (20260929100000).
 *
 * Antes o líder digitava os nomes. Agora a lista vem do setor: o líder só vê
 * operadores do próprio setor (com os clones), marca quem vai mandar, libera,
 * e cada um recebe a parte dele na notificação. Se alguém faltou depois da
 * liberação, o líder repassa a parte dessa pessoa para um ou mais colegas.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PERFIS_VISAO_SETOR } from '@/lib/index';
import type { Perfil } from '@/lib/supabase';
import type { CampaignItem } from './lib/campaign-core';
import { repartirPorOperador, type OperadorCampanha } from './envios';
import {
  listarOperadoresParaCampanha, listarSetoresParaCampanha,
  liberarCampanha, listarEnviosLiberados, repassarEnvios, cancelarLote,
  type EnvioResumo, type Autor,
} from './campanhaFacilEnvios.service';

/** Cargo preso ao próprio setor — ver `PERFIS_VISAO_SETOR`. */
function presoAoSetor(perfil: Perfil | null): boolean {
  return !!perfil && (PERFIS_VISAO_SETOR as readonly string[]).includes(perfil.perfil);
}

export function useEnviosCampanha(empresaId: string | null, perfil: Perfil | null) {
  const setorFixo = presoAoSetor(perfil);
  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([]);
  const [setorEscolhido, setSetorEscolhido] = useState<string | null>(null);
  const setorId = setorFixo ? (perfil?.setor_id ?? null) : setorEscolhido;

  const [operadores, setOperadores] = useState<OperadorCampanha[]>([]);
  const [carregandoOperadores, setCarregandoOperadores] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const [enviados, setEnviados] = useState<EnvioResumo[]>([]);
  const [liberando, setLiberando] = useState(false);

  const autor = useMemo<Autor | null>(
    () => (perfil ? { id: perfil.id, nome: perfil.nome ?? null, foto: perfil.foto_url ?? null } : null),
    [perfil],
  );

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

  const recarregarEnviados = useCallback(async () => {
    if (!autor) return;
    try {
      setEnviados(await listarEnviosLiberados(autor.id));
    } catch (err) {
      // Tabela ainda não criada (migration pendente) cai aqui: a tela segue
      // funcionando para exportar, só sem a lista de liberadas.
      console.warn('[CampanhaFacil] envios liberados:', err);
      setEnviados([]);
    }
  }, [autor]);

  useEffect(() => { void recarregarEnviados(); }, [recarregarEnviados]);

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
  const liberar = useCallback(async (
    campanhaPorId: CampaignItem[], titulo: string, arquivoBase: string,
  ): Promise<boolean> => {
    if (!empresaId || !autor) return false;
    const partes = repartirPorOperador(campanhaPorId, operadoresSelecionados);
    if (partes.length === 0) { toast.error('Marque ao menos um operador.'); return false; }
    setLiberando(true);
    try {
      const n = await liberarCampanha({
        empresaId, setorId, titulo, arquivoNome: arquivoBase, autor, partes,
      });
      toast.success(`Campanha liberada para ${n} ${n === 1 ? 'operador' : 'operadores'}. Cada um recebeu a notificação para baixar a planilha.`);
      await recarregarEnviados();
      return true;
    } catch (err) {
      console.error('[CampanhaFacil] liberar:', err);
      toast.error('Não foi possível liberar a campanha. Nada foi enviado — tente de novo.');
      return false;
    } finally {
      setLiberando(false);
    }
  }, [empresaId, autor, setorId, operadoresSelecionados, recarregarEnviados]);

  const repassar = useCallback(async (
    faltaram: EnvioResumo[], recebedores: OperadorCampanha[],
  ): Promise<boolean> => {
    if (!empresaId || !autor) return false;
    try {
      const n = await repassarEnvios({ empresaId, faltaram, recebedores, autor });
      toast.success(`Repasse feito para ${n} ${n === 1 ? 'operador' : 'operadores'}.`);
      await recarregarEnviados();
      return true;
    } catch (err) {
      console.error('[CampanhaFacil] repassar:', err);
      toast.error('Não foi possível repassar. Tente de novo.');
      await recarregarEnviados();
      return false;
    }
  }, [empresaId, autor, recarregarEnviados]);

  const cancelar = useCallback(async (loteId: string) => {
    if (!autor) return;
    try {
      await cancelarLote(autor.id, loteId);
      toast.success('Campanha cancelada. Os operadores não conseguem mais baixar.');
    } catch (err) {
      console.error('[CampanhaFacil] cancelar:', err);
      toast.error('Não foi possível cancelar a campanha.');
    } finally {
      await recarregarEnviados();
    }
  }, [autor, recarregarEnviados]);

  return {
    setorFixo, setores, setorId, setSetorId: setSetorEscolhido,
    operadores, carregandoOperadores, selecionados, operadoresSelecionados,
    alternar, marcarTodos, desmarcarTodos,
    enviados, liberando, liberar, repassar, cancelar, recarregarEnviados,
  };
}
