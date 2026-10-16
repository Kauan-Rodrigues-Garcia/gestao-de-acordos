/**
 * LobbyDaChefona.tsx — o lobby (`lobby.ts`) ligado à chefona do banco.
 *
 * Montado para TODO mundo enquanto ela está na tela (da contagem ao fim da
 * luta), em `../../../index.tsx`. Quem entra no lobby passa a ver a cena dela
 * (`../CenaChefona.tsx`); quem não entra vê só este menu no alto.
 *
 * O lobby é um objeto do DOM (não React): o React só o cria uma vez por
 * chefona e passa a ele o que muda — a lista de quem entrou, se eu entrei por
 * outra aba, e o fim da luta.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { toast } from 'sonner';
import { carregarFontesPixel } from '@/components/Halloween/fonte';
import {
  chefonaChegando, entrarNoLobbyChefona, motivoDoErroDaChefona, sairDoLobbyChefona, situacaoDaChefona,
  type RodadaChefona,
} from '../banco';
import { chefonaLeve } from '../leve';
import { LobbyChefona, type EstadoLobby, type Guerreiro } from './lobby';

/** Quem escolheu «Ficar de fora» nesta chefona (vale até fechar a aba). */
const chaveFora = (id: number) => `gestao:chefona-fora:${id}`;
function ficouFora(id: number): boolean {
  try { return sessionStorage.getItem(chaveFora(id)) === '1'; } catch { return false; }
}
function guardarFora(id: number): void {
  try { sessionStorage.setItem(chaveFora(id), '1'); } catch { /* modo privado: vale até recarregar */ }
}

/** Depois que ela cai ou foge: o tempo da música sumir antes de desmontar. */
const DESMONTAR_DEPOIS_MS = 1_500;

export function LobbyDaChefona({ rodada, eu, noLobby, aoAcabar }: {
  rodada: RodadaChefona;
  eu: Guerreiro;
  /** Eu estou no lobby desta chefona (o banco diz). */
  noLobby: boolean;
  aoAcabar: () => void;
}): null {
  const lobbyRef = useRef<LobbyChefona | null>(null);
  const rodadaRef = useRef(rodada);
  rodadaRef.current = rodada;
  const noLobbyRef = useRef(noLobby);
  noLobbyRef.current = noLobby;
  const euRef = useRef(eu);

  useEffect(() => { carregarFontesPixel(); }, []);

  // Um lobby por chefona.
  const id = rodada.id;
  useLayoutEffect(() => {
    const chegando = chefonaChegando(rodadaRef.current, Date.now());
    const inicial: EstadoLobby = noLobbyRef.current
      ? (chegando ? 'lobby' : 'luta')
      : (chegando && !ficouFora(id) ? 'convite' : 'fora');
    const l = new LobbyChefona(document.body, {
      faltaS: () => (Date.parse(rodadaRef.current.solta_em) - Date.now()) / 1000,
      eu: euRef.current,
      estadoInicial: inicial,
      leve: chefonaLeve(),
      aoEntrar: async () => {
        const { erro } = await entrarNoLobbyChefona(id);
        if (!erro) return true;
        toast.error('Não deu para entrar na batalha', { description: motivoDoErroDaChefona(erro) });
        return false;
      },
      aoFicarFora: () => guardarFora(id),
      aoSair: () => {
        guardarFora(id);
        void sairDoLobbyChefona(id);
      },
    });
    lobbyRef.current = l;
    return () => {
      l.destruir();
      lobbyRef.current = null;
    };
  }, [id]);

  // Quem entrou (os últimos 24) e quantos ao todo.
  useEffect(() => {
    lobbyRef.current?.atualizarGuerreiros(
      rodada.lobby.map(g => ({ id: g.usuario, nome: g.nome, setor: g.setor })),
      rodada.lobby_total,
    );
  }, [rodada.lobby, rodada.lobby_total]);

  // Entrei por outra aba (ou a leitura de entrada chegou depois do aviso).
  useEffect(() => {
    if (noLobby) lobbyRef.current?.jaEstaNoLobby();
  }, [noLobby]);

  // Ela caiu ou fugiu: a música some rápido e o lobby sai.
  const situacao = situacaoDaChefona(rodada, Date.now());
  useEffect(() => {
    if (situacao === 'ativo') return;
    lobbyRef.current?.encerrarLuta();
    const t = setTimeout(aoAcabar, DESMONTAR_DEPOIS_MS);
    return () => clearTimeout(t);
  }, [situacao, aoAcabar]);

  return null;
}
