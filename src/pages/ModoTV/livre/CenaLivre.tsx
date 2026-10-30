/**
 * CenaLivre.tsx — a «Cena livre» desenhada no palco de 1920×1080.
 *
 * O MESMO componente na TV, na prévia da montagem e no estúdio (com
 * `editor`), pelo mesmo motivo do `CardV2` das Comemorações: se fossem dois,
 * o líder só descobriria a diferença com a cena já na parede.
 *
 * Leve para o PC da TV: entrada e efeito são `transform`/`opacity` em CSS, o
 * relógio acorda na virada do minuto, e as fontes de enfeite só baixam quando
 * a cena usa alguma.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { papelDeParede } from '@/components/comemoracao2/papeisDeParede';
import type { VisaoTv } from '../numeros';
import { midiaSegura } from '../templates';
import { FONTES_LIVRES, type CenaLivre as Cena, type ElementoLivre, type EstiloTexto, type FundoCena } from './cena';
import { valorDaMetrica } from './metricas';

const BASE_SUPABASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';

const ID_FONTES = 'tv-livre-fontes';
const URL_FONTES = 'https://fonts.googleapis.com/css2'
  + '?family=Anton'
  + '&family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800'
  + '&family=Fraunces:ital,opsz,wght@1,9..144,700'
  + '&family=Fredoka:wght@600;700'
  + '&family=Press+Start+2P'
  + '&family=Caveat:wght@700'
  + '&display=swap';

/** Uma vez por página, e só se a cena usa letra de enfeite. Falhar = letra reserva. */
function carregarFontes(cena: Cena): void {
  try {
    if (typeof document === 'undefined' || document.getElementById(ID_FONTES)) return;
    const usa = cena.elementos.some(e => 'fonte' in e && e.fonte !== 'padrao');
    if (!usa) return;
    const link = document.createElement('link');
    link.id = ID_FONTES;
    link.rel = 'stylesheet';
    link.href = URL_FONTES;
    document.head.appendChild(link);
  } catch { /* a cena aparece na letra do sistema */ }
}

/** O raio dos cantos: 0–50 vira px do palco. */
const raioPx = (r: number) => Math.round(r * 6);

function fundoDaCena(fundo: FundoCena): CSSProperties | null {
  switch (fundo.tipo) {
    case 'cor': return { background: fundo.cor };
    case 'degrade': return { background: `linear-gradient(${fundo.angulo}deg, ${fundo.de}, ${fundo.para})` };
    case 'papel': return { background: papelDeParede(fundo.id).fundo };
    default: return null;
  }
}

/** Fundo «do tema»: não pinta nada, e o palco (`PalcoTv`) mostra o do painel. */
export function CenaLivre({ cena, visao, editor = false, animar = !editor }: {
  cena: Cena;
  visao: VisaoTv | null;
  /** No estúdio: imagem sem arquivo vira um quadro tracejado. */
  editor?: boolean;
  /** Toca as entradas. No estúdio, só quando o líder pede «Ver animação». */
  animar?: boolean;
}) {
  useEffect(() => { carregarFontes(cena); }, [cena]);
  const fundo = fundoDaCena(cena.fundo);
  const imagemDeFundo = cena.fundo.tipo === 'imagem' ? midiaSegura(cena.fundo.url, BASE_SUPABASE) : null;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', ...(fundo ?? {}) }}>
      {imagemDeFundo && (
        <>
          <img src={imagemDeFundo} alt="" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          {cena.fundo.tipo === 'imagem' && cena.fundo.escurecer > 0 && (
            <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${cena.fundo.escurecer})` }} />
          )}
        </>
      )}
      {cena.elementos.map(e => (
        <Elemento key={e.id} e={e} visao={visao} editor={editor} animar={animar} />
      ))}
      <style>{ESTILOS}</style>
    </div>
  );
}

const ESTILOS = `
@keyframes livre-suave    { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: none; } }
@keyframes livre-impacto  { 0% { opacity: 0; transform: scale(1.6); } 60% { opacity: 1; transform: scale(.94); } 100% { transform: none; } }
@keyframes livre-deslizar { from { opacity: 0; transform: translateY(60px); } to { opacity: 1; transform: none; } }
@keyframes livre-maquina  { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes livre-pulsar   { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
@keyframes livre-flutuar  { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
@keyframes livre-brilhar  { 0%, 100% { opacity: 1; } 50% { opacity: .62; } }
@media (prefers-reduced-motion: reduce) {
  .livre-entra, .livre-efeito { animation: none !important; }
}`;

const ENTRADA: Record<string, string> = {
  suave: 'livre-suave 900ms ease-out both',
  impacto: 'livre-impacto 700ms cubic-bezier(.2,.9,.3,1.2) both',
  deslizar: 'livre-deslizar 900ms cubic-bezier(.2,.8,.2,1) both',
  maquina: 'livre-maquina 1600ms steps(28) both',
};
const EFEITO: Record<string, string> = {
  pulsar: 'livre-pulsar 2.4s ease-in-out infinite',
  flutuar: 'livre-flutuar 3.2s ease-in-out infinite',
  brilhar: 'livre-brilhar 2s ease-in-out infinite',
};

function Elemento({ e, visao, editor, animar }: { e: ElementoLivre; visao: VisaoTv | null; editor: boolean; animar: boolean }) {
  const entrada = animar && e.entrada !== 'nenhuma' ? ENTRADA[e.entrada] : undefined;
  // O efeito contínuo começa depois da entrada, para os dois não brigarem pelo `transform`.
  const efeito = animar && e.efeito !== 'nenhum' ? EFEITO[e.efeito] : undefined;
  return (
    <div style={{
      position: 'absolute', left: `${e.x}%`, top: `${e.y}%`, width: `${e.l}%`, height: `${e.a}%`,
      transform: e.rot ? `rotate(${e.rot}deg)` : undefined, opacity: e.opacidade,
    }}>
      <div className="livre-entra" style={{ position: 'absolute', inset: 0, animation: entrada, animationDelay: entrada ? `${e.atraso}s` : undefined }}>
        <div className="livre-efeito" style={{
          position: 'absolute', inset: 0, animation: efeito,
          animationDelay: efeito ? `${e.atraso + 1}s` : undefined,
        }}>
          <Conteudo e={e} visao={visao} editor={editor} />
        </div>
      </div>
    </div>
  );
}

function Conteudo({ e, visao, editor }: { e: ElementoLivre; visao: VisaoTv | null; editor: boolean }) {
  switch (e.tipo) {
    case 'texto':
      return <Letreiro estilo={e}>{e.texto || (editor ? 'Texto vazio' : '')}</Letreiro>;
    case 'numero':
      return (
        <Letreiro estilo={e}>
          {e.rotulo && <span style={{ display: 'block', fontSize: '0.36em', opacity: 0.85, marginBottom: '0.1em' }}>{e.rotulo}</span>}
          {valorDaMetrica(visao, e.metrica)}
        </Letreiro>
      );
    case 'relogio':
      return <Letreiro estilo={e}><Hora formato={e.formato} /></Letreiro>;
    case 'imagem': {
      const src = midiaSegura(e.url, BASE_SUPABASE);
      if (!src) {
        return editor ? (
          <div style={{
            position: 'absolute', inset: 0, border: '6px dashed rgba(255,255,255,.45)', borderRadius: raioPx(e.raio),
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, color: 'rgba(255,255,255,.7)',
            background: 'rgba(0,0,0,.18)',
          }}>Escolha a imagem</div>
        ) : null;
      }
      return (
        <img src={src} alt="" decoding="async" draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: e.ajuste, borderRadius: raioPx(e.raio) }} />
      );
    }
    case 'forma':
      return (
        <div style={{
          position: 'absolute', inset: 0, background: e.cor,
          borderRadius: e.forma === 'circulo' ? '50%' : raioPx(e.raio),
          border: e.borda ? `8px solid ${e.borda}` : undefined,
        }} />
      );
  }
}

/** Texto, número e relógio: a mesma tipografia, a tarja e o contorno. */
function Letreiro({ estilo, children }: { estilo: EstiloTexto; children: ReactNode }) {
  const fonte = FONTES_LIVRES.find(f => f.id === estilo.fonte) ?? FONTES_LIVRES[0];
  // A letra de pixel é larga: o mesmo corpo estoura a caixa.
  const corpo = estilo.fonte === 'pixel' ? Math.round(estilo.tamanho * 0.62) : estilo.tamanho;
  const tarja = estilo.tarja
    ? { background: estilo.tarja, padding: '0.08em 0.32em', borderRadius: '0.18em', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' } as CSSProperties
    : {};
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: estilo.alinhar === 'esq' ? 'flex-start' : estilo.alinhar === 'dir' ? 'flex-end' : 'center',
      textAlign: estilo.alinhar === 'esq' ? 'left' : estilo.alinhar === 'dir' ? 'right' : 'center',
    }}>
      <span style={{
        fontFamily: fonte.familia, fontWeight: fonte.peso, fontSize: corpo, lineHeight: 1.12, color: estilo.cor,
        textTransform: fonte.maiusculas ? 'uppercase' : undefined,
        whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: '100%',
        WebkitTextStroke: estilo.contorno ? `${Math.max(2, Math.round(corpo / 28))}px rgba(0,0,0,.85)` : undefined,
        paintOrder: 'stroke fill',
        textShadow: estilo.sombra ? '0 4px 18px rgba(0,0,0,.45)' : undefined,
        ...tarja,
      }}>
        {children}
      </span>
    </div>
  );
}

const DIA = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

function Hora({ formato }: { formato: 'hora' | 'data' | 'hora_data' }) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    // Acorda na virada do minuto, como o relógio do cabeçalho das outras telas.
    let t: ReturnType<typeof setTimeout>;
    const agendar = () => {
      t = setTimeout(() => { setAgora(new Date()); agendar(); }, 60_000 - (Date.now() % 60_000) + 50);
    };
    agendar();
    return () => clearTimeout(t);
  }, []);
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dia = DIA.format(agora);
  if (formato === 'hora') return <>{hora}</>;
  if (formato === 'data') return <>{dia}</>;
  return <>{hora} · {dia}</>;
}
