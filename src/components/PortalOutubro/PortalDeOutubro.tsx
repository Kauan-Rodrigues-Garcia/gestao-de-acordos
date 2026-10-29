/**
 * PortalDeOutubro.tsx — a peça que o `Layout` monta: decide, pela hora do
 * portal (`fases.ts`), o que aparece.
 *
 *   espreitando / final  o bueiro com os olhos e os balões (com o tema de
 *                        Halloween ligado: quem desligou os enfeites não vê)
 *                        e os avisos (para todos); no final, o barco, a mão
 *                        e a contagem com o «Participar»
 *   aberto               quem participou: a abertura, uma vez, só com a aba
 *                        à vista (quem está em outra aba vê quando voltar);
 *                        quem não participou, ou já viu: o botão do mural na
 *                        barra de cima, só o visual (29/10/2026)
 *
 * A abertura e o mural são outro pedaço (`Cerimonia.tsx`), que só baixa na
 * hora. Quem decide se isto monta é o `Layout`, pela liberação do super_admin
 * (`liberacao.ts`); a hora da abertura vem de lá também (sexta 16h, ou a
 * solta pelo botão). Na prévia (só nesta aba, sem estar liberado), só a
 * abertura e o mural aparecem.
 */
import { lazy, Suspense, useEffect } from 'react';
import { DIAS, estadoDoPortal } from './fases';
import { agoraDoPortal, useAgoraDoPortal } from './relogio';
import { abrirAbertura, lerTela, useJaViu, useParticipa, useTela } from './estado';
import { BALAO_NA_PREVIA_MS, BARCO_NA_PREVIA_MS, encerrarPrevia, usePrevia, usePreviaDoBueiro } from './liberacao';
import { CamadaDoBueiro } from './Bueiro';
import { Avisos, BotaoDoMural } from './Avisos';
import { ControleDeSom } from './ControleDeSom';
import { PainelDoRelogio } from './PainelDoRelogio';
import { carregarFonte, carregarFontesPixel } from '@/components/Halloween/fonte';
import { semPlacaDeVideo } from '@/components/Halloween/aguenta';
import './portal.css';

// As letras das placas (declarar não baixa: só quando um texto as usa).
carregarFonte(); carregarFontesPixel();

const Cerimonia = lazy(() => import('./Cerimonia'));

interface Props {
  temaLigado: boolean;
  leve?: boolean;
  /** Liberado para todos (ou no dev). Sem isso, só a prévia. */
  liberado: boolean;
  /** A hora da abertura: sexta 16h, ou a solta pelo botão. */
  abertura: number;
}

export function PortalDeOutubro({ temaLigado, leve = false, liberado, abertura }: Props) {
  // Relê a hora de segundo em segundo só quando o segundo aparece (a contagem
  // de sexta, o último minuto, a abertura chegando); no resto da semana, de
  // 30 em 30 s — o bueiro anda devagar, e reler à toa é trabalho para nada.
  const precisaDoSegundo = (() => {
    const e = estadoDoPortal(agoraDoPortal(), abertura);
    return e.contagem || e.fase === 'final' || e.dia === 5 || (e.faltaMs > 0 && e.faltaMs <= 3 * 60_000);
  })();
  const agora = useAgoraDoPortal(precisaDoSegundo ? 1000 : 30_000);
  const estado = estadoDoPortal(agora, abertura);
  const previa = usePrevia();
  // Máquina sem placa de vídeo: o portal fica parado, como o tema (`Halloween/aguenta.ts`).
  const parado = leve || semPlacaDeVideo();
  const tela = useTela();
  const viu = useJaViu();
  const participa = useParticipa();

  // A prévia: a abertura passa agora, nesta aba; fechou o mural, acabou.
  useEffect(() => {
    if (previa && !lerTela()) abrirAbertura();
  }, [previa]);
  useEffect(() => {
    // `lerTela`, não `tela`: no primeiro passo a abertura acabou de entrar no efeito de cima.
    if (previa && !lerTela()) encerrarPrevia();
  }, [previa, tela]);

  // Na hora: a abertura passa, uma vez, para quem participou, quando a aba está à vista.
  useEffect(() => {
    if (!liberado || estado.fase !== 'aberto' || viu || !participa) return;
    const tentar = () => {
      if (document.visibilityState === 'visible' && !lerTela()) abrirAbertura();
    };
    tentar();
    document.addEventListener('visibilitychange', tentar);
    return () => document.removeEventListener('visibilitychange', tentar);
  }, [liberado, estado.fase, viu, participa]);

  const espreitando = liberado && (estado.fase === 'espreitando' || estado.fase === 'final');

  // A prévia do bueiro (só nesta aba): o dia de hoje se for semana do mural,
  // senão uma quinta; balões e barquinho bem mais vezes. Com ou sem o tema.
  const previaDoBueiro = usePreviaDoBueiro();
  const estadoDaPrevia = previaDoBueiro
    ? { ...(estado.fase === 'espreitando' ? estado : estadoDoPortal(DIAS[4] + 10 * 3_600_000)), balaoACadaMs: BALAO_NA_PREVIA_MS }
    : null;

  return (
    <>
      {estadoDaPrevia && !tela && <CamadaDoBueiro estado={estadoDaPrevia} abertura={abertura} leve={parado} barcoNaPreviaMs={BARCO_NA_PREVIA_MS} />}
      {!estadoDaPrevia && espreitando && temaLigado && !tela && <CamadaDoBueiro estado={estado} abertura={abertura} leve={parado} />}
      {espreitando && !tela && <Avisos agora={agora} estado={estado} />}
      {/* Participou: o volume já na contagem, para chegar na revelação no ponto. */}
      {liberado && estado.fase === 'final' && participa && !tela && <ControleDeSom />}
      {liberado && estado.fase === 'aberto' && (viu || !participa) && !tela && <BotaoDoMural />}
      {tela && (
        <Suspense fallback={null}>
          <Cerimonia tela={tela} leve={parado} />
        </Suspense>
      )}
      {import.meta.env.DEV && <PainelDoRelogio />}
    </>
  );
}
