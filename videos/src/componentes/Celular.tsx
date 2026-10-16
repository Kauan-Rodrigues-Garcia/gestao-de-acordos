// O celular da cena 11: o app do celular (`/m`) com o CSS de verdade
// (src/estilo/mobile.css e mobile-comum.css, copiados do app) e o aviso
// «Pagamento recebido» descendo do topo, como o push do app.

import { Bell } from 'lucide-react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { DIA, OPERADORA, RECORTES } from '../app/dados';
import { formatBRL } from '../app/ui';
import { entrada, entre, mola, ms, SUAVE } from '../movimento';

export const CEL_L = 392;
export const CEL_A = 812;

const PAGAMENTOS = [
  { cliente: 'Marcos Oliveira', nr: '12748301', quando: 'Hoje', valor: 189.9, forma: 'Boleto', cor: '#38bdf8', novo: true },
  { cliente: 'Fernanda Lima', nr: '12690457', quando: 'Hoje', valor: 312.4, forma: 'Pix', cor: '#4ade5a' },
  { cliente: 'Patrícia Gomes', nr: '12659203', quando: 'Hoje', valor: 228.75, forma: 'Boleto', cor: '#38bdf8' },
  { cliente: 'Ricardo Souza', nr: '12711962', quando: 'Hoje', valor: 145, forma: 'Cartão', cor: '#f59e0b' },
];

const Dinheiro: React.FC<{ valor: number }> = ({ valor }) => {
  const [inteiro, centavos] = valor.toFixed(2).split('.');
  return (
    <>
      <small>R$</small>
      {Number(inteiro).toLocaleString('pt-BR')},{centavos}
    </>
  );
};

export const Celular: React.FC<{ aparece: number; aviso: number }> = ({ aparece, aviso }) => {
  const f = useCurrentFrame();
  const push = mola(f, aviso, { mass: 1, stiffness: 170, damping: 19, overshootClamping: false });
  const e = (i: number) => entrada(f, aparece + ms(200), i, { passoMs: 55 });
  const ind = RECORTES.individual;
  const recebido = ind.recebido + 189.9 * entre(f, aviso + ms(300), aviso + ms(1000), 0, 1, SUAVE);
  const pct = Math.round((recebido / ind.meta) * 100);
  const cheio = (recebido / ind.meta) * 100 * entre(f, aparece + ms(300), aparece + ms(1300), 0, 1, SUAVE);

  return (
    <div style={{ width: CEL_L, height: CEL_A, borderRadius: 62, background: '#0d1117', padding: 12, boxSizing: 'border-box', boxShadow: '0 50px 100px rgba(15,27,38,0.28), 0 12px 30px rgba(15,27,38,0.18), inset 0 0 0 2px #2b323b' }}>
      <div className="tela-mobile" style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 50, overflow: 'hidden', minHeight: 0, paddingBottom: 0 }}>
        {/* fundo vivo */}
        <div className="v-fundo" style={{ position: 'absolute' }}>
          <div className="v-mancha v-m1" />
          <div className="v-mancha v-m2" />
          <div className="v-mancha v-m3" />
        </div>
        {/* barra de status e a ilha */}
        <div style={{ position: 'absolute', left: '50%', top: 11, width: 110, height: 32, borderRadius: 16, background: '#000', transform: 'translateX(-50%)', zIndex: 5 }} />
        <div style={{ position: 'absolute', left: 32, top: 17, fontSize: 15, fontWeight: 700, zIndex: 5, fontFamily: 'Figtree' }}>15:43</div>

        <div className="m-conteudo" style={{ paddingTop: 34 }}>
          <header className="m-topo" style={e(0)}>
            <Img className="v-logo" src={staticFile('marca/app-512.png')} />
            <div className="m-quem">
              <div className="m-nome">{OPERADORA.nome}</div>
              <div className="m-sub">{OPERADORA.marca} · outubro de 2026</div>
            </div>
            <div className="m-sino"><Bell size={18} /><i /></div>
          </header>

          <section className="v-cartao" style={e(1)}>
            <div className="v-rotulo">Recebido no mês</div>
            <div className="v-valor"><Dinheiro valor={recebido} /></div>
            <div className="v-linha">
              <span>de <b>{formatBRL(ind.meta)}</b> · sua meta</span>
              <span className="v-pct">{pct}%</span>
            </div>
            <div className="v-barra">
              <div className="v-trilho">
                <div className="v-cheio" style={{ width: `${cheio}%` }} />
                <div className="v-esperado" style={{ left: `${(ind.esperado / ind.meta) * 100}%` }} />
              </div>
            </div>
          </section>

          <div className="m-dupla" style={e(2)}>
            <section className="m-cartao">
              <div className="m-rot">Recebido hoje</div>
              <div className="m-v m-num"><span className="v-num"><Dinheiro valor={DIA.recebidoDepois + 189.9 * entre(f, aviso + ms(300), aviso + ms(1000), 0, 1, SUAVE)} /></span></div>
              <div className="m-d">{f >= aviso + ms(300) ? 7 : 6} pagamentos</div>
            </section>
            <section className="m-cartao">
              <div className="m-rot">Ranking</div>
              <div className="m-v m-num">3º <span className="m-de">de 14</span></div>
              <div className="m-d">R$ 412,80 do 2º</div>
            </section>
          </div>

          <div className="m-titulo" style={e(3)}>
            <h2>Últimos pagamentos</h2>
            <button type="button">Ver todos</button>
          </div>
          <section className="m-lista" style={e(4)}>
            {PAGAMENTOS.map((p) => (
              <div key={p.nr} className={p.novo && f >= aviso + ms(300) ? 'm-pg m-novo' : 'm-pg'}>
                <div className="m-pg-q">
                  <div className="m-pg-c">{p.cliente}</div>
                  <div className="m-pg-h">
                    NR <b className="m-nr">{p.nr}</b> · {p.quando}
                    {p.novo && f >= aviso + ms(300) && <> · <b className="m-novo-tag">novo</b></>}
                  </div>
                </div>
                <div className="m-pg-dir">
                  <span className="m-num m-pg-v">{formatBRL(p.valor)}</span>
                  <span className="m-pg-f"><i style={{ background: p.cor }} />{p.forma}</span>
                </div>
              </div>
            ))}
          </section>
        </div>

        {/* o aviso do celular */}
        <div
          style={{
            position: 'absolute',
            left: 10,
            right: 10,
            top: 52,
            borderRadius: 22,
            padding: '12px 14px',
            background: 'rgba(250,250,252,0.86)',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 16px 36px rgba(15,27,38,0.18)',
            display: 'flex',
            gap: 11,
            transform: `translateY(${(1 - push) * -150}px)`,
            opacity: f >= aviso ? 1 : 0,
            zIndex: 6,
            fontFamily: 'Figtree, sans-serif',
            color: '#0e1b26',
          }}
        >
          <Img src={staticFile('marca/app-512.png')} style={{ width: 38, height: 38, borderRadius: 9 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#6a7784' }}>
              <span style={{ fontWeight: 600, letterSpacing: 0.3 }}>GESTÃO DE ACORDOS</span>
              <span>agora</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>Pagamento recebido</div>
            <div style={{ fontSize: 14, color: '#3d4a56', marginTop: 1 }}>Marcos Oliveira · R$ 189,90 · Boleto</div>
          </div>
        </div>
      </div>
    </div>
  );
};
