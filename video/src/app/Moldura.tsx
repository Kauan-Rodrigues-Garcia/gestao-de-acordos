// A casca do app: barra do navegador, menu lateral e cabeçalho.
// O destaque do item ativo DESLIZA entre os itens (não pisca de um pro outro).

import { Img, useCurrentFrame } from 'remotion';
import { Icone } from '../componentes/Icone';
import { logoSrc } from '../componentes/Poeira';
import { aperto, entrada, entre, mola, ms } from '../movimento';
import { COR, FONTE, FONTE_MONO, GRADIENTE_MARCA } from '../tema';
import { APP_A, APP_L, BARRA, CABECALHO, CHAT, MENU, MENU_PASSO, MENU_Y0, SIDEBAR, SINO, type IdMenu } from './layout';
import { Avatar } from './ui';

type Props = {
  /** Quando a casca começa a aparecer (coreografia escalonada). */
  aparece: number;
  ativo: IdMenu;
  /** Frame da última troca de item ativo e o item anterior (para o destaque deslizar). */
  trocaEm: number;
  anterior: IdMenu;
  cliquesMenu: { id: IdMenu; f: number }[];
  titulo: string;
  tituloDesde: number;
  /** 0–1 da meta do dia (pílula do cabeçalho). */
  meta: number;
  metaBrilho: number;
  avisoChat: number;
  chatLidoEm: number;
  children: React.ReactNode;
};

const TITULOS: Record<IdMenu, string> = {
  inicio: 'Início',
  desempenho: 'Desempenho do Dia',
  dashboard: 'Dashboard',
  acordos: 'Acordos',
  novo: 'Novo Acordo',
  campanhas: 'Campanhas de WhatsApp',
  calendario: 'Calendário',
  tickets: 'Tickets',
};
export const tituloDe = (id: IdMenu) => TITULOS[id];

export const Moldura: React.FC<Props> = ({ aparece, ativo, trocaEm, anterior, cliquesMenu, titulo, tituloDesde, meta, metaBrilho, avisoChat, chatLidoEm, children }) => {
  const f = useCurrentFrame();
  const iAtivo = MENU.findIndex((m) => m.id === ativo);
  const iAnterior = MENU.findIndex((m) => m.id === anterior);
  const desliza = mola(f, trocaEm);
  const yDestaque = MENU_Y0 + (iAnterior + (iAtivo - iAnterior) * desliza) * MENU_PASSO;

  const badge = mola(f, avisoChat);
  const badgeVisivel = f >= avisoChat && f < chatLidoEm;

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: APP_L, height: APP_A, background: COR.app, overflow: 'hidden', fontFamily: FONTE }}>
      {/* ── barra do navegador ── */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: APP_L, height: BARRA, background: '#070d14', borderBottom: `1px solid ${COR.borda}`, display: 'flex', alignItems: 'center', ...entrada(f, aparece, 0) }}>
        <div style={{ display: 'flex', gap: 8, marginLeft: 18 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
            <div key={c} style={{ width: 13, height: 13, borderRadius: '50%', background: c }} />
          ))}
        </div>
        <div style={{ marginLeft: 'auto', marginRight: 'auto', transform: 'translateX(-40px)', width: 520, height: 30, borderRadius: 8, background: '#0f1a24', border: `1px solid ${COR.borda}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: COR.textoSuave, fontSize: 14 }}>
          <Icone nome="cadeado" tamanho={13} cor={COR.textoSuave} />
          app.gestaodeacordos.com.br
        </div>
      </div>

      {/* ── menu lateral ── */}
      <div style={{ position: 'absolute', left: 0, top: BARRA, width: SIDEBAR, height: APP_A - BARRA, background: COR.sidebar, borderRight: `1px solid ${COR.borda}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '20px 18px', ...entrada(f, aparece, 1) }}>
          <Img src={logoSrc('app-512.png')} style={{ width: 38, height: 38, borderRadius: 10 }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: COR.texto, lineHeight: 1.1 }}>Gestão de</div>
            <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.1, background: GRADIENTE_MARCA, WebkitBackgroundClip: 'text', color: 'transparent' }}>Acordos</div>
          </div>
        </div>
      </div>
      {/* destaque deslizante do item ativo */}
      <div
        style={{
          position: 'absolute',
          left: 12,
          top: yDestaque,
          width: SIDEBAR - 24,
          height: 40,
          borderRadius: 10,
          background: 'rgba(41,168,224,0.14)',
          border: '1px solid rgba(92,200,245,0.28)',
          opacity: entre(f, aparece + ms(300), aparece + ms(700), 0, 1),
        }}
      >
        <div style={{ position: 'absolute', left: -12, top: 9, width: 4, height: 22, borderRadius: 2, background: GRADIENTE_MARCA }} />
      </div>
      {MENU.map((m, i) => {
        const cl = cliquesMenu.filter((c) => c.id === m.id).map((c) => aperto(f, c.f));
        const escala = cl.length ? Math.min(...cl) : 1;
        const eAtivo = m.id === ativo;
        return (
          <div
            key={m.id}
            style={{
              position: 'absolute',
              left: 12,
              top: MENU_Y0 + i * MENU_PASSO,
              width: SIDEBAR - 24,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              paddingLeft: 14,
              boxSizing: 'border-box',
              fontSize: 15,
              fontWeight: eAtivo ? 600 : 500,
              color: eAtivo ? COR.texto : COR.textoSuave,
              transform: `scale(${escala})`,
              ...entrada(f, aparece, 2 + i),
            }}
          >
            <Icone nome={m.icone} tamanho={18} cor={eAtivo ? COR.azulClaro : COR.textoSuave} />
            {m.rotulo}
          </div>
        );
      })}
      {/* usuário */}
      <div style={{ position: 'absolute', left: 14, bottom: 16, width: SIDEBAR - 28, padding: 12, boxSizing: 'border-box', borderRadius: 12, background: COR.card, border: `1px solid ${COR.borda}`, display: 'flex', alignItems: 'center', gap: 10, ...entrada(f, aparece, 11) }}>
        <Avatar nome="Juliana Prado" tamanho={36} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: COR.texto }}>Juliana Prado</div>
          <div style={{ fontSize: 12, color: COR.textoSuave }}>Operadora · Equipe Águia</div>
        </div>
      </div>

      {/* ── cabeçalho ── */}
      <div style={{ position: 'absolute', left: SIDEBAR, top: BARRA, width: APP_L - SIDEBAR, height: CABECALHO, borderBottom: `1px solid ${COR.borda}`, ...entrada(f, aparece, 3) }}>
        <div key={titulo} style={{ position: 'absolute', left: 32, top: 0, height: CABECALHO, display: 'flex', alignItems: 'center', fontSize: 22, fontWeight: 700, color: COR.texto, ...entrada(f, tituloDesde, 0, { deslocY: 10, duracaoMs: 380 }) }}>
          {titulo}
        </div>
        {/* pílula da meta do dia */}
        <div style={{ position: 'absolute', left: 1060 - SIDEBAR, top: 16, width: 260, height: 34, borderRadius: 999, background: COR.card, border: `1px solid ${metaBrilho > 0 ? `rgba(74,222,128,${0.4 + 0.6 * metaBrilho})` : COR.borda}`, boxShadow: metaBrilho > 0 ? `0 0 ${30 * metaBrilho}px rgba(74,222,128,${0.5 * metaBrilho})` : undefined, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', boxSizing: 'border-box' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: COR.textoSuave, whiteSpace: 'nowrap' }}>Meta do dia</span>
          <div style={{ flex: 1, height: 7, borderRadius: 4, background: '#1b2a38', overflow: 'hidden' }}>
            <div style={{ width: `${meta * 100}%`, height: '100%', borderRadius: 4, background: GRADIENTE_MARCA }} />
          </div>
          <span style={{ fontFamily: FONTE_MONO, fontSize: 13, fontWeight: 600, color: meta >= 1 ? COR.verdeClaro : COR.texto, width: 42, textAlign: 'right' }}>{Math.round(meta * 100)}%</span>
        </div>
        {[
          { nome: 'sino', p: SINO, badge: 0 },
          { nome: 'chat', p: CHAT, badge: badgeVisivel ? 1 : 0 },
        ].map((b) => (
          <div key={b.nome} style={{ position: 'absolute', left: b.p.x - SIDEBAR - 18, top: b.p.y - BARRA - 18, width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COR.textoSuave }}>
            <Icone nome={b.nome} tamanho={20} />
            {b.badge > 0 && (
              <div style={{ position: 'absolute', right: -2, top: -2, width: 18, height: 18, borderRadius: 9, background: COR.rosa, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${badge})`, boxShadow: '0 0 0 2px #0b131b' }}>
                1
              </div>
            )}
          </div>
        ))}
        <Avatar nome="Juliana Prado" tamanho={34} style={{ position: 'absolute', right: 28, top: 16 }} />
      </div>

      {children}
    </div>
  );
};
