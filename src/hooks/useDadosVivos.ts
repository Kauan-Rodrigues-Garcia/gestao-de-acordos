/**
 * useDadosVivos — carrega uma vez com esqueleto, atualiza em silêncio depois.
 *
 * ## As duas cargas que o projeto tratava como uma só
 *
 * **A primeira** não tem o que preservar: a tela está vazia e o esqueleto é a
 * resposta certa para "estou buscando".
 *
 * **As seguintes** — realtime, reconexão, botão de atualizar, volta do foco —
 * acontecem com a tela cheia e com alguém lendo. Trocá-la por esqueleto perde
 * o scroll, fecha o que estava expandido e apaga o input aberto, para no fim
 * mostrar quase sempre exatamente o mesmo conteúdo.
 *
 * Este hook separa as duas: `carregando` só é verdadeiro na primeira, e a
 * releitura passa por `reconciliarLista` — os itens que não mudaram voltam com
 * a MESMA referência, e quando nada mudou o `setState` recebe o array anterior
 * e o React não renderiza nada.
 *
 * ## `atualizando` não é `carregando`
 *
 * Ele existe para um sinal discreto (um ponto girando no canto), nunca para
 * trocar o conteúdo. Quem o usar para renderizar esqueleto reintroduz o defeito
 * que o hook existe para consertar.
 *
 * ## Corrida entre releituras
 *
 * Duas releituras sobrepostas terminam fora de ordem, e a mais VELHA chegando
 * por último grava dado vencido. Cada carga leva um número de série; só a mais
 * recente escreve.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { reconciliarComDiff, type OpcoesReconciliacao } from '@/lib/dadosVivos';

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
}

export interface UseDadosVivosResultado<T> {
  dados: T[];
  /** Só na PRIMEIRA carga. Nunca use para decidir esqueleto numa releitura. */
  carregando: boolean;
  /** Releitura em andamento com a tela cheia — sinal discreto, não esqueleto. */
  atualizando: boolean;
  erro: string | null;
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
}: UseDadosVivosOpcoes<T>): UseDadosVivosResultado<T> {
  const [dados, setDados]             = useState<T[]>([]);
  const [carregando, setCarregando]   = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro]               = useState<string | null>(null);
  const [entraram, setEntraram]       = useState<string[]>([]);

  const jaCarregou = useRef(false);
  const serie      = useRef(0);
  const vivo       = useRef(true);

  // Lidas por ref: mudar a função de comparação não pode disparar releitura.
  const chaveRef  = useRef(chave);   chaveRef.current  = chave;
  const iguaisRef = useRef(iguais);  iguaisRef.current = iguais;

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
    const meu = ++serie.current;

    if (primeira) setCarregando(true);
    else          setAtualizando(true);

    try {
      const lista = await carregar();
      // Chegou depois de uma busca mais nova: descarta. Escrever aqui
      // reintroduziria dado velho por cima do recente.
      if (!vivo.current || meu !== serie.current) return;
      escrever(lista);
      setErro(null);
      jaCarregou.current = true;
    } catch (e) {
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
  }, [ativo, carregar, escrever]);

  // Troca de `carregar` (mês, filtro, empresa) é carga NOVA: o conteúdo
  // anterior é de outro recorte, e mostrá-lo enquanto o novo não chega seria
  // dizer que aquele é o resultado do filtro que a pessoa acabou de escolher.
  useEffect(() => {
    jaCarregou.current = false;
    void buscar(true);
    // `buscar` já embute `carregar` e `ativo`.
  }, [buscar]);

  const recarregar = useCallback(async () => {
    await buscar(!jaCarregou.current);
  }, [buscar]);

  return { dados, carregando, atualizando, erro, recarregar, aplicar: escrever, entraram };
}
