/**
 * Jornal.tsx — o estilo «Jornal» da cena «Destaque»: primeira página da
 * «Gazeta do Time», manchete com o nome, a foto grande em preto e branco com
 * legenda, e a matéria escrita com os números de verdade (nada de texto de
 * enchimento).
 */
import type { CSSProperties } from 'react';
import { caber, dadosDoDestaque, emPagamentos, iniciais, useFonte, type PropsEstilo } from './comum';
import { Animacoes, FotoDestaque } from './pecas';

const GOTICA = '"UnifrakturMaguntia", "Old English Text MT", Georgia, serif';
const MANCHETE = '"Playfair Display", Georgia, "Times New Roman", serif';
const CORPO = '"Libre Baskerville", Georgia, "Times New Roman", serif';
const PAPEL = '#f3ecdc';
const TINTA = '#1c1a17';
const VERMELHO = '#b3261e';

const imprime = (atraso: number): CSSProperties => ({ animation: `jornal-imprime 700ms ease-out ${atraso}ms both` });

/** «da Equipe Rosa» / «do Play 1». */
const doOnde = (onde: string) => (!onde ? 'do time' : /^equipe\b/i.test(onde) ? `da ${onde}` : `do ${onde}`);

export function DestaqueJornal({ v, tela }: PropsEstilo) {
  useFonte('tv-jornal-fontes', 'https://fonts.googleapis.com/css2?family=UnifrakturMaguntia&family=Playfair+Display:ital,wght@0,800;0,900;1,500&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap');
  const d = dadosDoDestaque(v, tela);
  const p = d.pessoa;
  const primeiro = d.nome.split(' ')[0];
  // «na quinta-feira, 29 de outubro», «no sábado, …» (sábado e domingo são masculinos).
  const quando = d.doMes
    ? `em ${d.quando.replace(' · até agora', '')}, até agora`
    : d.quando ? `${/^(sábado|domingo)/.test(d.quando) ? 'no' : 'na'} ${d.quando}` : '';

  const manchete = p ? `${d.nome} é o ${d.titulo.toLowerCase()}` : 'Quem será o destaque?';
  const materia = p
    ? [
        `${d.nome} liderou o recebimento ${doOnde(d.onde)} ${quando}${d.valor ? `, com ${d.valor}${d.unidade ? ` ${d.unidade}` : ''} ${emPagamentos(d.pagamentos)}` : ''}.`,
        `O resultado coloca ${primeiro} no topo do placar e vira referência para quem quer subir no ranking.`,
        'Procurado pela reportagem, o time comemorou e já fala em repetir a dose.',
      ]
    : [d.motivo, 'A redação segue de plantão: a qualquer momento sai a próxima edição.'];

  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden', color: TINTA, fontFamily: CORPO,
      background: `radial-gradient(ellipse 120% 90% at 50% 40%, ${PAPEL} 55%, #e2d6bc 100%)`,
    }}>
      {/* O cabeçalho. */}
      <div style={{ position: 'absolute', left: 90, right: 90, top: 50, textAlign: 'center', ...imprime(0) }}>
        <div style={{ borderTop: `3px solid ${TINTA}`, borderBottom: `1px solid ${TINTA}`, padding: '8px 0', display: 'flex', justifyContent: 'space-between', fontSize: 24, letterSpacing: 2, textTransform: 'uppercase' }}>
          <span>Edição {d.doMes ? 'do mês' : 'do dia'}</span>
          <span>{d.onde || 'O time'}</span>
          <span>Preço: um acordo</span>
        </div>
        <div style={{ fontFamily: GOTICA, fontSize: 128, lineHeight: 1.1, margin: '6px 0 0' }}>Gazeta do Time</div>
        <div style={{ borderTop: `1px solid ${TINTA}`, borderBottom: `3px solid ${TINTA}`, padding: '8px 0', fontSize: 26, fontStyle: 'italic' }}>
          {d.quando ? d.quando.charAt(0).toUpperCase() + d.quando.slice(1) : 'Edição extra'}
        </div>
      </div>

      {/* A manchete. */}
      <div style={{
        position: 'absolute', left: 90, right: 90, top: 330, textAlign: 'center',
        fontFamily: MANCHETE, fontWeight: 900, textTransform: 'uppercase', lineHeight: 0.98, letterSpacing: -1,
        fontSize: caber(manchete, 1740, 104, 0.58, 56), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        ...imprime(200),
      }}>
        {manchete}
      </div>

      {/* A foto, com legenda. */}
      <div style={{ position: 'absolute', left: 90, top: 470, width: 860, ...imprime(400) }}>
        <div style={{ height: 500, overflow: 'hidden', border: `2px solid ${TINTA}`, background: '#cfc6b2' }}>
          <FotoDestaque foto={p?.foto ?? null} style={{ filter: 'grayscale(1) contrast(1.12) sepia(.15)', objectPosition: 'center 22%' }} reserva={
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MANCHETE, fontWeight: 900, fontSize: p ? 220 : 280, color: '#6f6656' }}>
              {p ? iniciais(p.nome) : '?'}
            </div>
          } />
        </div>
        <div style={{ fontSize: 24, fontStyle: 'italic', marginTop: 12, lineHeight: 1.35 }}>
          {p ? `${d.nome}, ${doOnde(d.onde)}: o nome ${d.doMes ? 'do mês' : 'do dia'}.` : 'Foto: a redação aguarda o primeiro recebimento.'}
        </div>
      </div>

      {/* A matéria, em duas colunas. */}
      <div style={{ position: 'absolute', left: 1000, right: 90, top: 470, bottom: 60, ...imprime(600) }}>
        <div style={{ columnCount: 2, columnGap: 40, columnRule: `1px solid ${TINTA}55`, fontSize: 29, lineHeight: 1.5, textAlign: 'left', hyphens: 'auto' }}>
          {materia.map((t, i) => (
            <p key={i} style={{ margin: '0 0 18px' }}>
              {i === 0
                ? <><span style={{ float: 'left', fontFamily: MANCHETE, fontWeight: 900, fontSize: 110, lineHeight: 0.82, margin: '6px 10px 0 0' }}>{t.charAt(0)}</span>{t.slice(1)}</>
                : t}
            </p>
          ))}
        </div>
      </div>

      {/* O carimbo de «extra». */}
      <div style={{
        position: 'absolute', left: 610, top: 500, padding: '10px 26px', background: `${PAPEL}cc`, border: `6px solid ${VERMELHO}`, color: VERMELHO,
        fontFamily: MANCHETE, fontWeight: 900, fontSize: 56, letterSpacing: 4, transform: 'rotate(-10deg)', opacity: 0.9,
        animation: 'jornal-carimbo 500ms cubic-bezier(.2, 1.5, .4, 1) 900ms both',
      }}>
        EXTRA!
      </div>

      <Animacoes css={`
        @keyframes jornal-imprime { from { opacity: 0; filter: blur(6px); } to { opacity: 1; filter: none; } }
        @keyframes jornal-carimbo { from { opacity: 0; transform: scale(2.4) rotate(-10deg); } to { opacity: .9; transform: rotate(-10deg); } }
      `} />
    </div>
  );
}
