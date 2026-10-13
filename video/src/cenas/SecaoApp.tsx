// Cenas 3–11: o sistema aberto. O ícone da cena 2 cresce e vira a janela
// (mesma peça, sem corte); dentro dela a câmera passeia, o cursor clica e as
// telas se trocam no ritmo da narração.

import { useMemo } from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { APP_A, APP_L, ESCALA_JANELA, ICONE, JANELA } from '../app/layout';
import { Moldura, tituloDe } from '../app/Moldura';
import { Acordos } from '../app/paginas/Acordos';
import { Campanhas } from '../app/paginas/Campanhas';
import { ChatLider } from '../app/paginas/ChatLider';
import { Dashboard } from '../app/paginas/Dashboard';
import { Desempenho, META_DIA, RECEBIDO_1, RECEBIDO_2 } from '../app/paginas/Desempenho';
import { Inicio } from '../app/paginas/Inicio';
import { NovoAcordo } from '../app/paginas/NovoAcordo';
import { cameraDoRoteiro, cliquesMenu, menuAtivo, rotaDoCursor, telas, tempoApp, type Camera } from '../app/roteiro';
import { Celular, CEL_A, CEL_L } from '../componentes/Celular';
import { Cursor } from '../componentes/Cursor';
import { logoSrc } from '../componentes/Poeira';
import { ACELERA, entre, mola, ms, s, SUAVE, SUAVE_IDA_VOLTA } from '../movimento';
import { Comemoracao } from './Comemoracao';
import { Manchete } from './Manchete';

function cameraEm(frame: number, chaves: Camera[]) {
  let atual = { z: chaves[0].z, x: chaves[0].x, y: chaves[0].y };
  for (let i = 1; i < chaves.length; i++) {
    const k = chaves[i];
    const dur = ms(k.durMs ?? 800);
    if (frame <= k.f - dur) break;
    const p = SUAVE_IDA_VOLTA(Math.min(1, (frame - (k.f - dur)) / dur));
    atual = { z: atual.z + (k.z - atual.z) * p, x: atual.x + (k.x - atual.x) * p, y: atual.y + (k.y - atual.y) * p };
    if (frame < k.f) break;
  }
  // não deixa a câmera mostrar fora da tela do app
  const meiaL = APP_L / 2 / atual.z;
  const meiaA = APP_A / 2 / atual.z;
  return {
    z: atual.z,
    x: Math.min(APP_L - meiaL, Math.max(meiaL, atual.x)),
    y: Math.min(APP_A - meiaA, Math.max(meiaA, atual.y)),
  };
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

export const SecaoApp: React.FC = () => {
  const f = useCurrentFrame();
  const t = useMemo(() => tempoApp(), []);
  const rota = useMemo(() => rotaDoCursor(t), [t]);
  const chavesCamera = useMemo(() => cameraDoRoteiro(t), [t]);
  const lista = useMemo(() => telas(t), [t]);
  const cliques = useMemo(() => cliquesMenu(t), [t]);

  if (f < t.expandir) return null;

  // ── menu ativo e troca ──
  const ativo = menuAtivo(t, f);
  const i = lista.findIndex((x) => x.id === ativo);
  const trocaEm = lista[i].entra;
  const anterior = i > 0 ? lista[i - 1].id : ativo;

  // ── meta do dia (pílula do cabeçalho) ──
  const recebidoCena6 =
    RECEBIDO_1 * entre(f, t.contaRecebido, t.contaRecebido + ms(1500), 0, 1, SUAVE) +
    (RECEBIDO_2 - RECEBIDO_1) * entre(f, t.atualizado + ms(250), t.atualizado + ms(900), 0, 1, SUAVE);
  const metaBase = f < t.contaRecebido ? 3450 : Math.max(3450, recebidoCena6);
  const meta = Math.min(1.02, metaBase / META_DIA + entre(f, t.metaEnche - ms(100), t.metaEnche + ms(500), 0, 1.02 - RECEBIDO_2 / META_DIA, SUAVE));
  const metaBrilho = Math.min(entre(f, t.metaEnche + ms(300), t.metaEnche + ms(600), 0, 1), entre(f, t.c11.inicio, t.c11.inicio + ms(400), 1, 0));

  // ── o ícone vira janela ──
  const m = entre(f, t.expandir, t.expandir + s(0.95), 0, 1, SUAVE);
  const ret = {
    x: lerp(ICONE.cx - ICONE.lado / 2, JANELA.x, m),
    y: lerp(ICONE.cy - ICONE.lado / 2, JANELA.y, m),
    l: lerp(ICONE.lado, JANELA.l, m),
    a: lerp(ICONE.lado, JANELA.a, m),
    r: lerp(ICONE.raio, 18, m),
  };
  const iconeSome = entre(f, t.expandir + ms(120), t.expandir + ms(520), 1, 0);
  const appSurge = entre(f, t.expandir + ms(250), t.expandir + ms(700), 0, 1);

  // ── cena 11: janela vai para a esquerda, celular entra pela direita ──
  const vaiEsq = entre(f, t.computador - ms(80), t.computador + ms(800), 0, 1, SUAVE);
  const cel = mola(f, t.celular - ms(160));
  // ── cena 12: tudo recolhe ──
  const recolhe = entre(f, t.c12.inicio, t.c12.inicio + ms(450), 0, 1, ACELERA);
  if (recolhe >= 1) return null;

  const centroJanela = { x: JANELA.x + JANELA.l / 2, y: JANELA.y + JANELA.a / 2 };
  const dx = (700 - centroJanela.x) * vaiEsq;
  const dy = (610 - centroJanela.y) * vaiEsq;
  const escJanela = (1 - 0.34 * vaiEsq) * (1 - 0.08 * recolhe);

  const cam = cameraEm(f, chavesCamera);
  const camTransform = `translate(${APP_L / 2 - cam.x * cam.z}px, ${APP_A / 2 - cam.y * cam.z}px) scale(${cam.z})`;

  const manchetes = [
    { de: t.c3.inicio + ms(80), ate: t.c4.inicio, texto: 'Seu dia, *organizado*' },
    { de: t.c4.inicio, ate: t.c5.inicio, texto: 'Acordo registrado *em segundos*' },
    { de: t.c5.inicio, ate: t.c6.inicio, texto: 'Cada acordo *na sua mão*' },
    { de: t.c6.inicio, ate: t.c7.inicio, texto: 'Seu recebimento, *ao vivo*' },
    { de: t.c7.inicio, ate: t.c8.inicio, texto: 'Sua equipe e seu setor, *num só lugar*' },
    { de: t.c8.inicio, ate: t.c9.inicio, texto: 'Mensagens *prontas*' },
    { de: t.c9.inicio, ate: t.c10.inicio, texto: 'Seu líder *a um clique*' },
    { de: t.c10.inicio + ms(200), ate: t.c11.inicio, texto: 'Bateu a meta? *Todos comemoram*' },
    { de: t.c11.inicio + ms(80), ate: t.c12.inicio, texto: 'No computador *ou no celular*' },
  ];

  return (
    <AbsoluteFill style={{ opacity: 1 - recolhe, filter: recolhe > 0 ? `blur(${recolhe * 8}px)` : undefined }}>
      {/* ── a janela ── */}
      <div
        style={{
          position: 'absolute',
          left: ret.x,
          top: ret.y,
          width: ret.l,
          height: ret.a,
          borderRadius: ret.r,
          overflow: 'hidden',
          background: '#0a1a24',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 50px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.4), 0 0 140px rgba(41,168,224,0.10)',
          transform: `translate(${dx}px, ${dy}px) scale(${escJanela})`,
          transformOrigin: '50% 50%',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: ret.l / 2 - JANELA.l / 2,
            top: ret.a / 2 - JANELA.a / 2,
            width: APP_L,
            height: APP_A,
            transform: `scale(${ESCALA_JANELA})`,
            transformOrigin: '0 0',
            opacity: appSurge,
          }}
        >
          <div style={{ position: 'absolute', inset: 0, transform: camTransform, transformOrigin: '0 0' }}>
            <Moldura
              aparece={t.conteudo}
              ativo={ativo}
              trocaEm={trocaEm}
              anterior={anterior}
              cliquesMenu={cliques}
              titulo={tituloDe(ativo)}
              tituloDesde={trocaEm}
              meta={meta}
              metaBrilho={metaBrilho}
              avisoChat={t.avisoChat}
              chatLidoEm={t.clique.chat}
            >
              {lista.map((tela) => {
                const P = { inicio: Inicio, novo: NovoAcordo, acordos: Acordos, desempenho: Desempenho, dashboard: Dashboard, campanhas: null } as const;
                if (tela.id === 'campanhas') return <Campanhas key={tela.id} t={t} entra={tela.entra} sai={tela.sai} zapSai={t.c9.inicio} />;
                const Comp = P[tela.id as Exclude<keyof typeof P, 'campanhas'>];
                return Comp ? <Comp key={tela.id} t={t} entra={tela.entra} sai={tela.sai} /> : null;
              })}
              <ChatLider t={t} fecha={t.c10.inicio} />
            </Moldura>
            <Cursor pontos={rota.pontos} cliques={rota.cliques} escalaInversa={1 / cam.z / ESCALA_JANELA} visivelDe={t.c3.inicio} visivelAte={t.explode - ms(150)} />
          </div>
        </div>

        {/* o ícone, sumindo enquanto a janela abre */}
        {iconeSome > 0 && (
          <div
            style={{
              position: 'absolute',
              left: ret.l / 2 - (ICONE.lado * (1 + 0.4 * m)) / 2,
              top: ret.a / 2 - (ICONE.lado * (1 + 0.4 * m)) / 2,
              width: ICONE.lado * (1 + 0.4 * m),
              height: ICONE.lado * (1 + 0.4 * m),
              opacity: iconeSome,
            }}
          >
            <Img src={logoSrc('app-512.png')} style={{ width: '100%', height: '100%' }} />
          </div>
        )}
      </div>

      {/* ── celular (cena 11) ── */}
      {f >= t.celular - ms(160) && (
        <div
          style={{
            position: 'absolute',
            left: 1450 - CEL_L / 2 + (1 - cel) * 700,
            top: 610 - CEL_A / 2,
            transform: `scale(${0.95 * (1 - 0.08 * recolhe)}) rotate(${(1 - cel) * 8}deg)`,
            transformOrigin: '50% 50%',
          }}
        >
          <Celular aparece={t.celular - ms(160)} aviso={t.celular + ms(420)} />
        </div>
      )}

      <Comemoracao t={t} />
      <Manchete itens={manchetes} />
    </AbsoluteFill>
  );
};
