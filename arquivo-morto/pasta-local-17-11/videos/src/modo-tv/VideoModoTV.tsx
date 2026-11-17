// «Modo TV» — demonstração da mesa e da parede (27/10/2026).
//
// Diferente dos outros vídeos, as telas aqui NÃO são redesenhadas: são a
// gravação da mesa real (o código arquivado em `arquivo-morto/modo-tv/`),
// rodando com dados fictícios numa página de ensaio. A gravação vem com o
// registro do que aconteceu (`gravacao.json`: cursor, cliques, teclas, marcas,
// retângulos e qual vista estava na tela), e é por ele que este arquivo cola
// câmera, cursor, balões, manchetes e sons na hora certa.
//
// Sem voz: manchete, etapas, balões e música de fundo baixa.

import { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { ArrowRight, Check, Layers, Lock, Radio, RotateCw, Tv } from 'lucide-react';
import { Manchete } from '../cenas/Manchete';
import { Cursor, type PontoCursor } from '../componentes/Cursor';
import { Fundo } from '../componentes/Fundo';
import { ACELERA, entrada, entre, mola, ms, s, SUAVE_IDA_VOLTA } from '../movimento';
import { COR, FONTE, GRADIENTE_MARCA, SOMBRA_FLUTUA } from '../tema';
import G from './gravacao.json';

// ── medidas ─────────────────────────────────────────────────────────────
/** A página gravada, em px CSS. */
const PAG_L = G.W;
const PAG_A = G.H;
const BARRA = 38;
const JAN = { x: 260, y: 218, l: 1400 };
const ESC = JAN.l / PAG_L;
const JAN_A = BARRA + Math.round(PAG_A * ESC);
/** A TV da parede. */
const TV = { tela: 1280, borda: 14, y: 240 };
const TV_A = Math.round((TV.tela * 9) / 16);

// ── tempo: segundos da gravação → quadro do vídeo ───────────────────────
const INTRO = s(3.4);
const DUR_GRAV = G.marcas.fim + 0.5;
const FIM = INTRO + s(DUR_GRAV);
const FECHA = s(6.6);
export const TOTAL_MODO_TV = FIM + FECHA;
const q = (t: number) => INTRO + Math.round(t * 60);
const M = G.marcas as Record<string, number>;

type Rect = { x: number; y: number; l: number; a: number };
const R = G.rects as Record<string, Rect>;
const uniao = (...rs: Rect[]): Rect => {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  return { x, y, l: Math.max(...rs.map((r) => r.x + r.l)) - x, a: Math.max(...rs.map((r) => r.y + r.a)) - y };
};

// ── câmera ──────────────────────────────────────────────────────────────
type Cam = { z: number; x: number; y: number };
type Chave = Cam & { f: number; durMs: number };
const GERAL: Cam = { z: 1, x: PAG_L / 2, y: PAG_A / 2 };
function enquadra(r: Rect, folga = 40, zMax = 1.5): Cam {
  const z = Math.max(1, Math.min(zMax, PAG_L / (r.l + 2 * folga), PAG_A / (r.a + 2 * folga)));
  return { z, x: r.x + r.l / 2, y: r.y + r.a / 2 };
}
const NOAR_GRANDE: Rect = { x: 569, y: 107, l: 851, a: 478 };
const CHAVES: Chave[] = [
  { f: 0, ...GERAL, durMs: 1 },
  { f: q(6.4), ...enquadra({ x: 16, y: 80, l: 820, a: 380 }, 30, 1.45), durMs: 900 },
  { f: q(7.9), ...enquadra(uniao(R.previa, R.noar), 30), durMs: 800 },
  { f: q(11.9), ...GERAL, durMs: 700 },
  { f: q(17.4), ...enquadra({ x: 16, y: 80, l: 600, a: 380 }, 30, 1.6), durMs: 900 },
  { f: q(21.6), ...GERAL, durMs: 800 },
  { f: q(29.0), ...enquadra(uniao(R.previa, R.inspetor), 24), durMs: 900 },
  { f: q(32.9), ...enquadra(R.previa, 40, 1.7), durMs: 800 },
  { f: q(36.4), ...enquadra(uniao(R.previa, R.inspetor2), 24), durMs: 800 },
  { f: q(41.9), ...enquadra(uniao(R.previa, R.noar, R.cortar), 30), durMs: 900 },
  { f: q(48.3), ...enquadra({ x: 16, y: 80, l: 820, a: 500 }, 30, 1.5), durMs: 900 },
  { f: q(51.3), ...GERAL, durMs: 800 },
  { f: q(53.6), ...enquadra(NOAR_GRANDE, 30, 1.4), durMs: 900 },
  { f: q(56.6), ...GERAL, durMs: 500 },
  { f: q(65.9), ...enquadra(R.painelAlerta, 120, 1.7), durMs: 900 },
  { f: q(72.4), ...GERAL, durMs: 600 },
  { f: q(85.0), ...enquadra(R.painelJogos2, 36, 1.6), durMs: 900 },
  { f: q(97.1), ...GERAL, durMs: 600 },
];
function cameraEm(frame: number): Cam {
  let atual: Cam = { z: CHAVES[0].z, x: CHAVES[0].x, y: CHAVES[0].y };
  for (let i = 1; i < CHAVES.length; i++) {
    const k = CHAVES[i];
    const dur = ms(k.durMs);
    if (frame <= k.f - dur) break;
    const p = SUAVE_IDA_VOLTA(Math.min(1, (frame - (k.f - dur)) / dur));
    atual = { z: atual.z + (k.z - atual.z) * p, x: atual.x + (k.x - atual.x) * p, y: atual.y + (k.y - atual.y) * p };
    if (frame < k.f) break;
  }
  const meiaL = PAG_L / 2 / atual.z;
  const meiaA = PAG_A / 2 / atual.z;
  return { z: atual.z, x: Math.min(PAG_L - meiaL, Math.max(meiaL, atual.x)), y: Math.min(PAG_A - meiaA, Math.max(meiaA, atual.y)) };
}
/** Ponto da página → ponto da tela do vídeo. */
const naTela = (cam: Cam, x: number, y: number) => ({
  x: JAN.x + (PAG_L / 2 + (x - cam.x) * cam.z) * ESC,
  y: JAN.y + BARRA + (PAG_A / 2 + (y - cam.y) * cam.z) * ESC,
});

// ── vistas: a mesa no navegador ou a parede na TV ───────────────────────
type Trecho = { de: number; ate: number; v: 'mesa' | 'parede' };
const TRECHOS: Trecho[] = G.vistas.map((v, i) => ({
  de: i === 0 ? 0 : q(v.t),
  ate: i + 1 < G.vistas.length ? q(G.vistas[i + 1].t) : FIM,
  v: v.v as Trecho['v'],
}));
const SAI = ms(200);
/** 0 → 1 quanto a vista está presente neste quadro. */
function presenca(f: number, v: Trecho['v']) {
  const t = TRECHOS.find((x) => x.v === v && f >= x.de && f < x.ate);
  if (!t) return { p: 0, entra: 1 };
  const primeiro = t.de === 0;
  const entra = primeiro ? mola(f, INTRO - ms(250), { mass: 1, stiffness: 120, damping: 20, overshootClamping: false }) : mola(f, t.de, { mass: 1, stiffness: 150, damping: 22, overshootClamping: false });
  const sai = t.ate === FIM ? entre(f, FIM - ms(350), FIM, 0, 1, ACELERA) : entre(f, t.ate - SAI, t.ate, 0, 1, ACELERA);
  return { p: Math.min(1, entra * 1.3) * (1 - sai), entra, sai };
}

// ── cursor ──────────────────────────────────────────────────────────────
const PONTOS: PontoCursor[] = (G.cursor as number[][]).map(([t, x, y], i, todos) => ({
  f: q(t),
  x,
  y,
  viagemMs: i === 0 ? 1 : Math.max(1, (t - todos[i - 1][0]) * 1000),
}));
const CLIQUES = G.cliques.map(q);

// ── a janela do navegador com a gravação ────────────────────────────────
const Navegador: React.FC = () => {
  const f = useCurrentFrame();
  const { p, entra = 1, sai = 0 } = presenca(f, 'mesa') as { p: number; entra?: number; sai?: number };
  if (p <= 0) return null;
  const cam = cameraEm(f);
  const mesas = TRECHOS.filter((t) => t.v === 'mesa');
  return (
    <div
      style={{
        position: 'absolute', left: JAN.x, top: JAN.y, width: JAN.l, height: JAN_A,
        borderRadius: 14, overflow: 'hidden', background: '#ffffff', boxShadow: SOMBRA_FLUTUA,
        opacity: p,
        transform: `translateY(${(1 - Math.min(1, entra)) * 50}px) scale(${(0.95 + 0.05 * Math.min(1, entra)) * (1 - 0.04 * sai)})`,
      }}
    >
      <div className="font-sans" style={{ position: 'absolute', left: 0, top: 0, width: JAN.l, height: BARRA, background: '#e9edf1', borderBottom: '1px solid #d7dde3', display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />)}
        </div>
        <RotateCw size={14} color="#7b8794" />
        <div style={{ margin: '0 auto', transform: 'translateX(-40px)', width: 460, height: 24, borderRadius: 7, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5, color: '#4b5865', fontFamily: FONTE }}>
          <Lock size={11} /> gestaodeacordos.com.br/modo-tv
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, top: BARRA, width: PAG_L, height: PAG_A, transform: `scale(${ESC})`, transformOrigin: '0 0', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: PAG_L, height: PAG_A, transform: `translate(${PAG_L / 2 - cam.x * cam.z}px, ${PAG_A / 2 - cam.y * cam.z}px) scale(${cam.z})`, transformOrigin: '0 0' }}>
          <Sequence from={INTRO} layout="none">
            <OffthreadVideo src={staticFile('modo-tv/gravacao.mp4')} muted style={{ position: 'absolute', left: 0, top: 0, width: PAG_L, height: PAG_A }} />
          </Sequence>
          {mesas.map((t) => (
            <Cursor key={t.de} pontos={PONTOS} cliques={CLIQUES} escalaInversa={1 / cam.z / ESC} visivelDe={Math.max(t.de, INTRO + ms(300))} visivelAte={t.ate} />
          ))}
        </div>
      </div>
    </div>
  );
};

// ── a TV na parede ──────────────────────────────────────────────────────
const TelaDaTv: React.FC = () => {
  const f = useCurrentFrame();
  const { p, entra = 1, sai = 0 } = presenca(f, 'parede') as { p: number; entra?: number; sai?: number };
  if (p <= 0) return null;
  const largura = TV.tela + TV.borda * 2;
  const x = (1920 - largura) / 2;
  const pisca = 0.55 + 0.45 * Math.abs(Math.sin(f / 22));
  return (
    <div style={{ position: 'absolute', left: x, top: TV.y, width: largura, opacity: p, transform: `scale(${(0.9 + 0.1 * Math.min(1, entra)) * (1 - 0.04 * sai)})`, transformOrigin: '50% 45%' }}>
      <div style={{ padding: TV.borda, borderRadius: 22, background: 'linear-gradient(180deg,#1c232b,#0c1014)', boxShadow: '0 30px 70px rgba(15,27,38,0.35), 0 8px 18px rgba(15,27,38,0.2)' }}>
        <div style={{ position: 'relative', width: TV.tela, height: TV_A, borderRadius: 6, overflow: 'hidden', background: '#0a0f13' }}>
          <Sequence from={INTRO} layout="none">
            <OffthreadVideo src={staticFile('modo-tv/gravacao.mp4')} muted style={{ position: 'absolute', left: 0, top: 0, width: TV.tela, height: TV_A }} />
          </Sequence>
          {/* reflexo de vidro */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 38%)', pointerEvents: 'none' }} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: -46, left: TV.borda, display: 'flex', alignItems: 'center', gap: 12, fontFamily: FONTE }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: '#dc2626', color: '#fff', fontSize: 17, fontWeight: 800, letterSpacing: 1 }}>
          <span style={{ width: 9, height: 9, borderRadius: 5, background: '#fff', opacity: pisca }} /> NO AR
        </span>
        <span style={{ fontSize: 19, fontWeight: 600, color: COR.textoSuave }}>TV do Play 4 · /tv/play-4</span>
      </div>
    </div>
  );
};

// ── balões ──────────────────────────────────────────────────────────────
type Lado = 'baixo' | 'cima' | 'esquerda' | 'direita';
type Balao = { de: number; ate: number; r: Rect; titulo: string; texto: string; lado: Lado };
const BALOES: Balao[] = [
  { de: 1.2, ate: 3.5, r: R.previa, titulo: 'Prévia', texto: 'O que você está montando. A TV ainda não vê.', lado: 'baixo' },
  { de: 3.5, ate: 5.6, r: R.noar, titulo: 'No ar', texto: 'Exatamente o que está na TV agora.', lado: 'baixo' },
  { de: 8.2, ate: 11.6, r: R.noar, titulo: 'A TV continua igual', texto: 'Mexer na prévia não muda a parede.', lado: 'baixo' },
  { de: 23.0, ate: 27.2, r: R.galeria, titulo: 'Coisas interessantes', texto: 'Metas, ranking, jogos e básicos prontos para usar.', lado: 'direita' },
  { de: 29.2, ate: 32.3, r: R.inspetor, titulo: 'Ajuste a fonte', texto: 'Título, layout, quem entra, tamanho e camada.', lado: 'esquerda' },
  { de: 33.2, ate: 35.7, r: R.previa, titulo: 'Arraste', texto: 'Encaixa sozinha no meio e nos terços.', lado: 'baixo' },
  { de: 41.9, ate: 43.3, r: R.cortar, titulo: 'Cortar para o ar', texto: '…ou só apertar Enter.', lado: 'baixo' },
  { de: 48.5, ate: 50.8, r: R.estaCena, titulo: 'Entra na rotação', texto: 'Cada cena com o seu tempo no ar.', lado: 'direita' },
  { de: 51.0, ate: 52.3, r: R.rotacaoBtn, titulo: 'Rotação', texto: 'A fila de cenas vai ao ar sozinha.', lado: 'baixo' },
  { de: 53.7, ate: 56.6, r: NOAR_GRANDE, titulo: 'Troca sozinha', texto: 'Cortar uma cena à mão desliga a rotação.', lado: 'baixo' },
  { de: 66.1, ate: 72.3, r: R.painelAlerta, titulo: 'Alerta ao vivo', texto: 'Entra por cima da cena, fica 10 s e sai sozinho.', lado: 'esquerda' },
  { de: 85.2, ate: 92.2, r: R.painelJogos, titulo: 'Monte a roleta', texto: 'Um item por linha. Em branco, entra o setor inteiro.', lado: 'esquerda' },
  { de: 94.8, ate: 97.1, r: R.painelJogos2, titulo: 'Girar', texto: 'O sorteado sai da lista e não volta a concorrer.', lado: 'esquerda' },
  { de: 107.3, ate: 110.9, r: R.mosaico, titulo: 'Todas as telas', texto: 'Cada TV ao vivo. Clique em uma para editar.', lado: 'cima' },
];

const Baloes: React.FC = () => {
  const f = useCurrentFrame();
  const cam = cameraEm(f);
  return (
    <>
      {BALOES.map((b) => {
        const de = q(b.de);
        const ate = q(b.ate);
        if (f < de || f > ate + ms(300)) return null;
        const m = mola(f, de);
        const some = entre(f, ate, ate + ms(260), 0, 1, ACELERA);
        const vis = Math.min(1, m * 1.4) * (1 - some);
        const a = naTela(cam, b.r.x, b.r.y);
        const z = naTela(cam, b.r.x + b.r.l, b.r.y + b.r.a);
        const caixa = { x: a.x, y: a.y, l: z.x - a.x, a: z.y - a.y };
        const L = 400;
        let ancora: { x: number; y: number };
        let card: { x: number; y: number };
        if (b.lado === 'baixo') { ancora = { x: caixa.x + caixa.l / 2, y: caixa.y + caixa.a }; card = { x: ancora.x - L / 2, y: ancora.y + 46 }; }
        else if (b.lado === 'cima') { ancora = { x: caixa.x + caixa.l / 2, y: caixa.y }; card = { x: ancora.x - L / 2, y: ancora.y - 46 - 118 }; }
        else if (b.lado === 'esquerda') { ancora = { x: caixa.x, y: caixa.y + Math.min(caixa.a / 2, 150) }; card = { x: ancora.x - 46 - L, y: ancora.y - 55 }; }
        else { ancora = { x: caixa.x + caixa.l, y: caixa.y + Math.min(caixa.a / 2, 150) }; card = { x: ancora.x + 46, y: ancora.y - 55 }; }
        card = { x: Math.max(24, Math.min(1920 - L - 24, card.x)), y: Math.max(200, Math.min(1080 - 140, card.y)) };
        const fimLinha = b.lado === 'baixo' ? { x: ancora.x, y: card.y } : b.lado === 'cima' ? { x: ancora.x, y: card.y + 118 } : b.lado === 'esquerda' ? { x: card.x + L, y: ancora.y } : { x: card.x, y: ancora.y };
        return (
          <div key={b.de} style={{ position: 'absolute', inset: 0, opacity: vis, pointerEvents: 'none' }}>
            {/* contorno do que está sendo apontado */}
            <div style={{ position: 'absolute', left: caixa.x - 6, top: caixa.y - 6, width: caixa.l + 12, height: caixa.a + 12, borderRadius: 14, border: '3px solid var(--primary)', boxShadow: '0 0 0 6px color-mix(in oklch, var(--primary) 18%, transparent)', transform: `scale(${1.03 - 0.03 * m})` }} />
            <svg style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, overflow: 'visible' }}>
              <line x1={ancora.x} y1={ancora.y} x2={fimLinha.x} y2={fimLinha.y} stroke="var(--primary)" strokeWidth={2.5} strokeDasharray="4 6" strokeLinecap="round" />
              <circle cx={ancora.x} cy={ancora.y} r={6} fill="var(--primary)" stroke="#fff" strokeWidth={2.5} />
            </svg>
            <div
              style={{
                position: 'absolute', left: card.x, top: card.y, width: L, boxSizing: 'border-box', padding: '18px 22px',
                borderRadius: 16, background: 'rgba(255,255,255,0.97)', boxShadow: SOMBRA_FLUTUA, border: '1px solid rgba(15,27,38,0.08)',
                fontFamily: FONTE, transform: `translateY(${(1 - m) * 14}px)`,
              }}
            >
              <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: -0.5, color: COR.texto }}>{b.titulo}</div>
              <div style={{ marginTop: 4, fontSize: 21, lineHeight: 1.35, fontWeight: 500, color: COR.textoSuave }}>{b.texto}</div>
            </div>
          </div>
        );
      })}
    </>
  );
};

/** A tecla Enter aparecendo na hora do atalho. */
const TeclaEnter: React.FC = () => {
  const f = useCurrentFrame();
  const em = q(M.enter);
  if (f < em - ms(500) || f > em + ms(900)) return null;
  const m = mola(f, em - ms(500));
  const aperta = f >= em && f < em + ms(160) ? 6 : 0;
  const some = entre(f, em + ms(600), em + ms(900), 0, 1, ACELERA);
  return (
    <div style={{ position: 'absolute', left: 960 - 110, top: 820, width: 220, opacity: Math.min(1, m * 1.4) * (1 - some), transform: `scale(${0.8 + 0.2 * m})`, fontFamily: FONTE }}>
      <div style={{ height: 96, borderRadius: 18, background: '#f8fafc', border: '2px solid #cfd8e1', boxShadow: `0 ${10 - aperta}px 0 #b8c4cf, 0 20px 40px rgba(15,27,38,0.2)`, transform: `translateY(${aperta}px)`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, fontSize: 38, fontWeight: 800, color: COR.texto }}>
        Enter <span style={{ fontSize: 34 }}>↵</span>
      </div>
    </div>
  );
};

// ── etapas ──────────────────────────────────────────────────────────────
const ETAPAS: [string, number][] = [
  ['A mesa', 0], ['Cenas', 5.6], ['Montar', 15.9], ['No ar', 41.4], ['Rotação', 47.1], ['Alerta', 63.4], ['Jogos', 77.0], ['Telas', 103.6],
];
const Etapas: React.FC = () => {
  const f = useCurrentFrame();
  if (f < INTRO - ms(200) || f > FIM + ms(300)) return null;
  let atual = 0;
  ETAPAS.forEach(([, t], i) => { if (f >= q(t)) atual = i; });
  const vis = entre(f, INTRO - ms(200), INTRO + ms(300), 0, 1) * (1 - entre(f, FIM - ms(300), FIM + ms(200), 0, 1));
  return (
    <div style={{ position: 'absolute', top: 134, width: 1920, display: 'flex', justifyContent: 'center', opacity: vis, fontFamily: FONTE }}>
      <div style={{ display: 'flex', gap: 6, padding: 6, borderRadius: 999, background: 'rgba(255,255,255,0.75)', boxShadow: '0 4px 14px rgba(15,27,38,0.08)', border: '1px solid rgba(15,27,38,0.06)' }}>
        {ETAPAS.map(([nome, t], i) => {
          const feito = i < atual;
          const agora = i === atual;
          const m = agora ? mola(f, q(t)) : 1;
          return (
            <div key={nome} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px 6px 8px', borderRadius: 999, background: agora ? 'color-mix(in oklch, var(--primary) 14%, white)' : 'transparent', fontSize: 17, fontWeight: agora ? 800 : 600, color: agora || feito ? COR.texto : COR.textoFraco, transform: `scale(${agora ? 0.94 + 0.06 * m : 1})` }}>
              <span style={{ width: 24, height: 24, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, background: feito ? 'var(--success)' : agora ? 'var(--primary)' : '#e3e8ee', color: feito || agora ? '#fff' : COR.textoFraco }}>
                {feito ? <Check size={14} strokeWidth={3.2} /> : i + 1}
              </span>
              {nome}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── abertura e fechamento ───────────────────────────────────────────────
const Abertura: React.FC = () => {
  const f = useCurrentFrame();
  if (f > INTRO + ms(200)) return null;
  const icone = mola(f, ms(150));
  const sai = entre(f, INTRO - ms(500), INTRO, 0, 1, ACELERA);
  return (
    <AbsoluteFill style={{ fontFamily: FONTE, alignItems: 'center', justifyContent: 'center', opacity: 1 - sai, transform: `translateY(${-sai * 40}px)`, filter: sai > 0 ? `blur(${sai * 6}px)` : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 34, marginTop: -60 }}>
        <div style={{ width: 150, height: 150, borderRadius: 38, background: GRADIENTE_MARCA, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 24px 50px rgba(15,27,38,0.22)', transform: `scale(${0.6 + 0.4 * icone}) rotate(${(1 - icone) * -12}deg)`, opacity: Math.min(1, icone * 1.6) }}>
          <Tv size={84} color="#fff" strokeWidth={2.2} />
        </div>
        <div style={{ fontSize: 132, fontWeight: 800, letterSpacing: -4, color: COR.texto }}>
          {'Modo TV'.split(' ').map((p, i) => (
            <span key={i} style={{ display: 'inline-block', marginRight: 28, ...entrada(f, ms(350), i, { passoMs: 90, deslocY: 30, duracaoMs: 600 }) }}>{p}</span>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 26, fontSize: 38, fontWeight: 600, color: COR.textoSuave, ...entrada(f, ms(900), 0, { deslocY: 16, duracaoMs: 600 }) }}>
        A TV do setor, montada e no ar <span style={{ background: GRADIENTE_MARCA, WebkitBackgroundClip: 'text', color: 'transparent', fontWeight: 800 }}>em poucos cliques</span>
      </div>
    </AbsoluteFill>
  );
};

const PASSOS = [
  { Icone: Layers, texto: 'Monte a cena', cor: 'var(--primary)' },
  { Icone: Radio, texto: 'Corte para o ar', cor: '#dc2626' },
  { Icone: Tv, texto: 'A TV mostra na hora', cor: 'var(--success)' },
];
const Fechamento: React.FC = () => {
  const f = useCurrentFrame();
  const ini = FIM + ms(100);
  if (f < ini) return null;
  const icone = mola(f, ini + ms(1700));
  const apaga = entre(f, TOTAL_MODO_TV - ms(700), TOTAL_MODO_TV - 1, 0, 1);
  return (
    <AbsoluteFill style={{ fontFamily: FONTE, alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: 250, fontSize: 66, fontWeight: 800, letterSpacing: -1.6, color: COR.texto }}>
        {'Modo TV: o setor inteiro'.split(' ').map((p, i) => (
          <span key={i} style={{ display: 'inline-block', marginRight: 18, ...entrada(f, ini, i, { passoMs: 70, deslocY: 24, duracaoMs: 520 }) }}>{p}</span>
        ))}
        <span style={{ display: 'inline-block', background: GRADIENTE_MARCA, WebkitBackgroundClip: 'text', color: 'transparent', ...entrada(f, ini, 5, { passoMs: 70, deslocY: 24, duracaoMs: 520 }) }}>vendo junto</span>
      </div>
      <div style={{ position: 'absolute', top: 430, display: 'flex', alignItems: 'center', gap: 26 }}>
        {PASSOS.map((p, i) => {
          const em = ini + ms(650 + i * 330);
          const m = mola(f, em);
          return (
            <div key={p.texto} style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
              {i > 0 && <ArrowRight size={34} color={COR.textoFraco} style={{ opacity: entre(f, em - ms(120), em + ms(200), 0, 1) }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 30px', borderRadius: 22, background: '#ffffff', boxShadow: SOMBRA_FLUTUA, border: '1px solid rgba(15,27,38,0.07)', transform: `translateY(${(1 - m) * 30}px) scale(${0.9 + 0.1 * m})`, opacity: Math.min(1, m * 1.5) }}>
                <span style={{ width: 56, height: 56, borderRadius: 16, background: p.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  <p.Icone size={30} />
                </span>
                <span style={{ fontSize: 34, fontWeight: 700, color: COR.texto, letterSpacing: -0.5 }}>{p.texto}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', top: 600, fontSize: 28, fontWeight: 500, color: COR.textoSuave, ...entrada(f, ini + ms(1500), 0, { deslocY: 14, duracaoMs: 560 }) }}>
        Metas, ranking, alertas e jogos — com os números do relatório, <strong style={{ color: COR.texto }}>atualizados sozinhos</strong>.
      </div>
      <div style={{ position: 'absolute', top: 720, display: 'flex', alignItems: 'center', gap: 18, transform: `scale(${0.6 + 0.4 * icone})`, opacity: Math.min(1, icone * 1.6) }}>
        <div style={{ width: 84, height: 84, borderRadius: 22, overflow: 'hidden', boxShadow: '0 16px 36px rgba(15,27,38,0.18)' }}>
          <Img src={staticFile('marca/app-512.png')} style={{ width: '100%', height: '100%' }} />
        </div>
        <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1, color: COR.texto }}>Gestão de Acordos</span>
      </div>
      <AbsoluteFill style={{ background: '#ffffff', opacity: apaga }} />
    </AbsoluteFill>
  );
};

// ── som ─────────────────────────────────────────────────────────────────
type Efeito = { arquivo: string; em: number; volume: number };
const Trilha: React.FC = () => {
  const efeitos = useMemo<Efeito[]>(() => {
    const trocas = G.vistas.slice(1).map((v) => ({ arquivo: 'whoosh.wav', em: q(v.t) - ms(60), volume: 0.2 }));
    return [
      { arquivo: 'whoosh.wav', em: ms(120), volume: 0.2 },
      { arquivo: 'impacto.wav', em: ms(260), volume: 0.26 },
      { arquivo: 'whoosh.wav', em: INTRO - ms(350), volume: 0.24 },
      ...CLIQUES.map((em) => ({ arquivo: 'clique.wav', em, volume: 0.38 })),
      ...G.teclas.map((t, i) => ({ arquivo: 'tecla.wav', em: q(t), volume: 0.1 + 0.04 * ((i * 7) % 5) / 4 })),
      ...trocas,
      ...ETAPAS.slice(1).map(([, t]) => ({ arquivo: 'pop.wav', em: q(t), volume: 0.12 })),
      { arquivo: 'ding.wav', em: q(M.disparou) + ms(260), volume: 0.3 },
      { arquivo: 'ding.wav', em: q(M.girou) + ms(4250), volume: 0.3 },
      { arquivo: 'whoosh.wav', em: FIM - ms(200), volume: 0.26 },
      ...[0, 1, 2].map((i) => ({ arquivo: 'pop.wav', em: FIM + ms(750 + i * 330), volume: 0.2 })),
      { arquivo: 'impacto.wav', em: FIM + ms(1800), volume: 0.3 },
    ];
  }, []);
  return (
    <>
      {efeitos.map((e, i) => (
        <Sequence key={i} from={Math.max(0, e.em)} name={e.arquivo}>
          <Audio src={staticFile(`sons/${e.arquivo}`)} volume={e.volume} />
        </Sequence>
      ))}
      {/* Música de fundo baixa: entra devagar e some no fim. */}
      <Audio
        src={staticFile('modo-tv/musica.wav')}
        volume={(f) => 0.15 * entre(f, 0, s(1.5), 0, 1) * (1 - entre(f, TOTAL_MODO_TV - s(2.5), TOTAL_MODO_TV - 1, 0, 1))}
      />
    </>
  );
};

// ── manchetes ───────────────────────────────────────────────────────────
const MANCHETES: [number, number, string][] = [
  [0, 5.6, 'A *mesa* do Modo TV'],
  [5.6, 12.2, 'Escolha a cena na *prévia*'],
  [12.2, 15.9, 'Cortou: a TV muda *na hora*'],
  [15.9, 21.8, 'Crie uma *cena nova*'],
  [21.8, 32.4, 'Modelos prontos na *galeria*'],
  [32.4, 41.4, 'Arraste e *escreva* direto na cena'],
  [41.4, 47.1, '*Enter* manda para o ar'],
  [47.1, 57.0, 'A *rotação* troca as cenas sozinha'],
  [57.0, 63.4, 'Cada cena entra com a *sua transição*'],
  [63.4, 77.0, '*Alerta ao vivo* por cima da cena'],
  [77.0, 97.3, 'Roleta, bingo e sorteio *na parede*'],
  [97.3, 103.6, 'Girou na mesa, *gira na TV*'],
  [103.6, DUR_GRAV, 'Todas as *telas* de uma vez'],
];

export const VideoModoTV: React.FC = () => {
  const itens = MANCHETES.map(([de, ate, texto], i) => ({ de: i === 0 ? INTRO - ms(100) : q(de), ate: i === MANCHETES.length - 1 ? FIM - ms(300) : q(ate), texto }));
  return (
    <AbsoluteFill>
      <Fundo />
      <Abertura />
      <TelaDaTv />
      <Navegador />
      <Baloes />
      <TeclaEnter />
      <Manchete itens={itens} y={44} />
      <Etapas />
      <Fechamento />
      <Trilha />
    </AbsoluteFill>
  );
};
