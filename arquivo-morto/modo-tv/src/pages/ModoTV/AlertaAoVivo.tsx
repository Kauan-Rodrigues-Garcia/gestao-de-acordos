/**
 * AlertaAoVivo.tsx — o Alert Box.
 *
 * Entra POR CIMA da cena, fica alguns segundos e sai. É o que faz a parede
 * inteira saber, no segundo seguinte, que alguém bateu meta.
 *
 * ## Ele vive pelo relógio, não por um "já exibi"
 *
 * O banco devolve os alertas criados há menos de `duracao_s`, com quanto ainda
 * falta de cada um. O palco não marca nada como visto — se marcasse, a
 * superfície pública passaria a ESCREVER no banco, e desde a fase 1 a regra é
 * que ela só lê.
 *
 * Isso ainda resolve de graça dois casos chatos: recarregar a página no meio de
 * um alerta não o perde nem o repete, e duas telas do mesmo setor mostram a
 * mesma coisa no mesmo instante sem combinarem nada.
 */
import { useEffect, useRef, useState } from 'react';
import { PALCO_LARGURA, PALCO_ALTURA, type Alerta } from './geometria';

interface Props {
  alertas: readonly Alerta[];
  /** Sem isto o som não toca: política de autoplay do navegador. */
  audioLiberado: boolean;
}

export function AlertaAoVivo({ alertas, audioLiberado }: Props) {
  /*
   * A FILA. Dois alertas ao mesmo tempo viram dois alertas em sequência, e não
   * dois por cima um do outro — que é o que aconteceria se cada um se
   * desenhasse sozinho. Quem chegou primeiro (o mais antigo dos vivos) aparece
   * primeiro.
   */
  const fila = [...alertas].sort(
    (a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime(),
  );
  const [exibidos, setExibidos] = useState<string[]>([]);
  const atual = fila.find(a => !exibidos.includes(a.id)) ?? null;

  const som = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!atual) return;

    /*
     * Quanto tempo ele ainda fica. `resta_s` vem do banco e já desconta o que
     * passou — é isso que faz um F5 no meio do alerta continuar de onde parou
     * em vez de reiniciar a contagem.
     */
    const restaMs = Math.max(1000, (Number(atual.resta_s) || atual.duracao_s) * 1000);
    const t = setTimeout(() => setExibidos(v => [...v, atual.id]), restaMs);
    return () => clearTimeout(t);
  }, [atual]);

  useEffect(() => {
    if (!atual?.som_url || !audioLiberado) return;
    const a = new Audio(atual.som_url);
    som.current = a;
    // Falha aqui é esperada até alguém destravar o áudio; não é defeito.
    void a.play().catch(() => {});
    return () => { a.pause(); som.current = null; };
  }, [atual?.id, atual?.som_url, audioLiberado]);

  /*
   * Limpa a lista de já-exibidos quando não há mais alerta vivo. Sem isso ela
   * cresceria o dia inteiro numa página que nunca recarrega.
   */
  useEffect(() => {
    if (alertas.length === 0 && exibidos.length > 0) setExibidos([]);
  }, [alertas.length, exibidos.length]);

  if (!atual) return null;

  return (
    <div
      style={{
        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
        background: 'rgba(6,10,13,.78)', zIndex: 100000,
        animation: 'tv-alerta-entra 420ms cubic-bezier(.2,.9,.3,1.2)',
        pointerEvents: 'none',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: PALCO_LARGURA * 0.78,
                    maxHeight: PALCO_ALTURA * 0.86, padding: 40 }}>
        {atual.midia_url && (
          <img
            src={atual.midia_url}
            alt=""
            style={{ maxHeight: 380, maxWidth: '100%', display: 'block',
                     margin: '0 auto 32px', borderRadius: 20 }}
          />
        )}

        <p style={{ margin: '0 0 18px', color: '#7fd8e8', fontSize: 104, fontWeight: 800,
                    lineHeight: 1.05, textWrap: 'balance',
                    textShadow: '0 4px 24px rgba(0,0,0,.6)' }}>
          {atual.titulo}
        </p>

        {atual.mensagem && (
          <p style={{ margin: 0, color: '#e8f1f3', fontSize: 56, fontWeight: 500,
                      lineHeight: 1.25, textWrap: 'balance' }}>
            {atual.mensagem}
          </p>
        )}
      </div>

      <style>{`
        @keyframes tv-alerta-entra {
          from { opacity: 0; transform: scale(.9); }
          to   { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes tv-alerta-entra { from { opacity: 0; } to { opacity: 1; } }
        }
      `}</style>
    </div>
  );
}
