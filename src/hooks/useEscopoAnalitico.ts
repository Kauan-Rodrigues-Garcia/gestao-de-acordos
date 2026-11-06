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
  buscarFontesDeEscopo, buscarRegraSetorDaPessoa, operadoresDaEquipe, operadoresDoSetor,
  type FontesDeEscopo, type RegraSetorDaPessoa,
} from '@/services/analitico/analitico.service';
import {
  escopoDeSetor, setorSomaPorUsuarios, temCarimboDeSetor, ESCOPO_EMPRESA,
  type EscopoAnalitico, type LinhaEscopavel,
} from '@/services/analitico/escopoAnalitico';
import { buscarExclusoesSetor } from '@/services/analitico/exclusoesSetor.service';
import { chaveDeCache, gravarInstantaneo, valorInstantaneo } from '@/lib/cacheInstantaneo';
import type { OrigemKey } from '@/services/analitico/composicaoAcumulado';
import { useDivisoes } from '@/hooks/useDivisoes';
import {
  divisoesDoSetor, escopoDaDivisao, escopoSemDivisao, type DivisaoDoSetor,
} from '@/services/setores/divisoes';

export interface ParametrosEscopo {
  /** false = o tenant não usa analítico; o escopo sai pronto como empresa. */
  ativo: boolean;
  empresaId: string | null | undefined;
  isPaguePlay: boolean;
  setorId?: string | null;
  equipeId?: string | null;
  operadorId?: string | null;
  /**
   * Divisão do setor em foco (05/11/2026). Só vale com o setor escolhido e
   * sem equipe nem pessoa — é um recorte do setor, não de outra coisa.
   */
  divisaoId?: string | null;
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
  /** As divisões do setor em foco (vazio = setor sem divisão). */
  divisoesDoSetor: DivisaoDoSetor[];
  /**
   * «Sem divisão» do setor em foco: o que é do setor e não cabe em nenhuma
   * divisão. `null` quando o setor não tem divisão ou o recorte não é o setor.
   */
  escopoSemDivisao: EscopoAnalitico | null;
}

export function useEscopoAnalitico(params: ParametrosEscopo): ResultadoEscopo {
  const { ativo, empresaId, isPaguePlay, setorId, equipeId, operadorId, divisaoId, mes, linhas } = params;
  const { divisoes: todasDivisoes, perfilPorUsuario } = useDivisoes();
  const divisoesDoSetorEmFoco = useMemo(
    () => divisoesDoSetor(todasDivisoes, setorId),
    [todasDivisoes, setorId],
  );

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

  /**
   * «A linha conta só no setor da pessoa», em pares (13/10/2026) — a regra que
   * o card da equipe no Painel Líder aplica e o recorte de equipe daqui não
   * aplicava. Só o recorte de EQUIPE usa: setor soma pelo carimbo, e operador é
   * a pessoa inteira.
   *
   * Relida a cada `linhas` nova, e não por cache: a importação do 59 é o que
   * cria par novo, e é ela que troca as linhas. Sem linhas não há o que
   * filtrar, e nada é buscado.
   *
   * Guardada com a chave do mês: trocar de mês não pode aplicar, nem por um
   * quadro, os pares do mês anterior.
   */
  const precisaRegra = ativo && !!empresaId && !!mes && !!equipeId && !operadorId;
  const chaveRegra = chaveDeCache('escopo-regra-setor', empresaId, mes);
  const [regra, setRegra] = useState<{ chave: string; valor: RegraSetorDaPessoa } | null>(() => {
    const guardado = precisaRegra ? valorInstantaneo<RegraSetorDaPessoa>(chaveRegra) : null;
    return guardado ? { chave: chaveRegra, valor: guardado } : null;
  });
  const temLinhas = linhas.length > 0;
  useEffect(() => {
    if (!precisaRegra || !temLinhas) return;
    const guardado = valorInstantaneo<RegraSetorDaPessoa>(chaveRegra);
    if (guardado) setRegra(r => (r?.chave === chaveRegra ? r : { chave: chaveRegra, valor: guardado }));

    let cancelado = false;
    void buscarRegraSetorDaPessoa(empresaId as string, mes as string).then(valor => {
      if (cancelado) return;
      setRegra({ chave: chaveRegra, valor });
      gravarInstantaneo(chaveRegra, valor);
    });
    return () => { cancelado = true; };
    // `linhas` (e não só `temLinhas`) de propósito: cada importação relê.
  }, [precisaRegra, temLinhas, empresaId, mes, chaveRegra, linhas]);
  const regraDoMes = regra?.chave === chaveRegra ? regra.valor : null;

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
      const operadores = operadoresDaEquipe(equipeId, fontes);
      if (!precisaRegra) return { tipo: 'equipe', operadores, equipeId };
      // Com linhas na tela e a regra ainda a caminho, segura: mostrar o número
      // com as linhas de fora e corrigi-lo meio segundo depois é a divergência
      // que isto veio tirar. Erro na leitura devolve regra vazia — nunca trava.
      if (temLinhas && !regraDoMes) return null;
      return {
        tipo: 'equipe',
        operadores,
        equipeId,
        foraDoSetor: regraDoMes?.foraDoSetor,
        creditos:    regraDoMes?.creditosPorEquipe[equipeId],
      };
    }
    const doSetor = escopoDeSetor({
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
    // Divisão escolhida: recorte do setor por quem soma nela.
    const divisao = divisaoId ? divisoesDoSetorEmFoco.find(d => d.id === divisaoId) : null;
    if (divisao && doSetor.tipo === 'setor') {
      return escopoDaDivisao(doSetor, divisao, divisoesDoSetorEmFoco, fontes, perfilPorUsuario);
    }
    return doSetor;
  }, [ativo, operadorId, equipeId, setorId, fontes, isPaguePlay, carimboDisponivel,
      exclusoes, setorDoOperador, precisaRegra, temLinhas, regraDoMes,
      divisaoId, divisoesDoSetorEmFoco, perfilPorUsuario]);

  /** «Sem divisão»: só existe no recorte de setor (ou de divisão) com divisões. */
  const escopoResto = useMemo<EscopoAnalitico | null>(() => {
    if (!escopo || !fontes || divisoesDoSetorEmFoco.length === 0) return null;
    const doSetor = escopo.tipo === 'setor' ? escopo
      : escopo.tipo === 'divisao' ? escopo.setor
      : null;
    if (!doSetor) return null;
    return escopoSemDivisao(doSetor, divisoesDoSetorEmFoco, fontes, perfilPorUsuario);
  }, [escopo, fontes, divisoesDoSetorEmFoco, perfilPorUsuario]);

  return {
    escopo, fontes, carimboDisponivel, exclusoes, setorDoOperador, pendente: escopo === null,
    divisoesDoSetor: divisoesDoSetorEmFoco,
    escopoSemDivisao: escopoResto,
  };
}
