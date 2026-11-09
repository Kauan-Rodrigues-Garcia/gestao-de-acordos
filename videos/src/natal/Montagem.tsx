// A montagem do fim de outubro (Cleber, 28/10): depois da poção da
// escuridão, o vídeo NÃO volta ao sistema. A luz abre num cenário só dele, a
// noite, e outubro passa rapidinho por ali, uma coisa puxando a outra:
//
//   1. a pesquisa «Cafezinho»: alguém responde, o resultado sobe (97,6%), os
//      comentários aparecem e o obrigado;
//   2. o player: abre, toca uns segundos de uma música dele… e vira a lápide;
//   3. a Corrida das Almas: uma corrida de verdade do motor do sistema, com
//      as 13 pessoas que venceram as corridas de bichinhos;
//   4. a Corrida de Cavalos com a Guerra na Corrida, gravada da página
//      original: no meio da prova a guerra, o Cavalo da Guerra estoura a
//      janela, leva uma bomba, e a explosão cobre a tela — dela entra o mural
//      de outubro, que no fim é embrulhado no papel do presente.
//
// Tudo nas coordenadas da tela (1920×1080): aqui não há sistema para imitar.
// As peças do sistema que aparecem (o cartão da pesquisa, o «Tocando agora»,
// a lápide, a janela da corrida) vêm com o visual delas.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, Audio, cancelRender, continueRender, delayRender, Freeze, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Ghost, Music, Pause, Play, Repeat, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { loadFont as fonteNunito } from '@remotion/google-fonts/Nunito';
import { loadFont as fonteCaveat } from '@remotion/google-fonts/Caveat';
import { loadFont as fonteRacing } from '@remotion/google-fonts/RacingSansOne';
import { loadFont as fonteSaira } from '@remotion/google-fonts/SairaCondensed';
import { loadFont as fonteRubik } from '@remotion/google-fonts/Rubik';
import { loadFont as fontePlex } from '@remotion/google-fonts/IBMPlexMono';
import { loadFont as fontePirata } from '@remotion/google-fonts/PirataOne';
import { loadFont as fonteOrbitron } from '@remotion/google-fonts/Orbitron';
import { loadFont as fonteCinzel } from '@remotion/google-fonts/CinzelDecorative';
import { loadFont as fonteMetal } from '@remotion/google-fonts/MetalMania';
import { EMBUTIDAS, estiloDaFaixa, type InfoFaixa } from '@/components/SomAmbiente/faixas';
import '@/components/SomAmbiente/somAmbiente.css';
import { criarMotor, type Gravacao, type Motor } from '@/components/Corrida/motor/motor';
import { desempacotarGravacao } from '@/components/Corrida/gravacao';
import infoCorrida from '../../public/natal/corrida/gravacao.json';
import infoCavalos from '../../public/natal/cavalos/cavalos.json';
import { ACELERA, entre, mola, ms, s, SUAVE, SUAVE_IDA_VOLTA } from '../movimento';
import { Recados, type Recado } from './Recado';
import { BASE_PERF, PalcoVirtual } from './RelogioVirtual';
import { Seta } from './Seta';
import { A, Ceu, L, sorteio } from './Ceu';
import { CAVALO_DA_GUERRA, COMENTARIOS, CORRIDAS, PESQUISA } from './dados';
import './montagem.css';
import { NOME } from './nome';
import { CenaErika, ClaraoDoPremio, SonsDaErika, cameraNoPremio, roteiroDaErika } from './Erika';
import { Laco } from '@/components/Natal/presente/arte';
import { estiloDaFita, estiloDoPapel } from '@/components/Natal/presente/papel';

fonteNunito('normal', { weights: ['600', '700', '800', '900'], subsets: ['latin', 'latin-ext'] });
fonteCaveat('normal', { weights: ['700'], subsets: ['latin', 'latin-ext'] });
// As fontes que o motor da corrida desenha no canvas (`FONTES` do `PalcoCorrida`).
fonteRacing('normal', { weights: ['400'], subsets: ['latin', 'latin-ext'] });
fonteSaira('normal', { weights: ['400', '600', '700', '800'], subsets: ['latin', 'latin-ext'] });
fonteRubik('normal', { weights: ['400', '600', '700', '800'], subsets: ['latin', 'latin-ext'] });
fontePlex('normal', { weights: ['400', '600'], subsets: ['latin', 'latin-ext'] });
fontePirata('normal', { weights: ['400'], subsets: ['latin', 'latin-ext'] });
fonteOrbitron('normal', { weights: ['400', '700', '900'], subsets: ['latin'] });
fonteCinzel('normal', { weights: ['400', '700'], subsets: ['latin', 'latin-ext'] });
fonteMetal('normal', { weights: ['400'], subsets: ['latin', 'latin-ext'] });


// ── O roteiro ───────────────────────────────────────────────────────────────

export function roteiroDaMontagem(M: number) {
  const pesquisa = { entra: M + ms(400), clique: M + s(1.7), resultado: M + s(2.1), comentarios: M + s(4.3), obrigado: M + s(7.2), sai: M + s(8.8) };
  const P = pesquisa.sai + ms(200);
  // A lista rola até a música, o clique toca ~3 s, e a janela encolhe até virar a lápide.
  const player = { entra: P, rola: [P + s(0.7), P + s(2.3)] as const, clique: P + s(2.7), morre: P + s(5.8), lapide: P + s(6.9), sai: P + s(9.2) };
  const C = player.sai + ms(200);
  const corrida = { entra: C, corte: C + s(2.8), sai: C + s(7.2) };
  // A corrida de cavalos; no meio dela a guerra; a janela estoura e entra o Cavalo da Guerra;
  // uma bomba cai nele, a explosão cobre a tela, e dela entra o mural.
  const K = corrida.sai + ms(200);
  const cavalos = {
    entra: K, guerra: K + s(3.4), comecaGuerra: K + s(5.0), telaCheia: K + s(10.4), chefe: K + s(11.0),
    bomba: K + s(14.2), explosao: K + s(15.0), cheia: K + s(16.6), mural: K + s(16.5),
    /**
     * O mural é embrulhado no papel do presente (Cleber, 28/10): o vídeo acaba
     * no mural embrulhado, e o app o leva de volta para dentro do presente.
     */
    // Antes do papel, a Garrafa da Erika (08/11/2026): a câmera entra no cartão
    // do prêmio do mural (o mural gravado tem 7,2 s, até K + 23,7) e sai o mural dela.
    embrulha: K + s(22.4) + s(7.0), fim: K + s(22.4) + s(9.2),
  };
  const erika = roteiroDaErika(K + s(22.4));
  return { inicio: M, pesquisa, player, corrida, cavalos, erika, fim: cavalos.fim };
}
export type RoteiroMontagem = ReturnType<typeof roteiroDaMontagem>;

// ── O cenário ───────────────────────────────────────────────────────────────

/** A noite: céu, estrelas piscando, o chão iluminado — e a luz voltando do preto da poção. */
const Cenario: React.FC<{ r: RoteiroMontagem }> = ({ r }) => {
  const f = useCurrentFrame();
  const raio = entre(f, r.inicio, r.inicio + s(1.3), 0, 1500, SUAVE);
  return (
    <AbsoluteFill>
      <Ceu />
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 52%, transparent ${raio}px, #000 ${raio + 260}px)` }} />
    </AbsoluteFill>
  );
};

// ── 1. A pesquisa ───────────────────────────────────────────────────────────

// Os desenhos do cartão «Cafezinho» (`CartaoPesquisa.tsx`, arquivo morto),
// copiados: aquele arquivo puxa o banco junto.
type Nota = 'ruim' | 'media' | 'boa';
const FUNDO_ROSTO: Record<Nota, string> = { ruim: '#ffb8a6', media: '#ffd774', boa: '#9fdcaa' };
const BOCA: Record<Nota, string> = { ruim: 'M15 33 Q24 25 33 33', media: 'M16 31 L32 31', boa: 'M14 27 Q24 38 34 27' };
const TINTA = '#4a2e22';
const ROTULO: Record<Nota, string> = { ruim: 'Ruim', media: 'Tá ok', boa: 'Tô curtindo' };

const Rosto: React.FC<{ nota: Nota; tam?: number }> = ({ nota, tam }) => (
  <svg viewBox="0 0 48 48" aria-hidden="true" style={tam ? { width: tam, height: tam } : undefined}>
    <circle cx="24" cy="24" r="21" fill={FUNDO_ROSTO[nota]} />
    {nota !== 'ruim' && <><circle cx="12.5" cy="28" r="3.6" fill="#ff9f87" /><circle cx="35.5" cy="28" r="3.6" fill="#ff9f87" /></>}
    {nota === 'ruim' && <path d="M12 15 L20 18 M36 15 L28 18" stroke={TINTA} strokeWidth="2.4" strokeLinecap="round" />}
    <circle cx="17.5" cy="21" r="2.7" fill={TINTA} />
    <circle cx="30.5" cy="21" r="2.7" fill={TINTA} />
    <path d={BOCA[nota]} fill="none" stroke={TINTA} strokeWidth="2.8" strokeLinecap="round" />
  </svg>
);

/** A caneca com o vapor subindo (no app, `pq-vapor`: 2,6 s, as três fora de compasso). */
const Caneca: React.FC<{ t: number; tam?: number }> = ({ t, tam = 44 }) => (
  <svg viewBox="0 0 64 64" aria-hidden="true" style={{ width: tam, height: tam, flex: 'none' }}>
    <g fill="none" stroke="#d9a679" strokeWidth="2.4" strokeLinecap="round">
      {['M22 14c-3-4 3-6 0-10', 'M31 14c-3-4 3-6 0-10', 'M40 14c-3-4 3-6 0-10'].map((d, i) => {
        const k = (((t - i * 0.5) / 2.6) % 1 + 1) % 1;
        const op = k < 0.4 ? (k / 0.4) * 0.9 : 0.9 * (1 - (k - 0.4) / 0.6);
        return <path key={i} d={d} opacity={op} transform={`translate(0 ${4 - 10 * k})`} />;
      })}
    </g>
    <path d="M12 22h38v18a14 14 0 0 1-14 14H26a14 14 0 0 1-14-14z" fill="#f28c5b" />
    <path d="M12 22h38v6H12z" fill="#e5784a" />
    <path d="M50 27h3a7 7 0 0 1 0 14h-4" fill="none" stroke="#f28c5b" strokeWidth="4.5" />
    <path d="M25 37c0-3 6-3 6 0 0-3 6-3 6 0 0 4-6 7-6 7s-6-3-6-7z" fill="#fff4e6" />
    <ellipse cx="31" cy="57" rx="22" ry="3" fill="#e9c9ad" />
  </svg>
);

/** A caneca do «obrigado», com o coração flutuando (`pq-flutua`, 1,6 s). */
const CanecaCoracao: React.FC<{ t: number; tam?: number }> = ({ t, tam = 54 }) => {
  const k = 0.5 - 0.5 * Math.cos((t / 1.6) * Math.PI * 2);
  return (
    <svg viewBox="0 0 64 64" width={tam} height={tam} aria-hidden="true">
      <path d="M24 10c0-5 8-5 8 0 0-5 8-5 8 0 0 6-8 10-8 10s-8-4-8-10z" fill="#ff7a6b" transform={`translate(32 15) scale(${1 + 0.08 * k}) translate(-32 ${-15 - 3 * k})`} />
      <path d="M12 22h38v18a14 14 0 0 1-14 14H26a14 14 0 0 1-14-14z" fill="#f28c5b" />
      <path d="M50 27h3a7 7 0 0 1 0 14h-4" fill="none" stroke="#f28c5b" strokeWidth="4.5" />
      <ellipse cx="31" cy="57" rx="22" ry="3" fill="#e9c9ad" />
    </svg>
  );
};

const pct = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** Onde o clique cai: no «Tô curtindo» do cartão (ampliado 2,2× no meio da tela). */
const ESCALA_CARTAO = 2.2;
const ALVO_CURTINDO = { x: 960 + (242 - 150) * ESCALA_CARTAO, y: A / 2 + (122 - 84) * ESCALA_CARTAO };

const CenaPesquisa: React.FC<{ p: RoteiroMontagem['pesquisa'] }> = ({ p }) => {
  const f = useCurrentFrame();
  if (f < p.entra || f > p.sai + ms(500)) return null;
  const t = (f - p.entra) / 60;

  // O cartão da pergunta, como ele aparecia no canto da tela, só que grande.
  const entraCartao = mola(f, p.entra);
  const saiCartao = entre(f, p.resultado, p.resultado + ms(300), 0, 1, ACELERA);
  const escolhida = f >= p.clique;
  const pulo = escolhida ? Math.sin(Math.min(1, (f - p.clique) / ms(260)) * Math.PI) : 0;

  // O resultado: entra no lugar do cartão; com os comentários, sobe e encolhe.
  const entraRes = mola(f, p.resultado);
  const sobe = entre(f, p.comentarios, p.comentarios + ms(600), 0, 1, SUAVE);
  const conta = entre(f, p.resultado + ms(200), p.resultado + s(1.5), 0, 1, SUAVE);
  const saiTudo = entre(f, p.obrigado - ms(300), p.obrigado, 0, 1, ACELERA);

  // O obrigado
  const entraObg = mola(f, p.obrigado);
  const saiObg = entre(f, p.sai, p.sai + ms(400), 0, 1, ACELERA);

  const linhas: [Nota, { n: number; pct: number }][] = [['boa', PESQUISA.curtindo], ['media', PESQUISA.ok], ['ruim', PESQUISA.ruim]];

  return (
    <>
      {saiCartao < 1 && (
        <div style={{ position: 'absolute', left: 960, top: A / 2, transform: `translate(-50%, -50%) translateY(${(1 - entraCartao) * 60}px) scale(${ESCALA_CARTAO * (0.94 + 0.06 * entraCartao) * (1 - 0.08 * saiCartao)})`, opacity: Math.min(1, entraCartao * 1.5) * (1 - saiCartao) }}>
          <div className="pq-caf" role="dialog">
            <div className="pq-cab">
              <Caneca t={t} />
              <div>
                <div className="pq-oi">Oi!</div>
                <div className="pq-sub">Pega um cafezinho e me conta rapidinho?</div>
              </div>
            </div>
            <p className="pq-perg">Como tá sendo usar o Gestão de Acordos?</p>
            <div className="pq-ops">
              {(['ruim', 'media', 'boa'] as Nota[]).map(n => (
                <button key={n} type="button" className={`pq-op ${n}`} aria-pressed={escolhida && n === 'boa'}
                  style={n === 'boa' && escolhida ? { transform: `translateY(${-3 * pulo}px)` } : undefined}>
                  <span style={{ display: 'inline-flex', transform: n === 'boa' && escolhida ? `rotate(${-8 * pulo}deg) scale(${1 + 0.15 * pulo})` : undefined }}><Rosto nota={n} /></span>
                  {ROTULO[n]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {f >= p.resultado && saiTudo < 1 && (
        <div style={{
          position: 'absolute', left: 960, top: A / 2 + 20 - 220 * sobe,
          transform: `translate(-50%, -50%) scale(${(0.9 + 0.1 * entraRes) * (1 - 0.3 * sobe)})`,
          opacity: Math.min(1, entraRes * 1.5) * (1 - saiTudo),
        }}>
          <div className="pq-caf" style={{ width: 1180, padding: '40px 48px', gap: 0, gridTemplateColumns: '440px 1fr', alignItems: 'center', borderRadius: 36 }}>
            <div style={{ display: 'grid', justifyItems: 'start', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Caneca t={t} tam={64} />
                <span style={{ font: '800 22px Nunito, sans-serif', color: '#a0745a', letterSpacing: '0.08em', textTransform: 'uppercase' }}>A pesquisa · {PESQUISA.votos} votos</span>
              </div>
              <div style={{ font: '900 150px Nunito, sans-serif', lineHeight: 1, letterSpacing: '-0.03em', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{pct(PESQUISA.aprovacao * conta)}</div>
              <div style={{ font: '800 30px Nunito, sans-serif', color: '#8a5f48' }}>curtiram ou acharam ok</div>
            </div>
            <div style={{ display: 'grid', gap: 22 }}>
              {linhas.map(([n, v], i) => {
                const k = entre(f, p.resultado + ms(300 + i * 150), p.resultado + ms(1300 + i * 150), 0, 1, SUAVE);
                return (
                  <div key={n} style={{ display: 'grid', gridTemplateColumns: '60px 170px 1fr 150px', alignItems: 'center', gap: 16 }}>
                    <Rosto nota={n} tam={60} />
                    <span style={{ font: '900 28px Nunito, sans-serif' }}>{ROTULO[n]}</span>
                    <div style={{ height: 22, borderRadius: 999, background: 'rgb(217 138 78 / 0.16)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${v.pct * k}%`, borderRadius: 999, background: n === 'boa' ? '#5cbf73' : n === 'media' ? '#f2b84b' : '#f08a72' }} />
                    </div>
                    <span style={{ font: '800 26px Nunito, sans-serif', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(v.n * k)} · {pct(v.pct * k)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Os comentários: bilhetes do mesmo papel, sem o nome de quem escreveu. */}
      {f >= p.comentarios && saiTudo < 1 && COMENTARIOS.slice(0, 6).map((c, i) => {
        const e = mola(f, p.comentarios + ms(250 + i * 260));
        if (e <= 0.001) return null;
        const col = i % 3, lin = Math.floor(i / 3);
        const x = 330 + col * 630, y = 470 + lin * 230;
        const giro = [-2.2, 1.6, -1.2, 2.4, -1.8, 1.1][i];
        const boia = Math.sin((f - p.comentarios) / 60 * 1.4 + i) * 5;
        return (
          <div key={i} className="pq-caf" style={{
            position: 'absolute', left: x - 290, top: y - 100 + boia, width: 580, padding: '24px 28px', gap: 12,
            transform: `rotate(${giro}deg) scale(${0.7 + 0.3 * e})`, opacity: Math.min(1, e * 1.6) * (1 - saiTudo),
          }}>
            <p style={{ font: '800 30px Nunito, sans-serif', lineHeight: 1.25, margin: 0 }}>“{c.texto}”</p>
            <span style={{ justifySelf: 'start', font: '800 18px Nunito, sans-serif', color: '#a0745a', background: 'rgb(217 138 78 / 0.14)', borderRadius: 999, padding: '4px 14px' }}>{c.setor}</span>
          </div>
        );
      })}

      {f >= p.obrigado && (
        <div style={{ position: 'absolute', left: 960, top: A / 2, transform: `translate(-50%, -50%) scale(${2.4 * (0.92 + 0.08 * entraObg)})`, opacity: Math.min(1, entraObg * 1.5) * (1 - saiObg) }}>
          <div className="pq-caf pq-fim" style={{ width: 340 }}>
            <CanecaCoracao t={t} />
            <div className="pq-oi">Obrigado por cada resposta!</div>
            <div className="pq-sub" style={{ maxWidth: '34ch' }}>Lemos os {PESQUISA.comentarios} comentários, um por um.</div>
            <div className="pq-assin">com carinho, time do Gestão</div>
          </div>
        </div>
      )}
    </>
  );
};

// ── 2. O player ─────────────────────────────────────────────────────────────

// A janela INTEIRA do Som ambiente (Cleber, 28/10): o «Tocando agora», as
// abas, os gêneros e a lista de músicas, como no popover do fone
// (`PainelSomAmbiente.tsx`, 300 px). Aberta no Halloween (a trilha do vídeo
// até aqui), a lista rola até «Mantém o Pique», o clique toca — e uns
// segundos depois a janela encolhe e vira a lápide do `PlayerSeFoi`.

// O vídeo mostra o player de outubro: a faixa do Halloween saiu do player com o
// tema (03/11/2026) e volta só aqui.
const FAIXAS = {
  ...EMBUTIDAS,
  halloween: {
    nome: 'Halloween', descricao: 'Tema de John Carpenter', capa: '/sounds/capas/halloween.jpg',
    // O lucide do vídeo traz a própria cópia dos tipos do React.
    Icone: Ghost as unknown as InfoFaixa['Icone'],
    cor: { fundo: 'hsl(30 6% 11%)', destaque: 'hsl(28 92% 56%)' },
  },
} satisfies Record<string, InfoFaixa>;
type IdFaixa = keyof typeof FAIXAS;
const capaDe = (id: IdFaixa) => staticFile(`natal/player/capas/${(FAIXAS[id].capa ?? '').split('/').pop()}`);

const LISTA_MUSICAS: { genero: string; ids: IdFaixa[] }[] = [
  { genero: 'Funk', ids: ['trezentosno7', 'mdt', 'postounodaily', 'novinhamidia'] },
  { genero: 'Rap e trap', ids: ['donodaverdade', 'clickbait', 'walkemdown', 'mantemopique'] },
  { genero: 'Sertanejo', ids: ['pos', 'cowboy', 'temporaldeamor', 'umdegrau', 'cetadoido'] },
  { genero: 'Pop', ids: ['chicago', 'theydontcare'] },
];
const ANTES: IdFaixa = 'halloween';
const ESCOLHIDA: IdFaixa = 'mantemopique';

/** Medidas da janela (px do app; a janela vai ampliada `ESCALA_PLAYER` vezes). */
const ESCALA_PLAYER = 1.1;
const PAINEL_L = 300;
const PAINEL_A = 690;
const LAPIDE_L = 256;
const LAPIDE_A = 214;
const ALTURA_LISTA = 294;
/** O topo da linha de «Mantém o Pique» dentro da lista, e quanto a lista rola para deixá-la no meio. */
const LINHA_ESCOLHIDA = 19 + 4 * 54 + 27 + 3 * 54;
const ROLAGEM = LINHA_ESCOLHIDA - (ALTURA_LISTA - 52) / 2;
const CENTRO_PLAYER = { x: 960, y: 530 };
/** Onde o clique cai: em cima do nome de «Mantém o Pique», já com a lista rolada. */
const ALVO_LINHA = {
  x: CENTRO_PLAYER.x + (170 - PAINEL_L / 2) * ESCALA_PLAYER,
  y: CENTRO_PLAYER.y + (336 + LINHA_ESCOLHIDA - ROLAGEM + 26 - PAINEL_A / 2) * ESCALA_PLAYER,
};

const Eq: React.FC<{ t: number; className?: string }> = ({ t, className = 'shrink-0 text-[color:var(--som-destaque)]' }) => (
  <span className={`som-eq ${className}`} aria-hidden>
    {[1.1, 0.8, 1.3].map((d, i) => (
      <span key={i} style={{ transform: `scaleY(${0.3 + 0.7 * Math.abs(Math.sin(((t + i * 0.3) / d) * Math.PI))})` }} />
    ))}
  </span>
);

const Heroi: React.FC<{ id: IdFaixa; tocando: boolean; tocou: number; t: number; apertado: boolean }> = ({ id, tocando, tocou, t, apertado }) => {
  const info = FAIXAS[id];
  const terror = id === ANTES;
  return (
    <section aria-label="Tocando agora" className="som-cores som-heroi relative shrink-0 px-4 pb-4 pt-3.5" style={estiloDaFaixa(info) as React.CSSProperties}>
      <Img src={capaDe(id)} alt="" aria-hidden className="som-heroi-aura" />
      <p className="som-heroi-fraco text-[10px] font-semibold uppercase tracking-[0.16em]">{terror ? 'Tema de terror' : 'Música'}</p>
      <div className="mt-2.5 flex items-center gap-3.5">
        <Img src={capaDe(id)} alt="" className="som-capa-grande h-[72px] w-[72px] rounded-lg object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-snug tracking-[-0.01em]">{info.nome}</p>
          <p className="som-heroi-suave truncate text-[12.5px] leading-snug">{info.descricao}</p>
          <p className="som-heroi-fraco mt-1.5 flex items-center gap-1.5 truncate text-[11px]">
            {tocando && <Eq t={t} />}
            <span className="truncate">{tocando ? 'Tocando agora' : 'Aperte o play para começar'}</span>
          </p>
        </div>
      </div>
      <div className="som-heroi-fraco mt-2.5 flex items-center gap-2 text-[10.5px] tabular-nums">
        <span>{`0:${String(Math.floor(tocou)).padStart(2, '0')}`}</span>
        <div className="relative h-1 flex-1 rounded-full bg-white/20">
          <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${(tocou / 192) * 100}%` }} />
        </div>
        <span>{terror ? '2:25' : '3:12'}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-[36px_1fr_36px] items-center">
        <span className="som-heroi-botao h-9 w-9"><Repeat className="h-4 w-4" /></span>
        <div className="flex items-center justify-center gap-3">
          <span className="som-heroi-botao h-10 w-10"><SkipBack className="h-[18px] w-[18px] fill-current" /></span>
          <span className="som-play h-12 w-12" style={{ transform: apertado ? 'scale(.96)' : undefined }}>
            {tocando ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 translate-x-px fill-current" />}
          </span>
          <span className="som-heroi-botao h-10 w-10"><SkipForward className="h-[18px] w-[18px] fill-current" /></span>
        </div>
        <span aria-hidden />
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <span className="som-heroi-botao h-7 w-7"><Volume2 className="h-4 w-4" /></span>
        <div className="relative h-1 flex-1 rounded-full bg-white/20"><div className="absolute inset-y-0 left-0 w-[60%] rounded-full bg-white" /></div>
        <span className="som-heroi-fraco w-8 text-right text-[11px] tabular-nums">60%</span>
      </div>
    </section>
  );
};

/** As abas, os gêneros e a lista (`SeletorFaixas`), na aba «Músicas». */
const Seletor: React.FC<{ rolagem: number; escolhida: IdFaixa; tocando: boolean; t: number; sobre: IdFaixa | null }> = ({ rolagem, escolhida, tocando, t, sobre }) => (
  <div className="flex min-h-0 flex-col px-3 pb-2 pt-3">
    <div className="flex shrink-0 gap-1 rounded-lg bg-muted p-1">
      {[['Temas', Ghost, 5], ['Músicas', Music, 15]].map(([rotulo, Icone, n], i) => {
        const I = Icone as typeof Ghost;
        return (
          <span key={i} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium ${i === 1 ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
            <I className="h-3.5 w-3.5" />{rotulo as string}<span className="tabular-nums opacity-60">{n as number}</span>
            {i === 0 && escolhida === ANTES && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
          </span>
        );
      })}
    </div>
    <div className="mt-2 flex shrink-0 gap-1 overflow-hidden pb-0.5">
      {[['Todos', 15], ['Funk', 4], ['Rap e trap', 4], ['Sertanejo', 5], ['Pop', 2]].map(([g, n], i) => (
        <span key={i} className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${i === 0 ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground'}`}>
          {g}<span className="tabular-nums opacity-60">{n}</span>
        </span>
      ))}
    </div>
    <div className="som-lista relative mt-2 overflow-hidden" style={{ height: ALTURA_LISTA }}>
      <div className="space-y-0.5" style={{ transform: `translateY(${-rolagem}px)` }}>
        {LISTA_MUSICAS.map((g, gi) => (
          <div key={g.genero} className="space-y-0.5">
            <p className={`px-1.5 pb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground ${gi === 0 ? 'pt-0.5' : 'pt-2.5'}`}>{g.genero}</p>
            {g.ids.map(id => {
              const info = FAIXAS[id];
              const escolhidaAqui = id === escolhida;
              return (
                <div key={id} className={`som-cores flex items-center gap-1 rounded-lg pr-1 ${escolhidaAqui ? 'som-linha-escolhida' : sobre === id ? 'bg-muted/70' : ''}`} style={estiloDaFaixa(info) as React.CSSProperties}>
                  <span className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1.5 text-left">
                    <Img src={capaDe(id)} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="som-linha-nome block truncate text-[13px] font-medium leading-tight">{info.nome}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{info.descricao}</span>
                    </span>
                    {escolhidaAqui && tocando && <Eq t={t} className="som-tinta mr-1.5 shrink-0" />}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  </div>
);

const CenaPlayer: React.FC<{ p: RoteiroMontagem['player'] }> = ({ p }) => {
  const f = useCurrentFrame();
  if (f < p.entra || f > p.sai + ms(500)) return null;
  const t = (f - p.entra) / 60;
  const escolhida = f >= p.clique ? ESCOLHIDA : ANTES;
  const tocando = f >= p.clique && f < p.morre;
  const tocou = Math.max(0, Math.min(f, p.morre) - p.clique) / 60;
  const rolagem = ROLAGEM * entre(f, p.rola[0], p.rola[1], 0, 1, SUAVE_IDA_VOLTA);
  const sobre = f >= p.clique - ms(350) && f < p.clique ? ESCOLHIDA : null;

  // Abre como o popover do fone: de cima, crescendo.
  const entra = mola(f, p.entra);
  // Morre: treme, e a janela encolhe até o tamanho da lápide, escurecendo.
  const treme = f >= p.morre && f < p.morre + ms(300) ? Math.sin((f - p.morre) * 2.4) * 6 : 0;
  const m = entre(f, p.morre + ms(250), p.lapide, 0, 1, SUAVE_IDA_VOLTA);
  const largura = PAINEL_L + (LAPIDE_L - PAINEL_L) * m;
  const altura = PAINEL_A + (LAPIDE_A - PAINEL_A) * m;
  const escala = ESCALA_PLAYER + (2 - ESCALA_PLAYER) * m;
  // O conteúdo fica à vista enquanto a janela encolhe (ela vai cortando), e só some no fim.
  const dura = p.lapide - p.morre - ms(250);
  const painelSome = entre(f, p.morre + ms(250) + dura * 0.4, p.morre + ms(250) + dura * 0.85, 0, 1);
  const lapideAparece = entre(f, p.lapide - ms(250), p.lapide + ms(150), 0, 1);
  const cinza = entre(f, p.morre, p.morre + ms(400), 0, 1);
  const sai = entre(f, p.sai, p.sai + ms(400), 0, 1, ACELERA);
  const mistura = (a: number[], b: number[]) => a.map((v, i) => Math.round(v + (b[i] - v) * m));
  const [r, g, b] = mistura([255, 255, 255], [9, 9, 11]);
  const [br, bg, bb] = mistura([226, 232, 240], [96, 52, 24]);

  return (
    <div style={{
      position: 'absolute', left: CENTRO_PLAYER.x + treme, top: CENTRO_PLAYER.y, width: largura, height: altura,
      transform: `translate(-50%, -50%) translateY(${(1 - entra) * -40}px) scale(${escala * (0.92 + 0.08 * entra)})`, transformOrigin: '50% 50%',
      opacity: Math.min(1, entra * 1.5) * (1 - sai),
      borderRadius: 6 + 2 * m, overflow: 'hidden', border: `1px solid rgb(${br} ${bg} ${bb})`, background: `rgb(${r} ${g} ${b})`,
      boxShadow: '0 30px 80px rgba(0,0,0,.5)',
    }}>
      {painelSome < 1 && (
        <div className="bg-popover text-popover-foreground" style={{ position: 'absolute', left: (largura - PAINEL_L) / 2, top: (altura - PAINEL_A) / 2, width: PAINEL_L, height: PAINEL_A, opacity: 1 - painelSome, filter: cinza > 0 ? `grayscale(${cinza})` : undefined }}>
          <Heroi id={escolhida} tocando={tocando} tocou={tocou} t={t} apertado={f >= p.clique && f < p.clique + ms(140)} />
          <Seletor rolagem={rolagem} escolhida={escolhida} tocando={tocando} t={t} sobre={sobre} />
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-2.5">
            <span className="min-w-0">
              <span className="block text-[13px] font-medium leading-tight">Tocar ao entrar no sistema</span>
              <span className="block truncate text-[11px] text-muted-foreground">Com a última música e volume escolhidos</span>
            </span>
            <span className="inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-input p-0.5"><span className="h-4 w-4 rounded-full bg-background shadow" /></span>
          </div>
        </div>
      )}
      {/* A lápide do `PlayerSeFoi`, que o fone abria no lugar do player. */}
      {lapideAparece > 0 && (
        <div className="p-4 text-center text-zinc-100" style={{ position: 'absolute', left: (largura - LAPIDE_L) / 2, top: (altura - LAPIDE_A) / 2, width: LAPIDE_L, opacity: lapideAparece, transform: `translateY(${(1 - lapideAparece) * 10}px)` }}>
          <svg viewBox="0 0 120 110" className="mx-auto h-28 w-32" aria-hidden>
            <circle cx="98" cy="18" r="9" fill="#fde68a" opacity="0.85" />
            <path d="M30 96 V42 a30 30 0 0 1 60 0 V96 Z" fill="#52525b" stroke="#27272a" strokeWidth="3" />
            <path d="M37 92 V44 a23 23 0 0 1 46 0 V92" fill="none" stroke="#71717a" strokeWidth="1.5" opacity="0.6" />
            <text x="60" y="62" textAnchor="middle" fontSize="20" fontWeight="800" fill="#e4e4e7" fontFamily="Georgia, serif">RIP</text>
            <text x="60" y="78" textAnchor="middle" fontSize="7" fill="#a1a1aa" fontFamily="Georgia, serif">PLAYER</text>
            <path d="M72 30 l-5 8 l4 4 l-6 9" fill="none" stroke="#27272a" strokeWidth="1.5" />
            <path d="M8 96 Q60 88 112 96 V104 H8 Z" fill="#3f3f46" />
            <ellipse cx="98" cy="94" rx="9" ry="7" fill="#f97316" />
            <path d="M98 87 v-3" stroke="#65a30d" strokeWidth="2" />
            <path d="M94 93 l2 -2 l2 2 M100 93 l2 -2 l2 2 M94 97 q4 3 8 0" stroke="#431407" strokeWidth="1.2" fill="none" />
          </svg>
          <p className="mt-2 text-sm font-semibold text-orange-400">Infelizmente o player se foi…</p>
          <p className="mt-1 text-xs text-zinc-400">Descanse em paz. A música não toca mais por aqui.</p>
        </div>
      )}
    </div>
  );
};

// ── 3. A Corrida das Almas ──────────────────────────────────────────────────

/** A gravação da corrida (`scripts/gravar-corrida.mjs`), lida uma vez. */
function useGravacao() {
  const [rec, setRec] = useState<Gravacao | null>(null);
  const [espera] = useState(() => delayRender('a gravação da corrida'));
  useEffect(() => {
    fetch(staticFile('natal/corrida/gravacao.bin'))
      .then(r => r.arrayBuffer())
      .then(b => setRec(desempacotarGravacao(new Uint8Array(b))))
      .catch(e => cancelRender(e));
  }, []);
  useEffect(() => { if (rec) continueRender(espera); }, [rec, espera]);
  return rec;
}

const VENCEDORES = CORRIDAS.filter(c => c.tipo === 'bichinhos').map(c => c.vencedor);

const CenaCorrida: React.FC<{ c: RoteiroMontagem['corrida']; rec: Gravacao | null }> = ({ c, rec }) => {
  const f = useCurrentFrame();
  if (f < c.entra || f > c.sai + ms(500)) return null;
  const entra = entre(f, c.entra, c.entra + ms(500), 0, 1, SUAVE);
  const sai = entre(f, c.sai, c.sai + ms(400), 0, 1, ACELERA);
  const corteV = (c.corte - c.entra) / 60;
  // O relógio do motor: a largada um pouco acelerada, um corte, e a chegada.
  // Tudo que o motor desenha é conta de «agora − iniciaEm» (`linhaDoTempo`).
  const relogio = (v: number) => infoCorrida.durShow + (v < corteV ? 2.4 + v * 1.4 : infoCorrida.tVenc - 2.2 + (v - corteV) * 2);
  return (
    <>
      <div style={{ position: 'absolute', left: 150, top: 140, width: 780, height: 760, opacity: entra * (1 - sai), transform: `translateX(${(1 - entra) * -80 - sai * 60}px)` }}>
        <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#070a16] text-[#e8eefc] shadow-[0_18px_50px_rgba(0,0,0,.55)]">
          <div className="flex h-12 shrink-0 items-center gap-2.5 bg-black/70 pl-4 pr-3 text-[16px] font-semibold tracking-wide">
            <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[#ff4d5e]" style={{ opacity: 0.45 + 0.55 * Math.abs(Math.cos(((f - c.entra) / 60) * Math.PI)) }} aria-hidden="true" />
            <span className="min-w-0 truncate uppercase">Corrida das Almas · ao vivo</span>
          </div>
          <div className="relative min-h-0 flex-1 bg-[#070a16]">
            {rec && (
              <PalcoVirtual<Motor>
                inicio={c.entra} fim={c.sai + ms(400)} semente={2026}
                criar={host => {
                  const tela = () => {
                    const cv = document.createElement('canvas');
                    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
                    host.appendChild(cv);
                    return cv;
                  };
                  const pista = tela(), cerimonia = tela();
                  const m = criarMotor({ pista, cerimonia, sons: { lobby: '', vitoria: '' } });
                  m.setRelogio(() => relogio((performance.now() - BASE_PERF) / 1000));
                  m.setPessoas(rec.nomes.map((nome, i) => ({ id: rec.ids[i], nome, setor: null, foto: null, corre: true, assiste: true, est: rec.est[i], entrouEm: 0, escolhidaEm: 0 })));
                  m.setCorrida({ id: 1, premio: null, estado: 'correndo', abertaEm: 0, iniciaEm: 0 });
                  m.setGravacao(rec, { faixa: infoCorrida.faixa, parada: infoCorrida.parada });
                  m.fontesProntas();
                  return m;
                }}
                comandos={[]}
              />
            )}
          </div>
        </div>
      </div>

      {/* Ao lado: quem venceu cada corrida de bichinhos em outubro. */}
      <div style={{ position: 'absolute', left: 1010, top: 200, width: 800, opacity: 1 - sai }}>
        <div style={{ opacity: entre(f, c.entra + ms(200), c.entra + ms(700), 0, 1), transform: `translateY(${(1 - entre(f, c.entra + ms(200), c.entra + ms(700), 0, 1)) * 20}px)` }}>
          <p style={{ font: '800 22px Nunito, sans-serif', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#ffd27a' }}>A Corrida das Almas</p>
          <p style={{ font: '900 62px Nunito, sans-serif', color: '#fff', lineHeight: 1.05, marginTop: 8 }}>{VENCEDORES.length} corridas de bichinhos</p>
          <p style={{ font: '700 26px Nunito, sans-serif', color: 'rgba(255,255,255,.7)', marginTop: 10 }}>Quem levou cada uma:</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px', marginTop: 30 }}>
          {VENCEDORES.map((nome, i) => {
            const e = mola(f, c.entra + ms(900 + i * 170));
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: Math.min(1, e * 1.5), transform: `translateX(${(1 - e) * 40}px)` }}>
                <span style={{ width: 40, height: 40, flex: 'none', borderRadius: 999, display: 'grid', placeItems: 'center', background: 'linear-gradient(145deg,#ffd84d,#ff9f1a)', color: '#1b1405', font: '900 18px Nunito, sans-serif' }}>{i + 1}</span>
                <span style={{ font: '800 27px Nunito, sans-serif', ...NOME, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nome}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

// ── 4. A Corrida de Cavalos e a Guerra na Corrida ───────────────────────────

// Uma corrida de verdade da página `corrida-cavalos.html`, com a Guerra na
// Corrida ligada, gravada quadro a quadro (`scripts/gravar-cavalos.mjs`) em
// três trechos: a largada, a guerra estourando no meio da prova, e a janela
// estourando com o Cavalo da Guerra entrando na página (Cleber, 28/10). Como
// na corrida dos bichinhos: a corrida de um lado, o ranking do outro. No fim
// cai uma bomba no chefe, e a explosão cobre a tela — e dela entra o mural.

/** A janela da corrida, na montagem (à esquerda) e onde ela estava na gravação (tela cheia). */
const JANELA_PEQUENA = { x: 96, y: 236, largura: 1040, altura: 634 };
const JANELA_CHEIA = { x: infoCavalos.janela.x, y: infoCavalos.janela.y, largura: infoCavalos.janela.largura, altura: infoCavalos.janela.altura };
/** Onde a bomba cai: no lombo do Cavalo da Guerra, 4 s depois de a janela estourar (medido na gravação). */
const ALVO_BOMBA = { x: 880, y: 520 };
/** O fogo da explosão (do branco do miolo à fumaça das bordas), desenhado grosso como a pista. */
const FOGO = ['#fff6d2', '#ffd45c', '#ff9a2e', '#e8521c', '#5a2a1a'];
const GRAO = 6;

const BOLAS_DE_FOGO = (() => {
  const r = sorteio(4040);
  const n = 260;
  return Array.from({ length: n }, (_, i) => {
    const k = i / n;
    const ang = r() * Math.PI * 2;
    const vel = 260 + r() * 900 * (0.4 + k);
    return { nasce: k * 0.9, ang, vel, r0: 20 + r() * 40, cresce: 120 + r() * 260, desce: r() * 0.6 };
  });
})();

/** A explosão: bolas de fogo saindo do ponto da bomba para todo lado, até cobrir a tela. */
const Explosao: React.FC<{ de: number; x: number; y: number }> = ({ de, x, y }) => {
  const f = useCurrentFrame();
  const tela = useRef<HTMLCanvasElement>(null);
  const t = (f - de) / 60;
  useLayoutEffect(() => {
    const c = tela.current?.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, L / GRAO, A / GRAO);
    const bola = (bx: number, by: number, r: number, cor: string) => {
      c.fillStyle = cor;
      c.beginPath();
      c.arc(Math.round(bx / GRAO), Math.round(by / GRAO), Math.max(1, Math.round(r / GRAO)), 0, Math.PI * 2);
      c.fill();
    };
    const vivas = BOLAS_DE_FOGO.filter(b => t > b.nasce).map(b => {
      const idade = t - b.nasce;
      // Sai rápido e freia (o empurrão da explosão), e a fumaça sobe um pouco.
      const d = b.vel * (1 - Math.exp(-idade * 2.2)) / 2.2;
      return { x: x + Math.cos(b.ang) * d, y: y + Math.sin(b.ang) * d * 0.8 - 40 * idade * b.desce, r: b.r0 + b.cresce * idade, idade };
    });
    // A fumaça por fora, o fogo no meio, o miolo branco — esfriando com a idade de cada bola.
    for (const v of vivas) bola(v.x, v.y + v.r * 0.12, v.r, FOGO[Math.min(4, 2 + Math.floor(v.idade * 2.5))]);
    for (const v of vivas) bola(v.x, v.y, v.r * 0.8, FOGO[Math.min(3, 1 + Math.floor(v.idade * 2.2))]);
    for (const v of vivas) if (v.idade < 0.7) bola(v.x - v.r * 0.15, v.y - v.r * 0.2, v.r * 0.42, FOGO[v.idade < 0.3 ? 0 : 1]);
  }, [t, x, y]);
  if (t <= 0) return null;
  const clarao = t < 0.12 ? 1 - t / 0.12 : 0;
  const cheia = entre(f, de + s(1.1), de + s(1.5), 0, 1);
  return (
    <>
      <canvas ref={tela} width={L / GRAO} height={A / GRAO} style={{ position: 'absolute', inset: 0, width: L, height: A, imageRendering: 'pixelated' }} />
      {cheia > 0 && <AbsoluteFill style={{ background: FOGO[2], opacity: cheia }} />}
      {clarao > 0 && <AbsoluteFill style={{ background: '#fff8e0', opacity: clarao }} />}
    </>
  );
};

/** A bomba caindo no chefe (pixelada, com o pavio faiscando). */
const Bomba: React.FC<{ de: number; ate: number }> = ({ de, ate }) => {
  const f = useCurrentFrame();
  if (f < de || f >= ate) return null;
  const k = (f - de) / (ate - de);
  const y = -120 + (ALVO_BOMBA.y + 120) * k * k;
  const x = ALVO_BOMBA.x + 140 * (1 - k);
  const faisca = Math.floor(f / 3) % 2;
  return (
    <svg width={84} height={96} viewBox="0 0 14 16" shapeRendering="crispEdges" style={{ position: 'absolute', left: x - 42, top: y - 60, transform: `rotate(${-20 + 40 * k}deg)`, filter: 'drop-shadow(0 6px 6px rgba(0,0,0,.45))' }}>
      <rect x="6" y="1" width="1" height="3" fill="#8a6a3a" />
      <rect x={faisca ? 5 : 6} y="0" width="2" height="1" fill="#ffd45c" />
      <rect x="7" y={faisca ? 0 : 1} width="1" height="1" fill="#ff7a1a" />
      <rect x="5" y="4" width="4" height="2" fill="#3a3f48" />
      <rect x="3" y="6" width="8" height="1" fill="#1c1f26" />
      <rect x="2" y="7" width="10" height="6" fill="#1c1f26" />
      <rect x="3" y="13" width="8" height="1" fill="#1c1f26" />
      <rect x="4" y="14" width="6" height="1" fill="#1c1f26" />
      <rect x="4" y="8" width="2" height="2" fill="#5b6270" />
      <rect x="4" y="8" width="1" height="1" fill="#9aa3b0" />
    </svg>
  );
};

const VENCEDORES_CAVALOS = CORRIDAS.filter(c => c.tipo === 'cavalos').map(c => c.vencedor);

/** O ranking ao lado da corrida: quem levou cada corrida; na guerra, quem mais bateu no chefe. */
const RankingCavalos: React.FC<{ k: RoteiroMontagem['cavalos'] }> = ({ k }) => {
  const f = useCurrentFrame();
  const sai = entre(f, k.telaCheia, k.telaCheia + ms(400), 0, 1, ACELERA);
  if (sai >= 1) return null;
  const guerra = f >= k.comecaGuerra;
  const troca = guerra ? entre(f, k.comecaGuerra, k.comecaGuerra + ms(500), 0, 1) : entre(f, k.entra + ms(200), k.entra + ms(700), 0, 1);
  const de = guerra ? k.comecaGuerra : k.entra;
  const lista = guerra ? CAVALO_DA_GUERRA.map(p => p.nome) : VENCEDORES_CAVALOS;
  const cor = guerra ? '#ff7a4a' : '#e2c398';
  const medalha = ['linear-gradient(145deg,#ffe27a,#f4b400)', 'linear-gradient(145deg,#eef1f5,#aab2bd)', 'linear-gradient(145deg,#f6b07a,#c46a2c)'];
  return (
    <div style={{ position: 'absolute', left: 1196, top: 250, width: 660, opacity: troca * (1 - sai), transform: `translateY(${(1 - troca) * 20}px)` }}>
      <p style={{ font: '800 22px Nunito, sans-serif', letterSpacing: '0.16em', textTransform: 'uppercase', color: cor }}>{guerra ? 'A Guerra na Corrida' : 'A Corrida de Cavalos'}</p>
      <p style={{ font: '900 58px Nunito, sans-serif', color: '#fff', lineHeight: 1.05, marginTop: 8 }}>{guerra ? 'O Cavalo da Guerra' : `${VENCEDORES_CAVALOS.length} corridas de cavalos`}</p>
      <p style={{ font: '700 26px Nunito, sans-serif', color: 'rgba(255,255,255,.7)', marginTop: 10 }}>{guerra ? 'Quem mais bateu nele:' : 'Quem levou cada uma:'}</p>
      <div style={{ display: 'grid', gap: 14, marginTop: 28 }}>
        {lista.map((nome, i) => {
          const e = mola(f, de + ms(600 + i * 200));
          return (
            <div key={`${guerra}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: Math.min(1, e * 1.5), transform: `translateX(${(1 - e) * 40}px)` }}>
              <span style={{ width: 46, height: 46, flex: 'none', borderRadius: 999, display: 'grid', placeItems: 'center', background: guerra ? (medalha[i] ?? 'rgba(255,255,255,.14)') : 'linear-gradient(145deg,#ffd84d,#ff9f1a)', color: guerra && i > 2 ? '#fff' : '#1b1405', font: '900 20px Nunito, sans-serif' }}>{i + 1}</span>
              <span style={{ font: '800 30px Nunito, sans-serif', ...NOME }}>{nome}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── A janela quebrando (08/11/2026) ─────────────────────────────────────────
//
// Antes, no quadro em que o Cavalo da Guerra entrava, a janela sumia e a
// gravação do chefe aparecia já com os cacos no ar — sem rachar, sem estouro,
// quase sem som. Agora a janela racha em três estalos (tremendo cada vez
// mais), e no estouro os cacos dela — pedaços da própria imagem da corrida,
// congelada — voam na direção da tela, com clarão e tranco, enquanto a
// gravação do chefe entra por baixo.

/** Os estalos antes do estouro (quanto antes de `k.chefe`). */
const ESTALOS = [ms(560), ms(360), ms(170)] as const;
/** Onde a janela leva o golpe (no meio, um pouco para baixo: onde o chefe surge). */
const IMPACTO = { x: JANELA_CHEIA.largura * 0.52, y: JANELA_CHEIA.altura * 0.56 };

/** As rachaduras: raios tortos saindo do impacto; cada estalo abre um terço deles. */
const RAIOS = (() => {
  const r = sorteio(1188);
  const n = 13;
  return Array.from({ length: n }, (_, i) => {
    const ang0 = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.35;
    const compr = (0.45 + r() * 0.7) * Math.max(JANELA_CHEIA.largura, JANELA_CHEIA.altura) * 0.62;
    const pts: [number, number][] = [[IMPACTO.x, IMPACTO.y]];
    const passos = 6;
    for (let k = 1; k <= passos; k++) {
      const d = (compr * k) / passos;
      const lado = (r() - 0.5) * 36;
      pts.push([IMPACTO.x + Math.cos(ang0) * d - Math.sin(ang0) * lado, IMPACTO.y + Math.sin(ang0) * d + Math.cos(ang0) * lado]);
    }
    return { pts, estalo: i % 3 };
  });
})();
/** A teia em volta do impacto: anéis ligando os raios. */
const ANEIS = [70, 150, 260].map(raio => RAIOS.map(rr => {
  const [x1, y1] = rr.pts[rr.pts.length - 1];
  const dx = x1 - IMPACTO.x, dy = y1 - IMPACTO.y, d = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, raio / d);
  return [IMPACTO.x + dx * k, IMPACTO.y + dy * k] as [number, number];
}).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ' Z');

type Caco = { pts: [number, number][]; cx: number; cy: number; vx: number; vy: number; vr: number; atraso: number };
/** Os cacos: a janela cortada em triângulos tortos, cada um com o seu voo (para longe do impacto). */
const CACOS: Caco[] = (() => {
  const r = sorteio(2424);
  const W = JANELA_CHEIA.largura, H = JANELA_CHEIA.altura;
  const C = 7, R = 5;
  const p: [number, number][][] = [];
  for (let j = 0; j <= R; j++) {
    p.push([]);
    for (let i = 0; i <= C; i++) {
      const bordaX = i === 0 || i === C, bordaY = j === 0 || j === R;
      p[j].push([(i / C) * W + (bordaX ? 0 : (r() - 0.5) * (W / C) * 0.6), (j / R) * H + (bordaY ? 0 : (r() - 0.5) * (H / R) * 0.6)]);
    }
  }
  const tris: Caco[] = [];
  for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) {
    const a = p[j][i], b = p[j][i + 1], c = p[j + 1][i + 1], d = p[j + 1][i];
    const pares: [number, number][][] = r() < 0.5 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
    for (const t of pares) {
      const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
      const dx = cx - IMPACTO.x, dy = cy - IMPACTO.y, dist = Math.hypot(dx, dy) || 1;
      const vel = 760 + r() * 760 + dist * 0.9;
      tris.push({ pts: t, cx, cy, vx: (dx / dist) * vel, vy: (dy / dist) * vel - 160 - r() * 220, vr: (r() - 0.5) * 540, atraso: Math.round((dist / W) * 5) });
    }
  }
  return tris;
})();

/** As rachaduras por cima da janela, aparecendo nos três estalos. */
const Rachaduras: React.FC<{ k: RoteiroMontagem['cavalos'] }> = ({ k }) => {
  const f = useCurrentFrame();
  if (f < k.chefe - ESTALOS[0] || f >= k.chefe) return null;
  // O estalo `e` abre os raios do grupo `e` de uma vez (rápido); os seguintes esticam os de antes.
  const quanto = (grupo: number) => {
    let v = 0;
    ESTALOS.forEach((e, i) => { if (i >= grupo) v += entre(f, k.chefe - e, k.chefe - e + ms(70), 0, 1, ACELERA) / (ESTALOS.length - grupo); });
    return Math.min(1, v);
  };
  const aneis = ESTALOS.map(e => entre(f, k.chefe - e, k.chefe - e + ms(60), 0, 1));
  const flash = Math.max(...ESTALOS.map(e => (f >= k.chefe - e ? 1 - entre(f, k.chefe - e, k.chefe - e + ms(140), 0, 1) : 0)));
  return (
    <svg width={JANELA_CHEIA.largura} height={JANELA_CHEIA.altura} viewBox={`0 0 ${JANELA_CHEIA.largura} ${JANELA_CHEIA.altura}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <defs>
        <radialGradient id="cav-impacto"><stop offset="0" stopColor="#fff" stopOpacity="0.9" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx={IMPACTO.x} cy={IMPACTO.y} r={60 + 90 * flash} fill="url(#cav-impacto)" opacity={0.35 + 0.65 * flash} />
      {RAIOS.map((rr, i) => {
        const v = quanto(rr.estalo);
        if (v <= 0) return null;
        const d = rr.pts.map(([x, y], n) => `${n ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
        return (
          <g key={i}>
            <path d={d} pathLength={1} stroke="rgba(0,0,0,.55)" strokeWidth={5} fill="none" strokeDasharray="1 1" strokeDashoffset={1 - v} strokeLinejoin="round" />
            <path d={d} pathLength={1} stroke="rgba(255,255,255,.95)" strokeWidth={2.2} fill="none" strokeDasharray="1 1" strokeDashoffset={1 - v} strokeLinejoin="round" />
          </g>
        );
      })}
      {ANEIS.map((d, i) => aneis[i] > 0 && (
        <path key={`a${i}`} d={d} stroke="rgba(255,255,255,.8)" strokeWidth={1.6} fill="none" opacity={aneis[i]} />
      ))}
    </svg>
  );
};

/** Os cacos da janela voando no estouro (a imagem da corrida congelada no último quadro). */
const Cacos: React.FC<{ k: RoteiroMontagem['cavalos'] }> = ({ k }) => {
  const f = useCurrentFrame();
  const DURA = ms(680);
  if (f < k.chefe || f >= k.chefe + DURA) return null;
  const J = JANELA_CHEIA;
  const op = 1 - entre(f, k.chefe + ms(220), k.chefe + DURA, 0, 1);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {CACOS.map((c, i) => {
        const t = Math.max(0, f - k.chefe - c.atraso) / 60;
        const dx = c.vx * t, dy = c.vy * t + 0.5 * 1500 * t * t;
        const esc = 1 + 1.5 * t;
        const poli = c.pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(', ');
        return (
          <div key={i} style={{ position: 'absolute', left: J.x, top: J.y, width: J.largura, height: J.altura, opacity: op, filter: 'drop-shadow(0 0 1.5px rgba(255,255,255,.95)) drop-shadow(0 8px 10px rgba(0,0,0,.45))', transformOrigin: `${c.cx.toFixed(1)}px ${c.cy.toFixed(1)}px`, transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${(c.vr * t).toFixed(1)}deg) scale(${esc.toFixed(3)})` }}>
            <div style={{ position: 'absolute', inset: 0, clipPath: `polygon(${poli})` }}>
              <Sequence from={k.guerra} layout="none">
                <Freeze frame={k.chefe - 1 - k.guerra}>
                  <OffthreadVideo src={staticFile('natal/cavalos/cav-guerra.mp4')} startFrom={ms(400)} muted style={{ width: '100%', height: '100%' }} />
                </Freeze>
              </Sequence>
              {/* O brilho do vidro em cada caco */}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(255,255,255,.22), rgba(255,255,255,0) 40%, rgba(255,255,255,.12) 70%, rgba(255,255,255,0))' }} />
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const CenaCavalos: React.FC<{ k: RoteiroMontagem['cavalos'] }> = ({ k }) => {
  const f = useCurrentFrame();
  if (f < k.entra || f > k.mural + ms(800)) return null;
  const entra = entre(f, k.entra, k.entra + ms(500), 0, 1, SUAVE);
  // Antes de estourar, a janela vai para a tela cheia (como na corrida, quando a guerra pega fogo):
  // assim a janela pequena encaixa onde ela estava na gravação do estouro.
  const cresce = entre(f, k.telaCheia, k.chefe, 0, 1, SUAVE_IDA_VOLTA);
  // A janela treme a cada estalo, cada vez mais forte; no estouro, a tela inteira dá o tranco.
  const forca = ESTALOS.reduce((v, e, i) => v + (f >= k.chefe - e ? (1 - entre(f, k.chefe - e, k.chefe - e + ms(200), 0, 1)) * (4 + 5 * i) : 0), 0);
  const treme = { x: Math.sin(f * 2.7) * forca, y: Math.cos(f * 3.1) * forca * 0.7 };
  const tranco = f >= k.chefe ? (1 - entre(f, k.chefe, k.chefe + ms(420), 0, 1)) * 16 : 0;
  const chefeEntra = entre(f, k.chefe, k.chefe + ms(180), 0, 1);
  const clarao = f >= k.chefe ? 1 - entre(f, k.chefe, k.chefe + ms(260), 0, 1) : 0;
  const j = {
    x: JANELA_PEQUENA.x + (JANELA_CHEIA.x - JANELA_PEQUENA.x) * cresce,
    y: JANELA_PEQUENA.y + (JANELA_CHEIA.y - JANELA_PEQUENA.y) * cresce,
    largura: JANELA_PEQUENA.largura + (JANELA_CHEIA.largura - JANELA_PEQUENA.largura) * cresce,
    altura: JANELA_PEQUENA.altura + (JANELA_CHEIA.altura - JANELA_PEQUENA.altura) * cresce,
  };
  return (
    <>
      {f < k.chefe && (
        <div style={{ position: 'absolute', left: j.x, top: j.y, width: j.largura, height: j.altura, opacity: entra, transform: `translate(${treme.x.toFixed(1)}px, ${((1 - entra) * 40 + treme.y).toFixed(1)}px)`, borderRadius: 14 + 3 * cresce, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.55)' }}>
          {f < k.guerra ? (
            <Sequence from={k.entra} layout="none">
              <OffthreadVideo src={staticFile('natal/cavalos/cav-largada.mp4')} startFrom={ms(100)} muted style={{ width: '100%', height: '100%' }} />
            </Sequence>
          ) : (
            <Sequence from={k.guerra} layout="none">
              <OffthreadVideo src={staticFile('natal/cavalos/cav-guerra.mp4')} startFrom={ms(400)} muted style={{ width: '100%', height: '100%' }} />
            </Sequence>
          )}
          <Rachaduras k={k} />
        </div>
      )}
      <RankingCavalos k={k} />
      {/* A janela estourando e o chefe na página: a tela inteira, por cima do cenário. */}
      {f >= k.chefe && f < k.cheia && (
        <Sequence from={k.chefe} layout="none">
          <AbsoluteFill style={{ opacity: chefeEntra, transform: `translate(${(Math.sin(f * 2.3) * tranco).toFixed(1)}px, ${(Math.cos(f * 2.9) * tranco * 0.7).toFixed(1)}px) scale(${(1.04 - 0.04 * chefeEntra).toFixed(3)})` }}>
            <OffthreadVideo src={staticFile('natal/cavalos/cav-chefe.webm')} transparent muted style={{ width: '100%', height: '100%' }} />
          </AbsoluteFill>
        </Sequence>
      )}
      <Cacos k={k} />
      {clarao > 0 && <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 56%, #ffffff 0%, #fff4d6 40%, rgba(255,226,170,0) 85%)', opacity: 0.9 * clarao, pointerEvents: 'none' }} />}
      <Bomba de={k.bomba} ate={k.explosao} />
      <Explosao de={k.explosao} x={ALVO_BOMBA.x} y={ALVO_BOMBA.y} />
    </>
  );
};

/**
 * O mural de outubro, gravado da página original por
 * `scripts/gravar-mural.mjs`: só o mural, e só os bichinhos das fotos se
 * mexendo (Cleber, 28/10). Desde 08/11/2026 a gravação é do mural como foi ao
 * ar (main 8030860, hoje em `arquivo-morto/halloween/`), não o da branch
 * `feat/portal-outubro` de 28/10 — as medalhas e o ranking mudaram depois. Ele sai do fogo da explosão, fica, e no fim sobe
 * puxado, mostrando o sistema por baixo.
 */
const MuralDeOutubro: React.FC<{ k: RoteiroMontagem['cavalos']; e: RoteiroMontagem['erika'] }> = ({ k, e }) => {
  const f = useCurrentFrame();
  if (f < k.mural || f > e.clarao + ms(400)) return null;
  const surge = entre(f, k.mural, k.mural + ms(700), 0, 1, SUAVE);
  // No fim, a câmera mergulha no cartão «A Garrafa» (a cena da Erika sai do brilho dele).
  const cam = cameraNoPremio(f, e);
  return (
    <AbsoluteFill style={{ opacity: surge, transform: `scale(${(1.06 - 0.06 * surge) * cam.escala})`, transformOrigin: cam.origem }}>
      <Sequence from={k.mural} layout="none">
        <OffthreadVideo src={staticFile('natal/mural/mural.mp4')} muted style={{ width: '100%', height: '100%' }} />
      </Sequence>
    </AbsoluteFill>
  );
};

/**
 * O embrulho: as duas metades do papel do presente fecham das laterais, a
 * fita cruza a tela e o laço pula no meio (`@/components/Natal/presente/arte`,
 * o mesmo desenho do presente no alto da tela).
 */
const Embrulho: React.FC<{ de: number }> = ({ de }) => {
  const f = useCurrentFrame();
  if (f < de) return null;
  const papel = entre(f, de, de + ms(700), 0, 1, SUAVE_IDA_VOLTA);
  const fitaV = entre(f, de + ms(600), de + ms(950), 0, 1, SUAVE);
  const fitaH = entre(f, de + ms(800), de + ms(1150), 0, 1, SUAVE);
  const laco = mola(f, de + ms(1100), { mass: 0.7, stiffness: 170, damping: 11, overshootClamping: false });
  const FITA = 150;
  const metade = (lado: -1 | 1) => (
    <div style={{
      position: 'absolute', top: 0, bottom: 0, width: L / 2 + 2, [lado < 0 ? 'left' : 'right']: 0,
      transform: `translateX(${lado * (1 - papel) * (L / 2 + 40)}px)`,
      boxShadow: lado < 0 ? 'inset -18px 0 24px -14px rgba(0,0,0,.35)' : 'inset 18px 0 24px -14px rgba(0,0,0,.35)',
      ...estiloDoPapel(92),
    }} />
  );
  return (
    <AbsoluteFill>
      {metade(-1)}
      {metade(1)}
      <div style={{ position: 'absolute', left: L / 2 - FITA / 2, width: FITA, top: (A / 2) * (1 - fitaV), height: A * fitaV, ...estiloDaFita(true) }} />
      <div style={{ position: 'absolute', top: A / 2 - FITA / 2, height: FITA, left: (L / 2) * (1 - fitaH), width: L * fitaH, ...estiloDaFita(false) }} />
      {laco > 0.001 && (
        <Laco largura={560} style={{ position: 'absolute', left: L / 2 - 280, top: A / 2 - 240, transform: `scale(${laco})`, transformOrigin: '50% 50%', filter: 'drop-shadow(0 18px 24px rgba(0,0,0,.35))' }} />
      )}
    </AbsoluteFill>
  );
};

// ── A montagem ──────────────────────────────────────────────────────────────

export const Montagem: React.FC<{ r: RoteiroMontagem }> = ({ r }) => {
  const f = useCurrentFrame();
  const rec = useGravacao();
  if (f < r.inicio || f > r.fim) return null;
  // Um mouse para cada clique: ele aparece, clica, sai de perto e some.
  const naPesquisa = [
    { f: r.pesquisa.entra + ms(500), x: 1500, y: 900 },
    { f: r.pesquisa.clique - ms(80), x: ALVO_CURTINDO.x, y: ALVO_CURTINDO.y, viagemMs: 900 },
    { f: r.pesquisa.clique + ms(450), x: ALVO_CURTINDO.x + 120, y: ALVO_CURTINDO.y + 160, viagemMs: 450 },
  ];
  // No player o mouse desce pela lista junto com a rolagem e clica na música.
  const noPlayer = [
    { f: r.player.rola[0], x: 1420, y: 980 },
    { f: r.player.rola[1], x: ALVO_LINHA.x + 40, y: ALVO_LINHA.y + 90, viagemMs: 1300 },
    { f: r.player.clique - ms(80), x: ALVO_LINHA.x, y: ALVO_LINHA.y, viagemMs: 450 },
    { f: r.player.clique + ms(600), x: ALVO_LINHA.x + 330, y: ALVO_LINHA.y + 120, viagemMs: 600 },
  ];
  const { pesquisa: p, player: pl, corrida: c, cavalos: k } = r;
  // As legendas da montagem: a mesma pílula do sistema, no alto.
  const legendas: Recado[] = [
    { de: p.entra + ms(200), ate: p.resultado - ms(100), olho: 'A pesquisa', texto: 'A gente quis saber: como tá sendo usar o Gestão?', icone: '☕', cor: '#f2a66b' },
    { de: p.resultado + ms(150), ate: p.comentarios - ms(150), texto: '250 votos — e quase todo mundo aprovou.', icone: '📊', cor: '#5cbf73' },
    { de: p.comentarios + ms(100), ate: p.obrigado - ms(250), texto: 'E chegaram recados que a gente guarda com carinho.', icone: '💬', cor: '#f2a66b' },
    { de: pl.entra + ms(150), ate: pl.clique - ms(100), olho: 'O player', texto: 'Teve trilha sonora o mês inteiro: funk, rap, sertanejo e terror.', icone: '🎧', cor: '#facc15' },
    { de: pl.clique + ms(200), ate: pl.morre - ms(100), texto: 'Cada um escolhia a sua e dava o play.', icone: '▶️', cor: '#facc15' },
    { de: pl.lapide - ms(150), ate: pl.sai, texto: 'Foi bom enquanto durou.', icone: '🪦', cor: '#fb923c' },
    { de: c.entra + ms(200), ate: c.corte - ms(100), olho: 'A Corrida das Almas', texto: 'Bichinhos despencando pela pista, e todo mundo torcendo.', icone: '🏁', cor: '#ffd84d' },
    { de: c.corte + ms(150), ate: c.sai, texto: 'E na chegada, câmera lenta pra ver quem levou!', icone: '🏆', cor: '#ffd84d' },
    { de: k.entra + ms(300), ate: k.guerra + ms(600), olho: 'A Corrida de Cavalos', texto: 'E teve corrida de cavalos, com torcida e tudo.', icone: '🐎', cor: '#e2c398' },
    { de: k.comecaGuerra + ms(100), ate: k.comecaGuerra + s(2.9), olho: 'A Guerra na Corrida', texto: 'No meio da corrida… começou a guerra!', icone: '💣', cor: '#ff7a4a' },
    { de: k.comecaGuerra + s(3.1), ate: k.telaCheia - ms(100), texto: 'Explosão, fogo e cavalo caindo por todo lado.', icone: '🔥', cor: '#ff7a4a' },
  ];
  return (
    <AbsoluteFill className="nt-montagem" style={{ overflow: 'hidden' }}>
      <Cenario r={r} />
      <CenaPesquisa p={r.pesquisa} />
      <CenaPlayer p={r.player} />
      <CenaCorrida c={r.corrida} rec={rec} />
      <CenaCavalos k={r.cavalos} />
      <MuralDeOutubro k={r.cavalos} e={r.erika} />
      <ClaraoDoPremio e={r.erika} />
      <CenaErika e={r.erika} ate={r.fim} />
      <Embrulho de={r.cavalos.embrulha} />
      <Seta pontos={naPesquisa} cliques={[r.pesquisa.clique]} tamanho={1.6} />
      <Seta pontos={noPlayer} cliques={[r.player.clique]} tamanho={1.6} />
      <Recados itens={legendas} topo={40} />
    </AbsoluteFill>
  );
};

// ── O som ───────────────────────────────────────────────────────────────────

export const SonsDaMontagem: React.FC<{ r: RoteiroMontagem }> = ({ r }) => {
  const { pesquisa: p, player: pl, corrida: c } = r;
  const pops = [p.entra, p.resultado, ...Array.from({ length: 6 }, (_, i) => p.comentarios + ms(250 + i * 260)), p.obrigado];
  // A música animada de fundo (Cleber, 28/10: na montagem não volta o Halloween).
  // «Chill Day», do LAKEY INSPIRED (escolha do Cleber, 28/10); quando outra
  // música toca por cima (a do player, a da corrida), ela quase some, para a
  // de cima ouvir-se inteira.
  // Medido na mixagem (28/10): 0,26 deixa a «Chill Day» no nível da música de antes.
  const FUNDO = 0.26, BAIXO = 0.03;
  const fundo = (q: number) => {
    const f = q + r.inicio;
    const sob = (a: number, b: number) => Math.min(entre(f, a - ms(250), a, 0, 1), 1 - entre(f, b, b + ms(500), 0, 1));
    const abaixa = Math.max(sob(pl.clique, pl.morre + ms(200)), sob(c.entra, c.sai), sob(r.cavalos.comecaGuerra, r.cavalos.mural), sob(r.erika.clarao, r.fim + s(1)));
    return (FUNDO - (FUNDO - BAIXO) * abaixa) * entre(f, r.inicio, r.inicio + s(1.2), 0, 1) * (1 - entre(f, r.fim - ms(500), r.fim, 0, 1));
  };
  return (
    <>
      <Sequence from={r.inicio} durationInFrames={r.fim - r.inicio}>
        <Audio src={staticFile('natal/montagem/chill-day.mp3')} volume={fundo} />
      </Sequence>
      {pops.map((t, i) => <Sequence key={`pop${i}`} from={t} durationInFrames={s(1)}><Audio src={staticFile('sons/pop.wav')} volume={0.18} /></Sequence>)}
      {[p.clique, pl.clique].map(t => <Sequence key={`c${t}`} from={t} durationInFrames={s(0.6)}><Audio src={staticFile('sons/clique.wav')} volume={0.4} /></Sequence>)}
      {/* Uns segundos de «Mantém o Pique», do player — e o fim seco. */}
      <Sequence from={pl.clique + 3} durationInFrames={pl.morre - pl.clique + ms(250)}>
        <Audio src={staticFile('natal/player/mantem-o-pique.mp3')} startFrom={s(10)} volume={(q) => 0.4 * Math.min(1, q / 8) * (1 - Math.max(0, Math.min(1, (q - (pl.morre - pl.clique - 3)) / ms(250))))} />
      </Sequence>
      <Sequence from={pl.lapide - ms(100)} durationInFrames={s(1.2)}><Audio src={staticFile('natal/caca/baque-forte.wav')} volume={0.4} /></Sequence>
      <Sequence from={pl.sai - ms(100)} durationInFrames={s(1)}><Audio src={staticFile('sons/whoosh.wav')} volume={0.25} /></Sequence>
      {/* A guerra: o violino dela (o arquivo do sistema) e as rajadas; o vidro da janela, o relincho do chefe, a bomba. */}
      <Sequence from={r.cavalos.comecaGuerra} durationInFrames={r.cavalos.explosao - r.cavalos.comecaGuerra + s(1.5)}>
        <Audio src={staticFile('natal/cavalos/violino-da-guerra.mp3')} volume={(q) => 0.1 * Math.min(1, q / 40) * (1 - Math.max(0, Math.min(1, (q - (r.cavalos.explosao - r.cavalos.comecaGuerra)) / s(1.2))))} />
      </Sequence>
      {[0, 0.9, 2.1, 3.4, 4.6].map(d => <Sequence key={`raj${d}`} from={r.cavalos.comecaGuerra + s(d)} durationInFrames={s(1)}><Audio src={staticFile('natal/cavalos/sons/rajada.wav')} volume={0.08} /></Sequence>)}
      {[0.5, 2.8].map(d => <Sequence key={`exm${d}`} from={r.cavalos.comecaGuerra + s(d)} durationInFrames={s(2)}><Audio src={staticFile('natal/cavalos/sons/explosao-media.wav')} volume={0.14} /></Sequence>)}
      {/* A janela quebrando (08/11/2026): os três estalos do vidro, e no estouro o
          baque, o vidro espatifando, o crash e o relincho — antes quase mudos (0,06).
          vidro, crash e relincho são sintetizados, cheios (RMS −1 dB): ~0,08 já
          os põe no nível dos outros efeitos (~−19 dB RMS). */}
      {ESTALOS.map((e, i) => <Sequence key={`est${e}`} from={r.cavalos.chefe - e} durationInFrames={s(1)}><Audio src={staticFile('natal/caca/crava.wav')} volume={0.4 + 0.1 * i} /></Sequence>)}
      {ESTALOS.slice(1).map((e, i) => <Sequence key={`estv${e}`} from={r.cavalos.chefe - e + 2} durationInFrames={s(1.2)}><Audio src={staticFile(`natal/chefona/vidro-${i + 1}.ogg`)} volume={0.35 + 0.15 * i} /></Sequence>)}
      <Sequence from={r.cavalos.chefe} durationInFrames={s(2)}><Audio src={staticFile('natal/arena/impacto.wav')} volume={0.32} /></Sequence>
      <Sequence from={r.cavalos.chefe} durationInFrames={s(1.5)}><Audio src={staticFile('natal/cavalos/sons/vidro.wav')} volume={0.08} /></Sequence>
      <Sequence from={r.cavalos.chefe + ms(40)} durationInFrames={s(1.5)}><Audio src={staticFile('natal/chefona/vidro-3.ogg')} volume={0.7} /></Sequence>
      <Sequence from={r.cavalos.chefe + ms(150)} durationInFrames={s(1.5)}><Audio src={staticFile('natal/cavalos/sons/crash.wav')} volume={0.065} /></Sequence>
      <Sequence from={r.cavalos.chefe + ms(500)} durationInFrames={s(2)}><Audio src={staticFile('natal/cavalos/sons/relincho.wav')} volume={0.12} /></Sequence>
      <Sequence from={r.cavalos.bomba} durationInFrames={s(1.5)}><Audio src={staticFile('natal/cavalos/sons/assobio.wav')} volume={0.12} /></Sequence>
      <Sequence from={r.cavalos.explosao} durationInFrames={s(3)}><Audio src={staticFile('natal/cavalos/sons/explosao.wav')} volume={0.32} /></Sequence>
      <Sequence from={r.cavalos.explosao + ms(250)} durationInFrames={s(2)}><Audio src={staticFile('natal/cavalos/sons/explosao-media.wav')} volume={0.18} /></Sequence>
      {/* A Garrafa da Erika: o brilho, a festa, os pops, as insígnias e a música festiva. */}
      <SonsDaErika e={r.erika} ate={r.fim} />
      {/* O embrulho: o papel fechando e o laço pulando. */}
      <Sequence from={r.cavalos.embrulha} durationInFrames={s(1.2)}><Audio src={staticFile('sons/whoosh.wav')} volume={0.3} /></Sequence>
      <Sequence from={r.cavalos.embrulha + ms(1100)} durationInFrames={s(1)}><Audio src={staticFile('sons/pop.wav')} volume={0.3} /></Sequence>
      {/* A música da corrida (a do motor, `corrida-turbo`) */}
      <Sequence from={c.entra} durationInFrames={c.sai - c.entra + ms(500)}>
        <Audio src={staticFile('natal/corrida/corrida-turbo.mp3')} volume={(q) => 0.5 * Math.min(1, q / 20) * (1 - Math.max(0, Math.min(1, (q - (c.sai - c.entra)) / ms(450))))} />
      </Sequence>
    </>
  );
};
