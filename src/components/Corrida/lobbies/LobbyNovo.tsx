/**
 * LobbyNovo — o canvas dos lobbies novos (A, B e C), por cima do motor só
 * enquanto a tela é o lobby. O motor segue cuidando da música e do relógio.
 */
import { useEffect, useRef } from 'react';
import { bichinhoDe } from '../motor/bichinhos';
import type { PessoaJson } from '../banco';
import { criarCena, type Cena, type DesenhaTema, type Gente, type Palpite, type TemaLobby } from './cena';
import { desenhaF1 } from './f1';
import { desenhaHipodromo } from './hipodromo';
import { desenhaTV } from './tv';

const DESENHOS: Record<Exclude<TemaLobby, 'atual'>, DesenhaTema> = { f1: desenhaF1, hipodromo: desenhaHipodromo, tv: desenhaTV };

interface Props {
  tema: Exclude<TemaLobby, 'atual'>;
  corridaId: number;
  pessoas: PessoaJson[];
  eu: string | null;
  premio: string | null;
  iniciaEm: number | null;
  agora: () => number;
  palpite: Palpite;
  onPalpite: (id: string) => void;
  /** Recebe a cena (as reações saem por ela). */
  aoCena?: (cena: Cena | null) => void;
}

const segundos = (iso: string | null) => (iso ? Date.parse(iso) / 1000 : null);

export default function LobbyNovo({ tema, corridaId, pessoas, eu, premio, iniciaEm, agora, palpite, onPalpite, aoCena }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cena = useRef<Cena | null>(null);
  const agoraRef = useRef(agora); agoraRef.current = agora;
  const palpiteRef = useRef(onPalpite); palpiteRef.current = onPalpite;

  useEffect(() => {
    const c = criarCena(ref.current!, DESENHOS[tema], () => agoraRef.current(), id => palpiteRef.current(id));
    cena.current = c; aoCena?.(c);
    return () => { c.destruir(); cena.current = null; aoCena?.(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma cena por canvas; o tema troca abaixo
  }, []);
  useEffect(() => { cena.current?.setTema(DESENHOS[tema]); }, [tema]);

  useEffect(() => {
    const gente = (p: PessoaJson): Gente => ({
      id: p.usuario, nome: p.nome, setor: p.setor ?? 'Sem setor', foto: p.foto,
      est: p.corre ? bichinhoDe(corridaId, p.usuario, p.escolha) : null, entrou: segundos(p.entrou_em), voce: p.usuario === eu,
    });
    const corredores = pessoas.filter(p => p.corre).map(gente);
    const plateia = pessoas.filter(p => !p.corre && p.entrou_em).sort((a, b) => (a.entrou_em! < b.entrou_em! ? -1 : 1)).map(gente);
    cena.current?.setEstado({ corredores, plateia, premio, iniciaEm, palpite });
  }, [pessoas, eu, corridaId, premio, iniciaEm, palpite]);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full touch-manipulation" aria-label="O lobby da corrida" />;
}
