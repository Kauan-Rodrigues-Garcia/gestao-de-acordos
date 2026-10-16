// O que acontece depois do clique na mensagem pronta: o app abre o link
// `wa.me` numa aba nova, e a conversa com o cliente já chega com o texto
// escrito. Aqui é uma janela de navegador por cima do sistema, com a conversa
// no visual claro do WhatsApp Web.

import { Lock, MoreVertical, Paperclip, Search, SendHorizontal, Smile } from 'lucide-react';
import { useCurrentFrame } from 'remotion';
import { aperto, entrada, entre, mola, ms } from '../../movimento';
import { MENSAGENS } from '../dados';
import type { TempoApp } from '../roteiro';

const ZAP = { cabecalho: '#f0f2f5', fundo: '#efeae2', meu: '#d9fdd3', texto: '#111b21', suave: '#667781', icone: '#54656f', verde: '#00a884' };

export const WhatsApp: React.FC<{ t: TempoApp }> = ({ t }) => {
  const f = useCurrentFrame();
  const c = t.clique;
  const abre = t.abreZap;
  const fecha = t.c9.inicio + ms(40);
  if (f < abre || f > fecha + ms(400)) return null;
  const entra = mola(f, abre, { mass: 1, stiffness: 190, damping: 24, overshootClamping: false });
  const sai = entre(f, fecha, fecha + ms(380), 0, 1);
  const enviada = f >= c.enviarZap + ms(40);
  const texto = MENSAGENS[0].texto;

  return (
    <div
      className="absolute overflow-hidden rounded-xl border border-black/10 font-sans"
      style={{
        left: 330,
        top: 70,
        width: 1040,
        height: 720,
        zIndex: 70,
        background: '#fff',
        boxShadow: '0 30px 80px rgba(15,27,38,0.28), 0 6px 18px rgba(15,27,38,0.12)',
        opacity: Math.min(1, entra * 1.4) * (1 - sai),
        transform: `translate(${(1 - entra) * 120 + sai * 160}px, ${(1 - entra) * 20}px) scale(${0.94 + 0.06 * entra})`,
      }}
    >
      {/* barra do navegador */}
      <div className="flex items-center gap-3 px-4" style={{ height: 38, background: '#e9edf1', borderBottom: '1px solid #d7dde3' }}>
        <div className="flex gap-2">
          {['#ff5f57', '#febc2e', '#28c840'].map((cor) => (
            <span key={cor} className="h-3 w-3 rounded-full" style={{ background: cor }} />
          ))}
        </div>
        <div className="mx-auto flex h-6 w-[420px] items-center justify-center gap-1.5 rounded-md bg-white text-xs" style={{ color: '#5b6773' }}>
          <Lock className="h-3 w-3" /> web.whatsapp.com
        </div>
      </div>

      <div className="flex flex-col" style={{ height: 720 - 38 }}>
        {/* cabeçalho da conversa */}
        <div className="flex items-center gap-3 px-4" style={{ height: 60, background: ZAP.cabecalho, borderBottom: '1px solid #e2e5e8' }}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: '#7fb8a4' }}>MO</div>
          <div className="flex-1">
            <div className="text-[15px] font-medium" style={{ color: ZAP.texto }}>Marcos Oliveira</div>
            <div className="text-xs" style={{ color: ZAP.suave }}>online</div>
          </div>
          <Search className="h-5 w-5" style={{ color: ZAP.icone }} />
          <MoreVertical className="h-5 w-5" style={{ color: ZAP.icone }} />
        </div>

        {/* mensagens */}
        <div
          className="relative flex flex-1 flex-col justify-end gap-2 px-16 py-6"
          style={{
            background: ZAP.fundo,
            backgroundImage: 'radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
        >
          <div className="self-center rounded-md px-3 py-1 text-xs shadow-sm" style={{ background: '#fff', color: ZAP.suave }}>HOJE</div>
          {enviada && (
            <div className="max-w-[62%] self-end rounded-lg px-3 py-2 text-[14px] leading-snug shadow-sm" style={{ background: ZAP.meu, color: ZAP.texto, ...entrada(f, c.enviarZap + ms(40), 0, { deslocY: 16, duracaoMs: 360 }) }}>
              {texto}
              <div className="mt-1 text-right text-[11px]" style={{ color: ZAP.suave }}>
                15:41 <span style={{ color: '#53bdeb' }}>✓✓</span>
              </div>
            </div>
          )}
        </div>

        {/* caixa de texto, já preenchida pelo link */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ background: ZAP.cabecalho }}>
          <Smile className="h-6 w-6" style={{ color: ZAP.icone }} />
          <Paperclip className="h-6 w-6" style={{ color: ZAP.icone }} />
          <div className="flex-1 rounded-lg bg-white px-4 py-2.5 text-[14px] leading-snug" style={{ color: enviada ? ZAP.suave : ZAP.texto, minHeight: 42 }}>
            {enviada ? 'Digite uma mensagem' : texto}
          </div>
          <span data-alvo="zap-enviar" className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: enviada ? 'transparent' : ZAP.verde, scale: String(aperto(f, c.enviarZap)) }}>
            <SendHorizontal className="h-5 w-5" style={{ color: enviada ? ZAP.icone : '#fff' }} />
          </span>
        </div>
      </div>
    </div>
  );
};
