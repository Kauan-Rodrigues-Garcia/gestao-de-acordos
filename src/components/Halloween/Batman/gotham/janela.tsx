/**
 * O fundo do Analítico no modo Batman: o bat-sinal do filme visto pela janela
 * (pedido de 05/10/2026). O disco de luz sépia com o morcego de bordas rasgadas,
 * cortado pela persiana; atrás do vidro, a chuva acesa pelo sinal; NO vidro, as
 * gotas paradas e as que escorrem (`vidro.tsx`) e o vidro embaçado; e ele de
 * costas, olhando. A luz do sinal falha de vez em quando. De tempos em tempos a
 * polícia chega lá embaixo e aponta as lanternas para a janela (`policia.tsx`).
 */
import { useCallback, useEffect, useRef } from 'react';
import { ChuvaDeGotham, type Luz, type Ritmo } from './chuva';
import { PoliciaNaJanela } from './policia';
import { VidroMolhado } from './vidro';
import { useDepois } from './depois';

const FOTO_BATMAN = '/images/halloween/batman.png';
const acaso = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * O morcego do sinal de 2022, o símbolo do filme: asas longas em ângulo
 * caindo para as pontas, recortes embaixo e as duas orelhas no meio.
 * Contornado a partir da imagem do símbolo que o Cleber mandou (05/10/2026).
 * Caixa: 200 de largura × 59 de altura. O rasgado da projeção vem do filtro.
 */
const MORCEGO_2022 = 'M54.7 0.0 L55.6 1.1 L56.4 10.3 L57.5 12.8 L72.5 26.9 L76.4 27.8 L90.0 36.9 L90.8 36.4 L91.9 30.6 L95.8 22.8 L96.9 32.2 L99.2 33.1 L103.1 32.2 L104.2 22.8 L108.1 30.8 L109.4 36.9 L123.1 28.1 L127.8 26.7 L142.8 12.2 L144.7 0.0 L167.2 6.9 L187.2 15.0 L199.2 21.4 L200.0 25.3 L193.6 22.8 L189.7 22.2 L171.4 27.5 L163.9 30.6 L158.6 41.7 L129.7 43.6 L107.2 59.2 L92.5 59.2 L70.3 43.6 L41.4 41.7 L36.4 31.1 L34.2 29.4 L10.3 22.2 L5.3 23.1 L0.0 25.3 L0.8 21.4 L16.9 13.1 L37.5 5.3 L54.4 0.3 Z';

/**
 * A luz que falha: um valor de 0 a ~1, lido por quem desenha (a chuva). O mesmo
 * laço, a 30 quadros por segundo, escreve a opacidade do disco — só quando muda.
 */
function useLuzQueFalha(disco: React.RefObject<HTMLDivElement | null>) {
  const luz = useRef(1);
  useEffect(() => {
    let alvo = 1, ate = 0, ultimo = 0, vivo = true, antes = '';
    const seq: [number, number][] = [];
    const quadro = (agora: number) => {
      if (!vivo) return;
      if (agora - ultimo < 32) { requestAnimationFrame(quadro); return; }
      const dt = Math.min(0.1, (agora - ultimo) / 1000); ultimo = agora;
      if (agora >= ate) {
        const p = seq.shift();
        if (p) { alvo = p[0]; ate = agora + p[1]; }
        else {
          const s = Math.random();
          if (s < 0.04) seq.push([0.3, 60], [0.95, 50], [0.15, 110], [0.8, 40], [0.25, 120], [1, 0]);
          else if (s < 0.05) seq.push([0.5, 50], [0.08, acaso(700, 1400)], [0.7, 60], [0.2, 80], [1, 0]);
          else { alvo = acaso(0.9, 1); ate = agora + acaso(180, 360); }
        }
      }
      luz.current += (alvo - luz.current) * (1 - Math.exp(-dt * 14));
      const v = luz.current.toFixed(2);
      if (v !== antes && disco.current) { antes = v; disco.current.style.opacity = v; }
      requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
    return () => { vivo = false; };
  }, [disco]);
  return luz;
}

export function JanelaDoSinal({ ritmo }: { ritmo: () => Ritmo }) {
  const raiz = useRef<HTMLDivElement>(null);
  const disco = useRef<HTMLDivElement>(null);
  // O brilho do disco segue a luz que falha (só a opacidade: compositor).
  const luz = useLuzQueFalha(disco);

  // O sinal é a luz que acende a chuva e a água do vidro.
  const fontes = useCallback((): Luz[] => {
    const r = raiz.current?.getBoundingClientRect(), d = disco.current?.getBoundingClientRect();
    if (!r || !d) return [];
    return [{ x: d.left - r.left + d.width / 2, y: d.top - r.top + d.height / 2, r: d.width * 0.42, cor: [255, 226, 170], forca: 0.9 }];
  }, []);
  const fator = useCallback(() => luz.current, [luz]);
  // A polícia e as lanternas, que mudam a cada quadro: vão direto para a chuva e o vidro.
  const policia = useRef<Luz[]>([]);
  const reflexos = useCallback(() => policia.current, []);
  const relampago = useRef(0);
  const chuva = useCallback(() => ritmo().densidade / 0.8, [ritmo]);
  // Em etapas (ver `depois.ts`): primeiro o sinal e a sala, depois a chuva, depois o vidro.
  const comChuva = useDepois(250), comVidro = useDepois(650);

  return (
    <div ref={raiz} className="gt-janela">
      <div ref={disco} className="gt-sinal">
        <svg viewBox="0 0 200 200">
          <defs>
            <radialGradient id="gt-sinal-disco" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#fff6dc" />
              <stop offset="0.55" stopColor="#f3dca6" />
              <stop offset="0.9" stopColor="#d8b277" />
              <stop offset="0.97" stopColor="#b98f57" stopOpacity="0.7" />
              <stop offset="1" stopColor="#8a6638" stopOpacity="0" />
            </radialGradient>
            <filter id="gt-sinal-rasgo" x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="7" result="ruido" />
              <feDisplacementMap in="SourceGraphic" in2="ruido" scale="4" />
            </filter>
            <filter id="gt-sinal-halo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14" /></filter>
          </defs>
          <circle cx="100" cy="100" r="104" fill="#f0cf8e" opacity="0.28" filter="url(#gt-sinal-halo)" />
          <circle cx="100" cy="100" r="96" fill="url(#gt-sinal-disco)" />
          <path d={MORCEGO_2022} fill="#2a1a0b" fillOpacity="0.92" filter="url(#gt-sinal-rasgo)" transform="translate(16 74) scale(0.84)" />
        </svg>
      </div>
      <PoliciaNaJanela luzes={policia} />
      {/* A chuva lá fora e, por cima, a água no vidro. */}
      {comChuva && (
        <ChuvaDeGotham densidade={0.8} ritmo={ritmo} cidade={0} brilho={1.3} vento={0.03} neblina={1} respingos={false}
          raios={0} trovao={0} ceu fontes={fontes} reflexos={reflexos} fator={fator} relampago={relampago} />
      )}
      {comVidro && <VidroMolhado agua={1} chuva={chuva} fontes={fontes} reflexos={reflexos} fator={fator} relampago={relampago} />}
      <div className="gt-embacado" />
      <div className="gt-persiana" />
      <div className="gt-granulado" />
      <img className="gt-silhueta" src={FOTO_BATMAN} alt="" draggable={false} />
    </div>
  );
}
