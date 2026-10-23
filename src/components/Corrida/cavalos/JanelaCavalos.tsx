/**
 * JanelaCavalos — a Corrida de Cavalos dentro do sistema (22/10/2026).
 *
 * A corrida é a página `corrida-cavalos.html` (o mesmo desenho do laboratório),
 * num iframe da mesma origem. Isolada de propósito: o CSS, o laço de desenho e
 * os sons da corrida não encostam no resto do app, e o app não encosta nela.
 * Os dois conversam por mensagem (`postMessage`), sempre conferindo a origem e
 * de quem veio: o sistema manda a sala do banco; a página devolve o que a
 * pessoa fez (palpite, escolher, fechar, ampliar, os botões do organizador).
 *
 * Tamanhos. No canto, o iframe é maior que a janela da corrida: o balão «Assista
 * em tela cheia», os botões de emoji e a barra do organizador ficam por fora da
 * caixa, e o fundo da página é transparente. Ampliada, ocupa a tela inteira (o
 * fundo escuro é da própria página). A escolha e o card são da tela inteira.
 */
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { cn } from '@/lib/utils';

export type ModoCavalos = 'app' | 'escolha' | 'teste' | 'card';
export interface MensagemCavalos { tipo: string; [chave: string]: unknown }
export type EnviarCavalos = (m: MensagemCavalos) => void;

interface Props {
  modo: ModoCavalos;
  onMensagem: (m: MensagemCavalos) => void;
  /** Recebe a função de mandar mensagem para a página (nula enquanto o iframe não existe). */
  conexao: MutableRefObject<EnviarCavalos | null>;
  /**
   * Com o Cavalo da Guerra na página (`guerra/CenaGuerra.tsx`), a janela some (transparente, e não
   * escondida: o navegador para o laço de um iframe escondido; sem desmontar: a
   * corrida continua andando lá dentro e volta quando ele acaba).
   */
  escondida?: boolean;
  /** O iframe, para a guerra ler a pista na hora em que a janela estoura. */
  quadro?: MutableRefObject<HTMLIFrameElement | null>;
}

export function JanelaCavalos({ modo, onMensagem, conexao, escondida = false, quadro }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => { if (quadro) quadro.current = ref.current; return () => { if (quadro) quadro.current = null; }; }, [quadro]);
  const [grande, setGrande] = useState(false);
  const aoReceber = useRef(onMensagem);
  aoReceber.current = onMensagem;

  useEffect(() => {
    const receber = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin || ev.source !== ref.current?.contentWindow) return;
      const m = ev.data as (MensagemCavalos & { corridaCavalos?: boolean }) | null;
      if (!m?.corridaCavalos || typeof m.tipo !== 'string') return;
      if (m.tipo === 'tamanho') setGrande(!!m.grande);
      aoReceber.current(m);
    };
    window.addEventListener('message', receber);
    return () => window.removeEventListener('message', receber);
  }, []);

  useEffect(() => {
    conexao.current = m => ref.current?.contentWindow?.postMessage({ corridaCavalos: true, ...m }, window.location.origin);
    return () => { conexao.current = null; };
  }, [conexao]);

  const telaInteira = grande || modo === 'escolha' || modo === 'card';
  return (
    <iframe
      ref={ref}
      src={`/corrida-cavalos.html?modo=${modo}`}
      title="Corrida de Cavalos"
      allow="autoplay"
      // o fundo transparente só vale com o mesmo esquema de cor dos dois lados
      style={{ colorScheme: 'normal', ...(telaInteira ? {} : { width: 'min(100vw, 906px)', height: 'min(100dvh, 580px)' }), ...(escondida ? { opacity: 0, pointerEvents: 'none' } : {}) }}
      className={cn('fixed z-[85] border-0 bg-transparent', telaInteira ? 'inset-0 h-full w-full' : 'bottom-0 right-0')}
    />
  );
}
