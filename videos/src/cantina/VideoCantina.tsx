// «A cantina no Gestão de Acordos» — vídeo para apresentar à cantina
// (26/10/2026). Sem voz: quem explica são as manchetes e os balões. Mesmo
// estilo do vídeo do Pix (tema claro, telas com as classes do app).
//
// Roteiro (tempos em `tempos.ts`):
//   1. A aba nova: o cursor clica em Cantina no menu; o cardápio abre sem fotos.
//   2. As fotos: cada card ganha a sua foto; a vitrine abre no cabeçalho e gira.
//   3. O pedido: dois lanches, o horário de retirada, a confirmação com as regras.
//   4. Acompanhar: o pedido aberto, em «Recebido».
//   5. O painel da cantina (a janela vira): o pedido chega, Preparar → Pronto →
//      Entregue; num canto, a tela de quem pediu acompanha ao vivo.
//   6. Fechamento: o que a cantina ganhou.

import { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { BellRing, ChefHat, Clock, Images, Lock, MousePointerClick, RadioTower, RotateCw, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_A, APP_L, BARRA_NAV, ESCALA_JANELA, JANELA, JANELA_A } from '../app/layout';
import { Dashboard } from '../app/paginas/Dashboard';
import { PessoaContext } from '../app/pessoa';
import { tempoApp } from '../app/roteiro';
import { Manchete } from '../cenas/Manchete';
import { Cursor, type PontoCursor } from '../componentes/Cursor';
import { Fundo } from '../componentes/Fundo';
import { ACELERA, entrada, entre, mola, ms } from '../movimento';
import { COR, FONTE, GRADIENTE_MARCA, SOMBRA_FLUTUA } from '../tema';
import { cameraEm, enquadra, GERAL, type Camera } from './camera';
import { CascaCantina, MENU_QUEM_ATENDE, MENU_QUEM_PEDE } from './CascaCantina';
import { BALCAO, COLABORADORA, PEDIDO_NOVO, reais } from './dados';
import {
  BTN_CONFIRMAR, BTN_EXPORTAR, BTN_REVISAR, CARD_A, DIALOGO, ESQ_L, FAIXAS_BOX, HERO, LINHA_TEMPO, MENU_CANTINA, PRODUCAO,
  ROLA, VITRINE, X0, btnAdicionar, card, cartLinha, centro, faixa, noApp, rolagemEm, topoCarrinho, CART, CARRINHO_A,
  CARRINHO_L, CARRINHO_X, type Ret,
} from './geo';
import { LinhaDoTempo, SeloStatus, type Status } from './pecas';
import { SobreCardapio, TelaCardapio } from './TelaCardapio';
import { botaoDoNovo, cartaoDoNovo, TelaPainel } from './TelaPainel';
import { Baloes, Etapas, Realces, type Dica } from './Tutorial';
import { MUDA, T } from './tempos';

export const TOTAL_CANTINA = T.total;

/**
 * O tema claro inteiro (fundo, janela, fechamento) ficou claro demais na tela
 * (Cleber, 26/10/2026): o vídeo todo sai um pouco mais escuro, com um tiquinho
 * de contraste para o texto continuar nítido.
 */
const BRILHO = 'brightness(0.9) contrast(1.04)';

/** O painel do vídeo de apresentação reage aos tempos daquele roteiro; aqui ele é só a página de fundo. */
function congelar<V>(v: V): V {
  if (typeof v === 'number') return 1e9 as V;
  if (Array.isArray(v)) return v.map(congelar) as V;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, congelar(x)])) as V;
  return v;
}

/** Peças que acompanham o carrinho (sticky) e a rolagem da página. */
const noCarrinho = (r: Ret, rol: number): Ret => noApp({ ...r, y: r.y + topoCarrinho(rol) - CART.topo }, rol);
const CARRINHO_RET: Ret = { x: CARRINHO_X, y: CART.topo, l: CARRINHO_L, a: CARRINHO_A };
const FILEIRA_1: Ret = { x: X0, y: card(0).y, l: ESQ_L, a: CARD_A };
const DUAS_FILEIRAS: Ret = { x: X0, y: card(0).y, l: ESQ_L, a: 2 * CARD_A + 16 };
const QUADRO: Ret = { x: X0, y: 10, l: 1312, a: 720 };

// ── a câmera ────────────────────────────────────────────────────────────
const CHAVES: Camera[] = [
  { f: 0, ...GERAL, durMs: 1 },
  // o menu, onde fica a Cantina
  { f: T.cursorAparece + ms(700), ...enquadra({ x: 0, y: MENU_CANTINA.y - 200, l: 760, a: 340 }, 20, 1.45), durMs: 800 },
  { f: T.tela + ms(700), ...GERAL, durMs: 800 },
  // as fotos entrando nos cards
  { f: T.fotos + ms(1100), ...enquadra(noApp(DUAS_FILEIRAS, ROLA), 30, 1.25), durMs: 900 },
  { f: T.sobe + ms(900), ...GERAL, durMs: 800 },
  // a vitrine
  { f: T.vitrine + ms(1000), ...enquadra(noApp(HERO), 20, 1.6), durMs: 900 },
  { f: T.pedido + ms(900), ...GERAL, durMs: 900 },
  // o carrinho: horário e revisar
  { f: T.cliqueHora - ms(250), ...enquadra(noCarrinho(CARRINHO_RET, ROLA), 30, 1.45), durMs: 800 },
  // o diálogo de confirmação
  { f: MUDA.revisar + ms(600), ...enquadra(DIALOGO, 40, 1.45), durMs: 700 },
  { f: T.enviado + ms(500), ...GERAL, durMs: 700 },
  { f: T.enviado + ms(2000), ...enquadra({ x: 1600 - 520, y: 0, l: 520, a: 520 }, 10, 1.35), durMs: 800 },
  // o painel
  { f: T.painel, ...GERAL, durMs: 400 },
  { f: T.chega + ms(900), ...enquadra(noApp(QUADRO), 16, 1.15), durMs: 900 },
  { f: T.exportar + ms(300), ...enquadra(noApp({ x: X0 + 660, y: 10, l: 652, a: 180 }), 20, 1.6), durMs: 800 },
  { f: T.fim + ms(100), ...GERAL, durMs: 700 },
];
const camEm = (f: number) => cameraEm(f, CHAVES);

// ── o tutorial ──────────────────────────────────────────────────────────
const fixo = (r: Ret) => () => r;
const rolando = (r: Ret) => (f: number) => noApp(r, rolagemEm(f));
const doCarrinho = (r: Ret) => (f: number) => noCarrinho(r, rolagemEm(f));

const DICAS: Dica[] = [
  // 1. o cardápio
  { de: T.tela + ms(800), ate: T.tela + ms(2700), alvo: rolando(FILEIRA_1), lado: 'cima', selo: '1', titulo: 'O cardápio inteiro', texto: 'Cada item com preço, ingredientes e o horário em que dá para pedir.', largura: 520, distancia: 40 },
  { de: T.tela + ms(2900), ate: T.fotos - ms(100), alvo: rolando(CARRINHO_RET), lado: 'esquerda', selo: '2', titulo: 'O pedido ao lado', texto: 'É só ir adicionando: o carrinho soma tudo sozinho.', largura: 420, distancia: 40 },
  // 2. as fotos
  { de: T.fotosEntram + ms(500), ate: T.sobe - ms(100), alvo: rolando(DUAS_FILEIRAS), lado: 'direita', titulo: 'Cada item com a sua foto', texto: 'Vocês escolhem as melhores fotos de cada produto. (Aqui, fotos de exemplo.)', largura: 440, distancia: 36 },
  { de: T.vitrine + ms(1100), ate: T.pedido - ms(200), alvo: rolando(VITRINE), lado: 'baixo', titulo: 'Vitrine no topo da aba', texto: 'As fotos trocam sozinhas, mostrando o que dá para pedir agora.', largura: 520, distancia: 40 },
  // 3. o pedido
  { de: MUDA.egg + ms(250), ate: T.cliqueHora - ms(250), alvo: doCarrinho({ x: cartLinha(0).x, y: cartLinha(0).y, l: cartLinha(0).l, a: 2 * CART.linha + 8 }), lado: 'esquerda', selo: '1', titulo: 'No carrinho', texto: 'Um clique em Adicionar e o lanche já está no pedido.', largura: 400, distancia: 44 },
  { de: MUDA.hora + ms(150), ate: T.cliqueRevisar - ms(120), alvo: doCarrinho(FAIXAS_BOX), lado: 'esquerda', selo: '2', titulo: 'Hora de retirar', texto: 'Em faixas de 15 minutos: a cantina sabe quando cada pedido sai.', largura: 420, distancia: 44 },
  { de: MUDA.revisar + ms(700), ate: T.cliqueConfirmar - ms(150), alvo: fixo({ x: DIALOGO.x + 24, y: DIALOGO.y + 222, l: DIALOGO.l - 48, a: 84 }), lado: 'direita', selo: '3', titulo: 'As regras, antes de confirmar', texto: 'Desconto em folha, não retirado é cobrado e o prazo para cancelar.', largura: 420, distancia: 60 },
  // 4. acompanhar
  { de: T.enviado + ms(2200), ate: T.painel - ms(500), alvo: fixo(LINHA_TEMPO), lado: 'esquerda', titulo: 'Acompanhe cada etapa', texto: 'Recebido, preparando, pronto: quem pediu vê tudo ao vivo.', largura: 420, distancia: 40 },
  // 5. o painel
  { de: T.chega + ms(1000), ate: T.cliquePreparar - ms(150), alvo: () => noApp(cartaoDoNovo(1)), lado: 'direita', selo: '1', titulo: 'Chegou pedido', texto: 'Ele pisca, com som de aviso, até alguém da cantina mexer nele.', largura: 420, distancia: 40 },
  { de: MUDA.preparando + ms(500), ate: T.cliquePronto - ms(150), alvo: fixo(noApp(PRODUCAO)), lado: 'baixo', selo: '2', titulo: 'O que adiantar', texto: 'Os lanches dos próximos 30 minutos, já somados para a cozinha.', largura: 480, distancia: 36, desvio: 160 },
  { de: MUDA.pronto + ms(400), ate: T.cliqueEntregue - ms(150), alvo: () => noApp(cartaoDoNovo(3)), lado: 'esquerda', selo: '3', titulo: 'Um botão por etapa', texto: 'Preparar, Pronto, Entregue. Quem pediu é avisado na hora.', largura: 400, distancia: 40 },
  { de: T.exportar + ms(500), ate: T.fim - ms(100), alvo: fixo(noApp(BTN_EXPORTAR)), lado: 'baixo', titulo: 'Fechou o mês?', texto: 'Uma planilha com todos os pedidos, pronta para o desconto em folha.', largura: 460, distancia: 40, desvio: -120 },
];

// ── o cursor ────────────────────────────────────────────────────────────
const ANTES = ms(120);
const clica = (p: { x: number; y: number }, f: number, viagemMs = 700): PontoCursor => ({ f: f - ANTES, x: p.x, y: p.y, viagemMs });

function rotaQuemPede() {
  const em = (r: Ret) => centro(noApp(r, ROLA));
  const pontos: PontoCursor[] = [
    { f: T.cursorAparece, x: 900, y: 520 },
    clica(centro(MENU_CANTINA), T.cliqueMenu, 1000),
    { f: T.tela + ms(900), x: 1000, y: 640, viagemMs: 800 },
    { f: T.pedido + ms(1100), x: 760, y: 560, viagemMs: 800 },
    clica(em(btnAdicionar(0)), T.cliqueSalada, 800),
    clica(em(btnAdicionar(3)), T.cliqueEgg, 800),
    clica(centro(noCarrinho(faixa(1), ROLA)), T.cliqueHora, 900),
    clica(centro(noCarrinho(BTN_REVISAR, ROLA)), T.cliqueRevisar, 700),
    clica(centro(BTN_CONFIRMAR), T.cliqueConfirmar, 1000),
    { f: T.enviado + ms(900), x: 820, y: 640, viagemMs: 700 },
  ];
  return { pontos, cliques: [T.cliqueMenu, T.cliqueSalada, T.cliqueEgg, T.cliqueHora, T.cliqueRevisar, T.cliqueConfirmar] };
}

function rotaQuemAtende() {
  const pontos: PontoCursor[] = [
    { f: T.chega + ms(400), x: 1000, y: 700 },
    clica(centro(noApp(botaoDoNovo(1))), T.cliquePreparar, 1000),
    clica(centro(noApp(botaoDoNovo(2))), T.cliquePronto, 1000),
    clica(centro(noApp(botaoDoNovo(3))), T.cliqueEntregue, 1000),
    { f: T.exportar + ms(500), ...centro(noApp(BTN_EXPORTAR)), viagemMs: 900 },
  ];
  return { pontos, cliques: [T.cliquePreparar, T.cliquePronto, T.cliqueEntregue] };
}

// ── a janela com o sistema ──────────────────────────────────────────────
const Sistema: React.FC = () => {
  const f = useCurrentFrame();
  const t = useMemo(() => congelar(tempoApp()), []);
  const pede = useMemo(rotaQuemPede, []);
  const atende = useMemo(rotaQuemAtende, []);
  const cam = camEm(f);
  const rolagem = rolagemEm(f);

  const entra = mola(f, T.janela, { mass: 1, stiffness: 120, damping: 20, overshootClamping: false });
  const sai = entre(f, T.fim + ms(150), T.fechamento + ms(250), 0, 1, ACELERA);
  if (sai >= 1) return null;

  // A janela vira para o outro lado do balcão.
  const ladoAtende = f >= T.painel;
  const giro = ladoAtende ? -90 * (1 - entre(f, T.painel, T.painel + ms(380), 0, 1)) : 90 * entre(f, T.painel - ms(380), T.painel, 0, 1, ACELERA);
  const naCantina = f >= T.tela;

  return (
    <div style={{ position: 'absolute', inset: 0, perspective: 2400 }}>
      <div
        style={{
          position: 'absolute', left: JANELA.x, top: JANELA.y, width: JANELA.l, height: JANELA_A,
          borderRadius: 14, overflow: 'hidden', background: '#ffffff', boxShadow: SOMBRA_FLUTUA,
          opacity: Math.min(1, entra * 1.4) * (1 - sai),
          transform: `translateY(${(1 - entra) * 60}px) scale(${(0.94 + 0.06 * entra) * (1 - 0.08 * sai)}) rotateY(${giro}deg)`,
          filter: sai > 0 ? `blur(${sai * 6}px)` : undefined,
        }}
      >
        <div className="font-sans" style={{ position: 'absolute', left: 0, top: 0, width: JANELA.l, height: BARRA_NAV, background: '#e9edf1', borderBottom: '1px solid #d7dde3', display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {['#ff5f57', '#febc2e', '#28c840'].map((cor) => <div key={cor} style={{ width: 12, height: 12, borderRadius: 6, background: cor }} />)}
          </div>
          <RotateCw size={14} color="#7b8794" />
          <div style={{ margin: '0 auto', transform: 'translateX(-40px)', width: 460, height: 24, borderRadius: 7, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5, color: '#4b5865' }}>
            <Lock size={11} /> gestaodeacordos.com.br/{ladoAtende ? 'cantina/painel' : naCantina ? 'cantina' : 'dashboard'}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 0, top: BARRA_NAV, width: APP_L, height: APP_A, transform: `scale(${ESCALA_JANELA})`, transformOrigin: '0 0', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: APP_L, height: APP_A, transform: `translate(${APP_L / 2 - cam.x * cam.z}px, ${APP_A / 2 - cam.y * cam.z}px) scale(${cam.z})`, transformOrigin: '0 0' }}>
            {ladoAtende ? (
              <PessoaContext.Provider value={BALCAO}>
                <CascaCantina
                  pessoa={BALCAO} menu={MENU_QUEM_ATENDE} logo="marca/app-512.png"
                  aparece={T.painel} ativo="painel" anterior="painel" trocaEm={0} cliques={[]}
                >
                  <TelaPainel entra={T.painel + ms(150)} />
                </CascaCantina>
                <Cursor pontos={atende.pontos} cliques={atende.cliques} escalaInversa={1 / cam.z / ESCALA_JANELA} visivelDe={T.chega + ms(400)} visivelAte={T.fim} />
              </PessoaContext.Provider>
            ) : (
              <PessoaContext.Provider value={COLABORADORA}>
                <CascaCantina
                  pessoa={COLABORADORA} menu={MENU_QUEM_PEDE} logo="marca/logo-bookplay.png"
                  aparece={T.janela + ms(150)} ativo={naCantina ? 'cantina' : 'dashboard'} anterior="dashboard" trocaEm={T.cliqueMenu}
                  cliques={[{ id: 'menu-cantina', f: T.cliqueMenu }]}
                  sobre={naCantina ? <SobreCardapio /> : undefined}
                >
                  {!naCantina && <Dashboard t={t} entra={T.janela + ms(250)} visita={1} />}
                  {naCantina && <TelaCardapio rolagem={rolagem} />}
                </CascaCantina>
                <Cursor pontos={pede.pontos} cliques={pede.cliques} escalaInversa={1 / cam.z / ESCALA_JANELA} visivelDe={T.cursorAparece} visivelAte={T.painel - ms(400)} />
              </PessoaContext.Provider>
            )}
            <Realces dicas={DICAS} />
          </div>
        </div>
      </div>
    </div>
  );
};

// ── no canto: a tela de quem pediu, ao vivo ─────────────────────────────
function statusEm(f: number): Status {
  if (f >= MUDA.entregue) return 'retirado';
  if (f >= MUDA.pronto) return 'pronto';
  if (f >= MUDA.preparando) return 'preparando';
  return 'novo';
}

const AoVivo: React.FC = () => {
  const f = useCurrentFrame();
  const de = T.chega + ms(200);
  if (f < de) return null;
  const k = mola(f, de, { mass: 1, stiffness: 150, damping: 20, overshootClamping: false });
  const some = entre(f, T.exportar, T.exportar + ms(300), 0, 1, ACELERA);
  if (some >= 1) return null;
  const status = statusEm(f);
  const pronto = status === 'pronto';
  const troca = [MUDA.preparando, MUDA.pronto, MUDA.entregue].filter((m) => f >= m).pop();
  const pisca = troca !== undefined ? 1 - entre(f, troca, troca + ms(700), 0, 1) : 0;
  const pulso = (f / 60 / 1.4) % 1;
  return (
    <div style={{ position: 'absolute', right: 40, bottom: 44, width: 300, transform: `translateY(${(1 - k) * 40}px) scale(1.35)`, transformOrigin: '100% 100%', opacity: Math.min(1, k * 1.5) * (1 - some), fontFamily: FONTE }}>
      <div className="font-sans rounded-2xl bg-card p-3 text-foreground" style={{ boxShadow: SOMBRA_FLUTUA, border: '1px solid rgba(15,27,38,0.08)' }}>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" style={{ opacity: 0.4 + 0.6 * Math.abs(Math.sin(f / 18)) }} /> Na tela da Ana, ao vivo
        </p>
        <div
          className={cn('rounded-2xl border bg-card p-3', pronto && 'border-transparent bg-emerald-500/[0.06]')}
          style={{ boxShadow: pronto ? '0 0 0 2px #10b981' : pisca > 0 ? `0 0 0 ${2 + 6 * pisca}px color-mix(in oklch, var(--primary) ${Math.round(30 * pisca)}%, transparent)` : undefined }}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Pedido</p>
              <p className="text-2xl font-black leading-none tracking-tight">#{PEDIDO_NOVO.numero}</p>
            </div>
            <SeloStatus status={status} />
          </div>
          <p className="mt-2 text-sm line-clamp-1">1× X-Salada, 1× X-Egg</p>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> retirar 12:15</span>
            <strong className="text-foreground">{reais(PEDIDO_NOVO.total)}</strong>
          </div>
          {pronto && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <BellRing className="w-3.5 h-3.5" style={{ transform: `rotate(${Math.sin(f / 4) * 14}deg)` }} /> Pronto! Pode retirar no balcão.
            </p>
          )}
          <div className="mt-3"><LinhaDoTempo status={status} pulso={pulso} /></div>
        </div>
      </div>
    </div>
  );
};

// ── fechamento ──────────────────────────────────────────────────────────
const MAPA = [
  { Icone: Images, titulo: 'Cardápio com fotos', texto: 'Cada item com a foto que vocês escolherem', cor: '#f59e0b' },
  { Icone: MousePointerClick, titulo: 'Pedido em poucos cliques', texto: 'Itens, horário de retirada e confirmação', cor: 'var(--primary)' },
  { Icone: RadioTower, titulo: 'Acompanhamento ao vivo', texto: 'Quem pediu vê cada etapa na hora', cor: 'var(--success)' },
  { Icone: ChefHat, titulo: 'Painel da cantina', texto: 'A fila do dia, um botão por etapa', cor: '#ea580c' },
];

const Fechamento: React.FC = () => {
  const f = useCurrentFrame();
  if (f < T.fechamento) return null;
  const icone = mola(f, T.fechamento + ms(2300));
  const apaga = entre(f, T.total - ms(700), T.total - 1, 0, 1);
  const titulo = 'A cantina, agora no'.split(' ');
  return (
    <AbsoluteFill style={{ fontFamily: FONTE, alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: 140, fontSize: 62, fontWeight: 800, letterSpacing: -1.6, color: COR.texto }}>
        {titulo.map((p, i) => (
          <span key={i} style={{ display: 'inline-block', marginRight: 18, ...entrada(f, T.fechamento + ms(100), i, { passoMs: 70, deslocY: 24, duracaoMs: 520 }) }}>{p}</span>
        ))}
        <span style={{ display: 'inline-block', background: GRADIENTE_MARCA, WebkitBackgroundClip: 'text', color: 'transparent', ...entrada(f, T.fechamento + ms(100), titulo.length, { passoMs: 70, deslocY: 24, duracaoMs: 520 }) }}>Gestão de Acordos</span>
      </div>

      <div style={{ position: 'absolute', top: 255, display: 'flex', alignItems: 'center', gap: 12, fontSize: 26, fontWeight: 600, color: COR.textoSuave, ...entrada(f, T.fechamento + ms(500), 0, { deslocY: 14, duracaoMs: 520 }) }}>
        <UtensilsCrossed size={26} color="var(--primary)" /> Para pedir, acompanhar e entregar — sem papel e sem fila.
      </div>

      <div style={{ position: 'absolute', top: 350, display: 'grid', gridTemplateColumns: 'repeat(2, 620px)', gap: 22 }}>
        {MAPA.map((m, i) => {
          const k = mola(f, T.fechamento + ms(800 + i * 260));
          return (
            <div
              key={m.titulo}
              style={{
                display: 'flex', alignItems: 'center', gap: 18, padding: '20px 24px', borderRadius: 22, background: '#ffffff',
                boxShadow: SOMBRA_FLUTUA, border: '1px solid rgba(15,27,38,0.07)',
                transform: `translateY(${(1 - k) * 30}px) scale(${0.92 + 0.08 * k})`, opacity: Math.min(1, k * 1.5),
              }}
            >
              <span style={{ width: 58, height: 58, borderRadius: 16, background: m.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                <m.Icone size={30} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: COR.texto, letterSpacing: -0.5 }}>{m.titulo}</div>
                <div style={{ marginTop: 2, fontSize: 20, fontWeight: 500, color: COR.textoSuave }}>{m.texto}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ position: 'absolute', top: 660, fontSize: 23, fontWeight: 500, color: COR.textoSuave, ...entrada(f, T.fechamento + ms(1900), 0, { deslocY: 14, duracaoMs: 560 }) }}>
        Só o acompanhamento dos pedidos: <strong style={{ color: COR.texto }}>caixa, estoque e pagamentos continuam como hoje.</strong>
      </div>

      <div style={{ position: 'absolute', top: 760, display: 'flex', alignItems: 'center', gap: 18, transform: `scale(${0.6 + 0.4 * icone})`, opacity: Math.min(1, icone * 1.6) }}>
        <div style={{ width: 84, height: 84, borderRadius: 22, overflow: 'hidden', boxShadow: '0 16px 36px rgba(15,27,38,0.18)' }}>
          <Img src={staticFile('marca/app-512.png')} style={{ width: '100%', height: '100%' }} />
        </div>
        <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1, color: COR.texto }}>Gestão de Acordos</span>
      </div>

      <AbsoluteFill style={{ background: '#ffffff', opacity: apaga }} />
    </AbsoluteFill>
  );
};

// ── som ─────────────────────────────────────────────────────────────────
type Efeito = { arquivo: string; em: number; volume: number };

const Trilha: React.FC = () => {
  const efeitos: Efeito[] = [
    { arquivo: 'whoosh.wav', em: 2, volume: 0.22 },
    ...[...rotaQuemPede().cliques, ...rotaQuemAtende().cliques].map((em) => ({ arquivo: 'clique.wav', em, volume: 0.42 })),
    { arquivo: 'whoosh.wav', em: T.tela, volume: 0.16 },
    { arquivo: 'whoosh.wav', em: T.fotos, volume: 0.1 },
    ...Array.from({ length: 6 }, (_, i) => ({ arquivo: 'pop.wav', em: T.fotosEntram + ms(170 * i), volume: 0.12 })),
    { arquivo: 'whoosh.wav', em: T.sobe, volume: 0.1 },
    { arquivo: 'succao.wav', em: T.vitrine, volume: 0.2 },
    { arquivo: 'whoosh.wav', em: T.pedido, volume: 0.1 },
    { arquivo: 'pop.wav', em: MUDA.salada, volume: 0.22 },
    { arquivo: 'pop.wav', em: MUDA.egg, volume: 0.22 },
    { arquivo: 'pop.wav', em: MUDA.revisar, volume: 0.18 },
    { arquivo: 'ding.wav', em: T.enviado, volume: 0.34 },
    { arquivo: 'whoosh.wav', em: T.painel - ms(380), volume: 0.4 },
    { arquivo: 'notificacao.mp3', em: T.chega, volume: 0.5 },
    { arquivo: 'pop.wav', em: MUDA.preparando, volume: 0.2 },
    { arquivo: 'ding.wav', em: MUDA.pronto, volume: 0.34 },
    { arquivo: 'pop.wav', em: MUDA.entregue, volume: 0.2 },
    { arquivo: 'whoosh.wav', em: T.fim + ms(120), volume: 0.3 },
    ...MAPA.map((_, i) => ({ arquivo: 'pop.wav', em: T.fechamento + ms(800 + i * 260), volume: 0.22 })),
    { arquivo: 'impacto.wav', em: T.fechamento + ms(2300), volume: 0.34 },
    ...DICAS.map((d) => ({ arquivo: 'pop.wav', em: d.de, volume: 0.13 })),
  ];
  return (
    <>
      {efeitos.map((e, i) => (
        <Sequence key={i} from={Math.max(0, e.em)} name={e.arquivo}>
          <Audio src={staticFile(`sons/${e.arquivo}`)} volume={e.volume} />
        </Sequence>
      ))}
    </>
  );
};

export const VideoCantina: React.FC = () => {
  const manchetes = [
    { de: ms(250), ate: T.tela + ms(800), texto: 'A cantina ganhou *uma aba nova*' },
    { de: T.tela + ms(800), ate: T.fotos, texto: 'O cardápio, *do jeito da cantina*' },
    { de: T.fotos, ate: T.vitrine, texto: 'Personalize com *as melhores fotos*' },
    { de: T.vitrine, ate: T.pedido, texto: 'Uma vitrine que *abre o apetite*' },
    { de: T.pedido, ate: T.enviado, texto: 'Pedir leva *poucos cliques*' },
    { de: T.enviado, ate: T.painel - ms(300), texto: 'E dá para *acompanhar ao vivo*' },
    { de: T.painel, ate: T.cliquePronto, texto: 'Do outro lado: *o painel da cantina*' },
    { de: T.cliquePronto, ate: T.fim + ms(100), texto: 'Cada pedido, *do fogão ao balcão*' },
  ];
  const etapas = [
    { rotulo: 'A aba nova', de: ms(250) },
    { rotulo: 'Fotos', de: T.fotos },
    { rotulo: 'O pedido', de: T.pedido },
    { rotulo: 'Acompanhar', de: T.enviado },
    { rotulo: 'Painel da cantina', de: T.painel },
  ];
  return (
    <AbsoluteFill style={{ filter: BRILHO }}>
      <Fundo />
      <Sistema />
      <Baloes dicas={DICAS} camEm={camEm} />
      <AoVivo />
      <Manchete itens={manchetes} y={30} />
      <Etapas etapas={etapas} ate={T.fim} />
      <Fechamento />
      <Trilha />
    </AbsoluteFill>
  );
};
