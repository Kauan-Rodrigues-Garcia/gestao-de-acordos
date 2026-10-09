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
import { ensaioFaixa, ensaioLimpar, ensaioOutroMatou, ensaioSoltar, ensaioSumir } from './caca';
import { ESPERA_S, ensaioArrancar, ensaioCurarChefao, ensaioFugir, ensaioLimparChefao, ensaioPularContagem, ensaioRobos, ensaioSoltarChefao } from './chefao';
import { CHEFAO } from './chefaoArte';
import { ZUMBIS } from './zumbis';
import { SpriteZumbi } from './SpriteZumbi';
import './caca.css';

export default function Laboratorio() {
  const [aberto, setAberto] = useState(true);
  const [zumbi, setZumbi] = useState(0);
  const [robos, setRobos] = useState(false);
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
          <p className="zb-lab-rotulo zb-lab-chefao"><SpriteZumbi zumbi={CHEFAO} soCabeca escala={1} /> Chefão: o Rei do Pop zumbi</p>
          <div className="zb-lab-botoes">
            <button type="button" className="zb-lab-btn principal" onClick={() => { setRobos(false); ensaioSoltarChefao(120, 3, ESPERA_S, 30); }}>Soltar o chefão</button>
            <button type="button" className="zb-lab-btn" onClick={ensaioPularContagem}>Pular contagem</button>
            <button type="button" className="zb-lab-btn" onClick={() => { setRobos(false); ensaioSoltarChefao(120, 3, 0, 30); }}>Soltar sem contagem</button>
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
        </div>
      )}
    </div>,
    document.body,
  );
}
