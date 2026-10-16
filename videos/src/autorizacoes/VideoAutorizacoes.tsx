// «As autorizações agora ficam no chat» — vídeo curto para os líderes
// (15/10/2026). Sem voz: manchete, cursor, câmera e efeitos sonoros, no mesmo
// estilo do vídeo de apresentação (tema claro, telas com as classes do app).
//
// Roteiro (tempos em `tempos.ts`):
//   1. O sistema do líder aberto; no canto, o botão antigo «2 autorizações».
//   2. O botão voa para a bolha do chat — «agora ele fica dentro do chat».
//   3. Chega pedido: o aviso do chat. O líder abre o chat, toca em
//      «Autorizações · Play 3», aprova um pedido e recusa o outro.
//   4. Fechamento: o passo a passo — Chat › Autorizações › Aprovar ou recusar.

import { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { ArrowRight, Check, Lock, MessageCircle, RotateCw, ShieldCheck } from 'lucide-react';
import { Casca } from '../app/Casca';
import { APP_A, APP_L, BARRA_NAV, ESCALA_JANELA, JANELA, JANELA_A } from '../app/layout';
import { Dashboard } from '../app/paginas/Dashboard';
import { LIDER_PLAY3, PessoaContext } from '../app/pessoa';
import { tempoApp, type TempoApp } from '../app/roteiro';
import { Manchete } from '../cenas/Manchete';
import { Cursor, type PontoCursor } from '../componentes/Cursor';
import { Fundo } from '../componentes/Fundo';
import { ACELERA, entrada, entre, mola, ms, SUAVE_IDA_VOLTA } from '../movimento';
import { COR, FONTE, GRADIENTE_MARCA, SOMBRA_FLUTUA } from '../tema';
import { ChatAutorizacoes, GEO } from './ChatAutorizacoes';
import { DECIDE, T } from './tempos';

export const TOTAL_AUTORIZACOES = T.total;

/**
 * O painel do vídeo de apresentação reage aos tempos daquele roteiro. Aqui ele
 * é só o fundo da tela do líder: todos os instantes vão para o «nunca».
 */
function congelar<V>(v: V): V {
  if (typeof v === 'number') return 1e9 as V;
  if (Array.isArray(v)) return v.map(congelar) as V;
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, congelar(x)])) as V;
  }
  return v;
}

type Camera = { f: number; z: number; x: number; y: number; durMs: number };
const GERAL = { z: 1, x: APP_L / 2, y: APP_A / 2 };

function cameraEm(frame: number, chaves: Camera[]) {
  let atual = { z: chaves[0].z, x: chaves[0].x, y: chaves[0].y };
  for (let i = 1; i < chaves.length; i++) {
    const k = chaves[i];
    const dur = ms(k.durMs);
    if (frame <= k.f - dur) break;
    const p = SUAVE_IDA_VOLTA(Math.min(1, (frame - (k.f - dur)) / dur));
    atual = { z: atual.z + (k.z - atual.z) * p, x: atual.x + (k.x - atual.x) * p, y: atual.y + (k.y - atual.y) * p };
    if (frame < k.f) break;
  }
  const meiaL = APP_L / 2 / atual.z;
  const meiaA = APP_A / 2 / atual.z;
  return { z: atual.z, x: Math.min(APP_L - meiaL, Math.max(meiaL, atual.x)), y: Math.min(APP_A - meiaA, Math.max(meiaA, atual.y)) };
}

/** Aproxima até o retângulo caber na tela, com folga. */
function enquadra(r: { x: number; y: number; l: number; a: number }, folga = 36, zMax = 1.5) {
  const z = Math.max(1, Math.min(zMax, APP_L / (r.l + 2 * folga), APP_A / (r.a + 2 * folga)));
  return { z, x: r.x + r.l / 2, y: r.y + r.a / 2 };
}

const ANTES = ms(120);

function rota(): { pontos: PontoCursor[]; cliques: number[] } {
  const clica = (p: { x: number; y: number }, f: number, viagemMs = 700): PontoCursor => ({ f: f - ANTES, x: p.x, y: p.y, viagemMs });
  const pontos: PontoCursor[] = [
    { f: T.cursorAparece, x: 1180, y: 560 },
    clica(GEO.bolha, T.cliqueBolha, 950),
    clica({ x: GEO.linhaAutorizacoes.x - 30, y: GEO.linhaAutorizacoes.y }, T.cliqueLinha, 900),
    clica(GEO.aprovar, T.cliqueAprovar, 850),
    clica(GEO.confirmar, T.cliqueConfirmar, 520),
    clica(GEO.recusar, T.cliqueRecusar, 750),
    clica(GEO.confirmar, T.cliqueRecusarConfirma, 650),
    { f: T.cliqueRecusarConfirma + ms(900), x: GEO.confirmar.x + 120, y: GEO.confirmar.y - 140, viagemMs: 700 },
  ];
  const cliques = [T.cliqueBolha, T.cliqueLinha, T.cliqueAprovar, T.cliqueConfirmar, T.cliqueRecusar, T.cliqueRecusarConfirma];
  return { pontos, cliques };
}

// ── a janela com o sistema ──────────────────────────────────────────────
const Sistema: React.FC<{ t: TempoApp }> = ({ t }) => {
  const f = useCurrentFrame();
  const { pontos, cliques } = useMemo(rota, []);
  const chaves: Camera[] = useMemo(() => [
    { f: 0, ...GERAL, durMs: 1 },
    // o botão antigo, de perto; depois abre para ver o voo inteiro
    { f: T.dock + ms(700), ...enquadra({ x: 120, y: 560, l: 560, a: 314 }, 24, 1.6), durMs: 900 },
    { f: T.voa + ms(650), ...GERAL, durMs: 750 },
    { f: T.cliqueBolha + ms(650), ...enquadra({ x: GEO.janela.x, y: GEO.janela.y, l: GEO.janela.l, a: GEO.janela.a }), durMs: 900 },
    { f: T.fim + ms(100), ...GERAL, durMs: 700 },
  ], []);
  const cam = cameraEm(f, chaves);

  const entra = mola(f, T.janela, { mass: 1, stiffness: 120, damping: 20, overshootClamping: false });
  const sai = entre(f, T.fim + ms(150), T.fechamento + ms(250), 0, 1, ACELERA);
  if (sai >= 1) return null;

  return (
    <div
      style={{
        position: 'absolute', left: JANELA.x, top: JANELA.y, width: JANELA.l, height: JANELA_A,
        borderRadius: 14, overflow: 'hidden', background: '#ffffff', boxShadow: SOMBRA_FLUTUA,
        opacity: Math.min(1, entra * 1.4) * (1 - sai),
        transform: `translateY(${(1 - entra) * 60}px) scale(${(0.94 + 0.06 * entra) * (1 - 0.08 * sai)})`,
        filter: sai > 0 ? `blur(${sai * 6}px)` : undefined,
      }}
    >
      <div className="font-sans" style={{ position: 'absolute', left: 0, top: 0, width: JANELA.l, height: BARRA_NAV, background: '#e9edf1', borderBottom: '1px solid #d7dde3', display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((cor) => <div key={cor} style={{ width: 12, height: 12, borderRadius: 6, background: cor }} />)}
        </div>
        <RotateCw size={14} color="#7b8794" />
        <div style={{ margin: '0 auto', transform: 'translateX(-40px)', width: 460, height: 24, borderRadius: 7, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5, color: '#4b5865' }}>
          <Lock size={11} /> gestaodeacordos.com.br
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, top: BARRA_NAV, width: APP_L, height: APP_A, transform: `scale(${ESCALA_JANELA})`, transformOrigin: '0 0', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: APP_L, height: APP_A, transform: `translate(${APP_L / 2 - cam.x * cam.z}px, ${APP_A / 2 - cam.y * cam.z}px) scale(${cam.z})`, transformOrigin: '0 0' }}>
          <Casca aparece={T.janela + ms(150)} ativo="dashboard" anterior="dashboard" trocaEm={0} cliques={[]} desempenhoAberto={false} sobre={<ChatAutorizacoes />}>
            <Dashboard t={t} entra={T.janela + ms(250)} visita={1} />
          </Casca>
          <Cursor pontos={pontos} cliques={cliques} escalaInversa={1 / cam.z / ESCALA_JANELA} visivelDe={T.cursorAparece} visivelAte={T.fim} />
        </div>
      </div>
    </div>
  );
};

// ── fechamento: o passo a passo do líder ────────────────────────────────
const PASSOS = [
  { Icone: MessageCircle, texto: 'Abra o chat', cor: 'var(--primary)' },
  { Icone: ShieldCheck, texto: 'Autorizações', cor: '#D97706' },
  { Icone: Check, texto: 'Aprove ou recuse', cor: 'var(--success)' },
];

const Fechamento: React.FC = () => {
  const f = useCurrentFrame();
  if (f < T.fechamento) return null;
  const icone = mola(f, T.fechamento + ms(1700));
  const apaga = entre(f, T.total - ms(700), T.total - 1, 0, 1);
  return (
    <AbsoluteFill style={{ fontFamily: FONTE, alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: 250, fontSize: 64, fontWeight: 800, letterSpacing: -1.6, color: COR.texto }}>
        {'Líder, é só abrir o'.split(' ').map((p, i) => (
          <span key={i} style={{ display: 'inline-block', marginRight: 18, ...entrada(f, T.fechamento + ms(100), i, { passoMs: 70, deslocY: 24, duracaoMs: 520 }) }}>{p}</span>
        ))}
        <span style={{ display: 'inline-block', background: GRADIENTE_MARCA, WebkitBackgroundClip: 'text', color: 'transparent', ...entrada(f, T.fechamento + ms(100), 5, { passoMs: 70, deslocY: 24, duracaoMs: 520 }) }}>chat</span>
      </div>

      <div style={{ position: 'absolute', top: 430, display: 'flex', alignItems: 'center', gap: 26 }}>
        {PASSOS.map((p, i) => {
          const em = T.fechamento + ms(650 + i * 330);
          const m = mola(f, em);
          return (
            <div key={p.texto} style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
              {i > 0 && <ArrowRight size={34} color={COR.textoFraco} style={{ opacity: entre(f, em - ms(120), em + ms(200), 0, 1) }} />}
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 16, padding: '20px 30px', borderRadius: 22,
                  background: '#ffffff', boxShadow: SOMBRA_FLUTUA, border: '1px solid rgba(15,27,38,0.07)',
                  transform: `translateY(${(1 - m) * 30}px) scale(${0.9 + 0.1 * m})`, opacity: Math.min(1, m * 1.5),
                }}
              >
                <span style={{ width: 56, height: 56, borderRadius: 16, background: p.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  <p.Icone size={30} />
                </span>
                <span style={{ fontSize: 34, fontWeight: 700, color: COR.texto, letterSpacing: -0.5 }}>{p.texto}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ position: 'absolute', top: 600, fontSize: 28, fontWeight: 500, color: COR.textoSuave, ...entrada(f, T.fechamento + ms(1500), 0, { deslocY: 14, duracaoMs: 560 }) }}>
        O botão do canto saiu: os pedidos chegam na conversa <strong style={{ color: COR.texto }}>Autorizações</strong> do seu setor.
      </div>

      <div style={{ position: 'absolute', top: 720, display: 'flex', alignItems: 'center', gap: 18, transform: `scale(${0.6 + 0.4 * icone})`, opacity: Math.min(1, icone * 1.6) }}>
        <div style={{ width: 84, height: 84, borderRadius: 22, overflow: 'hidden', boxShadow: '0 16px 36px rgba(15,27,38,0.18)' }}>
          <Img src={staticFile('marca/app-512.png')} style={{ width: '100%', height: '100%' }} />
        </div>
        <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1, color: COR.texto }}>Gestão de Acordos</span>
      </div>

      <AbsoluteFill style={{ background: '#ffffff', opacity: apaga }} />
    </AbsoluteFill>
  );
};

// ── som ─────────────────────────────────────────────────────────────────
type Efeito = { arquivo: string; em: number; volume: number };

const Trilha: React.FC = () => {
  const efeitos: Efeito[] = [
    { arquivo: 'whoosh.wav', em: 2, volume: 0.22 },
    { arquivo: 'pop.wav', em: T.dock + ms(40), volume: 0.2 },
    { arquivo: 'whoosh.wav', em: T.voa - ms(40), volume: 0.42 },
    { arquivo: 'succao.wav', em: T.chega - ms(380), volume: 0.28 },
    { arquivo: 'pop.wav', em: T.chega, volume: 0.32 },
    { arquivo: 'chat-notificacao.mp3', em: T.aviso, volume: 0.55 },
    ...rota().cliques.map((em) => ({ arquivo: 'clique.wav', em, volume: 0.42 })),
    { arquivo: 'pop.wav', em: T.cliqueBolha + ms(90), volume: 0.2 },
    { arquivo: 'pop.wav', em: T.cliqueAprovar + ms(60), volume: 0.14 },
    { arquivo: 'ding.wav', em: DECIDE.aprovado, volume: 0.34 },
    { arquivo: 'whoosh.wav', em: T.reordena, volume: 0.14 },
    { arquivo: 'pop.wav', em: T.cliqueRecusar + ms(60), volume: 0.14 },
    { arquivo: 'ding.wav', em: DECIDE.recusado, volume: 0.22 },
    { arquivo: 'whoosh.wav', em: T.fim + ms(120), volume: 0.3 },
    ...[0, 1, 2].map((i) => ({ arquivo: 'pop.wav', em: T.fechamento + ms(650 + i * 330), volume: 0.22 })),
    { arquivo: 'impacto.wav', em: T.fechamento + ms(1700), volume: 0.34 },
  ];
  return (
    <>
      {efeitos.map((e, i) => (
        <Sequence key={i} from={Math.max(0, e.em)} name={e.arquivo}>
          <Audio src={staticFile(`sons/${e.arquivo}`)} volume={e.volume} />
        </Sequence>
      ))}
    </>
  );
};

export const VideoAutorizacoes: React.FC = () => {
  const t = useMemo(() => congelar(tempoApp()), []);
  const manchetes = [
    { de: ms(250), ate: T.voa, texto: 'O botão de autorizações *mudou de lugar*' },
    { de: T.voa, ate: T.aviso, texto: 'Agora ele fica *dentro do chat*' },
    { de: T.aviso, ate: T.cliqueBolha + ms(300), texto: 'Chegou pedido? *Você é avisado*' },
    { de: T.cliqueBolha + ms(300), ate: T.cliqueAprovar - ms(200), texto: 'Abra a conversa *Autorizações*' },
    { de: T.cliqueAprovar - ms(200), ate: T.reordena + ms(400), texto: 'Aprove *em um clique*' },
    { de: T.reordena + ms(400), ate: DECIDE.recusado + ms(500), texto: '…ou *recuse*' },
    { de: DECIDE.recusado + ms(500), ate: T.fim + ms(100), texto: 'Um líder decide, *vale para todos*' },
  ];
  return (
    <PessoaContext.Provider value={LIDER_PLAY3}>
      <AbsoluteFill>
        <Fundo />
        <Sistema t={t} />
        <Manchete itens={manchetes} />
        <Fechamento />
        <Trilha />
      </AbsoluteFill>
    </PessoaContext.Provider>
  );
};
