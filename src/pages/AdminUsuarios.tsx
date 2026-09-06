import { useEffect, useState, useRef, useMemo, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Plus, RefreshCw, Save, Building2, ArrowRightLeft, Camera, X, Trash2, KeyRound, Users2, Loader2, Target, PartyPopper, AlertTriangle, UserX, Search, Wifi, Palmtree, UserMinus } from 'lucide-react';
import {
  resumoExclusao, excluirUsuarioComAcordos,
  type ResumoExclusao,
} from '@/services/admin/exclusaoUsuario.service';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { filtrarUsuariosVisiveis } from '@/lib/usuarios-visibilidade';
import { iniciarImpersonacao } from '@/services/impersonacao.service';
import { redefinirSenhaDeUsuario, MIN_SENHA } from '@/services/senha.service';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { KpiTile } from '@/components/KpiTile';
// A lista de gente e a transferência: as duas saíram da aba Setores, que as
// duplicava. Ver o cabeçalho de `AdminSetoresAba` e o de `DialogTransferencia`.
import { ListaPessoas, ListaPessoasVazia, type GrupoDeSetor } from '@/components/admin/ListaPessoas';
import { DialogTransferencia } from '@/components/admin/DialogTransferencia';
import { HistoricoTransferencias } from '@/components/admin/HistoricoTransferencias';
import { useClonesCross } from '@/hooks/useClonesCross';
import AdminEquipes from '@/pages/AdminEquipes';
import AdminSetoresAba from '@/pages/AdminSetoresAba';
import MetasConfig from '@/pages/MetasConfig';
import { useTenant } from '@/lib/tenant-config';
import { aplicarOrdemSetores } from '@/lib/setores-ordem';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { produtoDaEmpresa } from '@/lib/produto';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { usePresence } from '@/hooks/usePresence';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CalendarRange } from 'lucide-react';
// A lista de um mes FECHADO — so leitura, com as etiquetas do que mudou depois.
import { UsuariosDoMesPainel } from '@/components/admin/UsuariosDoMesPainel';
import { mesesComRetrato } from '@/services/admin/usuariosDoMes.service';
import { ehMesAtual, rotuloDoMes } from '@/lib/mesReferencia';
import { supabase, createIsolatedAuthClient, Perfil, PerfilUsuario, Setor, Empresa, SituacaoUsuario } from '@/lib/supabase';
import { definirSituacao, arquivarDesligadosAnteriores, encerrarFeriasVencidas } from '@/services/situacaoUsuario.service';
import { AdminDesligadosAba } from '@/pages/AdminDesligadosAba';
import { buildAuthRedirectUrl } from '@/lib/tenant';
import { fetchEmpresas } from '@/services/empresas.service';
import { PERFIL_LABELS, TODAS_EMPRESAS_SELECT_VALUE, ehEscopoEmpresa } from '@/lib/index';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ModalRecortarFoto } from '@/components/ModalRecortarFoto';

// Lazy: a aba Comemorações arrasta o editor de layout, o catálogo de sons e a
// biblioteca de mídia. Enquanto era rota própria, só baixava para quem a abria;
// o carregamento sob demanda mantém esse comportamento agora que virou aba.
const Comemoracoes = lazy(() => import('@/pages/Comemoracoes'));

/** Valor sentinela do seletor de setor — o Radix não aceita `value=""`. */
const TODOS_SETORES_SELECT_VALUE = '__todos_setores__';

/** Marcas de acento que o NFD separa da letra base. */
const ACENTOS = /[\u0300-\u036f]/g;

/**
 * O termo de busca sem acento e em minúsculas.
 *
 * Sem isto, procurar «jose» não acharia «José» — e é assim que o nome é
 * digitado por quem está com pressa, que é justamente quem usa a busca.
 */
function normalizarBusca(v: string): string {
  return v.trim().normalize('NFD').replace(ACENTOS, '').toLowerCase();
}

/** Nome, login e e-mail — os três jeitos de alguém se referir a uma pessoa. */
function casaComBusca(u: Perfil, termo: string): boolean {
  const alvo = normalizarBusca(`${u.nome} ${u.usuario ?? ''} ${u.email ?? ''}`);
  return alvo.includes(termo);
}

interface UserForm {
  nome:       string;
  email:      string;
  usuario:    string;
  senha:      string;
  perfil:     PerfilUsuario;
  setor_id:   string;
  empresa_id: string;
}

/** Perfil exibido na lista; `_cloneDe` marca um clone de OUTRO setor (tag). */
type PerfilComClone = Perfil & { _cloneDe?: string | null };

export default function AdminUsuarios() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') ?? 'usuarios';
  const { perfil: perfilAtual } = useAuth();
  const { empresa: empresaAtual } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  /*
   * Escopo DESTA aba — quem aparece na lista de gestão de pessoas.
   * Memoizado porque `niveisLiberados` devolve array novo a cada chamada.
   */
  const niveisUsuarios = useMemo(
    () => niveisLiberados('usuarios', temPermissao),
    [temPermissao],
  );
  const veUsuariosDeTodosSetores = niveisUsuarios.includes('todos_setores');
  const tenant = useTenant();
  // Item 6: a aba Metas passa a viver dentro de Usuários (BookPlay e PaguePlay).
  // `tenant` é usado em outras partes; mantém a referência p/ clareza.
  const metasComoAba = tenant.slug === 'bookplay' || tenant.isPaguePlay;
  /*
   * Comemorações também virou aba daqui (nos dois tenants). O gate é o mesmo da
   * criação — quem só assiste não precisa da aba, a comemoração chega pelo
   * overlay em qualquer página.
   *
   * O `ehCobranca` entrou em 25/08. `comemoracoes_gerenciar` responde `true`
   * para todo administrador por construção, então a aba aparecia no Comercial —
   * e comemoração aqui é meta de recebimento batida, que Vendas não tem. A
   * permissão diz quem pode; o produto diz se a coisa existe.
   */
  const ehCobranca = produtoDaEmpresa(empresaAtual, tenant.slug) === 'cobranca';
  const podeVerUsuarios = temPermissao('usuarios_sub_usuarios');
  const podeVerComemoracoes = ehCobranca && temPermissao('ver_comemoracoes');
  /*
   * Dois eixos, duas chaves — e eles não são a mesma pergunta.
   *
   *   `usuarios_ver_administradores` .. as contas de administração APARECEM na
   *                                     lista
   *   `usuarios_administrar` .......... posso escolher o cargo de alguém e
   *                                     redefinir senha
   *
   * Os quatro pontos abaixo usavam `perfilAtual?.perfil === 'administrador'`.
   * Ver e administrar andavam juntos por acidente de implementação, não por
   * decisão — e ninguém conseguia separá-los sem mexer em código.
   */
  const podeVerAdministradores = temPermissao('usuarios_ver_administradores');
  const podeAdministrarContas  = temPermissao('usuarios_administrar');
  const isSuperAdmin = perfilAtual?.perfil === 'super_admin';
  // Item 5: líder+ pode definir a situação (ativo/férias/desligado). A RLS ainda
  // limita o líder ao próprio setor; quem administra atinge qualquer usuário.
  const podeGerenciarSituacao = podeAdministrarContas
    || temPermissao('usuarios_editar_do_setor');
  /*
   * O mês que está sendo olhado. `null` = o mês corrente, que é a tela de
   * sempre — com formulários, edição e tudo o que ela sempre teve.
   *
   * Um mês fechado troca a tela inteira pelo retrato daquele mês, só de
   * leitura. Não é filtro: é outro assunto. Ver `UsuariosDoMesPainel`.
   */
  const [mesRetrato, setMesRetrato] = useState<string | null>(null);
  const [mesesDisponiveis, setMesesDisponiveis] = useState<string[]>([]);

  useEffect(() => {
    const empresaId = empresaAtual?.id;
    if (!empresaId) { setMesesDisponiveis([]); return; }
    let cancelado = false;
    void mesesComRetrato(empresaId).then(meses => {
      if (cancelado) return;
      // O mês corrente sai da lista: ele é a opção «Mês atual», e oferecê-lo
      // duas vezes faria a mesma escolha levar a duas telas diferentes.
      setMesesDisponiveis(meses.filter(m => !ehMesAtual(m)));
    });
    return () => { cancelado = true; };
  }, [empresaAtual?.id]);

  // Trocar de empresa volta para o mês corrente: o retrato é por empresa, e
  // manter o mês escolhido mostraria a foto de uma empresa com o rótulo de
  // outra até a releitura chegar.
  useEffect(() => { setMesRetrato(null); }, [empresaAtual?.id]);

  const podeVerSetores = temPermissao('ver_setores');
  const podeVerEquipes = temPermissao('ver_equipes');
  const podeVerMetas = metasComoAba && temPermissao('ver_metas');
  const abasVisiveis = [
    podeVerUsuarios && 'usuarios',
    podeVerSetores && 'setores',
    podeVerEquipes && 'equipes',
    podeVerMetas && 'metas',
    podeVerComemoracoes && 'comemoracoes',
    // Arquivo morto: so quem administra contas. Nao e uma aba de operacao.
    podeAdministrarContas && 'desligados',
  ].filter((aba): aba is string => Boolean(aba));
  const tabAtiva = abasVisiveis.includes(tabFromUrl) ? tabFromUrl : abasVisiveis[0];
  const selecionarAba = (aba: string) => {
    if (!abasVisiveis.includes(aba)) return;
    const novosParametros = new URLSearchParams(searchParams);
    novosParametros.set('tab', aba);
    // Trocar de aba pela régua descarta o recorte que veio de Setores: o
    // `?setor=` valia para a viagem, não para a sessão inteira.
    novosParametros.delete('setor');
    setSearchParams(novosParametros, { replace: true });
  };

  /*
   * A régua de abas, para `AbasSegmentadas`.
   *
   * Sai de `abasVisiveis` para que a permissão continue mandando num lugar só:
   * quem decide o que aparece é a lista acima; isto só veste o que sobrou.
   */
  const ROTULO_ABA: Record<string, { label: string; Icon: typeof Users }> = {
    usuarios:     { label: 'Usuários',     Icon: Users },
    setores:      { label: 'Setores',      Icon: Building2 },
    equipes:      { label: 'Equipes',      Icon: Users2 },
    metas:        { label: 'Metas',        Icon: Target },
    comemoracoes: { label: 'Comemorações', Icon: PartyPopper },
    desligados:   { label: 'Desligados',   Icon: UserX },
  };
  const abasInternas: AbaSegmentada<string>[] = abasVisiveis.map(aba => ({
    key: aba,
    label: ROTULO_ABA[aba]?.label ?? aba,
    Icon:  ROTULO_ABA[aba]?.Icon  ?? Users,
  }));
  const [usuarios,    setUsuarios]    = useState<Perfil[]>([]);
  /** Arquivados: saíram em meses anteriores e só existem na aba Desligados. */
  const [desligados,  setDesligados]  = useState<Perfil[]>([]);
  const [setores,     setSetores]     = useState<Setor[]>([]);
  const [empresas,    setEmpresas]    = useState<Empresa[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [dialogOpen,  setDialogOpen]  = useState(false);
  const [editando,    setEditando]    = useState<Perfil | null>(null);
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('');
  /*
   * Filtro e recolhimento por setor.
   *
   * A lista ja vinha agrupada por setor, mas com nove setores abertos ela e uma
   * rolagem de varias telas para achar uma pessoa. `filtroSetor` recorta;
   * `setoresRecolhidos` guarda quem esta fechado — guarda os FECHADOS, e nao os
   * abertos, para que um setor criado depois nasca visivel.
   */
  const [filtroSetor, setFiltroSetor] = useState<string>('');
  const [setoresRecolhidos, setSetoresRecolhidos] = useState<Set<string>>(new Set());

  /*
   * ── Busca por nome ────────────────────────────────────────────────────────
   *
   * A lista tinha filtro de setor e de empresa e NENHUMA busca: achar uma
   * pessoa entre cento e tantas era escolher o setor certo e rolar. A aba
   * Desligados tinha busca; a lista principal, não.
   *
   * Enquanto há busca os setores ficam todos abertos — esconder um resultado
   * atrás de um grupo recolhido é o oposto de buscar.
   */
  const [busca, setBusca] = useState('');

  /*
   * ── Transferência ─────────────────────────────────────────────────────────
   *
   * Veio da aba Setores em 06/09/2026. Ver `DialogTransferencia` para o motivo:
   * lá a chave `usuarios_transferir` ficava inerte para líder e elite, que não
   * abrem a aba Setores.
   */
  const podeTransferir = temPermissao('usuarios_transferir');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [transferindo, setTransferindo] = useState<Perfil[] | null>(null);

  /*
   * As equipes, para a coluna «Equipe».
   *
   * Consulta à parte em vez de embed em `perfis`: aquela consulta já tem um
   * caminho de fallback por ambiguidade de FK (ver `EMBED_EMPRESA`), e
   * pendurar mais um join nela é arriscar o carregamento inteiro da lista por
   * causa de uma coluna. `equipes` é tabela pequena.
   */
  const [equipes, setEquipes] = useState<{ id: string; nome: string }[]>([]);

  const alternarSetor = (sid: string) => setSetoresRecolhidos(atual => {
    const proximo = new Set(atual);
    if (proximo.has(sid)) proximo.delete(sid); else proximo.add(sid);
    return proximo;
  });

  /*
   * `?setor=` na URL recorta a lista.
   *
   * É o outro lado do atalho da aba Setores: lá o contador de pessoas leva
   * para cá já filtrado. Sem isto o clique trocaria de aba e mostraria todo
   * mundo, que é quase o mesmo que não levar a lugar nenhum.
   */
  const setorDaUrl = searchParams.get('setor');
  useEffect(() => {
    if (setorDaUrl) setFiltroSetor(setorDaUrl);
  }, [setorDaUrl]);

  /** Trocar o filtro pela tela tira o `?setor=` — a URL não pode mentir. */
  const escolherFiltroSetor = (sid: string) => {
    setFiltroSetor(sid);
    if (!setorDaUrl) return;
    const p = new URLSearchParams(searchParams);
    p.delete('setor');
    setSearchParams(p, { replace: true });
  };

  const alternarSelecao = (id: string) => setSelecionados(atual => {
    const proximo = new Set(atual);
    if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
    return proximo;
  });

  const selecionarGrupo = (ids: string[], marcar: boolean) => setSelecionados(atual => {
    const proximo = new Set(atual);
    for (const id of ids) { if (marcar) proximo.add(id); else proximo.delete(id); }
    return proximo;
  });

  const [saving,      setSaving]      = useState(false);
  const [form,        setForm]        = useState<UserForm>({ nome: '', email: '', usuario: '', senha: '', perfil: 'operador', setor_id: '', empresa_id: '' });

  // Online/Offline — lê do PresenceProvider (canal singleton global)
  const { onlineIds } = usePresence();
  // Foto expandida
  const [fotoExpandida,   setFotoExpandida]   = useState<{ url: string; nome: string } | null>(null);
  // Upload de foto pelo líder/admin para outro operador
  const [uploadTarget,    setUploadTarget]    = useState<Perfil | null>(null);
  const [uploadando,      setUploadando]      = useState(false);
  // Foto escolhida no input aguardando recorte no modal
  const [fotoParaRecorte, setFotoParaRecorte] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Alterar senha de operador (agora integrado ao modal unificado;
  // `senhaTarget` é mantido como compat para chamadas externas/testes —
  // o fluxo principal usa `editando` + `novaSenha`).
  const [senhaTarget,     setSenhaTarget]     = useState<Perfil | null>(null);
  const [novaSenha,       setNovaSenha]       = useState('');
  const [salvandoSenha,   setSalvandoSenha]   = useState(false);
  const [impersonando,    setImpersonando]    = useState<string | null>(null);

  // Entrar como (impersonação) — só super_admin. Recarrega ao assumir a sessão.
  async function entrarComo(u: Perfil) {
    if (!perfilAtual?.id || u.id === perfilAtual.id) return;
    setImpersonando(u.id);
    try {
      await iniciarImpersonacao(u.id, perfilAtual.id, perfilAtual.nome ?? 'super_admin');
      // iniciarImpersonacao recarrega a página em caso de sucesso.
    } catch (e) {
      setImpersonando(null);
      toast.error(e instanceof Error ? e.message : 'Falha ao entrar como usuário.');
    }
  }

  useEffect(() => {
    if (empresaAtual?.id) {
      setFiltroEmpresa((current) => current || empresaAtual.id);
      setForm((current) => ({
        ...current,
        empresa_id: current.empresa_id || empresaAtual.id,
      }));
    }
  }, [empresaAtual?.id]);

  async function fetchDados() {
    setLoading(true);
    // Item 5: arquiva desligados de meses anteriores antes de listar (some da lista).
    const empAlvo = (!isSuperAdmin ? empresaAtual?.id : filtroEmpresa) ?? empresaAtual?.id;
    if (empAlvo) { try { await arquivarDesligadosAnteriores(empAlvo, { isPaguePlay: tenant.isPaguePlay }); } catch { /* best-effort */ } }
    /*
     * Devolve ao ativo quem passou da data de retorno — o `pg_cron` já faz isso
     * às 00:15, e esta chamada cobre o dia em que ele não rodou. Barata e
     * idempotente: o WHERE da função só encontra quem ainda está pendente.
     */
    if (empAlvo) {
      try {
        const voltaram = await encerrarFeriasVencidas(empAlvo);
        if (voltaram > 0) {
          toast.info(voltaram === 1
            ? '1 pessoa voltou de férias e já aparece no analítico.'
            : `${voltaram} pessoas voltaram de férias e já aparecem no analítico.`);
        }
      } catch { /* best-effort */ }
    }
    let usuariosData: Perfil[] = [];
    try {
      let usersQuery = supabase
        .from('perfis')
        // `empresas!perfis_empresa_id_fkey`: há mais de um caminho entre
        // `perfis` e `empresas`, e sem o nome da chave o PostgREST recusa a
        // consulta (PGRST201). Ver `EMBED_EMPRESA` em `empresas.service.ts`.
        .select('*, setores(id,nome), empresas!perfis_empresa_id_fkey(id,nome), foto_url')
        .order('nome');
      if (!isSuperAdmin && empresaAtual?.id) {
        usersQuery = usersQuery.eq('empresa_id', empresaAtual.id);
      } else if (filtroEmpresa) {
        usersQuery = usersQuery.eq('empresa_id', filtroEmpresa);
      }
      const { data: uJoin, error: eJoin } = await usersQuery;
      if (eJoin) {
        console.warn('[AdminUsuarios] fetchDados join error, tentando sem join de empresas:', eJoin.message);
        let fallbackQuery = supabase
          .from('perfis')
          .select('*, setores(id,nome), foto_url')
          .order('nome');
        if (!isSuperAdmin && empresaAtual?.id) {
          fallbackQuery = fallbackQuery.eq('empresa_id', empresaAtual.id);
        } else if (filtroEmpresa) {
          fallbackQuery = fallbackQuery.eq('empresa_id', filtroEmpresa);
        }
        const { data: uSimple, error: eSimple } = await fallbackQuery;
        if (eSimple) {
          console.warn('[AdminUsuarios] fetchDados fallback error:', eSimple.message);
        }
        usuariosData = (uSimple as Perfil[]) || [];
      } else {
        usuariosData = (uJoin as Perfil[]) || [];
      }
    } catch (err) {
      console.warn('[AdminUsuarios] fetchDados error:', err);
    }
    let setoresData: Setor[] = [];
    let emps: Empresa[] = [];
    try {
      const setoresPromise = (() => {
        let query = supabase.from('setores').select('*').eq('ativo', true).order('nome');
        if (!isSuperAdmin && empresaAtual?.id) {
          query = query.eq('empresa_id', empresaAtual.id);
        } else if (filtroEmpresa) {
          query = query.eq('empresa_id', filtroEmpresa);
        }
        return query;
      })();

      const empresasPromise = isSuperAdmin
        ? fetchEmpresas()
        : Promise.resolve(empresaAtual ? [empresaAtual] : []);

      const [{ data: s }, empresasList] = await Promise.all([setoresPromise, empresasPromise]);
      setoresData = (s as Setor[]) || [];
      emps = empresasList;
    } catch (err) {
      console.warn('[AdminUsuarios] fetchDados setores/empresas error:', err);
    }
    // Arquivados somem da lista padrão (item 5).
    setUsuarios(usuariosData.filter(u => !u.arquivado));
    setDesligados(usuariosData.filter(u => u.arquivado === true));
    setSetores(setoresData);
    setEmpresas(emps);
    // Escolhe um setor de partida só para quem PERTENCE a um setor. Este
    // preenchimento automático é a origem do `setor_id` que a cúpula carregava
    // sem ninguém ter decidido — e que fazia a diretoria ver um setor só nas
    // abas do Painel Líder. Ver `PERFIS_ESCOPO_EMPRESA`.
    //
    // `!editando` é a segunda metade da mesma ideia: isto existe para o
    // formulário de CRIAÇÃO. Numa edição de alguém sem setor (ver
    // `setorVazioParaPreencher`) ele escolheria sozinho o primeiro da lista, e
    // o admin salvaria um vínculo que não decidiu — que é justamente o defeito
    // que o parágrafo acima descreve, só que do outro lado.
    if (!editando && setoresData.length > 0 && !form.setor_id && !ehEscopoEmpresa(form.perfil)) {
      setForm(f => ({
        ...f,
        setor_id: setoresData.find(s => s.empresa_id === (f.empresa_id || empresaAtual?.id))?.id ?? setoresData[0].id,
      }));
    }
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchDados é recriada a cada render; incluí-la causaria refetch em loop.
  useEffect(() => { fetchDados(); }, [empresaAtual?.id, filtroEmpresa, isSuperAdmin]);

  function abrirCriar() {
    setEditando(null);
    setForm({
      nome: '',
      email: '',
      usuario: '',
      senha: '',
      perfil: 'operador',
      setor_id: setores.find(s => s.empresa_id === (empresaAtual?.id ?? ''))?.id ?? '',
      empresa_id: empresaAtual?.id ?? '',
    });
    setDialogOpen(true);
  }

  function abrirEditar(u: Perfil) {
    setEditando(u);
    setForm({ nome: u.nome, email: u.email, usuario: u.usuario ?? '', senha: '', perfil: u.perfil, setor_id: u.setor_id ?? '', empresa_id: u.empresa_id ?? '' });
    setNovaSenha('');
    setDialogOpen(true);
  }

  // (Mover usuário entre setores agora é feito dentro do modal unificado,
  // ajustando o campo "Setor" e clicando em Salvar. Os handlers dedicados
  // foram removidos em 2026-04-22 junto com o dialog separado.)

  /**
   * Grava os campos que não são vínculo: nome, cargo, login.
   *
   * Setor e empresa NÃO entram aqui de propósito. Mudá-los é uma transferência,
   * e transferência apaga tabulação, libera NR e tira a pessoa de equipe — não
   * pode viajar de carona no mesmo `update` que corrige um nome mal digitado.
   *
   * A única exceção é `setorVazioParaPreencher`: sair de NULO para um setor não
   * é mudar de setor, é ganhar o primeiro. Não há tabulação para apagar nem
   * equipe de onde sair, então nenhuma das consequências acima existe — e sem
   * isto a pessoa fica presa num estado que zera as telas analíticas dela.
   */
  async function salvarCamposBasicos(alvoId: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload parcial e heterogêneo p/ update(); tipar exigiria o shape completo de Perfil.
    const updatePayload: Record<string, any> = {
      nome:   form.nome,
      perfil: form.perfil,
    };
    if (form.usuario.trim()) {
      updatePayload.usuario = form.usuario.trim().toLowerCase();
    }
    if (setorVazioParaPreencher && form.setor_id) {
      updatePayload.setor_id = form.setor_id;
    }
    const { data: linhasAtualizadas, error } = await supabase.from('perfis')
      .update(updatePayload)
      .eq('id', alvoId)
      .select('id');
    if (error) throw error;
    if (!linhasAtualizadas || linhasAtualizadas.length === 0) {
      throw new Error('Sem permissão para editar este usuário');
    }
  }

  async function salvar() {
    const empresaId = isSuperAdmin ? form.empresa_id : (empresaAtual?.id ?? form.empresa_id);
    if (!form.nome || (!form.email && !form.usuario)) { toast.error('Preencha nome e e-mail ou nome de usuário'); return; }
    if (!empresaId) { toast.error('Não foi possível identificar a empresa. Recarregue a página.'); return; }
    // Sair do diálogo mantendo o vazio devolveria a pessoa ao estado que zera o
    // Painel Líder e o Analítico dela — e a próxima pessoa a abrir a tela não
    // teria como saber que aquilo é um defeito. `setoresDoForm.length` evita
    // travar quem simplesmente não tem setor cadastrado na empresa.
    if (setorVazioParaPreencher && !form.setor_id && setoresDoForm.length > 0) {
      toast.error('Escolha o setor: este cargo pertence a um setor, e sem ele as telas analíticas ficam zeradas.');
      return;
    }

    setSaving(true);
    try {
      if (editando) {
        await salvarCamposBasicos(editando.id);
        toast.success('Usuário atualizado!');
      } else {
        if (!form.senha) { toast.error('Senha obrigatória para novo usuário'); setSaving(false); return; }
        const authRedirectUrl = buildAuthRedirectUrl();
        // Use real email if provided, otherwise generate synthetic one from username
        const resolvedEmail = form.email.trim().toLowerCase().includes('@')
          ? form.email.trim().toLowerCase()
          : `${(form.usuario.trim() || form.email.trim()).toLowerCase()}@interno.sistema`;
        // Usa um client isolado (sem persistência de sessão): mesmo que o
        // Supabase crie sessão automática ao cadastrar, ela fica nesse client
        // descartável e NÃO substitui/derruba a sessão do admin logado.
        const signupClient = createIsolatedAuthClient();
        const { data: signUpData, error } = await signupClient.auth.signUp({
          email: resolvedEmail,
          password: form.senha,
          options: {
            ...(authRedirectUrl ? { emailRedirectTo: authRedirectUrl } : {}),
            data: {
              nome: form.nome.trim(),
              perfil: form.perfil,
              usuario: form.usuario.trim() ? form.usuario.trim().toLowerCase() : null,
              // Cúpula nasce sem setor. O gatilho no banco também zeraria, mas
              // mandar o valor certo mantém a tela honesta sobre o que gravou.
              setor_id: cargoEscopoEmpresa ? null : (form.setor_id || null),
              empresa_id: empresaId,
              empresa_slug: empresas.find(e => e.id === empresaId)?.slug ?? empresaAtual?.slug,
            }
          }
        });
        // Descarta a sessão em memória do client isolado (defensivo).
        await signupClient.auth.signOut().catch(() => {});
        if (error) {
          if (error.message.toLowerCase().includes('database error')) {
            throw new Error('Erro interno ao criar conta. Tente novamente em alguns instantes ou entre em contato com o suporte.');
          }
          throw error;
        }
        toast.success(signUpData?.session
          ? 'Usuário criado com sucesso!'
          : 'Usuário criado! Ele receberá um e-mail de confirmação.');
      }
      setDialogOpen(false);
      fetchDados();
    } catch (e) {
      // PostgrestError não é instanceof Error — sem este fallback o toast
      // engolia a mensagem real do banco (ex.: violação de CHECK/RLS).
      const msg = e instanceof Error
        ? e.message
        : ((e as { message?: string })?.message ?? 'Erro ao salvar usuário');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function fazerUploadFotoParaUsuario(targetId: string, file: File) {
    setUploadando(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `avatars/${targetId}.${ext}`;
      const { error: upErr } = await supabase.storage.from('perfis').upload(path, file, { upsert: true });
      if (upErr) { toast.error(`Erro no upload: ${upErr.message}`); return; }
      const { data: { publicUrl } } = supabase.storage.from('perfis').getPublicUrl(path);
      const urlFinal = `${publicUrl}?t=${Date.now()}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- foto_url ainda não está no tipo gerado de Perfil.
      const { error: dbErr } = await supabase.from('perfis').update({ foto_url: urlFinal } as any).eq('id', targetId);
      if (dbErr) { toast.error(`Erro ao salvar foto: ${dbErr.message}`); return; }
      toast.success('Foto atualizada com sucesso!');
      setUploadTarget(null);
      fetchDados();
    } finally { setUploadando(false); }
  }

  async function excluirFotoDeUsuario(u: Perfil) {
    if (!u.foto_url) return;
    // Tentar remover do storage (path convencional)
    const urlPath = u.foto_url.split('/object/public/perfis/')[1]?.split('?')[0];
    if (urlPath) {
      await supabase.storage.from('perfis').remove([urlPath]);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- foto_url ainda não está no tipo gerado de Perfil.
    const { error } = await supabase.from('perfis').update({ foto_url: null } as any).eq('id', u.id);
    if (error) { toast.error(`Erro ao excluir foto: ${error.message}`); return; }
    toast.success('Foto removida com sucesso!');
    fetchDados();
  }

  async function alterarSenhaOperador() {
    const alvo = senhaTarget ?? editando;
    if (!alvo || !novaSenha.trim()) { toast.error('Preencha a nova senha'); return; }
    if (novaSenha.length < MIN_SENHA) { toast.error(`A senha deve ter pelo menos ${MIN_SENHA} caracteres`); return; }
    setSalvandoSenha(true);
    try {
      await redefinirSenhaDeUsuario(alvo.id, novaSenha.trim());
      toast.success(`Senha de ${alvo.nome} redefinida! Avise a senha a ela — o sistema vai pedir que troque por uma própria.`);
      setSenhaTarget(null);
      setNovaSenha('');
      fetchDados();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao redefinir a senha.');
    } finally { setSalvandoSenha(false); }
  }

  /*
   * Férias precisa da data de retorno ANTES de gravar.
   *
   * Este estado é o pedido em espera: o dropdown não grava mais direto quando a
   * escolha é "férias" — ele abre a caixa, e só o "Confirmar" dela chama
   * `definirSituacao`. Sem isso a etiqueta nasceria sem prazo e voltaria a ser
   * o estado sem fim que ninguém desliga.
   */
  const [feriasAlvo, setFeriasAlvo] = useState<Perfil | null>(null);
  const [feriasAte, setFeriasAte]   = useState('');
  const [salvandoFerias, setSalvandoFerias] = useState(false);

  /** Amanhã, em 'yyyy-MM-dd'. Voltar hoje ou ontem não é férias. */
  const minRetorno = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  // Item 5: define a situação (ativo/férias/desligado) com efeitos colaterais.
  async function handleSituacao(u: Perfil, sit: SituacaoUsuario) {
    if ((u.situacao ?? 'ativo') === sit) return;
    if (sit === 'ferias') {
      // Semeia com o retorno anterior quando existe: renovação de férias é o
      // caso comum, e o mês costuma ser o mesmo.
      setFeriasAte(u.ferias_ate && u.ferias_ate >= minRetorno ? u.ferias_ate : '');
      setFeriasAlvo(u);
      return;
    }
    const { error } = await definirSituacao(u.id, sit, {
      empresaId:   empresaAtual?.id ?? null,
      isPaguePlay: tenant.isPaguePlay,
    });
    if (error) { toast.error('Erro ao alterar situação'); return; }
    toast.success(
      sit === 'ativo' ? 'Usuário marcado como ativo'
      : 'Usuário desligado (sem acesso; acordos liberados para retabulação)',
    );
    fetchDados();
  }

  async function confirmarFerias() {
    if (!feriasAlvo || !feriasAte) return;
    setSalvandoFerias(true);
    try {
      const { error } = await definirSituacao(feriasAlvo.id, 'ferias', {
        empresaId:   empresaAtual?.id ?? null,
        isPaguePlay: tenant.isPaguePlay,
        feriasAte,
      });
      if (error) { toast.error(error); return; }
      const [a, m, d] = feriasAte.split('-');
      toast.success(
        `${feriasAlvo.nome} está de férias até ${d}/${m}/${a}. `
        + 'Volta ao normal sozinho no dia seguinte.',
      );
      setFeriasAlvo(null);
      setFeriasAte('');
      fetchDados();
    } finally { setSalvandoFerias(false); }
  }

  // #6: excluir usuário direto do modal Editar.
  // Estratégia: deletar o registro em `perfis` (cascata no banco remove vínculos).
  // Obs.: o auth.user correspondente só pode ser deletado por uma Edge Function com
  // service-role key — se ela existir (admin-delete-user), chamamos; caso contrário
  // removemos só o perfil (o auth.user fica órfão mas sem acesso, pois RLS exige perfil).
  const [excluindoUsuario, setExcluindoUsuario] = useState(false);
  const [confirmExclusaoUser, setConfirmExclusaoUser] = useState(false);

  // Quanto o usuário segura, lido ao abrir a confirmação: a caixa mostra o
  // número em vez de um "tem certeza?" que não diz o que vai embora.
  const [resumoDaExclusao, setResumoDaExclusao] = useState<ResumoExclusao | null>(null);

  async function abrirConfirmacaoExclusao() {
    if (!editando) return;
    setConfirmExclusaoUser(true);
    setResumoDaExclusao(null);
    setResumoDaExclusao(await resumoExclusao(editando.id));
  }

  async function excluirUsuarioEditado() {
    if (!editando) return;
    if (editando.id === perfilAtual?.id) {
      toast.error('Você não pode excluir a si mesmo.');
      return;
    }
    setExcluindoUsuario(true);
    try {
      // As tabulações do usuário vão junto — regra de 05/08/2026 — e o
      // relatório é baixado ANTES de qualquer DELETE. O fallback antigo
      // (`perfis.delete()`) saiu: ele batia na MESMA FK que a RPC, então só
      // produzia um segundo 409 no console e uma mensagem crua na tela.
      const r = await excluirUsuarioComAcordos({
        userId: editando.id,
        nome:   editando.nome ?? 'usuario',
      });

      if (r.status === 'falha') { toast.error(r.mensagem); return; }

      toast.success(
        r.acordosApagados > 0
          ? `Usuário ${editando.nome} excluído. ${r.acordosApagados.toLocaleString('pt-BR')} `
            + `tabulaç${r.acordosApagados === 1 ? 'ão' : 'ões'} apagada${r.acordosApagados === 1 ? '' : 's'}`
            + `${r.relatorio ? ` — relatório salvo em ${r.relatorio}` : ''}. Os NRs voltaram a ficar livres.`
          : `Usuário ${editando.nome} excluído com sucesso!`,
      );
      setConfirmExclusaoUser(false);
      setDialogOpen(false);
      fetchDados();
    } catch (e) {
      // Sem este catch, um throw sai como rejeição não tratada e a tela fica
      // muda — o admin clica de novo e só rebaixa a planilha.
      toast.error(`Erro ao excluir usuário: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExcluindoUsuario(false);
    }
  }

  // Setores disponíveis no formulário: só os da empresa selecionada (evita
  // vincular um usuário a um setor de outra empresa). Super Admin pode trocar
  // a empresa e a lista de setores acompanha.
  const setoresDoForm = useMemo(
    () => (form.empresa_id ? setores.filter(s => s.empresa_id === form.empresa_id) : setores),
    [setores, form.empresa_id],
  );

  /**
   * O cargo escolhido no formulário pertence à empresa em vez de a um setor?
   *
   * Lido do `form`, não do usuário sendo editado: trocar o cargo para Diretoria
   * já esconde o campo de setor na mesma hora, antes de salvar. Ver
   * `PERFIS_ESCOPO_EMPRESA`.
   */
  const cargoEscopoEmpresa = ehEscopoEmpresa(form.perfil);

  /**
   * Esta pessoa está sem setor num cargo que precisa de um?
   *
   * É o buraco que o rebaixamento da cúpula abre, e ele custou caro em
   * setembro/2026: Fábio Lopes de Aquino era `diretoria` na PaguePlay, o
   * gatilho `a_trg_perfis_escopo_empresa` zerou o `setor_id` dele (correto —
   * diretoria pertence à empresa), e uma semana depois o cargo virou
   * `gerencia`. O gatilho só zera; nunca devolve. Ficou uma gerência sem setor.
   *
   * O estrago não apareceu como erro. `fn_analitico_resumo_por_operador` monta
   * `v_ops_setor` só quando `v_setor_id IS NOT NULL`, e um `= ANY('{}')` é
   * sempre falso: a RPC passou a devolver ZERO linhas. Desempenho Equipes,
   * Quartis e o ranking do Analítico ficaram zerados, com cara de dado real.
   *
   * E não havia porta para consertar pela tela. O campo Setor é somente-leitura
   * na edição porque mudar de setor é TRANSFERÊNCIA (apaga tabulação, libera NR,
   * tira de equipe) — e transferência pressupõe um setor de origem, que aqui não
   * existe. Preencher o vazio não move nada de lugar; por isso, e só neste caso,
   * o campo volta a ser editável.
   *
   * ⚠️ A RLS ainda manda: `perfis_admin_update` exige `usuarios_administrar` e,
   * com `usuarios_escopo = 2`, casa `setor_id` da linha ANTIGA com o do editor —
   * o que um `setor_id` nulo nunca satisfaz. Na prática quem consegue gravar
   * isto tem `usuarios_escopo_todos_setores`, que é o público certo.
   */
  const setorVazioParaPreencher = !!editando && !cargoEscopoEmpresa && !editando.setor_id;

  const nomeSetor = (u: Perfil) => (u.setores as { nome?: string } | undefined)?.nome ?? '—';
  const nomeEmpresa = (u: Perfil) => (u.empresas as { nome?: string } | undefined)?.nome ?? '—';

  /*
   * ── Clones cross-setor (BookPlay) ─────────────────────────────────────────
   * Operador clonado numa equipe de OUTRO setor aparece TAMBÉM no setor
   * destino, com a tag "clone de <setor de origem>".
   *
   * Isto era trinta linhas escritas aqui e outras trinta iguais em
   * `AdminSetoresAba`. Agora é um hook só — ver `useClonesCross`.
   */
  const clonesCross = useClonesCross(empresaAtual?.id);

  // As equipes da empresa, para a coluna «Equipe» da lista. Ver `equipes`.
  useEffect(() => {
    const empresaId = empresaAtual?.id;
    if (!empresaId) { setEquipes([]); return; }
    let cancel = false;
    void supabase.from('equipes').select('id, nome').eq('empresa_id', empresaId)
      .then(({ data, error }) => {
        if (cancel) return;
        if (error) { console.warn('[AdminUsuarios] equipes:', error.message); setEquipes([]); return; }
        setEquipes((data as { id: string; nome: string }[]) ?? []);
      });
    return () => { cancel = true; };
  }, [empresaAtual?.id]);

  /*
   * ── Filtro de acesso ──────────────────────────────────────────────────────
   *
   * Duas perguntas diferentes, e só uma delas é escopo de aba:
   *
   *   1. ATÉ ONDE eu enxergo — próprio setor ou empresa. Vinha de duas listas
   *      de cargo escritas aqui, e a `ouvidoria` não estava em nenhuma das
   *      duas: caía no `return` final e via a empresa inteira sem que uma
   *      linha sequer dissesse isso. Agora é `usuarios_escopo_*`.
   *   2. QUEM eu enxergo — se contas de administrador aparecem na lista. Essa
   *      continua saindo do cargo de quem olha, de propósito: é outro eixo, e
   *      transformá-la em nível de escopo misturaria as duas.
   */
  const PERFIS_ADMIN = ['administrador', 'super_admin'];

  const usuariosFiltrados = filtrarUsuariosVisiveis(
    isSuperAdmin && filtroEmpresa
      ? usuarios.filter(u => u.empresa_id === filtroEmpresa)
      : usuarios,
    {
      podeVerAdministradores,
      veTodosSetores: veUsuariosDeTodosSetores,
      setorAtualId: perfilAtual?.setor_id,
    },
  );

  // ── Agrupamento por setor ────────────────────────────────────────────────────
  const usuariosPorSetor = usuariosFiltrados.reduce<Record<string, { nomeSetor: string; lista: PerfilComClone[] }>>((acc, u) => {
    const sid = u.setor_id ?? '__sem_setor__';
    const snome = nomeSetor(u);
    if (!acc[sid]) acc[sid] = { nomeSetor: snome, lista: [] };
    acc[sid].lista.push(u);
    return acc;
  }, {});

  // BookPlay: injeta os clones de OUTRO setor no grupo do setor destino, com tag.
  // Respeita o alcance configurado para qualquer cargo: sem "todos os setores",
  // o grupo do setor da pessoa é o único destino possível, mesmo só com clones.
  if (tenant.slug === 'bookplay' && clonesCross.length) {
    // O painel manda no alcance. Cargo nenhum ganha todos os setores por estar
    // ausente de uma lista fixa; se a chave ampla está desligada, até clones só
    // entram no grupo do setor da pessoa logada.
    const escopadoAoSetor = !veUsuariosDeTodosSetores;
    const perfilPorId = new Map(usuarios.map(p => [p.id, p]));
    const nomeSetorPorId = (id: string) => setores.find(s => s.id === id)?.nome ?? 'Setor';
    for (const c of clonesCross) {
      if (escopadoAoSetor && c.destinoSetorId !== perfilAtual?.setor_id) continue;
      const p = perfilPorId.get(c.operadorId);
      if (!p || !p.setor_id || p.setor_id === c.destinoSetorId) continue;   // só cross-setor
      if (PERFIS_ADMIN.includes(p.perfil) && !podeVerAdministradores) continue;
      const grupo = (usuariosPorSetor[c.destinoSetorId] ??= { nomeSetor: nomeSetorPorId(c.destinoSetorId), lista: [] });
      if (grupo.lista.some(x => x.id === p.id)) continue;
      grupo.lista.push({ ...p, _cloneDe: nomeSetor(p) });
    }
  }

  /*
   * As opcoes do seletor.
   *
   * Sai do agrupamento COMPLETO, e nao do filtrado: usar a lista ja recortada
   * deixaria o seletor com uma opcao so depois do primeiro clique, e nao
   * haveria como voltar sem recarregar.
   */
  const setoresParaFiltro = Object.entries(usuariosPorSetor)
    .sort((a, b) => a[1].nomeSetor.localeCompare(b[1].nomeSetor, 'pt-BR'));

  /*
   * ── Os números do topo ────────────────────────────────────────────────────
   *
   * Saem de `usuariosFiltrados` — o que ESTA pessoa enxerga —, e não da lista
   * já recortada por busca ou setor: um contador que muda quando se digita não
   * conta nada, só ecoa o filtro.
   *
   * «Sem setor» é o que mais rende. Quem está sem setor num cargo que precisa
   * de um fica invisível para o Analítico e para o Painel Líder, com cara de
   * dado real — o caso do `setorVazioParaPreencher`. Antes só se descobria
   * rolando até o fim da lista; agora o número aparece e o clique leva até lá.
   */
  const totalPessoas = usuariosFiltrados.length;
  const totalOnline  = usuariosFiltrados.filter(u => onlineIds.has(u.id)).length;
  const totalFerias  = usuariosFiltrados.filter(u => (u.situacao ?? 'ativo') === 'ferias').length;
  const totalSemSetor = usuariosFiltrados.filter(u => !u.setor_id && !ehEscopoEmpresa(u.perfil)).length;

  const buscaNormalizada = normalizarBusca(busca);

  const setoresOrdenados: GrupoDeSetor[] = (() => {
    // O filtro entra DEPOIS do agrupamento, e nao antes: o grupo de um setor
    // pode existir so por causa de um clone de outro setor (o bloco acima), e
    // filtrar as pessoas antes o faria sumir.
    const entries = Object.entries(usuariosPorSetor)
      .filter(([sid]) => !filtroSetor || sid === filtroSetor);
    // Aplica a mesma ordem persistida pelo DnD da aba Setores para manter
    // consistência visual entre as abas Usuários e Setores.
    const empresaId = empresaAtual?.id;
    const ordenados = aplicarOrdemSetores(
      entries.map(([sid, g]) => ({ id: sid, nome: g.nomeSetor })),
      empresaId,
    );
    const byId = new Map(entries);
    return ordenados
      .map(({ id }) => {
        const g = byId.get(id);
        if (!g) return null;
        // A busca recorta PESSOAS; o setor que ficar sem nenhuma some da tela,
        // em vez de virar um cabeçalho vazio que o olho ainda precisa checar.
        const lista = buscaNormalizada
          ? g.lista.filter(u => casaComBusca(u, buscaNormalizada))
          : g.lista;
        if (lista.length === 0) return null;
        return {
          id,
          nomeSetor: g.nomeSetor === '—' ? 'Sem setor' : g.nomeSetor,
          lista,
        } satisfies GrupoDeSetor;
      })
      .filter((g): g is GrupoDeSetor => g !== null);
  })();

  /** Os perfis por trás dos ids marcados — o que vai para a transferência. */
  const perfisSelecionados = usuariosFiltrados.filter(u => selecionados.has(u.id));

  const nomeEquipe = (u: Perfil) =>
    (u.equipe_id ? equipes.find(e => e.id === u.equipe_id)?.nome : null) ?? null;

  return (
    <div className="h-full flex flex-col">
      {/* Cabeçalho */}
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> Usuários
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gestão de usuários e equipes</p>
          </div>

          {/*
            O seletor de mês.
            ────────────────────────────────────────────────────────────────
            «Mês atual» é a tela de sempre, com todos os botões. Um mês
            fechado abre o RETRATO daquele mês, só de leitura — ver
            `UsuariosDoMesPainel`, que explica por que são duas telas e não
            uma com filtro.

            Só aparece quando existe pelo menos um mês fechado com foto: um
            seletor de uma opção só é um seletor que não decide nada.
          */}
          {mesesDisponiveis.length > 0 && (
            <div className="flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-muted-foreground shrink-0" />
              <Select
                value={mesRetrato ?? 'atual'}
                onValueChange={v => setMesRetrato(v === 'atual' ? null : v)}
              >
                <SelectTrigger className="h-8 w-[190px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="atual">Mês atual (editável)</SelectItem>
                  {mesesDisponiveis.map(m => (
                    <SelectItem key={m} value={m}>{rotuloDoMes(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* Mês fechado: a tela inteira muda de assunto. */}
      {mesRetrato && empresaAtual?.id ? (
        <div className="flex-1 overflow-y-auto p-6">
          <UsuariosDoMesPainel empresaId={empresaAtual.id} mes={mesRetrato} />
        </div>
      ) : tabAtiva ? <Tabs value={tabAtiva} onValueChange={selecionarAba} className="flex-1 flex flex-col">
        {/* ── A régua de abas ──────────────────────────────────────────────
            Era `border-b-2` sublinhado, escrito à mão seis vezes com a mesma
            classe de 140 caracteres. O desenho da casa passou a ser o grupo
            segmentado quando o Analítico migrou; aqui ele fecha a fila.

            O `<Tabs>` continua embaixo: é ele que monta e desmonta os painéis
            (a aba Comemorações é `lazy`, e só deve baixar quando abrem ela).
            Trocamos só o gatilho visual. */}
        <div className="px-6 pb-3">
          <AbasSegmentadas
            abas={abasInternas}
            ativa={tabAtiva ?? null}
            onTrocar={selecionarAba}
            rotulo="Seção de Usuários"
          />
        </div>

        {/* ─── Aba: Usuários ─────────────────────────────────────────── */}
        {podeVerUsuarios && <TabsContent value="usuarios" className="flex-1 overflow-y-auto px-6 pb-6 mt-0">
        <div className="max-w-[1400px] mx-auto space-y-4">

          {/* ── Os quatro números ────────────────────────────────────────
              Contam sobre TODA a gente que este cargo enxerga, não sobre o
              recorte da tela: um número que muda quando se digita na busca
              não informa nada que a própria lista já não mostre. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiTile
              rotulo="Pessoas"
              valor={totalPessoas}
              sub={setoresParaFiltro.length === 1
                ? '1 setor'
                : `${setoresParaFiltro.length} setores`}
              Icon={Users}
              tom="primario"
            />
            <KpiTile
              rotulo="Online agora"
              valor={totalOnline}
              sub={totalPessoas > 0 ? `${Math.round((totalOnline / totalPessoas) * 100)}% da equipe` : undefined}
              Icon={Wifi}
              tom="sucesso"
            />
            <KpiTile
              rotulo="De férias"
              valor={totalFerias}
              sub={totalFerias > 0 ? 'voltam sozinhos na data' : 'ninguém fora'}
              Icon={Palmtree}
              tom="neutro"
            />
            {/* Clicável porque é o único dos quatro que pede ação: quem está
                sem setor num cargo que precisa de um some do Analítico e do
                Painel Líder sem acusar erro. Ver `setorVazioParaPreencher`. */}
            <button
              type="button"
              disabled={totalSemSetor === 0}
              onClick={() => escolherFiltroSetor('__sem_setor__')}
              title={totalSemSetor > 0 ? 'Ver quem está sem setor' : undefined}
              className={cn(
                'text-left rounded-xl transition-transform',
                totalSemSetor > 0
                  ? 'hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary cursor-pointer'
                  : 'cursor-default',
              )}
            >
              <KpiTile
                rotulo="Sem setor"
                valor={totalSemSetor}
                sub={totalSemSetor > 0 ? 'zeram o analítico — clique' : 'todos vinculados'}
                Icon={UserMinus}
                tom={totalSemSetor > 0 ? 'alerta' : 'neutro'}
              />
            </button>
          </div>

          {/* ── Barra de ferramentas ─────────────────────────────────────
              A busca vem primeiro e ocupa o espaço que sobra: é a ação mais
              usada da tela e antes ela simplesmente não existia. */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por nome, login ou e-mail…"
                aria-label="Buscar pessoa"
                className="h-9 pl-9 pr-8 text-sm"
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca('')}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {isSuperAdmin && empresas.length > 1 && (
              <Select
                value={filtroEmpresa || TODAS_EMPRESAS_SELECT_VALUE}
                onValueChange={(value) => setFiltroEmpresa(value === TODAS_EMPRESAS_SELECT_VALUE ? '' : value)}
              >
                <SelectTrigger className="w-40 h-9 text-sm" aria-label="Filtrar por empresa"><SelectValue placeholder="Empresa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS_EMPRESAS_SELECT_VALUE}>Todas Empresas</SelectItem>
                  {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {!isSuperAdmin && empresaAtual && (
              <Badge variant="outline" className="h-9 px-3 text-xs font-normal">{empresaAtual.nome}</Badge>
            )}
            {isSuperAdmin && filtroEmpresa && (
              <Button variant="ghost" size="sm" className="h-9" aria-label="Limpar filtro de empresa" onClick={() => setFiltroEmpresa('')}>
                Limpar
              </Button>
            )}

            {setoresParaFiltro.length > 1 && (
              <Select
                value={filtroSetor || TODOS_SETORES_SELECT_VALUE}
                onValueChange={v => escolherFiltroSetor(v === TODOS_SETORES_SELECT_VALUE ? '' : v)}
              >
                <SelectTrigger className="w-44 h-9 text-sm" aria-label="Filtrar por setor">
                  <SelectValue placeholder="Setor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS_SETORES_SELECT_VALUE}>Todos os setores</SelectItem>
                  {setoresParaFiltro.map(([sid, g]) => (
                    <SelectItem key={sid} value={sid}>
                      {g.nomeSetor === '—' ? 'Sem setor' : g.nomeSetor} ({g.lista.length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Recolher some durante a busca: lá os grupos ficam abertos à
                força, e um botão que não faz nada é pior que um botão a menos. */}
            {setoresParaFiltro.length > 1 && !busca && (
              <Button
                variant="ghost" size="sm" className="h-9 text-xs"
                onClick={() => setSetoresRecolhidos(
                  atual => atual.size ? new Set() : new Set(setoresParaFiltro.map(([sid]) => sid)),
                )}
              >
                {setoresRecolhidos.size ? 'Expandir todos' : 'Minimizar todos'}
              </Button>
            )}

            <Button variant="outline" size="icon" className="h-9 w-9" title="Recarregar" onClick={fetchDados}>
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>
            {temPermissao('usuarios_administrar') && (
              <Button size="sm" className="h-9" onClick={abrirCriar}>
                <Plus className="w-4 h-4 mr-2" /> Novo Usuário
              </Button>
            )}
          </div>

          {/* ── O que está selecionado, e o que dá para fazer com isso ────
              Veio da aba Setores junto com a transferência. Lá os checkboxes
              ficavam dentro da lista de cada setor, que era a lista que esta
              reforma tirou. */}
          {podeTransferir && selecionados.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2"
            >
              <p className="text-xs text-foreground flex-1">
                <strong>{selecionados.size}</strong> pessoa{selecionados.size !== 1 && 's'} selecionada{selecionados.size !== 1 && 's'}
              </p>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelecionados(new Set())}>
                <X className="w-3 h-3 mr-1" /> Limpar
              </Button>
              <Button
                size="sm" className="h-7 text-xs gap-1.5"
                onClick={() => { if (perfisSelecionados.length) setTransferindo(perfisSelecionados); }}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir selecionadas
              </Button>
            </motion.div>
          )}

          {/* ── A lista ── */}
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} className="h-14 rounded-xl border border-border bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : setoresOrdenados.length === 0 ? (
            <ListaPessoasVazia busca={busca} />
          ) : (
            <ListaPessoas
              grupos={setoresOrdenados}
              recolhidos={setoresRecolhidos}
              onAlternarSetor={alternarSetor}
              buscaAtiva={!!buscaNormalizada}
              selecionados={selecionados}
              onAlternarSelecao={alternarSelecao}
              onSelecionarGrupo={selecionarGrupo}
              onlineIds={onlineIds}
              perfilAtualId={perfilAtual?.id}
              impersonando={impersonando}
              podeTransferir={podeTransferir}
              podeGerenciarSituacao={podeGerenciarSituacao}
              podeImpersonar={isSuperAdmin}
              podeEditar={u => !u._cloneDe && (
                temPermissao('usuarios_administrar')
                || (temPermissao('usuarios_editar_do_setor') && u.id !== perfilAtual?.id)
              )}
              mostrarEmpresa={isSuperAdmin && !filtroEmpresa}
              nomeEmpresa={nomeEmpresa}
              nomeEquipe={nomeEquipe}
              onEditar={abrirEditar}
              onTransferir={u => setTransferindo([u])}
              onSituacao={handleSituacao}
              onEntrarComo={entrarComo}
              onVerFoto={setFotoExpandida}
            />
          )}

          {/* ── Transferências recentes, com o desfazer ───────────────────
              Fica ao lado do botão que transfere — quem errou volta ao lugar
              de onde transferiu, não a uma tela de auditoria noutro canto.
              Mudou de aba junto com a transferência. */}
          {podeTransferir && (
            <div className="pt-2">
              <HistoricoTransferencias
                empresaId={empresaAtual?.id}
                podeDesfazer={temPermissao('usuarios_desfazer_transferencia')}
                nomeDoSetor={id => (id ? setores.find(s => s.id === id)?.nome ?? 'outro setor' : 'sem setor')}
                nomeDaEmpresa={id => {
                  if (!id) return 'empresa';
                  if (id === empresaAtual?.id) return empresaAtual?.nome ?? 'esta empresa';
                  return empresas.find(e => e.id === id)?.nome ?? 'outra empresa';
                }}
                nomeDoPerfil={id => usuarios.find(p => p.id === id)?.nome}
                onDesfeita={fetchDados}
              />
            </div>
          )}
        </div>
        </TabsContent>}


        {/* ─── Aba: Setores ──────────────────────────────────────────── */}
        {podeVerSetores && (
          <TabsContent value="setores" className="flex-1 overflow-y-auto mt-0">
            <AdminSetoresAba />
          </TabsContent>
        )}

        {/* ─── Aba: Equipes ──────────────────────────────────────────── */}
        {podeVerEquipes && (
        <TabsContent value="equipes" className="flex-1 overflow-y-auto mt-0">
          <AdminEquipes />
        </TabsContent>
        )}

        {/* ─── Aba: Metas (BookPlay) ─────────────────────────────────── */}
        {podeVerMetas && (
          <TabsContent value="metas" className="flex-1 overflow-y-auto p-6 mt-0">
            <MetasConfig />
          </TabsContent>
        )}

        {/* ─── Aba: Comemorações ─────────────────────────────────────── */}
        {/* Sem `p-6` aqui: a página já traz o próprio espaçamento, como
            Setores e Equipes. O Suspense é obrigatório — o import é lazy. */}
        {podeAdministrarContas && (
          <TabsContent value="desligados" className="flex-1 overflow-y-auto mt-0">
            <AdminDesligadosAba
              desligados={desligados}
              loading={loading}
              onReativar={async (p) => {
                // Reativar devolve `arquivado = false` e libera o login. Os
                // vínculos de acordo NÃO voltam: eles foram soltos no
                // arquivamento e o NR já pode estar com outra pessoa.
                await definirSituacao(p.id, 'ativo');
                await fetchDados();
              }}
            />
          </TabsContent>
        )}

        {podeVerComemoracoes && (
          <TabsContent value="comemoracoes" className="flex-1 overflow-y-auto mt-0">
            <Suspense fallback={
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
              </div>
            }>
              <Comemoracoes />
            </Suspense>
          </TabsContent>
        )}

      </Tabs> : (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          Nenhuma aba interna de Usuários foi liberada para este cargo.
        </div>
      )}

      {/* ── Dialog unificado: editar/criar usuário (dados + foto + senha) ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" aria-describedby="modal-usuario-desc">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
            <DialogDescription id="modal-usuario-desc" className="sr-only">
              {editando ? 'Editar dados, foto e senha do usuário' : 'Criar novo usuário'}
            </DialogDescription>
          </DialogHeader>

          {/* ── Seção: Foto de perfil (só em modo edição) ─────────────── */}
          {editando && (
            <div className="space-y-2 py-1 border-b border-border pb-4">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Foto de perfil
              </Label>
              <div className="flex items-center gap-3">
                <Avatar className="w-14 h-14">
                  {editando.foto_url && <AvatarImage src={editando.foto_url} alt={editando.nome} />}
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                    {editando.nome.split(' ').map((n: string) => n[0]).slice(0,2).join('')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={uploadando}
                    onClick={() => { setUploadTarget(editando); fileInputRef.current?.click(); }}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    {uploadando ? 'Enviando...' : (editando.foto_url ? 'Trocar foto' : 'Adicionar foto')}
                  </Button>
                  {editando.foto_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                      onClick={() => excluirFotoDeUsuario(editando)}
                    >
                      <Trash2 className="w-3 h-3" />
                      Remover foto
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Seção: Dados cadastrais ───────────────────────────────── */}
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome completo" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Login (usuário)</Label>
              <Input value={form.usuario} onChange={e => setForm(f => ({ ...f, usuario: e.target.value }))} placeholder="kauan_teixeira" className="h-9 text-sm font-mono" />
              <p className="text-xs text-muted-foreground">Usado para login sem e-mail. Opcional se usar e-mail.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">E-mail {!editando && <span className="text-muted-foreground font-normal">(opcional se definir usuário)</span>}</Label>
              <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@empresa.com" className="h-9 text-sm font-mono" disabled={!!editando} />
            </div>
            {!editando && (
              <div className="space-y-1.5">
                <Label className="text-xs">Senha *</Label>
                <Input type="password" value={form.senha} onChange={e => setForm(f => ({ ...f, senha: e.target.value }))} placeholder="••••••••" className="h-9 text-sm" />
              </div>
            )}
            {/* Cargo: só admin/super_admin definem. Para os demais o campo é
                somente leitura — impede líder de escolher/criar admin. (O banco
                também bloqueia via RLS; isto remove a opção enganosa da tela.) */}
            <div className="space-y-1.5">
              <Label className="text-xs">Perfil *</Label>
              {podeAdministrarContas ? (
                <Select value={form.perfil} onValueChange={v => setForm(f => ({ ...f, perfil: v as PerfilUsuario }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operador">Operador</SelectItem>
                    <SelectItem value="lider">Líder</SelectItem>
                    <SelectItem value="elite">Elite</SelectItem>
                    <SelectItem value="gerencia">Gerência</SelectItem>
                    <SelectItem value="diretoria">Diretoria</SelectItem>
                    <SelectItem value="ouvidoria">Ouvidoria</SelectItem>
                    <SelectItem value="rh">RH</SelectItem>
                    <SelectItem value="administrador">Administrador</SelectItem>
                    {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                  </SelectContent>
                </Select>
              ) : (
                <div className="h-9 flex items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                  {PERFIL_LABELS[form.perfil] ?? form.perfil}
                  <span className="ml-auto text-[10px] uppercase tracking-wide">só admin altera</span>
                </div>
              )}
            </div>
            {/* Setor e empresa: escolhidos ao CRIAR, somente leitura ao editar.
                ─────────────────────────────────────────────────────────────
                Mudá-los depois é uma TRANSFERÊNCIA: apaga tabulação ou muda o
                setor dela, libera NR, tira de equipe e clones, deixa fantasma
                na equipe de origem e precisa poder ser desfeita.

                Enquanto isso morava aqui, havia três portas para a mesma coisa
                — este campo, o mesmo campo de empresa e o botão "Transferir" da
                aba Setores, que fazia um `update` cru sem nada disso. Agora a
                porta é uma só, na aba Setores. */}
            {/* Cúpula (diretoria/administrador/super_admin) pertence à EMPRESA,
                não a um setor — o campo sai da tela em vez de ficar desabilitado
                com um valor que o banco vai descartar. O gatilho
                `a_trg_perfis_escopo_empresa` zera setor_id/equipe_id na
                gravação, então mesmo um payload antigo não recria o vínculo. */}
            <div className="space-y-1.5">
              <Label className="text-xs">Setor</Label>
              {cargoEscopoEmpresa ? (
                <>
                  <Input value="Empresa inteira" readOnly className="h-9 text-sm bg-muted/40" />
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Building2 className="w-3 h-3 shrink-0" />
                    {PERFIL_LABELS[form.perfil] ?? form.perfil} não pertence a um setor:
                    a visão é da empresa toda.
                  </p>
                </>
              ) : setorVazioParaPreencher ? (
                /* Sem setor num cargo que precisa de um. Não é transferência —
                   não há de onde sair —, então o campo abre. Ver
                   `setorVazioParaPreencher`. */
                <>
                  <Select value={form.setor_id} onValueChange={v => setForm(f => ({ ...f, setor_id: v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione um setor" /></SelectTrigger>
                    <SelectContent>
                      {setoresDoForm.length === 0
                        ? <SelectItem value="__none__" disabled>Nenhum setor nesta empresa</SelectItem>
                        : setoresDoForm.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-amber-600 dark:text-amber-500 flex items-center gap-1">
                    <Building2 className="w-3 h-3 shrink-0" />
                    {PERFIL_LABELS[form.perfil] ?? form.perfil} pertence a um setor e está sem
                    nenhum — assim o Painel Líder e o Analítico dessa pessoa ficam zerados.
                  </p>
                </>
              ) : editando ? (
                <>
                  <Input
                    value={setores.find(s => s.id === editando.setor_id)?.nome ?? 'Sem setor'}
                    readOnly className="h-9 text-sm bg-muted/40"
                  />
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <ArrowRightLeft className="w-3 h-3 shrink-0" />
                    Para mover de setor ou de empresa, use <strong>Transferir</strong> na
                    linha da pessoa, aqui mesmo na lista.
                  </p>
                </>
              ) : (
                <Select value={form.setor_id} onValueChange={v => setForm(f => ({ ...f, setor_id: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione um setor" /></SelectTrigger>
                  <SelectContent>
                    {setoresDoForm.length === 0
                      ? <SelectItem value="__none__" disabled>Nenhum setor nesta empresa</SelectItem>
                      : setoresDoForm.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
             <div className="space-y-1.5">
               <Label className="text-xs">Empresa</Label>
               {isSuperAdmin && !editando ? (
                 <Select value={form.empresa_id} onValueChange={v => setForm(f => ({ ...f, empresa_id: v, setor_id: setores.find(s => s.empresa_id === v)?.id ?? '' }))}>
                   <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione uma empresa" /></SelectTrigger>
                   <SelectContent>
                     {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                   </SelectContent>
                 </Select>
               ) : (
                 <Input
                   value={
                     (editando && empresas.find(e => e.id === editando.empresa_id)?.nome)
                     ?? empresaAtual?.nome ?? 'Tenant atual'
                   }
                   readOnly className="h-9 text-sm bg-muted/40"
                 />
               )}
             </div>
          </div>

          {/* ── Seção: Redefinir senha (edição, só admin/super_admin) ───
              A senha atual não é exibida porque não existe para ser exibida: o
              Supabase guarda o hash bcrypt dela, que não volta a texto. O que
              o admin pode fazer é definir uma nova. */}
          {editando && podeAdministrarContas && (
            <div className="space-y-2 py-2 border-t border-border pt-4">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Redefinir senha
              </Label>
              <div className="space-y-1.5">
                <Label className="text-xs">Nova senha</Label>
                <Input
                  type="text"
                  value={novaSenha}
                  onChange={e => setNovaSenha(e.target.value)}
                  placeholder="Deixe em branco para manter a senha atual"
                  className="h-9 text-sm font-mono"
                  autoComplete="off"
                />
                <p className="text-[11px] text-muted-foreground">
                  Mínimo {MIN_SENHA} caracteres. Deixe em branco para não alterar.
                  A senha atual não pode ser consultada — só substituída. Informe
                  a nova a {editando.nome.split(' ')[0]}; o botão de chave vai
                  aparecer para ela definir uma senha própria.
                </p>
              </div>
              {novaSenha.length > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 gap-1.5 w-full"
                  disabled={salvandoSenha || novaSenha.length < MIN_SENHA}
                  onClick={alterarSenhaOperador}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {salvandoSenha ? 'Salvando senha...' : 'Salvar nova senha'}
                </Button>
              )}
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            {/* #6: excluir usuário — só no modo Editar e não permite auto-exclusão */}
            {editando && editando.id !== perfilAtual?.id ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => { void abrirConfirmacaoExclusao(); }}
                disabled={excluindoUsuario}
              >
                <Trash2 className="w-4 h-4" />
                Excluir usuário
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={salvar} disabled={saving} className="gap-2">
                <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* #6: diálogo de confirmação de exclusão de usuário */}
      <Dialog open={confirmExclusaoUser} onOpenChange={setConfirmExclusaoUser}>
        <DialogContent className="max-w-md" aria-describedby="dlg-excl-user-desc">
          <DialogHeader>
            <DialogTitle>Excluir usuário</DialogTitle>
            <DialogDescription id="dlg-excl-user-desc">
              Tem certeza que deseja excluir{' '}
              <strong>{editando?.nome}</strong>? Esta ação não pode ser desfeita e removerá
              o acesso do usuário ao sistema.
            </DialogDescription>
          </DialogHeader>

          {/* O que exatamente vai embora. Sem isto, "não pode ser desfeita"
              não diz QUANTO se perde — e a exclusão apaga tabulação. */}
          {resumoDaExclusao && resumoDaExclusao.acordos > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 space-y-1.5">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {resumoDaExclusao.acordos.toLocaleString('pt-BR')}{' '}
                {resumoDaExclusao.acordos === 1 ? 'tabulação será apagada' : 'tabulações serão apagadas'}
              </p>
              <p className="text-[11px] text-amber-700/90 dark:text-amber-400/90 leading-relaxed">
                Uma planilha com todas elas é baixada antes da exclusão, para conferência.
                Os NRs voltam a ficar livres para outros operadores tabularem.
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                O recebimento do analítico e do diário <strong>não</strong> é apagado — ele
                continua contando nos totais de setor e equipe, sem o nome do operador.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmExclusaoUser(false)} disabled={excluindoUsuario}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={excluirUsuarioEditado}
              disabled={excluindoUsuario}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {excluindoUsuario ? 'Excluindo...' : 'Excluir definitivamente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Transferir de setor ou empresa ───────────────────────────────────
          A porta única. Ver `DialogTransferencia` para o que a operação faz de
          verdade e por que ela deixou de morar na aba Setores. */}
      <DialogTransferencia
        alvos={transferindo}
        setores={setores}
        empresaId={empresaAtual?.id}
        onFechar={() => setTransferindo(null)}
        onConcluida={() => {
          setTransferindo(null);
          setSelecionados(new Set());
          fetchDados();
        }}
      />

      {/* Input file oculto para upload de foto (usado pelo Dialog unificado) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && uploadTarget) {
            if (!file.type.startsWith('image/')) {
              toast.error('Arquivo inválido. Envie uma imagem.');
            } else {
              // Abre o modal de recorte antes do upload
              setFotoParaRecorte(file);
            }
          }
          e.target.value = '';
        }}
      />

      {/* ── Férias: a data de retorno é obrigatória ─────────────────────────
          A caixa existe para que a etiqueta nunca nasça sem prazo. Antes dela,
          marcar férias era um estado que só outra pessoa desfazia — e ninguém
          desfazia, porque a falha é silenciosa: quem não volta simplesmente
          não aparece no analítico. */}
      <Dialog
        open={!!feriasAlvo}
        onOpenChange={o => { if (!o) { setFeriasAlvo(null); setFeriasAte(''); } }}
      >
        <DialogContent className="max-w-md" aria-describedby="dlg-ferias-desc">
          <DialogHeader>
            <DialogTitle>Marcar férias</DialogTitle>
            <DialogDescription id="dlg-ferias-desc">
              Quando <strong>{feriasAlvo?.nome}</strong> volta das férias?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="ferias-ate" className="text-xs">Último dia de férias</Label>
              <Input
                id="ferias-ate"
                type="date"
                value={feriasAte}
                min={minRetorno}
                onChange={e => setFeriasAte(e.target.value)}
                className="h-9"
              />
            </div>
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              A etiqueta de férias vale até esse dia. No dia seguinte a situação
              volta para <strong>ativo</strong> sozinha e a pessoa reaparece no
              analítico — ninguém precisa lembrar de desligar.
              <br />
              Depois disso, a tela de <strong>Metas</strong> avisa que ela esteve
              fora, até você configurar a próxima meta.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setFeriasAlvo(null); setFeriasAte(''); }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void confirmarFerias()}
              disabled={!feriasAte || feriasAte < minRetorno || salvandoFerias}
            >
              {salvandoFerias && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Confirmar férias
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recorte da foto antes do upload */}
      <ModalRecortarFoto
        arquivo={fotoParaRecorte}
        onCancelar={() => setFotoParaRecorte(null)}
        onConfirmar={async (foto) => {
          setFotoParaRecorte(null);
          if (uploadTarget) await fazerUploadFotoParaUsuario(uploadTarget.id, foto);
        }}
      />

      {/* Modal foto expandida */}
      {fotoExpandida && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setFotoExpandida(null)}
        >
          <div className="relative max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <img
              src={fotoExpandida.url}
              alt={fotoExpandida.nome}
              className="w-full rounded-2xl shadow-2xl object-cover"
            />
            <p className="text-white text-center mt-3 font-medium text-sm">{fotoExpandida.nome}</p>
            <button
              onClick={() => setFotoExpandida(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center shadow-lg hover:bg-accent"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
