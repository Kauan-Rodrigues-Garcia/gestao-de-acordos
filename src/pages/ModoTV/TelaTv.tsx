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
import { opcao } from './templates';
import { iniciais, moedaTv, nomeCurto, percentualTv, type VisaoTv } from './numeros';

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

function useContador(alvo: number, duracaoMs = 900): number {
  const [valor, setValor] = useState(alvo);
  const atual = useRef(alvo);

  useEffect(() => {
    const de = atual.current;
    if (de === alvo) return;
    const reduzido = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduzido) { atual.current = alvo; setValor(alvo); return; }

    let quadro = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / duracaoMs);
      const v = de + (alvo - de) * (1 - Math.pow(1 - t, 3));
      atual.current = v;
      setValor(v);
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [alvo, duracaoMs]);

  return valor;
}

function Moeda({ v, style }: { v: number; style?: CSSProperties }) {
  const animado = useContador(v);
  return <span style={style}>{moedaTv(animado)}</span>;
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
        background: cor ?? c.destaque, transition: 'width 900ms cubic-bezier(.2,.8,.2,1)',
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

function Contagem({ v, tela, c }: { v: VisaoTv; tela: TelaDoPainel; c: Cores }) {
  if (v.meta <= 0) return <Aviso texto={SEM_META} c={c} />;
  if (v.batida) {
    return (
      <div style={centro}>
        <div style={{ fontSize: 60, fontWeight: 700, color: c.ok, letterSpacing: 6 }}>META BATIDA</div>
        <Moeda v={v.recebido} style={{ fontSize: 230, fontWeight: 800, lineHeight: 1, margin: '20px 0 28px', letterSpacing: -4 }} />
        <div style={{ fontSize: 44, color: c.suave }}>
          {percentualTv(v.fracao)} da meta · {moedaTv(v.recebido - v.meta)} acima
        </div>
      </div>
    );
  }
  return (
    <div style={centro}>
      <Titulo texto={opcao<string>(tela, 'titulo')} c={c} />
      <Moeda v={v.falta} style={{ fontSize: 250, fontWeight: 800, lineHeight: 1, letterSpacing: -6 }} />
      <div style={{ width: 1200, margin: '56px 0 36px' }}>
        <Barra fracao={v.fracao} c={c} altura={18} />
      </div>
      <div style={{ display: 'flex', gap: 72, fontSize: 38, color: c.suave }}>
        <span>Recebido <b style={{ color: c.texto }}>{moedaTv(v.recebido)}</b></span>
        <span>Meta <b style={{ color: c.texto }}>{moedaTv(v.meta)}</b></span>
        <span><b style={{ color: c.destaque }}>{v.diasRestantes}</b> {v.diasRestantes === 1 ? 'dia útil' : 'dias úteis'} pela frente</span>
      </div>
    </div>
  );
}

function MetaBarra({ v, tela, c }: { v: VisaoTv; tela: TelaDoPainel; c: Cores }) {
  if (v.meta <= 0) return <Aviso texto={SEM_META} c={c} />;
  return (
    <div style={centro}>
      <Titulo texto={opcao<string>(tela, 'titulo')} c={c} />
      <div style={{ fontSize: 280, fontWeight: 800, lineHeight: 1, letterSpacing: -6, color: v.batida ? c.ok : c.texto }}>
        {percentualTv(v.fracao)}
      </div>
      <div style={{ width: 1400, margin: '60px 0 40px' }}>
        <Barra fracao={v.fracao} c={c} altura={56} cor={v.batida ? c.ok : undefined} />
      </div>
      <div style={{ fontSize: 50, color: c.suave }}>
        <Moeda v={v.recebido} style={{ color: c.texto, fontWeight: 700 }} /> de {moedaTv(v.meta)}
      </div>
    </div>
  );
}

function Anel({ v, tela, c }: { v: VisaoTv; tela: TelaDoPainel; c: Cores }) {
  if (v.meta <= 0) return <Aviso texto={SEM_META} c={c} />;
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
            style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 150, fontWeight: 800, letterSpacing: -3 }}>
          {percentualTv(v.fracao)}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 56, alignItems: 'flex-start' }}>
        <Titulo texto={opcao<string>(tela, 'titulo')} c={c} />
        <Rotulado rotulo="Recebido" c={c} tamanho={88}><Moeda v={v.recebido} /></Rotulado>
        <Rotulado rotulo={v.batida ? 'Acima da meta' : 'Falta'} c={c} tamanho={88} cor={v.batida ? c.ok : c.destaque}>
          <Moeda v={v.batida ? v.recebido - v.meta : v.falta} />
        </Rotulado>
      </div>
    </div>
  );
}

function Hoje({ v, tela, c }: { v: VisaoTv; tela: TelaDoPainel; c: Cores }) {
  if (v.hoje.alvo <= 0) return <Aviso texto={SEM_META} c={c} />;
  const bateu = v.hoje.recebido >= v.hoje.alvo;
  return (
    <div style={centro}>
      <Titulo texto={opcao<string>(tela, 'titulo')} c={c} />
      <Moeda v={v.hoje.recebido} style={{ fontSize: 230, fontWeight: 800, lineHeight: 1, letterSpacing: -5, color: bateu ? c.ok : c.texto }} />
      <div style={{ fontSize: 48, color: c.suave, marginTop: 20 }}>de {moedaTv(v.hoje.alvo)} hoje</div>
      <div style={{ width: 1300, margin: '56px 0 36px' }}>
        <Barra fracao={v.hoje.fracao} c={c} altura={40} cor={bateu ? c.ok : undefined} />
      </div>
      <div style={{ fontSize: 46, fontWeight: 600, color: bateu ? c.ok : c.destaque }}>
        {bateu ? 'Meta de hoje batida!' : `Faltam ${moedaTv(v.hoje.falta)} hoje`}
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
          <Moeda v={v.batida ? 0 : v.ritmo} style={{ fontSize: 112, fontWeight: 800, color: v.batida ? c.ok : c.destaque, letterSpacing: -3 }} />
          <div style={{ fontSize: 32, color: c.suave, marginTop: 20 }}>
            {v.diasRestantes} {v.diasRestantes === 1 ? 'dia útil restante' : 'dias úteis restantes'}
          </div>
        </div>
        <div style={{ width: 760, padding: '56px 40px', borderRadius: 40, background: c.linha, textAlign: 'center' }}>
          <div style={{ fontSize: 36, color: c.suave, marginBottom: 20 }}>No ritmo atual, o mês fecha em</div>
          <Moeda v={v.projecao} style={{ fontSize: 112, fontWeight: 800, letterSpacing: -3 }} />
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
  const caixa: CSSProperties = { flex: 1, padding: '64px 32px', borderRadius: 40, background: c.linha };
  return (
    <div style={centro}>
      <Titulo texto={opcao<string>(tela, 'titulo')} c={c} />
      <div style={{ display: 'flex', gap: 48, width: '100%', marginTop: 24 }}>
        <div style={caixa}><Rotulado rotulo="Recebido" c={c} tamanho={110}><Moeda v={v.recebido} /></Rotulado></div>
        <div style={caixa}><Rotulado rotulo="Meta" c={c} tamanho={110}>{moedaTv(v.meta)}</Rotulado></div>
        <div style={caixa}>
          <Rotulado rotulo={v.batida ? 'Acima' : 'Falta'} c={c} tamanho={110} cor={v.batida ? c.ok : c.destaque}>
            <Moeda v={v.batida ? v.recebido - v.meta : v.falta} />
          </Rotulado>
        </div>
      </div>
      <div style={{ width: '100%', marginTop: 56 }}>
        <Barra fracao={v.fracao} c={c} altura={20} cor={v.batida ? c.ok : undefined} />
      </div>
      <div style={{ fontSize: 40, color: c.suave, marginTop: 24 }}>{percentualTv(v.fracao)} da meta</div>
    </div>
  );
}

const MEDALHA = ['#f5c542', '#a9b4c4', '#d6935a'];

function Podio({ v, tela, c }: { v: VisaoTv; tela: TelaDoPainel; c: Cores }) {
  const top = v.ranking.slice(0, 3);
  if (!top.length) return <Aviso texto="Ainda não há recebimento neste mês." c={c} />;
  const mostrar = opcao<boolean>(tela, 'mostrar_valor');
  // 2º, 1º, 3º — o primeiro no meio e mais alto.
  const ordem = [1, 0, 2].filter(i => top[i]);
  const altura = [280, 200, 150];
  return (
    <div style={{ ...centro, justifyContent: 'flex-end', paddingBottom: 0 }}>
      <Titulo texto={opcao<string>(tela, 'titulo')} c={c} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 56, marginTop: 'auto' }}>
        {ordem.map(i => {
          const p = top[i];
          return (
            <div key={p.id} style={{ width: 460, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Foto nome={p.nome} foto={p.foto} tamanho={i === 0 ? 190 : 150} c={c} borda={MEDALHA[i]} />
              <div style={{ fontSize: i === 0 ? 52 : 44, fontWeight: 700, marginTop: 24, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 460 }}>
                {nomeCurto(p.nome)}
              </div>
              {mostrar && <Moeda v={p.valor} style={{ fontSize: 40, color: c.suave, marginTop: 6 }} />}
              <div style={{
                width: '100%', height: altura[i], marginTop: 28, borderRadius: '28px 28px 0 0',
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
  const mostrar = opcao<boolean>(tela, 'mostrar_valor');
  const duasColunas = pessoas.length > 5;
  const linha = duasColunas ? 112 : 124;
  return (
    <div style={{ ...centro, top: 140, justifyContent: 'flex-start' }}>
      <Titulo texto={opcao<string>(tela, 'titulo')} c={c} />
      <div style={{
        display: 'grid', width: '100%', gap: '18px 56px',
        gridTemplateColumns: duasColunas ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
        gridAutoFlow: duasColunas ? 'column' : 'row',
        gridTemplateRows: `repeat(${duasColunas ? 5 : pessoas.length}, ${linha}px)`,
        maxWidth: duasColunas ? undefined : 1300,
      }}>
        {pessoas.map((p, i) => (
          <div key={p.id} style={{
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

function Video({ tela, c, url }: { tela: TelaDoPainel; c: Cores; url: string | null }) {
  if (!url) return <Aviso texto="Escolha um vídeo para esta tela." c={c} />;
  return (
    <video
      src={url} autoPlay muted loop playsInline preload="auto"
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
}

export function TelaTv({ tela, tema, visao, midiaUrl, posicao, atualizadoEm, mes }: PropsTelaTv) {
  const c = CORES[tema];
  const ehMidia = tela.template === 'imagem' || tela.template === 'video';
  const nomeMes = mes ? MESES[Number(mes.slice(5, 7)) - 1] : undefined;

  let corpo: ReactNode;
  if (tela.template === 'imagem') corpo = <Imagem tela={tela} c={c} url={midiaUrl} />;
  else if (tela.template === 'video') corpo = <Video tela={tela} c={c} url={midiaUrl} />;
  else if (tela.template === 'recado') corpo = <Recado tela={tela} c={c} />;
  else if (!visao) corpo = <Aviso texto="Carregando os números…" c={c} />;
  else {
    const P = { v: visao, tela, c };
    corpo = {
      contagem: <Contagem {...P} />, barra: <MetaBarra {...P} />, anel: <Anel {...P} />,
      hoje: <Hoje {...P} />, ritmo: <Ritmo {...P} />, placar: <Placar {...P} />,
      podio: <Podio {...P} />, lista: <Lista {...P} />,
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
