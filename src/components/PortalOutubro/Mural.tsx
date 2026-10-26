/**
 * Mural.tsx — o que o portal mostra: outubro no Gestão, em atos.
 *
 *   0  Outubro no Gestão — as cinco medalhas e os números do mês
 *   1–5  uma gincana por quadro, com o desenho dela e a medalha
 *   6  o ranking das medalhas (top 10), revelado do 10º para o 1º
 *   7  as Lendas: o pódio das três com as cinco insígnias
 *   8  o prêmio das Lendas: as três clicam, ele aparece, a roleta sorteia
 *   9  o sorteio da garrafa
 *  10  Feliz Halloween
 *
 * Passa sozinho (cada ato tem o seu tempo, dividido pela velocidade); os
 * atos de sorteio esperam a roleta. Embaixo: voltar, pausar, avançar, a
 * velocidade, os pontinhos de cada ato e fechar (Esc também fecha).
 *
 * Tudo vem de `dados.ts` (congelado): o mural não lê o banco.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react';
import { INSIGNIAS, type Conquista, type IdInsignia } from '@/components/Insignias/insignias';
import { Medalha, MedalhaMisteriosa } from '@/components/Insignias/Medalha';
import '@/components/Insignias/insignias.css';
import {
  DATA_DO_RETRATO, GARRAFA, GINCANAS, GOLPE_FINAL, LENDAS, PESSOAL, PREMIO_DAS_LENDAS, REGRA_DA_GARRAFA, TOP10, bilhetes, type Pessoa,
} from './dados';
import {
  VELOCIDADES_DO_MURAL, clicarLenda, fecharTela, mudarVelocidadeDoMural, useCliquesDasLendas, useVelocidadeDoMural,
} from './estado';
import { ArteDaGincana, ArteGarrafa } from './Artes';
import { Confete, Roleta } from './Roleta';
import { sortearComPeso } from './sorteio';
import { PortalGirando } from './PortalGirando';

/** O que a medalha lê: só o desenho (o primeiro zumbi e a primeira bruxa). */
const CONQUISTA: Conquista = {
  vezes: 1, primeiraEm: '', ultimaEm: '', desenho: 0, headshots: 0, melhorMs: null, golpeFinal: false, maiorDano: 0,
};
const FITA = Object.fromEntries(INSIGNIAS.map(i => [i.id, i.fita])) as Record<IdInsignia, string>;

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}

function Varal({ tam }: { tam: number }) {
  return (
    <div className="portal-varal" style={{ ['--tam-medalha' as string]: `${tam}px` } as CSSProperties}>
      {INSIGNIAS.map(ins => <Medalha key={ins.id} insignia={ins} conquista={CONQUISTA} tam={tam} pendurada />)}
    </div>
  );
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// ── Os atos ─────────────────────────────────────────────────────────────────

function AtoIntro() {
  return (
    <div className="portal-ato portal-ato-intro">
      <PortalGirando className="portal-intro-anel" />
      <p className="portal-selo">Outubro de 2026</p>
      <h1 className="portal-titulo">Outubro no Gestão</h1>
      <Varal tam={76} />
      <div className="portal-numeros">
        <div><strong>5</strong><span>gincanas</span></div>
        <div><strong>{PESSOAL.length}</strong><span>pessoas com insígnia</span></div>
        <div><strong>{LENDAS.length}</strong><span>com o álbum completo</span></div>
      </div>
    </div>
  );
}

function AtoGincana({ id }: { id: IdInsignia }) {
  const g = GINCANAS.find(x => x.id === id)!;
  const ins = INSIGNIAS.find(i => i.id === id)!;
  return (
    <div className="portal-ato portal-ato-gincana" style={{ ['--fita' as string]: FITA[id] } as CSSProperties}>
      <div className="portal-quadro">
        <div className="portal-quadro-arte"><ArteDaGincana id={id} /></div>
      </div>
      <div className="portal-gincana-texto">
        <Medalha insignia={ins} conquista={CONQUISTA} tam={88} />
        <p className="portal-selo">{ins.nome}</p>
        <h2 className="portal-titulo portal-titulo-medio">{g.titulo}</h2>
        <p className="portal-frase">{g.frase}</p>
        {g.fatos.length > 0 && (
          <ul className="portal-fatos">{g.fatos.map(f => <li key={f}>{f}</li>)}</ul>
        )}
      </div>
    </div>
  );
}

function Bolinhas({ n }: { n: number }) {
  return (
    <span className="portal-bolinhas" aria-label={`${n} de 5 insígnias`}>
      {INSIGNIAS.map((ins, i) => <span key={ins.id} className={i < n ? 'portal-bolinha-tem' : ''} />)}
    </span>
  );
}

function AtoRanking() {
  return (
    <div className="portal-ato portal-ato-ranking">
      <p className="portal-selo">Ranking das medalhas</p>
      <h2 className="portal-titulo portal-titulo-medio">Top 10 de outubro</h2>
      <ol className="portal-ranking">
        {TOP10.map((p, i) => (
          <li
            key={p.nome}
            className={`portal-ranking-linha${p.posicao <= 3 ? ` portal-lugar-${p.posicao}` : ''}`}
            style={{ animationDelay: `calc(${(TOP10.length - 1 - i) * 420}ms / var(--v))` }}
          >
            <span className="portal-ranking-pos">{p.posicao}</span>
            <span className="portal-avatar">{iniciais(p.nome)}</span>
            <span className="portal-ranking-quem">
              <span className="portal-ranking-nome">{p.nome}</span>
              <span className="portal-ranking-setor">{p.setor ?? 'sem setor'}{GOLPE_FINAL.has(p.nome) && <em> · golpe final</em>}</span>
            </span>
            <Bolinhas n={p.insignias} />
            <span className="portal-ranking-pts">{p.pontos}</span>
          </li>
        ))}
      </ol>
      <p className="portal-rodape-ato">Pontos: 100 por insígnia, 5 por zumbi ou bruxa, 10 por tiro na cabeça, 20 por chefe derrubado, 50 por golpe final · retrato de {DATA_DO_RETRATO}</p>
    </div>
  );
}

function CardDaLenda({ p, children, atraso }: { p: Pessoa; children?: ReactNode; atraso: number }) {
  return (
    <div className={`portal-lenda portal-lugar-${p.posicao}`} style={{ animationDelay: `calc(${atraso}ms / var(--v))` }}>
      <span className="portal-avatar portal-avatar-grande">{iniciais(p.nome)}</span>
      <p className="portal-lenda-nome">{p.nome}</p>
      <p className="portal-lenda-setor">{p.setor}{GOLPE_FINAL.has(p.nome) && <em> · golpe final</em>}</p>
      {children}
    </div>
  );
}

function AtoLendas() {
  const ordem = [2, 1, 3];
  const atraso: Record<number, number> = { 3: 400, 2: 1600, 1: 2800 };
  return (
    <div className="portal-ato portal-ato-lendas">
      <p className="portal-selo">Álbum completo · 5 de 5</p>
      <h2 className="portal-titulo portal-titulo-medio">As Lendas de Outubro</h2>
      <div className="portal-podio">
        {ordem.map(pos => {
          const p = LENDAS.find(l => l.posicao === pos)!;
          return (
            <div key={pos} className={`portal-podio-coluna portal-lugar-${pos}`}>
              <CardDaLenda p={p} atraso={atraso[pos]} />
              <div className="portal-pedestal" style={{ animationDelay: `calc(${atraso[pos]}ms / var(--v))` }}>
                <Varal tam={pos === 1 ? 56 : 48} />
                <p className="portal-pedestal-num">{pos}</p>
                <p className="portal-pedestal-pts">{p.pontos} PTS</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AtoPremio({ v }: { v: number }) {
  const cliques = useCliquesDasLendas();
  const todas = LENDAS.every(l => cliques.has(l.posicao));
  const [girando, setGirando] = useState(false);
  const [ganhou, setGanhou] = useState<number | null>(null);
  const ganhador = useMemo(() => sortearComPeso(LENDAS, () => 1), []);
  return (
    <div className="portal-ato portal-ato-premio">
      <p className="portal-selo">Só para as Lendas</p>
      <h2 className="portal-titulo portal-titulo-medio">{PREMIO_DAS_LENDAS.titulo}</h2>
      {!todas && (
        <>
          <p className="portal-frase">Quando as três clicarem, o prêmio aparece.</p>
          <div className="portal-premio-cards">
            {LENDAS.map(p => (
              <button
                key={p.posicao}
                type="button"
                className={`portal-premio-card portal-lugar-${p.posicao}${cliques.has(p.posicao) ? ' portal-premio-liberou' : ''}`}
                onClick={() => clicarLenda(p.posicao)}
                disabled={cliques.has(p.posicao)}
              >
                <span className="portal-avatar">{iniciais(p.nome)}</span>
                <span className="portal-premio-nome">{p.nome}</span>
                <span className="portal-premio-acao">{cliques.has(p.posicao) ? 'Liberou' : 'Clique para liberar'}</span>
              </button>
            ))}
          </div>
          <p className="portal-rodape-ato">{plural(LENDAS.length - cliques.size, 'falta', 'faltam')} · teste: aqui qualquer um clica pelas três; no dia, cada uma clica na própria tela</p>
        </>
      )}
      {todas && !girando && (
        <div className="portal-premio-revelado">
          <MedalhaMisteriosa tam={120} />
          <p className="portal-premio-titulo">{PREMIO_DAS_LENDAS.descricao}</p>
          <button type="button" className="portal-botao" onClick={() => setGirando(true)}>Girar a roleta</button>
        </div>
      )}
      {todas && girando && (
        <div className="portal-sorteio">
          <Roleta itens={LENDAS} ganhador={ganhador} duracaoMs={5000 / v} aoParar={() => setGanhou(ganhador)} />
          {ganhou != null && <Vencedor p={LENDAS[ganhou]} premio={PREMIO_DAS_LENDAS.titulo} />}
        </div>
      )}
    </div>
  );
}

function Vencedor({ p, premio }: { p: Pessoa; premio: string }) {
  return (
    <div className="portal-vencedor">
      <Confete semente={p.posicao} />
      <p className="portal-selo">Quem levou</p>
      <p className="portal-vencedor-nome">{p.nome}</p>
      <p className="portal-vencedor-premio">{p.setor ?? 'sem setor'} · {premio}</p>
    </div>
  );
}

function AtoGarrafa({ v }: { v: number }) {
  const [girando, setGirando] = useState(false);
  const [ganhou, setGanhou] = useState<number | null>(null);
  const ganhador = useMemo(() => sortearComPeso(PESSOAL, bilhetes), []);
  const total = PESSOAL.reduce((s, p) => s + bilhetes(p), 0);
  return (
    <div className="portal-ato portal-ato-garrafa">
      <p className="portal-selo">Sorteio</p>
      <h2 className="portal-titulo portal-titulo-medio">{GARRAFA.titulo}</h2>
      {!girando ? (
        <div className="portal-garrafa">
          <ArteGarrafa />
          <div>
            <p className="portal-frase">{GARRAFA.descricao}</p>
            <p className="portal-garrafa-regra">
              {plural(PESSOAL.length, 'pessoa concorre', 'pessoas concorrem')} · {plural(total, 'bilhete', 'bilhetes')}
              {REGRA_DA_GARRAFA === 'bilhete-por-insignia' ? ' (1 por insígnia)' : ''}
            </p>
            <button type="button" className="portal-botao" onClick={() => setGirando(true)}>Girar a roleta</button>
          </div>
        </div>
      ) : (
        <div className="portal-sorteio">
          <Roleta itens={PESSOAL} ganhador={ganhador} duracaoMs={7000 / v} aoParar={() => setGanhou(ganhador)} />
          {ganhou != null && <Vencedor p={PESSOAL[ganhou]} premio={GARRAFA.titulo} />}
        </div>
      )}
      <p className="portal-rodape-ato">Sorteio de teste, no navegador. No dia o resultado vem de um lugar só, e todo mundo vê o mesmo.</p>
    </div>
  );
}

function AtoFim() {
  return (
    <div className="portal-ato portal-ato-fim">
      <PortalGirando className="portal-intro-anel" />
      <h1 className="portal-titulo portal-titulo-gigante">Feliz Halloween!</h1>
      <p className="portal-frase">Obrigado por fazer outubro acontecer.</p>
      <button type="button" className="portal-botao" onClick={fecharTela}>Voltar ao Gestão</button>
    </div>
  );
}

// ── O mural ─────────────────────────────────────────────────────────────────

interface Ato { id: string; nome: string; duracaoMs: number | null }

const ATOS: readonly Ato[] = [
  { id: 'intro', nome: 'Outubro', duracaoMs: 7000 },
  ...GINCANAS.map(g => ({ id: g.id, nome: g.titulo, duracaoMs: 8000 })),
  { id: 'ranking', nome: 'Top 10', duracaoMs: 11000 },
  { id: 'lendas', nome: 'Lendas', duracaoMs: 11000 },
  { id: 'premio', nome: 'Prêmio das Lendas', duracaoMs: null },
  { id: 'garrafa', nome: 'Garrafa', duracaoMs: null },
  { id: 'fim', nome: 'Fim', duracaoMs: null },
];

export function Mural({ atoInicial = 0, leve = false }: { atoInicial?: number; leve?: boolean }) {
  const v = useVelocidadeDoMural();
  const [ato, setAto] = useState(Math.min(atoInicial, ATOS.length - 1));
  const [tocando, setTocando] = useState(true);
  const atual = ATOS[ato];

  useEffect(() => {
    if (!tocando || atual.duracaoMs == null || ato >= ATOS.length - 1) return;
    const t = window.setTimeout(() => setAto(a => a + 1), atual.duracaoMs / v);
    return () => window.clearTimeout(t);
  }, [ato, tocando, v, atual.duracaoMs]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fecharTela();
      else if (e.key === 'ArrowRight') setAto(a => Math.min(ATOS.length - 1, a + 1));
      else if (e.key === 'ArrowLeft') setAto(a => Math.max(0, a - 1));
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  let conteudo: ReactNode;
  if (atual.id === 'intro') conteudo = <AtoIntro />;
  else if (atual.id === 'ranking') conteudo = <AtoRanking />;
  else if (atual.id === 'lendas') conteudo = <AtoLendas />;
  else if (atual.id === 'premio') conteudo = <AtoPremio v={v} />;
  else if (atual.id === 'garrafa') conteudo = <AtoGarrafa v={v} />;
  else if (atual.id === 'fim') conteudo = <AtoFim />;
  else conteudo = <AtoGincana id={atual.id as IdInsignia} />;

  return (
    <div className={`portal-mural portal-noite${leve ? ' portal-leve' : ''}`} style={{ ['--v' as string]: v } as CSSProperties} role="dialog" aria-label="Mural de outubro">
      <div className="portal-bandeirinhas" aria-hidden />
      {/* `key`: cada ato entra do começo (as animações recomeçam). */}
      <div key={atual.id} className="portal-palco">{conteudo}</div>

      <div className="portal-controles">
        <button type="button" onClick={() => setAto(a => Math.max(0, a - 1))} disabled={ato === 0} aria-label="Ato anterior"><ChevronLeft /></button>
        <button type="button" onClick={() => setTocando(t => !t)} aria-label={tocando ? 'Pausar' : 'Continuar'}>{tocando ? <Pause /> : <Play />}</button>
        <button type="button" onClick={() => setAto(a => Math.min(ATOS.length - 1, a + 1))} disabled={ato === ATOS.length - 1} aria-label="Próximo ato"><ChevronRight /></button>
        <span className="portal-controles-sep" />
        {VELOCIDADES_DO_MURAL.map(x => (
          <button key={x} type="button" className={x === v ? 'portal-ligado' : ''} onClick={() => mudarVelocidadeDoMural(x)}>{x}×</button>
        ))}
        <span className="portal-controles-sep" />
        <div className="portal-pontos">
          {ATOS.map((a, i) => (
            <button key={a.id} type="button" title={a.nome} className={i === ato ? 'portal-ligado' : ''} onClick={() => setAto(i)} aria-label={a.nome} />
          ))}
        </div>
        <span className="portal-controles-nome">{atual.nome}</span>
      </div>
      <button type="button" className="portal-fechar" onClick={fecharTela} aria-label="Fechar o mural"><X /></button>
    </div>
  );
}
