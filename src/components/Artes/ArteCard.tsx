/**
 * ArteCard — o desenho de cada modelo de arte (17/11/2026).
 *
 * Desenhado numa medida só, 440 px de largura (os cards em 4:5, 440×550), com
 * cores em hex e medidas em px: fica igual no aviso, na prévia, no celular e
 * na imagem copiada (o html2canvas não lê as cores oklch do tema). Para caber
 * em qualquer espaço, `ArteEscalada` mede a arte e a escala.
 */
import { forwardRef, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { TEMAS, imagemSegura, type ConteudoDaArte, type ModeloDeArte, type TemaDaArte } from './modelos';

export const LARGURA_DA_ARTE = 440;
const ALTURA_DO_CARD = 550;

export interface PropsDaArte {
  modelo: ModeloDeArte;
  conteudo: ConteudoDaArte;
  tema: TemaDaArte;
}

const base: CSSProperties = {
  width: LARGURA_DA_ARTE, position: 'relative', overflow: 'hidden', borderRadius: 28,
  fontFamily: 'inherit', boxSizing: 'border-box', textAlign: 'center',
};

function Faixa({ fundo, texto, frase, topo }: { fundo: string; texto: string; frase: string; topo: boolean }) {
  // A fita de «cuidado»: listras na cor da faixa e a frase repetida.
  return (
    <div aria-hidden style={{
      position: 'absolute', left: -20, right: -20, [topo ? 'top' : 'bottom']: 18, height: 30,
      transform: `rotate(${topo ? -3 : 3}deg)`, background: texto,
      backgroundImage: `repeating-linear-gradient(-45deg, ${fundo} 0 14px, ${texto} 14px 28px)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 0 rgba(0,0,0,0.25)',
    }}>
      <span style={{ background: fundo, color: texto, padding: '2px 12px', fontSize: 13, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {frase}
      </span>
    </div>
  );
}

function Enfeite({ children, style }: { children: ReactNode; style: CSSProperties }) {
  return <span aria-hidden style={{ position: 'absolute', fontSize: 34, lineHeight: 1, ...style }}>{children}</span>;
}

function DeuALouca({ conteudo: c, tema }: { conteudo: ConteudoDaArte; tema: TemaDaArte }) {
  const t = TEMAS[tema];
  return (
    <div style={{
      ...base, height: ALTURA_DO_CARD, color: t.texto, padding: '58px 30px 56px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: `radial-gradient(circle at 50% 38%, ${t.fundo} 0%, ${t.fundo} 45%, ${t.fundo2} 100%)`,
    }}>
      <Faixa fundo={t.faixa} texto={t.sobreFaixa} frase="🚨 Urgente · Urgente · Urgente 🚨" topo />
      <Enfeite style={{ top: 70, left: 18, transform: 'rotate(-18deg)' }}>💸</Enfeite>
      <Enfeite style={{ top: 78, right: 20, transform: 'rotate(16deg)' }}>🤪</Enfeite>
      <Enfeite style={{ bottom: 118, left: 14, transform: 'rotate(12deg)', fontSize: 28 }}>⏰</Enfeite>
      <Enfeite style={{ bottom: 120, right: 14, transform: 'rotate(-12deg)', fontSize: 28 }}>🎉</Enfeite>

      <div style={{ display: 'inline-block', transform: 'rotate(-3deg)', background: t.destaque, color: t.sobreDestaque, borderRadius: 14,
        padding: '8px 18px', fontSize: 27, fontWeight: 900, lineHeight: 1.05, textTransform: 'uppercase', letterSpacing: -0.5,
        boxShadow: `4px 4px 0 ${t.faixa}`, maxWidth: 330 }}>
        {c.chamada}
      </div>

      <p style={{ margin: '14px 0 0', fontSize: 13, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', color: t.suave }}>{c.rotuloValor}</p>
      <p style={{ margin: '0', fontSize: c.agradecimento ? 42 : 46, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{c.valor}</p>
      <p style={{ margin: '4px 0 0', fontSize: c.agradecimento ? 18 : 16, fontWeight: 900 }}>{c.parabens}</p>
      {c.agradecimento && (
        <p style={{ margin: '4px 0 0', maxWidth: 350, fontSize: 13.5, lineHeight: 1.35, fontWeight: 600, color: t.suave }}>{c.agradecimento}</p>
      )}

      <div style={{ margin: c.agradecimento ? '12px 0 0' : '16px 0 0', background: t.faixa, color: t.sobreFaixa, borderRadius: 18, padding: '11px 16px 13px', width: '100%', maxWidth: 360, boxSizing: 'border-box' }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: 2.5, textTransform: 'uppercase', opacity: 0.85 }}>{c.rotuloMeta}</p>
        <p style={{ margin: '2px 0 0', fontSize: 34, fontWeight: 900, letterSpacing: -1, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{c.meta}</p>
        <p style={{ margin: '10px 0 0', display: 'inline-block', background: t.destaque, color: t.sobreDestaque, borderRadius: 999,
          padding: '6px 14px', fontSize: 15, fontWeight: 900, textTransform: 'uppercase', lineHeight: 1.15 }}>
          ⏰ {c.premio}
        </p>
      </div>

      {c.rodape && <p style={{ margin: '11px 0 0', maxWidth: 350, fontSize: 14, lineHeight: 1.3, fontWeight: 900 }}>{c.rodape}</p>}
      <Faixa fundo={t.faixa} texto={t.sobreFaixa} frase="Deu a louca · Deu a louca · Deu a louca" topo={false} />
    </div>
  );
}

function Parabens({ conteudo: c, tema }: { conteudo: ConteudoDaArte; tema: TemaDaArte }) {
  const t = TEMAS[tema];
  return (
    <div style={{
      ...base, height: ALTURA_DO_CARD, color: t.texto, padding: '44px 34px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: `radial-gradient(circle at 50% 30%, ${t.fundo2} 0%, ${t.fundo} 70%)`,
    }}>
      {/* Raios atrás do troféu. */}
      <div aria-hidden style={{ position: 'absolute', left: '50%', top: 150, width: 640, height: 640, transform: 'translate(-50%, -50%)', opacity: 0.16,
        background: `repeating-conic-gradient(${t.destaque} 0deg 9deg, transparent 9deg 22.5deg)`, borderRadius: '50%' }} />
      <span style={{ position: 'relative', background: t.destaque, color: t.sobreDestaque, borderRadius: 999, padding: '6px 16px',
        fontSize: 13, fontWeight: 900, letterSpacing: 2.5, textTransform: 'uppercase' }}>{c.selo}</span>
      <span aria-hidden style={{ position: 'relative', fontSize: 84, lineHeight: 1, margin: '18px 0 8px' }}>🏆</span>
      <p style={{ position: 'relative', margin: 0, fontSize: 32, fontWeight: 900, lineHeight: 1.1, letterSpacing: -0.5 }}>{c.titulo}</p>
      {c.valor && <p style={{ position: 'relative', margin: '12px 0 0', fontSize: 44, fontWeight: 900, color: t.destaque, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums' }}>{c.valor}</p>}
      {c.texto && <p style={{ position: 'relative', margin: '14px 0 0', fontSize: 16, lineHeight: 1.45, color: t.suave, whiteSpace: 'pre-line' }}>{c.texto}</p>}
      {c.rodape && <p style={{ position: 'absolute', bottom: 22, left: 0, right: 0, margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: t.suave }}>{c.rodape}</p>}
    </div>
  );
}

function Recado({ conteudo: c, tema }: { conteudo: ConteudoDaArte; tema: TemaDaArte }) {
  const t = TEMAS[tema];
  return (
    <div style={{
      ...base, height: ALTURA_DO_CARD, color: t.texto, padding: '46px 38px', textAlign: 'left',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      background: `linear-gradient(160deg, ${t.fundo} 0%, ${t.fundo2} 100%)`,
    }}>
      <div aria-hidden style={{ position: 'absolute', right: -70, top: -70, width: 230, height: 230, borderRadius: '50%', background: t.destaque, opacity: 0.18 }} />
      <span aria-hidden style={{ display: 'grid', placeItems: 'center', width: 76, height: 76, borderRadius: 22, background: t.destaque, fontSize: 42 }}>{c.emoji || '📣'}</span>
      <p style={{ margin: '22px 0 0', fontSize: 32, fontWeight: 900, lineHeight: 1.1, letterSpacing: -0.5 }}>{c.titulo}</p>
      <div style={{ width: 56, height: 5, borderRadius: 3, background: t.destaque, margin: '16px 0' }} />
      <p style={{ margin: 0, fontSize: 18, lineHeight: 1.5, color: t.suave, whiteSpace: 'pre-line' }}>{c.texto}</p>
      {c.rodape && <p style={{ position: 'absolute', bottom: 26, left: 38, margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: t.suave }}>{c.rodape}</p>}
    </div>
  );
}

function Imagem({ conteudo: c, tema }: { conteudo: ConteudoDaArte; tema: TemaDaArte }) {
  const t = TEMAS[tema];
  const url = c.imagem?.trim() ?? '';
  return (
    <div style={{ ...base, background: t.fundo, color: t.texto }}>
      {imagemSegura(url)
        ? <img src={url} alt={c.legenda || 'Arte'} crossOrigin="anonymous" style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 780, objectFit: 'contain' }} />
        : <div style={{ height: ALTURA_DO_CARD, display: 'grid', placeItems: 'center', color: t.suave, fontSize: 16 }}>Envie a imagem da arte</div>}
      {c.legenda && <p style={{ margin: 0, padding: '14px 20px', fontSize: 16, fontWeight: 700, background: t.faixa, color: t.sobreFaixa }}>{c.legenda}</p>}
    </div>
  );
}

/** A arte na medida dela (440 px). Use `ArteEscalada` para caber num espaço. */
export const ArteCard = forwardRef<HTMLDivElement, PropsDaArte>(function ArteCard({ modelo, conteudo, tema }, ref) {
  const corpo = modelo === 'deu-a-louca' ? <DeuALouca conteudo={conteudo} tema={tema} />
    : modelo === 'parabens' ? <Parabens conteudo={conteudo} tema={tema} />
    : modelo === 'recado' ? <Recado conteudo={conteudo} tema={tema} />
    : <Imagem conteudo={conteudo} tema={tema} />;
  return <div ref={ref} style={{ width: LARGURA_DA_ARTE }}>{corpo}</div>;
});

/** A arte escalada para a largura `largura` (px), ou para a largura do pai. */
export function ArteEscalada({ largura, className, ...arte }: PropsDaArte & { largura?: number; className?: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const dentro = useRef<HTMLDivElement>(null);
  const [medida, setMedida] = useState({ w: largura ?? LARGURA_DA_ARTE, h: ALTURA_DO_CARD });

  useLayoutEffect(() => {
    const ler = () => {
      const w = largura ?? caixa.current?.clientWidth ?? LARGURA_DA_ARTE;
      const h = dentro.current?.offsetHeight ?? ALTURA_DO_CARD;
      setMedida(m => (m.w === w && m.h === h ? m : { w, h }));
    };
    ler();
    const ro = new ResizeObserver(ler);
    if (caixa.current && largura === undefined) ro.observe(caixa.current);
    if (dentro.current) ro.observe(dentro.current);
    return () => ro.disconnect();
  }, [largura]);

  const escala = medida.w / LARGURA_DA_ARTE;
  return (
    <div ref={caixa} className={className} style={{ width: largura ?? '100%', height: medida.h * escala, position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
        <ArteCard ref={dentro} {...arte} />
      </div>
    </div>
  );
}
