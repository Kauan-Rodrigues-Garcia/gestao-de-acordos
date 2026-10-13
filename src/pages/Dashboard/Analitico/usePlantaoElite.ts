/**
 * usePlantaoElite — o estado do quadro do Plantão Elite: o dia, a resposta do
 * banco, a navegação entre plantões e o reler pelo sinal do analítico.
 *
 * Fora de `PlantaoElite.tsx` para o app do celular usar o mesmo (13/10/2026:
 * a gerência do Receptivo vê o plantão no app).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getTodayISO } from '@/lib/index';
import { assinarSinal } from '@/lib/sinais';
import {
  buscarPlantaoElite, faixasApuradas, horaAgoraSaoPaulo, montarQuadroElite,
  outroDiaDePlantao, plantaoDoDia, primeiroNome, ultimoDiaDoPlantao,
  type RespostaPlantaoElite,
} from '@/services/plantaoElite/plantaoElite';

export function usePlantaoElite(empresaId: string) {
  const hoje = getTodayISO();
  const [data, setData] = useState(hoje);
  const [resposta, setResposta] = useState<RespostaPlantaoElite | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  /** A última busca pedida: resposta de busca antiga não sobrescreve a nova. */
  const pedido = useRef(0);
  /** A data de entrada já foi acertada para o plantão da pessoa? Uma vez só. */
  const diaAcertado = useRef(false);

  const carregar = useCallback(async (silencioso = false) => {
    const meu = ++pedido.current;
    if (!silencioso) setCarregando(true);
    try {
      const r = await buscarPlantaoElite(empresaId, data);
      if (meu !== pedido.current) return;
      setResposta(r);
      setErro(null);

      // Quem é da dupla e abriu a aba em dia da outra dupla cai no último dia
      // do próprio plantão — o quadro de hoje seria o de um dia sem plantão.
      if (!diaAcertado.current) {
        diaAcertado.current = true;
        if (r.sou_da_dupla && plantaoDoDia(data) !== r.plantao) {
          setData(ultimoDiaDoPlantao(data, r.plantao));
        }
      }
    } catch (e) {
      if (meu !== pedido.current) return;
      setErro(e instanceof Error ? e.message : 'Não foi possível ler o plantão.');
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  }, [empresaId, data]);

  useEffect(() => { void carregar(); }, [carregar]);

  // O robô do 59 sobe o analítico de hora em hora: o sinal do banco avisa, e o
  // quadro relê em silêncio (o portão do sinal já espaça as releituras).
  useEffect(() => {
    const reler = () => { void carregar(true); };
    return assinarSinal('analitico', empresaId, { onMudou: reler, onReconectado: reler });
  }, [empresaId, carregar]);

  const quadro = useMemo(() => (resposta
    ? montarQuadroElite(resposta, faixasApuradas(data, hoje, horaAgoraSaoPaulo()))
    : null), [resposta, data, hoje]);

  // A dupla da pessoa manda na navegação: as setas pulam os dias da outra.
  const plantaoFixo = resposta?.sou_da_dupla ? resposta.plantao : null;
  const anterior = outroDiaDePlantao(data, -1, plantaoFixo);
  const seguinte = outroDiaDePlantao(data, 1, plantaoFixo);
  const diaDeEntrada = plantaoFixo ? ultimoDiaDoPlantao(hoje, plantaoFixo) : hoje;
  const foraDoPlantao = !!resposta && plantaoDoDia(data) !== resposta.plantao;
  /** Nome do PNG: o dia e a dupla. */
  const nomeArquivo = resposta
    ? `plantao-elite-${data}-${resposta.membros.map(m => primeiroNome(m.nome)).join('-')}.png`
    : `plantao-elite-${data}.png`;

  return {
    hoje, data, setData, resposta, quadro, carregando, erro, carregar,
    plantaoFixo, anterior, seguinte, diaDeEntrada, foraDoPlantao, nomeArquivo,
  };
}
