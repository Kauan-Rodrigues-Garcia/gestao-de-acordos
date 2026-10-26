// O Painel da Cantina, quadro a quadro: a fila do dia em quatro colunas, e o
// pedido da Ana chegando em Novos e andando coluna a coluna a cada botão.
// Mesmas classes de `src/pages/Cantina/Painel/`; posições de `geo.ts`.
//
// O quadro é calculado por ESTADO (quem está em qual coluna); entre um estado e
// o próximo, cada cartão desliza da posição velha para a nova.

import { ChefHat, Clock, Download, Flame, Inbox, PackageCheck, Receipt, RefreshCw, Timer, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { useCurrentFrame } from 'remotion';
import { cn } from '@/lib/utils';
import { aperto, entre, mola, ms } from '../movimento';
import { FILA, PEDIDO_NOVO, PRODUCAO, reais, type Coluna, type Pedido } from './dados';
import {
  BTN_EXPORTAR, CAB_PAINEL, CARTAO_L, COLUNA_CORPO, FAIXA_ROTULO, PRODUCAO as PRODUCAO_BOX, alturaCartao, coluna, type Ret,
} from './geo';
import { MUDA, T } from './tempos';

const COLUNAS: { id: Coluna; rotulo: string; Icone: LucideIcon; cor: string }[] = [
  { id: 'novo', rotulo: 'Novos', Icone: Inbox, cor: 'text-sky-600' },
  { id: 'preparando', rotulo: 'Preparando', Icone: ChefHat, cor: 'text-amber-600' },
  { id: 'pronto', rotulo: 'Prontos', Icone: PackageCheck, cor: 'text-emerald-600' },
  { id: 'encerrado', rotulo: 'Encerrados', Icone: Receipt, cor: 'text-muted-foreground' },
];

const PROXIMO: Partial<Record<Coluna, { rotulo: string; Icone: LucideIcon; cor: string }>> = {
  novo: { rotulo: 'Preparar', Icone: ChefHat, cor: 'bg-amber-500 text-white' },
  preparando: { rotulo: 'Pronto', Icone: PackageCheck, cor: 'bg-emerald-600 text-white' },
  pronto: { rotulo: 'Entregue', Icone: UtensilsCrossed, cor: 'bg-sky-600 text-white' },
};

// ── os estados do quadro ────────────────────────────────────────────────
type Estado = { pedido: Pedido; coluna: Coluna }[];

/** Onde está o pedido da Ana em cada estado (0 = ainda não chegou). */
const COLUNA_DO_NOVO: (Coluna | null)[] = [null, 'novo', 'preparando', 'pronto', 'encerrado'];
const EVENTOS = [0, T.chega, MUDA.preparando, MUDA.pronto, MUDA.entregue];

function estado(k: number): Estado {
  const col = COLUNA_DO_NOVO[k];
  if (!col) return FILA;
  const novo = { pedido: { ...PEDIDO_NOVO, selo: col === 'encerrado' ? ('Retirado' as const) : undefined }, coluna: col };
  return [...FILA, novo];
}

type Peca =
  | { chave: string; tipo: 'faixa'; x: number; y: number; texto: string }
  | { chave: string; tipo: 'cartao'; x: number; y: number; a: number; pedido: Pedido; coluna: Coluna };

function montar(e: Estado): Peca[] {
  const pecas: Peca[] = [];
  COLUNAS.forEach((c, i) => {
    const r = coluna(i);
    const x = r.x + 10;
    let y = r.y + COLUNA_CORPO;
    const daqui = e.filter((p) => p.coluna === c.id).map((p) => p.pedido);
    const faixas = [...new Set(daqui.map((p) => p.retirada))].sort();
    if (c.id === 'encerrado') faixas.reverse();
    for (const fx of faixas) {
      const doGrupo = daqui.filter((p) => p.retirada === fx).sort((a, b) => a.numero - b.numero);
      pecas.push({ chave: `${c.id}-${fx}`, tipo: 'faixa', x, y, texto: `${fx} · ${doGrupo.length}` });
      y += FAIXA_ROTULO + 8;
      for (const p of doGrupo) {
        const a = alturaCartao(p.itens.length, c.id !== 'encerrado');
        pecas.push({ chave: p.id, tipo: 'cartao', x, y, a, pedido: p, coluna: c.id });
        y += a + 8;
      }
      y += 4;
    }
  });
  return pecas;
}

const MONTADOS = COLUNA_DO_NOVO.map((_, k) => montar(estado(k)));

function estadoEm(f: number) {
  let k = 0;
  for (let i = 1; i < EVENTOS.length; i++) if (f >= EVENTOS[i]) k = i;
  return k;
}

/** O botão do pedido da Ana no estado `k` (coordenadas da área principal). */
export function botaoDoNovo(k: number): Ret {
  const p = MONTADOS[k].find((x) => x.chave === PEDIDO_NOVO.id);
  if (!p || p.tipo !== 'cartao') return { x: 0, y: 0, l: 0, a: 0 };
  return { x: p.x + 12, y: p.y + p.a - 12 - 44, l: CARTAO_L - 24, a: 44 };
}
/** O cartão inteiro do pedido da Ana no estado `k`. */
export function cartaoDoNovo(k: number): Ret {
  const p = MONTADOS[k].find((x) => x.chave === PEDIDO_NOVO.id);
  if (!p || p.tipo !== 'cartao') return { x: 0, y: 0, l: 0, a: 0 };
  return { x: p.x, y: p.y, l: CARTAO_L, a: p.a };
}

// ── o desenho ───────────────────────────────────────────────────────────
const Cartao: React.FC<{ peca: Extract<Peca, { tipo: 'cartao' }>; f: number; recente: number }> = ({ peca, f, recente }) => {
  const { pedido: p, coluna: col } = peca;
  const prox = PROXIMO[col];
  const clique = p.id === PEDIDO_NOVO.id
    ? (col === 'novo' ? T.cliquePreparar : col === 'preparando' ? T.cliquePronto : T.cliqueEntregue)
    : -1;
  return (
    <div
      className={cn('relative h-full rounded-2xl border bg-card shadow-sm overflow-hidden')}
      style={recente > 0 ? { boxShadow: `0 0 0 2px rgba(14,165,233,${recente}), 0 1px 2px rgba(0,0,0,.05)` } : undefined}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-2" style={{ height: 32 }}>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tight">#{p.numero}</span>
            <span className="inline-flex items-center gap-1 text-sm font-bold tabular-nums text-foreground"><Clock className="w-3.5 h-3.5" />{p.retirada}</span>
          </div>
          {p.selo && <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 bg-muted text-muted-foreground ring-border">{p.selo}</span>}
        </div>
        <p className="text-sm font-semibold truncate" style={{ height: 20 }}>{p.nome}</p>
        <p className="text-[11px] text-muted-foreground truncate" style={{ height: 16 }}>{p.setor}</p>
        <ul className="mt-2">
          {p.itens.map(([q, nome]) => (
            <li key={nome} className="text-sm leading-snug" style={{ height: 20 }}><strong className="tabular-nums">{q}×</strong> {nome}</li>
          ))}
        </ul>
        <div className="mt-2 flex items-center justify-end text-xs" style={{ height: 16 }}>
          <span className="font-semibold tabular-nums">{reais(p.total)}</span>
        </div>
      </div>
      {prox && (
        <div className="flex gap-1.5 px-3 pb-3">
          <span
            className={cn('flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold shadow-sm', prox.cor)}
            style={{ scale: String(aperto(f, clique)) }}
          >
            <prox.Icone className="w-4 h-4" /> {prox.rotulo}
          </span>
        </div>
      )}
    </div>
  );
};

export const TelaPainel: React.FC<{ entra: number }> = ({ entra }) => {
  const f = useCurrentFrame();
  const k = estadoEm(f);
  const p = k === 0 ? 1 : mola(f, EVENTOS[k], { mass: 1, stiffness: 110, damping: 20, overshootClamping: true });
  const antes = MONTADOS[Math.max(0, k - 1)];
  const agora = MONTADOS[k];
  const chaves = [...new Set([...antes.map((x) => x.chave), ...agora.map((x) => x.chave)])];
  const contagem = (kk: number, col: Coluna) => estado(kk).filter((x) => x.coluna === col).length;
  const comNovo = k >= 1 && p > 0.5;
  const pedidosHoje = FILA.length + (comNovo ? 1 : 0);
  const valorHoje = FILA.reduce((s, x) => s + x.pedido.total, 0) + (comNovo ? PEDIDO_NOVO.total : 0);
  // o pedido que acabou de chegar pulsa até alguém mexer nele
  const pulsa = f >= T.chega && f < T.cliquePreparar ? 0.55 + 0.45 * Math.sin(((f - T.chega) / 60) * Math.PI * 2.2) : 0;

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ opacity: entre(f, entra, entra + ms(300), 0, 1) }}>
      {/* cabeçalho */}
      <div className="absolute flex items-center justify-between" style={{ left: CAB_PAINEL.x, top: CAB_PAINEL.y, width: CAB_PAINEL.l, height: CAB_PAINEL.a }}>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight"><ChefHat className="w-7 h-7 text-orange-500" /> Painel da Cantina</h1>
          <p className="text-sm text-muted-foreground">Hoje · {pedidosHoje} pedidos · {reais(valorHoje)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-md"><RefreshCw className="w-4 h-4" /></span>
          <span className="inline-flex items-center justify-center gap-2 rounded-md border bg-background text-sm font-medium" style={{ width: BTN_EXPORTAR.l, height: BTN_EXPORTAR.a }}>
            <Download className="w-4 h-4" /> Exportar mês
          </span>
        </div>
      </div>

      {/* o que adiantar */}
      <section className="absolute rounded-2xl border bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-transparent p-3.5" style={{ left: PRODUCAO_BOX.x, top: PRODUCAO_BOX.y, width: PRODUCAO_BOX.l, height: PRODUCAO_BOX.a }}>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Flame className="w-4 h-4 text-orange-500" /> Para preparar nos próximos 30 minutos</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRODUCAO.map(([q, nome]) => (
            <span key={nome} className="inline-flex items-center gap-1.5 rounded-xl bg-card border px-3 py-1.5 text-sm shadow-sm">
              <strong className="text-lg leading-none tabular-nums text-orange-600">{q}×</strong> {nome}
            </span>
          ))}
        </div>
      </section>

      {/* as colunas */}
      {COLUNAS.map((c, i) => {
        const r = coluna(i);
        const n = p > 0.5 ? contagem(k, c.id) : contagem(Math.max(0, k - 1), c.id);
        return (
          <section key={c.id} className="absolute rounded-2xl bg-muted/40 p-2.5" style={{ left: r.x, top: r.y, width: r.l, height: r.a }}>
            <h2 className={cn('flex items-center justify-between px-1 pb-2 text-sm font-bold', c.cor)} style={{ height: 36 }}>
              <span className="flex items-center gap-1.5"><c.Icone className="w-4 h-4" /> {c.rotulo}</span>
              <span className="rounded-full bg-background px-2 py-0.5 text-xs text-foreground tabular-nums">{n}</span>
            </h2>
          </section>
        );
      })}

      {chaves.map((chave) => {
        const de = antes.find((x) => x.chave === chave);
        const para = agora.find((x) => x.chave === chave);
        const ref = (p >= 0.5 ? para : de) ?? para ?? de!;
        const x = de && para ? de.x + (para.x - de.x) * p : ref.x;
        const y = de && para ? de.y + (para.y - de.y) * p : ref.y;
        const opac = de && para ? 1 : para ? Math.min(1, p * 1.6) : 1 - Math.min(1, p * 1.6);
        if (opac <= 0.01) return null;
        if (ref.tipo === 'faixa') {
          return (
            <p key={chave} className="absolute flex items-center gap-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" style={{ left: x, top: y, width: CARTAO_L, height: FAIXA_ROTULO, opacity: opac }}>
              <Timer className="w-3 h-3" /> {ref.texto}
            </p>
          );
        }
        const anda = de && para && de.x !== para.x ? Math.sin(Math.PI * p) : 0;
        const entraNovo = !de && para ? p : 1;
        return (
          <div
            key={chave}
            className="absolute"
            style={{
              left: x, top: y, width: CARTAO_L, height: ref.a, opacity: opac, zIndex: anda > 0 ? 20 : 1,
              transform: `scale(${(0.96 + 0.04 * entraNovo) * (1 + 0.05 * anda)}) rotate(${-2 * anda}deg)`,
              filter: anda > 0 ? `drop-shadow(0 ${18 * anda}px ${26 * anda}px rgba(15,27,38,${0.22 * anda}))` : undefined,
            }}
          >
            <Cartao peca={ref} f={f} recente={chave === PEDIDO_NOVO.id ? pulsa : 0} />
          </div>
        );
      })}
    </div>
  );
};
