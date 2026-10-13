// Cena 7 — «Quer saber como está a sua equipe? E o seu setor? Está tudo aqui.
// E você sabe exatamente onde está!»

import { useCurrentFrame } from 'remotion';
import { Icone } from '../../componentes/Icone';
import { aperto, entrada, entre, mola, ms, saida } from '../../movimento';
import { COR, FONTE_MONO, GRADIENTE_MARCA } from '../../tema';
import { CONTEUDO } from '../layout';
import type { TempoApp } from '../roteiro';
import { Avatar, brl, Card, Destaque, Numero, Rotulo } from '../ui';

const EQUIPE = [
  { nome: 'Rafael Monteiro', valor: 38210 },
  { nome: 'Camila Duarte', valor: 35940 },
  { nome: 'Você', valor: 33120, voce: true },
  { nome: 'Bruno Tavares', valor: 29870 },
  { nome: 'Larissa Pinto', valor: 27450 },
  { nome: 'Diego Almeida', valor: 24300 },
  { nome: 'Sabrina Costa', valor: 21980 },
];

const EQUIPES_SETOR = [
  { nome: 'Águia', valor: 210880, minha: true },
  { nome: 'Falcão', valor: 187340 },
  { nome: 'Leão', valor: 172510 },
  { nome: 'Lobo', valor: 151720 },
];

const ABAS = ['Eu', 'Minha equipe', 'Meu setor'];

export const Dashboard: React.FC<{ t: TempoApp; entra: number; sai: number }> = ({ t, entra, sai }) => {
  const f = useCurrentFrame();
  if (f < entra || f >= sai + ms(300)) return null;
  const c = t.clique;
  const e = (i: number) => entrada(f, entra, i, { passoMs: 40 });

  // qual aba está ativa: Eu → Minha equipe → Meu setor
  const aba = f >= c.abaSetor ? 2 : f >= c.abaEquipe ? 1 : 0;
  const trocaAba = f >= c.abaSetor ? c.abaSetor : c.abaEquipe;
  const abaAnterior = f >= c.abaSetor ? 1 : 0;
  const desliza = f >= c.abaEquipe ? mola(f, trocaAba) : 0;
  const xAba = (abaAnterior + (aba - abaAnterior) * desliza) * 146;

  // foco: equipe acende na aba equipe; setor na aba setor; os dois no «tudo aqui»
  const luzEquipe = f < c.abaSetor ? 1 : f < t.tudoAqui ? 1 - 0.55 * entre(f, c.abaSetor, c.abaSetor + ms(250), 0, 1) : 0.45 + 0.55 * entre(f, t.tudoAqui, t.tudoAqui + ms(300), 0, 1);
  const luzSetor = f < c.abaSetor ? 0.45 + 0.55 * (1 - entre(f, c.abaEquipe, c.abaEquipe + ms(250), 0, 1)) : 1;
  const voce = entre(f, t.voce, t.voce + ms(250), 0, 1);
  const maxEquipe = EQUIPE[0].valor;
  const maxSetor = EQUIPES_SETOR[0].valor;

  return (
    <div style={{ position: 'absolute', inset: 0, ...(f >= sai ? saida(f, sai) : {}) }}>
      {/* abas */}
      <div style={{ position: 'absolute', left: CONTEUDO.x, top: 138, width: 438, height: 48, borderRadius: 12, background: '#0a131c', border: `1px solid ${COR.borda}`, ...e(0) }}>
        <div style={{ position: 'absolute', left: 4 + xAba, top: 4, width: 138, height: 38, borderRadius: 9, background: 'rgba(41,168,224,0.18)', border: '1px solid rgba(92,200,245,0.45)' }} />
        {ABAS.map((a, i) => (
          <div key={a} style={{ position: 'absolute', left: 4 + i * 146, top: 4, width: 138, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, color: i === aba ? COR.texto : COR.textoSuave, transform: `scale(${i === 1 ? aperto(f, c.abaEquipe) : i === 2 ? aperto(f, c.abaSetor) : 1})` }}>
            {a}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: CONTEUDO.x + 460, top: 150, fontSize: 15, color: COR.textoSuave, ...e(1) }}>Outubro · atualizado o dia todo</div>

      {/* equipe */}
      <div style={{ position: 'absolute', left: CONTEUDO.x, top: 206, width: 760, height: 668, opacity: 0.35 + 0.65 * luzEquipe, ...e(2) }}>
        <Card style={{ width: '100%', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(92,200,245,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icone nome="usuarios" tamanho={20} cor={COR.azulClaro} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: COR.texto }}>Equipe Águia</div>
              <div style={{ fontSize: 14, color: COR.textoSuave }}>Recebido no mês por pessoa</div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <Rotulo>Total da equipe</Rotulo>
              <Numero style={{ fontSize: 24, color: COR.texto }}>{brl(210880, false)}</Numero>
            </div>
          </div>
        </Card>
        {EQUIPE.map((p, i) => {
          const barra = mola(f, entra + ms(350 + i * 50));
          const eVoce = !!p.voce;
          return (
            <div
              key={p.nome}
              style={{
                position: 'absolute',
                left: 18,
                right: 18,
                top: 94 + i * 74,
                height: 64,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '0 14px',
                background: eVoce ? `rgba(41,168,224,${0.06 + 0.12 * voce})` : undefined,
                ...entrada(f, entra, 3 + i, { passoMs: 40 }),
              }}
            >
              <div style={{ width: 28, fontFamily: FONTE_MONO, fontSize: 16, fontWeight: 700, color: i < 3 ? COR.ambar : COR.textoFraco }}>{i + 1}º</div>
              {eVoce ? (
                <div style={{ width: 36, height: 36, borderRadius: 18, background: GRADIENTE_MARCA, color: '#05090f', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>JP</div>
              ) : (
                <Avatar nome={p.nome} tamanho={36} />
              )}
              <div style={{ width: 180, fontSize: 16, fontWeight: eVoce ? 700 : 500, color: eVoce ? COR.azulClaro : COR.texto }}>{eVoce ? 'Você · Juliana' : p.nome}</div>
              <div style={{ flex: 1, height: 10, borderRadius: 5, background: '#16222e', overflow: 'hidden' }}>
                <div style={{ width: `${(p.valor / maxEquipe) * 100 * barra}%`, height: '100%', borderRadius: 5, background: eVoce ? GRADIENTE_MARCA : '#2a4a66' }} />
              </div>
              <Numero style={{ width: 130, textAlign: 'right', fontSize: 16, color: COR.texto }}>{brl(p.valor, false)}</Numero>
              {eVoce && <Destaque ativo={voce} raio={12} />}
            </div>
          );
        })}
      </div>

      {/* setor */}
      <div style={{ position: 'absolute', left: CONTEUDO.x + 776, top: 206, width: CONTEUDO.l - 776, height: 668, opacity: 0.35 + 0.65 * luzSetor, ...e(3) }}>
        <Card style={{ width: '100%', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(74,222,128,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icone nome="predio" tamanho={20} cor={COR.verdeClaro} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: COR.texto }}>Setor Centro</div>
              <div style={{ fontSize: 14, color: COR.textoSuave }}>4 equipes · 31 pessoas</div>
            </div>
          </div>
          <Rotulo style={{ marginTop: 28 }}>Recebido no mês</Rotulo>
          <Numero style={{ display: 'block', fontSize: 40, color: COR.texto, marginTop: 6 }}>{brl(722450 * mola(f, entra + ms(300)), false)}</Numero>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, fontSize: 14, color: COR.textoSuave }}>
            <span>Meta do setor</span>
            <Numero style={{ color: COR.texto }}>74%</Numero>
          </div>
          <div style={{ height: 12, borderRadius: 6, background: '#16222e', marginTop: 8, overflow: 'hidden' }}>
            <div style={{ width: `${74 * mola(f, entra + ms(400))}%`, height: '100%', borderRadius: 6, background: GRADIENTE_MARCA }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: COR.texto, marginTop: 34 }}>Equipes do setor</div>
          {EQUIPES_SETOR.map((q, i) => {
            const barra = mola(f, entra + ms(450 + i * 60));
            return (
              <div key={q.nome} style={{ marginTop: 18, ...entrada(f, entra, 6 + i, { passoMs: 40 }) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: q.minha ? COR.azulClaro : COR.texto, fontWeight: q.minha ? 700 : 500 }}>
                  <span>{q.nome}{q.minha ? ' · sua equipe' : ''}</span>
                  <Numero>{brl(q.valor, false)}</Numero>
                </div>
                <div style={{ height: 9, borderRadius: 5, background: '#16222e', marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${(q.valor / maxSetor) * 100 * barra}%`, height: '100%', borderRadius: 5, background: q.minha ? GRADIENTE_MARCA : '#2a4a66' }} />
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
};
