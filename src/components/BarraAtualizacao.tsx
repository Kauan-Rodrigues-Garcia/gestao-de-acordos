/**
 * BarraAtualizacao — o fio de 2 px que substituiu todos os esqueletos.
 *
 * Fica no topo da janela, acima de tudo, e não ocupa espaço no fluxo: `fixed` +
 * `pointer-events-none`. Aparecer e sumir não move um pixel do conteúdo, que é
 * a diferença entre um sinal e uma interrupção.
 *
 * ## A carência de 320 ms
 *
 * É o detalhe que faz o resto funcionar. A maioria das releituras deste sistema
 * termina em menos de 200 ms — e para essas **nenhum sinal é mostrado**. Sem a
 * carência, cada evento de tempo real acenderia e apagaria o fio, e o topo da
 * tela viraria um pisca-pisca: exatamente o incômodo que o trabalho de tirar os
 * esqueletos existe para acabar.
 *
 * ## Por que ele não tem porcentagem
 *
 * Ninguém sabe quanto falta. Uma barra que finge saber (aquela que sobe até 90%
 * e espera) mente sobre o progresso; esta apenas percorre o topo enquanto há
 * busca em andamento, e some quando não há. É o mesmo desenho do GitHub e do
 * YouTube, pelo mesmo motivo.
 */
import { useEffect, useState } from 'react';
import { useAtualizacaoGlobal } from '@/hooks/useAtualizacaoGlobal';

/** Abaixo disto, a espera não vira sinal nenhum. */
const CARENCIA_MS = 320;

export function BarraAtualizacao() {
  const { emAndamento, desde } = useAtualizacaoGlobal();
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (emAndamento === 0) { setVisivel(false); return; }

    // `desde` é o começo da RAJADA, não desta releitura: duas buscas em
    // sequência que somam 600 ms merecem o sinal, mesmo que nenhuma delas
    // passe da carência sozinha.
    const decorrido = desde ? Date.now() - desde : 0;
    if (decorrido >= CARENCIA_MS) { setVisivel(true); return; }

    const t = setTimeout(() => setVisivel(true), CARENCIA_MS - decorrido);
    return () => clearTimeout(t);
  }, [emAndamento, desde]);

  return (
    <div
      aria-hidden="true"
      className={`fixed top-0 left-0 right-0 z-[60] h-[2px] pointer-events-none
        transition-opacity duration-200 ${visivel ? 'opacity-100' : 'opacity-0'}`}
    >
      <div className="h-full w-full overflow-hidden bg-primary/10">
        <div className="barra-atualizacao-pulso h-full w-1/3 bg-primary/70" />
      </div>
    </div>
  );
}

export default BarraAtualizacao;
