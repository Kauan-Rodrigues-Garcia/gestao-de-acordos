// Cena 1 — «Quanto você já recebeu hoje? Sabe me falar de cabeça?»
// Planilha, relatório, recado no WhatsApp e post-it flutuando… e se desfazendo
// em poeira enquanto a pergunta fica no ar.

import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Caveat';
import { Desintegrar } from '../componentes/Desintegrar';
import { cena, palavra } from '../linhaDoTempo';
import { entrada, ms, s } from '../movimento';
import { COR, FONTE, FONTE_MONO } from '../tema';

const caveat = loadFont('normal', { weights: ['600'], subsets: ['latin'] });

export type Emissor = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  inicio: number;
  duracao: number;
  cores: string[];
  quantidade: number;
};

// ── posições (px na tela 1920×1080) ────────────────────────────────────────
const PLAN = { x: 150, y: 290, w: 900 };
const PLAN_TITULO = 44;
const PLAN_CABECALHO = 40;
const PLAN_LINHA = 50;
const LINHAS = [
  ['20/10/2026', '12574531', '20/10/2026', 'R$ 187,00', 'BOLETO', 'PAGO'],
  ['20/10/2026', '12611851', '21/10/2026', 'R$ 151,00', 'BOLETO', 'VERIFICAR'],
  ['21/10/2026', '12672495', '22/10/2026', 'R$ 205,15', 'BOLETO', 'PAGO'],
  ['21/10/2026', '12663342', '22/10/2026', 'R$ 126,00', 'PIX', '???'],
  ['22/10/2026', '12640101', '30/10/2026', 'R$ 199,19', 'BOLETO', 'PAGO'],
  ['22/10/2026', '12584260', '30/10/2026', 'R$ 186,75', 'PIX', 'VERIFICAR'],
  ['23/10/2026', '12644109', '01/11/2026', 'R$ 688,00', 'PIX', 'PAGO'],
  ['23/10/2026', '12660751', '01/11/2026', 'R$ 422,00', 'BOLETO', '???'],
];
const COLUNAS = [150, 140, 160, 150, 130, 170];
const REL = { x: 1150, y: 215, w: 600, h: 620 };
const ZAP = { x: 1030, y: 840, w: 560, h: 116 };
const POSTIT = { x: 120, y: 790, w: 300, h: 190 };
const PERGUNTA = { x: 360, y: 92, w: 1200, h: 150 };

export function tempos() {
  const c = cena('cena-01');
  const recebeu = palavra('cena-01', 'recebeu');
  return {
    entra: c.inicio,
    linhas: LINHAS.map((_, i) => recebeu + ms(i * 120)),
    postit: palavra('cena-01', 'hoje'),
    relatorio: palavra('cena-01', 'sabe'),
    zap: palavra('cena-01', 'falar'),
    planilhaTopo: palavra('cena-01', 'de'),
    pergunta: cena('cena-02').inicio + s(0.05),
  };
}

export function emissores(): Emissor[] {
  const t = tempos();
  const linhaY = (i: number) => PLAN.y + PLAN_TITULO + PLAN_CABECALHO + i * PLAN_LINHA;
  return [
    ...LINHAS.map((_, i) => ({
      id: `linha-${i}`,
      x: PLAN.x,
      y: linhaY(i),
      w: PLAN.w,
      h: PLAN_LINHA,
      inicio: t.linhas[i],
      duracao: s(1.1),
      cores: ['#2ea043', '#3fb950', '#e6f4ea', '#1a7f37'],
      quantidade: 70,
    })),
    { id: 'plan-topo', x: PLAN.x, y: PLAN.y, w: PLAN.w, h: PLAN_TITULO + PLAN_CABECALHO, inicio: t.planilhaTopo, duracao: s(1.0), cores: ['#1f6f3a', '#0d1117', '#c9d1d9'], quantidade: 80 },
    { id: 'relatorio', ...REL, inicio: t.relatorio, duracao: s(1.8), cores: ['#f3f5f8', '#d0d7de', '#29a8e0', '#8c959f'], quantidade: 360 },
    { id: 'postit', ...POSTIT, inicio: t.postit, duracao: s(1.2), cores: ['#ffe066', '#f5c518', '#3d3d3d'], quantidade: 100 },
    { id: 'zap', ...ZAP, inicio: t.zap, duracao: s(1.2), cores: ['#005c4b', '#e9edef', '#25d366'], quantidade: 120 },
    { id: 'pergunta', ...PERGUNTA, inicio: t.pergunta, duracao: s(1.1), cores: ['#e8eef4', '#93a3b3', '#5cc8f5'], quantidade: 180 },
  ];
}

/** Flutuação lenta e independente para cada peça. */
function flutua(frame: number, fase: number, amp = 6) {
  const t = frame / 60;
  return `translate(${Math.sin(t * 0.6 + fase) * amp}px, ${Math.cos(t * 0.5 + fase) * amp}px)`;
}

export const Cena01Problema: React.FC = () => {
  const f = useCurrentFrame();
  const t = tempos();
  const PALAVRAS_1 = ['Quanto', 'você', 'já', 'recebeu', 'hoje?'];
  const PALAVRAS_2 = ['Sabe', 'me', 'falar', 'de', 'cabeça?'];

  return (
    <AbsoluteFill style={{ fontFamily: FONTE }}>
      {/* ── pergunta ── */}
      <div style={{ position: 'absolute', left: PERGUNTA.x, top: PERGUNTA.y }}>
        <Desintegrar id="pergunta" inicio={t.pergunta} duracao={s(1.1)} largura={PERGUNTA.w} altura={PERGUNTA.h} semente={11}>
          <div style={{ textAlign: 'center', width: PERGUNTA.w }}>
            <div style={{ fontSize: 64, fontWeight: 700, color: COR.texto, letterSpacing: -1.5 }}>
              {PALAVRAS_1.map((p) => (
                <span key={p} style={{ display: 'inline-block', marginRight: 18, ...entrada(f, palavra('cena-01', p), 0, { deslocY: 22, duracaoMs: 450 }) }}>
                  {p}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 40, fontWeight: 500, color: COR.textoSuave, marginTop: 10 }}>
              {PALAVRAS_2.map((p, i) => (
                <span key={p + i} style={{ display: 'inline-block', marginRight: 12, ...entrada(f, palavra('cena-01', p), 0, { deslocY: 16, duracaoMs: 420 }) }}>
                  {p}
                </span>
              ))}
            </div>
          </div>
        </Desintegrar>
      </div>

      {/* ── planilha ── */}
      <div style={{ position: 'absolute', left: PLAN.x, top: PLAN.y, ...entrada(f, t.entra, 0, { deslocY: 30, duracaoMs: 900 }) }}>
        <div style={{ transform: flutua(f, 0.3), filter: 'drop-shadow(0 30px 50px rgba(0,0,0,0.55))' }}>
          <Desintegrar id="plan-topo" inicio={t.planilhaTopo} duracao={s(1.0)} largura={PLAN.w} altura={PLAN_TITULO + PLAN_CABECALHO} semente={5}>
            <div style={{ height: PLAN_TITULO, background: '#1f6f3a', borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, color: '#e6f4ea', fontSize: 17, fontWeight: 600 }}>
              <span style={{ background: '#e6f4ea', color: '#1f6f3a', borderRadius: 4, padding: '1px 6px', fontWeight: 800, fontSize: 14 }}>X</span>
              acordos_outubro_FINAL (3).xlsx
            </div>
            <div style={{ height: PLAN_CABECALHO, background: '#0d1117', display: 'flex', alignItems: 'center', color: '#e6edf3', fontSize: 15, fontWeight: 700 }}>
              {['DATA', 'NR', 'VENCIMENTO', 'VALOR', 'TIPO', 'STATUS'].map((c, i) => (
                <div key={c} style={{ width: COLUNAS[i], textAlign: 'center' }}>{c}</div>
              ))}
            </div>
          </Desintegrar>
          {LINHAS.map((linha, i) => (
            <Desintegrar key={i} id={`linha-${i}`} inicio={t.linhas[i]} duracao={s(1.1)} largura={PLAN.w} altura={PLAN_LINHA} semente={20 + i}>
              <div
                style={{
                  height: PLAN_LINHA,
                  background: i % 2 ? '#2b9a45' : '#2ea043',
                  borderTop: '1px solid rgba(0,0,0,0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  color: '#0b1f12',
                  fontSize: 17,
                  fontFamily: FONTE_MONO,
                  fontWeight: 500,
                  borderRadius: i === LINHAS.length - 1 ? '0 0 10px 10px' : 0,
                }}
              >
                {linha.map((v, j) => (
                  <div key={j} style={{ width: COLUNAS[j], textAlign: 'center', fontWeight: j === 5 ? 700 : 500, color: j === 5 && v !== 'PAGO' ? '#5a1010' : undefined }}>
                    {v}
                  </div>
                ))}
              </div>
            </Desintegrar>
          ))}
        </div>
      </div>

      {/* ── relatório ── */}
      <div style={{ position: 'absolute', left: REL.x, top: REL.y, ...entrada(f, t.entra, 2, { passoMs: 120, deslocY: 30, duracaoMs: 900 }) }}>
        <div style={{ transform: `${flutua(f, 1.7)} rotate(2.5deg)`, filter: 'drop-shadow(0 30px 50px rgba(0,0,0,0.55))' }}>
          <Desintegrar id="relatorio" inicio={t.relatorio} duracao={s(1.8)} largura={REL.w} altura={REL.h} semente={7}>
            <div style={{ width: REL.w, height: REL.h, background: '#f3f5f8', borderRadius: 12, padding: 40, boxSizing: 'border-box', color: '#24292f' }}>
              <div style={{ fontSize: 14, color: '#8c959f', fontWeight: 600, letterSpacing: 1 }}>RELATÓRIO 59 · EXPORTADO 07:02</div>
              <div style={{ fontSize: 30, fontWeight: 700, marginTop: 8 }}>Recebimentos do mês</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 170, marginTop: 34, borderBottom: '2px solid #d0d7de' }}>
                {[60, 95, 72, 130, 110, 150, 88, 120, 140].map((h, i) => (
                  <div key={i} style={{ flex: 1, height: h, background: i === 8 ? '#29a8e0' : '#c8d1da', borderRadius: '4px 4px 0 0' }} />
                ))}
              </div>
              {[0.92, 0.78, 0.86, 0.6, 0.82, 0.7, 0.5].map((w, i) => (
                <div key={i} style={{ height: 12, width: `${w * 100}%`, background: '#d8dee4', borderRadius: 6, marginTop: i === 0 ? 34 : 16 }} />
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 34, fontFamily: FONTE_MONO, fontSize: 22, fontWeight: 600 }}>
                <span style={{ color: '#57606a' }}>TOTAL</span>
                <span>R$ ??.???,??</span>
              </div>
            </div>
          </Desintegrar>
        </div>
      </div>

      {/* ── recado no WhatsApp ── */}
      <div style={{ position: 'absolute', left: ZAP.x, top: ZAP.y, ...entrada(f, t.entra, 4, { passoMs: 120, deslocY: 24, duracaoMs: 800 }) }}>
        <div style={{ transform: flutua(f, 3.1, 5), filter: 'drop-shadow(0 20px 36px rgba(0,0,0,0.5))' }}>
          <Desintegrar id="zap" inicio={t.zap} duracao={s(1.2)} largura={ZAP.w} altura={ZAP.h} semente={13}>
            <div style={{ width: ZAP.w, height: ZAP.h, background: COR.whatsappBalao, borderRadius: '16px 16px 4px 16px', padding: '16px 20px', boxSizing: 'border-box', color: '#e9edef' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#53bdeb' }}>Supervisão</div>
              <div style={{ fontSize: 21, marginTop: 4 }}>Alguém conferiu se o 12663342 pagou?? 🤔</div>
              <div style={{ fontSize: 13, color: '#8696a0', textAlign: 'right', marginTop: 2 }}>09:41 ✓✓</div>
            </div>
          </Desintegrar>
        </div>
      </div>

      {/* ── post-it ── */}
      <div style={{ position: 'absolute', left: POSTIT.x, top: POSTIT.y, ...entrada(f, t.entra, 3, { passoMs: 120, deslocY: 24, duracaoMs: 800 }) }}>
        <div style={{ transform: `${flutua(f, 4.4, 5)} rotate(-6deg)`, filter: 'drop-shadow(0 18px 30px rgba(0,0,0,0.5))' }}>
          <Desintegrar id="postit" inicio={t.postit} duracao={s(1.2)} largura={POSTIT.w} altura={POSTIT.h} semente={17}>
            <div style={{ width: POSTIT.w, height: POSTIT.h, background: 'linear-gradient(160deg, #ffe680, #f5c518)', padding: 22, boxSizing: 'border-box', fontFamily: caveat.fontFamily, color: '#3d3d3d', fontSize: 36, lineHeight: 1.05 }}>
              ligar p/ cliente 15h!!
              <br />
              meta = ???
            </div>
          </Desintegrar>
        </div>
      </div>
    </AbsoluteFill>
  );
};
