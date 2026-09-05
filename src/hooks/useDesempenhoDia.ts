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
import { useAuth } from './useAuth';
import { useEmpresa } from './useEmpresa';
import { useCargoPermissoes } from './useCargoPermissoes';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import {
  buscarAnaliticoPeriodo, somarPorDia, buscarAcordosDoDia,
  contarFormalizadosDoDia, buscarPixDoDia, buscarMetaDoEscopo,
  resolverEscopoDoDia, aplicarEquipeEscolhida, diasAntes,
  type AcordoDoDia, type LinhaPixDia, type EscopoDoDia, type EquipeDoEscopo,
} from '@/services/desempenhoDia/desempenhoDia.service';
import {
  barraEstados, metaDoDia, variacao, mediaDiasUteisAnteriores,
  resumoPixDia, fatiasPorTag,
  type BarraEstados, type MetaDoDia, type Variacao,
  type ResumoPixDia, type FatiaTag,
} from '@/lib/desempenhoDia';
import { metaNaUnidade, type UnidadeValor } from '@/lib/unidadeValor';
import type { AcordoTag } from '@/lib/supabase';

/**
 * Dias corridos lidos para trás.
 *
 * Precisamos de 7 dias ÚTEIS anteriores, e 7 dias úteis podem estar espalhados
 * por até 11 corridos (dois fins de semana e um feriado). 14 dá margem sem
 * inflar a página.
 */
const JANELA_DIAS = 14;

export interface ParametrosDesempenhoDia {
  /**
   * O painel está aberto?
   *
   * Fechado, o hook não consulta nada. Parece detalhe e não é: desde que o
   * painel deixou de ser exclusivo da PaguePlay, ele é MONTADO em toda página —
   * o `AnimatePresence` esconde o conteúdo, mas a função do componente roda
   * igual, e com ela os hooks.
   *
   * Sem esta trava, abrir qualquer tela do sistema disparava a leitura de 15
   * dias de analítico (até 12 páginas de 1.000 linhas) para um painel que
   * ninguém pediu. Era esse trabalho competindo com o resto que deixava a
   * navegação pesada.
   */
  aberto: boolean;
  /** 'yyyy-MM-dd' */
  dia: string;
  /** Equipe escolhida no seletor. `null` = todas as que o escopo alcança. */
  equipeId: string | null;
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

  /** O que o painel está somando: «Equipe Matheus», «Setor Receptivo»… */
  escopoRotulo: string;
  /** As equipes que dá para isolar. Menos de duas = sem seletor na tela. */
  equipes: EquipeDoEscopo[];
  refetch: () => Promise<void>;
}

const SEM_VARIACAO: Variacao = { pct: null, base: 0 };

export function useDesempenhoDia(params: ParametrosDesempenhoDia): DadosDesempenhoDia {
  const {
    aberto, dia, equipeId, unidade, temLogicaDiretoExtra, isPaguePlay, tags,
  } = params;
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();

  const { temPermissao } = useCargoPermissoes();
  // O painel vive no Dashboard, entao usa a regua do Dashboard. Memoizado
  // porque `niveisLiberados` devolve um array novo a cada chamada e ele entra
  // na dependencia do efeito abaixo.
  const niveis = useMemo(
    () => niveisLiberados('dashboard', temPermissao),
    [temPermissao],
  );

  const [escopoBase, setEscopoBase] = useState<EscopoDoDia | null>(null);
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

  // ── Escopo: consequência dos níveis da aba, resolvido uma vez ─────────────
  // A regra inteira mora em `resolverEscopoDoDia`. Aqui só se guarda o
  // resultado, para as seis consultas do dia partirem todas do mesmo recorte.
  useEffect(() => {
    let cancelado = false;
    async function resolver() {
      if (!aberto || !empresa?.id || !perfil?.id) return;
      const r = await resolverEscopoDoDia({
        empresaId: empresa.id,
        perfilId: perfil.id,
        niveis,
        setorId: perfil.setor_id ?? null,
      });
      if (!cancelado) setEscopoBase(r);
    }
    void resolver();
    return () => { cancelado = true; };
  }, [aberto, empresa?.id, perfil?.id, perfil?.setor_id, niveis]);

  /**
   * O escopo efetivo: a base do cargo, recortada pela equipe escolhida.
   *
   * A base é resolvida UMA vez, com uma ida ao banco; trocar de equipe no
   * seletor é aritmética de conjunto sobre o que já veio, sem consulta nova de
   * membros.
   */
  const escopoDoDia = useMemo(
    () => (escopoBase ? aplicarEquipeEscolhida(escopoBase, equipeId) : null),
    [escopoBase, equipeId],
  );

  /**
   * Identidade estável do escopo.
   *
   * O objeto vem de uma consulta, então é novo a cada resolução; sem uma chave
   * de texto nas dependências, o `useCallback` da busca mudaria de identidade a
   * cada render e o painel entraria em laço de consulta.
   */
  const escopoChave = escopoDoDia
    ? `${escopoDoDia.rotulo}|${escopoDoDia.operadorId ?? ''}|${escopoDoDia.setorId ?? ''}|`
      + (escopoDoDia.escopo.tipo === 'equipe'
        ? [...escopoDoDia.escopo.operadores].sort().join(',')
        : escopoDoDia.escopo.tipo)
    : '';

  const buscar = useCallback(async () => {
    // Fechado: sai sem mexer em `carregando`. Zerá-lo aqui faria a primeira
    // abertura mostrar «nenhum acordo» por um quadro, antes de a busca começar —
    // um vazio que parece resposta.
    if (!aberto) return;
    // Sem escopo resolvido não há o que buscar: sair antes evita uma primeira
    // rodada com o recorte errado, que apareceria como número piscando.
    if (!empresa?.id || !perfil?.id || !dia || !escopoDoDia) { return; }

    const meu = ++requisicao.current;
    setCarregando(true);

    const [ano, mesNum] = dia.split('-').map(Number);
    const { operadorId: opDaQuery, setorId: setorDaQuery } = escopoDoDia;
    const membros = escopoDoDia.escopo.tipo === 'equipe'
      ? [...escopoDoDia.escopo.operadores]
      : [];

    try {
      const [analitico, doDia, qtdFormalizados, pix, meta, config] = await Promise.all([
        buscarAnaliticoPeriodo({
          empresaId: empresa.id,
          de: diasAntes(dia, JANELA_DIAS),
          ate: dia,
          operadorId: opDaQuery,
        }),
        buscarAcordosDoDia({
          empresaId: empresa.id, dia,
          operadorId: opDaQuery, setorId: setorDaQuery,
          operadores: membros,
        }),
        contarFormalizadosDoDia({
          empresaId: empresa.id, dia,
          operadorId: opDaQuery, setorId: setorDaQuery,
          operadores: membros,
        }),
        buscarPixDoDia({
          empresaId: empresa.id, dia, isPaguePlay,
          operadorId: opDaQuery, setorId: setorDaQuery,
          operadores: membros,
        }),
        buscarMetaDoEscopo({
          empresaId: empresa.id, mes: mesNum, ano,
          operadorId: opDaQuery,
          setorId: setorDaQuery,
          operadoresDoEscopo: membros,
        }),
        getMetasConfig(empresa.id, mesNum, ano),
      ]);

      if (meu !== requisicao.current) return;   // chegou tarde: outra data manda

      const somas = somarPorDia(analitico.linhas, escopoDoDia.escopo);
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
    // `escopoChave` e não `escopoDoDia`: o objeto é novo a cada resolução, e a
    // referência nas dependências poria a busca em laço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, empresa?.id, perfil?.id, dia, isPaguePlay, escopoChave]);

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
    /*
     * Sem zerar durante a releitura.
     *
     * Isto era `carregando ? BARRA_VAZIA : barra`, e a barra era o ÚNICO campo
     * que voltava a zero enquanto a consulta corria — todos os outros guardam
     * o valor anterior até o novo chegar. Na primeira carga não fazia
     * diferença (sem acordos, a barra já nasce vazia); ao trocar de dia, fazia:
     * a faixa do meio despencava para zero e voltava, sozinha, enquanto o
     * resto do painel continuava mostrando o dia anterior.
     */
    barra,
    formalizados,
    valorPagoAcordos,
    diretoExtra,
    pix,
    tags: fatias,
    escopoRotulo: escopoDoDia?.rotulo ?? '',
    equipes: escopoBase?.equipes ?? [],
    refetch: buscar,
  };
}
