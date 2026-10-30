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
 *
 * ## Movimento: por que NÃO existe `prefers-reduced-motion` aqui
 *
 * Existia, como `* { animation-duration: 1ms }` — e, por estar num `<style>`
 * solto, valia para a página inteira. Nos computadores com «Efeitos de
 * animação» desligado no Windows (imagem corporativa, não acessibilidade) a
 * máquina não girava, o «Sorteando» não pulsava e a festa parava no primeiro
 * quadro: o Bingo sem a animação não conta que a pedra saiu. Mesma decisão do
 * Mural de Outubro (30/10/2026); o modo leve também fica de fora
 * (`data-bingo-anima`, `index.css`), e tudo aqui anima só transform e
 * opacidade.
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
/** O fim do `SAINDO_MS`: o véu do sorteio se desfaz e a pedra pousa no quadro. */
const DESFAZ_MS = 550;
const FESTA_MS = 25_000;
const GRITO_MS = 7000;

/** A chegada suave da tela; a mola fica nos quadros de cada animação. */
const SUAVE = 'cubic-bezier(.22,1,.36,1)';

type Sorteio = { numero: number; fase: 'girando' | 'saiu' | 'indo' } | null;

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
    const t2 = setTimeout(() => setSorteio({ numero, fase: 'indo' }), GIRANDO_MS + SAINDO_MS - DESFAZ_MS);
    const t3 = setTimeout(() => setSorteio(null), GIRANDO_MS + SAINDO_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [totalPedras, ultimaPedra]);

  // ── A festa ──
  const [festa, setFesta] = useState<{ vitoria: VitoriaBingo; restaMs: number } | null>(null);
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
    const resta = FESTA_MS - Math.max(0, passou);
    setFesta({ vitoria: v, restaMs: resta });
    if (somRef.current) tocarFanfarra();
    const t = setTimeout(() => setFesta(null), resta);
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
  // No «indo» ela já entra: pousa no quadro enquanto o véu se desfaz por cima.
  const naParede = sorteio && sorteio.fase !== 'indo' ? pedras.slice(0, -1) : pedras;

  return (
    <PalcoTv tema="noite" style={style}>
      <div data-bingo-anima style={{ position: 'absolute', inset: 0, background: tema.fundoTv, fontFamily: tema.familia, color: tema.texto }}>
        {naParede.length === 0 && !sorteio
          ? <Abertura estado={estado} tema={tema} />
          : <Quadro estado={estado} pedras={naParede} tema={tema} />}
        {sorteio && <SorteioNaTela sorteio={sorteio} tema={tema} />}
        {grito && !festa && <FaixaDoGrito key={grito.perfil_id + grito.em} grito={grito} tema={tema} />}
        {festa && <Festa key={festa.vitoria.id} vitoria={festa.vitoria} restaMs={festa.restaMs} estado={estado} tema={tema} />}
        <style>{ESTILOS}</style>
      </div>
    </PalcoTv>
  );
}

const ESTILOS = `
@keyframes bingo-sai {
  0%   { transform: scale(.2) rotate(-180deg); opacity: 0 }
  55%  { transform: scale(1.08) rotate(6deg); opacity: 1 }
  75%  { transform: scale(.97) rotate(-2deg) }
  90%  { transform: scale(1.01) rotate(0) }
  100% { transform: none; opacity: 1 }
}
@keyframes bingo-pousa { 0% { transform: scale(1.22); opacity: 0 } 60% { transform: scale(.97); opacity: 1 } 100% { transform: none; opacity: 1 } }
@keyframes bingo-surge { from { opacity: 0; transform: translateY(32px) scale(.98) } to { opacity: 1; transform: none } }
@keyframes bingo-desliza { from { opacity: 0; transform: translateX(-36px) scale(.8) } to { opacity: 1; transform: none } }
@keyframes bingo-aparece { from { opacity: 0 } to { opacity: 1 } }
@keyframes bingo-some { to { opacity: 0 } }
@keyframes bingo-cresce { from { opacity: 0; transform: scale(.86) } to { opacity: 1; transform: none } }
@keyframes bingo-flutua { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-14px) } }
@keyframes bingo-respira { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.035) } }
@keyframes bingo-ponto { 0%, 70%, 100% { transform: translateY(0); opacity: .35 } 35% { transform: translateY(-.28em); opacity: 1 } }
@keyframes bingo-onda { from { transform: scale(.55); opacity: .75 } to { transform: scale(1.75); opacity: 0 } }
@keyframes bingo-acende { 0% { transform: scale(1.55) } 45% { transform: scale(.92) } 75% { transform: scale(1.05) } 100% { transform: none } }
@keyframes bingo-anel { from { transform: scale(.92); opacity: .85 } to { transform: scale(1.3); opacity: 0 } }
@keyframes bingo-faixa { 0% { transform: translateY(-140%) } 70% { transform: translateY(5%) } 100% { transform: none } }
@keyframes bingo-faixa-sai { to { transform: translateY(-140%); opacity: 0 } }
@keyframes bingo-reflexo { from { transform: translateX(-100%) skewX(-18deg) } to { transform: translateX(260%) skewX(-18deg) } }

/* A pedra da vez no quadro das 75: acende com mola e fica com um anel que
   se abre devagar, para quem olha de longe achar a última sem procurar. */
.bingo-celula-nova { position: relative; animation: bingo-acende 900ms ease-out both; }
.bingo-celula-nova::after {
  content: ''; position: absolute; inset: -7px; border-radius: 18px; pointer-events: none;
  border: 4px solid var(--bingo-anel); animation: bingo-anel 1.8s ease-out .6s infinite both;
}
.bingo-pontos > span { display: inline-block; animation: bingo-ponto 1.2s ease-in-out infinite; }
.bingo-pontos > span:nth-child(2) { animation-delay: .15s; }
.bingo-pontos > span:nth-child(3) { animation-delay: .3s; }
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
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 120, animation: 'bingo-aparece 600ms ease-out both' }}>
      {/* A máquina chega e fica boiando: a tela parada parece travada. */}
      <div style={{ animation: `bingo-cresce 900ms ${SUAVE} both` }}>
        <div style={{ animation: 'bingo-flutua 4.2s ease-in-out 900ms infinite' }}>
          <M girando={false} tamanho={460} />
        </div>
      </div>
      <div style={{ maxWidth: 900 }}>
        <div style={{ ...entra(150), fontSize: 120 * tema.escalaNumero, fontWeight: 700, lineHeight: 1.05, color: tema.destaque }}>BINGO!</div>
        <div style={{ ...entra(300), fontSize: 64 * tema.escalaNumero, fontWeight: 700, marginTop: 24 }}>A partida vai começar</div>
        <div style={{ ...entra(450), fontSize: 40 * tema.escalaNumero, color: tema.suave, marginTop: 18 }}>{tema.frases.abertura}</div>
        <div style={{ ...entra(600), fontSize: 44 * tema.escalaNumero, marginTop: 36 }}>
          <b>{estado.partida.participantes}</b> {estado.partida.participantes === 1 ? 'pessoa jogando' : 'pessoas jogando'}
        </div>
        <div style={{ ...entra(750), marginTop: 28 }}><Premios estado={estado} tema={tema} tamanho={44} /></div>
      </div>
    </div>
  );
}

/** Entrada de baixo para cima, em cascata pelo atraso. */
const entra = (atrasoMs: number): React.CSSProperties => ({ animation: `bingo-surge 800ms ${SUAVE} ${atrasoMs}ms both` });

function Quadro({ estado, pedras, tema }: { estado: EstadoBingo; pedras: number[]; tema: TemaBingo }) {
  const B = tema.Bola;
  const M = tema.Maquina;
  const atual = pedras[pedras.length - 1];
  const anteriores = pedras.slice(-5, -1).reverse();
  const saiu = new Set(pedras);
  const q = tema.quadro;
  const fonteCelula = Math.round(44 * tema.escalaNumero);

  return (
    <div style={{ position: 'absolute', inset: 0, animation: 'bingo-aparece 700ms ease-out both' }}>
      {/* A pedra da vez */}
      <div style={{ position: 'absolute', left: 100, top: 56, width: 520, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ fontSize: 40 * tema.escalaNumero, fontWeight: 700, color: tema.suave, letterSpacing: 2 }}>
          PEDRA {pedras.length} DE {TOTAL_PEDRAS}
        </div>
        {atual != null && (
          <div key={atual} style={{ marginTop: 18, animation: `bingo-pousa 750ms ${SUAVE} both` }}>
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
              <div key={g.perfil_id + g.em} style={{ animation: `bingo-desliza 500ms ${SUAVE} both`, fontSize: 34 * tema.escalaNumero, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
            {anteriores.map(n => (
              <div key={n} style={{ animation: `bingo-desliza 550ms ${SUAVE} both` }}><B numero={n} tamanho={98} /></div>
            ))}
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
                <div key={n} className={n === atual ? 'bingo-celula-nova' : undefined} style={{
                  flex: 1, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: fonteCelula, fontWeight: 700,
                  background: aceso ? q.acesaFundo : q.fundo, color: aceso ? q.acesaTexto : q.texto,
                  transition: 'background-color 450ms ease, color 450ms ease',
                  ['--bingo-anel' as string]: q.acesaFundo,
                }}>{n}</div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function SorteioNaTela({ sorteio, tema }: { sorteio: NonNullable<Sorteio>; tema: TemaBingo }) {
  const M = tema.Maquina;
  const B = tema.Bola;
  // O mesmo elemento do começo ao fim: a animação dele só troca no «indo».
  const veu = sorteio.fase === 'indo'
    ? `bingo-some ${DESFAZ_MS}ms ease-in forwards`
    : 'bingo-aparece 380ms ease-out both';
  return (
    <div style={{ position: 'absolute', inset: 0, background: tema.fundoTv, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', animation: veu }}>
      {sorteio.fase === 'girando' ? (
        <div key="girando" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: `bingo-cresce 500ms ${SUAVE} both` }}>
          <M girando tamanho={520} />
          <div style={{ fontSize: 72 * tema.escalaNumero, fontWeight: 700, marginTop: 30 }}>
            Sorteando<span className="bingo-pontos"><span>.</span><span>.</span><span>.</span></span>
          </div>
        </div>
      ) : (
        <div key="saiu" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            {/* Duas ondas na cor do tema saem de trás da pedra quando ela abre. */}
            {[250, 480].map(atraso => (
              <span key={atraso} aria-hidden style={{
                position: 'absolute', inset: 0, borderRadius: '50%', border: `12px solid ${tema.destaque}`,
                animation: `bingo-onda 1300ms ${SUAVE} ${atraso}ms both`, pointerEvents: 'none',
              }} />
            ))}
            <div style={{ position: 'relative', animation: 'bingo-sai 1100ms ease-out both' }}>
              <B numero={sorteio.numero} tamanho={600} brilho />
            </div>
          </div>
          <div style={{ fontSize: 120 * tema.escalaNumero, fontWeight: 700, marginTop: 20, color: tema.destaque, animation: `bingo-surge 700ms ${SUAVE} 380ms both` }}>
            {letraDe(sorteio.numero)} {sorteio.numero}
          </div>
        </div>
      )}
    </div>
  );
}

const FAIXA_SAI_MS = 450;

function FaixaDoGrito({ grito, tema }: { grito: GritoBingo; tema: TemaBingo }) {
  return (
    <div style={{
      position: 'absolute', left: 300, right: 300, top: 30, padding: '26px 40px', borderRadius: 40, overflow: 'hidden',
      background: tema.destaque, color: '#fff', display: 'flex', alignItems: 'center', gap: 28,
      boxShadow: '0 20px 60px rgba(0,0,0,.35)',
      animation: `bingo-faixa 650ms ${SUAVE} both, bingo-faixa-sai ${FAIXA_SAI_MS}ms ease-in ${GRITO_MS - FAIXA_SAI_MS}ms forwards`,
    }}>
      {/* O reflexo que passa pela faixa: chama o olho para ela sem piscar. */}
      <span aria-hidden style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, width: '30%', pointerEvents: 'none',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent)',
        animation: 'bingo-reflexo 1400ms ease-in-out 500ms 2 both',
      }} />
      <div style={{ animation: `bingo-pousa 600ms ${SUAVE} 250ms both` }}>
        <Avatar nome={grito.nome} foto={grito.foto} tamanho={110} />
      </div>
      <div style={{ fontSize: 64 * tema.escalaNumero, fontWeight: 700, lineHeight: 1.1, position: 'relative' }}>
        {primeiroNome(grito.nome)} gritou {nomeDaVitoria(grito.tipo)}!
        <div style={{ fontSize: 34 * tema.escalaNumero, opacity: .9 }}>A liderança está conferindo…</div>
      </div>
    </div>
  );
}

const FESTA_SAI_MS = 700;

function Festa({ vitoria, restaMs, estado, tema }: { vitoria: VitoriaBingo; restaMs: number; estado: EstadoBingo; tema: TemaBingo }) {
  const F = tema.Festa;
  const sorteadas = new Set(estado.pedras);
  const mostrar = vitoria.ganhadores.slice(0, 3);
  const premio = vitoria.tipo === 'cheia' ? estado.partida.premio_bingo : estado.partida.premio_quina;
  // A prova tem de ser lida do fundo da sala: com um ganhador, a cartela é grande.
  const celula = mostrar.length === 1 ? 84 : mostrar.length === 2 ? 66 : 50;
  return (
    <div style={{
      position: 'absolute', inset: 0, background: tema.fundoTv,
      animation: `bingo-aparece 500ms ease-out both, bingo-some ${FESTA_SAI_MS}ms ease-in ${Math.max(0, restaMs - FESTA_SAI_MS)}ms forwards`,
    }}>
      <F tipo={vitoria.tipo} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 50 }}>
        {/* Cai com mola e depois respira, enquanto a festa durar. */}
        <div style={{ animation: 'bingo-sai 1000ms ease-out both' }}>
          <div style={{ fontSize: 160 * tema.escalaNumero, fontWeight: 700, color: tema.destaque, lineHeight: 1, textShadow: '0 8px 0 rgba(0,0,0,.15)', animation: 'bingo-respira 2.6s ease-in-out 1.1s infinite' }}>
            {nomeDaVitoria(vitoria.tipo)}!
          </div>
        </div>
        <div style={{ ...entra(350), fontSize: 48 * tema.escalaNumero, fontWeight: 700, marginTop: 12 }}>
          {vitoria.tipo === 'cheia' ? tema.frases.cheia : tema.frases.quina}{premio ? ` · ${premio}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 56, marginTop: 40, alignItems: 'flex-start' }}>
          {mostrar.map((g, i) => (
            <div key={g.perfil_id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, ...entra(550 + i * 250) }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <Avatar nome={g.nome} foto={g.foto} tamanho={96} />
                <div style={{ fontSize: 52 * tema.escalaNumero, fontWeight: 700, maxWidth: 420, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nomeCurto(g.nome)}</div>
              </div>
              <Cartela tema={tema} numeros={g.numeros} marcadas={sorteadas} vence={g.padrao} celula={celula} provaAtrasoMs={1200 + i * 250} />
            </div>
          ))}
        </div>
        {vitoria.ganhadores.length > 3 && (
          <div style={{ ...entra(550 + 3 * 250), fontSize: 40 * tema.escalaNumero, marginTop: 26, fontWeight: 700 }}>
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
