// A aba Cantina de quem pede, quadro a quadro: o cabeçalho com a vitrine, o
// cardápio, o carrinho e — por cima — o diálogo de confirmação, o aviso de
// enviado e a gaveta do pedido. Mesmas classes de `src/pages/Cantina/`; as
// posições batem com `geo.ts`.

import {
  ArrowDown, CircleCheck, Clock, Lock, Megaphone, MessageCircle, MessageSquareText, Minus, Plus, Search,
  ShoppingBasket, Store, Trash2, UtensilsCrossed, X, CupSoda, Sandwich,
} from 'lucide-react';
import { Img, useCurrentFrame } from 'remotion';
import { cn } from '@/lib/utils';
import { ACELERA, aperto, entre, mola, ms } from '../movimento';
import { AVISO, FAIXAS, ITENS, VITRINE as SLIDES, reais } from './dados';
import {
  BTN_CONFIRMAR, CARD_A, CARD_IMG, CARD_L, CARRINHO_L, CARRINHO_X, CART, DIALOGO, FILTROS, GAVETA, HERO, L,
  REGRAS, VITRINE, X0, card, topoCarrinho,
} from './geo';
import { ImagemItem, LinhaDoTempo, SeloStatus, fotoDe } from './pecas';
import { MUDA, T, VITRINE_PASSO } from './tempos';

const MAX_INGREDIENTES = 4;
/** Quanto tempo o aviso de enviado fica na tela. */
const AVISO_MS = ms(1400);
const NO_CARRINHO: Record<number, number> = { 50: MUDA.salada, 59: MUDA.egg };

/** Quanto da foto do card `i` já apareceu. */
const revelaEm = (f: number, i: number) => entre(f, T.fotosEntram + ms(170 * i), T.fotosEntram + ms(170 * i + 650), 0, 1);

// ── o cabeçalho ─────────────────────────────────────────────────────────
const Vitrine: React.FC<{ f: number }> = ({ f }) => {
  const inicio = T.vitrine + ms(500);
  const passo = Math.max(0, f - inicio);
  const k = Math.floor(passo / VITRINE_PASSO);
  const dentro = passo - k * VITRINE_PASSO;
  const atual = SLIDES[k % SLIDES.length];
  const anterior = k > 0 ? SLIDES[(k - 1) % SLIDES.length] : null;
  const fade = k > 0 ? entre(dentro, 0, ms(500), 0, 1) : 1;
  const zoom = (d: number) => 1.08 - 0.08 * Math.min(1, d / (VITRINE_PASSO + ms(500)));
  const legenda = entre(dentro, ms(120), ms(420), 0, 1);
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-muted">
      {anterior && fade < 1 && (
        <Img src={fotoDe(anterior.foto)} className="absolute inset-0 h-full w-full object-cover" style={{ transform: `scale(${zoom(dentro + VITRINE_PASSO)})` }} />
      )}
      <Img src={fotoDe(atual.foto)} className="absolute inset-0 h-full w-full object-cover" style={{ opacity: fade, transform: `scale(${zoom(dentro)})` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
        <div className="min-w-0 text-white" style={{ opacity: k > 0 ? legenda : 1 }}>
          <span className="mb-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/85">Disponível agora</span>
          <p className="truncate text-lg font-bold leading-tight">{atual.nome}</p>
          <p className="text-sm font-medium text-white/85">{reais(atual.preco)}</p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 shadow-md">
          <Plus className="h-4 w-4" /> Ver no cardápio
        </span>
      </div>
      <div className="absolute inset-x-4 top-3 flex gap-1.5">
        {SLIDES.map((s, i) => {
          const atualI = k % SLIDES.length;
          const cheio = i < atualI ? 1 : i === atualI ? Math.min(1, dentro / VITRINE_PASSO) : 0;
          return (
            <span key={s.foto} className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/35">
              <span className="absolute inset-y-0 left-0 bg-white" style={{ width: `${cheio * 100}%` }} />
            </span>
          );
        })}
      </div>
    </div>
  );
};

const Cabecalho: React.FC<{ f: number }> = ({ f }) => {
  const pv = f < T.vitrine ? 0 : mola(f, T.vitrine, { mass: 1, stiffness: 120, damping: 20, overshootClamping: true });
  const larguraTexto = L - 20 - (VITRINE.l + 12) * pv;
  return (
    <div className="absolute overflow-hidden rounded-3xl border bg-card shadow-sm" style={{ left: HERO.x, top: HERO.y, width: HERO.l, height: HERO.a }}>
      <div className="absolute -left-24 -top-28 w-80 h-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute left-1/3 -bottom-32 w-72 h-72 rounded-full bg-primary/5 blur-3xl" />

      <div className="absolute flex flex-col justify-center gap-3.5 pl-8 pr-4" style={{ left: 10, top: 10, width: larguraTexto, height: HERO.a - 20 }}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UtensilsCrossed className="h-4 w-4" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cantina</span>
        </div>
        <div className="space-y-1.5">
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-foreground">
            Bom dia, Ana.
            <span className="block text-muted-foreground font-semibold">O que vai ser hoje?</span>
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">Escolha no cardápio, marque o horário e é só passar para retirar. Sem fila, sem anotar nada.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm">
            Ver o cardápio <ArrowDown className="h-4 w-4" />
          </span>
          <span className="text-sm text-muted-foreground"><strong className="font-semibold text-foreground">7</strong> itens disponíveis agora</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 bg-emerald-500/10 text-emerald-700 ring-emerald-500/25">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Aberta para pedidos
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <Clock className="w-3.5 h-3.5" /> Retiradas das 07:00 às 16:00
          </span>
        </div>
        <div className="flex max-w-2xl gap-2.5 rounded-xl border bg-muted/40 px-3 py-2.5">
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 text-[13px] leading-snug">
            <p className="font-semibold text-foreground">{AVISO.titulo}</p>
            <p className="mt-0.5 text-muted-foreground">{AVISO.texto}</p>
          </div>
        </div>
      </div>

      {pv > 0 && (
        <div
          className="absolute"
          style={{
            left: VITRINE.x - HERO.x, top: VITRINE.y - HERO.y, width: VITRINE.l, height: VITRINE.a,
            opacity: Math.min(1, pv * 1.4), transform: `translateX(${(1 - pv) * 60}px) scale(${0.96 + 0.04 * pv})`,
          }}
        >
          <Vitrine f={f} />
        </div>
      )}
    </div>
  );
};

// ── o cardápio ──────────────────────────────────────────────────────────
const Filtros: React.FC = () => (
  <div className="absolute space-y-2" style={{ left: FILTROS.x, top: FILTROS.y, width: FILTROS.l }}>
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <div className="w-full h-11 rounded-xl border bg-card pl-9 pr-3 text-sm flex items-center text-muted-foreground">Buscar no cardápio (nome, ingrediente ou número)</div>
    </div>
    <div className="flex gap-2">
      <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium bg-foreground text-background border-foreground"><Store className="w-4 h-4" /> Tudo</span>
      <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium bg-card"><Sandwich className="w-4 h-4" /> Lanches</span>
      <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium bg-card"><CupSoda className="w-4 h-4" /> Bebidas</span>
    </div>
  </div>
);

const CardItem: React.FC<{ f: number; i: number }> = ({ f, i }) => {
  const item = ITENS[i];
  const r = card(i);
  const entrouEm = NO_CARRINHO[item.codigo];
  const noCarrinho = entrouEm !== undefined && f >= entrouEm;
  const disponivel = item.bloqueio === null;
  const ingredientes = item.ingredientes.slice(0, MAX_INGREDIENTES);
  const sobra = item.ingredientes.length - ingredientes.length;
  const clique = entrouEm !== undefined ? entrouEm - 6 : -1;
  const badge = noCarrinho ? mola(f, entrouEm, { mass: 1, stiffness: 500, damping: 22, overshootClamping: false }) : 0;
  return (
    <div
      className={cn(
        'absolute flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm',
        noCarrinho && 'ring-2 ring-primary/60 border-transparent',
      )}
      style={{ left: r.x, top: r.y, width: CARD_L, height: CARD_A, opacity: disponivel ? 1 : 0.82 }}
    >
      <div className="relative shrink-0" style={{ height: CARD_IMG }}>
        <ImagemItem categoria={item.categoria} foto={item.foto} revela={revelaEm(f, i)} className="absolute inset-0" />
        <span className="absolute top-2 left-2 rounded-full bg-black/55 text-white text-[11px] font-semibold px-2 py-0.5">#{item.codigo}</span>
        {noCarrinho && (
          <span
            className="absolute top-2 right-2 min-w-7 h-7 px-2 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shadow-md"
            style={{ transform: `scale(${0.4 + 0.6 * badge})`, opacity: Math.min(1, badge * 1.5) }}
          >
            1×
          </span>
        )}
        {!disponivel && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-3 pt-6 pb-2 text-white text-xs font-medium">
            <Lock className="w-3.5 h-3.5" /> {item.bloqueio}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div>
          <h3 className="font-semibold leading-tight text-foreground">{item.nome}</h3>
          {item.descricao && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.descricao}</p>}
        </div>
        {ingredientes.length > 0 && (
          <ul className="flex flex-wrap gap-1 max-h-[44px] overflow-hidden">
            {ingredientes.map((x) => <li key={x} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{x}</li>)}
            {sobra > 0 && <li className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">+{sobra}</li>}
          </ul>
        )}
        <div className="mt-auto flex items-end justify-between gap-2">
          <div>
            <p className="text-lg font-bold tracking-tight text-foreground">{reais(item.preco)}</p>
            <p className="text-[11px] text-muted-foreground">{item.pedido}</p>
          </div>
          {noCarrinho ? (
            <div className="flex items-center gap-1.5">
              <span className="h-10 w-10 inline-flex items-center justify-center rounded-xl border bg-background"><Minus className="w-4 h-4" /></span>
              <span className="w-6 text-center font-bold tabular-nums">1</span>
              <span className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Plus className="w-4 h-4" /></span>
            </div>
          ) : (
            <span
              className={cn('h-10 inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold text-sm shadow-sm bg-primary text-primary-foreground', !disponivel && 'opacity-40')}
              style={{ width: 116, scale: String(aperto(f, clique)) }}
            >
              <Plus className="w-4 h-4" /> Adicionar
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ── o carrinho ──────────────────────────────────────────────────────────
const LINHAS = [
  { quando: MUDA.salada, item: ITENS.find((i) => i.codigo === 50)! },
  { quando: MUDA.egg, item: ITENS.find((i) => i.codigo === 59)! },
];

const Carrinho: React.FC<{ f: number; rolagem: number }> = ({ f, rolagem }) => {
  const topo = topoCarrinho(rolagem);
  const linhas = LINHAS.filter((l) => f >= l.quando);
  const total = linhas.reduce((s, l) => s + l.item.preco, 0);
  const hora = f >= MUDA.hora;
  return (
    <div className="absolute rounded-3xl border bg-card p-4 shadow-sm" style={{ left: CARRINHO_X, top: topo, width: CARRINHO_L }}>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold" style={{ height: CART.titulo }}>
        <ShoppingBasket className="w-5 h-5 text-primary" /> Seu pedido
      </h2>
      {linhas.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-10 px-4">
          <span className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center"><ShoppingBasket className="w-8 h-8" /></span>
          <div>
            <p className="font-semibold text-foreground">Seu pedido está vazio</p>
            <p className="text-sm text-muted-foreground">Toque em <strong>Adicionar</strong> nos itens do cardápio.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ul>
            {LINHAS.map((l, k) => {
              const p = f >= l.quando ? mola(f, l.quando) : 0;
              if (p <= 0) return null;
              return (
                <li key={l.item.codigo} style={{ height: (CART.linha + (k > 0 ? 8 : 0)) * Math.min(1, p), overflow: p < 1 ? 'hidden' : 'visible' }}>
                  <div
                    className="rounded-xl border bg-background p-2"
                    style={{ height: CART.linha, marginTop: k > 0 ? 8 : 0, opacity: Math.min(1, p * 1.3), transform: `translateX(${(1 - Math.min(1, p)) * 16}px)` }}
                  >
                    <div className="flex items-center gap-2.5">
                      <ImagemItem categoria="lanches" foto={l.item.foto} revela={1} className="w-11 h-11 rounded-lg shrink-0" tamanhoIcone="w-5 h-5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-tight truncate">{l.item.nome}</p>
                        <p className="text-xs text-muted-foreground truncate">{reais(l.item.preco)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-7 h-7 rounded-lg border inline-flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></span>
                        <span className="w-5 text-center text-sm font-bold tabular-nums">1</span>
                        <span className="w-7 h-7 rounded-lg border inline-flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></span>
                      </div>
                    </div>
                    <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground"><MessageSquareText className="w-3 h-3" /> Adicionar observação</span>
                  </div>
                </li>
              );
            })}
          </ul>
          <section>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold mb-2" style={{ height: 20 }}><Clock className="w-4 h-4 text-primary" /> Quando você vai retirar?</h3>
            <div className="grid grid-cols-4 gap-1.5" style={{ height: CART.faixas }}>
              {FAIXAS.map((x, i) => {
                const escolhida = hora && i === 1;
                return (
                  <span
                    key={x}
                    className={cn(
                      'h-8 rounded-lg border text-sm font-semibold tabular-nums flex items-center justify-center',
                      escolhida ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-background',
                    )}
                    style={{ scale: String(i === 1 ? aperto(f, T.cliqueHora) * (escolhida ? 1.03 : 1) : 1) }}
                  >
                    {x}
                  </span>
                );
              })}
            </div>
          </section>
          <div className="w-full rounded-xl border bg-background px-3 py-2 text-sm text-muted-foreground" style={{ height: CART.nota }}>Observação para a cantina (opcional)</div>
          <div className="flex items-center justify-between border-t pt-3" style={{ height: CART.total }}>
            <span className="text-sm text-muted-foreground">{linhas.length} {linhas.length === 1 ? 'item' : 'itens'}</span>
            <span className="text-2xl font-bold tracking-tight">{reais(total)}</span>
          </div>
          <span
            className={cn('w-full rounded-xl text-base font-medium flex items-center justify-center bg-primary text-primary-foreground', !hora && 'opacity-50')}
            style={{ height: CART.botao, scale: String(aperto(f, T.cliqueRevisar)) }}
          >
            {hora ? 'Revisar e fazer pedido' : 'Escolha o horário de retirada'}
          </span>
          <span className="text-xs text-muted-foreground self-center">Esvaziar pedido</span>
        </div>
      )}
    </div>
  );
};

export const TelaCardapio: React.FC<{ rolagem: number }> = ({ rolagem }) => {
  const f = useCurrentFrame();
  const entra = entre(f, T.tela, T.tela + ms(450), 0, 1);
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ opacity: entra }}>
      <div className="absolute left-0 top-0" style={{ width: X0 * 2 + L, height: 2000, transform: `translateY(${-rolagem}px)` }}>
        <Cabecalho f={f} />
        <Filtros />
        {ITENS.map((_, i) => <CardItem key={i} f={f} i={i} />)}
        <Carrinho f={f} rolagem={rolagem} />
      </div>
    </div>
  );
};

// ── por cima de tudo: diálogo, aviso e a gaveta do pedido ───────────────
export const SobreCardapio: React.FC = () => {
  const f = useCurrentFrame();
  const abreDialogo = mola(f, MUDA.revisar, { mass: 1, stiffness: 220, damping: 24, overshootClamping: true });
  const fechaDialogo = entre(f, T.cliqueConfirmar + ms(120), T.cliqueConfirmar + ms(320), 0, 1, ACELERA);
  const dialogo = f >= MUDA.revisar ? abreDialogo * (1 - fechaDialogo) : 0;
  const gaveta = f >= T.enviado + ms(1200) ? mola(f, T.enviado + ms(1200), { mass: 1, stiffness: 140, damping: 22, overshootClamping: true }) : 0;
  const toast = entre(f, T.enviado, T.enviado + ms(350), 0, 1) * (1 - entre(f, T.enviado + AVISO_MS, T.enviado + AVISO_MS + ms(300), 0, 1));
  const pulso = (f / 60 / 1.4) % 1;
  return (
    <>
      {dialogo > 0 && (
        <>
          <div className="absolute inset-0 bg-black/80" style={{ opacity: dialogo, zIndex: 40 }} />
          <div
            className="absolute rounded-lg border bg-background p-6 shadow-lg"
            style={{ left: DIALOGO.x, top: DIALOGO.y, width: DIALOGO.l, height: DIALOGO.a, zIndex: 41, opacity: dialogo, transform: `scale(${0.95 + 0.05 * dialogo})` }}
          >
            <X className="absolute right-4 top-4 h-4 w-4 opacity-70" />
            <h2 className="text-lg font-semibold leading-none tracking-tight">Confirmar pedido</h2>
            <p className="mt-2 text-sm text-muted-foreground">Retirada hoje às <strong className="text-foreground">12:15</strong>, no balcão da cantina.</p>
            <ul className="mt-4 divide-y rounded-xl border">
              {LINHAS.map((l) => (
                <li key={l.item.codigo} className="flex justify-between gap-3 px-3 py-2 text-sm">
                  <span><strong>1×</strong> {l.item.nome}</span><span className="tabular-nums">{reais(l.item.preco)}</span>
                </li>
              ))}
              <li className="flex justify-between px-3 py-2 font-bold"><span>Total</span><span className="tabular-nums">{reais(38)}</span></li>
            </ul>
            <div className="absolute rounded-xl bg-amber-500/10 p-3 text-xs text-amber-900 space-y-1" style={{ left: REGRAS.x - DIALOGO.x, top: REGRAS.y - DIALOGO.y, width: REGRAS.l }}>
              <p>• O valor é descontado em folha.</p>
              <p>• Pedido <strong>não retirado</strong> é cobrado e não tem reembolso.</p>
              <p>• Dá para cancelar até <strong>15 minutos</strong> antes da retirada.</p>
            </div>
            <div className="absolute flex justify-end gap-2" style={{ right: 24, bottom: 24 }}>
              <span className="h-10 px-4 inline-flex items-center rounded-md border bg-background text-sm font-medium">Voltar</span>
              <span
                className="h-10 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium"
                style={{ width: BTN_CONFIRMAR.l, scale: String(aperto(f, T.cliqueConfirmar)) }}
              >
                Confirmar pedido
              </span>
            </div>
          </div>
        </>
      )}

      {gaveta > 0 && (
        <>
          <div className="absolute inset-0 bg-black/80" style={{ opacity: gaveta, zIndex: 40 }} />
          <div
            className="absolute border-l bg-background p-6 shadow-lg"
            style={{ left: GAVETA.x, top: 0, width: GAVETA.l, height: GAVETA.a, zIndex: 41, transform: `translateX(${(1 - gaveta) * GAVETA.l}px)` }}
          >
            <X className="absolute right-4 top-4 h-4 w-4 opacity-70" />
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black text-foreground">Pedido #128</h2>
              <SeloStatus status="novo" />
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">26/10 · retirada às <strong className="text-foreground">12:15</strong></p>
            <div className="mt-5 space-y-5">
              <LinhaDoTempo status="novo" pulso={pulso} />
              <ul className="divide-y rounded-xl border">
                {LINHAS.map((l) => (
                  <li key={l.item.codigo} className="flex justify-between gap-3 px-3 py-2 text-sm"><span><strong>1×</strong> {l.item.nome}</span><span className="tabular-nums">{reais(l.item.preco)}</span></li>
                ))}
                <li className="flex justify-between px-3 py-2 font-bold"><span>Total</span><span className="tabular-nums">{reais(38)}</span></li>
              </ul>
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><MessageCircle className="w-4 h-4 text-primary" /> Conversa com a cantina</h3>
                <div className="rounded-xl border bg-muted/30 p-3">
                  <p className="py-6 text-center text-xs text-muted-foreground">Nenhuma mensagem ainda. Precisa avisar algo? Escreva aqui.</p>
                  <div className="h-9 rounded-lg border bg-background px-3 text-sm text-muted-foreground flex items-center">Mensagem para a cantina…</div>
                </div>
              </div>
              <span className="w-full h-10 inline-flex items-center justify-center rounded-md border bg-background text-sm font-medium text-destructive">Cancelar pedido (até 12:00)</span>
            </div>
          </div>
        </>
      )}

      {toast > 0 && (
        <div
          className="absolute flex items-center gap-2 rounded-lg border bg-success text-success-foreground border-success/30 shadow-lg px-4 text-sm font-semibold"
          style={{ right: 16, top: 16, width: 356, height: 54, zIndex: 60, opacity: toast, transform: `translateY(${(1 - toast) * -16}px)` }}
        >
          <CircleCheck className="w-4 h-4" /> Pedido #128 enviado! Retirada às 12:15.
        </div>
      )}
    </>
  );
};
