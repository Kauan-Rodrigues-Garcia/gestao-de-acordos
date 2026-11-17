/**
 * Arte da sala «Caça aos Zumbis e às Bruxas» — os sprites da época.
 *
 * Vêm de `arquivo-morto/caca-zumbis-bruxas/`, byte a byte como estavam no ar.
 * Só o DESENHO é importado: `zumbis.ts`, `pixels.ts`, `chefaoArte.ts` e a arte
 * das bruxas são grades de pixel e paletas, sem banco, sem rede e sem nome de
 * ninguém. O resto da Caça (`caca.ts`, `chefao.ts`, `index.tsx`), que lia e
 * gravava no banco, não entra aqui — e não pode entrar.
 */
import { SpriteZumbi } from '../../../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/SpriteZumbi';
import { ZUMBIS } from '../../../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/zumbis';
import { CHEFAO } from '../../../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/chefaoArte';
import { SpriteBruxa } from '../../../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/bruxas/SpriteBruxa';
import { BRUXAS } from '../../../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/bruxas/arte';
import { useCreators } from '../../theme/CreatorsProvider';

export default function ArteCaca() {
  const { movimentoReduzido } = useCreators();
  const animado = !movimentoReduzido;

  return (
    <div className="creators-lab__vitrine" role="img" aria-label="Três zumbis, o chefão e uma bruxa da Caça">
      {ZUMBIS.slice(0, 3).map(z => (
        <SpriteZumbi key={z.id} zumbi={z} escala={3} animado={animado} />
      ))}
      <SpriteZumbi zumbi={CHEFAO} escala={4} animado={animado} />
      <SpriteBruxa bruxa={BRUXAS[0]} escala={2} animado={animado} />
    </div>
  );
}
