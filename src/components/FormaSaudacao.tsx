/**
 * FormaSaudacao — o sólido que substituiu o 👋 do Dashboard.
 *
 * É o MESMO objeto do CreatorsLab: `NucleoHolografico`, um icosaedro aramado
 * em Canvas 2D que gira sozinho e se inclina na direção do cursor. Reaproveitar
 * em vez de reescrever é o ponto — a física, a projeção em perspectiva e a
 * ordenação por profundidade já estão testadas lá, e uma segunda implementação
 * do mesmo desenho divergiria da primeira no dia em que alguém mexesse numa.
 *
 * ## As cores saem do TEMA, não de constantes
 *
 * O pedido era que o sólido ficasse harmonizado com as paletas das duas
 * empresas e com os filtros de tema. Nenhuma cor é escrita aqui: as duas vêm de
 * `--primary` e `--muted-foreground`, lidas do documento em tempo de execução.
 *
 * Isso resolve os dois eixos de uma vez e sem lista nenhuma para manter:
 *
 *   • **empresa** — `[data-tenant="pagueplay"]` redefine `--primary` no
 *     `index.css`, então a PaguePlay já chega com a cor dela;
 *   • **tema** — claro, `dark`, `dark-grey`, `deep-blue`, `rosa` e o que vier
 *     depois redefinem as mesmas variáveis. Tema novo funciona sem tocar aqui.
 *
 * `--primary` desenha as arestas da frente e os vértices; `--muted-foreground`
 * fica nas arestas do fundo. É o mesmo par de papéis do CreatorsLab (destaque
 * na frente, apagado atrás), o que dá a leitura de profundidade sem sombra.
 *
 * ## Por que ler e observar, e não só ler uma vez
 *
 * Trocar de tema ou de empresa reescreve as variáveis no `<html>` sem
 * desmontar o Dashboard. Sem o `MutationObserver` o sólido ficaria com a cor do
 * tema anterior até a próxima navegação — visível, e do tipo de detalhe que
 * ninguém reporta e todo mundo estranha.
 */
import { useEffect, useState } from 'react';
import { NucleoHolografico } from '@/pages/CreatorsLab/components/NucleoHolografico';

/**
 * Cor de uma variável CSS, resolvida para algo que o Canvas aceita.
 *
 * `getComputedStyle` do `<html>` devolve o valor da variável como está escrito
 * — no nosso caso `oklch(...)`, que o Canvas 2D entende nos navegadores em que
 * o app já roda (o `index.css` inteiro é oklch). O fallback existe para o
 * instante entre o primeiro render e o CSS aplicado, não para navegador velho.
 */
function corDoTema(nome: string, reserva: string): string {
  if (typeof window === 'undefined') return reserva;
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return v || reserva;
}

export function FormaSaudacao({ tamanho = 42 }: { tamanho?: number }) {
  const [cores, setCores] = useState(() => ({
    primaria:   corDoTema('--primary', '#3b82f6'),
    secundaria: corDoTema('--muted-foreground', '#94a3b8'),
  }));

  const [movimentoReduzido, setMovimentoReduzido] = useState(
    () => typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const reler = () => setCores({
      primaria:   corDoTema('--primary', '#3b82f6'),
      secundaria: corDoTema('--muted-foreground', '#94a3b8'),
    });

    // `class` cobre os temas (`dark`, `rosa`, …) e `data-tenant`/`data-theme`
    // cobrem a empresa e o seletor de tema. Os três moram no mesmo elemento.
    const observador = new MutationObserver(reler);
    observador.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-tenant', 'data-theme'],
    });

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const aoTrocarMovimento = () => setMovimentoReduzido(mq.matches);
    mq.addEventListener('change', aoTrocarMovimento);

    return () => {
      observador.disconnect();
      mq.removeEventListener('change', aoTrocarMovimento);
    };
  }, []);

  return (
    <span
      className="inline-block align-middle -my-2"
      style={{ width: tamanho, height: tamanho }}
      /* O sólido é enfeite: quem lê por leitor de tela recebe a saudação e o
         nome, que é a informação. Um «icosaedro giratório» no meio da frase
         seria ruído. */
      aria-hidden="true"
    >
      <NucleoHolografico
        cor={cores.primaria}
        corSecundaria={cores.secundaria}
        tamanho={tamanho}
        movimentoReduzido={movimentoReduzido}
      />
    </span>
  );
}
