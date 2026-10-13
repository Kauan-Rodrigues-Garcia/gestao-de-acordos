// Cena 1 — «Quanto você já recebeu hoje? Sabe me falar de cabeça?»
//
// O jeito antigo, flutuando em volta da pergunta: a planilha que alguém está
// varrendo linha por linha, o relatório que não termina de atualizar, o recado
// no WhatsApp e o post-it. Nada some: no «Chega» da cena 2 as peças se
// organizam numa pilha no centro, a pilha se recolhe num ponto de luz e de lá
// nascem as duas logos (Cena02Virada).

import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { cena, palavra } from '../linhaDoTempo';
import { ACELERA, entrada, entre, mola, ms, SUAVE, SUAVE_IDA_VOLTA } from '../movimento';
import { COR, FONTE, FONTE_MONO, GRADIENTE_MARCA } from '../tema';

/** Onde fica o centro da pilha (e de onde nascem as logos). */
export const CENTRO_PILHA = { x: 960, y: 470 };

export function temposCena1() {
  const c = cena('cena-01');
  return {
    inicio: c.inicio,
    organiza: palavra('cena-02', 'chega'),
    recolhe: palavra('cena-02', 'procurando'),
  };
}

type Peca = { id: string; x: number; y: number; l: number; a: number; rot: number; entra: number; fase: number };

const PECAS: Peca[] = [
  { id: 'planilha', x: 400, y: 255, l: 600, a: 350, rot: -3.5, entra: 6, fase: 0.3 },
  { id: 'relatorio', x: 1515, y: 265, l: 460, a: 400, rot: 3, entra: 16, fase: 1.7 },
  { id: 'postit', x: 330, y: 845, l: 270, a: 220, rot: -6, entra: 26, fase: 4.4 },
  { id: 'zap', x: 1490, y: 855, l: 540, a: 176, rot: -2, entra: 36, fase: 3.1 },
];

const SOMBRA_PECA = '0 1px 2px rgba(15,27,38,0.06), 0 14px 30px rgba(15,27,38,0.10), 0 40px 70px rgba(15,27,38,0.08)';

export const Cena01Problema: React.FC = () => {
  const f = useCurrentFrame();
  const t = temposCena1();
  if (f > t.recolhe + ms(500)) return null;

  const empurra = 1 + 0.035 * entre(f, 0, t.organiza, 0, 1, (x) => x);

  return (
    <AbsoluteFill style={{ fontFamily: FONTE, transform: `scale(${empurra})` }}>
      {PECAS.map((p, i) => {
        // entrada: vem de fora, desfocada, e assenta com mola
        const e = mola(f, p.entra);
        const deCentro = { x: p.x - 960, y: p.y - 540 };
        const dist = Math.hypot(deCentro.x, deCentro.y) || 1;
        const fora = 70 * (1 - e);
        const flutua = {
          x: Math.sin(f / 60 * 0.7 + p.fase) * 6,
          y: Math.cos(f / 60 * 0.55 + p.fase) * 7,
        };
        // organiza: vai para a pilha no centro, um depois do outro
        const ini = t.organiza + ms(i * 55);
        const o = entre(f, ini, ini + ms(620), 0, 1, SUAVE_IDA_VOLTA);
        const alvo = { x: CENTRO_PILHA.x + (i - 1.5) * 6, y: CENTRO_PILHA.y + (i - 1.5) * 7 };
        const escalaPilha = 280 / p.l;
        // recolhe: a pilha encolhe até virar um ponto
        const r = entre(f, t.recolhe - ms(60), t.recolhe + ms(320), 0, 1, ACELERA);
        const x = p.x + (deCentro.x / dist) * fora + flutua.x * (1 - o) + (alvo.x - p.x) * o;
        const y = p.y + (deCentro.y / dist) * fora + flutua.y * (1 - o) + (alvo.y - p.y) * o;
        const esc = (0.94 + 0.06 * e) * (1 + (escalaPilha - 1) * o) * (1 - r);
        const rot = p.rot * (1 - o) + (i - 1.5) * 2.2 * o;
        return (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: x - p.l / 2,
              top: y - p.a / 2,
              width: p.l,
              height: p.a,
              transform: `rotate(${rot}deg) scale(${esc})`,
              opacity: Math.min(1, e * 1.6) * (1 - entre(f, t.recolhe + ms(140), t.recolhe + ms(320), 0, 1)),
              filter: e < 0.98 ? `blur(${(1 - e) * 10}px)` : undefined,
              zIndex: i,
            }}
          >
            {p.id === 'planilha' && <Planilha f={f} />}
            {p.id === 'relatorio' && <Relatorio f={f} />}
            {p.id === 'postit' && <PostIt f={f} />}
            {p.id === 'zap' && <Recado f={f} />}
          </div>
        );
      })}

      <Brilho f={f} em={t.recolhe + ms(120)} />
      <Pergunta f={f} sai={t.organiza - ms(40)} />
    </AbsoluteFill>
  );
};

// ── a pergunta ──────────────────────────────────────────────────────────
const LINHA_1 = ['Quanto', 'você', 'já', 'recebeu', 'hoje?'];
const LINHA_2 = ['Sabe', 'me', 'falar', 'de', 'cabeça?'];

const Pergunta: React.FC<{ f: number; sai: number }> = ({ f, sai }) => {
  const saindo = (i: number) => {
    const p = entre(f, sai + ms(i * 22), sai + ms(i * 22 + 300), 0, 1, ACELERA);
    return { opacity: 1 - p, transform: `translateY(${-p * 26}px)`, filter: p > 0 ? `blur(${p * 6}px)` : undefined };
  };
  const sublinha = entre(f, palavra('cena-01', 'hoje') + ms(150), palavra('cena-01', 'hoje') + ms(700), 0, 1, SUAVE);
  return (
    <div style={{ position: 'absolute', top: 452, width: 1920, textAlign: 'center' }}>
      <div style={{ fontSize: 78, fontWeight: 800, letterSpacing: -2.2, color: COR.texto, lineHeight: 1.05 }}>
        {LINHA_1.map((w, i) => {
          const e = entrada(f, palavra('cena-01', w), 0, { deslocY: 28, duracaoMs: 520 });
          const destaque = i >= 3;
          return (
            <span key={w} style={{ display: 'inline-block', marginRight: 20, position: 'relative', ...e, ...(f >= sai ? saindo(i) : {}) }}>
              <span style={destaque ? { background: GRADIENTE_MARCA, WebkitBackgroundClip: 'text', color: 'transparent' } : undefined}>{w}</span>
              {destaque && (
                <span style={{ position: 'absolute', left: 0, right: i === 4 ? 0 : -20, bottom: -6, height: 5, borderRadius: 3, background: GRADIENTE_MARCA, transform: `scaleX(${sublinha})`, transformOrigin: 'left' }} />
              )}
            </span>
          );
        })}
      </div>
      <div style={{ fontSize: 42, fontWeight: 600, color: COR.textoSuave, marginTop: 22, letterSpacing: -0.6 }}>
        {LINHA_2.map((w, i) => (
          <span key={w + i} style={{ display: 'inline-block', marginRight: 13, ...entrada(f, palavra('cena-01', w), 0, { deslocY: 18, duracaoMs: 460 }), ...(f >= sai ? saindo(5 + i) : {}) }}>
            {w}
          </span>
        ))}
      </div>
    </div>
  );
};

/** O ponto de luz em que a pilha se recolhe (e de onde as logos vão nascer). */
const Brilho: React.FC<{ f: number; em: number }> = ({ f, em }) => {
  const p = entre(f, em - ms(120), em + ms(520), 0, 1, SUAVE);
  if (p <= 0 || p >= 1) return null;
  const r = 40 + 380 * p;
  return (
    <>
      <div style={{ position: 'absolute', left: CENTRO_PILHA.x - r, top: CENTRO_PILHA.y - r, width: r * 2, height: r * 2, borderRadius: '50%', background: `radial-gradient(circle, rgba(56,189,248,${0.32 * (1 - p)}) 0%, rgba(74,222,128,${0.18 * (1 - p)}) 40%, transparent 70%)` }} />
      <div style={{ position: 'absolute', left: CENTRO_PILHA.x - r * 0.6, top: CENTRO_PILHA.y - r * 0.6, width: r * 1.2, height: r * 1.2, borderRadius: '50%', border: `2px solid rgba(31,143,209,${0.35 * (1 - p)})` }} />
    </>
  );
};

// ── as peças do jeito antigo ────────────────────────────────────────────
const LINHAS = [
  ['13/10', '12574531', 'R$ 187,00', 'BOLETO', 'PAGO'],
  ['13/10', '12611851', 'R$ 151,00', 'BOLETO', 'VERIFICAR'],
  ['13/10', '12672495', 'R$ 205,15', 'PIX', 'PAGO'],
  ['13/10', '12663342', 'R$ 126,00', 'PIX', '???'],
  ['13/10', '12640101', 'R$ 199,19', 'BOLETO', 'PAGO'],
  ['13/10', '12584260', 'R$ 186,75', 'CARTÃO', 'VERIFICAR'],
];
const COLS = [70, 110, 120, 100, 120];

const Planilha: React.FC<{ f: number }> = ({ f }) => {
  // alguém procurando linha por linha: a seleção desce e volta
  const ciclo = ((f - 40) / 22) % (LINHAS.length * 2);
  const linhaSel = f < 40 ? -1 : Math.floor(ciclo < LINHAS.length ? ciclo : LINHAS.length * 2 - ciclo - 0.001);
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden', background: '#fff', boxShadow: SOMBRA_PECA, border: '1px solid rgba(15,27,38,0.08)', fontFamily: FONTE }}>
      <div style={{ height: 36, background: '#1e7145', color: '#fff', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', fontSize: 14, fontWeight: 600 }}>
        <span style={{ background: '#fff', color: '#1e7145', borderRadius: 4, padding: '0 6px', fontWeight: 800, fontSize: 12 }}>X</span>
        acordos_outubro_FINAL (3).xlsx
      </div>
      <div style={{ height: 30, borderBottom: '1px solid #e3e7eb', display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', fontSize: 13, color: '#556270', background: '#f8fafb' }}>
        <span style={{ fontStyle: 'italic', color: '#8a96a3' }}>fx</span>
        <span style={{ fontFamily: FONTE_MONO, fontSize: 12.5 }}>=SOMA(C2:C7)</span>
      </div>
      <div style={{ display: 'flex', background: '#f1f4f6', borderBottom: '1px solid #e3e7eb', fontSize: 12, fontWeight: 700, color: '#556270', height: 28, alignItems: 'center', paddingLeft: 36 }}>
        {['DATA', 'NR', 'VALOR', 'TIPO', 'STATUS'].map((c, i) => (
          <div key={c} style={{ width: COLS[i], textAlign: 'center' }}>{c}</div>
        ))}
      </div>
      {LINHAS.map((l, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', height: 33, borderBottom: '1px solid #eef1f3', fontFamily: FONTE_MONO, fontSize: 13, color: '#24313d', background: i === linhaSel ? 'rgba(250,204,21,0.22)' : undefined, position: 'relative' }}>
          <div style={{ width: 36, textAlign: 'center', color: '#a0aab4', fontSize: 11, background: '#f6f8f9', alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #e3e7eb' }}>{i + 2}</div>
          {l.map((v, j) => (
            <div key={j} style={{ width: COLS[j], textAlign: 'center', fontWeight: j === 4 ? 700 : 500, color: j === 4 ? (v === 'PAGO' ? '#15803d' : v === '???' ? '#b91c1c' : '#b45309') : undefined }}>
              {v}
            </div>
          ))}
          {i === linhaSel && <div style={{ position: 'absolute', inset: 0, border: '2px solid #1e7145', pointerEvents: 'none' }} />}
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', height: 34, fontFamily: FONTE_MONO, fontSize: 13, fontWeight: 700, background: '#f8fafb', paddingLeft: 36 }}>
        <div style={{ width: COLS[0] + COLS[1], textAlign: 'center', color: '#556270' }}>TOTAL</div>
        <div style={{ width: COLS[2], textAlign: 'center', color: '#b91c1c' }}>#VALOR!</div>
      </div>
    </div>
  );
};

const Relatorio: React.FC<{ f: number }> = ({ f }) => {
  const progresso = Math.min(87, 20 + f * 0.45);
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden', background: '#fff', boxShadow: SOMBRA_PECA, border: '1px solid rgba(15,27,38,0.08)', fontFamily: FONTE }}>
      <div style={{ height: 36, background: '#f3f4f6', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', fontSize: 14, fontWeight: 600, color: '#374151' }}>
        <span style={{ background: '#dc2626', color: '#fff', borderRadius: 4, padding: '0 5px', fontWeight: 800, fontSize: 11 }}>PDF</span>
        relatorio_59_exportado.pdf
      </div>
      <div style={{ padding: '22px 26px' }}>
        <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 700, letterSpacing: 1 }}>RELATÓRIO 59 · EXPORTADO 07:02</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: '#111827' }}>Recebimentos do mês</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 110, marginTop: 18, borderBottom: '2px solid #e5e7eb' }}>
          {[48, 72, 60, 96, 84, 110, 70, 92, 102].map((h, i) => (
            <div key={i} style={{ flex: 1, height: h, background: i === 8 ? '#93c5fd' : '#e5e7eb', borderRadius: '4px 4px 0 0' }} />
          ))}
        </div>
        {[0.9, 0.72, 0.84, 0.6].map((w, i) => (
          <div key={i} style={{ height: 10, width: `${w * 100}%`, background: '#eef0f3', borderRadius: 5, marginTop: i === 0 ? 20 : 12 }} />
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, fontFamily: FONTE_MONO, fontSize: 18, fontWeight: 700 }}>
          <span style={{ color: '#6b7280' }}>TOTAL</span>
          <span style={{ color: '#111827' }}>R$ ??.???,??</span>
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#6b7280' }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#eef0f3', overflow: 'hidden' }}>
            <div style={{ width: `${progresso}%`, height: '100%', background: '#9ca3af' }} />
          </div>
          Atualizando… {Math.round(progresso)}%
        </div>
      </div>
    </div>
  );
};

const PostIt: React.FC<{ f: number }> = ({ f }) => {
  const escreve = entre(f, palavra('cena-01', 'cabeca') - ms(200), palavra('cena-01', 'cabeca') + ms(500), 0, 1, SUAVE);
  return (
    <div style={{ width: '100%', height: '100%', background: 'linear-gradient(160deg, #fff3a3, #fde68a)', boxShadow: SOMBRA_PECA, padding: 24, boxSizing: 'border-box', fontFamily: 'Caveat', color: '#3f3a2a', fontSize: 38, lineHeight: 1.1, fontWeight: 600 }}>
      ligar p/ cliente 15h!!
      <div style={{ clipPath: `inset(0 ${100 - escreve * 100}% 0 0)`, marginTop: 10, color: '#b45309' }}>meta = ???</div>
    </div>
  );
};

const Recado: React.FC<{ f: number }> = ({ f }) => {
  const chega = palavra('cena-01', 'falar') - ms(150);
  const digitando = f < chega;
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 16, background: '#fff', boxShadow: SOMBRA_PECA, border: '1px solid rgba(15,27,38,0.08)', padding: '14px 18px', boxSizing: 'border-box', fontFamily: FONTE }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 17, background: '#d9fdd3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#0f7a5a' }}>SV</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111b21' }}>Supervisão · Play 5</div>
          <div style={{ fontSize: 12, color: '#667781' }}>{digitando ? 'Carlos está digitando…' : '15:41'}</div>
        </div>
      </div>
      <div style={{ marginTop: 12, display: 'inline-block', background: '#f0f2f5', borderRadius: '4px 14px 14px 14px', padding: '10px 14px', fontSize: 17, color: '#111b21', ...(digitando ? {} : entrada(f, chega, 0, { deslocY: 10, duracaoMs: 360 })) }}>
        {digitando ? (
          <span style={{ letterSpacing: 4, color: '#8696a0' }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ opacity: 0.35 + 0.65 * Math.max(0, Math.sin(f / 7 - i * 0.9)) }}>●</span>
            ))}
          </span>
        ) : (
          'Alguém conferiu se o 12663342 pagou?? 🤔'
        )}
      </div>
    </div>
  );
};
