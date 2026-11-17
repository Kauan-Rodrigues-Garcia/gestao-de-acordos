/**
 * Arte da sala «Guerra na Corrida» — o Cavalo da Guerra, andando.
 *
 * É o sprite que a própria Guerra usa na placa da insígnia
 * (`Corrida/guerra/SpriteCavaloDaGuerra`): só desenho, sem banco.
 */
import { SpriteCavaloDaGuerra } from '@/components/Corrida/guerra/SpriteCavaloDaGuerra';
import { useCreators } from '../../theme/CreatorsProvider';

export default function ArteGuerra() {
  const { movimentoReduzido } = useCreators();

  return (
    <div className="creators-lab__vitrine" role="img" aria-label="O Cavalo da Guerra">
      <SpriteCavaloDaGuerra escala={0.9} animado={!movimentoReduzido} />
    </div>
  );
}
