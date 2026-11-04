// O começo do vídeo (Cleber, 28/10): nada de fingir que é o sistema. Da luz do
// presente sai a noite, e o Gestão conversa com a pessoa como num chat — o
// «digitando…», as frases (o mês de desafios, a honra, «Vem relembrar como
// foi?») e as respostas para escolher. O mouse escolhe «Bora!», e aí o sistema
// entra voando (`VideoNatal.tsx`) para a demonstração do Halloween.

import { useCurrentFrame } from 'remotion';
import { ACELERA, entre, mola, ms, s, SUAVE } from '../movimento';

export function roteiroDaConversa() {
  const falas = [s(1.5), s(4.7), s(8.4)].map(d => ({ digita: d, fala: d + ms(700) }));
  const chips = s(10.1), clique = s(11.3);
  return { falas, chips, clique, resposta: clique + ms(150), sai: s(12.1) };
}
export type RoteiroConversa = ReturnType<typeof roteiroDaConversa>;

/** `*assim*` marca o trecho em destaque (dourado). */
const FRASES = [
  'Outubro foi um mês de *muitos desafios* por aqui.',
  'E foi uma *honra* ter você com a gente no *Gestão de Acordos*.',
  'Vem relembrar como foi?',
];
const RESPOSTAS = ['Bora! 🎃', 'Claro que sim! 💛'];

/** O meio da coluna da conversa e onde ela termina embaixo (na tela, 1920 × 936). */
const COLUNA = { x: 960, largura: 1240, base: 760 };
/** Onde fica o «Bora!» (o mouse clica nele). */
export const ALVO_BORA = { x: 1104, y: 712 };

const Destaque: React.FC<{ texto: string }> = ({ texto }) => (
  <>
    {texto.split(/(\*[^*]+\*)/).map((p, i) => p.startsWith('*')
      ? <span key={i} style={{ background: 'linear-gradient(180deg, #f59e0b, #d97706)', WebkitBackgroundClip: 'text', color: 'transparent', fontWeight: 900 }}>{p.slice(1, -1)}</span>
      : <span key={i}>{p}</span>)}
  </>
);

const Digitando: React.FC<{ t: number }> = ({ t }) => (
  <span style={{ display: 'inline-flex', gap: 10, padding: '6px 4px' }}>
    {[0, 1, 2].map(i => (
      <span key={i} style={{ width: 14, height: 14, borderRadius: 999, background: '#8b7fa8', transform: `translateY(${-6 * Math.max(0, Math.sin((t * 7) - i * 0.9))}px)`, opacity: 0.55 + 0.45 * Math.max(0, Math.sin((t * 7) - i * 0.9)) }} />
    ))}
  </span>
);

/** Um item que cresce de altura ao entrar (empurrando os de cima, como num chat). */
const Item: React.FC<{ de: number; altura: number; lado?: 'gestao' | 'pessoa'; children: React.ReactNode; some?: number }> = ({ de, altura, lado = 'gestao', children, some }) => {
  const f = useCurrentFrame();
  if (f < de) return null;
  const e = mola(f, de, { mass: 0.8, stiffness: 160, damping: 17, overshootClamping: false });
  const fecha = some !== undefined ? entre(f, some, some + ms(220), 0, 1, ACELERA) : 0;
  const h = altura * Math.min(1, e) * (1 - fecha);
  return (
    <div style={{ height: h, display: 'flex', justifyContent: lado === 'gestao' ? 'flex-start' : 'flex-end', alignItems: 'flex-end', overflow: 'visible' }}>
      <div style={{ transformOrigin: lado === 'gestao' ? '0% 100%' : '100% 100%', transform: `scale(${0.6 + 0.4 * Math.min(1.05, e)}) translateY(${(1 - Math.min(1, e)) * 20}px)`, opacity: Math.min(1, e * 1.6) * (1 - fecha) }}>
        {children}
      </div>
    </div>
  );
};

const balao = (lado: 'gestao' | 'pessoa'): React.CSSProperties => ({
  maxWidth: 1080, padding: '24px 34px', borderRadius: 32,
  borderBottomLeftRadius: lado === 'gestao' ? 10 : 32, borderBottomRightRadius: lado === 'pessoa' ? 10 : 32,
  font: '800 44px/1.25 Nunito, Inter, sans-serif', letterSpacing: '-0.01em',
  background: lado === 'gestao' ? 'rgba(255,255,255,.97)' : 'linear-gradient(180deg, #ffd56b, #f4b400)',
  color: lado === 'gestao' ? '#1d1530' : '#2a1a00',
  boxShadow: '0 24px 50px -20px rgba(0,0,0,.6)',
});

export const Conversa: React.FC<{ r: RoteiroConversa }> = ({ r }) => {
  const f = useCurrentFrame();
  if (f > r.sai + ms(600)) return null;
  const t = f / 60;
  const sai = entre(f, r.sai, r.sai + ms(500), 0, 1, ACELERA);
  const cabeca = entre(f, r.falas[0].digita - ms(300), r.falas[0].digita + ms(200), 0, 1, SUAVE);
  const apertado = f >= r.clique && f < r.clique + ms(140);
  return (
    <div style={{ position: 'absolute', left: COLUNA.x - COLUNA.largura / 2, width: COLUNA.largura, bottom: 936 - COLUNA.base, opacity: 1 - sai, transform: `translateY(${-90 * sai}px)` }}>
      {/* Quem fala: o Gestão, «online». */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22, opacity: cabeca, transform: `translateY(${(1 - cabeca) * 12}px)` }}>
        <span style={{ width: 64, height: 64, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at 30% 25%, #ffe08a, #f4b400 60%, #c98f17)', boxShadow: '0 0 30px rgba(244,180,0,.45)', font: '900 26px Nunito, sans-serif', color: '#3a2400' }}>GA</span>
        <span style={{ display: 'grid' }}>
          <b style={{ font: '900 28px Nunito, sans-serif', color: '#fff' }}>Gestão de Acordos</b>
          <span style={{ font: '700 20px Nunito, sans-serif', color: '#7ee2a8' }}>● online</span>
        </span>
      </div>
      <div style={{ display: 'grid', gap: 18 }}>
        {r.falas.map((fl, i) => (
          <div key={i} style={{ display: 'grid', gap: 18 }}>
            <Item de={fl.digita} altura={78} some={fl.fala}><div style={{ ...balao('gestao'), padding: '18px 26px' }}><Digitando t={t} /></div></Item>
            <Item de={fl.fala} altura={i === 1 ? 170 : 112}><div style={balao('gestao')}><Destaque texto={FRASES[i]} /></div></Item>
          </div>
        ))}
        {/* As respostas para escolher; o «Bora!» vira a mensagem da pessoa. */}
        <Item de={r.chips} altura={84} lado="pessoa" some={r.resposta}>
          <div style={{ display: 'flex', gap: 16 }}>
            {RESPOSTAS.map((rp, i) => (
              <span key={rp} style={{
                padding: '16px 30px', borderRadius: 999, border: '3px solid #f4c542', color: '#ffe08a',
                font: '800 32px Nunito, sans-serif', background: i === 0 && f >= r.clique - ms(300) ? 'rgba(244,197,66,.18)' : 'rgba(255,255,255,.04)',
                transform: i === 0 && apertado ? 'scale(.95)' : undefined,
              }}>{rp}</span>
            ))}
          </div>
        </Item>
        <Item de={r.resposta} altura={112} lado="pessoa"><div style={balao('pessoa')}>{RESPOSTAS[0]}</div></Item>
      </div>
    </div>
  );
};
