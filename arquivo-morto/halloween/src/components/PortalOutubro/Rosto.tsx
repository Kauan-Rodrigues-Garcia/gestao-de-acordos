/**
 * Rosto.tsx — a foto do perfil no quadradinho de borda em degrau do portal
 * (a cor da borda é a do lugar: ouro, prata, bronze). Sem foto, ou se ela não
 * carregar, as iniciais.
 *
 * `crossOrigin`: o retrato que desmancha (`fotografar.ts`) lê os pixels da
 * tela; foto sem permissão de outra origem sujaria o canvas e o retrato
 * sairia liso.
 */
import { useState } from 'react';
import type { Pessoa } from './dados';
import { iniciais } from './texto';

export function Rosto({ p, grande = false }: { p: Pick<Pessoa, 'nome' | 'foto'>; grande?: boolean }) {
  const [falhou, setFalhou] = useState(false);
  const classe = `portal-avatar${grande ? ' portal-avatar-grande' : ''}`;
  if (p.foto && !falhou) {
    return (
      <span className={`${classe} portal-avatar-foto`}>
        <img src={p.foto} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" onError={() => setFalhou(true)} draggable={false} />
      </span>
    );
  }
  return <span className={classe}>{iniciais(p.nome)}</span>;
}
