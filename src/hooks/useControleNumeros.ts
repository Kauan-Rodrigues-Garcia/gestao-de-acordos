/**
 * useControleNumeros — tudo o que a área do Núcleo precisa, num lugar só.
 *
 * ## O que este hook NÃO decide
 *
 * Quem vê o quê. Isso é da RLS (`fn_numeros_visivel`), que já entrega
 * recortado. Filtrar de novo aqui criaria uma segunda régua para divergir da
 * primeira — a mesma lição de `useRhGestao`.
 *
 * O hook junta as peças (config, celulares, números) e cruza celular × números
 * para a tela poder mostrar o contador `4/6` sem uma segunda consulta por
 * aparelho.
 *
 * ## `loading` é da PRIMEIRA carga, não da releitura
 *
 * Ligá-lo a cada evento de realtime faria a tela inteira sumir e voltar toda
 * vez que alguém cadastrasse um número. A releitura reconcilia com
 * `reconciliarLista`: item que não mudou volta com a MESMA referência, e o
 * React não repinta. É a lição documentada em `useCargoPermissoes`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEmpresa } from '@/hooks/useEmpresa';
import { assinarTabela } from '@/lib/realtime';
import { reconciliarLista, reconciliarItem } from '@/lib/dadosVivos';
import { LIMITE_POR_CELULAR, vagasNoCelular } from '@/services/numeros/numerosRegras';
import {
  buscarConfig, listarCelulares, listarNumeros,
  type NumerosConfigRow, type CelularRow, type NumeroRow,
} from '@/services/numeros/numeros.service';

/** Um celular com o que a tela mostra ao lado dele. */
export interface CelularComNumeros {
  celular: CelularRow;
  numeros: NumeroRow[];
  /** Quantos ainda cabem. Zero quando o aparelho está cheio. */
  vagas: number;
  cheio: boolean;
}

interface Retorno {
  config: NumerosConfigRow | null;
  celulares: CelularRow[];
  numeros: NumeroRow[];
  /** Celulares já cruzados com os números de cada um. */
  aparelhos: CelularComNumeros[];
  /** Os que voltaram dos setores e esperam tratamento. */
  relancados: NumeroRow[];
  loading: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

export function useControleNumeros(): Retorno {
  const { empresa } = useEmpresa();
  const empresaId = empresa?.id ?? null;

  const [config, setConfig]       = useState<NumerosConfigRow | null>(null);
  const [celulares, setCelulares] = useState<CelularRow[]>([]);
  const [numeros, setNumeros]     = useState<NumeroRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [erro, setErro]           = useState<string | null>(null);

  const primeiraCarga = useRef(true);

  const carregar = useCallback(async () => {
    if (!empresaId) {
      setConfig(null); setCelulares([]); setNumeros([]); setLoading(false);
      return;
    }
    try {
      const [cfg, cels, nums] = await Promise.all([
        buscarConfig(empresaId),
        listarCelulares(empresaId),
        listarNumeros(empresaId),
      ]);
      setConfig(anterior => reconciliarItem(anterior, cfg));
      setCelulares(anterior => reconciliarLista(anterior, cels, { chave: c => c.id }));
      setNumeros(anterior => reconciliarLista(anterior, nums, { chave: n => n.id }));
      setErro(null);
    } catch (e) {
      setErro((e as { message?: string }).message ?? 'Não foi possível carregar.');
    } finally {
      if (primeiraCarga.current) {
        primeiraCarga.current = false;
        setLoading(false);
      }
    }
  }, [empresaId]);

  useEffect(() => { primeiraCarga.current = true; setLoading(true); }, [empresaId]);
  useEffect(() => { void carregar(); }, [carregar]);

  // Realtime nas três tabelas. O tópico leva a empresa porque as escutas são
  // filtradas por ela — dois consumidores de empresas diferentes não podem
  // compartilhar canal.
  useEffect(() => {
    if (!empresaId) return;
    return assinarTabela(
      {
        topico: `numeros:${empresaId}`,
        escutas: [
          { tabela: 'numeros_celulares', filtro: `empresa_id=eq.${empresaId}` },
          { tabela: 'numeros_whatsapp',  filtro: `empresa_id=eq.${empresaId}` },
          { tabela: 'numeros_config',    filtro: `empresa_id=eq.${empresaId}` },
        ],
      },
      {
        onEvento:      () => { void carregar(); },
        // O canal caiu e voltou: os eventos do intervalo se perderam, então a
        // releitura aqui não é redundante com a de cima.
        onReconectado: () => { void carregar(); },
      },
    );
  }, [empresaId, carregar]);

  const aparelhos = useMemo<CelularComNumeros[]>(() => {
    const porCelular = new Map<string, NumeroRow[]>();
    for (const n of numeros) {
      porCelular.set(n.celular_id, [...(porCelular.get(n.celular_id) ?? []), n]);
    }
    return celulares.map(celular => {
      const doAparelho = porCelular.get(celular.id) ?? [];
      return {
        celular,
        numeros: doAparelho,
        vagas: vagasNoCelular(doAparelho.length),
        cheio: doAparelho.length >= LIMITE_POR_CELULAR,
      };
    });
  }, [celulares, numeros]);

  // O que voltou dos setores. `motivo_retorno` é o que separa "nunca saiu" de
  // "voltou": os dois estão com `posse = 'nucleo'`, e só o segundo pede
  // tratamento.
  const relancados = useMemo(
    () => numeros.filter(n => n.posse === 'nucleo' && n.motivo_retorno !== null),
    [numeros],
  );

  return {
    config, celulares, numeros, aparelhos, relancados,
    loading, erro, recarregar: carregar,
  };
}
