/**
 * «Receba um aviso a cada pagamento» e o sino do topo — spec §3.
 *
 * O estado sai de `estadoPush` (lib/mobile/push). Sem chave VAPID no build o
 * componente não mostra nada: o recurso ainda não existe para ninguém.
 */
import { useState } from 'react';
import type { EstadoPush } from '@/lib/mobile/push';

const Sino = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

/** O sino do cabeçalho: só aparece com os avisos ativos; o toque desliga. */
export function SinoAvisos({ ativo, ocupado, onDesativar }: {
  ativo: boolean; ocupado: boolean; onDesativar: () => void;
}) {
  const [perguntando, setPerguntando] = useState(false);
  if (!ativo) return null;
  return (
    <>
      <button type="button" className="m-sino" aria-label="Avisos de pagamento ativados"
        onClick={() => setPerguntando(true)}>
        <Sino /><i />
      </button>
      {perguntando && (
        <div className="m-folha-fundo" role="dialog" aria-modal="true" aria-labelledby="m-sino-titulo"
          onClick={() => setPerguntando(false)}>
          <div className="m-folha" onClick={e => e.stopPropagation()}>
            <h3 id="m-sino-titulo">Avisos de pagamento</h3>
            <p style={{ fontSize: 14.5, color: 'var(--m-tinta-2)', margin: '10px 0 18px' }}>
              Ativados neste aparelho. Você recebe um aviso a cada pagamento que cair.
            </p>
            <div style={{ display: 'grid', gap: 10 }}>
              <button type="button" className="m-btn m-sec" disabled={ocupado}
                onClick={() => { setPerguntando(false); onDesativar(); }}>
                Desativar neste aparelho
              </button>
              <button type="button" className="m-btn m-pri" onClick={() => setPerguntando(false)}>
                Manter ativados
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** O card do corpo da tela, conforme o estado. */
export function CartaoAvisos({ estado, ocupado, onAtivar, onInstalar }: {
  estado: EstadoPush; ocupado: boolean; onAtivar: () => void; onInstalar: () => void;
}) {
  if (estado === 'desligado' || estado === 'ativo' || estado === 'sem-suporte') return null;

  let titulo = 'Receba um aviso a cada pagamento';
  let texto = 'Pix, boleto ou cartão: você fica sabendo na hora, mesmo com o app fechado.';
  let botao: { rotulo: string; acao: () => void } | null = { rotulo: 'Ativar', acao: onAtivar };

  if (estado === 'precisa-instalar') {
    texto = 'No iPhone, os avisos só chegam com o app instalado na tela de início.';
    botao = { rotulo: 'Como instalar', acao: onInstalar };
  } else if (estado === 'negado') {
    titulo = 'Avisos bloqueados neste aparelho';
    texto = 'Para liberar: toque no cadeado ao lado do endereço (ou em Configurações › Notificações do app) e permita as notificações. Depois, volte aqui.';
    botao = null;
  }

  return (
    <section className="m-cartao m-avisos">
      <div className="m-acao">
        <span className="m-avisos-icone"><Sino /></span>
        <div className="m-acao-txt"><b>{titulo}</b>{texto}</div>
      </div>
      {botao && (
        <button type="button" className="m-btn m-pri" style={{ marginTop: 14 }}
          disabled={ocupado} onClick={botao.acao}>
          {ocupado ? 'Ativando…' : botao.rotulo}
        </button>
      )}
    </section>
  );
}
