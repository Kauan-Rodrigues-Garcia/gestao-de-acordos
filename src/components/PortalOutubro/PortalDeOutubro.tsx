/**
 * PortalDeOutubro.tsx — a peça que o `Layout` monta: decide, pela hora do
 * portal (`fases.ts`), o que aparece.
 *
 *   espreitando / último minuto  o bueiro com os olhos e os balões (com o
 *                             tema de Halloween ligado: quem desligou os
 *                             enfeites não vê) e os avisos (para todos)
 *   aberto                    a abertura, uma vez por pessoa, só com a aba à
 *                             vista (quem está em outra aba vê quando voltar —
 *                             ninguém é chamado de volta no mesmo segundo);
 *                             depois, o botão para rever o mural
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
import { abrirAbertura, lerTela, useJaViu, useTela } from './estado';
import { BALAO_NA_PREVIA_MS, BARCO_NA_PREVIA_MS, encerrarPrevia, usePrevia, usePreviaDoBueiro } from './liberacao';
import { CamadaDoBueiro } from './Bueiro';
import { Avisos, BotaoRever } from './Avisos';
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
    return e.contagem || e.fase === 'ultimoMinuto' || e.dia === 5 || (e.faltaMs > 0 && e.faltaMs <= 3 * 60_000);
  })();
  const agora = useAgoraDoPortal(precisaDoSegundo ? 1000 : 30_000);
  const estado = estadoDoPortal(agora, abertura);
  const previa = usePrevia();
  // Máquina sem placa de vídeo: o portal fica parado, como o tema (`Halloween/aguenta.ts`).
  const parado = leve || semPlacaDeVideo();
  const tela = useTela();
  const viu = useJaViu();

  // A prévia: a abertura passa agora, nesta aba; fechou o mural, acabou.
  useEffect(() => {
    if (previa && !lerTela()) abrirAbertura();
  }, [previa]);
  useEffect(() => {
    // `lerTela`, não `tela`: no primeiro passo a abertura acabou de entrar no efeito de cima.
    if (previa && !lerTela()) encerrarPrevia();
  }, [previa, tela]);

  // Na hora: a abertura passa, uma vez, quando a aba está à vista.
  useEffect(() => {
    if (!liberado || estado.fase !== 'aberto' || viu) return;
    const tentar = () => {
      if (document.visibilityState === 'visible' && !lerTela()) abrirAbertura();
    };
    tentar();
    document.addEventListener('visibilitychange', tentar);
    return () => document.removeEventListener('visibilitychange', tentar);
  }, [liberado, estado.fase, viu]);

  const espreitando = liberado && (estado.fase === 'espreitando' || estado.fase === 'ultimoMinuto');

  // A prévia do bueiro (só nesta aba): o dia de hoje se for semana do mural,
  // senão uma quinta; balões e barquinho bem mais vezes. Com ou sem o tema.
  const previaDoBueiro = usePreviaDoBueiro();
  const estadoDaPrevia = previaDoBueiro
    ? {
        ...(estado.fase === 'espreitando' ? estado : estadoDoPortal(DIAS[4] + 10 * 3_600_000)),
        balaoACadaMs: BALAO_NA_PREVIA_MS,
        barcoACadaMs: BARCO_NA_PREVIA_MS,
      }
    : null;

  return (
    <>
      {estadoDaPrevia && !tela && <CamadaDoBueiro estado={estadoDaPrevia} leve={parado} />}
      {!estadoDaPrevia && espreitando && temaLigado && !tela && <CamadaDoBueiro estado={estado} leve={parado} />}
      {espreitando && !tela && <Avisos agora={agora} estado={estado} />}
      {liberado && estado.fase === 'aberto' && viu && !tela && <BotaoRever />}
      {tela && (
        <Suspense fallback={null}>
          <Cerimonia tela={tela} leve={parado} />
        </Suspense>
      )}
      {import.meta.env.DEV && <PainelDoRelogio />}
    </>
  );
}
