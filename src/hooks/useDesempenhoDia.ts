/**
 * useDesempenhoDia — os dados do painel Desempenho do Dia.
 *
 * Substitui `useResumoDia`, que somava dinheiro a partir dos `acordos`. A troca
 * de fonte é a mudança central da versão 2.0 e está explicada em
 * `lib/desempenhoDia.ts`: em 14 dias medidos, o analítico da BookPlay somou
 * R$ 1.413.487 contra R$ 104.172 de acordos tabulados. Como a META é calibrada
 * contra o analítico, compará-la com a soma de acordos deixaria a barra vermelha
 * todo dia — inclusive num dia excelente.
 *
 * Aqui o dinheiro vem do ERP e a operação vem dos acordos. Cada faixa do painel
 * diz de onde veio o seu número.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { useEmpresa } from './useEmpresa';
import { useCargoPermissoes } from './useCargoPermissoes';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import {
  buscarAnaliticoPeriodo, somarPorDia, buscarAcordosDoDia,
  contarFormalizadosDoDia, buscarPixDoDia, buscarMetaDoEscopo,
  escopoDoPainel, diasAntes,
  type AcordoDoDia, type LinhaPixDia,
} from '@/services/desempenhoDia/desempenhoDia.service';
import {
  barraEstados, metaDoDia, variacao, mediaDiasUteisAnteriores,
  resumoPixDia, fatiasPorTag,
  type BarraEstados, type MetaDoDia, type Variacao,
  type ResumoPixDia, type FatiaTag,
} from '@/lib/desempenhoDia';
import { metaNaUnidade, type UnidadeValor } from '@/lib/unidadeValor';
import { isPerfilAdmin, isPerfilLider } from '@/lib/index';
import type { AcordoTag } from '@/lib/supabase';

/**
 * Dias corridos lidos para trás.
 *
 * Precisamos de 7 dias ÚTEIS anteriores, e 7 dias úteis podem estar espalhados
 * por até 11 corridos (dois fins de semana e um feriado). 14 dá margem sem
 * inflar a página.
 */
const JANELA_DIAS = 14;

export interface OperadorItem { id: string; nome: string }

export interface ParametrosDesempenhoDia {
  /** 'yyyy-MM-dd' */
  dia: string;
  /** `null` = todas as pessoas que eu enxergo. */
  operadorId: string | null;
  /** PaguePlay: H.O. ou bruto. Ignorado na BookPlay. */
  unidade: UnidadeValor;
  /** O setor tem a lógica Direto/Extra? Só então o bloco aparece. */
  temLogicaDiretoExtra: boolean;
  isPaguePlay: boolean;
  tags: AcordoTag[];
}

export interface DadosDesempenhoDia {
  carregando: boolean;

  // ── Faixa A: o dia em dinheiro (analítico/ERP) ──
  recebido: number;
  /** O mesmo valor na unidade oposta — a linha secundária. */
  recebidoOposto: number;
  meta: MetaDoDia | null;
  vsOntem: Variacao;
  vsMedia: Variacao;

  // ── Faixa B: a minha operação (acordos) ──
  barra: BarraEstados;
  formalizados: number;
  /**
   * Soma dos acordos PAGOS do dia — dos acordos, não do ERP.
   *
   * Serve ao rótulo do segmento verde da barra. Usar aqui o número da faixa A
   * seria a mistura de fontes que esta versão veio desfazer: na BookPlay os dois
   * diferem por mais de dez vezes.
   */
  valorPagoAcordos: number;

  // ── Faixa C: contexto ──
  diretoExtra: { direto: number; extra: number } | null;
  pix: ResumoPixDia | null;
  tags: FatiaTag[];

  operadores: OperadorItem[];
  podeVerOutros: boolean;
  refetch: () => Promise<void>;
}

const BARRA_VAZIA: BarraEstados = {
  pago: 0, aVerificar: 0, naoPago: 0, total: 0, conversao: null,
};
const SEM_VARIACAO: Variacao = { pct: null, base: 0 };

export function useDesempenhoDia(params: ParametrosDesempenhoDia): DadosDesempenhoDia {
  const { dia, operadorId, unidade, temLogicaDiretoExtra, isPaguePlay, tags } = params;
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();

  const cargo = perfil?.perfil ?? '';
  const ehAdmin = isPerfilAdmin(cargo);
  const ehLider = isPerfilLider(cargo);
  const ehDiretoria = cargo === 'diretoria';
  const podeVerOutros = ehAdmin || ehLider || ehDiretoria || temPermissao('ver_acordos_gerais');
  const vejoTodos = ehAdmin || ehDiretoria || temPermissao('ver_todos_setores');

  const [operadores, setOperadores] = useState<OperadorItem[]>([]);
  const [porDiaBruto, setPorDiaBruto] = useState<Record<string, number>>({});
  const [porDiaHo, setPorDiaHo]       = useState<Record<string, number>>({});
  const [acordos, setAcordos]         = useState<AcordoDoDia[]>([]);
  const [formalizados, setFormalizados] = useState(0);
  const [linhasPix, setLinhasPix]     = useState<LinhaPixDia[]>([]);
  const [metaMensal, setMetaMensal]   = useState<number | null>(null);
  const [feriados, setFeriados]       = useState<string[]>([]);
  const [carregando, setCarregando]   = useState(true);

  /**
   * Descarta resposta de uma busca antiga.
   *
   * Segurar `←` percorre vários dias em sequência e dispara uma busca por dia.
   * Sem este contador, a resposta mais lenta chega por último e o painel mostra
   * o dia errado — com a data certa no cabeçalho, que é o pior dos dois mundos.
   */
  const requisicao = useRef(0);

  /** O setor que recorta a leitura quando não vejo a empresa toda. */
  const setorDoRecorte = useMemo(
    () => (!vejoTodos && ehLider ? perfil?.setor_id ?? null : null),
    [vejoTodos, ehLider, perfil?.setor_id],
  );

  // ── Operadores do seletor ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      if (!empresa?.id || !podeVerOutros) { setOperadores([]); return; }

      let q = supabase
        .from('perfis')
        .select('id, nome')
        .eq('empresa_id', empresa.id)
        .in('perfil', ['operador', 'elite', 'gerencia'])
        .order('nome');

      if (setorDoRecorte) q = q.eq('setor_id', setorDoRecorte);

      const { data } = await q;
      if (cancelado) return;
      setOperadores(((data as OperadorItem[] | null) ?? []).map(o => ({ id: o.id, nome: o.nome })));
    }
    void carregar();
    return () => { cancelado = true; };
  }, [empresa?.id, podeVerOutros, setorDoRecorte]);

  const idsVisiveis = useMemo(() => operadores.map(o => o.id), [operadores]);
  const idsChave = idsVisiveis.join(',');

  const escopo = useMemo(
    () => escopoDoPainel({
      operadorSelecionado: operadorId,
      vejoTodos,
      meuId: perfil?.id ?? '',
      operadoresVisiveis: idsChave ? idsChave.split(',') : [],
    }),
    // `idsChave` no lugar do array: identidade estável evita refazer a busca a
    // cada render só porque o array é novo.
    [operadorId, vejoTodos, perfil?.id, idsChave],
  );

  /** Quando o escopo é uma pessoa só, o filtro desce ao banco. */
  const operadorDaQuery = operadorId ?? (podeVerOutros ? null : perfil?.id ?? null);

  const buscar = useCallback(async () => {
    if (!empresa?.id || !perfil?.id || !dia) { setCarregando(false); return; }

    const meu = ++requisicao.current;
    setCarregando(true);

    const [ano, mesNum] = dia.split('-').map(Number);

    try {
      const [analitico, doDia, qtdFormalizados, pix, meta, config] = await Promise.all([
        buscarAnaliticoPeriodo({
          empresaId: empresa.id,
          de: diasAntes(dia, JANELA_DIAS),
          ate: dia,
          operadorId: operadorDaQuery,
        }),
        buscarAcordosDoDia({
          empresaId: empresa.id, dia,
          operadorId: operadorDaQuery, setorId: setorDoRecorte,
        }),
        contarFormalizadosDoDia({
          empresaId: empresa.id, dia,
          operadorId: operadorDaQuery, setorId: setorDoRecorte,
        }),
        buscarPixDoDia({
          empresaId: empresa.id, dia, isPaguePlay,
          operadorId: operadorDaQuery, setorId: setorDoRecorte,
        }),
        buscarMetaDoEscopo({
          empresaId: empresa.id, mes: mesNum, ano,
          operadorId: operadorDaQuery,
          setorId: setorDoRecorte,
          operadoresDoEscopo: idsChave ? idsChave.split(',') : [],
        }),
        getMetasConfig(empresa.id, mesNum, ano),
      ]);

      if (meu !== requisicao.current) return;   // chegou tarde: outra data manda

      const somas = somarPorDia(analitico.linhas, escopo);
      setPorDiaBruto(somas.bruto);
      setPorDiaHo(somas.ho);
      setAcordos(doDia.acordos);
      setFormalizados(qtdFormalizados);
      setLinhasPix(pix);
      setMetaMensal(meta);
      setFeriados(config.data?.feriados ?? []);
    } catch (e) {
      if (meu !== requisicao.current) return;
      console.warn('[useDesempenhoDia]', e);
      setPorDiaBruto({}); setPorDiaHo({}); setAcordos([]);
      setFormalizados(0); setLinhasPix([]); setMetaMensal(null);
    } finally {
      if (meu === requisicao.current) setCarregando(false);
    }
  }, [
    empresa?.id, perfil?.id, dia, operadorDaQuery, setorDoRecorte,
    isPaguePlay, idsChave, escopo,
  ]);

  useEffect(() => { void buscar(); }, [buscar]);

  // ── Derivações ─────────────────────────────────────────────────────────────

  // A BookPlay tem `total_ho` zerado em toda linha: ler o campo H.O. lá daria
  // zero em tudo. O alternador nem aparece, e a unidade é sempre bruto.
  const usaHo = isPaguePlay && unidade === 'ho';
  const porDia = usaHo ? porDiaHo : porDiaBruto;
  const porDiaOposto = usaHo ? porDiaBruto : porDiaHo;

  const recebido = porDia[dia] ?? 0;
  const recebidoOposto = porDiaOposto[dia] ?? 0;

  const meta = useMemo(() => {
    // A meta é gravada em bruto; `metaNaUnidade` traduz. Mesma regra do Painel
    // de Metas — ver `lib/unidadeValor.ts`.
    const naUnidade = metaNaUnidade(metaMensal, usaHo ? 'ho' : 'bruto');
    return metaDoDia({
      metaMensal: naUnidade,
      mes: dia.slice(0, 7),
      feriados,
      realizadoNoDia: recebido,
    });
  }, [metaMensal, usaHo, dia, feriados, recebido]);

  const vsOntem = useMemo(() => {
    const anteriores = Object.keys(porDia).filter(d => d < dia).sort();
    const ontem = anteriores[anteriores.length - 1];
    return ontem ? variacao(recebido, porDia[ontem]) : SEM_VARIACAO;
  }, [porDia, dia, recebido]);

  const vsMedia = useMemo(() => {
    const media = mediaDiasUteisAnteriores({ porDia, dia, quantidade: 7, feriados });
    return variacao(recebido, media);
  }, [porDia, dia, feriados, recebido]);

  const barra = useMemo(() => barraEstados(acordos), [acordos]);

  const valorPagoAcordos = useMemo(
    () => acordos
      .filter(a => a.status === 'pago')
      .reduce((s, a) => s + (Number(a.valor) || 0), 0),
    [acordos],
  );

  const diretoExtra = useMemo(() => {
    if (!temLogicaDiretoExtra) return null;
    let direto = 0, extra = 0;
    for (const a of acordos) {
      if (a.status !== 'pago') continue;
      const valor = Number(a.valor) || 0;
      if (a.tipo_vinculo === 'extra') extra += valor;
      else direto += valor;
    }
    return { direto, extra };
  }, [temLogicaDiretoExtra, acordos]);

  const pix = useMemo(
    () => (isPaguePlay ? null : resumoPixDia(linhasPix)),
    [isPaguePlay, linhasPix],
  );

  const fatias = useMemo(
    () => fatiasPorTag(acordos.filter(a => a.status === 'pago'), tags),
    [acordos, tags],
  );

  return {
    carregando,
    recebido,
    recebidoOposto,
    meta,
    vsOntem,
    vsMedia,
    barra: carregando ? BARRA_VAZIA : barra,
    formalizados,
    valorPagoAcordos,
    diretoExtra,
    pix,
    tags: fatias,
    operadores,
    podeVerOutros,
    refetch: buscar,
  };
}
