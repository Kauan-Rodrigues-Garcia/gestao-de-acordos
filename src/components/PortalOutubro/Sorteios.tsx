/**
 * Sorteios.tsx — o que abre por cima do mural quando alguém clica: o prêmio
 * das Lendas, que é a garrafa (28/10: as três clicam, a garrafa aparece, a
 * roleta revela quem ganhou e o ganhador sai no mesmo «Quem levou» do
 * sorteio de antes). 30/10: só as três clicam, cada uma na própria tela, e o
 * banco sorteia uma vez só (`premio.ts`); todo mundo vê o mesmo ganhador.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { LENDAS, PREMIO_DAS_LENDAS, type Pessoa } from './dados';
import { useVelocidadeDoMural } from './estado';
import { usePremioDasLendas } from './premio';
import { ArteGarrafa } from './Artes';
import { Confete, Roleta } from './Roleta';
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
  const premio = usePremioDasLendas();
  const { clicou, ganhador } = premio;
  const todas = LENDAS.every(l => clicou.has(l.posicao));
  const [girando, setGirando] = useState(false);
  const [ganhou, setGanhou] = useState<number | null>(null);
  const indiceDoGanhador = LENDAS.findIndex(l => l.posicao === ganhador);
  const nomes = LENDAS.map(l => l.nome.split(' ')[0]);
  const quem = `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  return (
    <div className="mural-sorteio">
      <p className="portal-selo">O prêmio das Lendas</p>
      <h2 className="portal-titulo portal-titulo-medio">{todas ? PREMIO_DAS_LENDAS.titulo : 'Só para as Lendas'}</h2>
      {!todas && (
        <>
          <p className="portal-frase">
            {premio.souLenda && !premio.deTeste
              ? 'Clique no seu card. Quando as três clicarem, o prêmio aparece.'
              : 'Quando as três clicarem, o prêmio aparece.'}
          </p>
          <div className="portal-premio-cards">
            {LENDAS.map(p => {
              const ja = clicou.has(p.posicao);
              const pode = premio.podeClicar(p.posicao);
              return (
                <button
                  key={p.posicao}
                  type="button"
                  className={`portal-premio-card portal-lugar-${p.posicao}${ja ? ' portal-premio-liberou' : ''}`}
                  onClick={() => void premio.clicar(p.posicao)}
                  disabled={ja || !pode || premio.enviando || !premio.carregado}
                >
                  <Rosto p={p} />
                  <span className="portal-premio-nome">{p.nome}</span>
                  <span className="portal-premio-acao">{ja ? 'Liberou' : pode ? 'Clique para liberar' : 'Esperando ela clicar'}</span>
                </button>
              );
            })}
          </div>
          <p className="portal-rodape-ato">
            {plural(LENDAS.length - clicou.size, 'falta', 'faltam')}
            {premio.deTeste
              ? ' · teste: aqui qualquer um clica pelas três; no app, cada uma clica na própria tela'
              : ` · só ${quem} liberam, cada uma na própria tela`}
          </p>
        </>
      )}
      {todas && indiceDoGanhador < 0 && <p className="portal-frase">Sorteando…</p>}
      {todas && indiceDoGanhador >= 0 && !girando && (
        <div className="portal-garrafa">
          <ArteGarrafa />
          <div>
            <p className="portal-frase">{PREMIO_DAS_LENDAS.descricao}</p>
            <p className="portal-garrafa-regra">{LENDAS.map(l => l.nome).join(' · ')}</p>
            <button type="button" className="portal-botao" onClick={() => setGirando(true)}>Girar a roleta</button>
          </div>
        </div>
      )}
      {todas && indiceDoGanhador >= 0 && girando && (
        <div className="portal-sorteio">
          <Roleta itens={LENDAS} ganhador={indiceDoGanhador} duracaoMs={6000 / v} aoParar={() => setGanhou(indiceDoGanhador)} />
          {ganhou != null && <Vencedor p={LENDAS[ganhou]} premio={PREMIO_DAS_LENDAS.titulo} />}
        </div>
      )}
      {premio.erro && <p className="portal-rodape-ato">{premio.erro}</p>}
      {todas && (
        <p className="portal-rodape-ato">
          {premio.deTeste
            ? 'Sorteio de teste, no navegador.'
            : 'Sorteado uma vez só, no banco: a roleta de todo mundo para no mesmo nome.'}
        </p>
      )}
    </div>
  );
}
