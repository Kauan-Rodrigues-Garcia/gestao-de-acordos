/**
 * CartelasDoJogador.tsx — a cartela na tela de quem joga (baixada sob demanda).
 *
 * - Dobrada: uma aba num canto de baixo, com a última pedra e o contador.
 *   Clicou, abre.
 * - Pedra nova: surge num canto de cima e pisca com brilho por alguns
 *   segundos, com um «plim» (tem mudo). Nunca pega clique.
 * - A pessoa marca na mão. Pedra que ela não marcar no tempo da partida, a
 *   cartela marca sozinha, com outro desenho («marcado para você»).
 * - O «BINGO!» acende quando as marcações fecham uma quina ou a cartela.
 *   Quem confere é o banco.
 * - A comemoração mostra a cartela de cada ganhador — a prova.
 *
 * As marcações moram neste navegador (`localStorage`) e só vão ao banco no
 * grito: nada de chamada por clique.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Volume2, VolumeX, X } from 'lucide-react';
import { assinarTabela } from '@/lib/realtime';
import { Cartela } from '../Cartela';
import { encaixa, lerAviso, melhorFeito, nomeDaVitoria, padrao, paraMarcarSozinho, podeGritar, TOTAL_PEDRAS } from '../regras';
import { gritar, minhaPartida } from '../servico';
import { tocarFanfarra, tocarPlim } from '../som';
import { useTemaBingo } from '../temas';
import type { TemaBingo } from '../temas/contrato';
import type { MinhaPartida, VitoriaBingo } from '../tipos';

const PEDRA_NA_TELA_MS = 6500;
const FESTA_MS = 15_000;
const CHECAGEM_AUTO_MS = 5_000;

export default function CartelasDoJogador({ partidas, perfilId, aoSumir }: {
  partidas: MinhaPartida[]; perfilId: string; aoSumir: (id: string) => void;
}) {
  return (
    <>
      {partidas.map((p, i) => (
        <CartelaDoJogador key={p.partida.id} inicial={p} perfilId={perfilId} indice={i} aoSumir={aoSumir} />
      ))}
    </>
  );
}

// ── Guardado neste navegador ─────────────────────────────────────────────────

function lerConjunto(chave: string): Set<number> {
  try {
    const v = JSON.parse(localStorage.getItem(chave) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n)) : []);
  } catch { return new Set(); }
}
function gravarConjunto(chave: string, s: ReadonlySet<number>): void {
  try { localStorage.setItem(chave, JSON.stringify([...s])); } catch { /* sem armazenamento: só nesta aba */ }
}
function lerLiga(chave: string, padrao: boolean): boolean {
  try { const v = localStorage.getItem(chave); return v == null ? padrao : v === '1'; } catch { return padrao; }
}
function gravarLiga(chave: string, v: boolean): void {
  try { localStorage.setItem(chave, v ? '1' : '0'); } catch { /* idem */ }
}

// ── Uma partida ──────────────────────────────────────────────────────────────

function CartelaDoJogador({ inicial, perfilId, indice, aoSumir }: {
  inicial: MinhaPartida; perfilId: string; indice: number; aoSumir: (id: string) => void;
}) {
  const id = inicial.partida.id;
  const chave = `bingo:${id}:${perfilId}`;
  const tema = useTemaBingo(inicial.partida.tema);

  const [estado, setEstado] = useState(inicial);
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const [marcadas, setMarcadas] = useState(() => lerConjunto(`${chave}:marcadas`));
  const [auto, setAuto] = useState(() => lerConjunto(`${chave}:auto`));
  // Cartela que acabou de chegar abre sozinha, para a pessoa ver que está no jogo.
  const [aberta, setAberta] = useState(() => lerLiga(`bingo:aberta:${id}`, true));
  const [mudo, setMudo] = useState(() => lerLiga('bingo:mudo', false));
  const [pedraNova, setPedraNova] = useState<{ numero: number; chave: number } | null>(null);
  const [festa, setFesta] = useState<VitoriaBingo | null>(null);
  const [encerrada, setEncerrada] = useState(false);
  const [gritando, setGritando] = useState(false);

  useEffect(() => { gravarConjunto(`${chave}:marcadas`, marcadas); }, [chave, marcadas]);
  useEffect(() => { gravarConjunto(`${chave}:auto`, auto); }, [chave, auto]);
  useEffect(() => { gravarLiga(`bingo:aberta:${id}`, aberta); }, [id, aberta]);
  useEffect(() => { gravarLiga('bingo:mudo', mudo); }, [mudo]);

  // Quando a tela viu cada pedra: o relógio da auto-marcação. Pedra que já
  // tinha saído ao abrir conta a partir de agora.
  const vistaEm = useRef(new Map<number, number>());
  useEffect(() => {
    const agora = Date.now();
    for (const n of estado.pedras) if (!vistaEm.current.has(n)) vistaEm.current.set(n, agora);
  }, [estado.pedras]);

  const reler = useCallback(async () => {
    try {
      const e = await minhaPartida(id);
      if (!e || e.partida.estado !== 'aberta') { setEncerrada(true); return; }
      setEstado(e);
    } catch { /* segura o que tem */ }
  }, [id]);

  const mudoRef = useRef(mudo);
  mudoRef.current = mudo;

  // O canal da partida: a pedra vem dentro do aviso.
  useEffect(() => assinarTabela(
    { topico: `bingo:${id}`, escutas: [{ sinal: 'bingo' }] },
    {
      onSinal: (payload) => {
        const aviso = lerAviso(payload);
        if (!aviso || aviso.partida !== id) return;
        if (aviso.tipo === 'pedra') {
          const como = encaixa(estadoRef.current.pedras, aviso);
          if (como === 'repetida') return;
          if (como === 'buraco') { void reler(); return; }
          setEstado(e => ({ ...e, pedras: [...e.pedras, aviso.numero] }));
          setPedraNova({ numero: aviso.numero, chave: Date.now() });
          if (!mudoRef.current) tocarPlim();
          return;
        }
        void reler();
      },
      onReconectado: () => { void reler(); },
    },
  ), [id, reler]);

  // A pedra nova sai da tela sozinha.
  useEffect(() => {
    if (!pedraNova) return;
    const t = setTimeout(() => setPedraNova(null), PEDRA_NA_TELA_MS);
    return () => clearTimeout(t);
  }, [pedraNova]);

  // Encerrada: avisa e some.
  useEffect(() => {
    if (!encerrada) return;
    const t = setTimeout(() => aoSumir(id), 8000);
    return () => clearTimeout(t);
  }, [encerrada, id, aoSumir]);

  // A auto-marcação, conferida de 5 em 5 s enquanto a partida corre.
  const marcadasRef = useRef(marcadas);
  marcadasRef.current = marcadas;
  const limiteMs = estado.partida.auto_marcar_s * 1000;
  useEffect(() => {
    const t = setInterval(() => {
      const e = estadoRef.current;
      setAuto(a => {
        const novas = paraMarcarSozinho(e.numeros, e.pedras, marcadasRef.current, a, vistaEm.current, Date.now(), limiteMs);
        return novas.length ? new Set([...a, ...novas]) : a;
      });
    }, CHECAGEM_AUTO_MS);
    return () => clearInterval(t);
  }, [limiteMs]);

  // A comemoração.
  const vitoriaVista = useRef<string | null>(inicial.vitoria?.id ?? null);
  const idVitoria = estado.vitoria?.id ?? null;
  useEffect(() => {
    const v = estadoRef.current.vitoria;
    if (!v || v.id === vitoriaVista.current) return;
    vitoriaVista.current = v.id;
    setFesta(v);
    if (!mudoRef.current) tocarFanfarra(0.12);
    const t = setTimeout(() => setFesta(null), FESTA_MS);
    return () => clearTimeout(t);
  }, [idVitoria]);

  const valendo = useMemo(() => new Set([...marcadas, ...auto]), [marcadas, auto]);
  const feito = melhorFeito(estado.numeros, valendo);
  const acende = podeGritar(feito, estado.gritou_tipo);
  const sorteadas = useMemo(() => new Set(estado.pedras), [estado.pedras]);

  const tocar = (n: number) => {
    if (!sorteadas.has(n)) { toast('Essa ainda não saiu.', { duration: 1800 }); return; }
    setMarcadas(m => {
      const s = new Set(m);
      if (s.has(n) && !auto.has(n)) s.delete(n); else s.add(n);
      return s;
    });
  };

  const fazerGrito = async () => {
    setGritando(true);
    try {
      const r = await gritar(id, [...valendo]);
      if (!r.ok) { toast.error(r.motivo ?? 'Ainda não fechou.'); return; }
      setEstado(e => ({ ...e, gritou_tipo: r.tipo ?? e.gritou_tipo }));
      toast.success(`Você gritou ${nomeDaVitoria(r.tipo ?? 'quina')}! A liderança vai conferir.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para gritar agora.');
    } finally {
      setGritando(false);
    }
  };

  if (!tema) return null;
  const ultima = estado.pedras[estado.pedras.length - 1];
  const base = 20 + indice * 64;

  return (
    <>
      {pedraNova && <PedraNova key={pedraNova.chave} numero={pedraNova.numero} tema={tema} />}
      {festa && <FestaDoJogador vitoria={festa} estado={estado} tema={tema} perfilId={perfilId} aoFechar={() => setFesta(null)} />}

      {!aberta && (
        <button
          type="button"
          onClick={() => setAberta(true)}
          className="fixed z-[60] flex items-center gap-2.5 rounded-full pl-1.5 pr-4 py-1.5 shadow-lg transition-transform hover:scale-105"
          style={{ left: 20, bottom: base, background: tema.aba.fundo, color: tema.aba.texto, fontFamily: tema.familia }}
          aria-label="Abrir a cartela de bingo"
        >
          {ultima != null ? <tema.Bola numero={ultima} tamanho={40} /> : <span className="h-10 w-10 rounded-full bg-white/30" />}
          <span className="text-sm font-bold leading-tight text-left">
            BINGO<br /><span className="font-semibold opacity-90">{estado.pedras.length}/{TOTAL_PEDRAS}</span>
          </span>
          {acende && <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs font-bold animate-pulse" style={{ color: tema.aba.fundo }}>GRITE!</span>}
        </button>
      )}

      {aberta && (
        <div
          className="fixed z-[60] rounded-3xl shadow-2xl p-3.5 w-[340px] max-w-[calc(100vw-24px)]"
          style={{ left: 12, bottom: base - 8, background: tema.fundoTv, color: tema.texto, fontFamily: tema.familia }}
          role="dialog"
          aria-label="Sua cartela de bingo"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <div className="font-bold" style={{ fontSize: 18 * Math.max(0.75, tema.escalaNumero) }}>Seu bingo</div>
              <div className="text-xs truncate" style={{ color: tema.suave }}>
                {encerrada ? 'Partida encerrada. Obrigado por jogar!' : `${estado.pedras.length} de ${TOTAL_PEDRAS} pedras`}
              </div>
            </div>
            <button type="button" onClick={() => setMudo(m => !m)} className="rounded-full p-1.5 hover:bg-black/10" aria-label={mudo ? 'Ligar o som' : 'Desligar o som'}>
              {mudo ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => setAberta(false)} className="rounded-full p-1.5 hover:bg-black/10" aria-label="Dobrar a cartela">
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 mb-2.5 min-h-[40px]">
            {estado.pedras.slice(-5).reverse().map((n, i) => (
              <div key={n} style={{ opacity: 1 - i * 0.15 }}><tema.Bola numero={n} tamanho={i === 0 ? 40 : 32} /></div>
            ))}
            {!estado.pedras.length && <span className="text-sm" style={{ color: tema.suave }}>Aguardando a primeira pedra…</span>}
          </div>

          <div className="flex justify-center">
            <Cartela tema={tema} numeros={estado.numeros} marcadas={marcadas} auto={auto} celula={50} aoTocar={encerrada ? undefined : tocar} />
          </div>

          <button
            type="button"
            disabled={!acende || gritando || encerrada}
            onClick={fazerGrito}
            className={`mt-3 w-full rounded-2xl py-2.5 text-xl font-bold transition-transform ${acende ? 'animate-pulse hover:scale-[1.02]' : 'opacity-50'}`}
            style={{ background: tema.botao.fundo, color: tema.botao.texto, boxShadow: `0 5px 0 ${tema.botao.sombra}`, fontFamily: tema.familia }}
          >
            {feito === 'cheia' ? 'BINGO!' : feito === 'quina' ? 'QUINA!' : 'BINGO!'}
          </button>

          <div className="mt-2 text-[11px] leading-snug" style={{ color: tema.suave }}>
            {(estado.partida.premio_quina || estado.partida.premio_bingo) && (
              <div className="truncate">
                {estado.partida.premio_quina && <>Quina: <b>{estado.partida.premio_quina}</b>{estado.partida.premio_bingo ? ' · ' : ''}</>}
                {estado.partida.premio_bingo && <>Bingo: <b>{estado.partida.premio_bingo}</b></>}
              </div>
            )}
            Toque nos números que saírem. O que você não marcar em {Math.round(estado.partida.auto_marcar_s / 60)} min, a cartela marca sozinha.
          </div>
        </div>
      )}
      <style>{`
        @keyframes bingo-brilha { 0%, 100% { filter: drop-shadow(0 0 4px #fff8); } 50% { filter: drop-shadow(0 0 22px #fff) brightness(1.15); } }
        @keyframes bingo-cai { from { transform: translateY(-120%) scale(.6); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes bingo-vai { to { opacity: 0; transform: scale(.8) } }
      `}</style>
    </>
  );
}

/** A pedra nova, num canto de cima, brilhando. Não pega clique. */
function PedraNova({ numero, tema }: { numero: number; tema: TemaBingo }) {
  return (
    <div
      className="fixed z-[60] pointer-events-none flex items-center gap-2"
      style={{ top: 72, right: 24, animation: `bingo-cai 600ms cubic-bezier(.2,.9,.3,1.2) both, bingo-vai 600ms ease-in ${PEDRA_NA_TELA_MS - 600}ms forwards` }}
      aria-live="polite"
    >
      <span className="rounded-full px-3 py-1 text-sm font-bold shadow" style={{ background: tema.aba.fundo, color: tema.aba.texto, fontFamily: tema.familia }}>
        Saiu!
      </span>
      <div style={{ animation: 'bingo-brilha 0.9s ease-in-out 6' }}>
        <tema.Bola numero={numero} tamanho={84} brilho />
      </div>
    </div>
  );
}

function FestaDoJogador({ vitoria, estado, tema, perfilId, aoFechar }: {
  vitoria: VitoriaBingo; estado: MinhaPartida; tema: TemaBingo; perfilId: string; aoFechar: () => void;
}) {
  const sorteadas = new Set(estado.pedras);
  const souEu = vitoria.ganhadores.some(g => g.perfil_id === perfilId);
  return (
    <div className="fixed z-[61] left-1/2 top-20 -translate-x-1/2 rounded-3xl shadow-2xl p-5 w-[min(720px,calc(100vw-24px))]"
      style={{ background: tema.fundoTv, color: tema.texto, fontFamily: tema.familia, animation: 'bingo-cai 600ms cubic-bezier(.2,.9,.3,1.2) both' }}
      role="dialog" aria-label="Comemoração do bingo">
      <button type="button" onClick={aoFechar} className="absolute right-3 top-3 rounded-full p-1.5 hover:bg-black/10" aria-label="Fechar">
        <X className="h-4 w-4" />
      </button>
      <div className="text-center">
        <div className="font-bold" style={{ fontSize: 44 * tema.escalaNumero, color: tema.destaque }}>{nomeDaVitoria(vitoria.tipo)}!</div>
        <div className="font-semibold">{souEu ? 'Você ganhou! 🎉' : vitoria.tipo === 'cheia' ? tema.frases.cheia : tema.frases.quina}</div>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-5">
        {vitoria.ganhadores.slice(0, 4).map(g => (
          <div key={g.perfil_id} className="flex flex-col items-center gap-2">
            <div className="font-bold text-sm">{g.nome.split(' ')[0]}</div>
            <Cartela tema={tema} numeros={g.numeros} marcadas={sorteadas} vence={g.padrao ?? padrao(g.numeros, sorteadas, vitoria.tipo) ?? []} celula={30} />
          </div>
        ))}
      </div>
      <div className="mt-3 text-center text-xs" style={{ color: tema.suave }}>A linha em destaque é a prova: todos esses números já saíram.</div>
    </div>
  );
}
