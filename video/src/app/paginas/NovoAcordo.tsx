// Cena 4 — «Fechou com o cliente? Registre o acordo em segundos. Valor,
// parcelas, vencimento… salvo? Pronto!»

import { useCurrentFrame } from 'remotion';
import { Icone } from '../../componentes/Icone';
import { aperto, entrada, entre, mola, ms, saida } from '../../movimento';
import { COR, FONTE_MONO, GRADIENTE_MARCA } from '../../tema';
import type { TempoApp } from '../roteiro';
import { Rotulo } from '../ui';

const P = { x: 545, y: 150, l: 760, a: 690 };

/** Texto sendo digitado: uma letra a cada `msPorLetra`. */
function digitado(frame: number, inicio: number, texto: string, msPorLetra = 45) {
  if (frame < inicio) return '';
  const n = Math.floor(((frame - inicio) / 60) * (1000 / msPorLetra));
  return texto.slice(0, Math.min(texto.length, n));
}

const Campo: React.FC<{ x: number; y: number; l: number; rotulo: string; valor: string; foco: number; mono?: boolean; icone?: string; style?: React.CSSProperties }> = ({ x, y, l, rotulo, valor, foco, mono, icone, style }) => {
  const quadro = useCurrentFrame();
  return (
  <div style={{ position: 'absolute', left: x, top: y, width: l, ...style }}>
    <Rotulo style={{ fontSize: 12 }}>{rotulo}</Rotulo>
    <div
      style={{
        marginTop: 8,
        height: 52,
        borderRadius: 10,
        background: '#0a131c',
        border: `1px solid ${foco > 0 ? `rgba(92,200,245,${0.35 + 0.65 * foco})` : COR.borda}`,
        boxShadow: foco > 0 ? `0 0 0 ${4 * foco}px rgba(41,168,224,0.18)` : undefined,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 10,
        boxSizing: 'border-box',
        fontSize: 18,
        color: COR.texto,
        fontFamily: mono ? FONTE_MONO : undefined,
        fontWeight: 500,
      }}
    >
      {icone && <Icone nome={icone} tamanho={18} cor={COR.textoSuave} />}
      {valor}
      {foco > 0.5 && <span style={{ width: 2, height: 22, background: COR.azulClaro, opacity: Math.floor(quadro / 32) % 2 === 0 ? 1 : 0 }} />}
    </div>
  </div>
  );
};

export const NovoAcordo: React.FC<{ t: TempoApp; entra: number; sai: number }> = ({ t, entra, sai }) => {
  const f = useCurrentFrame();
  if (f < entra || f >= sai + ms(300)) return null;
  const c = t.clique;
  const painel = mola(f, entra);
  const e = (i: number) => entrada(f, entra + ms(120), i, { passoMs: 40 });

  const focoCampo = (de: number, ate: number) => Math.min(entre(f, de, de + ms(150), 0, 1), entre(f, ate, ate + ms(150), 1, 0));
  const salvo = f >= c.salvar + ms(150);
  const pronto = entre(f, t.toast - ms(100), t.toast + ms(250), 0, 1);

  const parcelaEscolhida = f >= c.parcelas ? 3 : 0;
  const escalaChip3 = aperto(f, c.parcelas);

  return (
    <div style={{ position: 'absolute', inset: 0, ...(f >= sai ? saida(f, sai) : {}) }}>
      {/* fundo escurecido */}
      <div style={{ position: 'absolute', left: 250, top: 112, right: 0, bottom: 0, background: `rgba(3,7,12,${0.55 * entre(f, entra, entra + ms(300), 0, 1)})` }} />
      <div
        style={{
          position: 'absolute',
          left: P.x,
          top: P.y,
          width: P.l,
          height: P.a,
          borderRadius: 18,
          background: COR.cardElevado,
          border: `1px solid ${COR.bordaForte}`,
          boxShadow: '0 40px 90px rgba(0,0,0,0.6)',
          transform: `translateY(${(1 - painel) * 40}px) scale(${0.94 + 0.06 * painel})`,
          opacity: Math.min(1, painel * 1.6),
          overflow: 'hidden',
        }}
      >
        <div style={{ height: 4, background: GRADIENTE_MARCA }} />
        <div style={{ position: 'absolute', left: 32, top: 30, ...e(0) }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: COR.texto }}>Novo acordo</div>
          <div style={{ fontSize: 15, color: COR.textoSuave, marginTop: 4 }}>Preencha e salve — o resto o sistema faz.</div>
        </div>
        <Campo x={32} y={110} l={696} rotulo="Cliente · inscrição" valor={digitado(f, t.digitaCliente, 'Maria Aparecida Souza · 907544', 28)} foco={focoCampo(t.digitaCliente - ms(100), c.valor)} icone="usuarios" style={e(1)} />
        <Campo x={32} y={214} l={336} rotulo="Valor total" valor={digitado(f, c.valor + ms(80), 'R$ 1.250,00', 55)} foco={focoCampo(c.valor, c.parcelas - ms(60))} mono style={e(2)} />
        <Campo x={392} y={214} l={336} rotulo="1º vencimento" valor={digitado(f, c.vencimento + ms(80), '20/10/2026', 45)} foco={focoCampo(c.vencimento, c.salvar - ms(300))} mono icone="calendario" style={e(3)} />

        <div style={{ position: 'absolute', left: 32, top: 318, ...e(4) }}>
          <Rotulo style={{ fontSize: 12 }}>Parcelas</Rotulo>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            {[1, 2, 3, 4, 5, 6].map((n) => {
              const sel = n === parcelaEscolhida;
              return (
                <div
                  key={n}
                  style={{
                    width: 100,
                    height: 48,
                    borderRadius: 10,
                    border: `1px solid ${sel ? 'rgba(92,200,245,0.9)' : COR.borda}`,
                    background: sel ? 'rgba(41,168,224,0.18)' : '#0a131c',
                    color: sel ? COR.azulClaro : COR.textoSuave,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: FONTE_MONO,
                    fontSize: 17,
                    fontWeight: 600,
                    transform: n === 3 ? `scale(${escalaChip3})` : undefined,
                  }}
                >
                  {n}x
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 10, fontSize: 14, color: COR.textoSuave, fontFamily: FONTE_MONO, opacity: entre(f, c.parcelas + ms(100), c.parcelas + ms(400), 0, 1) }}>
            3 × R$ 416,67
          </div>
        </div>

        <div style={{ position: 'absolute', left: 32, top: 438, ...e(5) }}>
          <Rotulo style={{ fontSize: 12 }}>Forma de pagamento</Rotulo>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <div style={{ height: 44, padding: '0 18px', borderRadius: 10, border: '1px solid rgba(74,222,128,0.6)', background: 'rgba(34,197,94,0.12)', color: COR.verdeClaro, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 600 }}>Boleto / PIX</div>
            <div style={{ height: 44, padding: '0 18px', borderRadius: 10, border: `1px solid ${COR.borda}`, background: '#0a131c', color: COR.textoSuave, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 500 }}>Cartão de Crédito</div>
          </div>
        </div>

        {/* botões */}
        <div style={{ position: 'absolute', right: 32, bottom: 28, display: 'flex', gap: 12, ...e(6) }}>
          <div style={{ height: 52, padding: '0 22px', borderRadius: 10, border: `1px solid ${COR.borda}`, color: COR.textoSuave, display: 'flex', alignItems: 'center', fontSize: 16, fontWeight: 600 }}>Cancelar</div>
          <div
            style={{
              width: 180,
              height: 52,
              borderRadius: 10,
              background: salvo ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, #29a8e0, #1d8cc4)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 16,
              fontWeight: 700,
              transform: `scale(${aperto(f, c.salvar)})`,
              boxShadow: salvo ? '0 0 30px rgba(34,197,94,0.45)' : '0 10px 24px rgba(41,168,224,0.3)',
            }}
          >
            {salvo ? (
              <>
                <Icone nome="check" tamanho={18} cor="#fff" espessura={3} /> Salvo
              </>
            ) : (
              'Salvar acordo'
            )}
          </div>
        </div>
      </div>

      {/* aviso de sucesso */}
      {pronto > 0 && (
        <div
          style={{
            position: 'absolute',
            right: 36,
            top: 130,
            width: 360,
            padding: '16px 18px',
            borderRadius: 14,
            background: '#0f2418',
            border: '1px solid rgba(74,222,128,0.5)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            opacity: pronto,
            transform: `translateX(${(1 - mola(f, t.toast - ms(100))) * 60}px)`,
          }}
        >
          <div style={{ width: 38, height: 38, borderRadius: 19, background: 'rgba(74,222,128,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icone nome="check" tamanho={20} cor={COR.verdeClaro} espessura={3} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: COR.texto }}>Acordo registrado!</div>
            <div style={{ fontSize: 14, color: COR.textoSuave, marginTop: 2 }}>Maria Aparecida · 3 × R$ 416,67</div>
          </div>
        </div>
      )}
    </div>
  );
};
