// Cena 3 — «Seu dia já começa organizado. Em um sistema onde cada detalhe faz
// uma diferença positiva.» Os quatro detalhes acendem um por palavra.

import { useCurrentFrame } from 'remotion';
import { Icone } from '../../componentes/Icone';
import { entrada, entre, ms, saida } from '../../movimento';
import { COR, FONTE_MONO, GRADIENTE_MARCA } from '../../tema';
import { CONTEUDO } from '../layout';
import type { TempoApp } from '../roteiro';
import { Avatar, brl, Card, Destaque, Numero, Rotulo, Selo, type TipoSelo } from '../ui';

const KPIS = [
  { rotulo: 'Vencem hoje', valor: '8', icone: 'relogio', cor: COR.ambar },
  { rotulo: 'Pagos hoje', valor: '5', icone: 'checkCirculo', cor: COR.verdeClaro },
  { rotulo: 'Recebido hoje', valor: brl(3450), icone: 'tendencia', cor: COR.azulClaro },
  { rotulo: 'Lembretes', valor: '3', icone: 'sino', cor: '#c084fc' },
];

const DO_DIA: { nome: string; valor: number; selo: TipoSelo; rotulo: string }[] = [
  { nome: 'Marcos Vinícius Lima', valor: 416.67, selo: 'pago', rotulo: 'Pago' },
  { nome: 'Fernanda Rocha', valor: 1222.68, selo: 'pendente', rotulo: 'Pendente' },
  { nome: 'Antônio Carlos Reis', valor: 350, selo: 'pago', rotulo: 'Pago' },
  { nome: 'Patrícia Gomes', valor: 780.4, selo: 'pendente', rotulo: 'Pendente' },
  { nome: 'Roberto Nunes', valor: 1042, selo: 'pago', rotulo: 'Pago' },
  { nome: 'Luciana Freitas', valor: 265.9, selo: 'naoPago', rotulo: 'Não pago' },
];

const X = CONTEUDO.x;
const L = CONTEUDO.l;

export const Inicio: React.FC<{ t: TempoApp; entra: number; sai: number }> = ({ t, entra, sai }) => {
  const f = useCurrentFrame();
  if (f >= sai + ms(300)) return null;
  const e = (i: number) => entrada(f, entra, i, { passoMs: 45 });
  const acende = (i: number) => {
    const d = t.detalhes[i];
    const fim = i < 3 ? t.detalhes[i + 1] + ms(250) : t.c4.inicio;
    return Math.min(entre(f, d - ms(80), d + ms(180), 0, 1), entre(f, fim, fim + ms(300), 1, 0));
  };
  const largKpi = (L - 48) / 4;

  return (
    <div style={{ position: 'absolute', inset: 0, ...(f >= sai ? saida(f, sai) : {}) }}>
      {/* saudação */}
      <Card style={{ position: 'absolute', left: X, top: 138, width: L, height: 104, display: 'flex', alignItems: 'center', gap: 18, background: 'linear-gradient(110deg, rgba(74,222,128,0.10), rgba(92,200,245,0.10) 60%, #0f1a24)', ...e(0) }}>
        <Avatar nome="Juliana Prado" tamanho={56} />
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, color: COR.texto }}>Bom dia, Juliana! 👋</div>
          <div style={{ fontSize: 15, color: COR.textoSuave, marginTop: 4 }}>Terça-feira, 20 de outubro · Equipe Águia · Setor Centro</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <Rotulo>Seu foco de hoje</Rotulo>
          <div style={{ fontSize: 17, color: COR.texto, marginTop: 6, fontWeight: 600 }}>8 vencimentos · 3 lembretes</div>
        </div>
      </Card>

      {/* indicadores */}
      {KPIS.map((k, i) => (
        <div key={k.rotulo} style={{ position: 'absolute', left: X + i * (largKpi + 16), top: 262, width: largKpi, height: 120, ...e(1 + i) }}>
          <Card style={{ width: '100%', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Rotulo>{k.rotulo}</Rotulo>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: `${k.cor}1f`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icone nome={k.icone} tamanho={18} cor={k.cor} />
              </div>
            </div>
            <Numero style={{ display: 'block', fontSize: 34, color: COR.texto, marginTop: 12 }}>{k.valor}</Numero>
          </Card>
          {i === 0 && <Destaque ativo={acende(0)} />}
        </div>
      ))}

      {/* acordos do dia */}
      <Card style={{ position: 'absolute', left: X, top: 402, width: 820, height: 472, ...e(5) }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: COR.texto }}>Acordos do dia</div>
          <Selo tipo="boleto">6 acordos</Selo>
        </div>
        {DO_DIA.map((a, i) => (
          <div key={a.nome} style={{ position: 'absolute', left: 22, right: 22, top: 70 + i * 64, height: 56, display: 'flex', alignItems: 'center', gap: 14, borderTop: i ? `1px solid ${COR.borda}` : 'none', ...entrada(f, entra, 7 + i, { passoMs: 45 }) }}>
            <Avatar nome={a.nome} tamanho={34} />
            <div style={{ fontSize: 16, color: COR.texto, fontWeight: 500, flex: 1 }}>{a.nome}</div>
            <Numero style={{ fontSize: 16, color: COR.texto, width: 140, textAlign: 'right' }}>{brl(a.valor)}</Numero>
            <div style={{ width: 120, display: 'flex', justifyContent: 'flex-end', position: 'relative' }}>
              <div style={{ position: 'relative' }}>
                <Selo tipo={a.selo}>{a.rotulo}</Selo>
                {i === 0 && <Destaque ativo={acende(1)} raio={999} />}
              </div>
            </div>
          </div>
        ))}
      </Card>

      {/* calendário */}
      <Card style={{ position: 'absolute', left: X + 836, top: 402, width: L - 836, height: 472, ...e(6) }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: COR.texto }}>Outubro</div>
          <Icone nome="calendario" tamanho={20} cor={COR.textoSuave} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginTop: 16, fontSize: 13, textAlign: 'center' }}>
          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
            <div key={i} style={{ color: COR.textoFraco, fontWeight: 600 }}>{d}</div>
          ))}
          {Array.from({ length: 4 }).map((_, i) => <div key={`v${i}`} />)}
          {Array.from({ length: 31 }).map((_, i) => {
            const dia = i + 1;
            const hoje = dia === 20;
            const temVenc = [6, 13, 15, 22, 27, 30].includes(dia);
            return (
              <div key={dia} style={{ position: 'relative', height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONTE_MONO, color: hoje ? '#05090f' : COR.texto, fontWeight: hoje ? 700 : 500, background: hoje ? GRADIENTE_MARCA : 'transparent' }}>
                {dia}
                {temVenc && <div style={{ position: 'absolute', bottom: 5, width: 5, height: 5, borderRadius: 3, background: COR.ambar }} />}
                {hoje && <Destaque ativo={acende(2)} raio={10} />}
              </div>
            );
          })}
        </div>
        <div style={{ position: 'absolute', left: 22, right: 22, bottom: 20, height: 52, borderRadius: 12, background: 'rgba(192,132,252,0.10)', border: '1px solid rgba(192,132,252,0.35)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', boxSizing: 'border-box' }}>
          <Icone nome="sino" tamanho={17} cor="#c084fc" />
          <span style={{ fontSize: 15, color: COR.texto, fontWeight: 500 }}>Lembrete · ligar para Fernanda às 15h</span>
          <Destaque ativo={acende(3)} raio={12} />
        </div>
      </Card>
    </div>
  );
};
