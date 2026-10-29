/**
 * TelaTv.tsx — o desenho de cada template.
 *
 * ## Um palco de 1920×1080, escalado
 *
 * Tudo aqui é desenhado em pixels de uma TV Full HD, e `PalcoTv` escala o
 * conjunto para o tamanho real (TV 4K, monitor velho, a prévia de 480 px da
 * montagem). Assim a prévia é EXATAMENTE a parede, só menor — sem breakpoint e
 * sem «na TV fica diferente».
 *
 * ## Leve de propósito
 *
 * O PC da TV costuma ser o pior da sala. Nada de biblioteca de gráfico: barra
 * é `div`, anel é um `circle` de SVG. A única animação contínua é nenhuma — o
 * número anima só quando MUDA (`useContador`), e a troca de tela é um fade de
 * opacidade, que a GPU faz sozinha.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { TelaDoPainel, TemaId } from './tipos';
import { alvoDoDiaProprio, opcao } from './templates';
import { iniciais, moedaTv, nomeCurto, percentualTv, tamanhoQueCabe, type VisaoTv } from './numeros';
import { Destaque } from './destaque/Destaque';

// ── Temas ────────────────────────────────────────────────────────────────────

interface Cores { fundo: string; fundo2: string; texto: string; suave: string; linha: string; destaque: string; ok: string; alerta: string; trilho: string }

export const CORES: Record<TemaId, Cores> = {
  noite:    { fundo: '#0b1220', fundo2: '#14203a', texto: '#f4f6fb', suave: '#8b97b3', linha: 'rgba(255,255,255,.08)', trilho: 'rgba(255,255,255,.10)', destaque: '#5eead4', ok: '#4ade80', alerta: '#fbbf24' },
  grafite:  { fundo: '#111111', fundo2: '#1f1f1f', texto: '#f5f5f5', suave: '#9a9a9a', linha: 'rgba(255,255,255,.08)', trilho: 'rgba(255,255,255,.10)', destaque: '#f5c542', ok: '#4ade80', alerta: '#fb923c' },
  oceano:   { fundo: '#04253a', fundo2: '#0a3d5c', texto: '#eaf6ff', suave: '#8fb5cc', linha: 'rgba(255,255,255,.09)', trilho: 'rgba(255,255,255,.12)', destaque: '#38bdf8', ok: '#4ade80', alerta: '#fbbf24' },
  floresta: { fundo: '#0a1f15', fundo2: '#123526', texto: '#effaf3', suave: '#8fb8a0', linha: 'rgba(255,255,255,.08)', trilho: 'rgba(255,255,255,.11)', destaque: '#86efac', ok: '#bef264', alerta: '#fbbf24' },
  vinho:    { fundo: '#250a14', fundo2: '#40122a', texto: '#fff1f4', suave: '#c9a0ac', linha: 'rgba(255,255,255,.08)', trilho: 'rgba(255,255,255,.11)', destaque: '#fb7185', ok: '#4ade80', alerta: '#fbbf24' },
  claro:    { fundo: '#eef1f7', fundo2: '#ffffff', texto: '#0f172a', suave: '#64748b', linha: 'rgba(15,23,42,.08)', trilho: 'rgba(15,23,42,.08)', destaque: '#2563eb', ok: '#16a34a', alerta: '#d97706' },
};

export const LARGURA = 1920;
export const ALTURA = 1080;

// ── O palco escalado ─────────────────────────────────────────────────────────

/** Encaixa o palco de 1920×1080 no espaço que tiver, sem distorcer. */
export function PalcoTv({ tema, children, style }: { tema: TemaId; children: ReactNode; style?: CSSProperties }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0);
  const c = CORES[tema];

  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setEscala(Math.min(el.clientWidth / LARGURA, el.clientHeight / ALTURA));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={caixa} style={{ position: 'relative', overflow: 'hidden', background: c.fundo, ...style }}>
      <div
        style={{
          position: 'absolute', left: '50%', top: '50%',
          width: LARGURA, height: ALTURA,
          transform: `translate(-50%, -50%) scale(${escala})`,
          transformOrigin: 'center',
          // O verde de «melhorou» que os números acendem ao mudar.
          ['--tv-ok' as string]: c.ok,
          ['--tv-ok-brilho' as string]: `${c.ok}80`,
          color: c.texto,
          background: `radial-gradient(ellipse 120% 90% at 15% 0%, ${c.fundo2} 0%, ${c.fundo} 60%)`,
          fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
          fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden',
          visibility: escala > 0 ? 'visible' : 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── O número que anima quando muda ───────────────────────────────────────────

/**
 * Quanto dura a subida de um número quando chega relatório novo. Devagar de
 * propósito (pedido do Cleber, 27/10): começa lento, acelera no meio e assenta
 * devagar — quem está na sala tem tempo de ver o número andar.
 */
export const DURACAO_MUDANCA_MS = 3200;
/** As barras, o anel e o ranking andam no mesmo compasso dos números. */
const CURVA = 'cubic-bezier(.65, 0, .35, 1)';
/** Depois de assentar, o verde ainda fica um pouco antes de sumir. */
const BRILHO_DEPOIS_MS = 1800;

const entraESai = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Mudanca = 'subiu' | 'desceu' | null;

function useContador(alvo: number): { valor: number; mudanca: Mudanca } {
  const [valor, setValor] = useState(alvo);
  const [mudanca, setMudanca] = useState<Mudanca>(null);
  const atual = useRef(alvo);

  useEffect(() => {
    const de = atual.current;
    if (de === alvo) return;
    setMudanca(alvo > de ? 'subiu' : 'desceu');
    const reduzido = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let quadro = 0;
    let apagar: ReturnType<typeof setTimeout> | undefined;
    const terminar = () => {
      atual.current = alvo;
      setValor(alvo);
      apagar = setTimeout(() => setMudanca(null), BRILHO_DEPOIS_MS);
    };
    if (reduzido) { terminar(); return () => clearTimeout(apagar); }

    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / DURACAO_MUDANCA_MS);
      const v = de + (alvo - de) * entraESai(t);
      atual.current = v;
      setValor(v);
      if (t < 1) quadro = requestAnimationFrame(passo);
      else terminar();
    };
    quadro = requestAnimationFrame(passo);
    return () => { cancelAnimationFrame(quadro); clearTimeout(apagar); };
  }, [alvo]);

  return { valor, mudanca };
}

/** O verde de «melhorou», em cima da cor que o número já tinha. */
function brilho(mudanca: Mudanca, bomQuando: 'sobe' | 'desce'): CSSProperties {
  const melhorou = mudanca && (mudanca === 'subiu') === (bomQuando === 'sobe');
  return {
    transition: 'color 700ms ease, text-shadow 700ms ease',
    ...(melhorou ? { color: 'var(--tv-ok)', textShadow: '0 0 48px var(--tv-ok-brilho)' } : {}),
  };
}

/**
 * Dinheiro que anima quando muda. `bomQuando`: o «falta» é bom quando DESCE,
 * e fica verde do mesmo jeito que o recebido quando sobe.
 */
function Moeda({ v, style, bomQuando = 'sobe', caber }: {
  v: number; style?: CSSProperties; bomQuando?: 'sobe' | 'desce';
  /** Largura máxima, em px do palco: o corpo encolhe para o valor com centavos caber. */
  caber?: number;
}) {
  const { valor, mudanca } = useContador(v);
  // Mede o valor FINAL, e não o que está animando: o corpo não pula a cada quadro.
  const corpo = caber && typeof style?.fontSize === 'number' ? tamanhoQueCabe(moedaTv(v), caber, style.fontSize) : undefined;
  return <span style={{ ...style, ...(corpo ? { fontSize: corpo } : {}), whiteSpace: 'nowrap', ...brilho(mudanca, bomQuando) }}>{moedaTv(valor)}</span>;
}

function Percentual({ fracao, style }: { fracao: number; style?: CSSProperties }) {
  const { valor, mudanca } = useContador(Math.round(fracao * 10000) / 10000);
  return <span style={{ ...style, ...brilho(mudanca, 'sobe') }}>{percentualTv(valor)}</span>;
}

/**
 * FLIP: quem troca de posição no ranking DESLIZA até a nova, em vez de
 * aparecer lá. Mede por `offsetLeft/Top` — o palco inteiro está dentro de um
 * `scale()`, e o retângulo da tela viria escalado.
 */
function useDeslizar(chave: string) {
  const caixa = useRef<HTMLDivElement>(null);
  const antes = useRef(new Map<string, { x: number; y: number }>());

  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const agora = new Map<string, { x: number; y: number }>();
    const itens = Array.from(el.querySelectorAll<HTMLElement>('[data-flip]'));
    for (const item of itens) {
      const id = item.dataset.flip!;
      const pos = { x: item.offsetLeft, y: item.offsetTop };
      agora.set(id, pos);
      const velho = antes.current.get(id);
      if (antes.current.size && !velho) {
        // Entrou agora no ranking: aparece de baixo.
        item.animate(
          [{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'none' }],
          { duration: 1200, easing: 'ease-out' },
        );
      } else if (velho && (velho.x !== pos.x || velho.y !== pos.y)) {
        item.animate(
          [{ transform: `translate(${velho.x - pos.x}px, ${velho.y - pos.y}px)` }, { transform: 'none' }],
          { duration: 1600, easing: CURVA },
        );
      }
    }
    antes.current = agora;
  }, [chave]);

  return caixa;
}

// ── Peças comuns ─────────────────────────────────────────────────────────────

const centro: CSSProperties = {
  position: 'absolute', inset: '150px 120px 130px',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
};

function Titulo({ texto, c }: { texto: string; c: Cores }) {
  if (!texto) return null;
  return (
    <div style={{ fontSize: 46, fontWeight: 600, color: c.suave, letterSpacing: 1, marginBottom: 24, textAlign: 'center' }}>
      {texto}
    </div>
  );
}

function Barra({ fracao, c, altura = 28, cor }: { fracao: number; c: Cores; altura?: number; cor?: string }) {
  return (
    <div style={{ width: '100%', height: altura, borderRadius: altura, background: c.trilho, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.min(100, Math.max(0, fracao * 100))}%`, height: '100%', borderRadius: altura,
        background: cor ?? c.destaque, transition: `width ${DURACAO_MUDANCA_MS}ms ${CURVA}, background 700ms ease`,
      }} />
    </div>
  );
}

function Rotulado({ rotulo, children, c, tamanho = 64, cor }: { rotulo: string; children: ReactNode; c: Cores; tamanho?: number; cor?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 30, color: c.suave, fontWeight: 500, marginBottom: 8 }}>{rotulo}</div>
      <div style={{ fontSize: tamanho, fontWeight: 700, color: cor ?? c.texto, lineHeight: 1.05 }}>{children}</div>
    </div>
  );
}

function Aviso({ texto, c }: { texto: string; c: Cores }) {
  return (
    <div style={{ ...centro }}>
      <div style={{ fontSize: 56, color: c.suave, fontWeight: 600, textAlign: 'center', maxWidth: 1300 }}>{texto}</div>
    </div>
  );
}

function Foto({ nome, foto, tamanho, c, borda }: { nome: string; foto: string | null; tamanho: number; c: Cores; borda?: string }) {
  const [falhou, setFalhou] = useState(false);
  const estilo: CSSProperties = {
    width: tamanho, height: tamanho, borderRadius: '50%', flexShrink: 0,
    border: `${Math.max(3, tamanho / 24)}px solid ${borda ?? c.linha}`,
    background: c.fundo2, objectFit: 'cover',
  };
  if (foto && !falhou) {
    return <img src={foto} alt="" style={estilo} decoding="async" onError={() => setFalhou(true)} />;
  }
  return (
    <div style={{ ...estilo, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: tamanho * 0.36, fontWeight: 700, color: c.suave }}>
      {iniciais(nome)}
    </div>
  );
}

const SEM_META = 'A meta deste mês ainda não foi cadastrada.';

// ── Os templates ─────────────────────────────────────────────────────────────

/*
 * «Mostrar o valor da meta» desligado esconde a meta E o recebido: com o
 * recebido e o «falta» na tela, a meta sai numa conta de somar.
 */

function Contagem({ v, tela, c }: { v: VisaoTv; tela: TelaDoPainel; c: Cores }) {
  if (v.meta <= 0) return <Aviso texto={SEM_META} c={c} />;
  const mostrarMeta = opcao<boolean>(tela, 'mostrar_meta');
  if (v.batida) {
    return (
      <div style={centro}>
        <div style={{ fontSize: 60, fontWeight: 700, color: c.ok, letterSpacing: 6 }}>META BATIDA</div>
        {mostrarMeta ? (
          <>
            <Moeda v={v.recebido} caber={1600} style={{ fontSize: 230, fontWeight: 800, lineHeight: 1, margin: '20px 0 28px', letterSpacing: -4 }} />
            <div style={{ fontSize: 44, color: c.suave }}>
              <Percentual fracao={v.fracao} /> da meta · {moedaTv(v.recebido - v.meta)} acima
            </div>
          </>
        ) : (
          <Percentual fracao={v.fracao} style={{ fontSize: 230, fontWeight: 800, lineHeight: 1, margin: '20px 0 28px', letterSpacing: -4 }} />
        )}
      </div>
    );
  }
  return (
    <div style={centro}>
      <Titulo texto={opcao<string>(tela, 'titulo')} c={c} />
      <Moeda v={v.falta} bomQuando="desce" caber={1600} style={{ fontSize: 250, fontWeight: 800, lineHeight: 1, letterSpacing: -6 }} />
      <div style={{ width: 1200, margin: '56px 0 36px' }}>
        <Barra fracao={v.fracao} c={c} altura={18} />
      </div>
      <div style={{ display: 'flex', gap: 72, fontSize: 38, color: c.suave }}>
        {mostrarMeta && (
          <>
            <span>Recebido <b style={{ color: c.texto }}><Moeda v={v.recebido} /></b></span>
            <span>Meta <b style={{ color: c.texto }}>{moedaTv(v.meta)}</b></span>
          </>
        )}
        {!mostrarMeta && <span><b style={{ color: c.texto }}><Percentual fracao={v.fracao} /></b> do caminho</span>}
        <span><b style={{ color: c.destaque }}>{v.diasRestantes}</b> {v.diasRestantes === 1 ? 'dia útil' : 'dias úteis'} pela frente</span>
      </div>
    </div>
  );
}

function MetaBarra({ v, tela, c }: { v: VisaoTv; tela: TelaDoPainel; c: Cores }) {
  if (v.meta <= 0) return <Aviso texto={SEM_META} c={c} />;
  const mostrarMeta = opcao<boolean>(tela, 'mostrar_meta');
  return (
    <div style={centro}>
      <Titulo texto={opcao<string>(tela, 'titulo')} c={c} />
      <Percentual fracao={v.fracao} style={{ fontSize: 280, fontWeight: 800, lineHeight: 1, letterSpacing: -6, color: v.batida ? c.ok : c.texto }} />
      <div style={{ width: 1400, margin: '60px 0 40px' }}>
        <Barra fracao={v.fracao} c={c} altura={56} cor={v.batida ? c.ok : undefined} />
      </div>
      <div style={{ fontSize: 50, color: c.suave }}>
        {mostrarMeta
          ? <><Moeda v={v.recebido} style={{ color: c.texto, fontWeight: 700 }} /> de {moedaTv(v.meta)}</>
          : v.batida
            ? 'Meta batida!'
            : <>Faltam <Moeda v={v.falta} bomQuando="desce" style={{ color: c.texto, fontWeight: 700 }} /></>}
      </div>
    </div>
  );
}

function Anel({ v, tela, c }: { v: VisaoTv; tela: TelaDoPainel; c: Cores }) {
  if (v.meta <= 0) return <Aviso texto={SEM_META} c={c} />;
  const mostrarMeta = opcao<boolean>(tela, 'mostrar_meta');
  const r = 300;
  const volta = 2 * Math.PI * r;
  const cheio = Math.min(1, v.fracao);
  return (
    <div style={{ ...centro, flexDirection: 'row', gap: 140 }}>
      <div style={{ position: 'relative', width: 700, height: 700 }}>
        <svg width={700} height={700} viewBox="0 0 700 700" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={350} cy={350} r={r} fill="none" stroke={c.trilho} strokeWidth={52} />
          <circle
            cx={350} cy={350} r={r} fill="none" stroke={v.batida ? c.ok : c.destaque} strokeWidth={52}
            strokeLinecap="round" strokeDasharray={volta} strokeDashoffset={volta * (1 - cheio)}
            style={{ transition: `stroke-dashoffset ${DURACAO_MUDANCA_MS}ms ${CURVA}, stroke 700ms ease` }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 150, fontWeight: 800, letterSpacing: -3 }}>
          <Percentual fracao={v.fracao} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 56, alignItems: 'flex-start' }}>
        <Titulo texto={opcao<string>(tela, 'titulo')} c={c} />
        {mostrarMeta && <Rotulado rotulo="Recebido" c={c} tamanho={88}><Moeda v={v.recebido} caber={820} style={{ fontSize: 88 }} /></Rotulado>}
        {(mostrarMeta || !v.batida) && (
          <Rotulado rotulo={v.batida ? 'Acima da meta' : 'Falta'} c={c} tamanho={88} cor={v.batida ? c.ok : c.destaque}>
            <Moeda v={v.batida ? v.recebido - v.meta : v.falta} bomQuando={v.batida ? 'sobe' : 'desce'} caber={820} style={{ fontSize: 88 }} />
          </Rotulado>
        )}
        {!mostrarMeta && v.batida && <div style={{ fontSize: 72, fontWeight: 800, color: c.ok }}>Meta batida!</div>}
      </div>
    </div>
  );
}

function Hoje({ v, tela, c }: { v: VisaoTv; tela: TelaDoPainel; c: Cores }) {
  if (v.hoje.alvo <= 0) return <Aviso texto={SEM_META} c={c} />;
  const bateu = v.hoje.recebido >= v.hoje.alvo;
  const propria = alvoDoDiaProprio(tela) != null;
  // Pedido de 27/10: a META e o ATINGIDO em destaque, lado a lado, e a barra embaixo.
  return (
    <div style={centro}>
      <Titulo texto={opcao<string>(tela, 'titulo')} c={c} />
      <div style={{ display: 'flex', gap: 48, width: '100%', marginTop: 8 }}>
        <Bloco c={c} rotulo={propria ? 'Meta de hoje · definida pela liderança' : 'Meta de hoje'}>
          <Moeda v={v.hoje.alvo} caber={720} style={{ fontSize: 128, fontWeight: 800, letterSpacing: -2 }} />
        </Bloco>
        <Bloco c={c} rotulo="Recebido hoje" destaque={bateu ? c.ok : c.destaque}>
          <Moeda v={v.hoje.recebido} caber={720} style={{ fontSize: 128, fontWeight: 800, letterSpacing: -2, color: bateu ? c.ok : c.destaque }} />
        </Bloco>
      </div>
      <div style={{ width: '100%', marginTop: 56 }}>
        <BarraDeProgresso fracao={v.hoje.fracao} c={c} batida={bateu} />
      </div>
      <div style={{ marginTop: 28, fontSize: 52, fontWeight: 700, color: bateu ? c.ok : c.texto }}>
        {bateu
          ? <>Meta de hoje batida! <Moeda v={v.hoje.recebido - v.hoje.alvo} /> acima</>
          : <>Faltam <Moeda v={v.hoje.falta} bomQuando="desce" /> para a meta de hoje</>}
      </div>
    </div>
  );
}

/** Um número com rótulo, num cartão. A borda de cima leva a cor do número. */
function Bloco({ c, rotulo, destaque, children }: { c: Cores; rotulo: string; destaque?: string; children: ReactNode }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, padding: '44px 36px 48px', borderRadius: 40, background: c.linha,
      borderTop: `8px solid ${destaque ?? c.trilho}`, textAlign: 'center',
      transition: 'border-color 700ms ease',
    }}>
      <div style={{ fontSize: 38, fontWeight: 600, color: c.suave, marginBottom: 14 }}>{rotulo}</div>
      <div style={{ lineHeight: 1.05 }}>{children}</div>
    </div>
  );
}

/**
 * A barra de progresso grande: trilho com marcas de 25/50/75%, preenchimento
 * em degradê com brilho, e o percentual na ponta do preenchimento.
 */
function BarraDeProgresso({ fracao, c, batida }: { fracao: number; c: Cores; batida: boolean }) {
  const largura = Math.min(100, Math.max(0, fracao * 100));
  const fim = batida ? c.ok : c.destaque;
  return (
    <div style={{ position: 'relative', height: 84, borderRadius: 84, background: c.trilho, overflow: 'hidden' }}>
      {[25, 50, 75].map(m => (
        <span key={m} style={{ position: 'absolute', left: `${m}%`, top: 18, bottom: 18, width: 3, borderRadius: 3, background: c.linha }} />
      ))}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(largura, 9)}%`,
        borderRadius: 84,
        background: `linear-gradient(90deg, ${fim}66 0%, ${fim} 100%)`,
        boxShadow: `0 0 40px ${fim}55`,
        transition: `width ${DURACAO_MUDANCA_MS}ms ${CURVA}, background 700ms ease`,
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 28,
      }}>
        <span style={{ position: 'absolute', inset: '8px 16px auto', height: 22, borderRadius: 22, background: 'rgba(255,255,255,.18)' }} />
        <Percentual fracao={fracao} style={{ position: 'relative', fontSize: 50, fontWeight: 800, color: '#0b1220' }} />
      </div>
    </div>
  );
}

function Ritmo({ v, tela, c }: { v: VisaoTv; tela: TelaDoPainel; c: Cores }) {
  if (v.meta <= 0) return <Aviso texto={SEM_META} c={c} />;
  const fracaoProj = v.meta > 0 ? v.projecao / v.meta : 0;
  const chega = fracaoProj >= 1;
  return (
    <div style={centro}>
      <Titulo texto={opcao<string>(tela, 'titulo')} c={c} />
      <div style={{ display: 'flex', gap: 120, alignItems: 'stretch', marginTop: 20 }}>
        <div style={{ width: 760, padding: '56px 40px', borderRadius: 40, background: c.linha, textAlign: 'center' }}>
          <div style={{ fontSize: 36, color: c.suave, marginBottom: 20 }}>
            {v.batida ? 'Meta batida' : 'Precisamos por dia útil'}
          </div>
          <Moeda v={v.batida ? 0 : v.ritmo} caber={680} style={{ fontSize: 112, fontWeight: 800, color: v.batida ? c.ok : c.destaque, letterSpacing: -3 }} />
          <div style={{ fontSize: 32, color: c.suave, marginTop: 20 }}>
            {v.diasRestantes} {v.diasRestantes === 1 ? 'dia útil restante' : 'dias úteis restantes'}
          </div>
        </div>
        <div style={{ width: 760, padding: '56px 40px', borderRadius: 40, background: c.linha, textAlign: 'center' }}>
          <div style={{ fontSize: 36, color: c.suave, marginBottom: 20 }}>No ritmo atual, o mês fecha em</div>
          <Moeda v={v.projecao} caber={680} style={{ fontSize: 112, fontWeight: 800, letterSpacing: -3 }} />
          <div style={{ fontSize: 36, marginTop: 20, fontWeight: 600, color: chega ? c.ok : c.alerta }}>
            {percentualTv(fracaoProj)} da meta
          </div>
        </div>
      </div>
    </div>
  );
}

function Placar({ v, tela, c }: { v: VisaoTv; tela: TelaDoPainel; c: Cores }) {
  if (v.meta <= 0) return <Aviso texto={SEM_META} c={c} />;
  // Refeito em 27/10: três caixas lado a lado cortavam o número com centavos.
  // Agora o recebido manda, em cima; meta e falta embaixo; a barra fecha.
  return (
    <div style={centro}>
      <Titulo texto={opcao<string>(tela, 'titulo')} c={c} />
      <div style={{ fontSize: 40, fontWeight: 600, color: c.suave }}>Recebido no mês</div>
      <Moeda v={v.recebido} caber={1600} style={{ fontSize: 190, fontWeight: 800, lineHeight: 1.05, letterSpacing: -4, color: v.batida ? c.ok : c.texto }} />
      <div style={{ display: 'flex', gap: 48, width: '100%', marginTop: 40 }}>
        <Bloco c={c} rotulo="Meta do mês">
          <Moeda v={v.meta} caber={720} style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2 }} />
        </Bloco>
        <Bloco c={c} rotulo={v.batida ? 'Acima da meta' : 'Falta para a meta'} destaque={v.batida ? c.ok : c.destaque}>
          <Moeda v={v.batida ? v.recebido - v.meta : v.falta} bomQuando={v.batida ? 'sobe' : 'desce'} caber={720}
            style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2, color: v.batida ? c.ok : c.destaque }} />
        </Bloco>
      </div>
      <div style={{ width: '100%', marginTop: 40 }}>
        <BarraDeProgresso fracao={v.fracao} c={c} batida={v.batida} />
      </div>
    </div>
  );
}

// ── O gráfico ────────────────────────────────────────────────────────────────

const MOEDA_CURTA = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Eixo do gráfico: «R$ 250 mil», «R$ 1,2 mi». */
function moedaCurta(v: number): string {
  if (v >= 1_000_000) return `R$ ${MOEDA_CURTA.format(v / 1_000_000)} mi`;
  if (v >= 1_000) return `R$ ${MOEDA_CURTA.format(v / 1_000)} mil`;
  return `R$ ${MOEDA_CURTA.format(v)}`;
}

/** Os pontos da curva andam até os novos no mesmo compasso dos números. */
function useSerieAnimada(alvo: { dia: number; valor: number }[]): { dia: number; valor: number }[] {
  const [atual, setAtual] = useState(alvo);
  const ref = useRef(alvo);
  const chave = alvo.map(p => `${p.dia}:${p.valor}`).join('|');

  useEffect(() => {
    const de = ref.current;
    const para = alvo;
    const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduzido) { ref.current = para; setAtual(para); return; }
    const inicio = performance.now();
    let quadro = 0;
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / DURACAO_MUDANCA_MS);
      const k = entraESai(t);
      // Ponto novo (dia que entrou agora) nasce do último ponto antigo.
      const base = de[de.length - 1]?.valor ?? 0;
      const v = para.map((p, i) => ({ dia: p.dia, valor: (de[i]?.valor ?? base) + (p.valor - (de[i]?.valor ?? base)) * k }));
      ref.current = v;
      setAtual(v);
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return atual;
}

function Grafico({ v, tela, c }: { v: VisaoTv; tela: TelaDoPainel; c: Cores }) {
  const mostrarMeta = opcao<boolean>(tela, 'mostrar_meta') && v.meta > 0;
  const pontos = useSerieAnimada(v.serie);

  const L = 1680, A = 680;                 // a área do gráfico
  const esq = 190, dir = 60, cima = 40, baixo = 64;
  const w = L - esq - dir, h = A - cima - baixo;
  const teto = Math.max(mostrarMeta ? v.meta : 0, v.recebido, 1) * 1.1;
  const x = (dia: number) => esq + (dia / Math.max(1, v.diasNoMes)) * w;
  const y = (valor: number) => cima + h - (Math.max(0, valor) / teto) * h;

  const linha = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(p.dia).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ');
  const ultimo = pontos[pontos.length - 1] ?? { dia: 0, valor: 0 };
  const area = `${linha} L${x(ultimo.dia).toFixed(1)},${y(0)} L${x(0)},${y(0)} Z`;
  const marcas = [0.25, 0.5, 0.75, 1].map(f => teto / 1.1 * f);
  const diasEixo = [1, 5, 10, 15, 20, 25, v.diasNoMes].filter((d, i, a) => d <= v.diasNoMes && a.indexOf(d) === i);
  const idGrad = `tv-graf-${c.destaque.slice(1)}`;

  return (
    <div style={{ ...centro, justifyContent: 'flex-start', top: 140 }}>
      <div style={{ width: '100%', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 46, fontWeight: 700, color: c.suave }}>{opcao<string>(tela, 'titulo')}</div>
        <div style={{ fontSize: 52, fontWeight: 800 }}>
          <Moeda v={v.recebido} />
          {mostrarMeta && <span style={{ color: c.suave, fontWeight: 600, fontSize: 40 }}> · <Percentual fracao={v.fracao} /> da meta</span>}
        </div>
      </div>
      <svg width={L} height={A} viewBox={`0 0 ${L} ${A}`} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={idGrad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.destaque} stopOpacity={0.45} />
            <stop offset="100%" stopColor={c.destaque} stopOpacity={0} />
          </linearGradient>
          {/* Na primeira vez, a curva se desenha da esquerda para a direita. */}
          <clipPath id={`${idGrad}-entrada`}>
            <rect x={0} y={-50} width={L} height={A + 100} style={{ transformOrigin: 'left', animation: `tv2-desenha 1800ms ${CURVA} both` }} />
          </clipPath>
        </defs>

        {marcas.map(m => (
          <g key={m}>
            <line x1={esq} x2={L - dir} y1={y(m)} y2={y(m)} stroke={c.linha} strokeWidth={2} />
            <text x={esq - 20} y={y(m) + 10} textAnchor="end" fontSize={28} fill={c.suave}>{moedaCurta(m)}</text>
          </g>
        ))}
        {diasEixo.map(d => (
          <text key={d} x={x(d)} y={A - 16} textAnchor="middle" fontSize={28} fill={c.suave}>{d}</text>
        ))}

        {mostrarMeta && (
          <>
            {/* O ritmo ideal: de zero à meta no último dia. */}
            <line x1={x(0)} y1={y(0)} x2={x(v.diasNoMes)} y2={y(v.meta)} stroke={c.suave} strokeWidth={3} strokeDasharray="4 14" strokeLinecap="round" opacity={0.7} />
            <line x1={esq} x2={L - dir} y1={y(v.meta)} y2={y(v.meta)} stroke={c.alerta} strokeWidth={4} strokeDasharray="18 12" />
            <text x={L - dir} y={y(v.meta) - 16} textAnchor="end" fontSize={32} fontWeight={700} fill={c.alerta}>Meta {moedaTv(v.meta)}</text>
          </>
        )}

        <g clipPath={`url(#${idGrad}-entrada)`}>
          <path d={area} fill={`url(#${idGrad})`} />
          <path d={linha} fill="none" stroke={v.batida ? c.ok : c.destaque} strokeWidth={7} strokeLinejoin="round" strokeLinecap="round"
            style={{ transition: 'stroke 700ms ease' }} />
          <circle cx={x(ultimo.dia)} cy={y(ultimo.valor)} r={26} fill={c.destaque} opacity={0.25}>
            <animate attributeName="r" values="18;34;18" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle cx={x(ultimo.dia)} cy={y(ultimo.valor)} r={13} fill={v.batida ? c.ok : c.destaque} stroke={c.fundo} strokeWidth={5} />
        </g>
      </svg>
      <style>{'@keyframes tv2-desenha { from { transform: scaleX(0); } to { transform: scaleX(1); } }'}</style>
    </div>
  );
}

const MEDALHA = ['#f5c542', '#a9b4c4', '#d6935a'];

function Podio({ v, tela, c }: { v: VisaoTv; tela: TelaDoPainel; c: Cores }) {
  const top = v.ranking.slice(0, 3);
  if (!top.length) return <Aviso texto="Ainda não há recebimento neste mês." c={c} />;
  const mostrar = opcao<boolean>(tela, 'mostrar_valor');
  // 2º, 1º, 3º — o primeiro no meio e mais alto.
  return <PodioVivo top={top} tela={tela} c={c} mostrar={mostrar} />;
}

function PodioVivo({ top, tela, c, mostrar }: { top: VisaoTv['ranking']; tela: TelaDoPainel; c: Cores; mostrar: boolean }) {
  const caixa = useDeslizar(top.map(p => p.id).join(','));
  const ordem = [1, 0, 2].filter(i => top[i]);
  const altura = [280, 200, 150];
  return (
    <div style={{ ...centro, justifyContent: 'flex-end', paddingBottom: 0 }}>
      <Titulo texto={opcao<string>(tela, 'titulo')} c={c} />
      <div ref={caixa} style={{ display: 'flex', alignItems: 'flex-end', gap: 56, marginTop: 'auto' }}>
        {ordem.map(i => {
          const p = top[i];
          return (
            <div key={p.id} data-flip={p.id} style={{ width: 460, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Foto nome={p.nome} foto={p.foto} tamanho={i === 0 ? 190 : 150} c={c} borda={MEDALHA[i]} />
              <div style={{ fontSize: i === 0 ? 52 : 44, fontWeight: 700, marginTop: 24, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 460 }}>
                {nomeCurto(p.nome)}
              </div>
              {mostrar && <Moeda v={p.valor} caber={440} style={{ fontSize: 40, color: c.suave, marginTop: 6 }} />}
              <div style={{
                width: '100%', height: altura[i], marginTop: 28, borderRadius: '28px 28px 0 0',
                transition: `height 1600ms ${CURVA}`,
                background: `linear-gradient(180deg, ${MEDALHA[i]}55, ${MEDALHA[i]}14)`,
                display: 'flex', justifyContent: 'center', paddingTop: 20,
                fontSize: 100, fontWeight: 800, color: MEDALHA[i],
              }}>
                {i + 1}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Lista({ v, tela, c }: { v: VisaoTv; tela: TelaDoPainel; c: Cores }) {
  const qtd = Number(opcao<string>(tela, 'quantidade')) || 5;
  const pessoas = v.ranking.slice(0, qtd);
  if (!pessoas.length) return <Aviso texto="Ainda não há recebimento neste mês." c={c} />;
  return <ListaViva pessoas={pessoas} tela={tela} c={c} />;
}

function ListaViva({ pessoas, tela, c }: { pessoas: VisaoTv['ranking']; tela: TelaDoPainel; c: Cores }) {
  const caixa = useDeslizar(pessoas.map(p => p.id).join(','));
  const mostrar = opcao<boolean>(tela, 'mostrar_valor');
  const duasColunas = pessoas.length > 5;
  const linha = duasColunas ? 112 : 124;
  return (
    <div style={{ ...centro, top: 140, justifyContent: 'flex-start' }}>
      <Titulo texto={opcao<string>(tela, 'titulo')} c={c} />
      <div ref={caixa} style={{
        display: 'grid', width: '100%', gap: '18px 56px',
        gridTemplateColumns: duasColunas ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
        gridAutoFlow: duasColunas ? 'column' : 'row',
        gridTemplateRows: `repeat(${duasColunas ? 5 : pessoas.length}, ${linha}px)`,
        maxWidth: duasColunas ? undefined : 1300,
      }}>
        {pessoas.map((p, i) => (
          <div key={p.id} data-flip={p.id} style={{
            transition: 'background 900ms ease',
            display: 'flex', alignItems: 'center', gap: duasColunas ? 22 : 32, padding: duasColunas ? '0 24px' : '0 40px',
            borderRadius: 28, background: i < 3 ? c.linha : 'transparent',
            borderBottom: i < 3 ? undefined : `2px solid ${c.linha}`,
          }}>
            <div style={{ width: duasColunas ? 60 : 72, fontSize: duasColunas ? 48 : 56, fontWeight: 800, color: i < 3 ? MEDALHA[i] : c.suave, textAlign: 'center' }}>{i + 1}</div>
            <Foto nome={p.nome} foto={p.foto} tamanho={duasColunas ? 72 : 92} c={c} />
            <div style={{ flex: 1, minWidth: 0, fontSize: duasColunas ? 40 : 48, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {nomeCurto(p.nome)}
            </div>
            {mostrar && <Moeda v={p.valor} style={{ fontSize: duasColunas ? 38 : 48, fontWeight: 700 }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function Imagem({ tela, c, url }: { tela: TelaDoPainel; c: Cores; url: string | null }) {
  if (!url) return <Aviso texto="Escolha uma imagem para esta tela." c={c} />;
  const legenda = opcao<string>(tela, 'legenda');
  return (
    <>
      <img src={url} alt="" decoding="async" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: opcao<string>(tela, 'ajuste') === 'cover' ? 'cover' : 'contain',
      }} />
      {legenda && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, padding: '120px 120px 70px',
          background: 'linear-gradient(transparent, rgba(0,0,0,.72))', color: '#fff',
          fontSize: 64, fontWeight: 700, textAlign: 'center',
        }}>
          {legenda}
        </div>
      )}
    </>
  );
}

/**
 * O vídeo, com ou sem som. Navegador sem clique na página (o PC da TV recém
 * ligado) barra vídeo com som: aí toca mudo e solta o som no primeiro clique
 * ou tecla. Com «duração do arquivo» e rodízio andando, não volta ao começo —
 * para no último quadro até a próxima tela.
 */
function Video({ tela, c, url, parada, semSom }: {
  tela: TelaDoPainel; c: Cores; url: string | null; parada?: boolean; semSom?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const comSom = !semSom && opcao<boolean>(tela, 'com_som') === true;
  const laco = parada || opcao<boolean>(tela, 'tempo_do_arquivo') !== true;

  useEffect(() => {
    const v = ref.current;
    if (!v || !url) return;
    v.muted = !comSom;
    let desfazer: () => void = () => undefined;
    v.play().catch(() => {
      if (v.muted) return;
      v.muted = true;
      void v.play().catch((): void => undefined);
      const soltar = () => { desfazer(); v.muted = false; void v.play().catch((): void => undefined); };
      window.addEventListener('pointerdown', soltar, true);
      window.addEventListener('keydown', soltar, true);
      desfazer = () => {
        window.removeEventListener('pointerdown', soltar, true);
        window.removeEventListener('keydown', soltar, true);
      };
    });
    return () => desfazer();
  }, [url, comSom]);

  if (!url) return <Aviso texto="Escolha um vídeo para esta tela." c={c} />;
  return (
    <video
      ref={ref} src={url} muted={!comSom} loop={laco} playsInline preload="auto"
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#000',
        objectFit: opcao<string>(tela, 'ajuste') === 'cover' ? 'cover' : 'contain',
      }}
    />
  );
}

function Recado({ tela, c }: { tela: TelaDoPainel; c: Cores }) {
  const texto = opcao<string>(tela, 'texto');
  const assinatura = opcao<string>(tela, 'assinatura');
  const tamanho = texto.length > 80 ? 96 : texto.length > 40 ? 124 : 160;
  return (
    <div style={centro}>
      <div style={{ width: 120, height: 10, borderRadius: 10, background: c.destaque, marginBottom: 64 }} />
      <div style={{ fontSize: tamanho, fontWeight: 800, lineHeight: 1.12, textAlign: 'center', maxWidth: 1600, letterSpacing: -2, textWrap: 'balance' as CSSProperties['textWrap'] }}>
        {texto}
      </div>
      {assinatura && <div style={{ fontSize: 48, color: c.suave, marginTop: 56 }}>— {assinatura}</div>}
    </div>
  );
}

// ── A tela inteira: cabeçalho, conteúdo e rodapé ─────────────────────────────

function Relogio({ c }: { c: Cores }) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    // Acorda na virada do minuto, e não a cada segundo: a TV mostra HH:MM.
    let t: ReturnType<typeof setTimeout>;
    const agendar = () => {
      const falta = 60_000 - (Date.now() % 60_000) + 50;
      t = setTimeout(() => { setAgora(new Date()); agendar(); }, falta);
    };
    agendar();
    return () => clearTimeout(t);
  }, []);
  return (
    <span style={{ fontSize: 44, fontWeight: 600, color: c.texto }}>
      {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export interface PropsTelaTv {
  tela: TelaDoPainel;
  tema: TemaId;
  visao: VisaoTv | null;
  /** Já passado por `midiaSegura`. */
  midiaUrl: string | null;
  /** Bolinhas do rodízio: qual é esta e quantas são. */
  posicao?: { atual: number; total: number };
  atualizadoEm?: string | null;
  mes?: string;
  /** Sem rodízio andando (tela fixa, uma tela só): o vídeo fica em laço. */
  parada?: boolean;
  /** Vídeo sempre mudo (a prévia «Na TV agora» do editor). */
  semSom?: boolean;
}

export function TelaTv({ tela, tema, visao, midiaUrl, posicao, atualizadoEm, mes, parada, semSom }: PropsTelaTv) {
  const c = CORES[tema];
  // Tela cheia, sem o cabeçalho e o rodapé: a mídia e o destaque (cada estilo tem a página dele).
  const ehMidia = tela.template === 'imagem' || tela.template === 'video' || tela.template === 'destaque';
  const nomeMes = mes ? MESES[Number(mes.slice(5, 7)) - 1] : undefined;

  let corpo: ReactNode;
  if (tela.template === 'imagem') corpo = <Imagem tela={tela} c={c} url={midiaUrl} />;
  else if (tela.template === 'video') corpo = <Video tela={tela} c={c} url={midiaUrl} parada={parada} semSom={semSom} />;
  else if (tela.template === 'recado') corpo = <Recado tela={tela} c={c} />;
  else if (!visao) corpo = <Aviso texto="Carregando os números…" c={c} />;
  else {
    const P = { v: visao, tela, c };
    corpo = {
      contagem: <Contagem {...P} />, barra: <MetaBarra {...P} />, anel: <Anel {...P} />,
      hoje: <Hoje {...P} />, ritmo: <Ritmo {...P} />, placar: <Placar {...P} />, grafico: <Grafico {...P} />,
      podio: <Podio {...P} />, lista: <Lista {...P} />, destaque: <Destaque v={visao} tela={tela} />,
    }[tela.template as 'contagem'] ?? <Aviso texto="Template desconhecido." c={c} />;
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {corpo}

      {!ehMidia && (
        <div style={{ position: 'absolute', top: 64, left: 120, right: 120, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 34, fontWeight: 700, color: c.suave, letterSpacing: 3, textTransform: 'uppercase' }}>
            {visao?.alvoNome}{nomeMes ? ` · ${nomeMes}` : ''}
          </span>
          <Relogio c={c} />
        </div>
      )}

      {!ehMidia && (
        <div style={{ position: 'absolute', bottom: 56, left: 120, right: 120, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 26, color: c.suave }}>
          <div style={{ display: 'flex', gap: 14 }}>
            {posicao && posicao.total > 1 && Array.from({ length: posicao.total }, (_, i) => (
              <span key={i} style={{
                width: i === posicao.atual ? 44 : 14, height: 14, borderRadius: 14,
                background: i === posicao.atual ? c.destaque : c.trilho,
                transition: 'width 400ms ease',
              }} />
            ))}
          </div>
          <span>
            {visao?.unidade === 'ho' ? 'Valores em H.O. · ' : ''}
            {atualizadoEm ? `Atualizado às ${new Date(atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
