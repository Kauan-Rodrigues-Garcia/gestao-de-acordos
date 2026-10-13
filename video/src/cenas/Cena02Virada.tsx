// Cena 2 — «Chega de perder tempo procurando informação. Com o Gestão de
// Acordos, tudo chega até você em instantes!»
//
// A poeira da cena 1 é puxada e forma as duas logos: a verde (PaguePlay,
// Marília) e a azul (BookPlay, Birigui). No «Com o» elas correm para o centro;
// no «Gestão» se fundem no ícone do app. No «tudo» o ícone vira a janela do
// sistema (isso já é a SecaoApp).

import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { ICONE } from '../app/layout';
import { logoSrc } from '../componentes/Poeira';
import { palavra } from '../linhaDoTempo';
import { entrada, entre, mola, ms, s, saida, SUAVE } from '../movimento';
import { COR, FONTE, GRADIENTE_MARCA } from '../tema';

export const LOGO_VERDE = { cx: 640, cy: 470, tamanho: 330 };
export const LOGO_AZUL = { cx: 1280, cy: 470, tamanho: 330 };

export function temposCena2() {
  const chega = palavra('cena-02', 'chega');
  const informacao = palavra('cena-02', 'informacao');
  return {
    convergeEm: chega,
    viagem: s(1.25),
    logosNitidas: informacao - ms(120),
    rotulos: informacao + ms(200),
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

  const nitidez = entre(f, t.logosNitidas, t.logosNitidas + ms(380), 0, 1);
  const junta = mola(f, t.juntar);
  const fundiu = entre(f, t.fundir - ms(60), t.fundir + ms(220), 0, 1);

  // as logos correm para o centro e encolhem um pouco
  const posVerde = LOGO_VERDE.cx + (ICONE.cx - LOGO_VERDE.cx) * junta;
  const posAzul = LOGO_AZUL.cx + (ICONE.cx - LOGO_AZUL.cx) * junta;
  const posY = LOGO_VERDE.cy + (ICONE.cy - LOGO_VERDE.cy) * junta;
  const tamLogo = LOGO_VERDE.tamanho + (ICONE.lado * 0.78 - LOGO_VERDE.tamanho) * junta;

  // o ícone nasce com mola e sobra de 3%
  const icone = mola(f, t.fundir - ms(40));
  const lado = ICONE.lado * (0.55 + 0.45 * icone);
  const flash = entre(f, t.fundir, t.fundir + ms(700), 0, 1);

  const sumirNome = f >= t.expandir ? saida(f, t.expandir, 300) : {};

  return (
    <AbsoluteFill style={{ fontFamily: FONTE }}>
      {/* logos nítidas (a poeira some por baixo delas) */}
      {fundiu < 1 &&
        [
          { pos: posVerde, src: 'logo-pagueplay.png', marca: 'PaguePlay', cidade: 'Marília', cor: COR.verdeClaro },
          { pos: posAzul, src: 'logo-bookplay.png', marca: 'BookPlay', cidade: 'Birigui', cor: COR.azulClaro },
        ].map((l, i) => (
          <div key={l.src} style={{ position: 'absolute', left: l.pos - tamLogo / 2, top: posY - tamLogo / 2, width: tamLogo, height: tamLogo, opacity: nitidez * (1 - fundiu) }}>
            <Img src={logoSrc(l.src)} style={{ width: '100%', height: '100%', filter: `${i === 0 ? 'brightness(1.45) saturate(1.1) ' : ''}drop-shadow(0 0 30px ${l.cor}55)` }} />
            <div
              style={{
                position: 'absolute',
                top: tamLogo + 14,
                left: -100,
                width: tamLogo + 200,
                textAlign: 'center',
                ...entrada(f, t.rotulos, i * 2),
                ...(f >= t.juntar - ms(140) ? saida(f, t.juntar - ms(140), 200) : {}),
              }}
            >
              <div style={{ fontSize: 34, fontWeight: 700, color: COR.texto }}>{l.marca}</div>
              <div style={{ fontSize: 22, fontWeight: 500, color: l.cor, marginTop: 4, letterSpacing: 2, textTransform: 'uppercase' }}>{l.cidade}</div>
            </div>
          </div>
        ))}

      {/* clarão da fusão */}
      {flash > 0 && flash < 1 && (
        <div
          style={{
            position: 'absolute',
            left: ICONE.cx - 400 * flash,
            top: ICONE.cy - 400 * flash,
            width: 800 * flash,
            height: 800 * flash,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(140,230,200,${0.35 * (1 - flash)}) 0%, transparent 65%)`,
          }}
        />
      )}

      {/* o ícone do app — some quando a SecaoApp assume no «tudo» */}
      {f >= t.fundir - ms(40) && f < t.expandir && (
        <div
          style={{
            position: 'absolute',
            left: ICONE.cx - lado / 2,
            top: ICONE.cy - lado / 2,
            width: lado,
            height: lado,
            borderRadius: ICONE.raio * (lado / ICONE.lado),
            overflow: 'hidden',
            opacity: entre(f, t.fundir - ms(40), t.fundir + ms(160), 0, 1),
            boxShadow: `0 30px 80px rgba(0,0,0,0.55), 0 0 ${60 + 40 * (1 - flash)}px rgba(74,222,128,0.18), 0 0 120px rgba(92,200,245,0.18)`,
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <Img src={logoSrc('app-512.png')} style={{ width: '100%', height: '100%' }} />
        </div>
      )}

      {/* nome do sistema, letra por letra */}
      {f < t.expandir + ms(320) && (
        <div style={{ position: 'absolute', top: ICONE.cy + ICONE.lado / 2 + 46, width: 1920, textAlign: 'center', ...sumirNome }}>
          <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2, color: COR.texto }}>
            {NOME.split('').map((ch, i) => (
              <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre', ...entrada(f, t.nome, i, { passoMs: 28, deslocY: 24, duracaoMs: 500 }) }}>
                {ch === ' ' ? ' ' : ch}
              </span>
            ))}
          </div>
          <div
            style={{
              height: 4,
              width: 260 * entre(f, t.nome + ms(500), t.nome + ms(1100), 0, 1, SUAVE),
              margin: '18px auto 0',
              borderRadius: 2,
              background: GRADIENTE_MARCA,
            }}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};
