// Cena 2 — «Chega de perder tempo procurando informação. Com o Gestão de
// Acordos, tudo chega até você em instantes!»
//
// A pilha da cena 1 se recolhe num ponto de luz; dele nascem as duas logos — a
// verde (PaguePlay, Marília) e a azul (BookPlay, Birigui) — que se afastam
// para os lados. No «Com o» elas correm de volta para o centro; no «Gestão» se
// fundem no ícone do app. No «tudo» o ícone vira a janela do sistema (isso já
// é a SecaoApp).

import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { ICONE } from '../app/layout';
import { palavra } from '../linhaDoTempo';
import { entrada, entre, mola, ms, saida, SUAVE } from '../movimento';
import { COR, FONTE, GRADIENTE_MARCA } from '../tema';
import { CENTRO_PILHA, temposCena1 } from './Cena01Problema';

export const LOGO_VERDE = { cx: 640, cy: 470, tamanho: 300 };
export const LOGO_AZUL = { cx: 1280, cy: 470, tamanho: 300 };

export function temposCena2() {
  const t1 = temposCena1();
  const informacao = palavra('cena-02', 'informacao');
  return {
    nascem: t1.recolhe + ms(260),
    rotulos: informacao + ms(120),
    juntar: palavra('cena-02', 'com'),
    fundir: palavra('cena-02', 'gestao'),
    nome: palavra('cena-02', 'gestao'),
    expandir: palavra('cena-02', 'tudo'),
  };
}

const NOME = 'Gestão de Acordos';

export const Cena02Virada: React.FC = () => {
  const f = useCurrentFrame();
  const t = temposCena2();
  if (f < t.nascem - ms(20) || f > t.expandir + ms(400)) return null;

  const nasce = mola(f, t.nascem, { mass: 1, stiffness: 150, damping: 17, overshootClamping: false });
  const junta = mola(f, t.juntar, { mass: 1, stiffness: 190, damping: 21, overshootClamping: false });
  const fundiu = entre(f, t.fundir - ms(60), t.fundir + ms(200), 0, 1);

  // as logos saem do centro, vão para os lados e voltam
  const lado = (alvo: number) => CENTRO_PILHA.x + (alvo - CENTRO_PILHA.x) * nasce + (ICONE.cx - (CENTRO_PILHA.x + (alvo - CENTRO_PILHA.x) * nasce)) * junta;
  const posY = CENTRO_PILHA.y + (LOGO_VERDE.cy - CENTRO_PILHA.y) * nasce + (ICONE.cy - LOGO_VERDE.cy) * junta;
  const tamLogo = LOGO_VERDE.tamanho * (0.25 + 0.75 * Math.min(1.05, nasce)) + (ICONE.lado * 0.78 - LOGO_VERDE.tamanho) * junta;

  // o ícone nasce com mola e sobra de 3%
  const icone = mola(f, t.fundir - ms(40));
  const ladoIcone = ICONE.lado * (0.55 + 0.45 * icone);
  const flash = entre(f, t.fundir, t.fundir + ms(700), 0, 1);

  const sumirNome = f >= t.expandir ? saida(f, t.expandir, 300) : {};

  return (
    <AbsoluteFill style={{ fontFamily: FONTE }}>
      {fundiu < 1 &&
        [
          { x: lado(LOGO_VERDE.cx), src: 'logo-pagueplay.png', marca: 'PaguePlay', cidade: 'Marília', cor: COR.verde, brilho: 'rgba(74,222,128,0.35)', giro: -1 },
          { x: lado(LOGO_AZUL.cx), src: 'logo-bookplay.png', marca: 'BookPlay', cidade: 'Birigui', cor: COR.azul, brilho: 'rgba(56,189,248,0.35)', giro: 1 },
        ].map((l, i) => (
          <div
            key={l.src}
            style={{
              position: 'absolute',
              left: l.x - tamLogo / 2,
              top: posY - tamLogo / 2,
              width: tamLogo,
              height: tamLogo,
              opacity: Math.min(1, nasce * 2) * (1 - fundiu),
              transform: `rotate(${(1 - Math.min(1, nasce)) * 25 * l.giro}deg)`,
            }}
          >
            <Img src={staticFile(`marca/${l.src}`)} style={{ width: '100%', height: '100%', filter: `drop-shadow(0 18px 30px ${l.brilho})` }} />
            <div
              style={{
                position: 'absolute',
                top: tamLogo + 16,
                left: -110,
                width: tamLogo + 220,
                textAlign: 'center',
                ...entrada(f, t.rotulos, i * 2),
                ...(f >= t.juntar - ms(140) ? saida(f, t.juntar - ms(140), 200) : {}),
              }}
            >
              <div style={{ fontSize: 34, fontWeight: 800, color: COR.texto, letterSpacing: -0.8 }}>{l.marca}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: l.cor, marginTop: 4, letterSpacing: 3, textTransform: 'uppercase' }}>{l.cidade}</div>
            </div>
          </div>
        ))}

      {/* clarão da fusão */}
      {flash > 0 && flash < 1 && (
        <div
          style={{
            position: 'absolute',
            left: ICONE.cx - 420 * flash,
            top: ICONE.cy - 420 * flash,
            width: 840 * flash,
            height: 840 * flash,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(56,189,248,${0.3 * (1 - flash)}) 0%, rgba(74,222,128,${0.2 * (1 - flash)}) 35%, transparent 68%)`,
          }}
        />
      )}

      {/* o ícone do app — some quando a SecaoApp assume no «tudo» */}
      {f >= t.fundir - ms(40) && f < t.expandir && (
        <div
          style={{
            position: 'absolute',
            left: ICONE.cx - ladoIcone / 2,
            top: ICONE.cy - ladoIcone / 2,
            width: ladoIcone,
            height: ladoIcone,
            borderRadius: ICONE.raio * (ladoIcone / ICONE.lado),
            overflow: 'hidden',
            opacity: entre(f, t.fundir - ms(40), t.fundir + ms(160), 0, 1),
            boxShadow: `0 30px 60px rgba(15,27,38,0.22), 0 8px 18px rgba(15,27,38,0.12), 0 0 ${50 + 40 * (1 - flash)}px rgba(56,189,248,0.25)`,
          }}
        >
          <Img src={staticFile('marca/app-512.png')} style={{ width: '100%', height: '100%' }} />
        </div>
      )}

      {/* nome do sistema, letra por letra */}
      {f < t.expandir + ms(320) && (
        <div style={{ position: 'absolute', top: ICONE.cy + ICONE.lado / 2 + 46, width: 1920, textAlign: 'center', ...sumirNome }}>
          <div style={{ fontSize: 78, fontWeight: 800, letterSpacing: -2.2, color: COR.texto }}>
            {NOME.split('').map((ch, i) => (
              <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre', ...entrada(f, t.nome, i, { passoMs: 28, deslocY: 24, duracaoMs: 500 }) }}>
                {ch === ' ' ? ' ' : ch}
              </span>
            ))}
          </div>
          <div
            style={{
              height: 5,
              width: 280 * entre(f, t.nome + ms(500), t.nome + ms(1100), 0, 1, SUAVE),
              margin: '18px auto 0',
              borderRadius: 3,
              background: GRADIENTE_MARCA,
            }}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};
