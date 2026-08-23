/**
 * useDadosVivos — a tela abre cheia, e nunca mais volta a ficar vazia.
 *
 * ## As três cargas que o projeto tratava como uma só
 *
 * **A primeira de todas** (nunca vimos esta consulta) não tem o que preservar:
 * a tela está vazia e o esqueleto é a resposta honesta para "estou buscando".
 *
 * **A reabertura** (já vimos, o componente desmontou e voltou) é a mais comum de
 * todas — sair do Dashboard, ir aos Acordos, voltar. Aqui o esqueleto é puro
 * desperdício: a resposta de quinze segundos atrás está guardada e é quase
 * sempre idêntica à que vai chegar. `chaveCache` faz a tela nascer pintada com
 * ela, em tempo zero, e a releitura acontece por trás.
 *
 * **A atualização** (tempo real, reconexão, botão) acontece com a tela cheia e
 * com alguém lendo. Trocá-la por esqueleto perde o scroll, fecha o que estava
 * expandido e apaga o input aberto, para no fim mostrar o mesmo conteúdo.
 *
 * Só a primeira liga `carregando`. As outras duas passam por
 * `reconciliarLista`: os itens que não mudaram voltam com a MESMA referência, e
 * quando nada mudou o `setState` recebe o array anterior e o React não renderiza
 * nada.
 *
 * ## `atualizando` não é `carregando`
 *
 * Ele existe para o fio de 2 px no topo (`BarraAtualizacao`), nunca para trocar
 * o conteúdo. Quem o usar para renderizar esqueleto reintroduz o defeito que
 * este hook existe para consertar.
 *
 * ## Tempo real embutido
 *
 * `assinar` evita a cópia mais repetida do projeto: `useEffect` + `assinarTabela`
 * + `setVersao(v => v + 1)` + um `useEffect` que relê. Além de encurtar, ele traz
 * o **agrupamento**: uma importação de 2.400 linhas manda 2.400 eventos, e sem
 * agrupador isso vira 2.400 releituras da empresa inteira.
 *
 * ## Aba em segundo plano não busca
 *
 * Quem deixa o Gestão aberto num monitor lateral e passa o dia noutro sistema
 * mantinha, até aqui, todas as telas relendo o mês inteiro a cada evento. Com a
 * aba oculta o hook anota que ficou devendo e relê UMA vez quando a pessoa
 * volta — que é o único momento em que o resultado será olhado.
 *
 * ## Corrida entre releituras
 *
 * Duas releituras sobrepostas terminam fora de ordem, e a mais VELHA chegando
 * por último grava dado vencido. Cada carga leva um número de série; só a mais
 * recente escreve.
 */
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { reconciliarComDiff, type OpcoesReconciliacao } from '@/lib/dadosVivos';
import { gravarInstantaneo, lerInstantaneo } from '@/lib/cacheInstantaneo';
import { comecouAtualizacao } from '@/lib/estadoAtualizacao';
import { criarAgrupador, type OpcoesAgrupador } from '@/lib/agrupador';
import { assinarTabela, type EscutaTabela } from '@/lib/realtime';

export interface AssinaturaDadosVivos {
  /**
   * Nome do canal. É a chave de deduplicação de `assinarTabela` — inclua tudo
   * que muda as escutas (empresa, mês, usuário), senão o segundo consumidor
   * recebe silenciosamente as escutas do primeiro.
   */
  topico: string;
  escutas: EscutaTabela[];
}

export interface UseDadosVivosOpcoes<T> extends OpcoesReconciliacao<T> {
  /**
   * Busca a lista. Precisa ser estável (`useCallback`) — é ela que decide
   * quando o hook recarrega do zero.
   */
  carregar: () => Promise<T[]>;
  /**
   * `false` congela o hook: não busca e não mexe no que já está na tela.
   * Serve para "ainda não sei a empresa" e para aba fechada.
   */
  ativo?: boolean;
  /**
   * Identidade da CONSULTA, para a tela reabrir já pintada.
   *
   * Monte com `chaveDeCache(...)` e inclua empresa, perfil e todo filtro que
   * muda o resultado. Ela precisa mudar **junto** com `carregar`: uma chave que
   * muda sozinha pinta a resposta de outra pergunta por alguns quadros.
   *
   * Sem ela o hook se comporta como antes — esqueleto a cada reabertura.
   */
  chaveCache?: string;
  /**
   * Guarda o instantâneo também no `sessionStorage`, para sobreviver a um F5.
   * Padrão `false`: a memória já resolve a navegação entre telas, que é o caso
   * frequente. Ligue nas telas que as pessoas de fato recarregam.
   */
  persistirCache?: boolean;
  /** Assina tabelas e relê em silêncio quando elas mudam. */
  assinar?: AssinaturaDadosVivos;
  /** Janela de agrupamento dos eventos de tempo real. */
  agrupamento?: OpcoesAgrupador;
  /**
   * Com a aba em segundo plano, adia a releitura para a volta. Padrão `true`.
   * Desligue apenas onde o dado precisa estar quente no instante em que a
   * pessoa olha de relance para o outro monitor.
   */
  pausarOculto?: boolean;
}

export interface UseDadosVivosResultado<T> {
  dados: T[];
  /** Só na PRIMEIRA carga sem nada em tela. Nunca use numa releitura. */
  carregando: boolean;
  /** Releitura em andamento com a tela cheia — sinal discreto, não esqueleto. */
  atualizando: boolean;
  erro: string | null;
  /** `Date.now()` da última resposta boa. Para o "atualizado há …". */
  atualizadoEm: number | null;
  /** O que está em tela veio do cache e ainda não foi confirmado pelo servidor. */
  doCache: boolean;
  /** Relê em silêncio e reconcilia. */
  recarregar: () => Promise<void>;
  /**
   * Escreve direto no estado, reconciliando.
   *
   * Para quando quem chama JÁ tem o dado novo (o payload do realtime, a
   * resposta de um `update`) e não precisa de uma ida ao servidor.
   */
  aplicar: (proximos: T[]) => void;
  /** Chaves que entraram na última reconciliação — para animar a entrada. */
  entraram: readonly string[];
}

export function useDadosVivos<T>({
  carregar, chave, iguais, ativo = true,
  chaveCache, persistirCache = false,
  assinar, agrupamento, pausarOculto = true,
}: UseDadosVivosOpcoes<T>): UseDadosVivosResultado<T> {
  const [dados, setDados]             = useState<T[]>([]);
  const [carregando, setCarregando]   = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro]               = useState<string | null>(null);
  const [entraram, setEntraram]       = useState<string[]>([]);
  const [atualizadoEm, setAtualizado] = useState<number | null>(null);
  const [doCache, setDoCache]         = useState(false);

  const jaCarregou   = useRef(false);
  const serie        = useRef(0);
  const vivo         = useRef(true);
  /** Ficou devendo uma releitura porque a aba estava oculta. */
  const devendo      = useRef(false);

  // Lidas por ref: mudar a função de comparação não pode disparar releitura.
  const chaveRef      = useRef(chave);          chaveRef.current      = chave;
  const iguaisRef     = useRef(iguais);         iguaisRef.current     = iguais;
  const chaveCacheRef = useRef(chaveCache);     chaveCacheRef.current = chaveCache;
  const persistirRef  = useRef(persistirCache); persistirRef.current  = persistirCache;

  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  const escrever = useCallback((proximos: T[]) => {
    setDados(atual => {
      const { lista, entraram: novos } = reconciliarComDiff(atual, proximos, {
        chave: chaveRef.current, iguais: iguaisRef.current,
      });
      // Só publica "entraram" quando houve entrada: um array novo a cada
      // reconciliação faria renderizar quem depende dele mesmo sem novidade.
      if (novos.length > 0) setEntraram(novos);
      return lista;
    });
  }, []);

  const buscar = useCallback(async (primeira: boolean) => {
    if (!ativo) return;

    // Aba oculta: anota e sai. A releitura acontece na volta, uma só, por mais
    // eventos que tenham chegado enquanto ninguém olhava.
    if (!primeira && pausarOculto
        && typeof document !== 'undefined' && document.hidden) {
      devendo.current = true;
      return;
    }

    const meu = ++serie.current;

    if (primeira) setCarregando(true);
    else          setAtualizando(true);

    // O fio de 2 px no topo. Só a releitura silenciosa entra nele: a primeira
    // carga já tem o esqueleto dela e não precisa de um segundo aviso.
    const encerrar = primeira ? null : comecouAtualizacao();

    try {
      const lista = await carregar();
      // Chegou depois de uma busca mais nova: descarta. Escrever aqui
      // reintroduziria dado velho por cima do recente.
      if (!vivo.current || meu !== serie.current) { encerrar?.(false); return; }

      // `startTransition` cede o quadro ao que a pessoa está fazendo: numa lista
      // de 2.400 linhas, a reconciliação e a re-renderização deixam de travar a
      // digitação na busca.
      startTransition(() => escrever(lista));

      setErro(null);
      setAtualizado(Date.now());
      setDoCache(false);
      jaCarregou.current = true;

      const ck = chaveCacheRef.current;
      if (ck) gravarInstantaneo(ck, lista, { persistir: persistirRef.current });

      encerrar?.(true);
    } catch (e) {
      encerrar?.(false);
      if (!vivo.current || meu !== serie.current) return;
      setErro(e instanceof Error ? e.message : String(e));
      // Numa releitura o dado antigo FICA na tela. Ele é velho, mas é verdade
      // de um minuto atrás — melhor que uma tela vazia por falha de rede.
    } finally {
      if (vivo.current && meu === serie.current) {
        if (primeira) setCarregando(false);
        setAtualizando(false);
      }
    }
  }, [ativo, carregar, escrever, pausarOculto]);

  /*
   * Carga nova: outro mês, outro filtro, outra empresa.
   *
   * Se houver instantâneo desta consulta, a tela é pintada com ele AGORA e a
   * busca vira silenciosa — nenhum esqueleto aparece. Sem instantâneo, é a
   * primeira vez de verdade e o esqueleto é a resposta certa.
   */
  useEffect(() => {
    jaCarregou.current = false;
    devendo.current = false;

    const semente = chaveCache ? lerInstantaneo<T[]>(chaveCache) : null;

    if (semente) {
      escrever(semente.valor);
      setCarregando(false);
      setAtualizado(semente.gravadoEm);
      setDoCache(true);
      jaCarregou.current = true;
      void buscar(false);
      return;
    }

    void buscar(true);
    // `buscar` já embute `carregar` e `ativo`. `chaveCache` entra porque trocar
    // de consulta troca o instantâneo que serve de semente.
  }, [buscar, chaveCache, escrever]);

  const recarregar = useCallback(async () => {
    await buscar(!jaCarregou.current);
  }, [buscar]);

  /*
   * Tempo real, agrupado.
   *
   * O agrupador é criado por assinatura e destruído com ela: um timer vivo
   * depois do desmonte dispararia uma releitura de um componente que já saiu da
   * tela. A reconexão NÃO passa pelo agrupador — ela significa "houve um buraco
   * no histórico de eventos" e merece releitura na hora.
   */
  const topico  = assinar?.topico;
  const escutas = assinar?.escutas;
  const escutasSerializadas = useMemo(() => JSON.stringify(escutas ?? null), [escutas]);
  const esperaMs = agrupamento?.esperaMs;
  const tetoMs   = agrupamento?.tetoMs;

  useEffect(() => {
    if (!ativo || !topico) return;
    const lista = JSON.parse(escutasSerializadas) as EscutaTabela[] | null;
    if (!lista?.length) return;

    const grupo = criarAgrupador(() => { void recarregar(); }, { esperaMs, tetoMs });

    const cancelar = assinarTabela(
      { topico, escutas: lista },
      {
        onEvento:      () => grupo.avisar(),
        onReconectado: () => { grupo.cancelar(); void recarregar(); },
      },
    );

    return () => { grupo.cancelar(); cancelar(); };
  }, [ativo, topico, escutasSerializadas, esperaMs, tetoMs, recarregar]);

  /* A volta para a aba paga o que ficou devendo — uma vez, não uma por evento. */
  useEffect(() => {
    if (!pausarOculto || typeof document === 'undefined') return;
    const aoVoltar = () => {
      if (document.visibilityState !== 'visible') return;
      if (!devendo.current) return;
      devendo.current = false;
      void recarregar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [pausarOculto, recarregar]);

  return {
    dados, carregando, atualizando, erro, atualizadoEm, doCache,
    recarregar, aplicar: escrever, entraram,
  };
}
