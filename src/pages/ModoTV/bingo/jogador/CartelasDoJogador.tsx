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
 *
 * Sem `prefers-reduced-motion` e fora do modo leve (`data-bingo-anima`), pelo
 * mesmo motivo da TV (ver `BingoTv.tsx`): a pedra que surge e o botão que
 * chama são o aviso de que é a vez da pessoa. Só transform e opacidade.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Volume2, VolumeX, X } from 'lucide-react';
import { assinarTabela } from '@/lib/realtime';
import { Cartela } from '../Cartela';
import {
  encaixa, lerAviso, melhorFeito, nomeDaVitoria, padrao, paraMarcarSozinho, pedrasParaMostrar, podeGritar,
  REVELAR_AO_JOGADOR_MS, TOTAL_PEDRAS,
} from '../regras';
import { gritar, minhaPartida } from '../servico';
import { tocarFanfarra, tocarPlim } from '../som';
import { useTemaBingo } from '../temas';
import type { TemaBingo } from '../temas/contrato';
import type { MinhaPartida, VitoriaBingo } from '../tipos';

const PEDRA_NA_TELA_MS = 6500;
const FESTA_MS = 15_000;
const CHECAGEM_AUTO_MS = 5_000;

export default function CartelasDoJogador({ partidas, perfilId, somenteVer, aoSumir }: {
  partidas: MinhaPartida[]; perfilId: string; somenteVer: boolean; aoSumir: (id: string) => void;
}) {
  return (
    <>
      {partidas.map((p, i) => (
        <CartelaDoJogador key={p.partida.id} inicial={p} perfilId={perfilId} somenteVer={somenteVer} indice={i} aoSumir={aoSumir} />
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

function CartelaDoJogador({ inicial, perfilId, somenteVer, indice, aoSumir }: {
  inicial: MinhaPartida; perfilId: string; somenteVer: boolean; indice: number; aoSumir: (id: string) => void;
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

  const mudoRef = useRef(mudo);
  mudoRef.current = mudo;

  /*
   * A pedra nova espera a TV (`REVELAR_AO_JOGADOR_MS`): o aviso chega aqui e
   * na TV juntos, e a TV ainda gira a máquina antes de mostrar o número. Até
   * lá ela fica em `pendentes` — conhecida, para o próximo aviso encaixar, mas
   * fora da cartela, das últimas pedras e do som.
   */
  const pendentes = useRef(new Set<number>());
  const timersRevelar = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => { for (const t of timersRevelar.current) clearTimeout(t); }, []);
  const revelarDepois = useCallback((numero: number) => {
    if (pendentes.current.has(numero)) return;
    pendentes.current.add(numero);
    const t = setTimeout(() => {
      timersRevelar.current.delete(t);
      pendentes.current.delete(numero);
      setEstado(e => (e.pedras.includes(numero) ? e : { ...e, pedras: [...e.pedras, numero] }));
      setPedraNova({ numero, chave: Date.now() });
      if (!mudoRef.current) tocarPlim();
    }, REVELAR_AO_JOGADOR_MS);
    timersRevelar.current.add(t);
  }, []);

  const reler = useCallback(async () => {
    try {
      const e = await minhaPartida(id);
      if (!e || e.partida.estado !== 'aberta') { setEncerrada(true); return; }
      const conhecidas = new Set([...estadoRef.current.pedras, ...pendentes.current]);
      const { visiveis, aRevelar } = pedrasParaMostrar(e.pedras, conhecidas, pendentes.current);
      setEstado({ ...e, pedras: visiveis });
      if (aRevelar !== null) revelarDepois(aRevelar);
    } catch { /* segura o que tem */ }
  }, [id, revelarDepois]);

  // O canal da partida: a pedra vem dentro do aviso.
  useEffect(() => assinarTabela(
    { topico: `bingo:${id}`, escutas: [{ sinal: 'bingo' }] },
    {
      onSinal: (payload) => {
        const aviso = lerAviso(payload);
        if (!aviso || aviso.partida !== id) return;
        if (aviso.tipo === 'pedra') {
          const como = encaixa([...estadoRef.current.pedras, ...pendentes.current], aviso);
          if (como === 'repetida') return;
          if (como === 'buraco') { void reler(); return; }
          revelarDepois(aviso.numero);
          return;
        }
        void reler();
      },
      onReconectado: () => { void reler(); },
    },
  ), [id, reler, revelarDepois]);

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
          data-bingo-anima
          onClick={() => setAberta(true)}
          className="bingo-aba fixed z-[60] flex items-center gap-2.5 rounded-full pl-1.5 pr-4 py-1.5 shadow-lg"
          style={{ left: 20, bottom: base, background: tema.aba.fundo, color: tema.aba.texto, fontFamily: tema.familia }}
          aria-label="Abrir a cartela de bingo"
        >
          {ultima != null
            ? <span key={ultima} className="bingo-troca"><tema.Bola numero={ultima} tamanho={40} /></span>
            : <span className="h-10 w-10 rounded-full bg-white/30" />}
          <span className="text-sm font-bold leading-tight text-left">
            BINGO<br /><span className="font-semibold opacity-90">{estado.pedras.length}/{TOTAL_PEDRAS}</span>
          </span>
          {acende && <span className="bingo-chip ml-1 rounded-full bg-white px-2 py-0.5 text-xs font-bold" style={{ color: tema.aba.fundo }}>GRITE!</span>}
        </button>
      )}

      {aberta && (
        <div
          data-bingo-anima
          className="bingo-painel fixed z-[60] rounded-3xl shadow-2xl p-3.5 w-[340px] max-w-[calc(100vw-24px)]"
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
              <div key={n} className="bingo-desliza" style={{ opacity: 1 - i * 0.15, transition: 'opacity 300ms ease' }}><tema.Bola numero={n} tamanho={i === 0 ? 40 : 32} /></div>
            ))}
            {!estado.pedras.length && <span className="text-sm" style={{ color: tema.suave }}>Aguardando a primeira pedra…</span>}
          </div>

          <div className="flex justify-center">
            <Cartela tema={tema} numeros={estado.numeros} marcadas={marcadas} auto={auto} celula={50} aoTocar={encerrada || somenteVer ? undefined : tocar} />
          </div>

          {somenteVer && (
            <div className="mt-2 rounded-lg bg-black/10 px-2.5 py-1.5 text-[11px] leading-snug">
              Você está vendo a cartela pelo «Entrar como». Marcar e gritar ficam com a pessoa.
            </div>
          )}

          <button
            type="button"
            disabled={!acende || gritando || encerrada || somenteVer}
            onClick={fazerGrito}
            className={`bingo-botao mt-3 w-full rounded-2xl py-2.5 text-xl font-bold ${acende ? 'bingo-chama' : 'opacity-50'}`}
            style={{
              background: tema.botao.fundo, color: tema.botao.texto, fontFamily: tema.familia,
              ['--bingo-sombra' as string]: tema.botao.sombra, ['--bingo-brilho' as string]: tema.botao.fundo,
            }}
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
      <style>{ESTILOS}</style>
    </>
  );
}

const SUAVE = 'cubic-bezier(.22,1,.36,1)';
const SAI_MS = 500;

const ESTILOS = `
@keyframes bingo-cai { 0% { transform: translateY(-110%) scale(.7); opacity: 0 } 60% { transform: translateY(6%) scale(1.03); opacity: 1 } 80% { transform: translateY(-2%) } 100% { transform: none; opacity: 1 } }
@keyframes bingo-vai { to { opacity: 0; transform: translateY(-12px) scale(.92) } }
@keyframes bingo-entra-lado { from { opacity: 0; transform: translateX(12px) } to { opacity: 1; transform: none } }
@keyframes bingo-halo { from { transform: scale(.7); opacity: .8 } to { transform: scale(1.7); opacity: 0 } }
@keyframes bingo-balanca { 0%, 100% { transform: rotate(0) } 25% { transform: rotate(-7deg) } 75% { transform: rotate(7deg) } }
@keyframes bingo-abre { from { opacity: 0; transform: translateY(14px) scale(.96) } to { opacity: 1; transform: none } }
@keyframes bingo-desliza-j { from { opacity: 0; transform: translateX(-14px) scale(.7) } to { transform: none } }
@keyframes bingo-bate { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.12) } }
@keyframes bingo-chama { from { transform: scale(1); opacity: .9 } to { transform: scale(1.04, 1.3); opacity: 0 } }
@keyframes bingo-confete {
  0%   { transform: translate(0, 0) rotate(0); opacity: 1 }
  85%  { opacity: 1 }
  100% { transform: translate(var(--dx), 340px) rotate(var(--giro)); opacity: 0 }
}

.bingo-aba { animation: bingo-abre 380ms ${SUAVE} backwards; transition: transform 160ms ease; transform-origin: bottom left; }
.bingo-aba:hover { transform: translateY(-2px) scale(1.04); }
.bingo-aba:active { transform: scale(.97); }
.bingo-painel { animation: bingo-abre 320ms ${SUAVE} both; transform-origin: bottom left; }
.bingo-troca { display: inline-flex; animation: bingo-cai 500ms ease-out both; }
.bingo-desliza { animation: bingo-desliza-j 420ms ${SUAVE} both; }
.bingo-chip { display: inline-block; animation: bingo-bate 1.1s ease-in-out infinite; }

/* O botão de apertar: afunda no clique como botão de verdade. */
.bingo-botao { position: relative; box-shadow: 0 5px 0 var(--bingo-sombra); transition: transform 120ms ease, box-shadow 120ms ease, opacity 200ms ease; }
.bingo-botao:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 6px 0 var(--bingo-sombra); }
.bingo-botao:not(:disabled):active { transform: translateY(3px); box-shadow: 0 2px 0 var(--bingo-sombra); }
/* Fechou uma linha: um anel sai do botão, de leve, até a pessoa gritar. */
.bingo-chama::after {
  content: ''; position: absolute; inset: -2px; border-radius: inherit; pointer-events: none;
  border: 3px solid var(--bingo-brilho); animation: bingo-chama 1.4s ease-out infinite;
}
`;

/** A pedra nova, num canto de cima, brilhando. Não pega clique. */
function PedraNova({ numero, tema }: { numero: number; tema: TemaBingo }) {
  return (
    <div
      data-bingo-anima
      className="fixed z-[60] pointer-events-none flex items-center gap-2"
      style={{ top: 72, right: 24, animation: `bingo-cai 650ms ease-out both, bingo-vai ${SAI_MS}ms ease-in ${PEDRA_NA_TELA_MS - SAI_MS}ms forwards` }}
      aria-live="polite"
    >
      <span className="rounded-full px-3 py-1 text-sm font-bold shadow" style={{ background: tema.aba.fundo, color: tema.aba.texto, fontFamily: tema.familia, animation: `bingo-entra-lado 400ms ${SUAVE} 250ms both` }}>
        Saiu!
      </span>
      <div style={{ position: 'relative' }}>
        {/* O halo na cor do tema, que pulsa por trás: chama o olho sem piscar a tela. */}
        <span aria-hidden style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: `radial-gradient(circle, ${tema.destaque}aa 0%, ${tema.destaque}00 70%)`,
          animation: 'bingo-halo 1.3s ease-out 400ms 4 both',
        }} />
        <div style={{ position: 'relative', animation: 'bingo-balanca 700ms ease-in-out 650ms 2' }}>
          <tema.Bola numero={numero} tamanho={84} brilho />
        </div>
      </div>
    </div>
  );
}

/** Confete de uma vez só, nas cores do tema, por cima da comemoração. */
function Confete({ tema }: { tema: TemaBingo }) {
  const cores = [tema.destaque, tema.botao.fundo, tema.cartela.marcaFundo, tema.cartela.estrelaFundo];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
      {Array.from({ length: 28 }, (_, i) => (
        <span key={i} style={{
          position: 'absolute', top: -14, left: `${(i * 37 + 7) % 100}%`,
          width: i % 3 ? 8 : 6, height: i % 3 ? 14 : 6, borderRadius: i % 3 ? 2 : '50%',
          background: cores[i % cores.length],
          ['--dx' as string]: `${((i * 53) % 120) - 60}px`, ['--giro' as string]: `${(i % 2 ? 1 : -1) * (360 + (i % 5) * 140)}deg`,
          animation: `bingo-confete ${1.6 + (i % 5) * 0.25}s cubic-bezier(.3,.6,.6,1) ${(i % 7) * 0.09}s both`,
        } as React.CSSProperties} />
      ))}
    </div>
  );
}

function FestaDoJogador({ vitoria, estado, tema, perfilId, aoFechar }: {
  vitoria: VitoriaBingo; estado: MinhaPartida; tema: TemaBingo; perfilId: string; aoFechar: () => void;
}) {
  const sorteadas = new Set(estado.pedras);
  const souEu = vitoria.ganhadores.some(g => g.perfil_id === perfilId);
  return (
    <div data-bingo-anima className="fixed z-[61] left-1/2 top-20 -translate-x-1/2 rounded-3xl shadow-2xl p-5 w-[min(720px,calc(100vw-24px))]"
      style={{
        background: tema.fundoTv, color: tema.texto, fontFamily: tema.familia,
        animation: `bingo-abre 450ms ${SUAVE} both, bingo-vai ${SAI_MS}ms ease-in ${FESTA_MS - SAI_MS}ms forwards`,
      }}
      role="dialog" aria-label="Comemoração do bingo">
      <Confete tema={tema} />
      <button type="button" onClick={aoFechar} className="absolute right-3 top-3 rounded-full p-1.5 hover:bg-black/10" aria-label="Fechar">
        <X className="h-4 w-4" />
      </button>
      <div className="relative text-center">
        <div className="font-bold" style={{ fontSize: 44 * tema.escalaNumero, color: tema.destaque, animation: 'bingo-cai 650ms ease-out 150ms both' }}>{nomeDaVitoria(vitoria.tipo)}!</div>
        <div className="font-semibold" style={{ animation: `bingo-abre 450ms ${SUAVE} 350ms both` }}>{souEu ? 'Você ganhou! 🎉' : vitoria.tipo === 'cheia' ? tema.frases.cheia : tema.frases.quina}</div>
      </div>
      <div className="relative mt-4 flex flex-wrap justify-center gap-5">
        {vitoria.ganhadores.slice(0, 4).map((g, i) => (
          <div key={g.perfil_id} className="flex flex-col items-center gap-2" style={{ animation: `bingo-abre 450ms ${SUAVE} ${450 + i * 150}ms both` }}>
            <div className="font-bold text-sm">{g.nome.split(' ')[0]}</div>
            <Cartela tema={tema} numeros={g.numeros} marcadas={sorteadas} vence={g.padrao ?? padrao(g.numeros, sorteadas, vitoria.tipo) ?? []} celula={30} provaAtrasoMs={900 + i * 150} />
          </div>
        ))}
      </div>
      <div className="mt-3 text-center text-xs" style={{ color: tema.suave }}>A linha em destaque é a prova: todos esses números já saíram.</div>
    </div>
  );
}
