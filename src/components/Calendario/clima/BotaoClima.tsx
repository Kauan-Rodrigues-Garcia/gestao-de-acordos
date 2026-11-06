/**
 * O botão do tempo ligado à previsão (06/11/2026): a cidade do setor
 * (`useClima`) e o card, que só é baixado no primeiro clique — o cenário e a
 * caixa não pesam no pacote de entrada do app.
 *
 * Sem previsão (ainda não chegou, ou o provedor caiu), o botão não aparece.
 */
import { useCallback, useMemo, useState, type ComponentType } from 'react';
import type { PaletaGibi } from '@/lib/calendarioSetor';
import { useClima } from '@/hooks/useClima';
import { estacaoDoDia, resumoDoClima, varianteDoDia } from '@/lib/clima';
import { VARIACOES_DO_SOL } from './personagens';
import { BotaoDoTempo, type ClimaDoBotao } from './BotaoDoTempo';
import type { PropsCaixaDoTempo } from './CaixaDoTempo';

let caixaCarregada: ComponentType<PropsCaixaDoTempo> | null = null;

export function BotaoClima({ setorId, paleta, hojeISO, ativo }: {
  setorId: string | null;
  paleta: PaletaGibi;
  hojeISO: string;
  ativo: boolean;
}) {
  const { cidade, previsao, geradoEm, carregando } = useClima(setorId, ativo);
  const [aberto, setAberto] = useState(false);
  const [Caixa, setCaixa] = useState<ComponentType<PropsCaixaDoTempo> | null>(() => caixaCarregada);
  const [falhou, setFalhou] = useState(false);

  const clima = useMemo<ClimaDoBotao | null>(() => {
    if (!cidade || !previsao) return null;
    return {
      condicao: previsao.agora.condicao,
      noite: previsao.agora.noite,
      temp: previsao.agora.temp,
      estacao: estacaoDoDia(hojeISO),
      variante: varianteDoDia(hojeISO, `sol-${cidade}`, VARIACOES_DO_SOL),
      resumo: resumoDoClima(cidade, previsao),
    };
  }, [cidade, previsao, hojeISO]);

  const alternar = useCallback(() => {
    setAberto(v => !v);
    if (caixaCarregada) return;
    setFalhou(false);
    import('./CaixaDoTempo')
      .then(m => { caixaCarregada = m.CaixaDoTempo; setCaixa(() => m.CaixaDoTempo); })
      .catch(() => setFalhou(true));
  }, []);
  const fechar = useCallback(() => setAberto(false), []);

  if (!ativo || !clima) return null;

  return (
    <BotaoDoTempo paleta={paleta} clima={clima} aberto={aberto} onAlternar={alternar} onFechar={fechar}>
      {Caixa ? (
        <Caixa cidade={cidade} previsao={previsao} geradoEm={geradoEm} carregando={carregando} hojeISO={hojeISO} cores={paleta} />
      ) : (
        <section className="gb-box cl-box">
          <p className="gb-vazio">{falhou ? 'Não deu para abrir agora. Clique de novo.' : 'Olhando o céu…'}</p>
        </section>
      )}
    </BotaoDoTempo>
  );
}
