import { useEffect, useState, useRef, useMemo, lazy, Suspense } from 'react';
import { useSubAbaUso } from '@/providers/RastreioUsoProvider';
import { useSearchParams } from 'react-router-dom';
import { Users, Plus, RefreshCw, Building2, ArrowRightLeft, X, Trash2, Users2, Loader2, Target, PartyPopper, AlertTriangle, UserX, Search, UsersRound, Bot, Download } from 'lucide-react';
import {
  resumoExclusao, excluirUsuarioComAcordos, mensagemHistoricoFechado,
  type ResumoExclusao,
} from '@/services/admin/exclusaoUsuario.service';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { filtrarUsuariosVisiveis } from '@/lib/usuarios-visibilidade';
import { iniciarImpersonacao } from '@/services/impersonacao.service';
import { redefinirSenhaDeUsuario, MIN_SENHA } from '@/services/senha.service';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
// A lista de gente e a transferência: as duas saíram da aba Setores, que as
// duplicava. Ver o cabeçalho de `AdminSetoresAba` e o de `DialogTransferencia`.
import { ListaPessoas, ListaPessoasVazia, type GrupoDeSetor } from '@/components/admin/ListaPessoas';
import { DialogTransferencia } from '@/components/admin/DialogTransferencia';
import { DialogUsuario, type UserForm, type PodeNoUsuario } from '@/components/admin/DialogUsuario';
import { useSetorNucleo } from '@/hooks/useSetorNucleo';
import { motivoCargoForaDoSetor } from '@/lib/cargoDoNucleo';
import { HistoricoTransferencias } from '@/components/admin/HistoricoTransferencias';
import { useClonesCross } from '@/hooks/useClonesCross';
import { PulsoDeUsuarios, type NumerosDoPulso } from '@/components/admin/usuarios/PulsoDeUsuarios';
import { FichaPessoa } from '@/components/admin/usuarios/FichaPessoa';
import {
  FILTROS_VAZIOS, PENDENCIAS, infoDosSetores, listaEmCsv, passaNosFiltros, temPendencia,
  type ChavePendencia, type ContextoPendencia, type Filtros, type InfoDeSetor, type MarcaDaPessoa,
} from '@/components/admin/usuarios/modelo';
import { empresasDaCobrancaQueVejo } from '@/services/admin/empresasDaCobranca.service';
import '@/components/admin/usuarios/usuarios.css';
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
import { CalendarRange } from 'lucide-react';
// A lista de um mes FECHADO — so leitura, com as etiquetas do que mudou depois.
import { UsuariosDoMesPainel } from '@/components/admin/UsuariosDoMesPainel';
import { mesesComRetrato } from '@/services/admin/usuariosDoMes.service';
import { ehMesAtual, rotuloDoMes } from '@/lib/mesReferencia';
import { supabase, createIsolatedAuthClient, Perfil, Setor, Empresa, SituacaoUsuario } from '@/lib/supabase';
import { definirSituacao, arquivarDesligadosAnteriores, encerrarFeriasVencidas } from '@/services/situacaoUsuario.service';
import { AdminDesligadosAba } from '@/pages/AdminDesligadosAba';
import { buildAuthRedirectUrl } from '@/lib/tenant';
import { fetchEmpresas } from '@/services/empresas.service';
import { TODAS_EMPRESAS_SELECT_VALUE, ehEscopoEmpresa, PERFIL_LABELS, getTodayISO } from '@/lib/index';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ModalRecortarFoto } from '@/components/ModalRecortarFoto';
import { equipesDoPerfil } from '@/services/equipes/equipeDoLider';
import { setorEntraNosFiltros } from '@/lib/setoresDosFiltros';

// Lazy: a aba Comemorações arrasta o editor de layout, o catálogo de sons e a
// biblioteca de mídia. Enquanto era rota própria, só baixava para quem a abria;
// o carregamento sob demanda mantém esse comportamento agora que virou aba.
const Comemoracoes = lazy(() => import('@/pages/Comemoracoes'));
// As duas abas do Comercial. Lazy pelo mesmo motivo: quem abre Usuários na
// cobrança não tem por que baixar a tela de metas de vendas nem a de feedback.
const MetasVendas = lazy(() => import('@/pages/Vendas/Metas'));
const AcompanhamentoVendas = lazy(() => import('@/pages/Vendas/Acompanhamento'));
const IasDoComercial = lazy(() => import('@/pages/Vendas/IasDoComercial'));

/** O que as abas lazy mostram enquanto baixam. */
function CarregandoAba() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
    </div>
  );
}

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

/* `UserForm` mora em `DialogUsuario`, junto da janela que o preenche. */

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
  // A aba Metas vive dentro de Usuários em toda a cobrança. O que muda entre
  // setores é a regra de negócio, não a marca nem o site (04/10/2026).
  const metasComoAba = true;
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

  /*
   * ── O que se pode mexer na janela de edição ───────────────────────────────
   *
   * As duas chaves acima respondem QUEM eu alcanço. Estas respondem O QUÊ.
   *
   * Antes de 06/09/2026 a resposta estava no código: nome, login e foto abriam
   * para quem conseguisse abrir a janela, cargo e senha pediam
   * `usuarios_administrar`, e excluir não pedia nada — o botão aparecia até
   * para um líder, que então tomava um 42501 do banco. Quem quisesse um líder
   * que corrige nome mas não troca login não tinha como pedir isso.
   *
   * Agora é uma chave por campo, e o painel decide. Nenhuma delas cria teto: a
   * RLS continua sendo quem manda no dado.
   */
  const podeNoUsuario: PodeNoUsuario = {
    nome:    temPermissao('usuarios_editar_nome'),
    login:   temPermissao('usuarios_editar_login'),
    foto:    temPermissao('usuarios_editar_foto'),
    cargo:   temPermissao('usuarios_editar_cargo'),
    senha:   temPermissao('usuarios_redefinir_senha'),
    excluir: temPermissao('usuarios_excluir'),
  };
  /*
   * Alcançar alguém sem poder mexer em nada não é edição.
   *
   * Sem isto o lápis abriria uma janela com todos os campos de cadeado — a
   * tela prometendo uma ação que ela não tem como cumprir, que é o mesmo
   * defeito do botão de excluir oferecido a quem o banco recusa.
   */
  const podeAlgoNoUsuario = Object.values(podeNoUsuario).some(Boolean);
  /*
   * A caixa «este login é automação» só existe no Comercial.
   *
   * `perfis.robo` é lido pelos painéis de Vendas e por mais nada. Oferecer a
   * marcação na cobrança seria um controle que não controla — e, pior, faria
   * toda edição de perfil de lá mandar `robo: false` no payload, apagando em
   * silêncio o que alguém marcou do outro lado.
   */
  const ehComercial = produtoDaEmpresa(empresaAtual, tenant.slug) === 'comercial';
  const mostrarRobo = ehComercial;
  const isSuperAdmin = perfilAtual?.perfil === 'super_admin';
  /** A lista única da cobrança (BookPlay + PaguePlay) — quem vê todos os setores. */
  const listaDaCobranca = ehCobranca && (isSuperAdmin || veUsuariosDeTodosSetores);
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
  /*
   * A aba Metas tem DUAS telas, uma por produto, e a mesma chave de URL.
   *
   * `metasComoAba` olha o slug do SITE, e o Comercial abre pelo site da
   * BookPlay — então só ele não bastava: a aba Metas da cobrança, com quartil e
   * dia útil, aparecia dentro do Comercial para quem tivesse `ver_metas`.
   * `ehCobranca` fecha isso.
   *
   * No Comercial a aba é a Metas de Vendas, que era item de menu próprio até
   * 16/09/2026 e pede a mesma chave que o item pedia. Pedido: «Meta de vendas
   * está separado de Usuários, sendo que na BookPlay metas é dentro de
   * Usuários».
   */
  const podeVerMetas = ehCobranca && metasComoAba && temPermissao('ver_metas');
  const podeVerMetasVendas = ehComercial && temPermissao('ver_metas_vendas');
  // Acompanhamento — feedback e ausências — é assunto de pessoa, e veio para cá
  // junto com a Metas de Vendas. Mesma chave do item de menu que existia.
  const podeVerAcompanhamento = ehComercial && temPermissao('ver_acompanhamento');
  // IAs — os logins de automação, com tipo e vínculo (01/10/2026). Chave
  // própria desde 02/10/2026 (`ver_ias_vendas`), com alcance por setor e
  // `vincular_ias_vendas` para mexer — ver o card Usuários em Permissões.
  const podeVerIas = ehComercial && temPermissao('ver_ias_vendas');
  const abasVisiveis = [
    podeVerUsuarios && 'usuarios',
    podeVerIas && 'ias',
    podeVerSetores && 'setores',
    podeVerEquipes && 'equipes',
    (podeVerMetas || podeVerMetasVendas) && 'metas',
    podeVerAcompanhamento && 'acompanhamento',
    podeVerComemoracoes && 'comemoracoes',
    // Arquivo morto: so quem administra contas. Nao e uma aba de operacao.
    podeAdministrarContas && 'desligados',
  ].filter((aba): aba is string => Boolean(aba));
  const tabAtiva = abasVisiveis.includes(tabFromUrl) ? tabFromUrl : abasVisiveis[0];
  // Monitoramento de uso: a aba aberta (Lista, Setores, Equipes, Metas…).
  useSubAbaUso(tabAtiva);
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
    acompanhamento: { label: 'Acompanhamento', Icon: UsersRound },
    ias:          { label: 'IAs',          Icon: Bot },
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
  // Nasce na empresa aberta, e não vazio: vazio é «Todas Empresas», e a
  // primeira leitura do super_admin trazia a casa inteira (ver `fetchDados`).
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>(() => empresaAtual?.id ?? '');
  /** Só a resposta da ÚLTIMA leitura entra na tela. Ver `fetchDados`. */
  const leituraAtual = useRef(0);
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
   * ── Usuários 2.0 (04/10/2026) ─────────────────────────────────────────────
   *
   * Na cobrança, quem vê todos os setores vê BookPlay e PaguePlay numa lista
   * só: a marca é a cidade do setor de cada pessoa e vira só uma etiqueta. O
   * que muda o que alguém vê é a regra de negócio do setor e as permissões —
   * nunca a marca nem o endereço por onde se entrou.
   */
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [agrupar, setAgrupar] = useState<'setor' | 'az'>('setor');
  const [abertaId, setAbertaId] = useState<string | null>(null);
  /** As empresas da lista: as duas da cobrança, ou só a aberta. */
  const [empresasDaLista, setEmpresasDaLista] = useState<string[]>([]);
  const [cidades, setCidades] = useState<{ id: string; nome: string }[]>([]);
  /** operador_id → meta individual do mês corrente. */
  const [metasDoMes, setMetasDoMes] = useState<Map<string, number>>(() => new Map());

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
  /** O setor que a transferência abre já escolhido — o Núcleo, vindo da janela de usuário. */
  const [destinoTransferencia, setDestinoTransferencia] = useState<string | null>(null);

  /*
   * As equipes, para a coluna «Equipe».
   *
   * Consulta à parte em vez de embed em `perfis`: aquela consulta já tem um
   * caminho de fallback por ambiguidade de FK (ver `EMBED_EMPRESA`), e
   * pendurar mais um join nela é arriscar o carregamento inteiro da lista por
   * causa de uma coluna. `equipes` é tabela pequena.
   */
  const [equipes, setEquipes] = useState<{ id: string; nome: string }[]>([]);
  /**
   * Quem lidera o quê (`equipe_lideres`). O líder não está em
   * `perfis.equipe_id` — e a coluna lia só dali, então todo líder aparecia sem
   * equipe (queixa de 28/09/2026). Ver `equipesDoPerfil`.
   */
  const [lideradasPor, setLideradasPor] = useState<Map<string, string[]>>(() => new Map());

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
  const [form,        setForm]        = useState<UserForm>({ nome: '', email: '', usuario: '', senha: '', perfil: 'operador', setor_id: '', empresa_id: '', robo: false });
  /*
   * Qual setor é o Núcleo na empresa do FORMULÁRIO — o super_admin cadastra
   * gente em outra empresa, e o Núcleo dela é outro. Decide onde o cargo
   * Assistente ADM pode ser gravado; ver `cargoDoNucleo.ts`.
   */
  const setorNucleoId = useSetorNucleo(form.empresa_id || empresaAtual?.id);

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
    /*
     * Leituras sobrepostas: a tela abre, o filtro de empresa se ajusta, e duas
     * leituras correm juntas — a primeira sem filtro de empresa. Se ela
     * chegasse por último, a lista (e a aba Desligados) ficava com gente de
     * TODAS as empresas: os desligados da BookPlay aparecendo no Comercial.
     * Só a leitura mais recente grava o resultado.
     */
    const minhaLeitura = ++leituraAtual.current;
    setLoading(true);
    /*
     * A lista da cobrança junta as empresas da cobrança que a pessoa alcança
     * (BookPlay e PaguePlay). Só para quem vê todos os setores: com alcance
     * de setor a lista é o setor dela, numa empresa só.
     */
    let cobrancaDaLista: Empresa[] = [];
    if (listaDaCobranca) {
      try { cobrancaDaLista = await empresasDaCobrancaQueVejo(); } catch { cobrancaDaLista = []; }
    }
    const idsDaLista = cobrancaDaLista.length
      ? cobrancaDaLista.map(e => e.id)
      : [((!isSuperAdmin ? empresaAtual?.id : filtroEmpresa) ?? empresaAtual?.id) || ''].filter(Boolean);
    // Item 5: arquiva desligados de meses anteriores antes de listar (some da lista).
    for (const empAlvo of idsDaLista) {
      const pp = cobrancaDaLista.find(e => e.id === empAlvo)?.slug === 'pagueplay' || (!cobrancaDaLista.length && tenant.isPaguePlay);
      try { await arquivarDesligadosAnteriores(empAlvo, { isPaguePlay: pp }); } catch { /* best-effort */ }
    }
    /*
     * Devolve ao ativo quem passou da data de retorno — o `pg_cron` já faz isso
     * às 00:15, e esta chamada cobre o dia em que ele não rodou. Barata e
     * idempotente: o WHERE da função só encontra quem ainda está pendente.
     */
    for (const empAlvo of idsDaLista) {
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
        // `setores!perfis_setor_id_fkey` pelo mesmo motivo, desde a FK composta
        // da fase 4. Ver `lib/__tests__/embedsDePerfis.test.ts`.
        .select('*, setores!perfis_setor_id_fkey(id,nome), empresas!perfis_empresa_id_fkey(id,nome), foto_url')
        .order('nome');
      if (cobrancaDaLista.length) {
        usersQuery = usersQuery.in('empresa_id', idsDaLista);
      } else if (!isSuperAdmin && empresaAtual?.id) {
        usersQuery = usersQuery.eq('empresa_id', empresaAtual.id);
      } else if (filtroEmpresa) {
        usersQuery = usersQuery.eq('empresa_id', filtroEmpresa);
      }
      const { data: uJoin, error: eJoin } = await usersQuery;
      if (eJoin) {
        console.warn('[AdminUsuarios] fetchDados join error, tentando sem join de empresas:', eJoin.message);
        let fallbackQuery = supabase
          .from('perfis')
          .select('*, setores!perfis_setor_id_fkey(id,nome), foto_url')
          .order('nome');
        if (cobrancaDaLista.length) {
          fallbackQuery = fallbackQuery.in('empresa_id', idsDaLista);
        } else if (!isSuperAdmin && empresaAtual?.id) {
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
        if (cobrancaDaLista.length) {
          query = query.in('empresa_id', idsDaLista);
        } else if (!isSuperAdmin && empresaAtual?.id) {
          query = query.eq('empresa_id', empresaAtual.id);
        } else if (filtroEmpresa) {
          query = query.eq('empresa_id', filtroEmpresa);
        }
        return query;
      })();

      const empresasPromise = isSuperAdmin
        ? fetchEmpresas()
        : Promise.resolve(cobrancaDaLista.length ? cobrancaDaLista : empresaAtual ? [empresaAtual] : []);

      const [{ data: s }, empresasList] = await Promise.all([setoresPromise, empresasPromise]);
      setoresData = (s as Setor[]) || [];
      emps = empresasList;
    } catch (err) {
      console.warn('[AdminUsuarios] fetchDados setores/empresas error:', err);
    }
    if (minhaLeitura !== leituraAtual.current) return;
    // Arquivados somem da lista padrão (item 5).
    setUsuarios(usuariosData.filter(u => !u.arquivado));
    setDesligados(usuariosData.filter(u => u.arquivado === true));
    setSetores(setoresData);
    setEmpresas(emps);
    setEmpresasDaLista(idsDaLista);
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
  useEffect(() => { fetchDados(); }, [empresaAtual?.id, filtroEmpresa, isSuperAdmin, listaDaCobranca]);

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
      // Pessoa até que alguém diga o contrário. O prefixo `ia_` do login é
      // pista e nunca cadastro — quem marca é a caixa, não a string.
      robo: false,
    });
    setDialogOpen(true);
  }

  function abrirEditar(u: Perfil) {
    setEditando(u);
    setForm({
      nome: u.nome, email: u.email, usuario: u.usuario ?? '', senha: '',
      perfil: u.perfil, setor_id: u.setor_id ?? '', empresa_id: u.empresa_id ?? '',
      robo: (u as { robo?: boolean | null }).robo === true,
    });
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
    /*
     * O payload carrega só o que este cargo PODE mudar.
     *
     * Não basta o campo estar trancado na tela: um estado antigo em memória, ou
     * a mesma função chamada de outro lugar, mandaria o valor assim mesmo. Quem
     * não pode editar o nome não manda `nome` — e aí não há o que dar errado.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload parcial e heterogêneo p/ update(); tipar exigiria o shape completo de Perfil.
    const updatePayload: Record<string, any> = {};
    if (podeNoUsuario.nome)  updatePayload.nome   = form.nome;
    if (podeNoUsuario.cargo) updatePayload.perfil = form.perfil;
    if (podeNoUsuario.login && form.usuario.trim()) {
      updatePayload.usuario = form.usuario.trim().toLowerCase();
    }
    if (setorVazioParaPreencher && form.setor_id) {
      updatePayload.setor_id = form.setor_id;
    }
    /*
     * `robo` viaja com o cargo, e só no Comercial.
     *
     * Viaja com o cargo porque dizer que um login é automação é decidir se ele
     * disputa o placar — mesma família de «que cargo esta pessoa tem», e
     * governada pela mesma chave (`usuarios_editar_cargo`).
     *
     * Só no Comercial porque é lá que a marcação é lida. Mandá-la da cobrança
     * gravaria `false` em toda edição de perfil, apagando em silêncio uma
     * marcação feita do outro lado — o mesmo tipo de defeito que o payload
     * parcial acima existe para impedir.
     */
    if (mostrarRobo && podeNoUsuario.cargo) {
      updatePayload.robo = form.robo;
    }
    /*
     * Nada a gravar não é erro. Acontece quando o cargo só podia redefinir a
     * senha — que tem botão próprio e já gravou. Um `update({})` seria SQL
     * inválido, e um toast de falha aqui mentiria sobre o que aconteceu.
     */
    if (Object.keys(updatePayload).length === 0) return;
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
    /*
     * O Núcleo tem cargo próprio (`cargoDoNucleo.ts`). No cadastro a recusa do
     * banco chega como «Database error», e a pessoa precisa saber o motivo antes.
     * Só confere quando cargo ou setor vão mesmo ser gravados: quem só corrige um
     * nome, sem a chave de cargo, não manda nenhum dos dois.
     */
    if (!editando || podeNoUsuario.cargo || setorVazioParaPreencher) {
      const setorGravado = cargoEscopoEmpresa
        ? null
        : editando && !setorVazioParaPreencher
          ? (editando.setor_id ?? null)
          : (form.setor_id || null);
      const motivoNucleo = motivoCargoForaDoSetor(form.perfil, setorGravado, setorNucleoId);
      if (motivoNucleo) { toast.error(motivoNucleo); return; }
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
    /*
     * A chave também é conferida aqui, e não só onde o botão é desenhado.
     * `fn_admin_delete_user` recusaria de qualquer jeito, mas errar cedo dá
     * uma mensagem que diz o que houve em vez de um 42501 traduzido.
     */
    if (!podeNoUsuario.excluir) {
      toast.error('Seu cargo não tem permissão para excluir usuários.');
      return;
    }
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
  const clonesCross = useClonesCross(empresasDaLista.length ? empresasDaLista : empresaAtual?.id);

  // As equipes da empresa, para a coluna «Equipe» da lista. Ver `equipes`.
  const chaveDasEmpresas = (empresasDaLista.length ? empresasDaLista : [empresaAtual?.id ?? '']).filter(Boolean).sort().join(',');
  useEffect(() => {
    const ids = chaveDasEmpresas ? chaveDasEmpresas.split(',') : [];
    if (!ids.length) { setEquipes([]); return; }
    let cancel = false;
    void supabase.from('equipes').select('id, nome').in('empresa_id', ids)
      .then(({ data, error }) => {
        if (cancel) return;
        if (error) { console.warn('[AdminUsuarios] equipes:', error.message); setEquipes([]); return; }
        setEquipes((data as { id: string; nome: string }[]) ?? []);
      });
    void supabase.from('equipe_lideres').select('lider_id, equipe_id').in('empresa_id', ids)
      .then(({ data, error }) => {
        if (cancel) return;
        if (error) { console.warn('[AdminUsuarios] equipe_lideres:', error.message); setLideradasPor(new Map()); return; }
        const mapa = new Map<string, string[]>();
        for (const v of (data as { lider_id: string; equipe_id: string }[]) ?? []) {
          if (!v.lider_id || !v.equipe_id) continue;
          mapa.set(v.lider_id, [...(mapa.get(v.lider_id) ?? []), v.equipe_id]);
        }
        setLideradasPor(mapa);
      });
    // A cidade de cada setor (a marca) e as metas individuais do mês (pendência «sem meta»).
    void supabase.from('rh_celulas').select('id, nome').in('empresa_id', ids)
      .then(({ data }) => { if (!cancel) setCidades((data as { id: string; nome: string }[]) ?? []); });
    const hoje = getTodayISO();
    void supabase.from('metas').select('referencia_id, meta_valor')
      .in('empresa_id', ids).eq('tipo', 'operador')
      .eq('mes', Number(hoje.slice(5, 7))).eq('ano', Number(hoje.slice(0, 4)))
      .then(({ data }) => {
        if (cancel) return;
        const m = new Map<string, number>();
        for (const r of (data as { referencia_id: string; meta_valor: number }[]) ?? []) {
          const v = Number(r.meta_valor) || 0;
          if (v > 0) m.set(r.referencia_id, v);
        }
        setMetasDoMes(m);
      });
    return () => { cancel = true; };
  }, [chaveDasEmpresas]);

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

  /*
   * Desligados são do arquivo de UMA empresa. BookPlay e Comercial são
   * empresas diferentes, e o arquivo morto de uma não tem nada a dizer na
   * outra — nem para o super_admin com «Todas Empresas» no filtro, que vê a
   * empresa aberta. Pedido de 02/10/2026.
   */
  const empresaDosDesligados = (isSuperAdmin && filtroEmpresa) || empresaAtual?.id || null;
  const desligadosDaEmpresa = empresasDaLista.length > 1
    ? desligados.filter(u => !!u.empresa_id && empresasDaLista.includes(u.empresa_id))
    : empresaDosDesligados
      ? desligados.filter(u => u.empresa_id === empresaDosDesligados)
      : desligados;

  const usuariosFiltrados = filtrarUsuariosVisiveis(
    isSuperAdmin && filtroEmpresa && empresasDaLista.length <= 1
      ? usuarios.filter(u => u.empresa_id === filtroEmpresa)
      : usuarios,
    {
      podeVerAdministradores,
      veTodosSetores: veUsuariosDeTodosSetores,
      setorAtualId: perfilAtual?.setor_id,
    },
  );

  // ── Marca, pendências e filtros (Usuários 2.0) ───────────────────────────────
  const infoSetor = useMemo(
    () => infoDosSetores(setores as unknown as { id: string; cidade_id?: string | null; regra?: string | null }[], cidades),
    [setores, cidades],
  );
  const marcaDe = (u: Perfil): MarcaDaPessoa | null => (u.setor_id ? infoSetor.get(u.setor_id)?.marca ?? null : null);
  const ctxPendencia: ContextoPendencia = {
    temEquipe: u => equipesDoPerfil(u.perfil, u.equipe_id ?? null, lideradasPor.get(u.id) ?? []).todas.length > 0,
    comMeta: new Set(metasDoMes.keys()),
  };
  const ctxFiltro = { ...ctxPendencia, marcaDe, online: (id: string) => onlineIds.has(id) };
  const filtrosAtivos = !!(filtros.marca || filtros.cargo || filtros.situacao || filtros.pendencia);

  /*
   * Os clones de OUTRO setor que esta tela mostra, antes dos filtros — em
   * qualquer empresa (até 04/10/2026 só a BookPlay; clone é de equipe, não de
   * marca). O painel manda no alcance: sem «todos os setores», só entram os
   * clones que caem no setor da pessoa logada.
   *
   * Servem ao agrupamento E ao pulso. O pulso contava só `usuariosFiltrados`
   * (o `setor_id` de cada um), e um setor feito só de clones, como o
   * Treinamento Marília, mostrava «1 de 1 ativos» com 37 pessoas na lista.
   */
  const clonesDaTela: { perfil: Perfil; destinoSetorId: string }[] = [];
  if (clonesCross.length) {
    const escopadoAoSetor = !veUsuariosDeTodosSetores;
    const perfilPorId = new Map(usuarios.map(p => [p.id, p]));
    for (const c of clonesCross) {
      if (escopadoAoSetor && c.destinoSetorId !== perfilAtual?.setor_id) continue;
      const p = perfilPorId.get(c.operadorId);
      if (!p || !p.setor_id || p.setor_id === c.destinoSetorId) continue;   // só cross-setor
      if (PERFIS_ADMIN.includes(p.perfil) && !podeVerAdministradores) continue;
      clonesDaTela.push({ perfil: p, destinoSetorId: c.destinoSetorId });
    }
  }

  /*
   * BookPlay × PaguePlay só para quem enxerga as duas (Cleber, 05/10/2026).
   * Quem vê só o próprio setor vê uma marca só, e a etiqueta em cada linha, os
   * cartões por marca e o filtro Todas/BookPlay/PaguePlay não diferenciam
   * nada. Quem decide é a lista que a pessoa enxerga, e não uma lista de
   * cargos: o alcance já vem do painel.
   */
  const temMarca = (() => {
    const vistas = new Set<MarcaDaPessoa>();
    for (const u of [...usuariosFiltrados, ...clonesDaTela.map(c => c.perfil)]) {
      const m = marcaDe(u);
      if (m) vistas.add(m);
      if (vistas.size > 1) return true;
    }
    return false;
  })();

  const numerosDoPulso: NumerosDoPulso = (() => {
    // Cada pessoa conta uma vez, esteja no setor de origem ou só como clone aqui.
    const porId = new Map(usuariosFiltrados.map(u => [u.id, u]));
    for (const { perfil } of clonesDaTela) if (!porId.has(perfil.id)) porId.set(perfil.id, perfil);
    const base = [...porId.values()].filter(u => !(u as { robo?: boolean }).robo);
    const ativos = base.filter(u => (u.situacao ?? 'ativo') === 'ativo');
    const porMarca = { bp: { online: 0, ativos: 0 }, pp: { online: 0, ativos: 0 } };
    for (const u of ativos) {
      const m = marcaDe(u);
      if (!m) continue;
      porMarca[m].ativos++;
      if (onlineIds.has(u.id)) porMarca[m].online++;
    }
    const pendencias = Object.fromEntries(PENDENCIAS.map(p => [p.chave, base.filter(u => temPendencia(u, p.chave, ctxPendencia)).length])) as Record<ChavePendencia, number>;
    return {
      online: base.filter(u => onlineIds.has(u.id)).length,
      ativos: ativos.length,
      porMarca, temMarca,
      situacao: {
        ativo: ativos.length,
        ferias: base.filter(u => u.situacao === 'ferias').length,
        desligado: base.filter(u => u.situacao === 'desligado').length,
      },
      pendencias,
    };
  })();

  // ── Agrupamento por setor ────────────────────────────────────────────────────
  const usuariosPorSetor = usuariosFiltrados.filter(u => passaNosFiltros(u, filtros, ctxFiltro)).reduce<Record<string, { nomeSetor: string; lista: PerfilComClone[] }>>((acc, u) => {
    const sid = u.setor_id ?? '__sem_setor__';
    const snome = nomeSetor(u);
    if (!acc[sid]) acc[sid] = { nomeSetor: snome, lista: [] };
    acc[sid].lista.push(u);
    return acc;
  }, {});

  // Os clones de OUTRO setor entram no grupo do setor destino, com tag.
  const nomeSetorPorId = (id: string) => setores.find(s => s.id === id)?.nome ?? 'Setor';
  for (const { perfil: p, destinoSetorId } of clonesDaTela) {
    if (!passaNosFiltros(p, filtros, ctxFiltro)) continue;
    const grupo = (usuariosPorSetor[destinoSetorId] ??= { nomeSetor: nomeSetorPorId(destinoSetorId), lista: [] });
    if (grupo.lista.some(x => x.id === p.id)) continue;
    grupo.lista.push({ ...p, _cloneDe: nomeSetor(p) });
  }

  /*
   * As opcoes do seletor.
   *
   * Sai do agrupamento COMPLETO, e nao do filtrado: usar a lista ja recortada
   * deixaria o seletor com uma opcao so depois do primeiro clique, e nao
   * haveria como voltar sem recarregar.
   */
  // O seletor não oferece setor inativo nem de sistema (`lib/setoresDosFiltros`).
  // As pessoas desses setores continuam na lista, em «Todos os setores».
  const setoresParaFiltro = Object.entries(usuariosPorSetor)
    .filter(([sid]) => {
      if (sid === '__sem_setor__') return true;
      const s = setores.find(x => x.id === sid);
      return !!s && setorEntraNosFiltros(s);
    })
    .sort((a, b) => a[1].nomeSetor.localeCompare(b[1].nomeSetor, 'pt-BR'));

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
      .map(({ id }): GrupoDeSetor | null => {
        const g = byId.get(id);
        if (!g) return null;
        // A busca recorta PESSOAS; o setor que ficar sem nenhuma some da tela,
        // em vez de virar um cabeçalho vazio que o olho ainda precisa checar.
        const lista = buscaNormalizada
          ? g.lista.filter(u => casaComBusca(u, buscaNormalizada))
          : g.lista;
        if (lista.length === 0) return null;
        const info: InfoDeSetor | undefined = infoSetor.get(id);
        return {
          id,
          nomeSetor: g.nomeSetor === '—' ? 'Sem setor' : g.nomeSetor,
          lista,
          marca: temMarca ? info?.marca ?? null : null,
          regra: info?.regra ?? null,
        } satisfies GrupoDeSetor;
      })
      .filter((g): g is GrupoDeSetor => g !== null);
  })();

  /** No modo A–Z: todo mundo num grupo só, sem os clones (eles são a mesma pessoa). */
  const gruposDaTela: GrupoDeSetor[] = agrupar === 'az'
    ? (() => {
        const vistos = new Set<string>();
        const lista = setoresOrdenados.flatMap(g => g.lista).filter(u => {
          if (u._cloneDe || vistos.has(u.id)) return false;
          vistos.add(u.id);
          return true;
        }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        return lista.length ? [{ id: '__az__', nomeSetor: 'Todas as pessoas · A–Z', lista }] : [];
      })()
    : setoresOrdenados;
  const totalNaTela = new Set(gruposDaTela.flatMap(g => g.lista.map(u => u.id))).size;

  /** Os perfis por trás dos ids marcados — o que vai para a transferência. */
  const perfisSelecionados = usuariosFiltrados.filter(u => selecionados.has(u.id));

  /**
   * «Lidera Equipe X», «Equipe Y», ou os dois — pela mesma regra do resto do
   * sistema (`equipesDoPerfil`): para `lider`, o `perfis.equipe_id` é resíduo e
   * nunca aparece.
   */
  const exportar = (pessoas: Perfil[]) => {
    const csv = listaEmCsv(pessoas.map(u => ({
      nome: u.nome, login: u.usuario ?? '', email: u.email ?? '',
      cargo: PERFIL_LABELS[u.perfil] ?? u.perfil, setor: nomeSetor(u) === '—' ? '' : nomeSetor(u),
      equipe: nomeEquipe(u) ?? '', marca: marcaDe(u) === 'bp' ? 'BookPlay' : marcaDe(u) === 'pp' ? 'PaguePlay' : '',
      situacao: (u.situacao ?? 'ativo') === 'ferias' ? 'Férias' : (u.situacao ?? 'ativo') === 'desligado' ? 'Desligado' : 'Ativo',
    })));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `usuarios-${getTodayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const pessoaAberta = abertaId ? usuarios.find(u => u.id === abertaId) ?? null : null;

  const nomeEquipe = (u: Perfil) => {
    const nome = (id: string) => equipes.find(e => e.id === id)?.nome ?? null;
    const { todas, lideradas } = equipesDoPerfil(u.perfil, u.equipe_id ?? null, lideradasPor.get(u.id) ?? []);
    const nomesLideradas = lideradas.map(nome).filter((n): n is string => !!n);
    const membroDe = todas.filter(id => !lideradas.includes(id)).map(nome).filter((n): n is string => !!n);
    const partes = [
      ...membroDe,
      ...(nomesLideradas.length ? [`Lidera ${nomesLideradas.join(', ')}`] : []),
    ];
    return partes.length ? partes.join(' · ') : null;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Cabeçalho */}
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> Usuários
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {empresasDaLista.length > 1
                ? 'BookPlay e PaguePlay na mesma lista · a marca é a cidade do setor; o que muda o que cada um vê é a regra de negócio do setor'
                : 'Gestão de usuários e equipes'}
            </p>
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
        <div className="us max-w-[1400px] mx-auto space-y-4 pb-20">

          {/* ── O pulso: online por marca, situação e o que resolver ──────
              Cada número é um filtro. Contam sobre toda a gente que este
              cargo enxerga, não sobre o recorte da tela. */}
          <PulsoDeUsuarios
            n={numerosDoPulso}
            marca={filtros.marca} situacao={filtros.situacao} pendencia={filtros.pendencia}
            onMarca={m => setFiltros(f => ({ ...f, marca: m }))}
            onSituacao={v => setFiltros(f => ({ ...f, situacao: v }))}
            onPendencia={v => setFiltros(f => ({ ...f, pendencia: v }))}
          />

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

            {isSuperAdmin && empresas.length > 1 && empresasDaLista.length <= 1 && (
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
            {/* Na cobrança o nome da empresa não é a marca de quem olha: o líder
                de Marília lia «BookPlay». A marca é a cidade do setor. */}
            {!isSuperAdmin && empresaAtual && empresasDaLista.length <= 1 && !ehCobranca && (
              <Badge variant="outline" className="h-9 px-3 text-xs font-normal">{empresaAtual.nome}</Badge>
            )}
            {isSuperAdmin && filtroEmpresa && empresasDaLista.length <= 1 && (
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

            {temMarca && (
              <div className="inline-flex rounded-lg bg-muted/50 p-0.5 gap-0.5" role="group" aria-label="Marca">
                {([[null, 'Todas'], ['bp', 'BookPlay'], ['pp', 'PaguePlay']] as const).map(([m, t]) => (
                  <button key={t} type="button" aria-pressed={filtros.marca === m}
                    onClick={() => setFiltros(f => ({ ...f, marca: m }))}
                    className={cn('h-8 px-3 rounded-md text-xs font-semibold transition-colors',
                      filtros.marca === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    {t}
                  </button>
                ))}
              </div>
            )}

            <Select value={filtros.cargo ?? '__todos__'} onValueChange={v => setFiltros(f => ({ ...f, cargo: v === '__todos__' ? null : v }))}>
              <SelectTrigger className="w-40 h-9 text-sm" aria-label="Filtrar por cargo"><SelectValue placeholder="Cargo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__todos__">Todos os cargos</SelectItem>
                {[...new Set(usuariosFiltrados.map(u => u.perfil))].sort((a, b) => (PERFIL_LABELS[a] ?? a).localeCompare(PERFIL_LABELS[b] ?? b, 'pt-BR')).map(c => (
                  <SelectItem key={c} value={c}>{PERFIL_LABELS[c] ?? c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {filtrosAtivos && (
              <Button variant="ghost" size="sm" className="h-9 text-xs gap-1" onClick={() => setFiltros(FILTROS_VAZIOS)}>
                <X className="w-3.5 h-3.5" /> Limpar filtros
              </Button>
            )}

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">{totalNaTela} na lista</span>
              <div className="inline-flex rounded-lg bg-muted/50 p-0.5 gap-0.5" role="group" aria-label="Agrupar">
                {([['setor', 'Por setor'], ['az', 'A–Z']] as const).map(([k, t]) => (
                  <button key={k} type="button" aria-pressed={agrupar === k} onClick={() => setAgrupar(k)}
                    className={cn('h-8 px-3 rounded-md text-xs font-semibold transition-colors',
                      agrupar === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Recolher some durante a busca: lá os grupos ficam abertos à
                força, e um botão que não faz nada é pior que um botão a menos. */}
            {setoresParaFiltro.length > 1 && !busca && agrupar === 'setor' && (
              <Button
                variant="ghost" size="sm" className="h-9 text-xs"
                onClick={() => setSetoresRecolhidos(
                  atual => atual.size ? new Set() : new Set(setoresParaFiltro.map(([sid]) => sid)),
                )}
              >
                {setoresRecolhidos.size ? 'Expandir todos' : 'Minimizar todos'}
              </Button>
            )}

            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => exportar(gruposDaTela.flatMap(g => g.lista).filter(u => !u._cloneDe))}>
              <Download className="w-4 h-4" /> Exportar
            </Button>
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
          {/* A barra de seleção: presa embaixo, sobe quando alguém é marcado. */}
          <div className={cn('us-lote', podeTransferir && selecionados.size > 0 && 'us-on')} role="region" aria-label="Seleção" aria-hidden={!(podeTransferir && selecionados.size > 0)}>
            <span><b>{selecionados.size}</b> {selecionados.size === 1 ? 'pessoa selecionada' : 'pessoas selecionadas'}</span>
            <button type="button" className="us-forte" onClick={() => { if (perfisSelecionados.length) setTransferindo(perfisSelecionados); }}>
              <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir
            </button>
            <button type="button" onClick={() => exportar(perfisSelecionados)}><Download className="w-3.5 h-3.5" /> Exportar</button>
            <button type="button" aria-label="Limpar seleção" onClick={() => setSelecionados(new Set())}><X className="w-3.5 h-3.5" /></button>
          </div>
          {/* ── A lista ── */}
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} className="h-14 rounded-xl border border-border bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : gruposDaTela.length === 0 ? (
            <ListaPessoasVazia busca={busca || (filtrosAtivos ? 'esses filtros' : '')} />
          ) : (
            <ListaPessoas
              grupos={gruposDaTela}
              marcaDe={temMarca ? marcaDe : undefined}
              onAbrir={u => setAbertaId(u.id)}
              abertaId={abertaId}
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
              podeEditar={u => !u._cloneDe && podeAlgoNoUsuario && (
                temPermissao('usuarios_administrar')
                || (temPermissao('usuarios_editar_do_setor') && u.id !== perfilAtual?.id)
              )}
              mostrarEmpresa={isSuperAdmin && !filtroEmpresa && empresasDaLista.length <= 1}
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
                alcance={{ veTodosSetores: veUsuariosDeTodosSetores, setorAtualId: perfilAtual?.setor_id }}
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

        {/* ─── Aba: Metas (Comercial) ────────────────────────────────────
            Sem `p-6`: a tela de metas de vendas já traz o próprio
            espaçamento, como Setores e Equipes. */}
        {podeVerMetasVendas && (
          <TabsContent value="metas" className="flex-1 overflow-y-auto mt-0">
            <Suspense fallback={<CarregandoAba />}>
              <MetasVendas />
            </Suspense>
          </TabsContent>
        )}

        {/* ─── Aba: IAs (Comercial) ──────────────────────────────────── */}
        {podeVerIas && (
          <TabsContent value="ias" className="flex-1 overflow-y-auto mt-0">
            <Suspense fallback={<CarregandoAba />}>
              <IasDoComercial />
            </Suspense>
          </TabsContent>
        )}

        {/* ─── Aba: Acompanhamento (Comercial) ───────────────────────── */}
        {podeVerAcompanhamento && (
          <TabsContent value="acompanhamento" className="flex-1 overflow-y-auto mt-0">
            <Suspense fallback={<CarregandoAba />}>
              <AcompanhamentoVendas />
            </Suspense>
          </TabsContent>
        )}

        {/* ─── Aba: Comemorações ─────────────────────────────────────── */}
        {/* Sem `p-6` aqui: a página já traz o próprio espaçamento, como
            Setores e Equipes. O Suspense é obrigatório — o import é lazy. */}
        {podeAdministrarContas && (
          <TabsContent value="desligados" className="flex-1 overflow-y-auto mt-0">
            <AdminDesligadosAba
              desligados={desligadosDaEmpresa}
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
            <Suspense fallback={<CarregandoAba />}>
              <Comemoracoes />
            </Suspense>
          </TabsContent>
        )}

      </Tabs> : (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          Nenhuma aba interna de Usuários foi liberada para este cargo.
        </div>
      )}

      {/* ── Criar/editar usuário ─────────────────────────────────────────────
          A janela saiu daqui em 06/09/2026 e virou `DialogUsuario`: ganhou
          seções com assunto próprio, cabeçalho com a ficha de quem está sendo
          editado, e uma chave de permissão por campo. Ver o cabeçalho de lá. */}
      <DialogUsuario
        aberto={dialogOpen}
        onFechar={() => setDialogOpen(false)}
        editando={editando}
        form={form}
        setForm={setForm}
        pode={podeNoUsuario}
        isSuperAdmin={isSuperAdmin}
        souEu={!!editando && editando.id === perfilAtual?.id}
        online={!!editando && onlineIds.has(editando.id)}
        setoresDoForm={setoresDoForm}
        setores={setores}
        empresas={empresas}
        empresaAtualNome={empresaAtual?.nome}
        cargoEscopoEmpresa={cargoEscopoEmpresa}
        setorVazioParaPreencher={setorVazioParaPreencher}
        setorNucleoId={setorNucleoId}
        onTransferirAoNucleo={
          // Mesma empresa: a transferência parte da empresa atual, e o Núcleo
          // calculado é o da empresa da pessoa editada.
          editando && podeTransferir && setorNucleoId && editando.empresa_id === empresaAtual?.id
            ? () => {
                setDialogOpen(false);
                setDestinoTransferencia(setorNucleoId);
                setTransferindo([editando]);
              }
            : undefined
        }
        salvando={saving}
        onSalvar={salvar}
        uploadando={uploadando}
        onEscolherFoto={() => { if (editando) { setUploadTarget(editando); fileInputRef.current?.click(); } }}
        onRemoverFoto={() => { if (editando) void excluirFotoDeUsuario(editando); }}
        novaSenha={novaSenha}
        setNovaSenha={setNovaSenha}
        salvandoSenha={salvandoSenha}
        onSalvarSenha={() => void alterarSenhaOperador()}
        onPedirExclusao={() => { void abrirConfirmacaoExclusao(); }}
        excluindo={excluindoUsuario}
      />


      {/* A ficha da pessoa: abre ao clicar na linha. */}
      <FichaPessoa
        pessoa={pessoaAberta}
        aberta={!!pessoaAberta}
        onFechar={() => setAbertaId(null)}
        online={!!pessoaAberta && onlineIds.has(pessoaAberta.id)}
        setor={pessoaAberta?.setor_id ? { nome: nomeSetor(pessoaAberta), info: infoSetor.get(pessoaAberta.setor_id) ?? null } : null}
        equipe={pessoaAberta ? nomeEquipe(pessoaAberta) : null}
        empresa={pessoaAberta ? nomeEmpresa(pessoaAberta) : ''}
        meta={pessoaAberta ? metasDoMes.get(pessoaAberta.id) ?? null : null}
        podeEditar={!!pessoaAberta && podeAlgoNoUsuario && (temPermissao('usuarios_administrar') || (temPermissao('usuarios_editar_do_setor') && pessoaAberta.id !== perfilAtual?.id))}
        podeTransferir={podeTransferir}
        podeImpersonar={isSuperAdmin}
        souEu={!!pessoaAberta && pessoaAberta.id === perfilAtual?.id}
        onEditar={u => { setAbertaId(null); abrirEditar(u); }}
        onTransferir={u => { setAbertaId(null); setTransferindo([u]); }}
        onEntrarComo={u => void entrarComo(u)}
      />

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

          {/* Histórico em mês fechado: o banco recusa, e a tela diz antes
              (01/10/2026 — excluir mudava números de setembro). */}
          {resumoDaExclusao?.historicoFechado && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 space-y-1.5">
              <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Não dá para excluir: há histórico em mês fechado
              </p>
              <p className="text-[11px] text-destructive/90 leading-relaxed">
                {mensagemHistoricoFechado(resumoDaExclusao.historicoFechado)}
              </p>
            </div>
          )}

          {/* O que exatamente vai embora. Sem isto, "não pode ser desfeita"
              não diz QUANTO se perde — e a exclusão apaga tabulação. */}
          {resumoDaExclusao && !resumoDaExclusao.historicoFechado && resumoDaExclusao.acordos > 0 && (
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
              disabled={excluindoUsuario || !!resumoDaExclusao?.historicoFechado}
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
        destinoSetorInicial={destinoTransferencia}
        onFechar={() => { setTransferindo(null); setDestinoTransferencia(null); }}
        onConcluida={() => {
          setTransferindo(null);
          setDestinoTransferencia(null);
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
