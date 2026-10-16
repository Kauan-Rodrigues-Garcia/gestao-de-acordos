// O chat do líder no vídeo de autorizações: o botão antigo do canto voando
// para a bolha, o aviso de pedido novo, a lista com a conversa «Autorizações ·
// Play 3» e os cartões com aprovar e recusar — as mesmas classes de
// `components/Chat` e `components/Autorizacoes` do app.
//
// As medidas são FIXAS (alturas declaradas): o cursor mira em coordenadas
// conhecidas, sem precisar do `npm run medir`. Estão em `GEO`.

import {
  AlertTriangle, ArrowRightLeft, Ban, Check, Clock, MessageCircle, MessageSquarePlus, Minimize2, Minus,
  Search, ShieldCheck, ShieldQuestion, UserCheck, X,
} from 'lucide-react';
import { useCurrentFrame } from 'remotion';
import { cn } from '@/lib/utils';
import { APP_A, APP_L } from '../app/layout';
import { aperto, entrada, entre, mola, ms, SUAVE, SUAVE_IDA_VOLTA } from '../movimento';
import { DECIDE, T } from './tempos';

// ── geometria (coordenadas do app, 1600×874) ────────────────────────────
const JAN = { l: 720, a: 560 };
const JX = APP_L - 24 - JAN.l;
const JY = APP_A - 24 - JAN.a;
const CAB = 44;
const LISTA_L = 260;
const ABAS = 42;
const BUSCA = 42;
const LINHA = 64;
const PAINEL_CAB = 56;
const CARTAO = { a: 200, confirma: 260 };
const CARTAO_X = JX + LISTA_L + 12;
const CARTAO_L = JAN.l - LISTA_L - 24;
const PRIMEIRO_CARTAO_Y = JY + CAB + PAINEL_CAB + 12 + 28;

export const GEO = {
  janela: { x: JX, y: JY, l: JAN.l, a: JAN.a },
  bolha: { x: APP_L - 24 - 28, y: APP_A - 24 - 28 },
  /** O botão antigo: ao lado do menu (240 px + 16), embaixo. */
  dock: { x: 240 + 16, y: APP_A - 16 - 38, l: 178, a: 38 },
  linhaAutorizacoes: { x: JX + LISTA_L / 2, y: JY + CAB + ABAS + BUSCA + LINHA / 2 },
  /** Botões do primeiro cartão (o de cima). */
  recusar: { x: CARTAO_X + 12 + (CARTAO_L - 24 - 8) / 4, y: PRIMEIRO_CARTAO_Y + CARTAO.a - 12 - 17 },
  aprovar: { x: CARTAO_X + 12 + ((CARTAO_L - 24 - 8) * 3) / 4 + 8, y: PRIMEIRO_CARTAO_Y + CARTAO.a - 12 - 17 },
  /** O botão de confirmar (aprovar ou recusar) na caixa que abre. */
  confirmar: { x: CARTAO_X + 12 + ((CARTAO_L - 24 - 8) * 3) / 4 + 8, y: PRIMEIRO_CARTAO_Y + CARTAO.a - 12 - 34 + 88 - 8 - 16 },
};

// ── os pedidos (fictícios) ──────────────────────────────────────────────
type Pedido = {
  id: string; quem: string; modo: 'transferencia' | 'troca'; nr: string; cliente: string;
  valor: string; venc: string; de: string; idade: string;
};
const P1: Pedido = { id: 'p1', quem: 'Bruno Lima', modo: 'transferencia', nr: '458812', cliente: 'Maria Aparecida', valor: 'R$ 1.250,50', venc: '20/10/2026', de: 'Carla Dias', idade: 'agora' };
const P2: Pedido = { id: 'p2', quem: 'Diego Reis', modo: 'troca', nr: '771200', cliente: 'João Pedro', valor: 'R$ 380,00', venc: '18/10/2026', de: 'Elisa Santos', idade: 'há 2 min' };

// ── peças ───────────────────────────────────────────────────────────────
const Escudo: React.FC<{ tamanho: number; alerta: boolean; pulso?: number }> = ({ tamanho, alerta, pulso = 0 }) => (
  <span
    className="relative flex shrink-0 items-center justify-center rounded-full text-white"
    style={{
      width: tamanho, height: tamanho,
      background: alerta
        ? 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'
        : 'linear-gradient(135deg, var(--primary) 0%, color-mix(in oklch, var(--primary) 70%, #000) 100%)',
    }}
  >
    {alerta && (
      <span
        className="absolute rounded-full border-2 border-amber-500"
        style={{ inset: -4 - 6 * pulso, opacity: 0.7 * (1 - pulso) }}
      />
    )}
    <ShieldCheck style={{ width: tamanho * 0.5, height: tamanho * 0.5 }} />
  </span>
);

const IconeChat: React.FC = () => (
  <svg viewBox="0 0 32 32" className="w-[26px] h-[26px]">
    <path d="M6 4h20a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H13.6l-5.3 4.7A1 1 0 0 1 6.6 27v-4H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    <circle cx="11" cy="13.5" r="1.9" fill="currentColor" />
    <circle cx="16" cy="13.5" r="1.9" fill="currentColor" />
    <circle cx="21" cy="13.5" r="1.9" fill="currentColor" />
  </svg>
);

const Avatar: React.FC<{ nome: string; tamanho?: number }> = ({ nome, tamanho = 40 }) => (
  <div className="rounded-full bg-muted flex items-center justify-center font-semibold text-muted-foreground shrink-0" style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.34 }}>
    {nome.split(' ').slice(0, 2).map((p) => p[0]).join('')}
  </div>
);

/** Um pulso que se repete (0→1) a cada `periodo` frames. */
const pulso = (f: number, periodo = 87) => ((f % periodo) + periodo) % periodo / periodo;

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="text-[11px] font-medium truncate">{valor}</p>
    </div>
  );
}

type Fase = 'normal' | 'confirmar' | 'recusar' | 'aprovado' | 'recusado';

const Cartao: React.FC<{ p: Pedido; fase: Fase; cliques: { aprovar?: number; recusar?: number; confirmar?: number }; f: number }> = ({ p, fase, cliques, f }) => {
  const troca = p.modo === 'troca';
  const decidido = fase === 'aprovado' || fase === 'recusado';
  const caixa = fase === 'confirmar' || fase === 'recusar';
  return (
    <div
      className={cn('relative rounded-xl border p-3 overflow-hidden', decidido ? 'border-border/60 bg-muted/30' : 'border-border bg-card')}
      style={{ height: caixa ? CARTAO.confirma : CARTAO.a, width: CARTAO_L }}
    >
      <div className="flex items-start justify-between gap-2" style={{ height: 40 }}>
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate">
            {p.quem}<span className="font-normal text-muted-foreground"> quer registrar</span>
          </p>
          <p className="text-sm font-mono font-bold truncate">NR {p.nr}</p>
        </div>
        <span className={cn('shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide', troca ? 'bg-amber-500/15 text-amber-600' : 'bg-destructive/15 text-destructive')}>
          {troca ? <ArrowRightLeft className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
          {troca ? 'troca extra' : 'transferência'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2" style={{ height: 64 }}>
        <Campo rotulo="Cliente" valor={p.cliente} />
        <Campo rotulo="Valor" valor={p.valor} />
        <Campo rotulo="Vencimento" valor={p.venc} />
        <Campo rotulo={troca ? 'EXTRA hoje de' : 'Hoje é de'} valor={p.de} />
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-2" style={{ height: 16 }}>
        <Clock className="w-3 h-3 shrink-0" /> {p.idade} · Play 3
      </div>

      {/* ações, sempre no pé do cartão */}
      <div className="absolute left-3 right-3" style={{ top: CARTAO.a - 12 - 34 }}>
        {fase === 'normal' && (
          <div className="flex gap-2">
            <span className="flex-1 h-[34px] rounded-lg border border-border text-[11px] font-medium flex items-center justify-center"
              style={{ scale: String(cliques.recusar ? aperto(f, cliques.recusar) : 1) }}>Recusar</span>
            <span className="flex-1 h-[34px] rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center"
              style={{ scale: String(cliques.aprovar ? aperto(f, cliques.aprovar) : 1) }}>Aprovar</span>
          </div>
        )}
        {fase === 'confirmar' && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2" style={{ height: 88, ...entrada(f, cliques.aprovar ?? 0, 0, { deslocY: 8, duracaoMs: 300 }) }}>
            <p className="text-[11px] flex items-start gap-1.5" style={{ height: 32 }}>
              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              <span><strong className="text-destructive">Não tem como desfazer.</strong> O acordo de <strong>{p.de}</strong> vai para a lixeira e o NR passa para <strong>{p.quem}</strong>.</span>
            </p>
            <div className="flex gap-2 mt-2">
              <span className="flex-1 h-8 rounded-lg border border-border bg-background text-[11px] font-medium flex items-center justify-center">Voltar</span>
              <span className="flex-1 h-8 rounded-lg bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center gap-1.5"
                style={{ scale: String(cliques.confirmar ? aperto(f, cliques.confirmar) : 1) }}>
                <Check className="w-3.5 h-3.5" /> Confirmar autorização
              </span>
            </div>
          </div>
        )}
        {fase === 'recusar' && (
          <div className="rounded-lg border border-border bg-muted/40 p-2" style={{ height: 88, ...entrada(f, cliques.recusar ?? 0, 0, { deslocY: 8, duracaoMs: 300 }) }}>
            <div className="w-full h-8 rounded-md border border-border bg-background px-2 text-[11px] flex items-center text-muted-foreground">
              Motivo (opcional) — o operador vai ler
            </div>
            <div className="flex gap-2 mt-2">
              <span className="flex-1 h-8 rounded-lg border border-border bg-background text-[11px] font-medium flex items-center justify-center">Voltar</span>
              <span className="flex-1 h-8 rounded-lg bg-foreground text-background text-[11px] font-bold flex items-center justify-center gap-1.5"
                style={{ scale: String(cliques.confirmar ? aperto(f, cliques.confirmar) : 1) }}>
                <Ban className="w-3.5 h-3.5" /> Recusar
              </span>
            </div>
          </div>
        )}
        {decidido && (
          <div className="rounded-lg bg-muted/50 px-2 flex items-center" style={{ height: 34 }}>
            <p className="text-[11px]">
              {fase === 'aprovado' ? <strong className="text-success">Autorizado</strong> : <strong className="text-destructive">Recusado</strong>}
              {' '}por <strong>Carlos Mendes</strong> · agora
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ── o chat ──────────────────────────────────────────────────────────────
export const ChatAutorizacoes: React.FC = () => {
  const f = useCurrentFrame();

  // quantos pedidos esperando
  const pendentes = f < T.chega ? 2 : f < DECIDE.aprovado ? 2 : f < DECIDE.recusado ? 1 : 0;

  // ── o botão antigo voando para a bolha ──
  const dockEntra = entrada(f, T.dock, 0, { deslocY: 16, duracaoMs: 500 });
  const voo = entre(f, T.voa, T.chega, 0, 1, SUAVE_IDA_VOLTA);
  const de = { x: GEO.dock.x + GEO.dock.l / 2, y: GEO.dock.y + GEO.dock.a / 2 };
  const ate = GEO.bolha;
  const arco = Math.sin(voo * Math.PI) * -150;
  const dockX = de.x + (ate.x - de.x) * voo;
  const dockY = de.y + (ate.y - de.y) * voo + arco;
  const dockEscala = 1 - 0.6 * entre(f, T.voa + ms(480), T.chega, 0, 1);
  const dockVisivel = f >= T.dock && f < T.chega;
  // a bolha engole: um soco de escala na chegada
  const soco = f >= T.chega ? 1 + 0.22 * Math.sin(entre(f, T.chega, T.chega + ms(320), 0, 1) * Math.PI) : 1;

  // ── janela do chat ──
  const abre = T.cliqueBolha + ms(80);
  const fecha = T.fim;
  const aberto = f >= abre && f < fecha + ms(260);
  const pAbre = mola(f, abre, { mass: 1, stiffness: 260, damping: 26, overshootClamping: false });
  const pFecha = entre(f, fecha, fecha + ms(260), 0, 1);
  const vendo = f >= T.cliqueLinha + ms(60);

  // ── aviso de pedido novo ──
  const aviso = f >= T.aviso && f < T.avisoSai + ms(320);
  const pAviso = mola(f, T.aviso);
  const avisoSai = entre(f, Math.min(T.avisoSai, T.cliqueBolha), Math.min(T.avisoSai, T.cliqueBolha) + ms(300), 0, 1);

  // fases dos cartões
  const fase1: Fase = f >= DECIDE.aprovado ? 'aprovado' : f >= T.cliqueAprovar + ms(40) ? 'confirmar' : 'normal';
  const fase2: Fase = f >= DECIDE.recusado ? 'recusado' : f >= T.cliqueRecusar + ms(40) ? 'recusar' : 'normal';
  // o aprovado desce para o histórico; o outro sobe
  const re = entre(f, T.reordena, T.reordena + ms(600), 0, 1, SUAVE);
  const p = pulso(f);

  const previa =
    pendentes === 0 ? 'Recusado por Carlos · NR 771200'
    : pendentes === 1 ? 'Diego pede autorização · NR 771200'
    : 'Bruno pede autorização · NR 458812 · e mais 1';

  return (
    <>
      {/* o botão antigo */}
      {dockVisivel && (
        <div
          className="absolute inline-flex items-center gap-2 rounded-full pl-3 pr-3.5 py-2 shadow-lg border bg-primary text-primary-foreground border-primary font-sans"
          style={{
            left: dockX, top: dockY, transform: `translate(-50%, -50%) scale(${dockEscala})`,
            zIndex: 48, whiteSpace: 'nowrap', opacity: (dockEntra.opacity as number) * (1 - entre(f, T.chega - ms(120), T.chega, 0, 1)),
          }}
        >
          <ShieldQuestion className="w-4 h-4" />
          <span className="text-xs font-semibold">2 autorizações</span>
          <span className="w-2 h-2 rounded-full bg-primary-foreground" style={{ opacity: 0.4 + 0.6 * Math.abs(Math.sin(f / 14)) }} />
        </div>
      )}
      {/* rastro do voo: pontinhos no mesmo caminho do botão */}
      {f >= T.voa && f < T.chega + ms(260) && Array.from({ length: 22 }, (_, k) => {
        const tk = k / 21;
        if (tk > voo) return null;
        const x = de.x + (ate.x - de.x) * tk;
        const y = de.y + (ate.y - de.y) * tk + Math.sin(tk * Math.PI) * -150;
        const some = entre(f, T.chega, T.chega + ms(260), 0, 1);
        return (
          <span key={k} className="absolute rounded-full bg-primary"
            style={{ left: x - 3, top: y - 3, width: 6, height: 6, zIndex: 47, opacity: (0.15 + 0.45 * tk) * (1 - some) }} />
        );
      })}

      {/* a bolha do chat */}
      {(!aberto || pFecha > 0.6) && (
        <div
          className="absolute w-14 h-14 rounded-2xl bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
          style={{ right: 24, bottom: 24, zIndex: 45, scale: String(soco * aperto(f, T.cliqueBolha)) }}
        >
          {pendentes > 0 && f >= T.chega && (
            <span className="absolute -inset-1 rounded-[18px] border-2 border-amber-500" style={{ opacity: 0.85 * (1 - p), scale: String(0.9 + 0.32 * p) }} />
          )}
          <IconeChat />
          {f >= T.chega && pendentes > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[11px] font-semibold flex items-center justify-center ring-2 ring-background bg-amber-500 text-white"
              style={{ scale: String(Math.min(1.15, mola(f, T.chega + ms(60)))) }}
            >
              {pendentes}
            </span>
          )}
        </div>
      )}

      {/* aviso de pedido novo (o mesmo formato do aviso de mensagem do chat) */}
      {aviso && (
        <div
          className="absolute flex w-[360px] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl font-sans"
          style={{
            right: 32, top: 32, zIndex: 90,
            opacity: Math.min(1, pAviso * 1.5) * (1 - avisoSai),
            transform: `translateX(${(1 - pAviso) * 60}px) translateY(${-avisoSai * 10}px)`,
          }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3 pr-9 text-left">
            <Escudo tamanho={42} alerta pulso={p} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">Autorizações · Play 3</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                Bruno pede autorização para registrar o NR 458812 (e mais 1)
              </span>
            </span>
          </div>
          <span className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground"><X className="h-3.5 w-3.5" /></span>
        </div>
      )}

      {/* a janela do chat */}
      {aberto && (
        <div
          className="absolute flex flex-col bg-background overflow-hidden border border-border rounded-2xl shadow-2xl font-sans"
          style={{
            left: JX, top: JY, width: JAN.l, height: JAN.a, zIndex: 46,
            opacity: Math.min(1, pAbre * 1.4) * (1 - pFecha),
            transform: `scale(${(0.9 + 0.1 * pAbre) * (1 - 0.06 * pFecha)})`,
            transformOrigin: '100% 100%',
          }}
        >
          <header className="flex items-center gap-1 border-b border-border shrink-0 px-3" style={{ height: CAB }}>
            <MessageCircle className="text-primary w-4 h-4" />
            <span className="font-semibold flex-1 text-sm">Chat</span>
            <span className="p-1.5 rounded"><Minimize2 className="w-3.5 h-3.5" /></span>
            <span className="p-1.5 rounded"><Minus className="w-3.5 h-3.5" /></span>
          </header>
          <div className="flex-1 min-h-0 flex">
            {/* lista */}
            <div className="min-h-0 min-w-0 border-r border-border shrink-0 flex flex-col" style={{ width: LISTA_L }}>
              <div className="flex shrink-0 items-center gap-1 px-2" style={{ height: ABAS }}>
                <div className="flex min-w-0 flex-1 gap-0.5 rounded-lg bg-muted/35 p-0.5">
                  {['Conversas', 'Histórico', 'Disparos'].map((a, i) => (
                    <span key={a} className={cn('min-w-0 flex-1 basis-0 truncate rounded-md px-1 py-1.5 text-[11px] font-medium text-center', i === 0 ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>{a}</span>
                  ))}
                </div>
                <span className="inline-flex items-center justify-center h-7 w-7 shrink-0"><MessageSquarePlus className="w-4 h-4" /></span>
              </div>
              <div className="px-2 shrink-0 flex items-center" style={{ height: BUSCA }}>
                <div className="relative w-full">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <div className="w-full bg-muted/60 rounded-lg pl-8 pr-2 py-1.5 text-xs text-muted-foreground">Procurar</div>
                </div>
              </div>
              {/* a conversa fixa de autorizações, no topo */}
              <div
                className={cn(
                  'w-full grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 text-left',
                  vendo ? 'bg-muted' : pendentes > 0 ? 'bg-amber-500/[0.07]' : '',
                )}
                style={{ height: LINHA, scale: String(aperto(f, T.cliqueLinha)) }}
              >
                <Escudo tamanho={40} alerta={pendentes > 0} pulso={p} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">Autorizações · Play 3</p>
                  <p className={cn('truncate text-xs', pendentes > 0 ? 'font-medium text-amber-700' : 'text-muted-foreground')}>{previa}</p>
                </div>
                <span className="flex min-w-[30px] shrink-0 flex-col items-end gap-0.5 justify-center">
                  <span className="text-[10px] text-muted-foreground">15:42</span>
                  {pendentes > 0 && (
                    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">{pendentes}</span>
                  )}
                </span>
              </div>
              {[
                { nome: 'Equipe Águia', ultimo: 'Marina: Fechei mais um! 🎯', hora: '15:10' },
                { nome: 'Marina Alves', ultimo: 'Você: Valeu, Ma!', hora: '14:02' },
                { nome: 'Diego Reis', ultimo: 'Me manda o NR depois?', hora: 'ontem' },
                { nome: 'Juliana Prado', ultimo: 'Bom dia, Carlos!', hora: 'ontem' },
              ].map((cv) => (
                <div key={cv.nome} className="w-full grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 text-left" style={{ height: LINHA }}>
                  <Avatar nome={cv.nome} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{cv.nome}</p>
                    <p className="text-xs truncate text-muted-foreground">{cv.ultimo}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{cv.hora}</span>
                </div>
              ))}
            </div>

            {/* o lado direito: vazio, ou as autorizações abertas */}
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
              {!vendo ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-xs text-muted-foreground">Escolha uma conversa</p>
                </div>
              ) : (
                <div className="flex h-full min-h-0 flex-col" style={entrada(f, T.cliqueLinha + ms(60), 0, { deslocY: 10, duracaoMs: 380 })}>
                  <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-3" style={{ height: PAINEL_CAB }}>
                    <Escudo tamanho={34} alerta={pendentes > 0} pulso={p} />
                    <p className="min-w-0 truncate text-sm font-semibold">Autorizações · Play 3</p>
                  </header>
                  <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/20">
                    {/* rótulo da fila */}
                    <p className="absolute left-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700"
                      style={{ top: 12, opacity: pendentes > 0 ? 1 : entre(f, DECIDE.recusado, DECIDE.recusado + ms(300), 1, 0) }}>
                      <span className="h-2 w-2 rounded-full bg-amber-500" style={{ opacity: 0.4 + 0.6 * Math.abs(Math.sin(f / 14)) }} />
                      {pendentes <= 1 ? '1 aguardando decisão' : '2 aguardando decisão'}
                    </p>
                    {/* «Hoje»: o histórico, quando o primeiro é decidido */}
                    {f >= T.reordena && (
                      <p className="absolute left-0 right-0 text-center" style={{
                        // decidido o último, «Hoje» sobe e passa a encabeçar os dois
                        top: 12 + 28 + CARTAO.a + 2 - (CARTAO.a + 2 + 18) * entre(f, DECIDE.recusado + ms(250), DECIDE.recusado + ms(750), 0, 1),
                        ...entrada(f, T.reordena + ms(200), 0, { deslocY: 6 }),
                      }}>
                        <span className="rounded-full bg-background px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">Hoje</span>
                      </p>
                    )}
                    {/* pedido 1: em cima até ser decidido, depois desce para o histórico */}
                    <div className="absolute left-3" style={{ top: 12 + 28 + re * (CARTAO.a + 22) }}>
                      <Cartao p={P1} fase={fase1} f={f} cliques={{ aprovar: T.cliqueAprovar, confirmar: T.cliqueConfirmar }} />
                    </div>
                    {/* pedido 2: embaixo, e sobe quando o 1 sai */}
                    <div className="absolute left-3" style={{ top: 12 + 28 + (1 - re) * (CARTAO.a + 10) + (fase1 === 'confirmar' ? CARTAO.confirma - CARTAO.a : 0) }}>
                      <Cartao p={P2} fase={fase2} f={f} cliques={{ recusar: T.cliqueRecusar, confirmar: T.cliqueRecusarConfirma }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
