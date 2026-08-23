/**
 * useEscopoAnalitico — resolve "o que estou olhando" para o analítico.
 *
 * A regra em si é pura e mora em `escopoAnalitico.ts`. O que sobra aqui é o
 * trabalho de I/O que ela precisa: quem são os membros do setor/equipe (com os
 * clones que contam), quais setores estão marcados como alternativos e se o
 * carimbo de setor já chegou na resposta da RPC.
 *
 * Existe como hook porque DOIS painéis fazem exatamente isso — o dashboard e o
 * Painel Diretoria. Enquanto cada um montava o próprio conjunto, os dois
 * mostravam números diferentes do mesmo relatório.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  buscarFontesDeEscopo, operadoresDaEquipe, operadoresDoSetor,
  type FontesDeEscopo,
} from '@/services/analitico/analitico.service';
import {
  escopoDeSetor, setorSomaPorUsuarios, temCarimboDeSetor, ESCOPO_EMPRESA,
  type EscopoAnalitico, type LinhaEscopavel,
} from '@/services/analitico/escopoAnalitico';
import { buscarExclusoesSetor } from '@/services/analitico/exclusoesSetor.service';
import { chaveDeCache, gravarInstantaneo, valorInstantaneo } from '@/lib/cacheInstantaneo';
import type { OrigemKey } from '@/services/analitico/composicaoAcumulado';

export interface ParametrosEscopo {
  /** false = o tenant não usa analítico; o escopo sai pronto como empresa. */
  ativo: boolean;
  empresaId: string | null | undefined;
  isPaguePlay: boolean;
  setorId?: string | null;
  equipeId?: string | null;
  operadorId?: string | null;
  /**
   * Mês em foco ('yyyy-MM'). Mês fechado usa o retrato congelado da composição
   * (migration 20260803c) em vez das equipes de hoje — sem isso, mover alguém
   * de equipe agora mudaria o passado.
   */
  mes?: string | null;
  /** Linhas já carregadas — usadas só para saber se o carimbo veio. */
  linhas: readonly LinhaEscopavel[];
}

export interface ResultadoEscopo {
  /** `null` enquanto as fontes não chegaram — ver `pendente`. */
  escopo: EscopoAnalitico | null;
  /**
   * As fontes cruas, para quem precisa montar escopos de VÁRIOS setores de uma
   * vez (o breakdown por setor do Painel Diretoria). `null` até carregarem.
   */
  fontes: FontesDeEscopo | null;
  /** O carimbo de setor chegou nas linhas? (migration 20260802a aplicada) */
  carimboDisponivel: boolean;
  /** setor → origens fora do acumulado, para quem monta escopos de vários setores. */
  exclusoes: Record<string, ReadonlySet<OrigemKey>>;
  /** Setor de uma pessoa — equipe primeiro, cadastro na falta dela. */
  setorDoOperador: (id: string) => string | null;
  /**
   * true = ainda resolvendo.
   *
   * Quem consome PRECISA segurar a tela nesse estado. Tratar pendente como
   * "sem filtro" mostraria o total da empresa para quem só pode ver um setor,
   * ainda que por meio segundo — num painel de dinheiro.
   */
  pendente: boolean;
}

export function useEscopoAnalitico(params: ParametrosEscopo): ResultadoEscopo {
  const { ativo, empresaId, isPaguePlay, setorId, equipeId, operadorId, mes, linhas } = params;

  /*
   * As fontes do escopo reabrem do instantâneo.
   *
   * `pendente` é `escopo === null`, e quem consome PRECISA segurar a tela nesse
   * estado — o que, para um líder, significava esqueleto no Dashboard a cada
   * volta de outra aba, mesmo com as métricas já em cache. A semente entra no
   * estado inicial, e não num efeito, para que nem um quadro seja pintado como
   * pendente.
   *
   * Sem persistência em disco de propósito: `FontesDeEscopo` carrega `Set`, que
   * não sobrevive a `JSON.stringify`. A camada de memória guarda o objeto como
   * ele é, e é ela que resolve a navegação entre telas.
   */
  const chaveFontes = chaveDeCache('escopo-fontes', empresaId, mes);
  const [fontes, setFontes] = useState<FontesDeEscopo | null>(
    () => (ativo && empresaId ? valorInstantaneo<FontesDeEscopo>(chaveFontes) : null),
  );
  useEffect(() => {
    if (!ativo || !empresaId) { setFontes(null); return; }
    // Troca de mês já visto: pinta o guardado antes de ir à rede. Quando o
    // valor é o mesmo objeto, o React nem renderiza.
    const guardado = valorInstantaneo<FontesDeEscopo>(chaveFontes);
    if (guardado) setFontes(guardado);

    let cancelado = false;
    void buscarFontesDeEscopo(empresaId, mes).then(f => {
      if (cancelado) return;
      setFontes(f);
      gravarInstantaneo(chaveFontes, f);
    });
    return () => { cancelado = true; };
  }, [ativo, empresaId, mes, chaveFontes]);

  /** O carimbo de setor chegou? (migration 20260802a aplicada) */
  const carimboDisponivel = useMemo(() => temCarimboDeSetor(linhas), [linhas]);

  /**
   * Origens que cada setor tirou do acumulado no mês (migration 20260812e).
   *
   * Carregado AQUI, e não em cada tela, pelo mesmo motivo que o resto deste
   * hook existe: o dashboard e o Painel Diretoria têm que mostrar o mesmo
   * número que o card da aba Analítico. Tabela ausente devolve `{}` e nada
   * muda — a leitura é tolerante à migration pendente.
   */
  const chaveExclusoes = chaveDeCache('escopo-exclusoes', empresaId, mes);
  const [exclusoes, setExclusoes] = useState<Record<string, Set<OrigemKey>>>(
    () => (ativo && empresaId && mes
      ? valorInstantaneo<Record<string, Set<OrigemKey>>>(chaveExclusoes) ?? {}
      : {}),
  );
  useEffect(() => {
    if (!ativo || !empresaId || !mes) { setExclusoes({}); return; }
    // Também do instantâneo: sem isto, o escopo abre com todas as origens
    // dentro do acumulado e o número corrige sozinho meio segundo depois.
    const guardado = valorInstantaneo<Record<string, Set<OrigemKey>>>(chaveExclusoes);
    if (guardado) setExclusoes(guardado);

    let cancelado = false;
    void buscarExclusoesSetor(empresaId, mes).then(({ porSetor }) => {
      if (cancelado) return;
      setExclusoes(porSetor);
      gravarInstantaneo(chaveExclusoes, porSetor);
    });
    return () => { cancelado = true; };
  }, [ativo, empresaId, mes, chaveExclusoes]);

  /** Setor de uma pessoa — equipe primeiro, cadastro na falta dela. */
  const setorDoOperador = useMemo(
    () => (id: string) => fontes?.operadorEquipeMap[id]?.setor_id ?? null,
    [fontes],
  );

  const escopo = useMemo<EscopoAnalitico | null>(() => {
    if (!ativo) return ESCOPO_EMPRESA;
    // Operador: a RPC já devolve só as linhas dele, mas o filtro explícito
    // mantém a conta certa quando um líder escolhe "ver um operador".
    if (operadorId) return { tipo: 'operador', operadorId };
    if (!equipeId && !setorId) return ESCOPO_EMPRESA;
    if (!fontes) return null;
    if (equipeId) {
      return { tipo: 'equipe', operadores: operadoresDaEquipe(equipeId, fontes) };
    }
    return escopoDeSetor({
      setorId: setorId!,
      alternativo: setorSomaPorUsuarios({
        isPaguePlay,
        alternativo: fontes.setoresAlternativos.has(setorId!),
      }),
      operadores: operadoresDoSetor(setorId!, fontes),
      temCarimbo: carimboDisponivel,
      origensExcluidas: exclusoes[setorId!],
      setorDoOperador,
    });
  }, [ativo, operadorId, equipeId, setorId, fontes, isPaguePlay, carimboDisponivel,
      exclusoes, setorDoOperador]);

  return { escopo, fontes, carimboDisponivel, exclusoes, setorDoOperador, pendente: escopo === null };
}
