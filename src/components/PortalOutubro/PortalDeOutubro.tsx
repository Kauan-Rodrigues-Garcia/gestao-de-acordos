/**
 * PortalDeOutubro.tsx — a peça que o `Layout` monta: decide, pela hora do
 * portal (`fases.ts`), o que aparece.
 *
 *   rachando / último minuto  as rachaduras (com o tema de Halloween ligado:
 *                             quem desligou os enfeites não vê o vidro) e os
 *                             avisos (para todos)
 *   aberto                    a abertura, uma vez por pessoa, só com a aba à
 *                             vista (quem está em outra aba vê quando voltar —
 *                             ninguém é chamado de volta no mesmo segundo);
 *                             depois, o botão para rever o mural
 *
 * A abertura e o mural são outro pedaço (`Cerimonia.tsx`), que só baixa na
 * hora. Fora do `npm run dev` nada disto monta (`PORTAL_LIGADO`).
 */
import { lazy, Suspense, useEffect } from 'react';
import { PORTAL_LIGADO, estadoDoPortal } from './fases';
import { agoraDoPortal, useAgoraDoPortal } from './relogio';
import { abrirAbertura, lerTela, useJaViu, useTela } from './estado';
import { CamadaDeRachaduras } from './CamadaDeRachaduras';
import { Avisos, BotaoRever } from './Avisos';
import { PainelDoRelogio } from './PainelDoRelogio';
import { carregarFonte, carregarFontesPixel } from '@/components/Halloween/fonte';
import { semPlacaDeVideo } from '@/components/Halloween/aguenta';
import './portal.css';

// As letras das placas (declarar não baixa: só quando um texto as usa).
if (PORTAL_LIGADO) { carregarFonte(); carregarFontesPixel(); }

const Cerimonia = lazy(() => import('./Cerimonia'));

export function PortalDeOutubro({ temaLigado, leve = false }: { temaLigado: boolean; leve?: boolean }) {
  // Relê a hora de segundo em segundo só quando o segundo aparece (a contagem
  // de sexta e o último minuto); no resto da semana, de 30 em 30 s — a trinca
  // anda devagar, e reler à toa é trabalho para nada.
  const precisaDoSegundo = (() => {
    const e = estadoDoPortal(agoraDoPortal());
    return e.contagem || e.fase === 'ultimoMinuto' || e.dia === 5;
  })();
  const agora = useAgoraDoPortal(precisaDoSegundo ? 1000 : 30_000);
  const estado = estadoDoPortal(agora);
  // Máquina sem placa de vídeo: o portal fica parado, como o tema (`Halloween/aguenta.ts`).
  const parado = leve || semPlacaDeVideo();
  const tela = useTela();
  const viu = useJaViu();

  // 16h: a abertura passa, uma vez, quando a aba está à vista.
  useEffect(() => {
    if (!PORTAL_LIGADO || estado.fase !== 'aberto' || viu) return;
    const tentar = () => {
      if (document.visibilityState === 'visible' && !lerTela()) abrirAbertura();
    };
    tentar();
    document.addEventListener('visibilitychange', tentar);
    return () => document.removeEventListener('visibilitychange', tentar);
  }, [estado.fase, viu]);

  if (!PORTAL_LIGADO) return null;
  const rachando = estado.fase === 'rachando' || estado.fase === 'ultimoMinuto';
  return (
    <>
      {rachando && temaLigado && !tela && <CamadaDeRachaduras agora={agora} estado={estado} leve={parado} />}
      {rachando && !tela && <Avisos agora={agora} estado={estado} />}
      {estado.fase === 'aberto' && viu && !tela && <BotaoRever />}
      {tela && (
        <Suspense fallback={null}>
          <Cerimonia tela={tela} leve={parado} />
        </Suspense>
      )}
      {import.meta.env.DEV && <PainelDoRelogio />}
    </>
  );
}
