import { useEffect, useRef, type CSSProperties } from 'react';
import { LOGO_CONTORNOS, LOGO_LADO, LOGO_LINHAS } from './logoTracado';
import './preloader.css';

/**
 * A tela de abertura do Gestão de Acordos (Cleber, 16/11/2026: «minimalista mas
 * única, parecida com a da Rockstar, mas própria do Gestão» — e depois: «a logo
 * no lugar do escudo, vêm umas linhas de forma harmonizada e vão virando a
 * logo»).
 *
 * A logo é o aperto de mãos. Ela nasce de linhas: pontos de luz aparecem em
 * volta do desenho, esticam em traços que correm pelo contorno — uns num
 * sentido, outros no outro —, crescem até se encontrar e fechar a silhueta, e
 * aí a logo se enche de cor. Some e recomeça.
 *
 * O contorno é o da logo de verdade, vetorizado do PNG (`logoTracado.ts`): o
 * desenho final é ela, não uma parecida.
 *
 * As cores saem do tema (`--primary`, `--background`): BookPlay, PaguePlay,
 * claro e escuro já chegam com a cor certa, sem lista para manter.
 *
 * Custo: só o tracejado das nove linhas é redesenhado, e só enquanto elas
 * correm; aparecer, sumir, encher de cor, pulsar e brilhar são opacidade e
 * `transform` de caixas inteiras, que a placa de vídeo faz sozinha
 * (`preloader.css`).
 * `data-anima-sempre`: no modo leve ela continua, porque parada diria
 * «travou» (a mesma exceção do spinner).
 *
 * POR ENQUANTO SÓ NO LABORATÓRIO (`/lab-preloader.html`, `npm run dev`): não
 * está ligada ao site.
 */
export function Preloader({ tamanho = 120, saindo = false, nome = 'Gestão de Acordos' }: {
  /** O lado da logo, em px. */
  tamanho?: number;
  /** Esmaece (a página chegou). */
  saindo?: boolean;
  /** O nome embaixo; vazio = só a logo. */
  nome?: string;
}) {
  const marca = useRef<HTMLDivElement>(null);

  // O tracejado roda uma vez por ciclo e para (`preloader.css`). A partida de
  // cada volta vem daqui, no relógio da própria pulsada — um aviso a cada 3 s,
  // nada por quadro. Se o aviso não vier, a logo fica fechada: nada quebra.
  useEffect(() => {
    const el = marca.current;
    if (!el) return;
    const novaVolta = (e: AnimationEvent) => {
      if (e.target !== el || e.animationName !== 'gda-pre-pulso') return;
      for (const linha of el.querySelectorAll('.gda-pre-linha')) {
        for (const a of linha.getAnimations()) { a.currentTime = 0; a.play(); }
      }
    };
    el.addEventListener('animationiteration', novaVolta);
    return () => el.removeEventListener('animationiteration', novaVolta);
  }, []);

  return (
    <div className={saindo ? 'gda-pre gda-pre-sai' : 'gda-pre'} role="status" aria-label="Carregando">
      <div ref={marca} className="gda-pre-marca" style={{ '--tam': `${tamanho}px` } as CSSProperties} data-anima-sempre="">
        <div className="gda-pre-brilho" />
        {/* A logo cheia mora num SVG só dela: parada por dentro, quem anima é a
            opacidade da caixa — isso a placa de vídeo faz sem repintar nada. */}
        <svg className="gda-pre-cheia" viewBox={`0 0 ${LOGO_LADO} ${LOGO_LADO}`} aria-hidden="true">
          <path d={LOGO_CONTORNOS.join('')} />
        </svg>
        <svg className="gda-pre-logo" viewBox={`0 0 ${LOGO_LADO} ${LOGO_LADO}`} aria-hidden="true">
          {LOGO_CONTORNOS.map((d, i) => (
            <path
              key={i}
              className="gda-pre-linha"
              d={d}
              pathLength={1}
              // Laços vizinhos correm em sentidos opostos: as linhas se cruzam em vez de marchar juntas.
              style={{ '--p': 1 / LOGO_LINHAS[i], '--d': i % 2 ? -1 : 1 } as CSSProperties}
            />
          ))}
        </svg>
      </div>
      {nome && <p className="gda-pre-nome">{nome}</p>}
    </div>
  );
}
