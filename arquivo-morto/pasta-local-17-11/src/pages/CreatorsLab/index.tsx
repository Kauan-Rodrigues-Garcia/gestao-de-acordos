/**
 * CreatorsLab — a área escondida.
 * ─────────────────────────────────────────────────────────────────────────────
 * Chega-se aqui por `/creators`, e a rota não está em menu nenhum. O caminho
 * normal é clicar cinco vezes rápido no logo do Gestão — ver
 * `useEasterEggCriadores`.
 *
 * O que abre é a área de trabalho de um computador fictício: a máquina liga
 * (`desktop/Intro`), e cada coisa que o Lab tem é um programa dela
 * (`desktop/AreaDeTrabalho`, `desktop/programas.ts`).
 *
 * ## Isolamento
 *
 * Tudo vive dentro de `.creators-lab`, com as variáveis `--creator-*` e os
 * atributos `data-*` do tema aplicados NESTE elemento e não em `:root`. Nenhuma
 * regra deste módulo alcança o Dashboard, o Login ou os modais do Gestão.
 *
 * ## Custo para quem nunca vem aqui
 *
 * A página inteira entra por `lazy()` no roteador. Dentro dela, cada programa
 * é outro `import()`, feito só quando o programa é aberto: quem usa o Gestão e
 * nunca descobre o Easter Egg não baixa nada disto, e quem descobre só baixa o
 * que abre. Este arquivo e os de `desktop/` não podem importar nada de
 * `sections/` — há teste guardando isso.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import './creators-lab.css';
import { CreatorsProvider, useCreators } from './theme/CreatorsProvider';
import { atributosDoTema, variaveisCss } from './theme/themes';
import { AreaDeTrabalho } from './desktop/AreaDeTrabalho';
import { Intro } from './desktop/Intro';
import { AvisoConquista } from './components/AvisoConquista';

function LabInterno() {
  const navigate = useNavigate();
  const {
    tema, tokens, registrar, movimentoReduzido,
    ofertaReduzirMovimento, alternarMovimento, recusarOferta,
  } = useCreators();

  /*
   * A inicialização e a área de trabalho se sobrepõem por um instante: a mesa
   * é montada quando a intro COMEÇA a sumir, e a intro só é desmontada quando
   * terminou de sumir. É o que faz a tela de entrada dissolver na área de
   * trabalho, em vez de cortar para ela.
   */
  const [mesaMontada, setMesaMontada] = useState(false);
  const [introMontada, setIntroMontada] = useState(true);

  const estilo = useMemo(() => variaveisCss(tokens) as React.CSSProperties, [tokens]);
  const atributos = useMemo(() => atributosDoTema(tokens), [tokens]);

  useEffect(() => { registrar({ entrou: true, temasVistos: [tema] }); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const sair = useCallback(() => navigate('/'), [navigate]);
  const revelar = useCallback(() => setMesaMontada(true), []);
  const encerrarIntro = useCallback(() => setIntroMontada(false), []);

  return (
    <div
      className="creators-lab"
      {...atributos}
      /*
       * O CSS lê ESTE atributo para decidir sobre movimento, e não uma
       * `@media (prefers-reduced-motion)`. Foi a media query que deixou o Lab
       * completamente parado em duas máquinas do trabalho, onde o Windows vem
       * com "Efeitos de animação" desligado de fábrica. Ver o cabeçalho de
       * `creators-lab.css`.
       */
      data-movimento={movimentoReduzido ? 'reduzido' : 'completo'}
      style={estilo}
    >
      {mesaMontada && <AreaDeTrabalho aoDesligar={sair} />}

      {introMontada && <Intro aoRevelar={revelar} aoTerminar={encerrarIntro} />}

      {/*
        A oferta de movimento reduzido.
        ───────────────────────────────────────────────────────────────────────
        O sistema pediu redução e ninguém decidiu nada ainda. O Lab NÃO obedece
        sozinho — ver o cabeçalho de `theme/CreatorsProvider.tsx` —, mas seria
        grosseiro ignorar o pedido em silêncio. Então ele pergunta, uma vez, e
        guarda a resposta dos dois lados: aceitar reduz, dispensar mantém.

        Aparece só com a área de trabalho montada: no meio da inicialização
        seria um convite a clicar em algo que ninguém leu.
      */}
      {mesaMontada && !introMontada && ofertaReduzirMovimento && (
        <div
          className="creators-lab__painel creators-lab__painel--marcado creators-lab__aviso p-4"
          role="dialog"
          aria-label="Preferência de movimento"
        >
          <p className="text-sm" style={{ color: tokens.cores.texto }}>
            Seu sistema pede menos animação. Aqui elas estão <strong>ligadas</strong>.
          </p>
          <p className="mt-1 text-xs" style={{ color: tokens.cores.textoSuave }}>
            Dá para reduzir agora ou pelo botão <span aria-hidden>◐</span> na barra, quando quiser.
          </p>
          <div className="mt-3 flex gap-2">
            <button className="creators-lab__btn" onClick={alternarMovimento}>
              reduzir
            </button>
            <button
              className="creators-lab__btn"
              onClick={recusarOferta}
              style={{ borderColor: tokens.cores.borda }}
            >
              manter
            </button>
          </div>
        </div>
      )}

      {mesaMontada && <AvisoConquista />}
    </div>
  );
}

export default function CreatorsLab() {
  return (
    <CreatorsProvider>
      <LabInterno />
    </CreatorsProvider>
  );
}
