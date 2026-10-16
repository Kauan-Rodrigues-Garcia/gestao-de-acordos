// Cenas 3–11: o sistema aberto. O ícone da cena 2 cresce e vira a janela do
// navegador (mesma peça, sem corte); dentro dela a câmera passeia, o cursor
// clica e as telas se trocam no ritmo da narração.

import { useLayoutEffect, useMemo, useRef } from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { Lock, RotateCw } from 'lucide-react';
import { Avisos, type Aviso } from '../app/Avisos';
import { Casca } from '../app/Casca';
import { APP_A, APP_L, BARRA_NAV, ESCALA_JANELA, ICONE, JANELA, JANELA_A } from '../app/layout';
import { Acordos, DialogosAcordos } from '../app/paginas/Acordos';
import { Chat } from '../app/paginas/Chat';
import { Comemoracao } from '../app/paginas/Comemoracao';
import { Dashboard } from '../app/paginas/Dashboard';
import { DesempenhoDia } from '../app/paginas/DesempenhoDia';
import { NovoAcordo } from '../app/paginas/NovoAcordo';
import { WhatsApp } from '../app/paginas/WhatsApp';
import { cameraDoRoteiro, cliquesDaCasca, rotaDoCursor, telaEm, tempoApp, type Camera } from '../app/roteiro';
import { Celular, CEL_A, CEL_L } from '../componentes/Celular';
import { Cursor } from '../componentes/Cursor';
import { ACELERA, entre, mola, ms, s, SUAVE, SUAVE_IDA_VOLTA } from '../movimento';
import { SOMBRA_FLUTUA } from '../tema';
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

/**
 * Só no `npm run medir`: depois de desenhar o quadro, anota onde ficou cada
 * elemento com `data-alvo` (em coordenadas do app) e escreve no console.
 */
const Medidor: React.FC<{ raiz: React.RefObject<HTMLDivElement | null> }> = ({ raiz }) => {
  const f = useCurrentFrame();
  useLayoutEffect(() => {
    const r = raiz.current;
    if (!r) return;
    const caixa = r.getBoundingClientRect();
    const esc = caixa.width / APP_L;
    const medidas: Record<string, number[]> = {};
    r.querySelectorAll<HTMLElement>('[data-alvo]').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) return;
      medidas[el.dataset.alvo!] = [
        Math.round((b.left - caixa.left) / esc),
        Math.round((b.top - caixa.top) / esc),
        Math.round(b.width / esc),
        Math.round(b.height / esc),
      ];
    });
    console.warn(`ALVOS|${f}|${JSON.stringify(medidas)}`);
  });
  return null;
};

export const SecaoApp: React.FC<{ medir?: boolean }> = ({ medir = false }) => {
  const f = useCurrentFrame();
  const t = useMemo(() => tempoApp(), []);
  const rota = useMemo(() => rotaDoCursor(t), [t]);
  const chavesCamera = useMemo(() => cameraDoRoteiro(t), [t]);
  const cliques = useMemo(() => cliquesDaCasca(t), [t]);
  const raiz = useRef<HTMLDivElement>(null);

  if (f < t.expandir) return null;

  const { atual, anterior, indice } = telaEm(t, f);
  const c = t.clique;
  const desempenhoAberto = f >= c.desempenho && f < c.fecharDia + ms(40);

  // ── o ícone vira janela ──
  const m = entre(f, t.expandir, t.expandir + s(0.95), 0, 1, SUAVE);
  const alturaFinal = JANELA_A;
  const ret = {
    x: lerp(ICONE.cx - ICONE.lado / 2, JANELA.x, m),
    y: lerp(ICONE.cy - ICONE.lado / 2, JANELA.y, m),
    l: lerp(ICONE.lado, JANELA.l, m),
    a: lerp(ICONE.lado, alturaFinal, m),
    r: lerp(ICONE.raio, 14, m),
  };
  const iconeSome = entre(f, t.expandir + ms(120), t.expandir + ms(520), 1, 0);
  const appSurge = entre(f, t.expandir + ms(250), t.expandir + ms(700), 0, 1);

  // ── cena 11: janela vai para a esquerda, celular entra pela direita ──
  const vaiEsq = entre(f, t.computador - ms(80), t.computador + ms(800), 0, 1, SUAVE);
  const cel = mola(f, t.celular - ms(160));
  // ── cena 12: tudo recolhe ──
  const recolhe = entre(f, t.c12.inicio, t.c12.inicio + ms(450), 0, 1, ACELERA);
  if (recolhe >= 1 && !medir) return null;

  const centroJanela = { x: JANELA.x + JANELA.l / 2, y: JANELA.y + alturaFinal / 2 };
  const dx = (700 - centroJanela.x) * vaiEsq;
  const dy = (620 - centroJanela.y) * vaiEsq;
  const escJanela = (1 - 0.32 * vaiEsq) * (1 - 0.06 * recolhe);

  const cam = cameraEm(f, chavesCamera);
  const camTransform = `translate(${APP_L / 2 - cam.x * cam.z}px, ${APP_A / 2 - cam.y * cam.z}px) scale(${cam.z})`;

  const avisos: Aviso[] = [
    { de: t.toastNovo, ate: c.acordos - ms(100), titulo: 'Acordo criado! 3 parcelas negociadas.' },
    { de: c.pago + ms(120), ate: c.reagendar - ms(60), titulo: 'Acordo marcado como Pago!', descricao: 'Errou? O botão «Desfazer» fica na linha por 5 minutos.', acao: 'Desfazer' },
    { de: c.confirmar + ms(480), ate: c.desempenho - ms(60), titulo: 'Parcela 3/4 reagendada para 13/11/2026!' },
  ];

  const manchetes = [
    { de: t.c3.inicio + ms(80), ate: t.c4.inicio, texto: 'Seu dia, *organizado*' },
    { de: t.c4.inicio, ate: t.c5.inicio, texto: 'Acordo registrado *em segundos*' },
    { de: t.c5.inicio, ate: t.c6.inicio, texto: 'Cada acordo *na sua mão*' },
    { de: t.c6.inicio, ate: t.c7.inicio, texto: 'Seu recebimento, *ao vivo*' },
    { de: t.c7.inicio, ate: t.c8.inicio, texto: 'Você, sua equipe e seu setor, *num só lugar*' },
    { de: t.c8.inicio, ate: t.c9.inicio, texto: 'Mensagens *prontas*' },
    { de: t.c9.inicio, ate: t.c10.inicio, texto: 'Seu líder *a um clique*' },
    { de: t.c10.inicio + ms(200), ate: t.c11.inicio, texto: 'Bateu a meta? *Todos comemoram*' },
    { de: t.c11.inicio + ms(80), ate: t.c12.inicio, texto: 'No computador *ou no celular*' },
  ];

  const pagina = (() => {
    const visita = indice >= 3 ? 2 : 1;
    if (atual.id === 'dashboard') return <Dashboard key={`d${indice}`} t={t} entra={atual.entra} visita={visita} />;
    if (atual.id === 'novo') return <NovoAcordo key="n" t={t} entra={atual.entra} />;
    return <Acordos key={`a${indice}`} t={t} entra={atual.entra} visita={visita} />;
  })();

  return (
    <AbsoluteFill style={{ opacity: 1 - recolhe, filter: recolhe > 0 ? `blur(${recolhe * 8}px)` : undefined }}>
      {/* ── a janela do navegador ── */}
      <div
        style={{
          position: 'absolute',
          left: ret.x,
          top: ret.y,
          width: ret.l,
          height: ret.a,
          borderRadius: ret.r,
          overflow: 'hidden',
          background: '#ffffff',
          boxShadow: `${SOMBRA_FLUTUA}, 0 0 0 1px rgba(15,27,38,${0.08 * m})`,
          transform: `translate(${dx}px, ${dy}px) scale(${escJanela})`,
          transformOrigin: '50% 50%',
        }}
      >
        {/* barra do navegador (fixa: a câmera mexe só no conteúdo) */}
        <div
          className="font-sans"
          style={{
            position: 'absolute',
            left: ret.l / 2 - JANELA.l / 2,
            top: ret.a / 2 - alturaFinal / 2,
            width: JANELA.l,
            height: BARRA_NAV,
            background: '#e9edf1',
            borderBottom: '1px solid #d7dde3',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '0 16px',
            boxSizing: 'border-box',
            opacity: appSurge,
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            {['#ff5f57', '#febc2e', '#28c840'].map((cor) => (
              <div key={cor} style={{ width: 12, height: 12, borderRadius: 6, background: cor }} />
            ))}
          </div>
          <RotateCw size={14} color="#7b8794" />
          <div style={{ margin: '0 auto', transform: 'translateX(-40px)', width: 460, height: 24, borderRadius: 7, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5, color: '#4b5865' }}>
            <Lock size={11} /> gestaodeacordos.com.br
          </div>
        </div>

        {/* o app, com a câmera */}
        <div
          style={{
            position: 'absolute',
            left: ret.l / 2 - JANELA.l / 2,
            top: ret.a / 2 - alturaFinal / 2 + BARRA_NAV,
            width: APP_L,
            height: APP_A,
            transform: `scale(${ESCALA_JANELA})`,
            transformOrigin: '0 0',
            opacity: appSurge,
            overflow: 'hidden',
          }}
        >
          <div ref={raiz} style={{ position: 'absolute', left: 0, top: 0, width: APP_L, height: APP_A, transform: camTransform, transformOrigin: '0 0' }}>
            <Casca
              aparece={t.conteudo}
              ativo={atual.menu}
              anterior={anterior.menu}
              trocaEm={atual.entra - ms(60)}
              cliques={cliques}
              desempenhoAberto={desempenhoAberto}
              sobre={
                <>
                  <DesempenhoDia t={t} />
                  <DialogosAcordos t={t} />
                  <WhatsApp t={t} />
                  <Chat t={t} />
                  <Comemoracao t={t} />
                  <Avisos avisos={avisos} />
                </>
              }
            >
              {pagina}
            </Casca>
            <Cursor pontos={rota.pontos} cliques={rota.cliques} escalaInversa={1 / cam.z / ESCALA_JANELA} visivelDe={t.c3.inicio} visivelAte={t.metaVem - ms(100)} />
          </div>
          {medir && <Medidor raiz={raiz} />}
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
            <Img src={staticFile('marca/app-512.png')} style={{ width: '100%', height: '100%' }} />
          </div>
        )}
      </div>

      {/* ── celular (cena 11) ── */}
      {f >= t.celular - ms(160) && (
        <div
          style={{
            position: 'absolute',
            left: 1460 - CEL_L / 2 + (1 - cel) * 700,
            top: 612 - CEL_A / 2,
            transform: `scale(${0.92 * (1 - 0.06 * recolhe)}) rotate(${(1 - cel) * 8}deg)`,
            transformOrigin: '50% 50%',
          }}
        >
          <Celular aparece={t.celular - ms(160)} aviso={t.celular + ms(420)} />
        </div>
      )}

      <Manchete itens={manchetes} />
    </AbsoluteFill>
  );
};
