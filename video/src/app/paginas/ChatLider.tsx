// Cena 9 — «Precisa do seu líder? Fala com ele sem sair do sistema.»

import { useCurrentFrame } from 'remotion';
import { Icone } from '../../componentes/Icone';
import { aperto, entre, mola, ms } from '../../movimento';
import { COR, GRADIENTE_MARCA } from '../../tema';
import type { TempoApp } from '../roteiro';
import { Avatar } from '../ui';

const RESPOSTA = 'Consegui! Acordo fechado e lembrete enviado ✅';

export const ChatLider: React.FC<{ t: TempoApp; fecha: number }> = ({ t, fecha }) => {
  const f = useCurrentFrame();
  const c = t.clique;
  if (f < c.chat) return null;
  const abre = mola(f, c.chat + ms(40));
  const sai = entre(f, fecha, fecha + ms(300), 0, 1);
  if (sai >= 1) return null;

  const letras = f < t.digitaChat ? 0 : Math.min(RESPOSTA.length, Math.floor(((f - t.digitaChat) / 60) * 1000 / 26));
  const enviada = f >= c.enviarChat + ms(60);
  const balao = mola(f, c.enviarChat + ms(60));
  const recebida = mola(f, c.chat + ms(300));

  return (
    <div
      style={{
        position: 'absolute',
        left: 1120,
        top: 300,
        width: 456,
        height: 580,
        borderRadius: 18,
        background: COR.cardElevado,
        border: `1px solid ${COR.bordaForte}`,
        boxShadow: '0 40px 90px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        transformOrigin: '90% 100%',
        transform: `translateY(${(1 - abre) * 40 + sai * 30}px) scale(${0.92 + 0.08 * abre})`,
        opacity: Math.min(1, abre * 1.6) * (1 - sai),
      }}
    >
      <div style={{ height: 4, background: GRADIENTE_MARCA }} />
      <div style={{ height: 72, display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', borderBottom: `1px solid ${COR.borda}` }}>
        <div style={{ position: 'relative' }}>
          <Avatar nome="Carlos Mendes" tamanho={42} />
          <div style={{ position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6, background: COR.verdeClaro, boxShadow: `0 0 0 2px ${COR.cardElevado}` }} />
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: COR.texto }}>Carlos Mendes</div>
          <div style={{ fontSize: 13, color: COR.verdeClaro }}>Líder · Equipe Águia · online</div>
        </div>
      </div>

      {/* mensagem do líder */}
      <div style={{ position: 'absolute', left: 18, top: 110, display: 'flex', gap: 10, alignItems: 'flex-end', opacity: recebida, transform: `translateY(${(1 - recebida) * 14}px)` }}>
        <div style={{ maxWidth: 300, padding: '12px 14px', borderRadius: '14px 14px 14px 4px', background: '#1a2a38', color: COR.texto, fontSize: 16, lineHeight: 1.45 }}>
          Ju, conseguiu falar com a Maria hoje? 📞
          <div style={{ fontSize: 12, color: COR.textoFraco, marginTop: 4 }}>10:44</div>
        </div>
      </div>

      {/* sua resposta */}
      {enviada && (
        <div
          style={{
            position: 'absolute',
            right: 18,
            top: 214,
            maxWidth: 320,
            padding: '12px 14px',
            borderRadius: '14px 14px 4px 14px',
            background: 'linear-gradient(135deg, #1d8cc4, #29a8e0)',
            color: '#fff',
            fontSize: 16,
            lineHeight: 1.45,
            transformOrigin: '100% 100%',
            transform: `translateY(${(1 - balao) * 120}px) scale(${0.9 + 0.1 * balao})`,
            opacity: Math.min(1, balao * 1.8),
          }}
        >
          {RESPOSTA}
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 4, textAlign: 'right' }}>10:45 ✓✓</div>
        </div>
      )}

      {/* campo de digitar */}
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, height: 44, display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, borderRadius: 22, background: '#0a131c', border: `1px solid ${letras > 0 && !enviada ? 'rgba(92,200,245,0.7)' : COR.borda}`, display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: 15, color: letras > 0 && !enviada ? COR.texto : COR.textoFraco, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {!enviada && letras > 0 ? RESPOSTA.slice(0, letras) : 'Escreva uma mensagem…'}
        </div>
        <div style={{ width: 44, height: 44, borderRadius: 22, background: GRADIENTE_MARCA, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${aperto(f, c.enviarChat)})` }}>
          <Icone nome="enviar" tamanho={18} cor="#05090f" />
        </div>
      </div>
    </div>
  );
};
