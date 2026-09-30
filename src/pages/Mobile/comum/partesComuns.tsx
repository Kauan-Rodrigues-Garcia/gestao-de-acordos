/**
 * Peças comuns às duas telas do celular (a pessoal `/m` e a da equipe
 * `/m/equipe`) — o acabamento pedido em 30/09/2026:
 *
 *   • `Dinheiro` que rola ao mudar de valor;
 *   • `BarraMeta`: a barra de progresso simples e animada do cartão pastel;
 *   • `FundoVivo`: o papel de parede com manchas de cor desfocadas;
 *   • `FotoOuLogo`: a foto da pessoa no cabeçalho, ou a logo do app.
 */
import { useEffect, useState } from 'react';
import { formatBRL } from '@/lib/money';
import { useNumeroAnimado, CURVA_APOSTA_CSS } from './numeroAnimado';
import './comum.css';

/** «R$ 38.420,50» com o «R$» menor, rolando do valor antigo para o novo. */
export function DinheiroAnimado({ valor, semCor = false, aposta = false, duracaoMs }: {
  valor: number;
  /** Sem o verde/vermelho da mudança — para quando a troca não é subida nem
   *  descida (ex.: tocar outro dia no gráfico). */
  semCor?: boolean;
  /** A subida lenta dos cards principais do operador (`subirDevagar`). */
  aposta?: boolean;
  duracaoMs?: number;
}) {
  const { valor: quadro, direcao: d } = useNumeroAnimado(valor, { aposta, duracaoMs });
  const direcao = semCor ? null : d;
  const texto = formatBRL(quadro).replace(/^R\$\s?/, '');
  return (
    <span className={direcao ? `v-num v-${direcao}` : 'v-num'} aria-label={formatBRL(valor)}>
      <small aria-hidden="true">R$</small><span aria-hidden="true">{texto}</span>
    </span>
  );
}

/** Porcentagem que sobe junto com a barra. */
export function PctAnimado({ valor, aposta = false, duracaoMs }: {
  valor: number; aposta?: boolean; duracaoMs?: number;
}) {
  const { valor: quadro } = useNumeroAnimado(valor, { aposta, duracaoMs });
  return <>{Math.floor(quadro).toLocaleString('pt-BR')}%</>;
}

export interface MarcoBarra { pct: number; rotulo: string; ok: boolean }

/**
 * A barra da meta: um trilho, o preenchimento que cresce até a % alcançada
 * (sempre — antes só aparecia depois da 1ª meta) com um brilho que passa de
 * tempos em tempos, e marcos discretos para as faixas.
 *
 * `pct` é a posição na escala da barra (0..100); a escala é de quem chama.
 */
export function BarraMeta({ pct, marcos = [], esperado = null, rotuloEsperado, duracaoMs }: {
  pct: number;
  marcos?: MarcoBarra[];
  esperado?: number | null;
  rotuloEsperado?: string;
  /** Com duração, a barra cresce no ritmo da subida do número (`aposta`). */
  duracaoMs?: number;
}) {
  // Nasce vazia e cresce no primeiro quadro — a animação de entrada.
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const alvo = Math.max(0, Math.min(100, pct));
    if (typeof requestAnimationFrame === 'undefined') { setLargura(alvo); return; }
    const q = requestAnimationFrame(() => setLargura(alvo));
    return () => cancelAnimationFrame(q);
  }, [pct]);

  return (
    <div className={['v-barra', marcos.length ? 'v-com-marcos' : '', esperado !== null && rotuloEsperado ? 'v-com-rotulo' : '']
      .filter(Boolean).join(' ')} aria-hidden="true">
      <div className="v-trilho">
        <div className="v-cheio" style={duracaoMs
          ? { width: `${largura}%`, transitionDuration: `${duracaoMs}ms`, transitionTimingFunction: CURVA_APOSTA_CSS }
          : { width: `${largura}%` }}>
          <i className="v-brilho" />
        </div>
        {esperado !== null && (
          <div className="v-esperado" style={{ left: `${Math.max(0, Math.min(100, esperado))}%` }}>
            {rotuloEsperado && <b>{rotuloEsperado}</b>}
          </div>
        )}
      </div>
      {marcos.map(m => (
        <span key={m.rotulo} className={m.ok ? 'v-marco v-ok' : 'v-marco'} style={{ left: `${m.pct}%` }}>
          {m.rotulo}
        </span>
      ))}
    </div>
  );
}

/**
 * O papel de parede: três manchas de cor desfocadas (as cores do ícone, bem
 * claras) que derivam devagar atrás do conteúdo. Fica fixo e não recebe toque.
 */
export function FundoVivo() {
  return (
    <div className="v-fundo" aria-hidden="true">
      <i className="v-mancha v-m1" />
      <i className="v-mancha v-m2" />
      <i className="v-mancha v-m3" />
    </div>
  );
}

/** A foto de perfil da pessoa; sem foto (ou se ela não carregar), a logo do app. */
export function FotoOuLogo({ foto, nome }: { foto: string | null | undefined; nome?: string | null }) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => { setFalhou(false); }, [foto]);
  if (foto && !falhou) {
    return (
      <img className="v-foto" src={foto} alt={nome ? `Foto de ${nome}` : ''}
        onError={() => setFalhou(true)} referrerPolicy="no-referrer" />
    );
  }
  return <img className="v-logo" src="/icons/app-192.png" alt="" />;
}
