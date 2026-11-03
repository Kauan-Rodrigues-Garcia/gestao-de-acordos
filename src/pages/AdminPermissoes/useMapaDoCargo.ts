/**
 * useMapaDoCargo — ler, alterar e salvar o mapa de um cargo, ou o dele num setor.
 *
 * Saiu de `PorCargo.tsx` em 03/11/2026, quando o mapa do setor ganhou a visão
 * Por setor: as duas abas editam a mesma coisa e precisam salvar igual — o mapa
 * INTEIRO, nunca só o que mudou (ver `salvar`).
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { PERFIL_LABELS } from '@/lib/index';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import {
  CARGOS_ACESSO_TOTAL, catalogoDoTenant, gruposDoTenant, permissoesPadraoDoCargo,
} from '@/lib/permissoes-catalogo';
import { montarPorAba } from '@/lib/permissoes-abas';
import { useRascunho } from './useRascunho';

/** O que está aberto: um cargo, ou o mapa dele num setor. */
export interface Alvo {
  cargo: string;
  setorId: string | null;
}

export function useMapaDoCargo({ cargo, setorId }: Alvo, rotuloDoAlvo: string) {
  const { empresa, tenantSlug } = useEmpresa();
  const { todasPermissoes, todasPermissoesSetor, refresh } = useCargoPermissoes();
  const [salvando, setSalvando] = useState(false);
  const rascunho = useRascunho<boolean>();

  const catalogo = useMemo(() => catalogoDoTenant(tenantSlug), [tenantSlug]);
  const grupos   = useMemo(() => gruposDoTenant(tenantSlug), [tenantSlug]);

  /*
   * O catálogo remontado na ordem em que a pergunta nasce: cargo → aba → o que
   * ele vê e o que ele faz ali. Antes a tela listava por categoria, e responder
   * "o que o líder pode no Analítico?" exigia caçar a chave da aba num grupo, o
   * alcance em outro e as ações num terceiro.
   */
  const { blocos } = useMemo(
    () => montarPorAba(catalogo, grupos, tenantSlug),
    [catalogo, grupos, tenantSlug],
  );

  /** O mapa próprio do cargo no setor (vazio quando não há). */
  const doSetor = (c: string, s: string | null) =>
    (s ? todasPermissoesSetor.find(r => r.cargo === c && r.setor_id === s)?.permissoes : undefined) ?? {};

  const temMapaNoSetor = !!setorId
    && todasPermissoesSetor.some(r => r.cargo === cargo && r.setor_id === setorId);
  const acessoTotal = (CARGOS_ACESSO_TOTAL as readonly string[]).includes(cargo);

  /**
   * O valor gravado. Depois da migration `20260815154058` toda chave existe em
   * todo cargo; o `permissoesPadraoDoCargo` só cobre a janela entre o deploy do
   * frontend e a aplicação da migration.
   */
  const salvo = useMemo(() => {
    const doBanco = todasPermissoes.find(r => r.cargo === cargo)?.permissoes;
    const doCargo = doBanco && Object.keys(doBanco).length > 0
      ? doBanco
      : permissoesPadraoDoCargo(cargo);
    // No mapa de setor, o que vale é o do cargo com o do setor por cima — o
    // mesmo que a pessoa do setor recebe (`mapaDoCargoNoSetor`).
    return { ...doCargo, ...doSetor(cargo, setorId) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doSetor lê todasPermissoesSetor
  }, [todasPermissoes, todasPermissoesSetor, cargo, setorId]);

  const valorDe = (key: string): boolean =>
    key in rascunho.alteracoes ? rascunho.alteracoes[key] : !!salvo[key];

  /** Quantas permissões o cargo tem — o número das listas de cargo e de setor. */
  const contarDe = useMemo(() => (c: string, setor: string | null = null): number => {
    if ((CARGOS_ACESSO_TOTAL as readonly string[]).includes(c)) return catalogo.length;
    const doCargo = todasPermissoes.find(r => r.cargo === c)?.permissoes
      ?? permissoesPadraoDoCargo(c);
    const mapa = { ...doCargo, ...doSetor(c, setor) };
    return catalogo.filter(p => !!mapa[p.key]).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doSetor lê todasPermissoesSetor
  }, [todasPermissoes, todasPermissoesSetor, catalogo]);

  function alternar(key: string) {
    if (acessoTotal) return;
    rascunho.definir(key, !valorDe(key));
    rascunho.podar(k => !!salvo[k]);
  }

  async function salvar() {
    if (!empresa?.id || !rascunho.sujo) return;
    setSalvando(true);
    try {
      // Grava o mapa INTEIRO, nunca só o que mudou: chave ausente era
      // exatamente o defeito que esta versão veio corrigir.
      //
      // E inteiro quer dizer o que JÁ estava gravado mais o que a tela mostra.
      // Até 02/10/2026 ia só o recorte deste produto: no Comercial, cada
      // «Salvar» apagava `ver_painel_lider`, `ver_tickets` e as outras chaves
      // que a tela não mostrava — e o líder perdia a aba sem ninguém tê-la
      // desligado. Chave fora do recorte não é decisão desta tela; fica como
      // estava.
      const completo = {
        ...salvo,
        ...Object.fromEntries(catalogo.map(p => [p.key, valorDe(p.key)])),
      };
      const { error } = setorId
        ? await supabase
          .from('cargos_permissoes_setor')
          .upsert(
            { empresa_id: empresa.id, setor_id: setorId, cargo, permissoes: completo },
            { onConflict: 'setor_id,cargo' },
          )
        : await supabase
          .from('cargos_permissoes')
          .upsert(
            { empresa_id: empresa.id, cargo, permissoes: completo },
            { onConflict: 'empresa_id,cargo' },
          );
      if (error) throw error;
      toast.success(`Permissões de ${rotuloDoAlvo} salvas.`);
      rascunho.descartar();
      await refresh();
    } catch (e) {
      toast.error('Não foi possível salvar. ' + (e instanceof Error ? e.message : ''));
    } finally {
      setSalvando(false);
    }
  }

  /** Cria o mapa do cargo no setor, cópia do mapa do cargo. */
  async function criarNoSetor(): Promise<boolean> {
    if (!empresa?.id || !setorId) return false;
    const doCargo = todasPermissoes.find(r => r.cargo === cargo)?.permissoes
      ?? permissoesPadraoDoCargo(cargo);
    const { error } = await supabase
      .from('cargos_permissoes_setor')
      .insert({ empresa_id: empresa.id, setor_id: setorId, cargo, permissoes: doCargo });
    if (error) {
      toast.error('Não foi possível criar. ' + error.message);
      return false;
    }
    toast.success(`${rotuloDoAlvo} criado, igual ao cargo.`);
    rascunho.descartar();
    await refresh();
    return true;
  }

  /** Apaga o mapa do setor: quem está lá volta às permissões do cargo. */
  async function removerDoSetor(): Promise<boolean> {
    if (!setorId) return false;
    if (!confirm(`Remover as permissões próprias de ${rotuloDoAlvo}? Quem está no setor volta às permissões de ${PERFIL_LABELS[cargo] ?? cargo}.`)) return false;
    const { error } = await supabase
      .from('cargos_permissoes_setor')
      .delete()
      .eq('setor_id', setorId)
      .eq('cargo', cargo);
    if (error) {
      toast.error('Não foi possível remover. ' + error.message);
      return false;
    }
    toast.success(`${rotuloDoAlvo} removido.`);
    rascunho.descartar();
    await refresh();
    return true;
  }

  return {
    catalogo, blocos, rascunho, salvando, acessoTotal, temMapaNoSetor, todasPermissoesSetor,
    valorDe, alternar, salvar, contarDe, criarNoSetor, removerDoSetor,
  };
}

export type MapaDoCargo = ReturnType<typeof useMapaDoCargo>;
