/**
 * Arte da sala «O álbum de insígnias» — as medalhas, com os rostos da época.
 *
 * O álbum de verdade lia do banco quais medalhas cada pessoa tinha. Aqui não
 * há pessoa nenhuma: são só as cinco medalhas que existiram, penduradas lado a
 * lado, com a cabeça de cada personagem tirada dos mesmos sprites da Caça e do
 * Cavalo da Guerra. A moldura da medalha é do Museu; o desenho de dentro é o
 * original.
 */
import { SpriteZumbi } from '../../../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/SpriteZumbi';
import { ZUMBIS } from '../../../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/zumbis';
import { CHEFAO } from '../../../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/chefaoArte';
import { SpriteBruxa } from '../../../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/bruxas/SpriteBruxa';
import { BRUXAS } from '../../../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/bruxas/arte';
import { SpriteCavaloDaGuerra } from '@/components/Corrida/guerra/SpriteCavaloDaGuerra';
import type { ReactNode } from 'react';

function Medalha({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <figure className="creators-lab__medalha">
      <span className="creators-lab__medalha-fita" aria-hidden="true" />
      <span className="creators-lab__medalha-disco">{children}</span>
      <figcaption>{nome}</figcaption>
    </figure>
  );
}

export default function ArteInsignias() {
  return (
    <div className="creators-lab__vitrine">
      <Medalha nome="Zumbi"><SpriteZumbi zumbi={ZUMBIS[0]} escala={2} soCabeca /></Medalha>
      <Medalha nome="Rei do Pop"><SpriteZumbi zumbi={CHEFAO} escala={2} soCabeca /></Medalha>
      <Medalha nome="Bruxas"><SpriteBruxa bruxa={BRUXAS[0]} escala={1} soCabeca /></Medalha>
      <Medalha nome="Pântano"><SpriteBruxa bruxa={BRUXAS[BRUXAS.length - 1]} escala={1} soCabeca /></Medalha>
      <Medalha nome="Cavalo da Guerra"><SpriteCavaloDaGuerra escala={0.28} animado={false} /></Medalha>
    </div>
  );
}
