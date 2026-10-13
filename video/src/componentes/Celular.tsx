// O celular da cena 11: o app aberto no Desempenho do Dia e uma notificação
// de «acordo pago» descendo do topo.

import { Img, useCurrentFrame } from 'remotion';
import { brl, Numero } from '../app/ui';
import { entrada, mola, ms } from '../movimento';
import { COR, FONTE, GRADIENTE_MARCA } from '../tema';
import { logoSrc } from './Poeira';

export const CEL_L = 390;
export const CEL_A = 800;

export const Celular: React.FC<{ aparece: number; aviso: number }> = ({ aparece, aviso }) => {
  const f = useCurrentFrame();
  const push = mola(f, aviso);
  const e = (i: number) => entrada(f, aparece + ms(200), i, { passoMs: 50 });

  return (
    <div style={{ width: CEL_L, height: CEL_A, borderRadius: 60, background: '#05080c', padding: 13, boxSizing: 'border-box', boxShadow: '0 50px 120px rgba(0,0,0,0.65), inset 0 0 0 2px #2a3440, 0 0 0 1px #10161d', fontFamily: FONTE }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 48, background: COR.app, overflow: 'hidden' }}>
        {/* ilha */}
        <div style={{ position: 'absolute', left: '50%', top: 12, width: 112, height: 32, borderRadius: 16, background: '#000', transform: 'translateX(-50%)', zIndex: 5 }} />
        <div style={{ position: 'absolute', left: 30, top: 18, fontSize: 15, fontWeight: 700, color: COR.texto }}>10:46</div>

        <div style={{ position: 'absolute', left: 20, right: 20, top: 66, display: 'flex', alignItems: 'center', gap: 10, ...e(0) }}>
          <Img src={logoSrc('app-512.png')} style={{ width: 34, height: 34, borderRadius: 9 }} />
          <div style={{ fontSize: 17, fontWeight: 700, color: COR.texto }}>Desempenho do Dia</div>
        </div>

        <div style={{ position: 'absolute', left: 16, right: 16, top: 118, borderRadius: 20, padding: 20, background: 'linear-gradient(140deg, rgba(41,168,224,0.16), #0f1a24 70%)', border: `1px solid ${COR.borda}`, ...e(1) }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: COR.textoSuave, letterSpacing: 0.6 }}>RECEBIDO HOJE</div>
          <Numero style={{ display: 'block', fontSize: 34, color: COR.texto, marginTop: 6 }}>{brl(7120)}</Numero>
          <div style={{ height: 10, borderRadius: 5, background: '#1b2a38', marginTop: 16, overflow: 'hidden' }}>
            <div style={{ width: '100%', height: '100%', background: GRADIENTE_MARCA }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13, color: COR.verdeClaro, fontWeight: 600 }}>
            <span>Meta batida 🎉</span>
            <span>102%</span>
          </div>
        </div>

        {[
          ['Maria Aparecida Souza', 416.67, 'Pago'],
          ['Marcos Vinícius Lima', 1867.4, 'Pago'],
          ['Fernanda Rocha', 1042, 'Pendente'],
          ['Patrícia Gomes', 1222.68, 'Pendente'],
        ].map(([n, v, st], i) => (
          <div key={n as string} style={{ position: 'absolute', left: 16, right: 16, top: 320 + i * 74, height: 64, borderRadius: 14, background: COR.card, border: `1px solid ${COR.borda}`, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, ...e(2 + i) }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: COR.texto, fontWeight: 600 }}>{n}</div>
              <Numero style={{ fontSize: 13, color: COR.textoSuave }}>{brl(v as number)}</Numero>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, color: st === 'Pago' ? '#4ade80' : '#f5a524', background: st === 'Pago' ? 'rgba(34,197,94,0.12)' : 'rgba(245,165,36,0.12)' }}>{st}</span>
          </div>
        ))}

        {/* notificação */}
        <div
          style={{
            position: 'absolute',
            left: 10,
            right: 10,
            top: 54,
            borderRadius: 22,
            padding: '14px 16px',
            background: 'rgba(30,40,52,0.92)',
            backdropFilter: 'blur(14px)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            display: 'flex',
            gap: 12,
            transform: `translateY(${(1 - push) * -160}px)`,
            opacity: f >= aviso ? 1 : 0,
            zIndex: 6,
          }}
        >
          <Img src={logoSrc('app-512.png')} style={{ width: 40, height: 40, borderRadius: 10 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#aab4c0' }}>
              <span style={{ fontWeight: 600 }}>GESTÃO DE ACORDOS</span>
              <span>agora</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginTop: 3 }}>Acordo pago ✓</div>
            <div style={{ fontSize: 14, color: '#d6dde5', marginTop: 1 }}>Maria Aparecida · R$ 416,67</div>
          </div>
        </div>
      </div>
    </div>
  );
};
