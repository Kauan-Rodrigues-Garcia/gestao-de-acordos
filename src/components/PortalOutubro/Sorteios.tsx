/**
 * Sorteios.tsx — o que abre por cima do mural quando alguém clica: o prêmio
 * das Lendas, que é a garrafa (28/10: as três clicam, a garrafa aparece, a
 * roleta sorteia entre elas e o ganhador sai no mesmo «Quem levou» do
 * sorteio de antes). De teste, no navegador: no dia o resultado vem de um
 * lugar só, e todo mundo vê o mesmo.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { LENDAS, PREMIO_DAS_LENDAS, type Pessoa } from './dados';
import { clicarLenda, useCliquesDasLendas, useVelocidadeDoMural } from './estado';
import { ArteGarrafa } from './Artes';
import { Confete, Roleta } from './Roleta';
import { sortearComPeso } from './sorteio';
import { plural } from './texto';
import { Rosto } from './Rosto';

/** A janela por cima do mural (Esc ou fora dela fecham). */
export function Foco({ aoFechar, largo = false, children }: { aoFechar: () => void; largo?: boolean; children: ReactNode }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); aoFechar(); } };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [aoFechar]);
  return (
    <div className="mural-foco" onClick={aoFechar}>
      <div className={`mural-foco-caixa portal-placa${largo ? ' mural-foco-largo' : ''}`} onClick={e => e.stopPropagation()}>
        {children}
        <button type="button" className="mural-foco-fechar" onClick={aoFechar} aria-label="Fechar"><X /></button>
      </div>
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

export function PremioDasLendas() {
  const v = useVelocidadeDoMural();
  const cliques = useCliquesDasLendas();
  const todas = LENDAS.every(l => cliques.has(l.posicao));
  const [girando, setGirando] = useState(false);
  const [ganhou, setGanhou] = useState<number | null>(null);
  const ganhador = useMemo(() => sortearComPeso(LENDAS, () => 1), []);
  return (
    <div className="mural-sorteio">
      <p className="portal-selo">O prêmio das Lendas</p>
      <h2 className="portal-titulo portal-titulo-medio">{todas ? PREMIO_DAS_LENDAS.titulo : 'Só para as Lendas'}</h2>
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
                <Rosto p={p} />
                <span className="portal-premio-nome">{p.nome}</span>
                <span className="portal-premio-acao">{cliques.has(p.posicao) ? 'Liberou' : 'Clique para liberar'}</span>
              </button>
            ))}
          </div>
          <p className="portal-rodape-ato">{plural(LENDAS.length - cliques.size, 'falta', 'faltam')} · teste: aqui qualquer um clica pelas três; no dia, cada uma clica na própria tela</p>
        </>
      )}
      {todas && !girando && (
        <div className="portal-garrafa">
          <ArteGarrafa />
          <div>
            <p className="portal-frase">{PREMIO_DAS_LENDAS.descricao}</p>
            <p className="portal-garrafa-regra">{LENDAS.map(l => l.nome).join(' · ')}</p>
            <button type="button" className="portal-botao" onClick={() => setGirando(true)}>Girar a roleta</button>
          </div>
        </div>
      )}
      {todas && girando && (
        <div className="portal-sorteio">
          <Roleta itens={LENDAS} ganhador={ganhador} duracaoMs={6000 / v} aoParar={() => setGanhou(ganhador)} />
          {ganhou != null && <Vencedor p={LENDAS[ganhou]} premio={PREMIO_DAS_LENDAS.titulo} />}
        </div>
      )}
      {todas && <p className="portal-rodape-ato">Sorteio de teste, no navegador. No dia o resultado vem de um lugar só, e todo mundo vê o mesmo.</p>}
    </div>
  );
}
