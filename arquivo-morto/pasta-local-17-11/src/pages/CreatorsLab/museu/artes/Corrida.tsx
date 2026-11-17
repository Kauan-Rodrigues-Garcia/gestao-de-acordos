/**
 * Arte da sala «Corrida da Sorte» — três bichinhos, desenhados pelo motor da
 * própria corrida (`Corrida/motor/bichinhos`).
 *
 * O motor é só desenho e sorteio de aparência: não lê o banco. Os três
 * bichinhos saem de uma semente fixa do Museu, não da escolha de ninguém.
 */
import { MiniBichinho } from '@/components/Corrida/MiniBichinho';
import { thumb } from '@/components/Corrida/motor/bichinhos';
import { BICHINHOS_DO_MUSEU } from '../bichinhos';
import { useCreators } from '../../theme/CreatorsProvider';

export default function ArteCorrida() {
  const { movimentoReduzido } = useCreators();

  return (
    <div className="creators-lab__vitrine" role="img" aria-label="Três bichinhos da Corrida da Sorte">
      {BICHINHOS_DO_MUSEU.map((est, i) => (
        // Com movimento reduzido, a foto parada do bichinho em vez do que pisca e pula.
        movimentoReduzido
          ? <img key={i} src={thumb(est, 96)} alt="" width={96} height={96} />
          : <MiniBichinho key={i} est={est} tamanho={96} fase={i * 1.3} />
      ))}
    </div>
  );
}
