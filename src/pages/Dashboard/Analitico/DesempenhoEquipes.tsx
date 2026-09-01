/**
 * DesempenhoEquipes — aba do Painel do Líder (os dois tenants), versão 2.0.
 *
 * Um card por equipe e um consolidado por setor: quem lidera, o acumulado do
 * analítico, a barra que põe acumulado, esperado-até-hoje e meta no mesmo eixo, e
 * a projeção. No clique, o card abre com os degraus de quartil, o ritmo
 * necessário no que resta do mês e a distribuição das pessoas.
 *
 * ## Duas responsabilidades que saíram daqui
 *
 * **As contas** foram para `desempenhoEquipe.ts` e **o card** para
 * `CardEquipe.tsx`. Este arquivo ficou com o que é dele: buscar dado, montar as
 * fontes e decidir quais cards aparecem.
 *
 * **O recorte** é do pai. A prop `setorId` é AUTORITATIVA: `null` significa
 * "todos os setores", e nada aqui a completa com o setor do próprio perfil.
 * Fazer isso era o defeito que mostrava um setor só à diretoria — o pai dizia
 * "todos" e este arquivo respondia com `setorId ?? perfil?.setor_id`. Ver
 * `escopoDoPainel.ts`.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Building2, Headset, Pencil, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { QuartilConfig } from '@/lib/supabase';
import { getTodayISO, PP_HO_PERCENTUAL, PERFIS_QUE_CONTAM_NO_RECEBIMENTO } from '@/lib/index';
import { useTenant } from '@/lib/tenant-config';
import { assinarTabela } from '@/lib/realtime';
import { reconciliarMapa } from '@/lib/dadosVivos';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { salvarFotoSetor, type CampoFotoSetor } from '@/services/setores/fotoSetor.service';
import {
  buscarContribuicoesReceptivo, salvarContribuicaoReceptivo,
  type ContribuicaoReceptivo,
} from '@/services/analitico/contribuicaoReceptivo.service';
import { diasUteisDoMes, diasUteisDecorridos, QUARTIS_PADRAO } from '@/lib/diasUteis';
import {
  mapaSetorDaEquipe, setoresDoOperador, operadoresDaEquipe, operadoresDoSetor,
  type ResumoOperadorAnalitico, type EquipeAnalitico, type OperadorEquipeInfo,
} from '@/services/analitico/analitico.service';
import { setorSomaPorUsuarios } from '@/services/analitico/escopoAnalitico';
import { aplicarOrdemSetores } from '@/lib/setores-ordem';
import { CardEquipe, type LiderInfo } from './CardEquipe';
import { enriquecerOperadores, type OperadorNaEquipe } from './desempenhoEquipe';
import { lideresDaEquipe, type PerfilLider } from './lideresDaEquipe';

interface DesempenhoEquipesProps {
  empresaId: string;
  mes: string;                 // 'yyyy-MM'
  /**
   * Setor em foco. `null` = todos os setores.
   *
   * Obrigatória de propósito: era opcional, e o valor ausente virava um
   * `?? perfil?.setor_id` que desfazia a decisão do pai. Com o tipo exigindo o
   * valor, quem renderiza precisa dizer o que quer.
   */
  setorId: string | null;
  /** Equipe em foco. `null` = todas as equipes do setor. */
  equipeId?: string | null;
  equipes: EquipeAnalitico[];
  resumos: ResumoOperadorAnalitico[];
  operadorEquipeMap: Record<string, OperadorEquipeInfo>;
  /** Equipes em que cada operador é CLONE — o recebimento dele soma nelas também. */
  equipesExtrasPorOperador?: Record<string, string[]>;
  /** Total dos órfãos (sem operador) por setor — entram no card do setor. */
  orfaosPorSetor?: Record<string, { total: number; qtd: number }>;
  /** Total do RELATÓRIO por setor (soma das linhas carimbadas). Fonte do card
   *  do setor NORMAL — clones não afetam. */
  totalPorSetor?: Record<string, { total: number; ho: number; qtd: number }>;
  /** Ids dos setores ALTERNATIVOS: total = soma dos membros/clones, não do relatório. */
  setoresAlternativos?: Set<string>;
  /** PaguePlay: card do setor = soma dos operadores (analítico), não o total
   *  do relatório carimbado por setor_id. Vale para TODOS os setores. */
  setorSomaMembros?: boolean;
  loading: boolean;
  /** Nome da fonte no rodapé (padrão: "relatório analítico"). */
  fonteLabel?: string;
}

interface MetaRow { tipo: string; referencia_id: string; meta_valor: number }

/** Identidade de quem conta no recebimento — alimenta a área expandida. */
interface IdentidadeOperador { nome: string; fotoUrl: string | null }

// ── Contribuição Receptivo (card manual por setor — BookPlay) ─────────────────
// Card visual idêntico ao dos demais, preenchido À MÃO (acumulado + meta).
//
// O valor agora vive no banco (`contribuicao_receptivo`, migration 20260730a):
// uma linha por (empresa, setor, mês), compartilhada — se um líder edita, todos
// veem, na hora, via realtime. Antes ficava em `localStorage`, então existia só
// no navegador de quem digitou: dois líderes do mesmo setor viam números
// diferentes e trocar de máquina zerava o card.
//
// O localStorage sobrevive apenas como fallback enquanto a migration não é
// aplicada — o card continua funcionando como antes em vez de ficar vazio.

/**
 * Quem pode editar. Espelha EXATAMENTE o array das policies de escrita da
 * migration 20260730a — os dois precisam mudar juntos, senão o botão aparece e
 * o salvamento é recusado pela RLS.
 *
 * Não usa `isPerfilAdminOuLider`: aquele helper inclui `ouvidoria` (outra
 * trilha) e deixa `diretoria` de fora.
 */
const PERFIS_EDITA_RECEPTIVO = [
  'lider', 'elite', 'gerencia', 'diretoria', 'administrador', 'super_admin',
] as const;

function podeEditarReceptivo(perfil: string | null | undefined): boolean {
  return !!perfil && (PERFIS_EDITA_RECEPTIVO as readonly string[]).includes(perfil);
}

// ── Fallback local (só enquanto a migration 20260730a não é aplicada) ─────────

function chaveContribuicaoLocal(empresaId: string, setorId: string, mes: string): string {
  return `contribuicao-receptivo::${empresaId}::${setorId}::${mes}`;
}

function lerContribuicaoLocal(
  empresaId: string, setorId: string, mes: string,
): ContribuicaoReceptivo | null {
  try {
    const raw = localStorage.getItem(chaveContribuicaoLocal(empresaId, setorId, mes));
    if (!raw) return null;
    const v = JSON.parse(raw) as ContribuicaoReceptivo;
    if (typeof v?.acumulado !== 'number') return null;
    return { acumulado: v.acumulado, meta: Number(v.meta) || 0 };
  } catch { return null; }
}

function gravarContribuicaoLocal(
  empresaId: string, setorId: string, mes: string, valores: ContribuicaoReceptivo,
): void {
  try {
    localStorage.setItem(chaveContribuicaoLocal(empresaId, setorId, mes), JSON.stringify(valores));
  } catch { /* noop */ }
}

/** Aceita "12.345,67", "12345,67" ou "12345.67". */
function parseValorBR(s: string): number {
  const limpo = s.trim().replace(/[R$\s]/g, '');
  if (!limpo) return 0;
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo;
  const n = parseFloat(normalizado);
  return isNaN(n) ? 0 : n;
}

/** Número → string editável no formato BR ("1234.5" → "1234,5"). */
function paraInput(v: number): string {
  return v > 0 ? String(v).replace('.', ',') : '';
}

function CardContribuicaoReceptivo({
  dados, totalUteis, decorridos, quartis, podeEditar, salvando, somenteLocal, onSalvar,
  foto, onEditarFoto, salvandoFoto,
}: {
  dados: ContribuicaoReceptivo | undefined;
  totalUteis: number;
  decorridos: number;
  quartis: QuartilConfig[];
  podeEditar: boolean;
  salvando: boolean;
  /** true = migration pendente, o valor não é compartilhado ainda. */
  somenteLocal: boolean;
  onSalvar: (valores: ContribuicaoReceptivo) => void;
  /** Foto própria do card (setores.foto_receptivo_url), igual à do setor. */
  foto: string | null;
  onEditarFoto?: () => void;
  salvandoFoto?: boolean;
}) {
  const [editando, setEditando]         = useState(false);
  const [acumuladoStr, setAcumuladoStr] = useState('');
  const [metaStr, setMetaStr]           = useState('');

  function abrirEdicao() {
    setAcumuladoStr(paraInput(dados?.acumulado ?? 0));
    setMetaStr(paraInput(dados?.meta ?? 0));
    setEditando(true);
  }

  function salvar() {
    onSalvar({ acumulado: parseValorBR(acumuladoStr), meta: parseValorBR(metaStr) });
    setEditando(false);
  }

  // `relative` + botão absoluto: o card ocupa a largura TODA, igual aos outros.
  // Antes o botão era um irmão em flex, então roubava largura e este card ficava
  // visivelmente menor que os do setor e das equipes.
  return (
    <div className="relative">
      {/* Sem `operadores`: o valor é digitado à mão e não tem pessoas atrás
          dele. O card fica não expansível em vez de abrir uma área vazia. */}
      <CardEquipe
        titulo="Contribuição Receptivo"
        subtitulo={somenteLocal ? 'Manual · só neste navegador' : 'Preenchido manualmente'}
        acumulado={dados?.acumulado ?? 0}
        meta={dados && dados.meta > 0 ? dados.meta : null}
        totalUteis={totalUteis}
        decorridos={decorridos}
        quartis={quartis}
        avatarProprio={{
          foto, onEditar: onEditarFoto, salvando: salvandoFoto,
          Icone: Headset, rotulo: 'Foto do Receptivo',
        }}
      />

      {/* Botão fora do card: sentado no canto superior direito, para além da
          borda. Some para quem não pode editar (a RLS recusaria de todo jeito). */}
      {podeEditar && !editando && (
        <Button
          variant="outline"
          size="icon"
          className="absolute -top-3 -right-3 h-8 w-8 rounded-full shadow-md bg-card z-10"
          title="Preencher Contribuição Receptivo"
          onClick={abrirEdicao}
          disabled={salvando}
        >
          {salvando
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Pencil className="w-3.5 h-3.5" />}
        </Button>
      )}

      {/* Formulário como camada sobreposta, não como irmão em flex: abrir a
          edição não muda mais o tamanho do card. */}
      {podeEditar && editando && (
        <div className="absolute top-3 right-3 z-20 w-48 rounded-xl border border-border bg-card p-3 space-y-2 shadow-xl">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Headset className="w-3 h-3" /> Receptivo
          </p>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Acumulado (R$)</label>
            <Input
              autoFocus
              inputMode="decimal"
              placeholder="0,00"
              value={acumuladoStr}
              onChange={e => setAcumuladoStr(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') setEditando(false); }}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Meta (R$)</label>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={metaStr}
              onChange={e => setMetaStr(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') setEditando(false); }}
              className="h-7 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5 pt-0.5">
            <Button size="sm" className="h-6 px-2 text-[11px] gap-1 flex-1" onClick={salvar}>
              <Check className="w-3 h-3" /> Salvar
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] gap-1"
              onClick={() => setEditando(false)}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Aba ───────────────────────────────────────────────────────────────────────

export function DesempenhoEquipes({
  empresaId, mes, setorId, equipeId = null, equipes, resumos, operadorEquipeMap,
  equipesExtrasPorOperador = {}, orfaosPorSetor = {},
  totalPorSetor = {}, setoresAlternativos = new Set(), setorSomaMembros = false, loading,
  fonteLabel = 'relatório analítico',
}: DesempenhoEquipesProps) {
  const { perfil } = useAuth();
  const isPP = useTenant().isPaguePlay;
  // `setorId` vem do pai e vale como está — `null` é "todos os setores". Não há
  // fallback para `perfil.setor_id`: era ele que desfazia a decisão do pai e
  // mostrava um setor só à diretoria. Ver o cabeçalho do arquivo.
  const setorEfetivo = setorId;
  const [metas, setMetas]       = useState<MetaRow[]>([]);
  const [feriados, setFeriados] = useState<string[]>([]);
  const [quartis, setQuartis]   = useState<QuartilConfig[]>(QUARTIS_PADRAO);
  // metas_config_mes.contar_dia_atual — padrão false (o dia de hoje ainda corre)
  const [contarHoje, setContarHoje] = useState(false);
  const [lideres, setLideres]   = useState<Record<string, LiderInfo[]>>({});  // equipe_id → líderes (inclui clones)
  const [setores, setSetores]   = useState<Record<string, string>>({});    // setor_id → nome
  // Quem conta no recebimento: nome e foto para a área expandida do card.
  const [identidade, setIdentidade] = useState<Record<string, IdentidadeOperador>>({});
  // setor_id → foto. Duas fotos por setor: a do card do placar e a do card
  // "Contribuição Receptivo".
  const [setorFotos, setSetorFotos]         = useState<Record<string, string | null>>({});
  const [receptivoFotos, setReceptivoFotos] = useState<Record<string, string | null>>({});
  // Upload das fotos (bucket 'perfis') — um input só para os dois cards, o
  // alvo diz qual setor e qual dos dois campos está sendo trocado.
  const inputFotoSetorRef = useRef<HTMLInputElement>(null);
  const [uploadAlvo, setUploadAlvo] = useState<{ setorId: string; campo: CampoFotoSetor } | null>(null);
  const [salvandoFotoSetor, setSalvandoFotoSetor] = useState(false);
  const [carregado, setCarregado] = useState(false);

  // ── Contribuição Receptivo (BookPlay) ─────────────────────────────────────
  // O dado é do PAI, não de cada card: uma query cobre o mês inteiro (a aba
  // renderiza vários setores para admin/diretoria sem setor) e uma assinatura de
  // realtime serve a aba toda. Na versão anterior cada card lia o próprio
  // localStorage e reportava de volta pelo `onReport`.
  const [contrib, setContrib]               = useState<Record<string, ContribuicaoReceptivo>>({});
  const [contribDbAtiva, setContribDbAtiva] = useState(true);
  const [salvandoContrib, setSalvandoContrib] = useState<string | null>(null);
  const podeEditarContrib = podeEditarReceptivo(perfil?.perfil);

  const recarregarContrib = useCallback(async () => {
    if (isPP) return;
    const { porSetor, dbAtiva } = await buscarContribuicoesReceptivo(empresaId, mes);
    setContribDbAtiva(dbAtiva);
    // Reconciliado: o evento de realtime chega a cada tecla salva do outro
    // lado, e sem isto todo cartao de equipe do setor re-renderizaria com
    // exatamente os mesmos numeros dentro.
    if (dbAtiva) { setContrib(atual => reconciliarMapa(atual, porSetor)); return; }
    // Migration pendente → localStorage antigo, setor por setor.
    const local: Record<string, ContribuicaoReceptivo> = {};
    for (const sid of Object.keys(setores)) {
      const v = lerContribuicaoLocal(empresaId, sid, mes);
      if (v) local[sid] = v;
    }
    setContrib(local);
  }, [isPP, empresaId, mes, setores]);

  // Lido por ref na assinatura de realtime: `recarregarContrib` muda quando os
  // setores carregam, e isso não deve derrubar e recriar o canal.
  const recarregarContribRef = useRef(recarregarContrib);
  recarregarContribRef.current = recarregarContrib;

  useEffect(() => { void recarregarContrib(); }, [recarregarContrib]);

  // "Se um editar, edita para todos": o evento chega por WebSocket e a aba relê.
  useEffect(() => {
    if (isPP || !contribDbAtiva) return;
    return assinarTabela(
      {
        topico:  `rt-contrib-receptivo-${empresaId}`,
        escutas: [{ tabela: 'contribuicao_receptivo', filtro: `empresa_id=eq.${empresaId}` }],
      },
      {
        onEvento:      () => { void recarregarContribRef.current(); },
        onReconectado: () => { void recarregarContribRef.current(); },
      },
    );
  }, [isPP, contribDbAtiva, empresaId]);

  const salvarContrib = useCallback(async (sid: string, valores: ContribuicaoReceptivo) => {
    setSalvandoContrib(sid);
    try {
      if (!contribDbAtiva) {
        gravarContribuicaoLocal(empresaId, sid, mes, valores);
        setContrib(prev => ({ ...prev, [sid]: valores }));
        toast.warning('Salvo só neste navegador — migration 20260730a pendente.');
        return;
      }
      // Otimista: a tela de quem editou reage na hora; o realtime leva aos outros.
      setContrib(prev => ({ ...prev, [sid]: valores }));
      const ok = await salvarContribuicaoReceptivo({
        empresaId, setorId: sid, mes,
        acumulado: valores.acumulado, meta: valores.meta,
        atualizadoPor: perfil?.id ?? null,
      });
      if (!ok) {
        // Desfaz o otimismo relendo do banco — RLS pode ter recusado.
        await recarregarContribRef.current();
        toast.error('Não foi possível salvar a Contribuição Receptivo.');
        return;
      }
      toast.success('Contribuição Receptivo salva para todos.');
    } finally {
      setSalvandoContrib(null);
    }
  }, [contribDbAtiva, empresaId, mes, perfil?.id]);
  // Equipes de treinamento: equipe_id → data de início (só as treinamento=true).
  // Fetch isolado e tolerante — coluna ausente não quebra o painel principal.
  const [treinoMap, setTreinoMap] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let cancel = false;
    void (async () => {
      const { data, error } = await supabase.from('equipes')
        .select('id, treinamento, treinamento_inicio').eq('empresa_id', empresaId);
      if (cancel || error || !data) return;
      const m: Record<string, string | null> = {};
      for (const e of data as { id: string; treinamento: boolean | null; treinamento_inicio: string | null }[]) {
        if (e.treinamento) m[e.id] = e.treinamento_inicio ?? null;
      }
      setTreinoMap(m);
    })();
    return () => { cancel = true; };
  }, [empresaId]);

  const [anoNum, mesNum] = mes.split('-').map(Number);

  // ── Upload das fotos do setor ──────────────────────────────────────────────
  // A gravação vai por `fn_set_setor_foto` (migration 20260805a). O UPDATE
  // direto que existia aqui voltava SEM ERRO e sem gravar nada para quem não é
  // administrador — a RLS de `setores` filtra as linhas em vez de recusar o
  // comando —, então a tela dizia "salvo!" e a foto sumia no recarregar.
  const abrirUploadFotoSetor = useCallback((setorId: string, campo: CampoFotoSetor) => {
    setUploadAlvo({ setorId, campo });
    inputFotoSetorRef.current?.click();
  }, []);

  async function onArquivoFotoSetor(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const alvo = uploadAlvo;
    if (!file || !alvo) return;
    setSalvandoFotoSetor(true);
    try {
      const r = await salvarFotoSetor(alvo.setorId, alvo.campo, file);
      if (r.status === 'ok') {
        const aplicar = alvo.campo === 'receptivo' ? setReceptivoFotos : setSetorFotos;
        aplicar(prev => ({ ...prev, [alvo.setorId]: r.url }));
        toast.success(alvo.campo === 'receptivo'
          ? 'Foto do Receptivo atualizada!'
          : 'Foto do setor atualizada!');
      } else {
        toast.error(r.mensagem);
      }
    } finally {
      setSalvandoFotoSetor(false);
      setUploadAlvo(null);
    }
  }

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      try {
        const [{ data: metasData }, cfg, { data: lideresData }, { data: setoresData }, { data: receptivoFotosData }, { data: clonesData }, { data: equipeLideresData }, { data: opsData }] = await Promise.all([
          // `operador` entrou na lista: a área expandida distribui as pessoas por
          // quartil, e sem a meta individual não há faixa a calcular.
          supabase.from('metas').select('tipo, referencia_id, meta_valor')
            .eq('empresa_id', empresaId).eq('mes', mesNum).eq('ano', anoNum)
            .in('tipo', ['setor', 'equipe', 'operador']),
          getMetasConfig(empresaId, mesNum, anoNum),
          // TODOS os líderes (id/nome/foto + equipe de origem). Sem filtro de
          // equipe_id: um líder pode ser só clone (sem equipe própria).
          supabase.from('perfis').select('id, nome, foto_url, equipe_id')
            .eq('empresa_id', empresaId).eq('perfil', 'lider'),
          supabase.from('setores').select('id, nome, foto_url').eq('empresa_id', empresaId),
          // Foto do card Receptivo à parte: a coluna é nova (20260805a) e, se
          // entrasse no select acima, a migration pendente zeraria também os
          // NOMES dos setores — o PostgREST reprova a query inteira.
          supabase.from('setores').select('id, foto_receptivo_url').eq('empresa_id', empresaId),
          // Clones: líder clonado numa equipe deve mostrar foto/tag lá também.
          // Tabela pode não existir (migration 20260712a pendente) → vazio.
          supabase.from('equipe_operadores_clones').select('equipe_id, operador_id')
            .eq('empresa_id', empresaId),
          // Item 10/11: líder definido explicitamente por equipe (modelo novo).
          // Tabela pode não existir (migration 20260725b pendente) → vazio.
          supabase.from('equipe_lideres').select('equipe_id, lider_id')
            .eq('empresa_id', empresaId),
          // Quem conta no recebimento — nome e foto da área expandida. A lista de
          // cargos sai de `PERFIS_QUE_CONTAM_NO_RECEBIMENTO`, a mesma dos quartis
          // e do Painel do Líder. `ativo` E `situacao`: um usuário desativado não
          // é operador da equipe, e férias/desligado saem da distribuição — era
          // aqui que a aba Quartis divergia, filtrando só `situacao`.
          supabase.from('perfis').select('id, nome, foto_url')
            .eq('empresa_id', empresaId)
            .in('perfil', [...PERFIS_QUE_CONTAM_NO_RECEBIMENTO])
            .eq('ativo', true)
            .eq('situacao', 'ativo'),
        ]);
        if (cancelado) return;
        setMetas((metasData as MetaRow[]) ?? []);
        setFeriados(cfg.data?.feriados ?? []);
        setContarHoje(cfg.data?.contar_dia_atual === true);
        setQuartis(cfg.data?.quartis ?? QUARTIS_PADRAO);
        const idMap: Record<string, IdentidadeOperador> = {};
        for (const o of (opsData as { id: string; nome: string; foto_url: string | null }[]) ?? []) {
          idMap[o.id] = { nome: o.nome, fotoUrl: o.foto_url };
        }
        setIdentidade(idMap);
        /*
         * Quem lidera cada equipe — regra única, em `lideresDaEquipe.ts`.
         *
         * Aqui havia três laços que UNIAM as três fontes (perfis.equipe_id,
         * clones e equipe_lideres). União fazia o vínculo legado sobreviver à
         * remoção do explícito: a equipe Bryan mostrava Bryan Queiroz (explícito)
         * E Kauan Rodrigues (legado), e o segundo não saía por tela nenhuma,
         * porque a tela de Equipes só edita `equipe_lideres`.
         *
         * Agora o explícito manda e o legado é reserva. A função é testada à
         * parte — decidir QUEM aparece é regra, não desenho.
         */
        setLideres(lideresDaEquipe({
          lideres:    (lideresData as PerfilLider[]) ?? [],
          explicitos: (equipeLideresData as { equipe_id: string; lider_id: string }[]) ?? [],
          clones:     (clonesData as { equipe_id: string; operador_id: string }[]) ?? [],
        }));
        const sMap: Record<string, string> = {};
        const fMap: Record<string, string | null> = {};
        for (const s of (setoresData as { id: string; nome: string; foto_url: string | null }[]) ?? []) {
          sMap[s.id] = s.nome;
          fMap[s.id] = s.foto_url ?? null;
        }
        setSetores(sMap);
        setSetorFotos(fMap);
        // `data` nulo = migration 20260805a pendente; o card só fica sem foto.
        const rMap: Record<string, string | null> = {};
        for (const s of (receptivoFotosData as unknown as { id: string; foto_receptivo_url: string | null }[] | null) ?? []) {
          rMap[s.id] = s.foto_receptivo_url ?? null;
        }
        setReceptivoFotos(rMap);
      } catch { /* sem metas/config — painéis mostram "—" */ }
      if (!cancelado) setCarregado(true);
    }
    void carregar();
    return () => { cancelado = true; };
  }, [empresaId, mes, mesNum, anoNum]);

  const dados = useMemo(() => {
    const totalUteis = diasUteisDoMes(anoNum, mesNum, feriados);
    const decorridos = diasUteisDecorridos(anoNum, mesNum, feriados, getTodayISO(), undefined, contarHoje);

    // Acumulado (bruto + H.O.) por equipe e por setor a partir do analítico.
    // O card do SETOR soma TODOS os operadores do setor — inclusive quem está
    // sem equipe (o setor vem da equipe ou, na falta dela, do próprio perfil);
    // sem isso o consolidado do setor ficava menor que o card Total recebido.
    // `ajuste` viaja junto com o acumulado, e não numa segunda passada: ele já
    // está DENTRO de `total_recebido` e a pergunta que responde é «quanto deste
    // número foi lançado à mão». Somá-lo por fora daria duas travessias da
    // mesma lista com a mesma regra de clone — e a segunda envelheceria.
    const porEquipe: Record<string, { bruto: number; ho: number; ajuste: number }> = {};
    const porSetor:  Record<string, { bruto: number; ho: number; ajuste: number }> = {};
    const somar = (map: typeof porEquipe, id: string, r: ResumoOperadorAnalitico) => {
      if (!map[id]) map[id] = { bruto: 0, ho: 0, ajuste: 0 };
      map[id].bruto  += r.total_recebido;
      map[id].ho     += Number(r.total_ho) || 0;
      map[id].ajuste += Number(r.ajuste_manual) || 0;
    };
    // Setor de cada equipe — o clone credita o setor DONO da equipe clonada
    const setorDaEquipe = mapaSetorDaEquipe(equipes);

    for (const r of resumos) {
      const info = operadorEquipeMap[r.operador_id];
      if (info?.equipe_id) somar(porEquipe, info.equipe_id, r);
      // Clones: o recebimento conta TAMBÉM nas equipes clonadas
      for (const eqId of equipesExtrasPorOperador[r.operador_id] ?? []) {
        if (eqId !== info?.equipe_id) somar(porEquipe, eqId, r);
      }
      // Setores: o próprio + os das equipes clonadas (setor misto emprestando
      // para play 4 / play 5). O Set já deduplica, então clone dentro do
      // próprio setor não conta duas vezes. Mesma regra do "Total recebido"
      // no AnaliticoLider — as duas telas TÊM que concordar.
      for (const sid of setoresDoOperador(
        r.operador_id, operadorEquipeMap, equipesExtrasPorOperador, setorDaEquipe,
      )) {
        somar(porSetor, sid, r);
      }
    }

    // Órfãos (sem operador) pertencem ao setor da importação
    for (const [sid, o] of Object.entries(orfaosPorSetor)) {
      if (!porSetor[sid]) porSetor[sid] = { bruto: 0, ho: 0, ajuste: 0 };
      porSetor[sid].bruto += o.total;
    }

    const metaDe = (tipo: string, id: string): number | null => {
      const m = metas.find(x => x.tipo === tipo && x.referencia_id === id);
      const v = m ? Number(m.meta_valor) || 0 : 0;
      return v > 0 ? v : null;
    };

    // Recebido e meta POR OPERADOR: as duas fontes que a área expandida cruza
    // para distribuir as pessoas por quartil.
    const recebidoPorOperador: Record<string, number> = {};
    for (const r of resumos) recebidoPorOperador[r.operador_id] = Number(r.total_recebido) || 0;
    const metaPorOperador: Record<string, number> = {};
    for (const m of metas) {
      if (m.tipo !== 'operador') continue;
      const v = Number(m.meta_valor) || 0;
      if (v > 0) metaPorOperador[m.referencia_id] = v;
    }

    // Agrupa por setor. `setorEfetivo` nulo = todos os setores; `equipeId`
    // recorta as equipes dentro do que sobrou.
    let visiveis = setorEfetivo ? equipes.filter(e => e.setor_id === setorEfetivo) : equipes;
    if (equipeId) visiveis = visiveis.filter(e => e.id === equipeId);
    const grupos = new Map<string, EquipeAnalitico[]>();
    for (const eq of visiveis) {
      const sid = eq.setor_id ?? 'sem_setor';
      if (!grupos.has(sid)) grupos.set(sid, []);
      grupos.get(sid)!.push(eq);
    }

    return {
      totalUteis, decorridos, porEquipe, porSetor, metaDe, grupos,
      recebidoPorOperador, metaPorOperador, setorDaEquipe,
    };
  }, [anoNum, mesNum, feriados, contarHoje, resumos, operadorEquipeMap, equipesExtrasPorOperador,
      orfaosPorSetor, equipes, metas, setorEfetivo, equipeId]);

  /**
   * Operadores de um card, prontos para a área expandida.
   *
   * Card de EQUIPE: membros de origem + clones que contam nela.
   * Card de SETOR: todo mundo que conta no setor, pela mesma regra do acumulado
   * (`setoresDoOperador`) — inclusive quem está sem equipe e os clonados de
   * outro setor. Usar outra regra aqui faria a soma das pessoas discordar do
   * número no alto do próprio card.
   */
  const operadoresDoCard = useCallback((alvo:
    | { tipo: 'equipe'; id: string }
    | { tipo: 'setor';  id: string },
  ): OperadorNaEquipe[] => {
    // As MESMAS funções que o dashboard e a aba Analítico usam para decidir quem
    // conta onde. A área expandida não pode ter regra própria de participação:
    // seria a quinta cópia dessa pergunta, e a soma das pessoas discordaria do
    // número no alto do próprio card.
    const fontes = {
      setoresAlternativos,
      operadorEquipeMap,
      equipesExtrasPorOperador,
      setorDaEquipe: dados.setorDaEquipe,
    };
    const ids = alvo.tipo === 'equipe'
      ? operadoresDaEquipe(alvo.id, fontes)
      : operadoresDoSetor(alvo.id, fontes);
    return enriquecerOperadores({
      ids,
      identidade,
      recebidoPorOperador: dados.recebidoPorOperador,
      metaPorOperador:     dados.metaPorOperador,
    });
  }, [identidade, dados, operadorEquipeMap, equipesExtrasPorOperador, setoresAlternativos]);

  /**
   * Setores na ordem que o admin arrastou na aba Setores.
   *
   * `dados.grupos` é um Map preenchido percorrendo `equipes`, então a ordem dos
   * setores na tela era a ordem de chegada das equipes — arbitrária, e diferente
   * da que a tela de Setores mostra. Equipe sem setor fica sempre por último.
   */
  const gruposOrdenados = useMemo(() => {
    const entradas = [...dados.grupos.entries()];
    const porId = new Map(entradas);
    const comSetor = entradas.filter(([sid]) => sid !== 'sem_setor');
    const ordenados = aplicarOrdemSetores(
      comSetor.map(([sid]) => ({ id: sid, nome: setores[sid] ?? '' })),
      empresaId,
    );
    const lista: [string, EquipeAnalitico[]][] = ordenados.map(s => [s.id, porId.get(s.id) ?? []]);
    if (porId.has('sem_setor')) lista.push(['sem_setor', porId.get('sem_setor')!]);
    return lista;
  }, [dados.grupos, setores, empresaId]);

  if (loading || !carregado) {
    return (
      <div className="space-y-3 animate-pulse">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 bg-muted rounded-2xl" />)}
      </div>
    );
  }

  if (dados.grupos.size === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-10">
        Nenhuma equipe encontrada{setorEfetivo ? ' neste setor' : ''}.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Input único para o upload da foto do setor (disparado pelo avatar) */}
      <input
        ref={inputFotoSetorRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onArquivoFotoSetor}
      />
      {gruposOrdenados.map(([sid, eqs]) => {
        // Setor NORMAL → total do relatório (carimbo setor_id), clones não contam.
        // Quando NÃO é assim, quem decide é `setorSomaPorUsuarios` — a mesma
        // função que o dashboard e a aba Analítico consultam.
        const ehAlternativo = setoresAlternativos.has(sid);
        const usarSoma = setorSomaPorUsuarios({
          isPaguePlay: setorSomaMembros, alternativo: ehAlternativo,
        });
        const baseSetor = usarSoma
          ? (dados.porSetor[sid]?.bruto ?? 0)
          : (totalPorSetor[sid]?.total ?? 0);
        const baseSetorHO = usarSoma
          ? (dados.porSetor[sid]?.ho ?? 0)
          : (totalPorSetor[sid]?.ho ?? 0);
        /*
         * O ajuste do setor sai sempre da soma dos operadores, mesmo quando o
         * card usa o total carimbado do relatório: nos dois caminhos o ajuste
         * já está dentro do acumulado, e o número é o mesmo. O que muda entre
         * eles é de onde vem o TOTAL, não de onde vem esta parcela.
         */
        const ajusteDoSetor = dados.porSetor[sid]?.ajuste ?? 0;
        const metaSetor = dados.metaDe('setor', sid);
        return (
        <div key={sid} className="space-y-3">
          {/* Nome do setor acima do grupo: com "Todos os setores" a tela vira uma
              sequência longa de cards, e o título fixo dá onde se apoiar. */}
          {!setorEfetivo && (
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1 pt-1">
              {setores[sid] ?? 'Sem setor'}
            </p>
          )}
          {/* Consolidado do setor. Sai de cena quando há filtro de equipe: o
              número dele é do setor inteiro e contradiria o recorte pedido. */}
          {!equipeId && (
            <CardEquipe
              titulo={setores[sid] ?? 'Setor'}
              subtitulo={ehAlternativo
                ? 'Setor alternativo · soma dos usuários'
                : setorSomaMembros ? 'Setor · soma dos operadores' : 'Setor geral · total do relatório'}
              ehSetor
              avatarProprio={{
                foto: setorFotos[sid] ?? null,
                onEditar: sid !== 'sem_setor' ? () => abrirUploadFotoSetor(sid, 'placar') : undefined,
                salvando: salvandoFotoSetor && uploadAlvo?.setorId === sid && uploadAlvo.campo === 'placar',
                Icone: Building2,
                rotulo: 'Foto do setor',
              }}
              mostrarHO={isPP}
              metaHO={metaSetor !== null ? metaSetor * PP_HO_PERCENTUAL : null}
              // Só o ACUMULADO do Receptivo soma aqui; a meta do setor segue
              // sendo a da aba Metas (decisão do usuário em 30/07/2026).
              acumulado={baseSetor + (contrib[sid]?.acumulado ?? 0)}
              acumuladoHO={baseSetorHO}
              ajusteManual={ajusteDoSetor}
              meta={metaSetor}
              totalUteis={dados.totalUteis}
              decorridos={dados.decorridos}
              quartis={quartis}
              operadores={sid === 'sem_setor' ? undefined : operadoresDoCard({ tipo: 'setor', id: sid })}
            />
          )}
          {/* Contribuição Receptivo — card manual do setor (BookPlay) */}
          {!isPP && !equipeId && sid !== 'sem_setor' && (
            <CardContribuicaoReceptivo
              dados={contrib[sid]}
              totalUteis={dados.totalUteis}
              decorridos={dados.decorridos}
              quartis={quartis}
              podeEditar={podeEditarContrib}
              salvando={salvandoContrib === sid}
              somenteLocal={!contribDbAtiva}
              onSalvar={valores => { void salvarContrib(sid, valores); }}
              foto={receptivoFotos[sid] ?? null}
              onEditarFoto={podeEditarContrib ? () => abrirUploadFotoSetor(sid, 'receptivo') : undefined}
              salvandoFoto={salvandoFotoSetor && uploadAlvo?.setorId === sid && uploadAlvo.campo === 'receptivo'}
            />
          )}
          {/* Equipes do setor, maiores acumulados primeiro */}
          {eqs
            .slice()
            .sort((a, b) => (dados.porEquipe[b.id]?.bruto ?? 0) - (dados.porEquipe[a.id]?.bruto ?? 0))
            .map(eq => {
              // Equipe de treinamento com data de início → dias úteis reduzidos.
              // Os MESMOS dias descem para os operadores dentro do card: era
              // exatamente aqui que a aba Quartis divergia, projetando quem está
              // em treinamento contra o mês cheio.
              const inicioTreino = treinoMap[eq.id] ?? undefined;
              const eqUteis = inicioTreino
                ? diasUteisDoMes(anoNum, mesNum, feriados, inicioTreino)
                : dados.totalUteis;
              const eqDecorridos = inicioTreino
                ? diasUteisDecorridos(anoNum, mesNum, feriados, getTodayISO(), inicioTreino, contarHoje)
                : dados.decorridos;
              const metaEquipe = dados.metaDe('equipe', eq.id);
              return (
                <CardEquipe
                  key={eq.id}
                  /*
                   * A EQUIPE é o título; a liderança vem pequena embaixo.
                   *
                   * Era o contrário quando havia um líder só: o nome dele
                   * ocupava o título e a equipe virava a linha miúda. Quem lê o
                   * painel procura a equipe — «como foi o Time Matheus» —, e o
                   * card respondia com um nome de pessoa. Com dois líderes já
                   * caía na equipe, então a mesma tela tinha duas hierarquias
                   * conforme quantas pessoas lideram. Agora é uma só, nos dois
                   * tenants (o card é o mesmo componente).
                   */
                  titulo={eq.nome}
                  subtitulo={[
                    lideres[eq.id]?.length
                      ? lideres[eq.id].map(l => l.nome).join(' · ')
                      : null,
                    inicioTreino ? 'treino' : null,
                  ].filter(Boolean).join(' · ') || undefined}
                  lideres={lideres[eq.id] ?? []}
                  mostrarHO={isPP}
                  metaHO={metaEquipe !== null ? metaEquipe * PP_HO_PERCENTUAL : null}
                  acumulado={dados.porEquipe[eq.id]?.bruto ?? 0}
                  acumuladoHO={dados.porEquipe[eq.id]?.ho ?? 0}
                  ajusteManual={dados.porEquipe[eq.id]?.ajuste ?? 0}
                  meta={metaEquipe}
                  totalUteis={eqUteis}
                  decorridos={eqDecorridos}
                  quartis={quartis}
                  operadores={operadoresDoCard({ tipo: 'equipe', id: eq.id })}
                />
              );
            })}
        </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground">
        Acumulado e diário vêm do {fonteLabel} · meta, dias úteis e feriados
        vêm da aba Metas ({dados.decorridos} de {dados.totalUteis} dias úteis
        trabalhados) · clique num card para ver os degraus de quartil, o ritmo
        necessário e a distribuição das pessoas.
      </p>
    </div>
  );
}
