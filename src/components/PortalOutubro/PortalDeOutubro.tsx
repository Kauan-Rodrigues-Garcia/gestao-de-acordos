/**
 * PortalDeOutubro.tsx — a peça que o `Layout` monta: decide, pela hora do
 * portal (`fases.ts`), o que aparece.
 *
 *   espreitando / final  os 5 minutos: o bueiro com os olhos e os balões
 *                        (com o tema de Halloween ligado: quem desligou os
 *                        enfeites não vê) e o relógio pequeno (para todos);
 *                        no final, a água, o barco, a mão e o convite com o
 *                        «Participar» do lado do bueiro
 *   revelando            quem participou: a abertura, uma vez, só com a aba
 *                        à vista (quem está em outra aba vê quando voltar);
 *                        os outros, nada ainda. O «participou» é só desta
 *                        aba: quem recarrega no meio perde a abertura e fica
 *                        como quem não participou (30/10/2026)
 *   aberto               a revelação acabou: o botão do mural na barra de
 *                        cima para quem não está nela, só o visual (29/10/2026)
 *
 * A abertura e o mural são outro pedaço (`Cerimonia.tsx`), que só baixa na
 * hora. Quem decide se isto monta é o `Layout`, pela liberação do super_admin
 * (`liberacao.ts`); a hora da abertura vem de lá também (sexta 16h, ou a
 * solta pelo botão). Na prévia (só nesta aba, sem estar liberado), só a
 * abertura e o mural aparecem.
 */
import { lazy, Suspense, useEffect } from 'react';
import { ABERTURA, AGUA_MS, DIAS, JANELA_MS, NOME_DA_FASE, estadoDoPortal, relogioDaContagem } from './fases';
import { BaloesChegando } from './BaloesDaRevelacao';
import { CHEGADA_S } from './revelacao';
import { agoraDoPortal, useAgoraDoPortal } from './relogio';
import { abrirAbertura, lerTela, pararEnsaio, pularEnsaioParaAgua, useJaViu, useParticipa, useTela } from './estado';
import { BALAO_NA_PREVIA_MS, BARCO_NA_PREVIA_MS, encerrarPrevia, useEnsaio, usePrevia, usePreviaDoBueiro } from './liberacao';
import { CamadaDoBueiro } from './Bueiro';
import { Avisos, BotaoDoMural } from './Avisos';
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

/**
 * O ensaio finge ser sexta à tarde (a contagem de sexta, a luz cheia, sem o
 * bilhete de quinta) em qualquer dia: a linha do tempo dele é posta aqui.
 */
const SEXTA_DO_ENSAIO = DIAS[5] + 15 * 3_600_000;

export function PortalDeOutubro({ temaLigado, leve = false, liberado: liberadoDeVerdade, abertura: aberturaDeVerdade }: Props) {
  // O ensaio do super_admin (só nesta aba): liberado, com a abertura dele.
  const ensaio = useEnsaio();
  const liberado = liberadoDeVerdade || !!ensaio;
  const abertura = ensaio ? ensaio.abreEm : aberturaDeVerdade;
  // Relê a hora de segundo em segundo só perto e durante a revelação; no
  // resto do tempo, de 30 em 30 s — reler à toa é trabalho para nada.
  const precisaDoSegundo = !!ensaio || (() => {
    const e = estadoDoPortal(agoraDoPortal(), abertura);
    return e.fase === 'espreitando' || e.fase === 'final' || e.fase === 'revelando' || (e.faltaMs > 0 && e.faltaMs <= JANELA_MS + 60_000);
  })();
  const agoraDeVerdade = useAgoraDoPortal(precisaDoSegundo ? 1000 : 30_000);
  const agora = ensaio ? SEXTA_DO_ENSAIO + (agoraDeVerdade - ensaio.inicio) : agoraDeVerdade;
  const estado = ensaio
    ? estadoDoPortal(agora, SEXTA_DO_ENSAIO + (ensaio.abreEm - ensaio.inicio))
    : estadoDoPortal(agora, abertura);
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

  // Zerou: a abertura passa, uma vez, para quem participou, quando a aba está à vista.
  const zerou = estado.fase === 'revelando' || estado.fase === 'aberto';
  useEffect(() => {
    if (!liberado || !zerou || viu || !participa) return;
    const tentar = () => {
      if (document.visibilityState === 'visible' && !lerTela()) abrirAbertura();
    };
    tentar();
    document.addEventListener('visibilitychange', tentar);
    return () => document.removeEventListener('visibilitychange', tentar);
  }, [liberado, zerou, viu, participa]);
  // No segundo exato do zero (o relógio da tela só anda de segundo em
  // segundo): os balões que chegaram na contagem estouram na hora certa.
  const final = estado.fase === 'final';
  useEffect(() => {
    if (!liberado || !final || viu || !participa) return;
    const t = window.setTimeout(() => {
      if (document.visibilityState === 'visible' && !lerTela()) abrirAbertura();
    }, Math.max(0, abertura - agoraDoPortal()));
    return () => window.clearTimeout(t);
  }, [liberado, final, viu, participa, abertura]);

  const espreitando = liberado && (estado.fase === 'espreitando' || estado.fase === 'final');
  // Do «Participar» em diante, os balões ao acaso só para quem participou, e
  // só até os da revelação começarem a chegar (29/10/2026).
  const noConvite = final && (estado.noFinalMs ?? 0) >= AGUA_MS;
  const chegando = noConvite && participa && estado.faltaMs <= CHEGADA_S * 1000;
  const estadoDaCamada = noConvite && (!participa || chegando) ? { ...estado, balaoACadaMs: null } : estado;

  // A prévia do bueiro (só nesta aba): o dia de hoje se for semana do mural,
  // senão uma quinta; balões e barquinho bem mais vezes. Com ou sem o tema.
  const previaDoBueiro = usePreviaDoBueiro() && !ensaio;
  const estadoDaPrevia = previaDoBueiro
    ? { ...(estado.fase === 'espreitando' ? estado : estadoDoPortal(ABERTURA - 4 * 60_000)), balaoACadaMs: BALAO_NA_PREVIA_MS }
    : null;

  return (
    <>
      {estadoDaPrevia && !tela && <CamadaDoBueiro estado={estadoDaPrevia} abertura={abertura} leve={parado} barcoNaPreviaMs={BARCO_NA_PREVIA_MS} />}
      {/* A chave do ensaio remonta o bueiro: ele chega de novo, com a névoa. */}
      {!estadoDaPrevia && espreitando && (temaLigado || ensaio) && !tela && (
        <CamadaDoBueiro key={ensaio?.inicio ?? 'semana'} estado={estadoDaCamada} abertura={abertura} leve={parado} />
      )}
      {espreitando && !tela && <Avisos estado={estado} />}
      {/* Quem participou: os balões da revelação chegando, um a um, até o zero. */}
      {liberado && chegando && !viu && !tela && <BaloesChegando faltaMs={estado.faltaMs} leve={parado} />}
      {liberado && estado.fase === 'aberto' && (viu || !participa) && !tela && <BotaoDoMural />}
      {tela && (
        <Suspense fallback={null}>
          <Cerimonia tela={tela} leve={parado} />
        </Suspense>
      )}
      {ensaio && (
        <div className="portal-ensaio" data-portal-fora data-portal-anima>
          <span>
            Ensaio do mural · {NOME_DA_FASE[estado.fase]}
            {estado.faltaMs > 0 && ` · abre em ${relogioDaContagem(estado.faltaMs)}`}
          </span>
          {estado.fase === 'espreitando' && <button type="button" onClick={pularEnsaioParaAgua}>Pular para a água</button>}
          <button type="button" onClick={pararEnsaio}>Parar o ensaio</button>
        </div>
      )}
      {import.meta.env.DEV && <PainelDoRelogio />}
    </>
  );
}
