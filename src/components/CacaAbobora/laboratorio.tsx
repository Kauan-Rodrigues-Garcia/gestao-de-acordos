/**
 * laboratorio.tsx — o painel de ensaio da Caça aos Zumbis, SÓ no localhost.
 *
 * Aparece com `?zumbis` no endereço (ex.: http://localhost:8080/?zumbis#/) e
 * só existe no `npm run dev`: `index.tsx` o carrega atrás de
 * `import.meta.env.DEV`, e o build de produção o descarta.
 *
 * Nada aqui toca o banco: as rodadas são de mentira (id negativo, ver
 * «Ensaio» em `caca.ts`) e o tiro nelas se resolve no próprio navegador.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useAuthOpcional } from '@/hooks/useAuth';
import {
  ensaioFaixa, ensaioLimpar, ensaioOutroDerrubou, ensaioOutroFinalizou, ensaioOutroMatou, ensaioSoltar, ensaioSoltarBruxa, ensaioSumir,
} from './caca';
import { BRUXAS } from './bruxas/arte';
import { ESPERA_S, PRAZO_MIN, ensaioArrancar, ensaioCurarChefao, ensaioFugir, ensaioLimparChefao, ensaioPularContagem, ensaioRobos, ensaioSoltarChefao } from './chefao';
import { CHEFAO } from './chefaoArte';
import {
  ESPERA_S as ESPERA_CHEFONA_S, PRAZO_MIN as PRAZO_CHEFONA_MIN, curarChefona, ensaioArrancarChefona, ensaioFugirChefona,
  ensaioLimparChefona, ensaioPularContagemChefona, ensaioRobosChefona, ensaioSoltarChefona, estadoChefona, protegerChefona,
} from './bruxas/chefona/banco';
import { ZUMBIS } from './zumbis';
import { SpriteZumbi } from './SpriteZumbi';
import './caca.css';

export default function Laboratorio() {
  const [aberto, setAberto] = useState(true);
  const [zumbi, setZumbi] = useState(0);
  const [robos, setRobos] = useState(false);
  const [robosChefona, setRobosChefona] = useState(false);
  const [bruxa, setBruxa] = useState(0);
  /** A Poção de Cura e o Totem do ensaio passam pelo mesmo caminho do botão do super_admin. */
  const naChefona = (fn: (id: number) => Promise<{ erro: string | null }>) => {
    const r = estadoChefona();
    if (!r) { toast('Solte a chefona antes'); return; }
    void fn(r.id).then(({ erro }) => { if (erro) toast(erro); });
  };
  // A faixa de ensaio leva a foto de quem está logado: é a foto que o banco
  // grava (`perfis.foto_url`) quando a pessoa mata de verdade.
  const foto = useAuthOpcional()?.perfil?.foto_url ?? null;

  return createPortal(
    <div className={aberto ? 'zb-lab' : 'zb-lab fechado'}>
      <button type="button" className="zb-lab-titulo" onClick={() => setAberto(a => !a)}>
        {aberto ? '−' : '+'} Laboratório de zumbis
      </button>
      {aberto && (
        <div className="zb-lab-corpo">
          <p className="zb-lab-nota">Só no localhost · nada vai para o banco</p>
          <div className="zb-lab-zumbis">
            {ZUMBIS.map((z, i) => (
              <button
                key={z.id}
                type="button"
                className={i === zumbi ? 'zb-lab-zumbi ativo' : 'zb-lab-zumbi'}
                title={z.nome}
                onClick={() => setZumbi(i)}
              >
                <SpriteZumbi zumbi={z} soCabeca escala={2} />
              </button>
            ))}
          </div>
          <p className="zb-lab-rotulo">{ZUMBIS[zumbi].nome}</p>
          <div className="zb-lab-botoes">
            <button type="button" className="zb-lab-btn principal" onClick={() => ensaioSoltar(zumbi)}>Soltar zumbi</button>
            <button type="button" className="zb-lab-btn" onClick={() => ensaioOutroMatou(false)}>Outro matou (corpo)</button>
            <button type="button" className="zb-lab-btn" onClick={() => ensaioOutroMatou(true)}>Outro matou (headshot)</button>
            <button type="button" className="zb-lab-btn" onClick={ensaioSumir}>Voltar para a cova</button>
          </div>
          <p className="zb-lab-rotulo">Faixa</p>
          <div className="zb-lab-botoes">
            <button type="button" className="zb-lab-btn" onClick={() => ensaioFaixa({ zumbi, headshot: false, rapida: false, headshotRapido: false, foto })}>Tiro no corpo</button>
            <button type="button" className="zb-lab-btn" onClick={() => ensaioFaixa({ zumbi, headshot: true, rapida: false, headshotRapido: false, foto })}>Headshot</button>
            <button type="button" className="zb-lab-btn" onClick={() => ensaioFaixa({ zumbi, headshot: true, rapida: true, headshotRapido: true, foto })}>Os dois recordes</button>
            <button type="button" className="zb-lab-btn" onClick={ensaioLimpar}>Limpar</button>
          </div>
          <p className="zb-lab-rotulo">Bruxas (a caça de verdade, com rodada de mentira)</p>
          <select className="zb-lab-btn" value={bruxa} onChange={e => setBruxa(Number(e.target.value))} aria-label="Qual bruxa">
            {BRUXAS.map((b, i) => <option key={b.id} value={i}>{b.nome.replace(/^(o|a) /, '')}{b.fofa ? ' (fofa)' : ''}</option>)}
          </select>
          <div className="zb-lab-botoes">
            <button type="button" className="zb-lab-btn principal" onClick={() => ensaioSoltarBruxa(bruxa)}>Soltar bruxa</button>
            <button type="button" className="zb-lab-btn" onClick={() => ensaioOutroDerrubou('cabeca')}>Outro: headshot</button>
            <button type="button" className="zb-lab-btn" onClick={() => ensaioOutroDerrubou('corpo')}>Outro: corpo</button>
            <button type="button" className="zb-lab-btn" onClick={() => ensaioOutroDerrubou('vassoura')}>Outro: vassoura</button>
            <button type="button" className="zb-lab-btn" onClick={ensaioOutroFinalizou}>Outro finalizou</button>
            <button type="button" className="zb-lab-btn" onClick={ensaioSumir}>Tempo acabou</button>
          </div>
          <p className="zb-lab-rotulo zb-lab-chefao"><SpriteZumbi zumbi={CHEFAO} soCabeca escala={1} /> Chefão: o Rei do Pop zumbi</p>
          <div className="zb-lab-botoes">
            <button type="button" className="zb-lab-btn principal" onClick={() => { setRobos(false); ensaioSoltarChefao(120, PRAZO_MIN, ESPERA_S, 30); }}>Soltar o chefão</button>
            <button type="button" className="zb-lab-btn" onClick={ensaioPularContagem}>Pular contagem</button>
            <button type="button" className="zb-lab-btn" onClick={() => { setRobos(false); ensaioSoltarChefao(120, PRAZO_MIN, 0, 30); }}>Soltar sem contagem</button>
            <button
              type="button"
              className="zb-lab-btn"
              aria-pressed={robos}
              onClick={() => { ensaioRobos(!robos); setRobos(!robos); }}
            >
              {robos ? 'Parar os robôs' : 'Robôs atirando'}
            </button>
            <button type="button" className="zb-lab-btn" onClick={() => ensaioArrancar(0.3)}>Arrancar 30%</button>
            <button
              type="button"
              className="zb-lab-btn"
              title="O banquete: uma pessoa entra andando, ele a devora e recupera 25% (imune por 12 s)"
              onClick={() => { const erro = ensaioCurarChefao(); if (erro) toast(erro); }}
            >
              Recuperar vida
            </button>
            <button type="button" className="zb-lab-btn" onClick={() => { setRobos(false); ensaioFugir(); }}>Fugir</button>
            <button type="button" className="zb-lab-btn" onClick={() => { setRobos(false); ensaioLimparChefao(); }}>Limpar</button>
          </div>
          <p className="zb-lab-rotulo">Chefona: a Bruxa do Pântano (com a vida «do banco» de mentira)</p>
          <div className="zb-lab-botoes">
            <button type="button" className="zb-lab-btn principal" onClick={() => { setRobosChefona(false); ensaioSoltarChefona(300, PRAZO_CHEFONA_MIN, ESPERA_CHEFONA_S, 60); }}>Soltar a chefona</button>
            <button type="button" className="zb-lab-btn" onClick={ensaioPularContagemChefona}>Pular contagem</button>
            <button type="button" className="zb-lab-btn" onClick={() => { setRobosChefona(false); ensaioSoltarChefona(300, PRAZO_CHEFONA_MIN, 0, 60); }}>Soltar sem contagem</button>
            <button
              type="button"
              className="zb-lab-btn"
              aria-pressed={robosChefona}
              onClick={() => { ensaioRobosChefona(!robosChefona); setRobosChefona(!robosChefona); }}
            >
              {robosChefona ? 'Parar os robôs' : 'Robôs atirando'}
            </button>
            <button type="button" className="zb-lab-btn" onClick={() => ensaioArrancarChefona(0.3)}>Arrancar 30%</button>
            <button type="button" className="zb-lab-btn" onClick={() => naChefona(curarChefona)}>Poção de Cura</button>
            <button type="button" className="zb-lab-btn" onClick={() => naChefona(protegerChefona)}>Totem</button>
            <button type="button" className="zb-lab-btn" onClick={() => { setRobosChefona(false); ensaioFugirChefona(); }}>Fugir</button>
            <button type="button" className="zb-lab-btn" onClick={() => { setRobosChefona(false); ensaioLimparChefona(); }}>Limpar</button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
