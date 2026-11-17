// Final: mosaico com as 42 fotos, créditos subindo e o «Fim… continua».

import { AbsoluteFill, Easing, Img, staticFile, useCurrentFrame } from 'remotion';
import { SETORES, TODAS } from './elenco';
import { C, entre, F, mola, sorte, VAI_VOLTA } from './estilo';
import { Flash, FitaLateral, Grao, LuzVazada, Polaroid, Riscos, Vinheta } from './efeitos';
import { B, CREDITOS } from './tempo';

export const Mosaico: React.FC = () => {
  const f = useCurrentFrame();
  const cols = 6;
  const linhas = Math.ceil(TODAS.length / cols);
  const cl = 1080 / cols;
  const ca = 1920 / linhas;
  const escuro = entre(f, B * 2.5, B * 3.5, 0, 0.62);
  const titulo = mola(f, B * 3, { stiffness: 150, damping: 12 });
  const sub = entre(f, B * 4, B * 4.8, 0, 1);
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${1.12 - entre(f, 0, B * 8, 0, 0.1, (t) => t)})` }}>
        {TODAS.map((p, i) => {
          const col = i % cols;
          const lin = Math.floor(i / cols);
          const q = mola(f, (col + lin) * 2, { stiffness: 200, damping: 16 });
          return (
            <div key={i} style={{ position: 'absolute', left: col * cl, top: lin * ca, width: cl, height: ca, padding: 3, boxSizing: 'border-box', transform: `scale(${q}) rotate(${(1 - q) * (sorte(i) - 0.5) * 60}deg)` }}>
              <Img src={staticFile(p.foto)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 30%', display: 'block', boxShadow: `inset 0 0 0 3px ${p.setor.cor}` }} />
            </div>
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 45% at 50% 50%, rgba(10,4,6,${escuro}) 40%, rgba(10,4,6,${escuro * 0.7}) 100%)` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 690, textAlign: 'center', transform: `scale(${titulo})` }}>
        <div style={{ fontFamily: F.letreiro, fontSize: 56, letterSpacing: 14, color: C.ouroClaro }}>ELENCO COMPLETO</div>
        <div style={{ fontFamily: F.script, fontSize: 122, lineHeight: 1.5, whiteSpace: 'nowrap', color: C.creme, textShadow: '0 0 40px rgba(255,180,120,.5), 0 6px 0 #7a1838', transform: 'rotate(-4deg)' }}>Obrigado, time!</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1110, textAlign: 'center', opacity: sub, transform: `translateY(${(1 - sub) * 30}px)` }}>
        <div style={{ fontFamily: F.letreiro, fontSize: 60, letterSpacing: 4, color: C.ouro }}>
          {TODAS.length} ESTRELAS · {SETORES.length} SETORES · 1 SÓ TIME
        </div>
      </div>
      <LuzVazada forca={entre(f, B * 3, B * 4, 0, 0.35)} semente={9} />
      <Grao />
      <Vinheta forca={0.5} />
      <Flash forca={entre(f, 0, 8, 0.9, 0)} />
    </AbsoluteFill>
  );
};

// ── créditos ───────────────────────────────────────────────────────────────

type Bloco = { y: number; el: React.ReactNode };

function montarCreditos() {
  const blocos: Bloco[] = [];
  let y = 0;
  const push = (alt: number, el: React.ReactNode) => {
    blocos.push({ y, el });
    y += alt;
  };
  push(260, (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: F.letreiro, fontSize: 84, color: C.ouro, letterSpacing: 6 }}>ENTRE METAS E RISADAS</div>
      <div style={{ fontFamily: F.serifa, fontStyle: 'italic', fontSize: 56, color: C.creme }}>Bookplay + Cofen · 2026</div>
    </div>
  ));
  push(170, <div style={{ textAlign: 'center', fontFamily: F.letreiro, fontSize: 64, letterSpacing: 18, color: C.creme }}>ELENCO</div>);
  for (const s of SETORES) {
    const linhas = Math.ceil(s.pessoas.length / 2);
    const altFotos = 160;
    // título 90 + fotos (160 + margens 28) + 70 por linha de nomes + respiro 50
    push(90 + altFotos + 28 + linhas * 70 + 50, (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: F.letreiro, fontSize: 58, lineHeight: '90px', letterSpacing: 8, color: s.cor }}>{s.nome.toUpperCase()}</div>
        <div style={{ height: altFotos, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, margin: '14px 0' }}>
          {s.pessoas.map((p, i) => (
            <Polaroid key={i} foto={p.foto} maxL={s.pessoas.length > 6 ? 88 : 115} maxA={128} fita={false} style={{ transform: `rotate(${(sorte(i + s.nome.length) - 0.5) * 12}deg)` }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 50, rowGap: 6, width: 860, margin: '0 auto' }}>
          {s.pessoas.map((p, i) => (
            <div key={i} style={{ fontFamily: F.serifa, fontStyle: 'italic', fontSize: 56, lineHeight: '64px', color: C.creme, textAlign: s.pessoas.length % 2 && i === s.pessoas.length - 1 ? 'center' : i % 2 ? 'left' : 'right', gridColumn: s.pessoas.length % 2 && i === s.pessoas.length - 1 ? '1 / span 2' : undefined }}>
              {p.nome}
            </div>
          ))}
        </div>
      </div>
    ));
  }
  const ficha: [string, string][] = [
    ['Direção', 'o time inteiro'],
    ['Roteiro', 'as metas de cada mês'],
    ['Trilha sonora', 'as risadas no corredor'],
    ['Efeitos especiais', 'cada acordo fechado'],
    ['Produção', 'Bookplay + Cofen'],
  ];
  push(ficha.length * 170 + 140, (
    <div style={{ textAlign: 'center' }}>
      {ficha.map(([a, b]) => (
        <div key={a} style={{ height: 170 }}>
          <div style={{ fontFamily: F.letreiro, fontSize: 40, lineHeight: '64px', letterSpacing: 8, color: C.ouroClaro, opacity: 0.85 }}>{a.toUpperCase()}</div>
          <div style={{ fontFamily: F.serifa, fontStyle: 'italic', fontSize: 54, color: C.creme }}>{b}</div>
        </div>
      ))}
    </div>
  ));
  const ultimo = y;
  push(300, (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: F.script, fontSize: 76, color: '#ffb3c7', lineHeight: 1.4, whiteSpace: 'nowrap' }}>Obrigado por cada meta</div>
      <div style={{ fontFamily: F.script, fontSize: 76, color: '#ffb3c7', lineHeight: 1.4, whiteSpace: 'nowrap' }}>e cada risada 💛</div>
    </div>
  ));
  return { blocos, ultimo, total: y };
}

const CRED = montarCreditos();

export const Creditos: React.FC = () => {
  const f = useCurrentFrame();
  const dur = CREDITOS * B;
  // sobe quase constante e freia no agradecimento, que para no centro
  const destino = 960 - (CRED.ultimo + 150);
  const y = entre(f, 0, dur - B * 2, 1920, destino, Easing.bezier(0.25, 0.25, 0.45, 1));
  return (
    <AbsoluteFill style={{ background: '#07040a', overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 50%, rgba(120,20,40,.35), transparent 75%)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: y }}>
        {CRED.blocos.map((b, i) => (
          <div key={i} style={{ position: 'absolute', left: 80, right: 80, top: b.y }}>
            {b.el}
          </div>
        ))}
      </div>
      <FitaLateral velocidade={2} opacidade={0.8} />
      <Riscos />
      <Grao forca={0.12} />
      <Vinheta forca={0.6} />
      <Flash forca={entre(f, 0, 10, 0.6, 0)} />
    </AbsoluteFill>
  );
};

// ── fim ─────────────────────────────────────────────────────────────────────

export const Fim: React.FC = () => {
  const f = useCurrentFrame();
  const fim = entre(f, 0, 22, 0, 1);
  const risco = entre(f, B * 2.2, B * 2.8, 0, 1);
  const ou = entre(f, B * 3, B * 3.6, 0, 1);
  const continua = mola(f, B * 4, { stiffness: 190, damping: 11 });
  const ano = mola(f, B * 4.6, { stiffness: 170, damping: 10 });
  const iris = entre(f, B * 6.6, B * 8, 1, 0, VAI_VOLTA);
  const flicker = 0.93 + sorte(f) * 0.07;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ clipPath: `circle(${iris * 120}% at 50% 50%)`, background: '#0d0709', filter: `brightness(${flicker})` }}>
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 45%, rgba(255,210,140,.16), transparent 70%)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 560, textAlign: 'center', opacity: fim, letterSpacing: (1 - fim) * 40 }}>
          <span style={{ position: 'relative', display: 'inline-block', fontFamily: F.serifa, fontStyle: 'italic', fontSize: 300, color: C.ouro, lineHeight: 1 }}>
            Fim
            <svg width="520" height="120" viewBox="0 0 520 120" style={{ position: 'absolute', left: '50%', top: '52%', transform: 'translate(-50%,-50%)', overflow: 'visible' }}>
              <path d="M10 80 C 140 40, 300 90, 510 30" stroke="#ff4d6d" strokeWidth="22" strokeLinecap="round" fill="none" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - risco} />
            </svg>
          </span>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 930, textAlign: 'center', fontFamily: F.mao, fontWeight: 700, fontSize: 90, color: C.creme, opacity: ou, transform: `rotate(-3deg) translateY(${(1 - ou) * 20}px)` }}>…ou melhor:</div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 1060, textAlign: 'center', transform: `scale(${continua})` }}>
          <div style={{ fontFamily: F.letreiro, fontSize: 190, letterSpacing: 10, color: C.ouro, lineHeight: 1, textShadow: '0 0 40px rgba(255,190,70,.55)' }}>CONTINUA</div>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 1290, textAlign: 'center', transform: `scale(${ano}) rotate(-4deg)`, fontFamily: F.script, fontSize: 120, color: '#ffb3c7' }}>em 2027 🎬</div>
        <LuzVazada forca={entre(f, B * 4, B * 5, 0, 0.3)} semente={4} />
      </AbsoluteFill>
      <Riscos />
      <Grao forca={0.16} />
      <Vinheta forca={0.6} />
    </AbsoluteFill>
  );
};
