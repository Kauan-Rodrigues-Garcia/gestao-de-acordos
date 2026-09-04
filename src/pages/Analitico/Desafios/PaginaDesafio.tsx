/**
 * PaginaDesafio — a configuração da campanha, agora como aba inteira.
 *
 * ## Por que deixou de ser janela flutuante
 *
 * A janela cabia quando a configuração eram oito campos. Com setores de duas
 * empresas, equipes, cargos, exclusões nominais, prêmio por colocação, metas
 * por pessoa e a imagem de destaque, um diálogo de 600 px vira um formulário
 * com barra de rolagem interna dentro de uma página que também rola — e a
 * pessoa perde o contexto do que já preencheu.
 *
 * Como aba, cada seção tem espaço, o rodapé de gravar fica sempre visível e o
 * botão de voltar é explícito. Não é uma rota nova: a aba Desafios troca o que
 * desenha, e sair da configuração devolve o catálogo exatamente onde estava.
 *
 * ## As cinco seções
 *
 *   Identidade   — nome, descrição, período, situação;
 *   Participação — setores, equipes, cargos, quem sai;
 *   Regras       — modelo, critério, escopo, fonte do resultado;
 *   Metas        — a meta única, ou uma por pessoa;
 *   Premiação    — prêmio por colocação, e a aparência da campanha.
 *
 * ## O que continua fora daqui
 *
 * O cálculo. Esta tela grava configuração; quem soma dinheiro é
 * `fn_desafio_dados`, e quem ordena é `calcularDesafio`. Nenhuma regra de
 * ranking é escrita neste arquivo.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Loader2, Save, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { parseBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { MODELOS_DESAFIO, modeloDoTipo } from '@/services/desafios/tiposDesafio';
import {
  atualizarDesafio, buscarPessoasDeEmpresas, buscarSetoresDisponiveis,
  criarDesafio, excluirDesafio, type DadosGravacaoDesafio,
} from '@/services/desafios/desafios.service';
import { DesafiosDosOperadores } from './DesafiosDosOperadores';
import { EditorPremios } from './EditorPremios';
import { ConvidadosTeste } from './ConvidadosTeste';
import { ImagensDesafio } from './ImagensDesafio';
import { SeletorParticipacao } from './SeletorParticipacao';
import { alcancadosPeloRecorte } from './alcanceDoRecorte';
import {
  metasParaValores, valoresParaMetas, type ValoresPorPessoa,
} from './metasDoDesafio';
import { ACENTOS_DISPONIVEIS, hojeISO } from './tema';
import type {
  AcentoDesafio, AjusteImagem, CriterioRanking, Desafio, EscopoDisputa,
  FonteMeta, FonteResultado,
  ParticipantesDesafio, PessoaDesafio, Premiacao, PremioPorPosicao,
  SetorDisponivel, StatusDesafio, TemaDesafio, TipoDesafio,
  VisibilidadeDesafio,
} from '@/services/desafios/types';

const CRITERIOS: { valor: CriterioRanking; rotulo: string }[] = [
  { valor: 'menor_falta',      rotulo: 'Mais perto da meta' },
  { valor: 'maior_recebido',   rotulo: 'Maior valor recebido' },
  { valor: 'maior_percentual', rotulo: 'Maior percentual da meta' },
];

const TEMAS: { valor: TemaDesafio; rotulo: string }[] = [
  { valor: 'padrao',  rotulo: 'Padrão' },
  { valor: 'cafe',    rotulo: 'Café' },
  { valor: 'corrida', rotulo: 'Corrida' },
  { valor: 'equipes', rotulo: 'Equipes' },
];

const STATUS: { valor: StatusDesafio; rotulo: string }[] = [
  { valor: 'rascunho',  rotulo: 'Rascunho' },
  { valor: 'ativo',     rotulo: 'Ativo' },
  { valor: 'encerrado', rotulo: 'Encerrado' },
];

const ESCOPOS: { valor: EscopoDisputa; rotulo: string }[] = [
  { valor: 'empresa', rotulo: 'Um placar só, com todo mundo' },
  { valor: 'setor',   rotulo: 'Cada setor disputa dentro dele' },
];

const PREMIACOES: { valor: Premiacao; rotulo: string }[] = [
  { valor: 'todos_que_batem', rotulo: 'Todos que alcançarem a meta' },
  { valor: 'melhor_colocado', rotulo: 'Somente os primeiros colocados' },
];

const FONTES: { valor: FonteResultado; rotulo: string; ajuda: string }[] = [
  {
    valor: 'proprio', rotulo: 'O recebimento da própria pessoa',
    ajuda: 'O padrão. Cada participante disputa com o que ele mesmo tabulou.',
  },
  {
    valor: 'equipe_liderada', rotulo: 'O recebimento da equipe liderada',
    ajuda: 'Para a disputa entre líderes: o número do líder é o total da equipe dele.',
  },
];

/**
 * A meta de quem disputa. Só aparece na disputa entre líderes.
 *
 * Com o resultado saindo da equipe, medir contra uma meta de uma pessoa daria
 * percentuais de mil por cento e um ranking sem sentido entre equipes de
 * tamanhos diferentes — ver `RegraDesafio.fonteMeta`.
 */
const FONTES_META: { valor: FonteMeta; rotulo: string; ajuda: string }[] = [
  {
    valor: 'individual', rotulo: 'A meta digitada na campanha',
    ajuda: 'O quadro de metas por pessoa, ou a meta única desta campanha.',
  },
  {
    valor: 'meta_equipe', rotulo: 'A meta mensal da equipe',
    ajuda: 'A meta da equipe na aba Metas, cheia — a mesma que Desempenho Equipes usa.',
  },
  {
    valor: 'projecao_equipe', rotulo: 'A projeção da equipe (meta até hoje)',
    ajuda: 'Quanto da meta da equipe já deveria ter entrado até hoje, pelos dias úteis '
         + 'corridos. É a projeção de Desempenho Equipes, e compara equipes de tamanhos '
         + 'diferentes de forma justa.',
  },
];

const VISIBILIDADES: { valor: VisibilidadeDesafio; rotulo: string; ajuda: string }[] = [
  {
    valor: 'alcance', rotulo: 'Quem a régua de permissões alcançar',
    ajuda: 'Cada cargo vê conforme o escopo dele: os próprios, a equipe, o setor ou tudo.',
  },
  {
    valor: 'todos', rotulo: 'Mural — a empresa inteira acompanha',
    ajuda: 'Todo mundo enxerga a campanha, mesmo quem não disputa.',
  },
];

interface Formulario {
  nome: string;
  descricao: string;
  premio: string;
  dataInicio: string;
  dataFim: string;
  tipo: TipoDesafio;
  escopoDisputa: EscopoDisputa;
  premiacao: Premiacao;
  fonteResultado: FonteResultado;
  fonteMeta: FonteMeta;
  individual: boolean;
  equipe: boolean;
  metaIndividual: string;
  metaEquipe: string;
  metaColetiva: string;
  criterio: CriterioRanking;
  tema: TemaDesafio;
  acento: AcentoDesafio | null;
  mostrarFotos: boolean;
  animarUltrapassagem: boolean;
  comemorarMeta: boolean;
  midiaNoCard: boolean;
  ajusteMidia: AjusteImagem;
  ajusteArte: AjusteImagem;
  fixarNoMenu: boolean;
  status: StatusDesafio;
  visibilidade: VisibilidadeDesafio;
  midiaUrl: string | null;
  midiaCaminho: string | null;
  arteUrl: string | null;
  arteCaminho: string | null;
}

const PARTICIPACAO_VAZIA: ParticipantesDesafio = {
  setores: [], equipes: [], operadores: [], cargos: [], excluidos: [],
  convidados: [],
};

function formularioVazio(): Formulario {
  const hoje = hojeISO();
  return {
    nome: '', descricao: '', premio: '',
    dataInicio: hoje, dataFim: hoje,
    tipo: 'bater_meta',
    escopoDisputa: 'empresa', premiacao: 'melhor_colocado',
    fonteResultado: 'proprio', fonteMeta: 'individual',
    individual: true, equipe: true,
    metaIndividual: '', metaEquipe: '', metaColetiva: '',
    criterio: 'menor_falta',
    tema: 'padrao', acento: null,
    mostrarFotos: true, animarUltrapassagem: true, comemorarMeta: true,
    midiaNoCard: true, fixarNoMenu: true,
    ajusteMidia: 'cobrir', ajusteArte: 'conter',
    status: 'rascunho', visibilidade: 'alcance',
    midiaUrl: null, midiaCaminho: null,
    arteUrl: null, arteCaminho: null,
  };
}

function formularioDe(d: Desafio): Formulario {
  const emReais = (v: number | null) => (v === null ? '' : String(v).replace('.', ','));
  return {
    nome: d.nome,
    descricao: d.descricao ?? '',
    premio: d.premio ?? '',
    dataInicio: d.dataInicio,
    dataFim: d.dataFim,
    tipo: d.tipo,
    escopoDisputa: d.regra.escopoDisputa,
    premiacao: d.regra.premiacao,
    fonteResultado: d.regra.fonteResultado,
    fonteMeta: d.regra.fonteMeta,
    individual: d.regra.modo.includes('individual'),
    equipe:     d.regra.modo.includes('equipe'),
    metaIndividual: emReais(d.regra.metaIndividual),
    metaEquipe:     emReais(d.regra.metaEquipe),
    metaColetiva:   emReais(d.regra.metaColetiva),
    criterio: d.regra.criterioRanking,
    tema: d.visual.tema,
    acento: d.visual.acento,
    mostrarFotos: d.visual.mostrarFotos,
    animarUltrapassagem: d.visual.animarUltrapassagem,
    comemorarMeta: d.visual.comemorarMeta,
    midiaNoCard: d.visual.midiaNoCard,
    fixarNoMenu: d.visual.fixarNoMenu,
    ajusteMidia: d.visual.ajusteMidia,
    ajusteArte:  d.visual.ajusteArte,
    status: d.status,
    visibilidade: d.visibilidade,
    midiaUrl: d.midiaUrl,
    midiaCaminho: d.midiaCaminho,
    arteUrl: d.arteUrl,
    arteCaminho: d.arteCaminho,
  };
}

/** `''` vira `null` — meta em branco é "este modelo não usa meta". */
function metaOuNulo(texto: string): number | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  const n = parseBRL(limpo);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface PaginaDesafioProps {
  /** `null` = criando uma campanha nova. */
  desafio: Desafio | null;
  empresaId: string;
  autorId: string;
  autorNome: string;
  /** `desafios_multiempresa` — pode misturar setores das duas operações. */
  podeMultiempresa: boolean;
  /** `desafios_excluir` ou `administrar_sistema`. */
  podeExcluir: boolean;
  /** Quem só configura o PRÓPRIO setor: a campanha nasce presa a ele. */
  restritoAoSetor?: string | null;
  onVoltar: () => void;
  onSalvo: () => void;
}

export function PaginaDesafio({
  desafio, empresaId, autorId, autorNome, podeMultiempresa, podeExcluir,
  restritoAoSetor = null, onVoltar, onSalvo,
}: PaginaDesafioProps) {
  const [form, setForm] = useState<Formulario>(
    () => (desafio ? formularioDe(desafio) : formularioVazio()),
  );
  const [participacao, setParticipacao] = useState<ParticipantesDesafio>(
    () => desafio?.regra.participantes ?? PARTICIPACAO_VAZIA,
  );
  const [premios, setPremios] = useState<PremioPorPosicao[]>(
    () => desafio?.regra.premios ?? [],
  );
  const [setoresDisponiveis, setSetoresDisponiveis] = useState<SetorDisponivel[]>([]);
  const [pessoas, setPessoas] = useState<PessoaDesafio[]>([]);
  const [carregandoPessoas, setCarregandoPessoas] = useState(true);
  const [valores, setValores] = useState<ValoresPorPessoa>({});
  const [salvando, setSalvando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const modelo = modeloDoTipo(form.tipo);

  /*
   * Os setores oferecidos.
   *
   * Vêm do servidor porque a lista cruza empresas: a política de `setores`
   * recorta por empresa, e montar a mistura no cliente pediria uma consulta
   * por operação. `fn_desafio_setores_disponiveis` devolve tudo o que quem
   * configura alcança, cada setor já com as equipes dele.
   */
  useEffect(() => {
    let cancelado = false;
    void buscarSetoresDisponiveis().then(lista => {
      if (!cancelado) setSetoresDisponiveis(lista);
    });
    return () => { cancelado = true; };
  }, []);

  /**
   * As empresas que a campanha alcança — DERIVADAS dos setores escolhidos.
   *
   * Não há um seletor de empresa, e a ausência é deliberada: escolher «as duas
   * empresas» e depois nenhum setor da segunda gravaria um alcance que não
   * corresponde a ninguém. O setor é a unidade que a operação escolhe; a
   * empresa é consequência.
   */
  const empresasDaCampanha = useMemo(() => {
    const ids = new Set<string>([empresaId]);
    for (const setorId of participacao.setores) {
      const setor = setoresDisponiveis.find(s => s.id === setorId);
      if (setor) ids.add(setor.empresaId);
    }
    return [...ids];
  }, [empresaId, participacao.setores, setoresDisponiveis]);

  /** Sem a chave de multiempresa, só os setores da empresa própria aparecem. */
  const empresasPermitidas = useMemo(() => {
    if (!podeMultiempresa) return [empresaId];
    return [...new Set(setoresDisponiveis.map(s => s.empresaId))];
  }, [podeMultiempresa, empresaId, setoresDisponiveis]);

  /*
   * O quadro de pessoal segue as empresas escolhidas.
   *
   * Marcar um setor da outra operação tem que trazer a gente dela — senão a
   * lista de exclusão e o editor de metas ficariam cegos justamente para a
   * metade que a campanha acabou de incluir.
   */
  useEffect(() => {
    let cancelado = false;
    setCarregandoPessoas(true);
    void buscarPessoasDeEmpresas(empresasDaCampanha).then(lista => {
      if (cancelado) return;
      setPessoas(lista);
      setCarregandoPessoas(false);
    });
    return () => { cancelado = true; };
    // `join` e não o array: a identidade muda a cada render, a string não.
  }, [empresasDaCampanha.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  /* As metas por pessoa, quando a campanha as tem. */
  useEffect(() => {
    if (!pessoas.length) return;
    setValores(metasParaValores(desafio?.regra.metasPorOperador ?? {}, pessoas));
  }, [pessoas, desafio]);

  /*
   * Quem a campanha alcança — e é ESTA lista que a aba Metas recebe.
   *
   * Antes ela recebia o quadro inteiro da empresa: numa operação de trezentas
   * pessoas, a aba abria com trezentos campos de meta, dos quais talvez doze
   * pertencessem à campanha. Pior que incômodo, era enganoso — o mapa de metas
   * preenchido É a convocação, e digitar um número no campo de quem não estava
   * no recorte o colocaria na disputa sem que ninguém percebesse.
   */
  const naCampanha = useMemo(
    () => alcancadosPeloRecorte(pessoas, participacao, restritoAoSetor),
    [pessoas, participacao, restritoAoSetor],
  );

  const setorDono = restritoAoSetor ?? null;

  function montarDados(): DadosGravacaoDesafio {
    const modo: ('individual' | 'equipe')[] = [];
    if (form.individual) modo.push('individual');
    if (form.equipe)     modo.push('equipe');

    return {
      nome: form.nome,
      descricao: form.descricao || null,
      premio: form.premio || null,
      dataInicio: form.dataInicio,
      dataFim: form.dataFim,
      setorId: setorDono,
      // Uma empresa só na lista é o mesmo que lista vazia — e vazia é o que a
      // policy de INSERT deixa passar sem a chave de multiempresa.
      empresas: empresasDaCampanha.length > 1 ? empresasDaCampanha : [],
      tipo: form.tipo,
      regra: {
        versao: 1,
        metrica: 'valor_recebido',
        modo: modo.length ? modo : ['individual'],
        criterioRanking: form.criterio,
        escopoDisputa: form.escopoDisputa,
        premiacao: form.premiacao,
        metaIndividual: metaOuNulo(form.metaIndividual),
        metasPorOperador: valoresParaMetas(valores),
        metaEquipe:   metaOuNulo(form.metaEquipe),
        metaColetiva: metaOuNulo(form.metaColetiva),
        participantes: participacao,
        premios,
        fonteResultado: form.fonteResultado,
        fonteMeta: form.fonteMeta,
      },
      visual: {
        tema: form.tema,
        icone: 'trophy',
        mostrarFotos: form.mostrarFotos,
        animarUltrapassagem: form.animarUltrapassagem,
        comemorarMeta: form.comemorarMeta,
        acento: form.acento,
        midiaNoCard: form.midiaNoCard,
        fixarNoMenu: form.fixarNoMenu,
        ajusteMidia: form.ajusteMidia,
        ajusteArte:  form.ajusteArte,
      },
      status: form.status,
      midiaUrl: form.midiaUrl,
      midiaCaminho: form.midiaCaminho,
      arteUrl: form.arteUrl,
      arteCaminho: form.arteCaminho,
      visibilidade: form.visibilidade,
    };
  }

  async function salvar() {
    if (form.nome.trim().length < 2) {
      toast.error('O desafio precisa de um nome.');
      return;
    }
    if (form.dataFim < form.dataInicio) {
      toast.error('A data final precisa ser igual ou posterior à inicial.');
      return;
    }

    setSalvando(true);
    const dados = montarDados();
    const r = desafio
      ? await atualizarDesafio({ desafioId: desafio.id, empresaId, autorId, dados })
      : await criarDesafio({ empresaId, autorId, autorNome, dados });
    setSalvando(false);

    if (r.error) { toast.error(r.error); return; }
    toast.success(desafio ? 'Desafio atualizado.' : 'Desafio criado.');
    onSalvo();
  }

  async function apagar() {
    if (!desafio) return;
    setConfirmandoExclusao(false);
    setSalvando(true);
    const r = await excluirDesafio({ desafio, autorId });
    setSalvando(false);
    if (r.error) { toast.error(r.error); return; }
    toast.success('Desafio excluído.');
    onSalvo();
  }

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho da aba ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onVoltar} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Catálogo
          </Button>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {desafio ? 'Editar desafio' : 'Novo desafio'}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {empresasDaCampanha.length > 1
                ? `${empresasDaCampanha.length} empresas no mesmo ranking`
                : 'Uma campanha da sua operação'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {desafio && podeExcluir && (
            <Button
              variant="outline"
              size="sm"
              disabled={salvando}
              onClick={() => setConfirmandoExclusao(true)}
              className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          )}
          <Button size="sm" disabled={salvando} onClick={() => void salvar()} className="gap-1.5">
            {salvando
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Save className="h-4 w-4" />}
            {desafio ? 'Salvar' : 'Criar desafio'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="identidade">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="identidade">Identidade</TabsTrigger>
          <TabsTrigger value="participacao">Participação</TabsTrigger>
          <TabsTrigger value="regras">Regras</TabsTrigger>
          <TabsTrigger value="metas">Metas</TabsTrigger>
          <TabsTrigger value="premiacao">Premiação e visual</TabsTrigger>
        </TabsList>

        {/* ── Identidade ──────────────────────────────────────────────── */}
        <TabsContent value="identidade" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="desafio-nome">Nome</Label>
                <Input
                  id="desafio-nome"
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Premiação dos líderes — setembro"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="desafio-descricao">Descrição</Label>
                <Textarea
                  id="desafio-descricao"
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="O que a campanha propõe, em duas linhas."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="desafio-inicio">Começa</Label>
                  <Input
                    id="desafio-inicio"
                    type="date"
                    value={form.dataInicio}
                    onChange={e => setForm(f => ({ ...f, dataInicio: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="desafio-fim">Termina</Label>
                  <Input
                    id="desafio-fim"
                    type="date"
                    value={form.dataFim}
                    onChange={e => setForm(f => ({ ...f, dataFim: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Situação</Label>
                  <Select
                    value={form.status}
                    onValueChange={v => setForm(f => ({ ...f, status: v as StatusDesafio }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS.map(s => (
                        <SelectItem key={s.valor} value={s.valor}>{s.rotulo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Quem enxerga</Label>
                  <Select
                    value={form.visibilidade}
                    onValueChange={v => setForm(f => ({
                      ...f, visibilidade: v as VisibilidadeDesafio,
                    }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VISIBILIDADES.map(v => (
                        <SelectItem key={v.valor} value={v.valor}>{v.rotulo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {VISIBILIDADES.find(v => v.valor === form.visibilidade)?.ajuda}
              </p>
            </div>

            <ImagensDesafio
              empresaId={empresaId}
              midiaUrl={form.midiaUrl}
              midiaCaminho={form.midiaCaminho}
              ajusteMidia={form.ajusteMidia}
              arteUrl={form.arteUrl}
              arteCaminho={form.arteCaminho}
              ajusteArte={form.ajusteArte}
              midiaNoCard={form.midiaNoCard}
              fixarNoMenu={form.fixarNoMenu}
              // O componente manda só o que mudou, e o `spread` faz o resto —
              // um `onChange` por campo seriam oito prop-drills iguais.
              onChange={m => setForm(f => ({ ...f, ...m }))}
            />
          </div>
        </TabsContent>

        {/* ── Participação ────────────────────────────────────────────── */}
        <TabsContent value="participacao" className="mt-4 space-y-5">
          <SeletorParticipacao
            setores={setoresDisponiveis}
            pessoas={pessoas}
            carregandoPessoas={carregandoPessoas}
            valor={participacao}
            onChange={setParticipacao}
            empresasPermitidas={empresasPermitidas}
            travadoNoSetor={restritoAoSetor}
          />

          {/* Some inteira para quem não é super admin: a RPC devolve `[]`. */}
          <ConvidadosTeste
            valor={participacao.convidados}
            onChange={convidados => setParticipacao(p => ({ ...p, convidados }))}
            euId={autorId}
          />
        </TabsContent>

        {/* ── Regras ──────────────────────────────────────────────────── */}
        <TabsContent value="regras" className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label>Modelo</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {MODELOS_DESAFIO.map(m => (
                <button
                  key={m.tipo}
                  type="button"
                  onClick={() => setForm(f => ({
                    ...f, tipo: m.tipo, criterio: m.criterioPadrao,
                    individual: m.modoPadrao.includes('individual'),
                    equipe:     m.modoPadrao.includes('equipe'),
                  }))}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    form.tipo === m.tipo
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-foreground/30',
                  )}
                >
                  <p className="text-xs font-medium text-foreground">{m.nome}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{m.objetivo}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>O ranking ordena por</Label>
              <Select
                value={form.criterio}
                onValueChange={v => setForm(f => ({ ...f, criterio: v as CriterioRanking }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CRITERIOS.map(c => (
                    <SelectItem key={c.valor} value={c.valor}>{c.rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Contra quem se disputa</Label>
              <Select
                value={form.escopoDisputa}
                onValueChange={v => setForm(f => ({ ...f, escopoDisputa: v as EscopoDisputa }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESCOPOS.map(e => (
                    <SelectItem key={e.valor} value={e.valor}>{e.rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Quem leva o prêmio</Label>
              <Select
                value={form.premiacao}
                onValueChange={v => setForm(f => ({ ...f, premiacao: v as Premiacao }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PREMIACOES.map(p => (
                    <SelectItem key={p.valor} value={p.valor}>{p.rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>O número de cada participante é</Label>
              <Select
                value={form.fonteResultado}
                onValueChange={v => setForm(f => ({
                  ...f,
                  fonteResultado: v as FonteResultado,
                  // Sair da disputa entre líderes zera a fonte da meta: meta de
                  // equipe contra recebimento próprio compararia o número de uma
                  // pessoa com o alvo de um time. O normalizador recusa esse par
                  // na leitura, e deixá-lo no formulário só adiaria a surpresa.
                  fonteMeta: v === 'equipe_liderada' ? f.fonteMeta : 'individual',
                }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONTES.map(o => (
                    <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {FONTES.find(o => o.valor === form.fonteResultado)?.ajuda}
              </p>
            </div>

            {/*
              A meta só é escolhível na disputa entre líderes — nos outros modos
              ela vem do quadro de metas, e um seletor com uma opção só seria
              ruído.
            */}
            {form.fonteResultado === 'equipe_liderada' && (
              <div className="space-y-1.5">
                <Label>A meta de cada participante é</Label>
                <Select
                  value={form.fonteMeta}
                  onValueChange={v => setForm(f => ({ ...f, fonteMeta: v as FonteMeta }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FONTES_META.map(o => (
                      <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {FONTES_META.find(o => o.valor === form.fonteMeta)?.ajuda}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-6 rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-xs text-foreground">
              <Switch
                checked={form.individual}
                onCheckedChange={v => setForm(f => ({ ...f, individual: v }))}
              />
              Ranking individual
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground">
              <Switch
                checked={form.equipe}
                onCheckedChange={v => setForm(f => ({ ...f, equipe: v }))}
              />
              Ranking por equipe
            </label>
          </div>
        </TabsContent>

        {/* ── Metas ───────────────────────────────────────────────────── */}
        <TabsContent value="metas" className="mt-4 space-y-4">
          {!modelo.usaMeta && !modelo.usaMetaColetiva ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              O modelo «{modelo.nome}» não usa meta — o ranking ordena pelo
              critério escolhido em Regras.
            </p>
          ) : modelo.usaMeta && form.fonteMeta !== 'individual' ? (
            /*
              A meta vem da aba Metas, não daqui. Mostrar os campos desligados
              seria pior que escondê-los: quem os visse preencheria, e o número
              digitado não teria efeito nenhum sobre o ranking — que é
              exatamente o defeito que este modo veio corrigir.
            */
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              A meta desta campanha vem da{' '}
              {form.fonteMeta === 'meta_equipe'
                ? 'meta mensal de cada equipe'
                : 'projeção de cada equipe — a meta mensal dela até o dia de hoje'}
              , configurada na aba Metas. Nada a preencher aqui.
              <br />
              Equipe sem meta no mês entra no placar sem meta, mostrando só o
              recebimento.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                {modelo.usaMeta && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="meta-individual">Meta de cada pessoa</Label>
                      <Input
                        id="meta-individual"
                        value={form.metaIndividual}
                        onChange={e => setForm(f => ({ ...f, metaIndividual: e.target.value }))}
                        placeholder="5.000,00"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="meta-equipe">Meta da equipe</Label>
                      <Input
                        id="meta-equipe"
                        value={form.metaEquipe}
                        onChange={e => setForm(f => ({ ...f, metaEquipe: e.target.value }))}
                        placeholder="em branco = soma das individuais"
                      />
                    </div>
                  </>
                )}
                {modelo.usaMetaColetiva && (
                  <div className="space-y-1.5">
                    <Label htmlFor="meta-coletiva">Meta coletiva</Label>
                    <Input
                      id="meta-coletiva"
                      value={form.metaColetiva}
                      onChange={e => setForm(f => ({ ...f, metaColetiva: e.target.value }))}
                      placeholder="120.000,00"
                    />
                  </div>
                )}
              </div>

              {modelo.usaMeta && (
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Meta por pessoa. Preenchido, este quadro passa a ser a
                    convocação: quem não tem meta aqui fica fora da campanha.
                  </p>
                  <DesafiosDosOperadores
                    pessoas={naCampanha}
                    carregando={carregandoPessoas}
                    valores={valores}
                    onChange={setValores}
                  />
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── Premiação e visual ──────────────────────────────────────── */}
        <TabsContent value="premiacao" className="mt-4 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="desafio-premio">Prêmio único</Label>
            <Input
              id="desafio-premio"
              value={form.premio}
              onChange={e => setForm(f => ({ ...f, premio: e.target.value }))}
              placeholder="Café da manhã no IBIS para quem bater a meta"
            />
            <p className="text-[11px] text-muted-foreground">
              Use este campo quando a campanha tem um prêmio só. Com colocações
              preenchidas abaixo, elas é que aparecem no pódio.
            </p>
          </div>

          <EditorPremios valor={premios} onChange={setPremios} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tema</Label>
              <Select
                value={form.tema}
                onValueChange={v => setForm(f => ({ ...f, tema: v as TemaDesafio }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMAS.map(t => (
                    <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Cor de acento</Label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, acento: null }))}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    form.acento === null
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-foreground/30',
                  )}
                >
                  a do tema
                </button>
                {ACENTOS_DISPONIVEIS.map(a => (
                  <button
                    key={a.valor}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, acento: a.valor }))}
                    title={a.rotulo}
                    aria-label={a.rotulo}
                    aria-pressed={form.acento === a.valor}
                    className={cn(
                      'h-7 w-7 rounded-full border-2 transition-transform hover:scale-110',
                      a.amostra,
                      form.acento === a.valor
                        ? 'border-foreground'
                        : 'border-transparent',
                    )}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-xs text-foreground">Mostrar as fotos no ranking</span>
              <Switch
                checked={form.mostrarFotos}
                onCheckedChange={v => setForm(f => ({ ...f, mostrarFotos: v }))}
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-xs text-foreground">
                Animar as ultrapassagens
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  A linha desliza para a posição nova quando chega relatório.
                </span>
              </span>
              <Switch
                checked={form.animarUltrapassagem}
                onCheckedChange={v => setForm(f => ({ ...f, animarUltrapassagem: v }))}
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-xs text-foreground">Comemorar quem bate a meta</span>
              <Switch
                checked={form.comemorarMeta}
                onCheckedChange={v => setForm(f => ({ ...f, comemorarMeta: v }))}
              />
            </label>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmandoExclusao} onOpenChange={setConfirmandoExclusao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Excluir «{desafio?.nome}»?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A campanha e o ranking dela somem de vez, para todo mundo. Se a
              intenção é só tirá-la do ar, mude a situação para «Encerrado» —
              assim ela vira histórico e o resultado fica guardado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void apagar()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
