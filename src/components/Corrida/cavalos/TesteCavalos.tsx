/**
 * TesteCavalos — o «Testar só na minha tela» da corrida de cavalos: uma corrida
 * de mentira inteira (o paddock enchendo, a largada, a corrida, a festa), sem
 * banco e sem ninguém mais ver. É a página da corrida no modo «teste».
 *
 * Com o «⚔ guerra» marcado na barra do teste, a largada monta um ensaio da
 * Guerra na Corrida (`guerra/ensaio.ts`, a mesma conta do banco) com gente de
 * mentira atacando e atirando junto, e o Cavalo da Guerra briga na página de
 * verdade — só nesta tela.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { JanelaCavalos, type EnviarCavalos, type MensagemCavalos } from './JanelaCavalos';
import { EnsaioGuerra } from '../guerra/ensaio';
import type { LoteDeGolpes } from '../guerra/regras';
import type { EstadoGuerra } from '../guerra/tipos';
import { useJanelaDaGuerra } from '../guerra/useJanelaDaGuerra';

const carregarCena = () => import('../guerra/CenaGuerra');
const CenaGuerra = lazy(carregarCena);
const agoraMs = () => Date.now();
/** A gente de mentira do ensaio: quantos atacam e atiram junto. */
const SIMS = 6;

export default function TesteCavalos({ onFechar }: { onFechar: () => void }) {
  const conexao = useRef<EnviarCavalos | null>(null);
  const quadro = useRef<HTMLIFrameElement | null>(null);
  const ensaio = useRef<EnsaioGuerra | null>(null);
  const [estado, setEstado] = useState<EstadoGuerra | null>(null);
  const { chefe, tratar } = useJanelaDaGuerra(quadro, estado, agoraMs);

  const mandar = useCallback((e: EstadoGuerra) => { setEstado(e); conexao.current?.({ tipo: 'guerra', guerra: e }); }, []);
  // O relógio do ensaio: a conta a cada meio segundo, e a gente de mentira clicando depois que a guerra começa.
  useEffect(() => {
    let n = 0;
    const id = window.setInterval(() => {
      const g = ensaio.current; if (!g) return;
      const antes = g.estado();
      if (antes.comecou_em && !antes.sobrou_em && n++ % 5 === 0) for (let k = 0; k < SIMS; k++) g.atacar(`sim${k}`, 2 + Math.floor(Math.random() * 7));
      mandar(g.recalcular());
    }, 500);
    return () => window.clearInterval(id);
  }, [mandar]);

  const aoReceber = useCallback((m: MensagemCavalos) => {
    if (tratar(m)) return;
    if (m.tipo === 'fechar') onFechar();
    else if (m.tipo === 'guerra-teste') {
      ensaio.current = m.ligar ? new EnsaioGuerra(Number(m.cavalos) || 2, Number(m.presentes) || 1) : null;
      if (m.ligar) void carregarCena();
      mandar(ensaio.current ? ensaio.current.estado() : { corrida_id: 0, ligada: false });
    } else if (m.tipo === 'guerra-atacar' && ensaio.current && typeof m.cliques === 'number') mandar(ensaio.current.atacar('Você', m.cliques));
  }, [onFechar, tratar, mandar]);

  const golpear = useCallback((l: LoteDeGolpes) => { if (ensaio.current) mandar(ensaio.current.golpear('Você', l)); return Promise.resolve(true); }, [mandar]);
  const golpearSim = useCallback((quem: string, l: LoteDeGolpes) => { ensaio.current?.golpear(quem, l); }, []);

  return (
    <>
      <JanelaCavalos modo="teste" onMensagem={aoReceber} conexao={conexao} escondida={!!chefe} quadro={quadro} />
      {chefe && estado?.ligada && (
        <Suspense fallback={null}>
          <CenaGuerra estado={estado} agora={agoraMs} numero={chefe.numero} dono={chefe.dono} eu="Você"
            janela={{ rect: chefe.rect, canvas: chefe.canvas }} aoGolpear={golpear} aoGolpearSim={golpearSim} volume={1} sims={SIMS} />
        </Suspense>
      )}
    </>
  );
}
