/**
 * useCargaVigente — o relatório vigente, lido uma vez para quem precisar dele.
 *
 * Duas abas do Painel Diretoria do Comercial fazem a mesma pergunta ao mesmo
 * arquivo: «Setores a vincular» quer saber quanto dinheiro cada franquia
 * trouxe, e «Pessoas do relatório» quer saber quem vendeu. As duas leem
 * `vendas_relatorio` do MESMO lote, e cada uma buscando por conta própria
 * significaria dois downloads de sete mil linhas para desenhar duas telas.
 *
 * ## Só lê quando alguém abre a aba
 *
 * `ativo: false` congela. As abas do painel ficam montadas depois de visitadas
 * (é o desenho da cobrança), e sem essa trava a primeira visita a qualquer aba
 * puxaria o relatório inteiro para sempre.
 *
 * ## A carga escolhida é a do GERAL, e não a prévia
 *
 * O geral é o número oficial — é dele que sai o dinheiro do setor. A prévia do
 * setor existe para enxergar a venda ainda aberta, e misturá-la aqui faria a
 * mesma venda aparecer duas vezes. Sem geral vigente, a prévia serve de
 * reserva, e a tela diz que está olhando a prévia.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  buscarLotes, buscarFranquias, buscarLinhasDoLote,
  type Lote, type Franquia, type LinhaGravada,
} from '@/services/vendas/importacaoVendas.service';

export interface CargaVigente {
  /** O lote lido — `null` enquanto não há carga vigente nenhuma. */
  lote: Lote | null;
  /** Todas as cargas vigentes, para o seletor da tela. */
  vigentes: Lote[];
  linhas: LinhaGravada[];
  franquias: Franquia[];
  carregando: boolean;
  erro: string | null;
  /** Trocar a carga que está sendo lida. */
  escolher: (loteId: string) => void;
  recarregar: () => void;
}

/** Geral primeiro, depois a prévia; dentro de cada origem, o mês mais novo. */
function ordenar(lotes: readonly Lote[]): Lote[] {
  return [...lotes].sort((a, b) =>
    (a.origem === b.origem ? 0 : a.origem === 'geral' ? -1 : 1)
    || b.mes.localeCompare(a.mes));
}

export function useCargaVigente(empresaId: string | null, ativo: boolean): CargaVigente {
  const [vigentes, setVigentes] = useState<Lote[]>([]);
  const [franquias, setFranquias] = useState<Franquia[]>([]);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<LinhaGravada[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!empresaId || !ativo) return;
    let vivo = true;
    void Promise.all([buscarLotes(empresaId), buscarFranquias(empresaId)]).then(([l, f]) => {
      if (!vivo) return;
      const abertos = ordenar(l.lotes.filter(x => x.estado === 'vigente'));
      setVigentes(abertos);
      setFranquias(f.franquias);
      setEscolhido(atual => (atual && abertos.some(x => x.id === atual) ? atual : abertos[0]?.id ?? null));
      if (l.erro) setErro(l.erro);
    });
    return () => { vivo = false; };
  }, [empresaId, ativo, versao]);

  const lote = vigentes.find(l => l.id === escolhido) ?? null;
  const loteId = lote?.id ?? null;
  const loteOrigem = lote?.origem ?? null;

  useEffect(() => {
    if (!loteId || !loteOrigem || !ativo) { setLinhas([]); return; }
    let vivo = true;
    setCarregando(true);
    void buscarLinhasDoLote({ id: loteId, origem: loteOrigem }).then(r => {
      if (!vivo) return;
      setLinhas(r.linhas);
      setErro(r.erro);
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, [loteId, loteOrigem, ativo, versao]);

  const recarregar = useCallback(() => setVersao(v => v + 1), []);

  return {
    lote, vigentes, linhas, franquias, carregando, erro,
    escolher: setEscolhido, recarregar,
  };
}
