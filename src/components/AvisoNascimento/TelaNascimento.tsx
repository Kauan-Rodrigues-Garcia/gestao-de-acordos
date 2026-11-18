/**
 * TelaNascimento — a casca React do livro. Carregada só quando há aviso a mostrar:
 * quem não recebe o card não baixa o livro, a cegonha nem as fontes.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ConteudoDoLivro } from './conteudo';
import { criarLivro } from './motorDoLivro';
import './livro.css';

const ID_FONTES = 'ln-fontes';
const FONTES = 'https://fonts.googleapis.com/css2?family=Nunito:wght@500;600;700;800&family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..500&display=swap';

export interface PropsTelaNascimento {
  conteudo: ConteudoDoLivro;
  fotoUrl: string;
  podeRecado: boolean;
  meuRecado: string | null;
  previa?: boolean;
  onAberto?: () => void;
  onRecado: (texto: string) => Promise<void>;
  onAdiar: () => void;
  onFim: () => void;
}

export default function TelaNascimento(p: PropsTelaNascimento) {
  const raiz = useRef<HTMLDivElement>(null);
  const atual = useRef(p);
  atual.current = p;

  useEffect(() => {
    if (!document.getElementById(ID_FONTES)) {
      document.head.append(Object.assign(document.createElement('link'), { id: ID_FONTES, rel: 'stylesheet', href: FONTES }));
    }
    const el = raiz.current;
    if (!el) return;
    return criarLivro(el, {
      conteudo: atual.current.conteudo, fotoUrl: atual.current.fotoUrl, podeRecado: atual.current.podeRecado,
      meuRecado: atual.current.meuRecado, previa: !!atual.current.previa,
    }, {
      onAberto: () => atual.current.onAberto?.(),
      onRecado: t => atual.current.onRecado(t),
      onAdiar: () => atual.current.onAdiar(),
      onFim: () => atual.current.onFim(),
    });
  }, []);

  return createPortal(<div ref={raiz} />, document.body);
}
