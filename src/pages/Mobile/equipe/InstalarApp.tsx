/**
 * «Instalar app» na visão Equipe — relato de 30/09/2026: «não localizei o botão
 * de baixar o app quando entro direto na visão de líder». O botão só existia no
 * rodapé da `/m` (operador); o líder cai direto aqui e nunca o via.
 *
 * O mesmo `useInstalacao` da `/m`: convite do navegador no Android/Chrome e o
 * passo a passo no iPhone (que não tem convite). Instalado, some. O app abre
 * pela `/m` (`start_url`), que manda o líder para cá.
 */
import { useInstalacao } from '@/lib/mobile/instalar';
import { FolhaInferior } from './FolhaInferior';

export function BotaoInstalar({ onPassoIPhone }: { onPassoIPhone: () => void }) {
  const { modo, instalar } = useInstalacao();
  if (modo !== 'convite' && modo !== 'iphone') return null;
  return (
    <button type="button" className="e-btn e-instalar"
      onClick={() => { if (modo === 'convite') void instalar(); else onPassoIPhone(); }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
      </svg>
      Instalar app
    </button>
  );
}

export function PassoIPhone({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  return (
    <FolhaInferior aberta={aberto} onFechar={onFechar} rotuloId="e-instalar-titulo"
      cabecalho={<div className="e-folha-cab"><h3 id="e-instalar-titulo">Instalar no iPhone</h3></div>}>
      <ol className="e-passos">
        <li>Abra esta página no <b>Safari</b>.</li>
        <li>Toque em <b>Compartilhar</b> (o quadrado com a seta para cima).</li>
        <li>Escolha <b>Adicionar à Tela de Início</b> e toque em <b>Adicionar</b>.</li>
      </ol>
      <p className="e-nota" style={{ margin: '0 20px' }}>
        No iPhone, os avisos da equipe só chegam com o app instalado.
      </p>
      <button type="button" className="e-btn" onClick={onFechar}>Entendi</button>
    </FolhaInferior>
  );
}
