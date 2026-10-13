// Cena 5 — «Cada acordo fica na sua mão. Pago, pendente… e, se precisar,
// reagenda com dois cliques.»

import { useCurrentFrame } from 'remotion';
import { Icone } from '../../componentes/Icone';
import { aperto, entrada, entre, mola, ms, saida } from '../../movimento';
import { COR, FONTE_MONO, GRADIENTE_MARCA } from '../../tema';
import { CONTEUDO } from '../layout';
import type { TempoApp } from '../roteiro';
import { brl, Card, Destaque, Numero, Selo, type TipoSelo } from '../ui';

type Linha = { insc: string; nome: string; venc: string; valor: number; tipo: 'boleto' | 'cartao'; selo: TipoSelo; rotulo: string };

const LINHAS: Linha[] = [
  { insc: '907544', nome: 'Maria Aparecida Souza', venc: '20/10/2026', valor: 416.67, tipo: 'boleto', selo: 'pendente', rotulo: 'Pendente' },
  { insc: '821724', nome: 'Marcos Vinícius Lima', venc: '20/10/2026', valor: 1867.4, tipo: 'cartao', selo: 'pendente', rotulo: 'Pendente' },
  { insc: '34345', nome: 'Antônio Carlos Reis', venc: '21/10/2026', valor: 4545, tipo: 'boleto', selo: 'pago', rotulo: 'Pago' },
  { insc: '324234', nome: 'Luciana Freitas', venc: '17/10/2026', valor: 265.9, tipo: 'boleto', selo: 'naoPago', rotulo: 'Não pago' },
  { insc: '909474', nome: 'Fernanda Rocha', venc: '24/10/2026', valor: 1042, tipo: 'boleto', selo: 'pendente', rotulo: 'Pendente' },
  { insc: '553120', nome: 'Roberto Nunes', venc: '25/10/2026', valor: 780.4, tipo: 'boleto', selo: 'pago', rotulo: 'Pago' },
  { insc: '771045', nome: 'Patrícia Gomes', venc: '28/10/2026', valor: 1222.68, tipo: 'boleto', selo: 'pendente', rotulo: 'Pendente' },
];

const COL = { insc: 312, nome: 432, venc: 690, valor: 832, tipo: 1010, status: 1180, acoes: 1340 };
const Y_LINHA = (i: number) => 270 + i * 64;

/** Um valor que troca rolando: o velho sobe e some, o novo sobe e entra. */
const Troca: React.FC<{ em: number; antes: React.ReactNode; depois: React.ReactNode }> = ({ em, antes, depois }) => {
  const f = useCurrentFrame();
  const p = entre(f, em, em + ms(380), 0, 1);
  if (p <= 0) return <>{antes}</>;
  if (p >= 1) return <>{depois}</>;
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span style={{ display: 'inline-block', opacity: 1 - p, transform: `translateY(${-p * 14}px)`, filter: `blur(${p * 3}px)` }}>{antes}</span>
      <span style={{ position: 'absolute', left: 0, top: 0, display: 'inline-block', opacity: p, transform: `translateY(${(1 - p) * 14}px)`, filter: `blur(${(1 - p) * 3}px)`, whiteSpace: 'nowrap' }}>{depois}</span>
    </span>
  );
};

export const Acordos: React.FC<{ t: TempoApp; entra: number; sai: number }> = ({ t, entra, sai }) => {
  const f = useCurrentFrame();
  if (f < entra || f >= sai + ms(300)) return null;
  const c = t.clique;
  const e = (i: number) => entrada(f, entra, i, { passoMs: 40 });

  const pop = mola(f, c.reagendar + ms(60));
  const popAberto = f >= c.reagendar + ms(60) && f < c.dia + ms(240);
  const popFecha = entre(f, c.dia + ms(120), c.dia + ms(260), 1, 0);
  const reagendado = c.dia + ms(200);
  const novaLinha = Math.max(0, 1 - (f - entra) / ms(1600));

  return (
    <div style={{ position: 'absolute', inset: 0, ...(f >= sai ? saida(f, sai) : {}) }}>
      <Card style={{ position: 'absolute', left: CONTEUDO.x, top: 138, width: CONTEUDO.l, height: 736, ...e(0) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: COR.texto }}>Meus acordos</div>
          <Selo tipo="boleto">outubro · 42</Selo>
          <div style={{ marginLeft: 'auto', width: 300, height: 38, borderRadius: 10, border: `1px solid ${COR.borda}`, background: '#0a131c', color: COR.textoFraco, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 14 }}>Buscar por nome ou inscrição…</div>
        </div>
      </Card>

      {/* cabeçalho da tabela */}
      <div style={{ position: 'absolute', left: CONTEUDO.x, top: 226, width: CONTEUDO.l, height: 44, borderTop: `1px solid ${COR.borda}`, borderBottom: `1px solid ${COR.borda}`, ...e(1) }}>
        {[
          ['INSCRIÇÃO', COL.insc],
          ['CLIENTE', COL.nome],
          ['VENCIMENTO', COL.venc],
          ['VALOR', COL.valor],
          ['TIPO', COL.tipo],
          ['STATUS', COL.status],
          ['AÇÕES', COL.acoes + 120],
        ].map(([r, x]) => (
          <div key={r as string} style={{ position: 'absolute', left: (x as number) - CONTEUDO.x, top: 13, fontSize: 13, fontWeight: 700, color: COR.textoSuave, letterSpacing: 0.6, width: r === 'VALOR' ? 140 : undefined, textAlign: r === 'VALOR' ? 'right' : 'left' }}>
            {r}
          </div>
        ))}
      </div>

      {LINHAS.map((l, i) => {
        const y = Y_LINHA(i);
        const viraPago = i === 1;
        const eReagendada = i === 3;
        return (
          <div key={l.insc} style={{ position: 'absolute', left: CONTEUDO.x, top: y, width: CONTEUDO.l, height: 64, borderBottom: `1px solid ${COR.borda}`, background: i === 0 ? `rgba(92,200,245,${0.12 * novaLinha})` : undefined, ...e(2 + i) }}>
            <div style={{ position: 'absolute', left: COL.insc - CONTEUDO.x, top: 21, fontFamily: FONTE_MONO, fontSize: 16, fontWeight: 600, color: COR.texto }}>{l.insc}</div>
            <div style={{ position: 'absolute', left: COL.nome - CONTEUDO.x, top: 21, fontSize: 16, color: COR.texto }}>{l.nome}</div>
            <div style={{ position: 'absolute', left: COL.venc - CONTEUDO.x, top: 21, fontFamily: FONTE_MONO, fontSize: 15, color: COR.texto }}>
              {eReagendada ? <Troca em={reagendado} antes={l.venc} depois={<span style={{ color: COR.azulClaro }}>27/10/2026</span>} /> : l.venc}
            </div>
            <Numero style={{ position: 'absolute', left: COL.valor - CONTEUDO.x, top: 21, width: 140, textAlign: 'right', fontSize: 16, color: COR.texto }}>{brl(l.valor)}</Numero>
            <div style={{ position: 'absolute', left: COL.tipo - CONTEUDO.x, top: 17 }}>
              <Selo tipo={l.tipo}>{l.tipo === 'boleto' ? 'Boleto / PIX' : 'Cartão de Crédito'}</Selo>
            </div>
            <div style={{ position: 'absolute', left: COL.status - CONTEUDO.x, top: 17 }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                {viraPago ? (
                  <Troca em={c.pago} antes={<Selo tipo="pendente">Pendente</Selo>} depois={<Selo tipo="pago">✓ Pago</Selo>} />
                ) : eReagendada ? (
                  <Troca em={reagendado} antes={<Selo tipo="naoPago">Não pago</Selo>} depois={<Selo tipo="pendente">Reagendado</Selo>} />
                ) : (
                  <Selo tipo={l.selo}>{l.rotulo}</Selo>
                )}
                {viraPago && <Destaque ativo={Math.min(entre(f, c.pago, c.pago + ms(200), 0, 1), entre(f, t.pendente, t.pendente + ms(250), 1, 0))} raio={999} />}
                {i === 0 && <Destaque ativo={Math.min(entre(f, t.pendente, t.pendente + ms(200), 0, 1), entre(f, c.reagendar - ms(300), c.reagendar, 1, 0))} raio={999} style={{ borderColor: 'rgba(245,165,36,0.9)', boxShadow: '0 0 22px rgba(245,165,36,0.45)' }} />}
              </div>
            </div>
            {/* ações */}
            <div style={{ position: 'absolute', left: COL.acoes - CONTEUDO.x, top: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 104,
                  height: 36,
                  borderRadius: 8,
                  border: `1px solid ${eReagendada ? 'rgba(74,222,128,0.6)' : 'transparent'}`,
                  color: COR.verdeClaro,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  fontWeight: 600,
                  opacity: eReagendada ? 1 : 0,
                  background: eReagendada && popAberto ? 'rgba(34,197,94,0.15)' : undefined,
                  transform: eReagendada ? `scale(${aperto(f, c.reagendar)})` : undefined,
                }}
              >
                Reagendar
              </div>
              <Icone nome="editar" tamanho={19} cor={COR.textoSuave} />
              <Icone nome="lixo" tamanho={19} cor="#e5484d" />
            </div>
          </div>
        );
      })}

      {/* calendário do reagendamento */}
      {popAberto && (
        <div
          style={{
            position: 'absolute',
            left: 1225,
            top: 520,
            width: 302,
            borderRadius: 14,
            background: COR.cardElevado,
            border: `1px solid ${COR.bordaForte}`,
            boxShadow: '0 30px 70px rgba(0,0,0,0.6)',
            padding: '14px 18px 16px',
            boxSizing: 'border-box',
            transformOrigin: '180px 0',
            transform: `scale(${0.9 + 0.1 * pop})`,
            opacity: Math.min(1, pop * 1.5) * popFecha,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: COR.texto }}>Reagendar para</div>
          <div style={{ position: 'relative', height: 186, marginTop: 10 }}>
            {Array.from({ length: 31 }).map((_, k) => {
              const dia = k + 1;
              const pos = dia + 3; // 1º de outubro de 2026 é quinta
              const col = pos % 7;
              const lin = Math.floor(pos / 7);
              const eNovo = dia === 27;
              const escolhido = eNovo && f >= c.dia;
              return (
                <div
                  key={dia}
                  style={{
                    position: 'absolute',
                    left: col * 38,
                    top: lin * 34 + 6 - 34 * 0,
                    width: 34,
                    height: 30,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: FONTE_MONO,
                    fontSize: 13,
                    color: escolhido ? '#05090f' : dia < 20 ? COR.textoFraco : COR.texto,
                    background: escolhido ? GRADIENTE_MARCA : undefined,
                    transform: eNovo ? `scale(${aperto(f, c.dia)})` : undefined,
                    fontWeight: escolhido ? 700 : 500,
                  }}
                >
                  {dia}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
