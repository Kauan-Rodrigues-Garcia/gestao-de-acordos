/**
 * BingoTv.tsx — o Bingo na parede, no palco de 1920×1080.
 *
 * Quatro momentos:
 *   - abertura    nenhuma pedra ainda: a máquina, os prêmios, quantos jogam;
 *   - sorteio     a pedra nova: a máquina gira (~2 s) e a pedra sai gigante;
 *   - quadro      o de sempre: a pedra da vez, as últimas, as 75 acesas;
 *   - festa       o líder comemorou: o enfeite do tema e a cartela-prova.
 *
 * Só anima o que CHEGOU com a tela aberta: a TV que liga no meio da partida
 * mostra o quadro, sem reprisar pedra nenhuma. Texto grande de propósito — é
 * para ler do fundo da sala.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PalcoTv } from '../TelaTv';
import { Cartela } from './Cartela';
import { LETRAS, TOTAL_PEDRAS, letraDe, nomeDaVitoria } from './regras';
import { tocarFanfarra, tocarGlobo, tocarGrito, tocarSaiu } from './som';
import type { TemaBingo } from './temas/contrato';
import type { EstadoBingo, GritoBingo, VitoriaBingo } from './tipos';

const GIRANDO_MS = 2200;
const SAINDO_MS = 2800;
const FESTA_MS = 25_000;
const GRITO_MS = 7000;

type Sorteio = { numero: number; fase: 'girando' | 'saiu' } | null;

export function BingoTv({ estado, tema, style, diferencaMs = 0 }: {
  estado: EstadoBingo;
  tema: TemaBingo;
  style?: React.CSSProperties;
  /** `Date.now()` + isto = hora do banco (para a festa que já passou não voltar). */
  diferencaMs?: number;
}) {
  const { partida, pedras } = estado;
  const som = partida.som_na_tv;

  // ── A pedra nova ──
  // Os efeitos dependem de CONTAGENS e ids, nunca do array: a TV relê o
  // estado inteiro de vez em quando, e um array novo com o mesmo conteúdo
  // cancelaria os timers no meio da animação.
  const totalPedras = pedras.length;
  const ultimaPedra = pedras[totalPedras - 1];
  const somRef = useRef(som);
  somRef.current = som;

  // ── A pedra nova ──
  const [sorteio, setSorteio] = useState<Sorteio>(null);
  const vistas = useRef(totalPedras);
  useEffect(() => {
    if (totalPedras <= vistas.current) { vistas.current = totalPedras; return; }
    vistas.current = totalPedras;
    const numero = ultimaPedra;
    setSorteio({ numero, fase: 'girando' });
    if (somRef.current) tocarGlobo();
    const t1 = setTimeout(() => { setSorteio({ numero, fase: 'saiu' }); if (somRef.current) tocarSaiu(); }, GIRANDO_MS);
    const t2 = setTimeout(() => setSorteio(null), GIRANDO_MS + SAINDO_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [totalPedras, ultimaPedra]);

  // ── A festa ──
  const [festa, setFesta] = useState<VitoriaBingo | null>(null);
  const vitoriaVista = useRef<string | null>(null);
  const vitoriaRef = useRef(estado.vitoria);
  vitoriaRef.current = estado.vitoria;
  const idVitoria = estado.vitoria?.id ?? null;
  useEffect(() => {
    const v = vitoriaRef.current;
    if (!v || v.id === vitoriaVista.current) return;
    vitoriaVista.current = v.id;
    const passou = Date.now() + diferencaMs - Date.parse(v.em);
    if (!(passou < FESTA_MS)) return;
    setFesta(v);
    if (somRef.current) tocarFanfarra();
    const t = setTimeout(() => setFesta(null), FESTA_MS - Math.max(0, passou));
    return () => clearTimeout(t);
    // `diferencaMs` só calibra a primeira leitura; mudar depois não reabre a festa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idVitoria]);

  // ── O grito ──
  const [grito, setGrito] = useState<GritoBingo | null>(null);
  const totalGritos = estado.gritos.length;
  const gritosRef = useRef(estado.gritos);
  gritosRef.current = estado.gritos;
  const gritosVistos = useRef(totalGritos);
  useEffect(() => {
    if (totalGritos <= gritosVistos.current) { gritosVistos.current = totalGritos; return; }
    gritosVistos.current = totalGritos;
    setGrito(gritosRef.current[totalGritos - 1]);
    if (somRef.current) tocarGrito();
    const t = setTimeout(() => setGrito(null), GRITO_MS);
    return () => clearTimeout(t);
  }, [totalGritos]);

  // Durante o sorteio, o quadro ainda não mostra a pedra (ela «sai» primeiro).
  const naParede = sorteio ? pedras.slice(0, -1) : pedras;

  return (
    <PalcoTv tema="noite" style={style}>
      <div style={{ position: 'absolute', inset: 0, background: tema.fundoTv, fontFamily: tema.familia, color: tema.texto }}>
        {naParede.length === 0 && !sorteio
          ? <Abertura estado={estado} tema={tema} />
          : <Quadro estado={estado} pedras={naParede} tema={tema} />}
        {sorteio && <SorteioNaTela sorteio={sorteio} tema={tema} />}
        {grito && !festa && <FaixaDoGrito grito={grito} tema={tema} />}
        {festa && <Festa vitoria={festa} estado={estado} tema={tema} />}
        <style>{ESTILOS}</style>
      </div>
    </PalcoTv>
  );
}

const ESTILOS = `
@keyframes bingo-sai { 0% { transform: scale(.15) rotate(-200deg); opacity: 0 } 60% { transform: scale(1.12) rotate(10deg); opacity: 1 } 100% { transform: scale(1) rotate(0) } }
@keyframes bingo-surge { from { opacity: 0; transform: translateY(40px) } to { opacity: 1; transform: none } }
@keyframes bingo-acende { 0% { transform: scale(1.6); filter: brightness(1.8) } 100% { transform: scale(1); filter: none } }
@keyframes bingo-faixa { from { transform: translateY(-140%) } to { transform: none } }
@keyframes bingo-pulsa { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.06) } }
@media (prefers-reduced-motion: reduce) { * { animation-duration: 1ms !important; animation-iteration-count: 1 !important; } }
`;

function Caixa({ tema, children, style }: { tema: TemaBingo; children: ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: tema.caixa, borderRadius: 32, padding: '22px 30px', ...style }}>{children}</div>;
}

function Premios({ estado, tema, tamanho = 38 }: { estado: EstadoBingo; tema: TemaBingo; tamanho?: number }) {
  const { premio_quina: q, premio_bingo: b } = estado.partida;
  if (!q && !b) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: tamanho * tema.escalaNumero }}>
      {q && <div><b style={{ color: tema.destaque }}>Quina:</b> {q}</div>}
      {b && <div><b style={{ color: tema.destaque }}>Bingo:</b> {b}</div>}
    </div>
  );
}

function Abertura({ estado, tema }: { estado: EstadoBingo; tema: TemaBingo }) {
  const M = tema.Maquina;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 120 }}>
      <M girando={false} tamanho={460} />
      <div style={{ maxWidth: 900, animation: 'bingo-surge 900ms ease-out both' }}>
        <div style={{ fontSize: 120 * tema.escalaNumero, fontWeight: 700, lineHeight: 1.05, color: tema.destaque }}>BINGO!</div>
        <div style={{ fontSize: 64 * tema.escalaNumero, fontWeight: 700, marginTop: 24 }}>A partida vai começar</div>
        <div style={{ fontSize: 40 * tema.escalaNumero, color: tema.suave, marginTop: 18 }}>{tema.frases.abertura}</div>
        <div style={{ fontSize: 44 * tema.escalaNumero, marginTop: 36 }}>
          <b>{estado.partida.participantes}</b> {estado.partida.participantes === 1 ? 'pessoa jogando' : 'pessoas jogando'}
        </div>
        <div style={{ marginTop: 28 }}><Premios estado={estado} tema={tema} tamanho={44} /></div>
      </div>
    </div>
  );
}

function Quadro({ estado, pedras, tema }: { estado: EstadoBingo; pedras: number[]; tema: TemaBingo }) {
  const B = tema.Bola;
  const M = tema.Maquina;
  const atual = pedras[pedras.length - 1];
  const anteriores = pedras.slice(-5, -1).reverse();
  const saiu = new Set(pedras);
  const q = tema.quadro;
  const fonteCelula = Math.round(44 * tema.escalaNumero);

  return (
    <>
      {/* A pedra da vez */}
      <div style={{ position: 'absolute', left: 100, top: 56, width: 520, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ fontSize: 40 * tema.escalaNumero, fontWeight: 700, color: tema.suave, letterSpacing: 2 }}>
          PEDRA {pedras.length} DE {TOTAL_PEDRAS}
        </div>
        {atual != null && (
          <div key={atual} style={{ marginTop: 18, animation: 'bingo-sai 900ms cubic-bezier(.2,.9,.3,1.1) both' }}>
            <B numero={atual} tamanho={420} brilho />
          </div>
        )}
      </div>

      {/* A máquina e quem gritou */}
      <div style={{ position: 'absolute', left: 700, top: 50, width: 520, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <M girando={false} tamanho={300} />
        {!!estado.gritos.length && (
          <Caixa tema={tema} style={{ width: '100%', padding: '14px 26px' }}>
            {estado.gritos.slice(-2).reverse().map(g => (
              <div key={g.perfil_id + g.em} style={{ fontSize: 34 * tema.escalaNumero, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {primeiroNome(g.nome)} gritou <span style={{ color: tema.destaque }}>{nomeDaVitoria(g.tipo)}!</span>
              </div>
            ))}
          </Caixa>
        )}
      </div>

      {/* As últimas e os prêmios */}
      <div style={{ position: 'absolute', left: 1300, top: 50, width: 520, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Caixa tema={tema}>
          <div style={{ fontSize: 32 * tema.escalaNumero, fontWeight: 700, color: tema.suave, marginBottom: 14 }}>Últimas pedras</div>
          <div style={{ display: 'flex', gap: 16, minHeight: 104 }}>
            {anteriores.map(n => <B key={n} numero={n} tamanho={98} />)}
          </div>
        </Caixa>
        <Caixa tema={tema}>
          <div style={{ fontSize: 32 * tema.escalaNumero, color: tema.suave, marginBottom: 10 }}>
            {estado.partida.participantes} {estado.partida.participantes === 1 ? 'pessoa jogando' : 'pessoas jogando'}
          </div>
          <Premios estado={estado} tema={tema} tamanho={34} />
        </Caixa>
      </div>

      {/* As 75 */}
      <div style={{ position: 'absolute', left: 100, right: 100, bottom: 60, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {LETRAS.map((l, r) => (
          <div key={l} style={{ display: 'flex', gap: 8, height: 66 }}>
            <div style={{ width: 86, borderRadius: 16, background: q.letraFundo, color: q.letraTexto, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 46 * tema.escalaNumero, fontWeight: 700 }}>{l}</div>
            {Array.from({ length: 15 }, (_, k) => {
              const n = r * 15 + k + 1;
              const aceso = saiu.has(n);
              return (
                <div key={n} style={{
                  flex: 1, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: fonteCelula, fontWeight: 700,
                  background: aceso ? q.acesaFundo : q.fundo, color: aceso ? q.acesaTexto : q.texto,
                  animation: n === atual ? 'bingo-acende 900ms ease-out both' : undefined,
                }}>{n}</div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

function SorteioNaTela({ sorteio, tema }: { sorteio: NonNullable<Sorteio>; tema: TemaBingo }) {
  const M = tema.Maquina;
  const B = tema.Bola;
  return (
    <div style={{ position: 'absolute', inset: 0, background: tema.fundoTv, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      {sorteio.fase === 'girando' ? (
        <>
          <M girando tamanho={520} />
          <div style={{ fontSize: 72 * tema.escalaNumero, fontWeight: 700, marginTop: 30, animation: 'bingo-pulsa 0.6s ease-in-out infinite' }}>Sorteando…</div>
        </>
      ) : (
        <>
          <div style={{ animation: 'bingo-sai 1000ms cubic-bezier(.2,.9,.3,1.1) both' }}>
            <B numero={sorteio.numero} tamanho={600} brilho />
          </div>
          <div style={{ fontSize: 120 * tema.escalaNumero, fontWeight: 700, marginTop: 20, color: tema.destaque, animation: 'bingo-surge 600ms ease-out 300ms both' }}>
            {letraDe(sorteio.numero)} {sorteio.numero}
          </div>
        </>
      )}
    </div>
  );
}

function FaixaDoGrito({ grito, tema }: { grito: GritoBingo; tema: TemaBingo }) {
  return (
    <div style={{
      position: 'absolute', left: 300, right: 300, top: 30, padding: '26px 40px', borderRadius: 40,
      background: tema.destaque, color: '#fff', display: 'flex', alignItems: 'center', gap: 28,
      boxShadow: '0 20px 60px rgba(0,0,0,.35)', animation: 'bingo-faixa 500ms cubic-bezier(.2,.9,.3,1.2) both',
    }}>
      <Avatar nome={grito.nome} foto={grito.foto} tamanho={110} />
      <div style={{ fontSize: 64 * tema.escalaNumero, fontWeight: 700, lineHeight: 1.1 }}>
        {primeiroNome(grito.nome)} gritou {nomeDaVitoria(grito.tipo)}!
        <div style={{ fontSize: 34 * tema.escalaNumero, opacity: .9 }}>A liderança está conferindo…</div>
      </div>
    </div>
  );
}

function Festa({ vitoria, estado, tema }: { vitoria: VitoriaBingo; estado: EstadoBingo; tema: TemaBingo }) {
  const F = tema.Festa;
  const sorteadas = new Set(estado.pedras);
  const mostrar = vitoria.ganhadores.slice(0, 3);
  const premio = vitoria.tipo === 'cheia' ? estado.partida.premio_bingo : estado.partida.premio_quina;
  // A prova tem de ser lida do fundo da sala: com um ganhador, a cartela é grande.
  const celula = mostrar.length === 1 ? 84 : mostrar.length === 2 ? 66 : 50;
  return (
    <div style={{ position: 'absolute', inset: 0, background: tema.fundoTv }}>
      <F tipo={vitoria.tipo} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 50 }}>
        <div style={{ fontSize: 160 * tema.escalaNumero, fontWeight: 700, color: tema.destaque, lineHeight: 1, animation: 'bingo-sai 900ms cubic-bezier(.2,.9,.3,1.1) both', textShadow: '0 8px 0 rgba(0,0,0,.15)' }}>
          {nomeDaVitoria(vitoria.tipo)}!
        </div>
        <div style={{ fontSize: 48 * tema.escalaNumero, fontWeight: 700, marginTop: 12 }}>
          {vitoria.tipo === 'cheia' ? tema.frases.cheia : tema.frases.quina}{premio ? ` · ${premio}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 56, marginTop: 40, alignItems: 'flex-start' }}>
          {mostrar.map((g, i) => (
            <div key={g.perfil_id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, animation: `bingo-surge 700ms ease-out ${0.4 + i * 0.25}s both` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <Avatar nome={g.nome} foto={g.foto} tamanho={96} />
                <div style={{ fontSize: 52 * tema.escalaNumero, fontWeight: 700, maxWidth: 420, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nomeCurto(g.nome)}</div>
              </div>
              <Cartela tema={tema} numeros={g.numeros} marcadas={sorteadas} vence={g.padrao} celula={celula} />
            </div>
          ))}
        </div>
        {vitoria.ganhadores.length > 3 && (
          <div style={{ fontSize: 40 * tema.escalaNumero, marginTop: 26, fontWeight: 700 }}>
            e também {vitoria.ganhadores.slice(3).map(g => primeiroNome(g.nome)).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({ nome, foto, tamanho }: { nome: string; foto: string | null; tamanho: number }) {
  const [falhou, setFalhou] = useState(false);
  const estilo: React.CSSProperties = {
    width: tamanho, height: tamanho, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
    border: `${Math.max(3, tamanho / 20)}px solid #ffffff`, background: '#ffffff55',
  };
  if (foto && !falhou) return <img src={foto} alt="" style={estilo} onError={() => setFalhou(true)} />;
  const ini = nome.trim().split(/\s+/).filter(Boolean);
  return (
    <div style={{ ...estilo, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: tamanho * 0.38, fontWeight: 700 }}>
      {((ini[0]?.[0] ?? '') + (ini.length > 1 ? ini[ini.length - 1][0] : '')).toUpperCase()}
    </div>
  );
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? '';
const nomeCurto = (nome: string) => {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return p.length <= 2 ? p.join(' ') : `${p[0]} ${p[p.length - 1]}`;
};
