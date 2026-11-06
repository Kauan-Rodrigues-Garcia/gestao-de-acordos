/**
 * A caixa do tempo do setor aberto no Calendário: lê a cidade do setor e a
 * previsão (`useClima`) e entrega à `CaixaDoTempo`. Quem troca de setor no
 * seletor passa a ver o tempo da cidade daquele setor.
 */
import type { PaletaGibi } from '@/lib/calendarioSetor';
import { useClima } from '@/hooks/useClima';
import { CaixaDoTempo } from './CaixaDoTempo';

export function TempoDoSetor({ setorId, paleta, hojeISO }: { setorId: string | null; paleta: PaletaGibi; hojeISO: string }) {
  const { cidade, previsao, geradoEm, carregando } = useClima(setorId);
  return (
    <CaixaDoTempo
      cidade={cidade}
      previsao={previsao}
      geradoEm={geradoEm}
      carregando={carregando}
      hojeISO={hojeISO}
      cores={paleta}
    />
  );
}
