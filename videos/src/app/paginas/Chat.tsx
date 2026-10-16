// O chat interno (`components/Chat`): a bolha no canto de baixo à direita e,
// clicada, a janela expandida — lista de conversas à esquerda e a conversa com
// o líder à direita.

import { MessageCircle, MessageSquarePlus, Mic, Minimize2, Minus, Paperclip, Search, Send, Smile } from 'lucide-react';
import { useCurrentFrame } from 'remotion';
import { cn } from '@/lib/utils';
import { aperto, entrada, entre, mola, ms } from '../../movimento';
import { LIDER } from '../dados';
import type { TempoApp } from '../roteiro';
import { digitado } from './Campos';

const TEXTO = 'Carlos, consegue me ajudar com uma negociação?';
const RESPOSTA = 'Claro! Já te chamo aqui 👍';

const AvatarChat: React.FC<{ nome: string; tamanho?: number; online?: boolean }> = ({ nome, tamanho = 36, online }) => {
  const iniciais = nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      <div className="rounded-full bg-muted flex items-center justify-center font-semibold text-muted-foreground w-full h-full" style={{ fontSize: Math.max(10, tamanho * 0.34) }}>
        {iniciais}
      </div>
      {online && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />}
    </div>
  );
};

const IconeChat: React.FC = () => (
  <svg viewBox="0 0 32 32" className="w-[26px] h-[26px]">
    <path d="M6 4h20a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H13.6l-5.3 4.7A1 1 0 0 1 6.6 27v-4H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    <circle cx="11" cy="13.5" r="1.9" fill="currentColor" />
    <circle cx="16" cy="13.5" r="1.9" fill="currentColor" />
    <circle cx="21" cy="13.5" r="1.9" fill="currentColor" />
  </svg>
);

const CONVERSAS = [
  { nome: LIDER.nome, ultimo: 'Bom dia, pessoal! Bora pra cima hoje 💪', hora: '09:02', online: true },
  { nome: 'Equipe Águia', ultimo: 'Marina: Fechei mais um! 🎯', hora: '10:41', grupo: true },
  { nome: 'Marina Alves', ultimo: 'Você: Valeu, Ma!', hora: 'ontem' },
  { nome: 'Diego Ramos', ultimo: 'Me manda o NR depois?', hora: 'ontem' },
];

export const Chat: React.FC<{ t: TempoApp }> = ({ t }) => {
  const f = useCurrentFrame();
  const c = t.clique;
  const abre = c.chat + ms(80);
  const fecha = t.c10.inicio + ms(120);
  const aberto = f >= abre && f < fecha + ms(220);
  const pAbre = mola(f, abre, { mass: 1, stiffness: 260, damping: 26, overshootClamping: false });
  const pFecha = entre(f, fecha, fecha + ms(220), 0, 1);

  const texto = f >= c.enviarChat ? '' : digitado(TEXTO, f, c.campoChat + ms(140), 1050);
  const enviada = f >= c.enviarChat + ms(40);
  const digitando = f >= c.enviarChat + ms(500) && f < t.respostaLider;
  const respondeu = f >= t.respostaLider;
  const foco = f >= c.campoChat && f < c.enviarChat + ms(300);

  // a bolha some quando a janela abre e volta quando fecha
  const bolhaVisivel = !aberto || pFecha > 0.6;
  const bolhaChega = entrada(f, t.c3.inicio - ms(200), 0, { deslocY: 12, duracaoMs: 500 });

  return (
    <>
      {bolhaVisivel && (
        <div
          data-alvo="chat-bolha"
          className="absolute w-14 h-14 rounded-2xl bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
          style={{ right: 24, bottom: 24, zIndex: 45, ...bolhaChega, scale: String(aperto(f, c.chat)) }}
        >
          <IconeChat />
        </div>
      )}

      {aberto && (
        <div
          data-alvo="chat-janela"
          className="absolute flex flex-col bg-background overflow-hidden border border-border rounded-2xl shadow-2xl font-sans"
          style={{
            right: 24,
            bottom: 24,
            width: 720,
            height: 560,
            zIndex: 46,
            opacity: Math.min(1, pAbre * 1.4) * (1 - pFecha),
            transform: `scale(${(0.9 + 0.1 * pAbre) * (1 - 0.06 * pFecha)})`,
            transformOrigin: '100% 100%',
          }}
        >
          <header className="flex items-center gap-1 border-b border-border shrink-0 px-3 py-2">
            <MessageCircle className="text-primary w-4 h-4" />
            <span className="font-semibold flex-1 text-sm">Chat</span>
            <span className="p-1.5 rounded"><Minimize2 className="w-3.5 h-3.5" /></span>
            <span className="p-1.5 rounded"><Minus className="w-3.5 h-3.5" /></span>
          </header>
          <div className="flex-1 min-h-0 flex">
            {/* lista */}
            <div className="min-h-0 min-w-0 w-[260px] border-r border-border shrink-0 flex flex-col">
              <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
                <div className="flex min-w-0 flex-1 gap-0.5 rounded-lg bg-muted/35 p-0.5">
                  {['Conversas', 'Histórico', 'Disparos'].map((a, i) => (
                    <span key={a} className={cn('min-w-0 flex-1 basis-0 truncate rounded-md px-1 py-1.5 text-[11px] font-medium text-center', i === 0 ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>
                      {a}
                    </span>
                  ))}
                </div>
                <span className="inline-flex items-center justify-center h-7 w-7 shrink-0"><MessageSquarePlus className="w-4 h-4" /></span>
              </div>
              <div className="px-2 py-2 shrink-0">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <div className="w-full bg-muted/60 rounded-lg pl-8 pr-2 py-1.5 text-xs text-muted-foreground">Buscar conversa</div>
                </div>
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                {CONVERSAS.map((cv, i) => {
                  const ultimo = i === 0 && respondeu ? RESPOSTA : i === 0 && enviada ? TEXTO : cv.ultimo;
                  const meu = i === 0 && enviada && !respondeu;
                  return (
                    <div key={cv.nome} className={cn('w-full grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5 text-left', i === 0 && 'bg-muted')}>
                      <AvatarChat nome={cv.nome} tamanho={40} online={cv.online} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate min-w-0">{cv.nome}</p>
                        <p className="text-xs truncate text-muted-foreground">
                          {i === 0 && digitando ? <span className="text-primary">digitando…</span> : <>{meu && <span className="opacity-60">Você: </span>}{ultimo}</>}
                        </p>
                      </div>
                      <span className="flex min-w-[30px] shrink-0 flex-col items-end gap-0.5 self-stretch justify-center">
                        <span className="text-[10px] text-muted-foreground">{i === 0 && enviada ? '15:42' : cv.hora}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* conversa */}
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
              <header className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border shrink-0">
                <AvatarChat nome={LIDER.nome} tamanho={34} online />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium leading-tight"><span className="truncate">{LIDER.nome}</span></p>
                  <p className="text-[11px] leading-tight">
                    {digitando ? <span className="text-primary">digitando…</span> : <span className="text-emerald-600">online</span>}
                  </p>
                </div>
              </header>
              <div className="flex-1 min-h-0 overflow-hidden px-3 py-3 space-y-1.5 flex flex-col justify-end">
                <div className="flex justify-center py-1">
                  <div className="max-w-[85%] rounded-full bg-muted/70 px-3 py-1 text-center text-[11px] leading-snug text-muted-foreground">Hoje</div>
                </div>
                <Balao meu={false} texto="Bom dia, pessoal! Bora pra cima hoje 💪" hora="09:02" />
                <Balao meu texto="Bom dia, Carlos! Bora! 🚀" hora="09:05" />
                {enviada && (
                  <div style={entrada(f, c.enviarChat + ms(40), 0, { deslocY: 14, duracaoMs: 380 })}>
                    <Balao meu texto={TEXTO} hora="15:42" />
                  </div>
                )}
                {respondeu && (
                  <div style={entrada(f, t.respostaLider, 0, { deslocY: 14, duracaoMs: 380 })}>
                    <Balao meu={false} texto={RESPOSTA} hora="15:42" />
                  </div>
                )}
              </div>
              <div className="border-t border-border px-2.5 py-2 space-y-2 shrink-0">
                <div className="flex items-end gap-1">
                  <span className="inline-flex items-center justify-center h-8 w-8 shrink-0"><Smile className="w-4 h-4" /></span>
                  <span className="inline-flex items-center justify-center h-8 w-8 shrink-0"><Paperclip className="w-4 h-4" /></span>
                  <div
                    data-alvo="chat-campo"
                    className={cn('flex-1 bg-muted/60 rounded-2xl px-3 py-2 text-sm min-h-[36px] flex items-center', foco && 'ring-1 ring-ring')}
                  >
                    {texto ? <span>{texto}</span> : <span className="text-muted-foreground">Mensagem</span>}
                    {foco && <span className="ml-px inline-block w-px h-4 bg-foreground" style={{ opacity: Math.floor(f / 32) % 2 === 0 ? 1 : 0 }} />}
                  </div>
                  {texto ? (
                    <span data-alvo="chat-enviar" className="inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-full bg-primary text-primary-foreground" style={{ scale: String(aperto(f, c.enviarChat)) }}>
                      <Send className="w-4 h-4" />
                    </span>
                  ) : (
                    <span data-alvo="chat-enviar" className="inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-full"><Mic className="w-4 h-4" /></span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const Balao: React.FC<{ meu: boolean; texto: string; hora: string }> = ({ meu, texto, hora }) => (
  <div className={cn('flex', meu ? 'justify-end' : 'justify-start')}>
    <div className={cn('relative max-w-[78%] rounded-2xl px-3 py-1.5 space-y-1.5', meu ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted rounded-bl-md')}>
      <p className="text-sm whitespace-pre-wrap break-words">{texto}</p>
      <p className={cn('text-[10px] leading-none text-right', meu ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
        {hora}
        {meu && <span className="ml-1">✓✓</span>}
      </p>
    </div>
  </div>
);

