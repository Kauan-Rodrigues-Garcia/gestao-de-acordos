// Cena 8 — «Quer mandar um lembrete para o cliente? Tem mensagem pronta! Um
// clique, e já está no WhatsApp!»

import { useCurrentFrame } from 'remotion';
import { Icone } from '../../componentes/Icone';
import { aperto, entrada, entre, mola, ms, saida } from '../../movimento';
import { COR } from '../../tema';
import { APP_L, CONTEUDO } from '../layout';
import type { TempoApp } from '../roteiro';
import { Avatar, Card, Selo } from '../ui';

const MODELOS = [
  { titulo: 'Lembrete de vencimento', tag: 'Cobrança', texto: 'Olá, {nome}! Passando para lembrar que a parcela do seu acordo vence hoje. Qualquer dúvida, estou à disposição!' },
  { titulo: 'Boleto disponível', tag: 'Cobrança', texto: 'Oi, {nome}! O boleto da sua parcela já está disponível. É só clicar no link para pagar.' },
  { titulo: 'Pix copia e cola', tag: 'Pagamento', texto: 'Para facilitar, segue o Pix copia e cola da sua parcela. O pagamento cai na hora!' },
  { titulo: 'Agradecimento', tag: 'Pós-pagamento', texto: 'Recebemos seu pagamento, {nome}! Muito obrigado pela confiança. 😊' },
];

export const MENSAGEM_ZAP =
  'Olá, Maria! 😊 Passando para lembrar que a parcela 1/3 do seu acordo, no valor de R$ 416,67, vence hoje. Qualquer dúvida, estou à disposição!';

export const Campanhas: React.FC<{ t: TempoApp; entra: number; sai: number; zapSai: number }> = ({ t, entra, sai, zapSai }) => {
  const f = useCurrentFrame();
  if (f < entra || f >= sai + ms(300)) return null;
  const c = t.clique;
  const e = (i: number) => entrada(f, entra, i, { passoMs: 45 });
  const hover = entre(f, t.lembrete, t.lembrete + ms(250), 0, 1);
  const favorito = f >= c.estrela;
  const zap = mola(f, t.whatsapp);
  const zapFora = f >= zapSai ? entre(f, zapSai, zapSai + ms(350), 0, 1) : 0;
  const balao = mola(f, t.whatsapp + ms(420));
  const largModelo = (CONTEUDO.l - 16) / 2;

  return (
    <div style={{ position: 'absolute', inset: 0, ...(f >= sai ? saida(f, sai) : {}) }}>
      <div style={{ position: 'absolute', left: CONTEUDO.x, top: 138, display: 'flex', gap: 10, ...e(0) }}>
        {['Todas', '★ Favoritas', 'Cobrança', 'Pagamento', 'Pós-pagamento'].map((x, i) => (
          <div key={x} style={{ height: 40, padding: '0 18px', borderRadius: 999, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 600, color: i === 0 ? COR.texto : COR.textoSuave, background: i === 0 ? 'rgba(41,168,224,0.16)' : '#0a131c', border: `1px solid ${i === 0 ? 'rgba(92,200,245,0.45)' : COR.borda}` }}>
            {x}
          </div>
        ))}
      </div>

      {MODELOS.map((m, i) => {
        const col = i % 2;
        const lin = Math.floor(i / 2);
        const eLembrete = i === 0;
        const levanta = eLembrete ? hover : 0;
        return (
          <div
            key={m.titulo}
            style={{
              position: 'absolute',
              left: CONTEUDO.x + col * (largModelo + 16),
              top: 206 + lin * 316,
              width: largModelo,
              height: 300,
              ...entrada(f, entra, 1 + i, { passoMs: 60 }),
            }}
          >
            <Card
              style={{
                width: '100%',
                height: '100%',
                transform: `translateY(${-6 * levanta}px)`,
                border: `1px solid ${levanta > 0 ? `rgba(37,211,102,${0.25 + 0.5 * levanta})` : COR.borda}`,
                boxShadow: levanta > 0 ? `0 ${20 * levanta}px ${50 * levanta}px rgba(0,0,0,0.45)` : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(37,211,102,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icone nome="chat" tamanho={20} cor={COR.whatsapp} />
                </div>
                <div style={{ fontSize: 19, fontWeight: 700, color: COR.texto }}>{m.titulo}</div>
                <Selo tipo="boleto" style={{ marginLeft: 'auto' }}>{m.tag}</Selo>
              </div>
              <div style={{ marginTop: 18, padding: 16, borderRadius: 12, background: '#0a131c', border: `1px solid ${COR.borda}`, fontSize: 16, lineHeight: 1.5, color: COR.textoSuave, height: 104, boxSizing: 'border-box', overflow: 'hidden' }}>
                {m.texto.split('{nome}').map((parte, k, arr) => (
                  <span key={k}>
                    {parte}
                    {k < arr.length - 1 && <span style={{ color: COR.azulClaro, fontWeight: 600 }}>{'{nome}'}</span>}
                  </span>
                ))}
              </div>
              <div style={{ position: 'absolute', left: 24, right: 24, bottom: 24, height: 44, display: 'flex', alignItems: 'center' }}>
                <div style={{ transform: `scale(${eLembrete ? aperto(f, c.estrela) * (favorito && eLembrete ? 1 + 0.25 * Math.max(0, 1 - (f - c.estrela) / ms(300)) : 1) : 1})` }}>
                  <svg width={24} height={24} viewBox="0 0 24 24" fill={eLembrete && favorito ? '#f5a524' : 'none'} stroke={eLembrete && favorito ? '#f5a524' : COR.textoFraco} strokeWidth={2} strokeLinejoin="round">
                    <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1Z" />
                  </svg>
                </div>
                <div style={{ marginLeft: 12, fontSize: 14, color: COR.textoFraco }}>Usado 214× este mês</div>
                <div
                  style={{
                    marginLeft: 'auto',
                    width: 120,
                    height: 44,
                    borderRadius: 10,
                    background: eLembrete ? 'linear-gradient(135deg, #25d366, #128c4a)' : 'rgba(37,211,102,0.12)',
                    color: eLembrete ? '#04140a' : COR.whatsapp,
                    border: eLembrete ? undefined : '1px solid rgba(37,211,102,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    fontSize: 15,
                    fontWeight: 700,
                    transform: eLembrete ? `scale(${aperto(f, c.enviar)})` : undefined,
                  }}
                >
                  <Icone nome="enviar" tamanho={16} cor={eLembrete ? '#04140a' : COR.whatsapp} /> Enviar
                </div>
              </div>
            </Card>
          </div>
        );
      })}

      {/* conversa no WhatsApp */}
      {f >= t.whatsapp && zapFora < 1 && (
        <div
          style={{
            position: 'absolute',
            left: APP_L - 500,
            top: 112,
            width: 500,
            height: 788,
            background: COR.whatsappFundo,
            borderLeft: '1px solid #233138',
            boxShadow: '-30px 0 60px rgba(0,0,0,0.5)',
            transform: `translateX(${(1 - zap) * 520 + zapFora * 520}px)`,
          }}
        >
          <div style={{ height: 70, background: '#202c33', display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px' }}>
            <Avatar nome="Maria Aparecida" tamanho={42} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 600, color: '#e9edef' }}>Maria Aparecida Souza</div>
              <div style={{ fontSize: 13, color: '#8696a0' }}>online</div>
            </div>
          </div>
          <div style={{ position: 'absolute', top: 96, left: 0, right: 0, textAlign: 'center' }}>
            <span style={{ fontSize: 13, color: '#8696a0', background: '#182229', padding: '5px 12px', borderRadius: 8 }}>HOJE</span>
          </div>
          <div
            style={{
              position: 'absolute',
              right: 20,
              top: 148,
              width: 360,
              padding: '12px 14px 22px',
              borderRadius: '12px 4px 12px 12px',
              background: COR.whatsappBalao,
              color: '#e9edef',
              fontSize: 16,
              lineHeight: 1.45,
              transformOrigin: '100% 0',
              transform: `scale(${0.85 + 0.15 * balao})`,
              opacity: Math.min(1, balao * 1.6),
            }}
          >
            {MENSAGEM_ZAP}
            <div style={{ position: 'absolute', right: 12, bottom: 6, fontSize: 12, color: '#8696a0' }}>
              10:42 <span style={{ color: '#53bdeb' }}>✓✓</span>
            </div>
          </div>
          <div style={{ position: 'absolute', left: 14, right: 14, bottom: 14, height: 50, borderRadius: 25, background: '#2a3942', display: 'flex', alignItems: 'center', padding: '0 20px', color: '#8696a0', fontSize: 15 }}>
            Mensagem
          </div>
        </div>
      )}
    </div>
  );
};
