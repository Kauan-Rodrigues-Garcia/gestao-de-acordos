/**
 * A carta do Charada no modo Batman (pedido de 05/10/2026), no estilo dos
 * cartazes do filme: um envelope pequeno «Para o Batman» encosta no canto; aberto,
 * é um cartão de papel velho rasgado, preso com fita, com a moldura e os rabiscos
 * a marcador vermelho, a charada e a resposta numa cifra de sinais desenhados
 * à mão. A pessoa arrisca um palpite; errou, ele provoca; acertou, desistiu ou
 * esgotou as tentativas, cada sinal é riscado e a letra aparece escrita.
 *
 * O envelope vai embora sozinho se ninguém abrir em 90 s, ou se o tema sair.
 */
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils';
import { carregarFontesDoCartaz } from '../../fonte';
import { CHARADAS, cifrar, confere, sortearCharada } from './charadas';

const TENTATIVAS = 3;

/** O traço tremido do marcador do Charada: um filtro só, usado por CSS (`filter: url(#gt-rabisco)`). */
export function FiltrosDoCharada() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <filter id="gt-rabisco"><feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="1" seed="3" /><feDisplacementMap in="SourceGraphic" scale="2.6" /></filter>
      <filter id="gt-rabisco-forte"><feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="2" seed="9" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter>
    </svg>
  );
}

const vistas: number[] = [];
const PROVOCACOES = ['ERRADO.', 'NÃO, BATMAN.', 'PENSE MELHOR.', 'TÃO PERTO… OU NÃO.'];

/**
 * A cifra do Charada, desenhada à mão: 26 sinais de marcador (triângulos,
 * luas, olhos, setas, cruzes) no lugar das letras. Cada carta embaralha qual
 * sinal é qual letra (`cifrar`, em `charadas.ts`). Caixa 24 × 24.
 */
const GLIFOS = [
  'M4 20 L12 4 L20 20 Z M12 14.5 v.5',
  'M12 3 V21 M5 9 L12 3 L19 9',
  'M7 4 C19 4 19 20 7 20',
  'M4 12 H20 M12 4 V20 M7 7 L17 17',
  'M12 4 L20 12 L12 20 L4 12 Z',
  'M4 6 H20 L4 18 H20',
  'M6 4 V20 H18',
  'M12 4 a8 8 0 1 0 .01 0 M12 12 v.5',
  'M4 20 L12 4 L20 20 M7.5 14 H16.5',
  'M5 5 H19 V19 H5 Z M5 5 L19 19',
  'M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z',
  'M4 18 C8 4 16 4 20 18',
  'M6 4 L18 20 M18 4 L12 12',
  'M4 8 L12 4 L20 8 V16 L12 20 L4 16 Z',
  'M12 4 C4 4 4 12 12 12 C20 12 20 20 12 20',
  'M4 12 a8 8 0 0 1 16 0 M12 12 V20 Q12 22 10 21',
  'M5 5 L19 19 M5 19 L19 5 M4 12 H20',
  'M6 20 V4 L18 20 V4',
  'M4 16 L10 8 L14 14 L20 6',
  'M12 4 V20 M6 4 H18 M6 20 H18',
  'M5 19 L12 5 L19 19 M12 13 a2 2 0 1 0 .01 0',
  'M3 12 Q12 3 21 12 Q12 21 3 12 Z M12 12 v.5',
  'M8 4 V20 M8 4 Q20 4 16 11 Q13 16 20 20',
  'M5 4 H19 V12 H5 Z M12 12 V20',
  'M12 4 a8 8 0 1 0 .01 0 M4 12 H20',
  'M6 5 H18 L6 19 H18 M12 2 V22',
];

/** Número de 0 a 1 que depende só da semente (o mesmo desenho em todo quadro). */
function semeado(semente: number) {
  let x = (Math.abs(Math.floor(semente)) % 2147483646) + 1;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
}

/** A moldura em marcador vermelho: dois traços tortos em volta, como feita à mão. */
function MolduraRabiscada({ semente }: { semente: number }) {
  const d = useMemo(() => {
    const r = semeado(semente);
    const linha = (desvio: number) => {
      const pts: string[] = [];
      const j = () => (r() - 0.5) * desvio;
      for (let x = 2; x <= 98; x += 12) pts.push(`${(x + j()).toFixed(1)} ${(2 + j()).toFixed(1)}`);
      for (let y = 2; y <= 98; y += 12) pts.push(`${(98 + j()).toFixed(1)} ${(y + j()).toFixed(1)}`);
      for (let x = 98; x >= 2; x -= 12) pts.push(`${(x + j()).toFixed(1)} ${(98 + j()).toFixed(1)}`);
      for (let y = 98; y >= 6; y -= 12) pts.push(`${(2 + j()).toFixed(1)} ${(y + j()).toFixed(1)}`);
      return `M${pts.join(' L')}`;
    };
    return [linha(1.6), linha(2.4)];
  }, [semente]);
  return (
    <svg className="ch-moldura" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d={d[0]} /><path d={d[1]} className="segundo" />
    </svg>
  );
}

/** A borda rasgada do cartão, igual em toda carta. */
const RASGO_DO_CARTAO = (() => {
  const r = semeado(29);
  const p: string[] = [];
  const pt = (x: number, y: number) => p.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  for (let x = 0; x <= 100; x += 4) pt(x, r() * 0.8);
  for (let y = 0; y <= 100; y += 3) pt(100 - r() * 0.8, y);
  for (let x = 100; x >= 0; x -= 2.2) pt(x, 100 - r() * 2.4);
  for (let y = 100; y >= 0; y -= 2.4) pt(r() * 2, y);
  return `polygon(${p.join(',')})`;
})();

/** O «?» do Charada, em traço de marcador. */
function Interrogacao({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 200" aria-hidden="true">
      <path d="M22 52 C18 20 48 6 70 10 C98 15 110 40 100 62 C92 80 70 86 62 104 C57 116 60 128 61 140" />
      <circle cx="62" cy="176" r="10" />
    </svg>
  );
}
/** A mira «+» dos cartazes do Charada. */
function Mira({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 60" aria-hidden="true">
      <path d="M4 30 H96 M22 14 V46 M78 12 V48" />
    </svg>
  );
}

export function CartaDoCharada({ recolher, aoTerminar }: { recolher: boolean; aoTerminar: () => void }) {
  const [indice] = useState(() => {
    const i = sortearCharada(vistas, Math.random());
    if (!vistas.includes(i)) vistas.push(i);
    return i;
  });
  const [semente] = useState(() => Math.floor(Math.random() * 1e9));
  const { pergunta, resposta } = CHARADAS[indice];
  const casas = useMemo(() => cifrar(resposta, semente), [resposta, semente]);
  const ordem = useMemo(() => { let n = 0; return casas.map(x => ('espaco' in x ? -1 : n++)); }, [casas]);
  const total = ordem.filter(o => o >= 0).length;

  const [estado, setEstado] = useState<'envelope' | 'aberta' | 'saindo'>('envelope');
  const [palpite, setPalpite] = useState('');
  const [erros, setErros] = useState(0);
  const [fim, setFim] = useState<null | 'acertou' | 'desistiu'>(null);
  const [recado, setRecado] = useState('');
  const [treme, setTreme] = useState(0);
  const [lidas, setLidas] = useState(0);
  const titulo = useId();
  const campo = useRef<HTMLInputElement>(null);

  useEffect(carregarFontesDoCartaz, []);
  useEffect(() => { if (estado === 'aberta') campo.current?.focus(); }, [estado]);
  // Ninguém abriu em 90 s, ou o tema está saindo: o envelope vai embora.
  useEffect(() => {
    if (estado !== 'envelope') return;
    if (recolher) { setEstado('saindo'); return; }
    const t = window.setTimeout(() => setEstado('saindo'), 90_000);
    return () => window.clearTimeout(t);
  }, [estado, recolher]);
  // Acabou (acertou ou desistiu): as letras aparecem uma a uma.
  useEffect(() => {
    if (!fim || lidas >= total) return;
    const t = window.setTimeout(() => setLidas(l => l + 1), 110);
    return () => window.clearTimeout(t);
  }, [fim, lidas, total]);
  useEffect(() => {
    if (estado !== 'aberta') return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') aoTerminar(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [estado, aoTerminar]);

  const arriscar = (e: FormEvent) => {
    e.preventDefault();
    if (fim || !palpite.trim()) return;
    if (confere(palpite, resposta)) { setFim('acertou'); setRecado('CORRETO. VOCÊ É BOM NISSO.'); return; }
    const n = erros + 1;
    setErros(n); setTreme(x => x + 1); setPalpite('');
    if (n >= TENTATIVAS) { setFim('desistiu'); setRecado('A RESPOSTA ERA ESTA. ATÉ A PRÓXIMA.'); }
    else setRecado(`${PROVOCACOES[(n - 1) % PROVOCACOES.length]} RESTA${TENTATIVAS - n > 1 ? 'M' : ''} ${TENTATIVAS - n}.`);
  };

  if (estado === 'aberta') {
    return (
      <div className="ch-fundo" onPointerDown={e => { if (e.target === e.currentTarget) aoTerminar(); }}>
        <div role="dialog" aria-modal="true" aria-labelledby={titulo} className="ch-cartao" key={treme} data-treme={treme > 0 || undefined}>
          <span className="ch-cartao-fita f1" aria-hidden="true" /><span className="ch-cartao-fita f2" aria-hidden="true" />
          <div className="ch-papel" style={{ clipPath: RASGO_DO_CARTAO }}>
          <span className="ch-mancha m1" aria-hidden="true" /><span className="ch-mancha m2" aria-hidden="true" />
          <MolduraRabiscada semente={semente} />
          <Interrogacao className="ch-interrogacao" />
          <Mira className="ch-mira m1" /><Mira className="ch-mira m2" />
          <p id={titulo} className="ch-para">Para o Batman</p>
          <p className="ch-pergunta">{pergunta}</p>
          <p className="ch-oque">O que é?</p>
          <div className="ch-cifra" role="img" aria-label={lidas >= total ? `Resposta: ${resposta}` : 'Resposta cifrada em sinais desenhados'}>
            {casas.map((x, i) => ('espaco' in x
              ? <span key={i} className="ch-vao" />
              : (
                <span key={i} className={cn('ch-casa', ordem[i] < lidas && 'lida')} style={{ ['--giro' as string]: `${((semente >> (i % 13)) % 15) - 7}deg` }}>
                  <svg className="ch-glifo" viewBox="0 0 24 24" aria-hidden="true">
                    <path d={GLIFOS[x.glifo % GLIFOS.length]} />
                    <path className="ch-risca" d="M2 19 C8 15 14 10 22 4" pathLength={1} />
                  </svg>
                  <i>{x.letra}</i>
                  <svg className="ch-traco" viewBox="0 0 24 4" preserveAspectRatio="none" aria-hidden="true"><path d="M1 2.4 Q7 0.9 12 2.1 T23 1.6" /></svg>
                </span>
              )))}
          </div>
          {!fim ? (
            <form className="ch-palpite" onSubmit={arriscar}>
              <input ref={campo} value={palpite} onChange={e => setPalpite(e.target.value)} placeholder="Seu palpite" aria-label="Seu palpite" autoComplete="off" />
              <button type="submit" className="ch-arriscar">Arriscar</button>
            </form>
          ) : null}
          <p className={cn('ch-recado', fim === 'acertou' && 'certo')} aria-live="polite">{recado}</p>
          <div className="ch-acoes">
            {!fim && <button type="button" className="ch-texto" onClick={() => { setFim('desistiu'); setRecado('DESISTIU? QUE DECEPÇÃO.'); }}>Desistir</button>}
            <button type="button" className="ch-texto" onClick={aoTerminar}>Fechar</button>
          </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <button type="button" className={cn('ch-envelope', estado === 'saindo' && 'saindo')} disabled={estado === 'saindo'}
      onClick={() => setEstado('aberta')} onAnimationEnd={e => { if (e.animationName === 'ch-sai') aoTerminar(); }}
      aria-label="Uma carta do Charada para o Batman. Abrir">
      <span className="ch-fita" aria-hidden="true" />
      <span className="ch-envelope-para" aria-hidden="true">Para o<br />Batman</span>
      <Interrogacao className="ch-envelope-q" />
    </button>
  );
}

