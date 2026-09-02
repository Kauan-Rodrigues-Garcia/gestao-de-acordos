/**
 * useEstadoLembrado — o estado da tela sobrevive a sair e voltar.
 *
 * ## O que estava acontecendo
 *
 * Sair da aba e voltar desmonta o componente. Todo `useState` renasce no valor
 * inicial: o painel que estava aberto fecha, a busca digitada some, o filtro
 * escolhido volta para «todos». Quem estava conferindo uma lista nome a nome
 * — validar premiação, acompanhar quem falta, lançar mais um NR — recomeçava do
 * zero a cada ida e volta.
 *
 * Não é o mesmo problema que `cacheInstantaneo` resolve. Lá o assunto é a
 * RESPOSTA do servidor (não pinte esqueleto para quem já teve uma resposta);
 * aqui é a ESCOLHA de quem está olhando, que nunca esteve no servidor e mesmo
 * assim se perdia.
 *
 * ## Por que reaproveita o `cacheInstantaneo`
 *
 * Pelo depósito, não pela semântica: ele já tem a camada de memória que
 * atravessa a navegação, a persistência opcional em `sessionStorage` para
 * sobreviver ao F5, e a limpeza no logout — que aqui importa tanto quanto lá.
 * A busca digitada por uma pessoa não pode reaparecer na sessão da próxima que
 * entrar na mesma aba do navegador.
 *
 * ## A chave é responsabilidade de quem chama
 *
 * Use `chaveDeCache` e inclua o que muda o significado do valor (empresa,
 * perfil, mês). Uma chave curta demais devolve a escolha de outro recorte —
 * e uma escolha errada é pior que nenhuma, porque parece deliberada.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { gravarInstantaneo, valorInstantaneo } from '@/lib/cacheInstantaneo';

export interface OpcoesEstadoLembrado {
  /**
   * Guarda também no `sessionStorage`, para o valor atravessar um F5.
   *
   * Padrão `true`: escolha de tela é minúscula, e recarregar a página é
   * exatamente o momento em que perder o filtro mais incomoda. Passe `false`
   * para valores que não devem sobreviver ao recarregamento.
   */
  persistir?: boolean;
}

/**
 * Como `useState`, e o valor volta na próxima montagem.
 *
 * `inicial` só é consultado quando não há nada guardado — é a função de
 * primeira vez, não um valor que sobrescreve o lembrado.
 */
export function useEstadoLembrado<T>(
  chave: string,
  inicial: T | (() => T),
  { persistir = true }: OpcoesEstadoLembrado = {},
): [T, (v: T | ((atual: T) => T)) => void] {
  /** `inicial` num ref: ele costuma ser literal, e literal muda de identidade
   *  a cada render. Como dependência de efeito, releria sem parar. */
  const inicialRef = useRef(inicial);
  inicialRef.current = inicial;

  const doDeposito = useCallback((k: string): T => {
    const guardado = valorInstantaneo<T>(k);
    if (guardado !== null && guardado !== undefined) return guardado;
    const semente = inicialRef.current;
    return typeof semente === 'function' ? (semente as () => T)() : semente;
  }, []);

  const [valor, setValor] = useState<T>(() => doDeposito(chave));

  /*
   * O valor atual num ref porque o `set` funcional precisa dele para gravar, e
   * fechar sobre o `valor` do render faria a identidade do callback mudar a cada
   * tecla digitada — cada `onChange` de input viraria uma prop nova para o filho.
   */
  const ref = useRef(valor);
  ref.current = valor;

  /*
   * A chave chega DEPOIS, e o valor tem de vir atrás dela.
   *
   * Quem monta a chave usa empresa e perfil, e no primeiro render eles ainda
   * não chegaram — a chave nasce como `pix-auto|-|-` e vira a de verdade um
   * render depois. Sem esta releitura, o estado ficava com o que foi lido da
   * chave provisória (nada), e a escolha guardada da pessoa nunca aparecia: o
   * filtro «lembrado» abria vazio em toda montagem, que é o defeito que este
   * hook existe para não ter.
   *
   * `chaveAnterior` evita reler na primeira execução: o `useState` acima já leu
   * essa mesma chave, e reaplicar dispararia um render a troco de nada.
   */
  const chaveAnterior = useRef(chave);
  useEffect(() => {
    if (chaveAnterior.current === chave) return;
    chaveAnterior.current = chave;
    const doNovo = doDeposito(chave);
    ref.current = doNovo;
    setValor(doNovo);
  }, [chave, doDeposito]);

  const definir = useCallback((v: T | ((atual: T) => T)) => {
    const novo = typeof v === 'function' ? (v as (atual: T) => T)(ref.current) : v;
    ref.current = novo;
    setValor(novo);
    gravarInstantaneo(chave, novo, { persistir });
  }, [chave, persistir]);

  return [valor, definir];
}
