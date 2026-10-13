// Cena 6 — «E o melhor: você acompanha quanto já recebeu e quanto falta para
// bater a meta. Atualizado o dia todo.»

import { useCurrentFrame } from 'remotion';
import { Icone } from '../../componentes/Icone';
import { entrada, entre, mola, ms, saida, SUAVE } from '../../movimento';
import { COR, FONTE_MONO } from '../../tema';
import { CONTEUDO } from '../layout';
import type { TempoApp } from '../roteiro';
import { brl, Card, Numero, Rotulo } from '../ui';

export const META_DIA = 7000;
export const RECEBIDO_1 = 4870;
export const RECEBIDO_2 = 5020;

const HORAS = [
  ['08h', 320], ['09h', 610], ['10h', 540], ['11h', 880], ['12h', 410],
  ['13h', 520], ['14h', 760], ['15h', 830], ['16h', 0], ['17h', 0],
] as const;

export const Desempenho: React.FC<{ t: TempoApp; entra: number; sai: number }> = ({ t, entra, sai }) => {
  const f = useCurrentFrame();
  if (f < entra || f >= sai + ms(300)) return null;
  const e = (i: number) => entrada(f, entra, i, { passoMs: 45 });

  const conta = entre(f, t.contaRecebido, t.contaRecebido + ms(1500), 0, 1, SUAVE);
  const tique = entre(f, t.atualizado + ms(250), t.atualizado + ms(900), 0, 1, SUAVE);
  const recebido = RECEBIDO_1 * conta + (RECEBIDO_2 - RECEBIDO_1) * tique;
  const anel = entre(f, t.anelMeta, t.anelMeta + ms(1300), 0, 1, SUAVE);
  const pct = (recebido / META_DIA) * anel;
  const falta = entre(f, t.falta - ms(60), t.falta + ms(300), 0, 1);
  const pisca = f >= t.atualizado ? Math.max(0, 1 - (f - t.atualizado - ms(250)) / ms(700)) : 0;
  const pulso = 0.5 + 0.5 * Math.sin((f / 60) * Math.PI * 2);

  const R = 104;
  const CIRC = 2 * Math.PI * R;

  return (
    <div style={{ position: 'absolute', inset: 0, ...(f >= sai ? saida(f, sai) : {}) }}>
      {/* herói */}
      <Card style={{ position: 'absolute', left: CONTEUDO.x, top: 138, width: CONTEUDO.l, height: 330, background: 'linear-gradient(120deg, rgba(41,168,224,0.12), #0f1a24 55%)', ...e(0) }}>
        <div style={{ position: 'absolute', left: 36, top: 34, ...e(1) }}>
          <Rotulo>Recebido hoje</Rotulo>
          <Numero
            style={{
              display: 'block',
              fontSize: 84,
              letterSpacing: -2,
              color: COR.texto,
              marginTop: 14,
              textShadow: pisca > 0 ? `0 0 ${30 * pisca}px rgba(74,222,128,${0.8 * pisca})` : undefined,
            }}
          >
            {brl(recebido)}
          </Numero>
          <div style={{ display: 'flex', gap: 26, marginTop: 18, fontSize: 17, color: COR.textoSuave }}>
            <span>Direto <Numero style={{ color: COR.texto }}>{brl(3120 * conta + 150 * tique)}</Numero></span>
            <span>Extra <Numero style={{ color: COR.texto }}>{brl(1750 * conta)}</Numero></span>
          </div>
          <div
            style={{
              marginTop: 28,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              height: 38,
              padding: '0 16px',
              borderRadius: 999,
              background: 'rgba(34,197,94,0.10)',
              border: `1px solid rgba(74,222,128,${0.35 + 0.5 * pisca})`,
              color: COR.verdeClaro,
              fontSize: 15,
              fontWeight: 600,
              boxShadow: pisca > 0 ? `0 0 ${26 * pisca}px rgba(74,222,128,0.45)` : undefined,
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: 5, background: COR.verdeClaro, boxShadow: `0 0 ${6 + 8 * pulso}px ${COR.verdeClaro}` }} />
            {f >= t.atualizado + ms(250) ? 'Atualizado agora' : 'Atualizado há 3 min'}
          </div>
        </div>

        {/* anel da meta */}
        <div style={{ position: 'absolute', right: 300, top: 40, width: 250, height: 250, ...e(2) }}>
          <svg width={250} height={250} viewBox="0 0 250 250">
            <defs>
              <linearGradient id="anelMeta" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#4ade80" />
                <stop offset="1" stopColor="#5cc8f5" />
              </linearGradient>
            </defs>
            <circle cx={125} cy={125} r={R} fill="none" stroke="#1b2a38" strokeWidth={18} />
            <circle cx={125} cy={125} r={R} fill="none" stroke="url(#anelMeta)" strokeWidth={18} strokeLinecap="round" strokeDasharray={`${CIRC * pct} ${CIRC}`} transform="rotate(-90 125 125)" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Numero style={{ fontSize: 52, color: COR.texto }}>{Math.round(pct * 100)}%</Numero>
            <div style={{ fontSize: 14, color: COR.textoSuave, marginTop: 2 }}>da meta do dia</div>
          </div>
        </div>
        <div style={{ position: 'absolute', right: 40, top: 70, width: 230, ...e(3) }}>
          <Rotulo>Meta do dia</Rotulo>
          <Numero style={{ display: 'block', fontSize: 30, color: COR.texto, marginTop: 8 }}>{brl(META_DIA)}</Numero>
          <div style={{ marginTop: 26, opacity: falta, transform: `translateY(${(1 - falta) * 12}px)` }}>
            <Rotulo style={{ color: COR.ambar }}>Faltam</Rotulo>
            <Numero style={{ display: 'block', fontSize: 30, color: COR.ambar, marginTop: 8 }}>{brl(Math.max(0, META_DIA - recebido))}</Numero>
          </div>
        </div>
      </Card>

      {/* por hora */}
      <Card style={{ position: 'absolute', left: CONTEUDO.x, top: 488, width: 820, height: 386, ...e(4) }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: COR.texto }}>Recebido por hora</div>
        <div style={{ position: 'absolute', left: 30, right: 30, bottom: 50, height: 250, display: 'flex', alignItems: 'flex-end', gap: 18 }}>
          {HORAS.map(([h, v], i) => {
            const cresce = mola(f, entra + ms(300 + i * 60));
            const alt = (v / 900) * 230 * cresce;
            const agora = i === 7;
            return (
              <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ width: '100%', height: alt, borderRadius: '8px 8px 3px 3px', background: agora ? 'linear-gradient(180deg, #5cc8f5, #29a8e0)' : v ? '#23405a' : '#16222e', boxShadow: agora ? '0 0 24px rgba(92,200,245,0.35)' : undefined }} />
                <div style={{ position: 'absolute', bottom: -30, fontSize: 13, color: COR.textoFraco, fontFamily: FONTE_MONO }} />
              </div>
            );
          })}
        </div>
        <div style={{ position: 'absolute', left: 30, right: 30, bottom: 18, display: 'flex', gap: 18 }}>
          {HORAS.map(([h]) => (
            <div key={h} style={{ flex: 1, textAlign: 'center', fontSize: 13, color: COR.textoFraco, fontFamily: FONTE_MONO }}>{h}</div>
          ))}
        </div>
      </Card>

      {/* resumo */}
      <Card style={{ position: 'absolute', left: CONTEUDO.x + 836, top: 488, width: CONTEUDO.l - 836, height: 386, ...e(5) }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: COR.texto }}>Seus acordos hoje</div>
        {[
          { r: 'Fechados', v: '6', icone: 'doc', cor: COR.azulClaro },
          { r: 'Pagos', v: '5', icone: 'checkCirculo', cor: COR.verdeClaro },
          { r: 'Reagendados', v: '1', icone: 'calendario', cor: COR.ambar },
          { r: 'Lembretes enviados', v: '9', icone: 'enviar', cor: '#c084fc' },
        ].map((x, i) => (
          <div key={x.r} style={{ display: 'flex', alignItems: 'center', gap: 14, height: 66, borderTop: i ? `1px solid ${COR.borda}` : 'none', marginTop: i ? 0 : 14, ...entrada(f, entra, 6 + i, { passoMs: 45 }) }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${x.cor}1f`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icone nome={x.icone} tamanho={18} cor={x.cor} />
            </div>
            <div style={{ fontSize: 16, color: COR.texto, flex: 1 }}>{x.r}</div>
            <Numero style={{ fontSize: 22, color: COR.texto }}>{x.v}</Numero>
          </div>
        ))}
      </Card>
    </div>
  );
};
