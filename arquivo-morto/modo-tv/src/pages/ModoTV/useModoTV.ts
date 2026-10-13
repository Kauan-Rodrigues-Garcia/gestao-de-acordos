/**
 * useModoTV.ts — os dados da mesa.
 *
 * ## Sobre o cliente sem tipo
 *
 * `database.types.ts` é gerado do banco e ainda não conhece as tabelas `tv_*`.
 * O `db()` local resolve isso — mesmo caminho de `tickets.service.ts`. Quando os
 * tipos forem regenerados, trocar por `supabase.from('tv_cenas')` é substituição
 * direta.
 *
 * ## Quem decide o que aparece
 *
 * Nenhuma consulta aqui recorta por cargo ou por setor. A RLS já faz isso: a
 * mesa pede "as cenas" e o banco devolve as que a pessoa pode ver. Repetir o
 * recorte no cliente criaria duas verdades, e a que engana é sempre a do
 * cliente.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useAuth } from '@/hooks/useAuth';
import type { CenaNoAr, DadosSorteio, Fonte, TipoFonte } from './geometria';
import { normalizarSlug } from './slug';
import type { Template } from './templates';

// ── Cliente sem tipo ─────────────────────────────────────────────────────────

interface Consulta extends PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> {
  select(colunas?: string): Consulta;
  insert(valores: unknown): Consulta;
  update(valores: unknown): Consulta;
  delete(): Consulta;
  eq(coluna: string, valor: unknown): Consulta;
  order(coluna: string, opcoes?: { ascending?: boolean }): Consulta;
}

function db(tabela: string): Consulta {
  return (supabase.from as unknown as (t: string) => Consulta)(tabela);
}

function rpc<T>(nome: string, args: Record<string, unknown>): Promise<{ data: T | null; error: unknown }> {
  return (supabase.rpc as unknown as (
    f: string, a: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: unknown }>)(nome, args);
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface Tela {
  id: string;
  slug: string;
  nome: string;
  setor_id: string;
  empresa_id: string;
  ultimo_sinal: string | null;
  rotacao_ativa: boolean;
}

export interface Cena {
  id: string;
  nome: string;
  ordem: number;
  setor_id: string;
  empresa_id: string;
  transicao: 'corte' | 'fade' | 'deslize';
  duracao_s: number;
  na_rotacao: boolean;
  emergencia: boolean;
}

export interface Midia {
  id: string;
  url: string;
  caminho: string;
  tipo: 'imagem' | 'video';
  nome: string;
}

/** Quanto tempo sem sinal até considerar a TV fora do ar. */
const LIMITE_SINAL_MS = 90_000;

export function telaOnline(ultimoSinal: string | null): boolean {
  if (!ultimoSinal) return false;
  return Date.now() - new Date(ultimoSinal).getTime() < LIMITE_SINAL_MS;
}

// ── O hook ───────────────────────────────────────────────────────────────────

export function useModoTV() {
  const { empresa } = useEmpresa();
  const { perfil } = useAuth();

  const [telas, setTelas] = useState<Tela[]>([]);
  const [telaId, setTelaId] = useState<string | null>(null);
  const [cenas, setCenas] = useState<Cena[]>([]);
  const [cenaId, setCenaId] = useState<string | null>(null);
  const [cenaNoArId, setCenaNoArId] = useState<string | null>(null);
  const [fontes, setFontes] = useState<Fonte[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  /*
   * Os NÚMEROS da prévia vêm do servidor, pelo mesmo resolvedor que alimenta a
   * TV (`fn_tv_palco` com a cena informada). A GEOMETRIA vem do estado local,
   * para o arrasto responder na hora.
   *
   * Separar os dois é o que permite ter as duas coisas: prévia instantânea ao
   * mexer, e número idêntico ao da parede.
   */
  const [dadosPorFonte, setDadosPorFonte] = useState<Record<string, Fonte['dados']>>({});

  const tela = telas.find(t => t.id === telaId) ?? null;

  // ── Telas ──────────────────────────────────────────────────────────────────

  const lerTelas = useCallback(async () => {
    if (!empresa?.id) return;
    const { data, error } = await db('tv_telas')
      .select('id, slug, nome, setor_id, empresa_id, ultimo_sinal, rotacao_ativa')
      .eq('empresa_id', empresa.id)
      .eq('ativa', true)
      .order('nome');
    if (error) { setErro(error.message); return; }
    const lista = (data ?? []) as unknown as Tela[];
    setTelas(lista);
    setTelaId(atual => atual && lista.some(t => t.id === atual) ? atual : (lista[0]?.id ?? null));
  }, [empresa?.id]);

  useEffect(() => { void lerTelas().finally(() => setCarregando(false)); }, [lerTelas]);

  /*
   * O sinal de vida chega por escrita em `tv_telas`, e a mesa precisa reagir a
   * ele para o indicador "online" não ficar mentindo. Reler a lista a cada 30s
   * é mais simples que assinar a tabela, e o custo é uma consulta pequena.
   */
  useEffect(() => {
    const relogio = setInterval(() => { void lerTelas(); }, 30_000);
    return () => clearInterval(relogio);
  }, [lerTelas]);

  // ── Setores, para cadastrar tela ──────────────────────────────────────────

  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    if (!empresa?.id) return;
    void (async () => {
      const { data } = await db('setores')
        .select('id, nome')
        .eq('empresa_id', empresa.id)
        .eq('ativo', true)
        .order('nome');
      setSetores((data ?? []) as unknown as { id: string; nome: string }[]);
    })();
  }, [empresa?.id]);

  /*
   * As equipes do setor DESTA tela.
   *
   * Alimentam o recorte do ranking. Saem do setor da tela e não do setor de
   * quem está na mesa: a parede do Play 4 mostra as equipes do Play 4, mesmo
   * que quem monte a cena seja da gerência.
   */
  const [equipes, setEquipes] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    if (!empresa?.id || !tela?.setor_id) { setEquipes([]); return; }
    void (async () => {
      const { data } = await db('equipes')
        .select('id, nome')
        .eq('empresa_id', empresa.id)
        .eq('setor_id', tela.setor_id)
        .order('nome');
      setEquipes((data ?? []) as unknown as { id: string; nome: string }[]);
    })();
  }, [empresa?.id, tela?.setor_id]);

  /**
   * Cadastra um palco.
   *
   * O `slug` vira endereço, e endereço é digitado à mão no PC da TV. Por isso
   * ele é normalizado aqui antes de ir ao banco — acento, espaço e maiúscula
   * viram hífen e minúscula. O CHECK da tabela recusaria de qualquer forma, mas
   * recusar com erro técnico depois de a pessoa digitar "Recepção" seria só
   * ríspido.
   */
  const criarTela = useCallback(async (nome: string, slugBruto: string, setorId: string) => {
    if (!empresa?.id) return;
    const slug = normalizarSlug(slugBruto || nome);
    if (!slug) { setErro('O endereço da tela não pode ficar vazio.'); return; }
    const { error } = await db('tv_telas').insert({
      empresa_id: empresa.id,
      setor_id: setorId,
      slug,
      nome: nome.trim() || 'Tela sem nome',
      criado_por: perfil?.id ?? null,
    });
    if (error) {
      setErro(
        error.message.includes('ux_tv_telas_slug')
          ? `O endereço "${slug}" já pertence a outra tela.`
          : error.message,
      );
      return;
    }
    await lerTelas();
  }, [empresa?.id, perfil?.id, lerTelas]);

  /**
   * Aposenta uma tela.
   *
   * DESATIVA em vez de apagar. Apagar levaria junto, por cascata, o `tv_estado`
   * e a auditoria de quem cortou o quê naquela tela — e o endereço ficaria
   * livre para ser reaproveitado por outra, o que faria o PC daquela sala
   * passar a exibir a parede de outro setor sem ninguém ter mexido nele.
   *
   * Desativada, ela some da mesa, o `/tv/<slug>` para de encontrar a tela, e o
   * histórico continua de pé.
   */
  const apagarTela = useCallback(async (id: string) => {
    const { error } = await db('tv_telas')
      .update({ ativa: false, atualizado_em: new Date().toISOString() })
      .eq('id', id);
    if (error) { setErro(error.message); return; }
    setTelaId(atual => (atual === id ? null : atual));
    await lerTelas();
  }, [lerTelas]);

  /** Renomeia a tela. O endereço NÃO muda: mudá-lo quebraria o PC já configurado. */
  const renomearTela = useCallback(async (id: string, nome: string) => {
    const { error } = await db('tv_telas')
      .update({ nome: nome.trim() || 'Tela sem nome', atualizado_em: new Date().toISOString() })
      .eq('id', id);
    if (error) { setErro(error.message); return; }
    await lerTelas();
  }, [lerTelas]);

  // ── Cenas do setor da tela ────────────────────────────────────────────────

  const lerCenas = useCallback(async () => {
    if (!tela) { setCenas([]); return; }
    const { data, error } = await db('tv_cenas')
      .select('id, nome, ordem, setor_id, empresa_id, transicao, duracao_s, na_rotacao, emergencia')
      .eq('setor_id', tela.setor_id)
      .order('ordem');
    if (error) { setErro(error.message); return; }
    const lista = (data ?? []) as unknown as Cena[];
    setCenas(lista);
    setCenaId(atual => atual && lista.some(c => c.id === atual) ? atual : (lista[0]?.id ?? null));
  }, [tela]);

  useEffect(() => { void lerCenas(); }, [lerCenas]);

  // ── O que está no ar ──────────────────────────────────────────────────────

  const lerNoAr = useCallback(async () => {
    if (!telaId) { setCenaNoArId(null); return; }
    const { data } = await db('tv_estado').select('cena_id').eq('tela_id', telaId);
    const linha = (data ?? [])[0] as { cena_id: string | null } | undefined;
    setCenaNoArId(linha?.cena_id ?? null);
  }, [telaId]);

  useEffect(() => { void lerNoAr(); }, [lerNoAr]);

  // ── Fontes da cena em edição ──────────────────────────────────────────────

  const lerFontes = useCallback(async () => {
    if (!cenaId) { setFontes([]); return; }
    const { data, error } = await db('tv_fontes')
      .select('id, tipo, config, x, y, largura, escala, camada, visivel, volume, mudo')
      .eq('cena_id', cenaId)
      .order('camada');
    if (error) { setErro(error.message); return; }
    setFontes(((data ?? []) as unknown as Fonte[]).map((f): Fonte => ({ ...f, dados: null })));
  }, [cenaId]);

  useEffect(() => { void lerFontes(); }, [lerFontes]);

  // ── Números da prévia, pelo resolvedor da TV ──────────────────────────────

  const lerDadosPrevia = useCallback(async () => {
    if (!tela?.slug || !cenaId) { setDadosPorFonte({}); return; }
    const { data } = await rpc<CenaNoAr>('fn_tv_palco', {
      p_slug: tela.slug, p_cena_id: cenaId,
    });
    const mapa: Record<string, Fonte['dados']> = {};
    for (const f of data?.fontes ?? []) mapa[f.id] = f.dados;
    setDadosPorFonte(mapa);
  }, [tela?.slug, cenaId]);

  useEffect(() => {
    void lerDadosPrevia();
    const relogio = setInterval(() => { void lerDadosPrevia(); }, 30_000);
    return () => clearInterval(relogio);
  }, [lerDadosPrevia]);

  /** As fontes da prévia: geometria local + números do servidor. */
  const fontesDaPrevia: Fonte[] = fontes.map(f => ({ ...f, dados: dadosPorFonte[f.id] ?? null }));

  // ── O espelho do que está na parede ───────────────────────────────────────
  //
  // Vem da MESMA RPC que a TV chama, sem informar cena — ou seja, é literalmente
  // o que o palco está desenhando neste momento, e não uma reconstrução a partir
  // do estado local. Reconstruir daria um espelho que concorda com a mesa e
  // discorda da parede, que é o pior dos dois mundos.

  const [fontesNoAr, setFontesNoAr] = useState<Fonte[]>([]);
  const [proximaTrocaS, setProximaTrocaS] = useState<number | null>(null);

  const lerNoArDesenhado = useCallback(async () => {
    if (!tela?.slug) { setFontesNoAr([]); setProximaTrocaS(null); return; }
    const { data } = await rpc<CenaNoAr>('fn_tv_palco', { p_slug: tela.slug });
    setFontesNoAr(data?.fontes ?? []);
    setCenaNoArId(data?.cena?.id ?? null);
    setProximaTrocaS(data?.proxima_em_s ?? null);
  }, [tela?.slug]);

  useEffect(() => {
    void lerNoArDesenhado();
    const relogio = setInterval(() => { void lerNoArDesenhado(); }, 30_000);
    return () => clearInterval(relogio);
  }, [lerNoArDesenhado]);

  /*
   * O espelho da parede tem que trocar QUANDO a parede troca.
   *
   * Com a rotação ligada, a releitura de 30s deixava a mesa até meia dúzia de
   * cenas atrasada em relação à TV — e o quadro "No ar" existe justamente para
   * responder "o que está na parede agora". Atrasado, ele responde errado, que
   * é pior do que não existir.
   *
   * O palco usa o mesmo `proxima_em_s` para se agendar; aqui a mesa passa a
   * usar o mesmo relógio. Os dois trocam no mesmo instante porque a conta é a
   * mesma, feita no banco.
   */
  useEffect(() => {
    if (proximaTrocaS == null || proximaTrocaS < 0) return;
    const t = setTimeout(() => { void lerNoArDesenhado(); }, proximaTrocaS * 1000 + 600);
    return () => clearTimeout(t);
  }, [proximaTrocaS, lerNoArDesenhado]);

  /*
   * UM canal só para esta tela, guardado numa ref.
   *
   * Ele escuta (outra pessoa cortou de outra sessão) e é por ele que a mesa
   * AVISA o palco. Antes eram dois: um permanente para escutar e um temporário
   * criado a cada corte, com o MESMO tópico.
   *
   * `supabase.channel(nome)` não deduplica: dois canais com o mesmo tópico
   * coexistem, e o `removeChannel` do temporário derrubaria a assinatura do
   * permanente. É o defeito que já foi diagnosticado duas vezes neste projeto
   * e que motivou o `src/lib/realtime.ts` — não vale reintroduzir aqui.
   */
  const canalDaTela = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!tela?.slug) return;
    const canal = supabase
      .channel(`tv-palco-${tela.slug}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'cortar' }, () => { void lerNoArDesenhado(); })
      .subscribe();
    canalDaTela.current = canal;
    return () => {
      canalDaTela.current = null;
      void supabase.removeChannel(canal);
    };
  }, [tela?.slug, lerNoArDesenhado]);

  /** Avisa o palco para reler agora, em vez de esperar os 20s dele. */
  const avisarPalco = useCallback(async () => {
    await canalDaTela.current?.send({ type: 'broadcast', event: 'cortar', payload: {} });
  }, []);

  // ── Escrita ───────────────────────────────────────────────────────────────

  const criarCena = useCallback(async (nome: string) => {
    if (!tela || !empresa?.id) return;
    const { error } = await db('tv_cenas').insert({
      empresa_id: empresa.id,
      setor_id: tela.setor_id,
      nome: nome.trim() || 'Cena sem nome',
      ordem: cenas.length,
      criado_por: perfil?.id ?? null,
    });
    if (error) { setErro(error.message); return; }
    await lerCenas();
  }, [tela, empresa?.id, cenas.length, perfil?.id, lerCenas]);

  const renomearCena = useCallback(async (id: string, nome: string) => {
    const { error } = await db('tv_cenas')
      .update({ nome: nome.trim() || 'Cena sem nome', atualizado_em: new Date().toISOString() })
      .eq('id', id);
    if (error) { setErro(error.message); return; }
    await lerCenas();
  }, [lerCenas]);

  const apagarCena = useCallback(async (id: string) => {
    const { error } = await db('tv_cenas').delete().eq('id', id);
    if (error) { setErro(error.message); return; }
    await lerCenas();
    await lerNoAr();
  }, [lerCenas, lerNoAr]);

  /*
   * ── O desfazer ────────────────────────────────────────────────────────────
   *
   * A pilha guarda AÇÕES INVERSAS, não retratos da cena inteira. Retrato seria
   * mais simples de escrever e errado de usar: desfazer um arrasto devolveria
   * também a edição de texto que veio depois, e ninguém pede isso quando aperta
   * "desfazer".
   *
   * Vive numa `ref` porque a pilha em si não pinta nada; o que a tela precisa
   * saber — se há o que desfazer e o nome da última ação — sai de um estado
   * pequeno, atualizado junto.
   */
  type AcaoDesfazer =
    | { tipo: 'atualizar'; id: string; antes: Partial<Fonte>; rotulo: string }
    | { tipo: 'criar';     id: string; rotulo: string }
    | { tipo: 'criar_varias'; ids: string[]; rotulo: string }
    | { tipo: 'remover';   fonte: Fonte; cenaId: string; rotulo: string };

  const LIMITE_PILHA = 40;
  const pilha = useRef<AcaoDesfazer[]>([]);
  const [ultimaAcao, setUltimaAcao] = useState<string | null>(null);

  const empilhar = useCallback((acao: AcaoDesfazer) => {
    pilha.current = [...pilha.current, acao].slice(-LIMITE_PILHA);
    setUltimaAcao(acao.rotulo);
  }, []);

  /*
   * O gesto em curso.
   *
   * Arrastar e redimensionar chegam aqui dezenas de vezes com `definitivo =
   * false` e uma vez com `true`. Uma entrada na pilha por quadro faria
   * "desfazer" andar um pixel de cada vez — quarenta cliques para voltar de
   * onde se saiu. Aqui o estado ANTERIOR ao gesto é capturado na primeira
   * chamada e só vira entrada quando o gesto termina.
   */
  const gesto = useRef<{ id: string; antes: Partial<Fonte> } | null>(null);

  const abrirGesto = useCallback((id: string, campos: (keyof Fonte)[]) => {
    if (gesto.current?.id === id) return;
    const atual = fontes.find(f => f.id === id);
    if (!atual) return;
    const antes: Partial<Fonte> = {};
    for (const campo of campos) (antes as Record<string, unknown>)[campo] = atual[campo];
    gesto.current = { id, antes };
  }, [fontes]);

  const fecharGesto = useCallback((rotulo: string) => {
    const g = gesto.current;
    gesto.current = null;
    if (g) empilhar({ tipo: 'atualizar', id: g.id, antes: g.antes, rotulo });
  }, [empilhar]);

  const adicionarFonte = useCallback(async (tipo: TipoFonte) => {
    if (!cenaId) return;
    const padroes: Record<TipoFonte, { config: Record<string, unknown>; largura: number }> = {
      texto:   { config: { texto: 'Novo texto', tamanho: 72, cor: '#ffffff', peso: 700, alinhamento: 'center' }, largura: 60 },
      imagem:  { config: { url: '', ajuste: 'cover' }, largura: 40 },
      ranking: { config: { titulo: 'Ranking do mês', quantidade: 5, mostrar_valor: true }, largura: 55 },
      meta:    { config: { titulo: 'Meta do mês' }, largura: 45 },
      fundo:   { config: { cor: '#0d1b24', cor_2: '#08323d', angulo: 160 }, largura: 100 },
      relogio: { config: { tamanho: 120, cor: '#ffffff', segundos: false }, largura: 30 },
      video:   { config: { url: '', ajuste: 'cover' }, largura: 50 },
      desafio: { config: { titulo: 'Desafio' }, largura: 55 },
      sorteio: { config: { titulo: '' }, largura: 60 },
    };

    /*
     * O fundo nasce ATRÁS de tudo, e não no topo da pilha como as demais.
     * Adicionar um fundo e ver a cena inteira sumir atrás dele seria o
     * comportamento literal do "última fonte fica na frente" — e ninguém
     * espera isso de algo chamado fundo.
     */
    const camadas = fontes.map(f => f.camada);
    const camada = tipo === 'fundo'
      ? Math.min(0, ...camadas) - 1
      : Math.max(0, ...camadas) + 1;

    // `.select('id')` para o desfazer saber O QUE remover. Sem o id de volta,
    // "desfazer adicionar" teria de adivinhar qual das fontes nasceu agora.
    const { data, error } = await db('tv_fontes').insert({
      cena_id: cenaId,
      tipo,
      config: padroes[tipo].config,
      x: 50, y: 50, largura: padroes[tipo].largura, escala: 1,
      camada,
      visivel: true,
    }).select('id');
    if (error) { setErro(error.message); return; }

    const novoId = ((data ?? [])[0] as { id?: string } | undefined)?.id;
    if (novoId) empilhar({ tipo: 'criar', id: novoId, rotulo: `adicionar ${tipo}` });

    await lerFontes();
    await lerDadosPrevia();
    return novoId;
  }, [cenaId, fontes, lerFontes, lerDadosPrevia, empilhar]);

  /**
   * Aplica uma receita da galeria.
   *
   * Um template pode trazer VÁRIAS fontes (o «Painel da meta» traz quatro), e
   * elas entram numa inserção só — meia receita aplicada seria pior que
   * nenhuma, e é o que aconteceria com um `insert` por fonte se o terceiro
   * falhasse.
   *
   * As camadas são relativas dentro da receita e ganham a base da cena aqui: o
   * fundo do template continua atrás do fundo que já existia, e o texto dele
   * continua na frente do próprio fundo.
   */
  const adicionarTemplate = useCallback(async (template: Template) => {
    if (!cenaId) return;
    const camadas = fontes.map(f => f.camada);
    const topo = fontes.length ? Math.max(...camadas) : 0;
    const base = fontes.length ? Math.min(...camadas) : 0;

    const linhas = template.fontes.map((f, i) => ({
      cena_id: cenaId,
      tipo: f.tipo,
      config: f.config,
      x: f.x, y: f.y, largura: f.largura, escala: f.escala ?? 1,
      // Camada negativa na receita = "atrás de tudo"; positiva = empilha em cima.
      camada: (f.camada ?? 0) < 0 ? base + (f.camada ?? 0) : topo + 1 + i,
      visivel: true,
    }));

    const { data, error } = await db('tv_fontes').insert(linhas).select('id');
    if (error) { setErro(error.message); return; }

    const ids = ((data ?? []) as { id?: string }[]).map(l => l.id).filter(Boolean) as string[];
    // Uma entrada só na pilha: desfazer um template tira o template inteiro, e
    // não uma fonte por clique.
    if (ids.length) empilhar({ tipo: 'criar_varias', ids, rotulo: `adicionar «${template.nome}»` });

    await lerFontes();
    await lerDadosPrevia();
    return ids[ids.length - 1];
  }, [cenaId, fontes, lerFontes, lerDadosPrevia, empilhar]);

  /**
   * Grava a mudança de uma fonte.
   *
   * O estado local é atualizado ANTES da ida ao banco — arrastar precisa
   * responder no mesmo quadro, e esperar a resposta do servidor a cada pixel
   * faria o elemento andar aos trancos atrás do cursor.
   */
  const gravarFonte = useCallback(async (id: string, mudanca: Partial<Fonte>) => {
    setFontes(atual => atual.map(f => (f.id === id ? { ...f, ...mudanca } : f)));

    /*
     * `dados` não vai ao banco: não é configuração, é o número que o servidor
     * resolve na hora de desenhar. Gravá-lo criaria uma cópia congelada do
     * ranking dentro da fonte — e cópia congelada de número que muda é como se
     * fabrica uma tela que mostra o mês passado com cara de hoje.
     */
    const gravavel: Record<string, unknown> = {};
    for (const [chave, valor] of Object.entries(mudanca)) {
      if (chave !== 'dados') gravavel[chave] = valor;
    }
    if (Object.keys(gravavel).length === 0) return;

    const { error } = await db('tv_fontes').update(gravavel).eq('id', id);
    if (error) setErro(error.message);
  }, []);

  /**
   * Edição vinda do painel lateral: grava E entra na pilha do desfazer.
   *
   * Separada de `gravarFonte` porque o desfazer também precisa gravar — e uma
   * gravação de desfazer que se empilhasse sozinha faria "desfazer" virar um
   * botão de vai-e-volta infinito.
   */
  const atualizarFonte = useCallback(async (id: string, mudanca: Partial<Fonte>) => {
    const atual = fontes.find(f => f.id === id);
    if (atual) {
      const antes: Partial<Fonte> = {};
      for (const chave of Object.keys(mudanca) as (keyof Fonte)[]) {
        if (chave === 'dados') continue;
        (antes as Record<string, unknown>)[chave] = atual[chave];
      }
      if (Object.keys(antes).length > 0) {
        empilhar({ tipo: 'atualizar', id, antes, rotulo: 'editar fonte' });
      }
    }
    await gravarFonte(id, mudanca);
  }, [fontes, gravarFonte, empilhar]);

  /**
   * O arrasto.
   *
   * Enquanto o botão está apertado só o estado local muda — a fonte acompanha o
   * cursor no mesmo quadro. A gravação acontece UMA vez, ao soltar. Sem essa
   * separação, atravessar o palco com uma fonte dispararia uma centena de
   * UPDATEs, e a fonte andaria aos trancos atrás do cursor esperando cada um.
   */
  const moverFonte = useCallback((id: string, x: number, y: number, definitivo: boolean) => {
    abrirGesto(id, ['x', 'y']);
    setFontes(atual => atual.map(f => (f.id === id ? { ...f, x, y } : f)));
    if (!definitivo) return;
    fecharGesto('mover');
    /*
     * `.then()` e NÃO `void db(...)`.
     *
     * O builder do supabase-js é preguiçoso: ele só dispara a requisição quando
     * alguém o aguarda. `void` descarta o thenable sem nunca executá-lo — a
     * gravação parece ter acontecido e não saiu do navegador.
     *
     * Foi exatamente este o defeito: arrastar mexia na prévia (estado local) e
     * o banco continuava com 50/50, então a TV desenhava tudo no centro. A
     * prévia e a parede discordavam, que é o único jeito de esta ferramenta
     * perder a razão de existir.
     */
    void db('tv_fontes').update({ x, y }).eq('id', id).then(({ error }) => {
      if (error) setErro(error.message);
    });
  }, [abrirGesto, fecharGesto]);

  /**
   * O redimensionamento pelas alças.
   *
   * Mesma economia do arrasto: durante o gesto só o estado local muda, e a
   * gravação sai uma vez no soltar. `x` viaja junto porque crescer pela alça
   * move o centro — é o que mantém a borda oposta parada.
   */
  const redimensionarFonte = useCallback((
    id: string, r: { x: number; largura: number; escala: number }, definitivo: boolean,
  ) => {
    abrirGesto(id, ['x', 'largura', 'escala']);
    setFontes(atual => atual.map(f => (f.id === id ? { ...f, ...r } : f)));
    if (!definitivo) return;
    fecharGesto('redimensionar');
    void db('tv_fontes')
      .update({ x: r.x, largura: r.largura, escala: r.escala })
      .eq('id', id)
      .then(({ error }) => { if (error) setErro(error.message); });
  }, [abrirGesto, fecharGesto]);

  /**
   * Sobe ou desce a fonte uma camada, trocando de lugar com a vizinha.
   *
   * Troca em vez de renumerar tudo: são duas escritas em vez de N, e o número
   * das outras fontes não muda — o que importa se alguém estiver com a mesa
   * aberta em outra aba.
   */
  const moverCamada = useCallback(async (id: string, direcao: 'frente' | 'tras') => {
    const ordenadas = [...fontes].sort((a, b) => a.camada - b.camada);
    const i = ordenadas.findIndex(f => f.id === id);
    const j = direcao === 'frente' ? i + 1 : i - 1;
    if (i < 0 || j < 0 || j >= ordenadas.length) return;

    const a = ordenadas[i];
    const b = ordenadas[j];
    setFontes(atual => atual.map(f => {
      if (f.id === a.id) return { ...f, camada: b.camada };
      if (f.id === b.id) return { ...f, camada: a.camada };
      return f;
    }));
    await db('tv_fontes').update({ camada: b.camada }).eq('id', a.id);
    await db('tv_fontes').update({ camada: a.camada }).eq('id', b.id);
  }, [fontes]);

  const removerFonte = useCallback(async (id: string) => {
    // Guarda a linha ANTES de apagar: é a única cópia que vai existir, e é ela
    // que o desfazer reinsere — com o MESMO id, para que uma segunda ação sobre
    // a mesma fonte, ainda na pilha, continue apontando para a linha certa.
    const antes = fontes.find(f => f.id === id);
    const { error } = await db('tv_fontes').delete().eq('id', id);
    if (error) { setErro(error.message); return; }
    if (antes && cenaId) {
      empilhar({ tipo: 'remover', fonte: antes, cenaId, rotulo: `apagar ${antes.tipo}` });
    }
    await lerFontes();
  }, [lerFontes, fontes, cenaId, empilhar]);

  /**
   * Desfaz a última modificação de fonte desta sessão.
   *
   * A pilha é local à aba: recarregar a mesa esvazia. É proposital — desfazer é
   * "volta o que EU acabei de fazer", e uma pilha persistida ofereceria desfazer
   * a alteração de outra pessoa, em outro dia, sem contexto nenhum.
   *
   * O desfazer NÃO empilha: quem grava aqui é `gravarFonte`, e não
   * `atualizarFonte`. Fosse o contrário, o botão viraria um vai-e-volta.
   */
  const desfazer = useCallback(async () => {
    const acao = pilha.current[pilha.current.length - 1];
    if (!acao) return;
    pilha.current = pilha.current.slice(0, -1);
    setUltimaAcao(pilha.current[pilha.current.length - 1]?.rotulo ?? null);

    if (acao.tipo === 'atualizar') {
      await gravarFonte(acao.id, acao.antes);
      return;
    }

    if (acao.tipo === 'criar') {
      const { error } = await db('tv_fontes').delete().eq('id', acao.id);
      if (error) setErro(error.message);
      await lerFontes();
      return;
    }

    if (acao.tipo === 'criar_varias') {
      // Uma a uma: o cliente sem tipo deste arquivo não expõe `in()`, e um
      // template traz no máximo meia dúzia de fontes.
      for (const id of acao.ids) {
        const { error } = await db('tv_fontes').delete().eq('id', id);
        if (error) setErro(error.message);
      }
      await lerFontes();
      return;
    }

    const f = acao.fonte;
    const { error } = await db('tv_fontes').insert({
      id: f.id, cena_id: acao.cenaId, tipo: f.tipo, config: f.config,
      x: f.x, y: f.y, largura: f.largura, escala: f.escala, camada: f.camada,
      visivel: f.visivel ?? true, volume: f.volume ?? 1, mudo: f.mudo ?? true,
    });
    if (error) setErro(error.message);
    await lerFontes();
    await lerDadosPrevia();
  }, [gravarFonte, lerFontes, lerDadosPrevia]);

  /** Ajustes da cena: transição, duração na fila, emergência. */
  const atualizarCena = useCallback(async (id: string, mudanca: Partial<Cena>) => {
    setCenas(atual => atual.map(c => (c.id === id ? { ...c, ...mudanca } : c)));
    const { error } = await db('tv_cenas')
      .update({ ...mudanca, atualizado_em: new Date().toISOString() })
      .eq('id', id);
    if (error) { setErro(error.message); await lerCenas(); }
  }, [lerCenas]);

  // ── Biblioteca de mídia ───────────────────────────────────────────────────

  const [midias, setMidias] = useState<Midia[]>([]);

  const lerMidias = useCallback(async () => {
    if (!empresa?.id) return;
    const { data } = await db('tv_midias')
      .select('id, url, caminho, tipo, nome')
      .eq('empresa_id', empresa.id)
      .order('criado_em', { ascending: false });
    setMidias((data ?? []) as unknown as Midia[]);
  }, [empresa?.id]);

  useEffect(() => { void lerMidias(); }, [lerMidias]);

  // ── Envio de imagem ───────────────────────────────────────────────────────
  //
  // O bucket `tv` é público na leitura porque o palco é anônimo: a TV precisa
  // carregar a arte sem sessão. Escrever exige `tv_enviar_midia`, e quem cobra
  // isso é a policy do Storage — ver a migration 20260902110000.

  const [enviandoImagem, setEnviandoImagem] = useState(false);

  /**
   * Envia um arquivo e o registra na biblioteca.
   *
   * O registro em `tv_midias` é o que torna a arte REAPROVEITÁVEL. Sem ele a
   * mesma peça de campanha seria enviada de novo a cada cena, e o bucket viraria
   * depósito de duplicatas que ninguém consegue mais distinguir.
   */
  const enviarImagem = useCallback(async (
    arquivo: File,
  ): Promise<{ url: string; tipo: 'imagem' | 'video' } | null> => {
    if (!empresa?.id) return null;

    const ehVideo = arquivo.type.startsWith('video/');
    if (!ehVideo && !arquivo.type.startsWith('image/')) {
      setErro('Só imagem, GIF ou vídeo — este arquivo não é nenhum dos três.');
      return null;
    }

    setEnviandoImagem(true);
    try {
      // Nome sorteado, e não o do arquivo: dois "campanha.png" enviados por
      // pessoas diferentes não podem disputar o mesmo caminho.
      const extensao = (arquivo.name.split('.').pop() ?? 'png').toLowerCase().slice(0, 5);
      const caminho = `${empresa.id}/${crypto.randomUUID()}.${extensao}`;

      const { error } = await supabase.storage.from('tv').upload(caminho, arquivo, {
        cacheControl: '3600', upsert: false,
      });
      if (error) { setErro(error.message); return null; }

      const { data } = supabase.storage.from('tv').getPublicUrl(caminho);
      const tipo: 'imagem' | 'video' = ehVideo ? 'video' : 'imagem';

      // Falhar aqui não perde o arquivo: ele já está no bucket e a URL serve.
      // Só não entra na biblioteca, e o aviso diz isso.
      const { error: erroRegistro } = await db('tv_midias').insert({
        empresa_id: empresa.id,
        caminho,
        url: data.publicUrl,
        tipo,
        nome: arquivo.name.slice(0, 120),
        tamanho: arquivo.size,
        criado_por: perfil?.id ?? null,
      });
      if (erroRegistro) setErro(`Enviado, mas fora da biblioteca: ${erroRegistro.message}`);
      else await lerMidias();

      return { url: data.publicUrl, tipo };
    } finally {
      setEnviandoImagem(false);
    }
  }, [empresa?.id, perfil?.id, lerMidias]);

  // ── O corte ───────────────────────────────────────────────────────────────

  const [cortando, setCortando] = useState(false);

  /**
   * Manda a cena ao ar. `null` TIRA do ar.
   *
   * O botão de cortar não fica desativado quando a cena já está no ar, e isso é
   * proposital: cortar de novo é como se empurra para a parede uma alteração
   * recém-feita, sem esperar a releitura de 20 segundos. Desativar prendia a
   * pessoa — mexia na cena e não tinha como publicar.
   */
  const cortar = useCallback(async (alvo?: string | null) => {
    if (!telaId || !tela) return;
    const cena = alvo === null ? null : (alvo ?? cenaId);
    if (cena === undefined) return;

    setCortando(true);
    const { error } = await rpc('fn_tv_cortar', { p_tela_id: telaId, p_cena_id: cena });
    setCortando(false);
    if (error) {
      setErro((error as { message?: string }).message ?? 'Não foi possível mandar ao ar.');
      return;
    }
    setCenaNoArId(cena);
    // Cortar à mão desliga a rotação no banco; refletir aqui evita a mesa
    // mostrar "rotação ligada" logo depois de ela ter sido desligada.
    setTelas(atual => atual.map(t => (t.id === telaId ? { ...t, rotacao_ativa: false } : t)));
    await lerNoArDesenhado();

    /*
     * O aviso ao palco. A gravação em `tv_estado` já garante que a TV volte
     * certa depois de qualquer queda; ESTE broadcast é o que faz a parede mudar
     * no mesmo segundo, em vez de esperar a releitura de 20s.
     *
     * Sem carga: o palco relê pela RPC. Mandar a cena inteira por aqui criaria
     * um segundo caminho para o mesmo dado, e é assim que os dois divergem.
     */
    await avisarPalco();
  }, [telaId, cenaId, tela, lerNoArDesenhado, avisarPalco]);

  /**
   * Liga e desliga a fila automática.
   *
   * Com ela ligada, a cena vem do RELÓGIO e não de `tv_estado` — a parede troca
   * sozinha o dia inteiro sem ninguém na mesa, que é a razão de o Modo TV
   * funcionar quando você não está olhando.
   */
  const alternarRotacao = useCallback(async (ativa: boolean) => {
    if (!telaId || !tela) return;
    setTelas(atual => atual.map(t => (t.id === telaId ? { ...t, rotacao_ativa: ativa } : t)));
    const { error } = await rpc('fn_tv_rotacao', { p_tela_id: telaId, p_ativa: ativa });
    if (error) {
      setErro((error as { message?: string }).message ?? 'Não foi possível mudar a rotação.');
      await lerTelas();
      return;
    }
    await avisarPalco();
    await lerNoArDesenhado();
  }, [telaId, tela, lerTelas, lerNoArDesenhado, avisarPalco]);

  /**
   * Solta um arquivo na prévia e ele vira fonte, no ponto onde foi solto.
   *
   * É o caminho curto entre "tenho a arte da campanha aqui" e "está na parede".
   * Sem isto seriam quatro passos: adicionar fonte, escolher tipo, abrir o
   * seletor, enviar.
   */
  const soltarArquivo = useCallback(async (arquivo: File, x: number, y: number) => {
    if (!cenaId) return;
    const enviado = await enviarImagem(arquivo);
    if (!enviado) return;

    const camadas = fontes.map(f => f.camada);
    const { error } = await db('tv_fontes').insert({
      cena_id: cenaId,
      tipo: enviado.tipo === 'video' ? 'video' : 'imagem',
      config: { url: enviado.url, ajuste: 'cover' },
      x, y,
      largura: enviado.tipo === 'video' ? 50 : 40,
      escala: 1,
      camada: Math.max(0, ...camadas) + 1,
      visivel: true,
      mudo: true,
    });
    if (error) { setErro(error.message); return; }
    await lerFontes();
    await lerDadosPrevia();
  }, [cenaId, fontes, enviarImagem, lerFontes, lerDadosPrevia]);

  // ── Mosaico: o que cada tela está exibindo ────────────────────────────────
  //
  // Uma chamada por tela, e não uma consulta que devolva tudo: é a MESMA RPC
  // que alimenta cada parede, então o mosaico mostra o que está lá de verdade
  // em vez de uma reconstrução a partir do estado local. Com duas ou três telas
  // o custo é irrelevante; se um dia forem vinte, aí vale uma RPC de lote.

  const [fontesPorTela, setFontesPorTela] = useState<Record<string, Fonte[]>>({});

  const lerMosaico = useCallback(async () => {
    if (telas.length < 2) { setFontesPorTela({}); return; }
    const pares = await Promise.all(telas.map(async t => {
      const { data } = await rpc<CenaNoAr>('fn_tv_palco', { p_slug: t.slug });
      return [t.id, data?.fontes ?? []] as const;
    }));
    setFontesPorTela(Object.fromEntries(pares));
  }, [telas]);

  useEffect(() => {
    void lerMosaico();
    const relogio = setInterval(() => { void lerMosaico(); }, 20_000);
    return () => clearInterval(relogio);
  }, [lerMosaico]);

  // ── Alertas e sorteios ────────────────────────────────────────────────────

  /**
   * Dispara o alerta e avisa a parede na hora.
   *
   * Sem o aviso, ele só apareceria na próxima releitura do palco — até 20
   * segundos depois. Um alerta que chega atrasado perde exatamente aquilo que o
   * torna útil: a coincidência entre o que aconteceu e a comemoração.
   */
  const dispararAlerta = useCallback(async (
    titulo: string, mensagem?: string, midiaUrl?: string, somUrl?: string, duracaoS = 10,
  ) => {
    if (!tela) return;
    const { error } = await rpc('fn_tv_alerta_disparar', {
      p_setor_id: tela.setor_id,
      p_titulo: titulo,
      p_mensagem: mensagem ?? null,
      p_midia_url: midiaUrl ?? null,
      p_som_url: somUrl ?? null,
      p_duracao_s: duracaoS,
    });
    if (error) {
      setErro((error as { message?: string }).message ?? 'Não foi possível disparar o alerta.');
      return;
    }
    await avisarPalco();
  }, [tela, avisarPalco]);

  const [sorteio, setSorteio] = useState<DadosSorteio | null>(null);

  const lerSorteio = useCallback(async () => {
    if (!tela) { setSorteio(null); return; }
    const { data } = await db('tv_sorteios')
      .select('id, tipo, titulo, participantes, resultado, config, estado, girado_em, girado_por_nome')
      .eq('setor_id', tela.setor_id)
      .order('criado_em', { ascending: false });
    setSorteio(((data ?? [])[0] as DadosSorteio | undefined) ?? null);
  }, [tela]);

  useEffect(() => { void lerSorteio(); }, [lerSorteio]);

  /*
   * Quem pode ser sorteado neste setor.
   *
   * Com foto: o palco e ANONIMO e nao consegue ir buscar o rosto depois, entao
   * ele viaja junto com o participante na hora de abrir o jogo.
   */
  const [pessoasDoSetor, setPessoasDoSetor] = useState<
    { id: string; nome: string; foto_url: string | null }[]
  >([]);

  useEffect(() => {
    if (!empresa?.id || !tela?.setor_id) { setPessoasDoSetor([]); return; }
    void (async () => {
      const { data } = await db('perfis')
        .select('id, nome, email, foto_url')
        .eq('empresa_id', empresa.id)
        .eq('setor_id', tela.setor_id)
        .eq('ativo', true)
        .order('nome');
      setPessoasDoSetor(((data ?? []) as { id: string; nome: string | null; email: string | null; foto_url: string | null }[])
        .map(p => ({ id: p.id, nome: (p.nome ?? '').trim() || p.email || 'Sem nome', foto_url: p.foto_url })));
    })();
  }, [empresa?.id, tela?.setor_id]);

  const criarSorteio = useCallback(async (
    tipo: 'roleta' | 'bingo' | 'sorteio',
    titulo: string,
    participantes?: unknown[] | null,
    config?: Record<string, unknown>,
  ) => {
    if (!tela) return;
    const { error } = await rpc('fn_tv_sorteio_criar', {
      p_setor_id: tela.setor_id,
      p_tipo: tipo,
      p_titulo: titulo,
      p_participantes: participantes && participantes.length > 0 ? participantes : null,
      p_config: config ?? {},
    });
    if (error) {
      setErro((error as { message?: string }).message ?? 'Não foi possível abrir o jogo.');
      return;
    }
    await lerSorteio();
    await avisarPalco();
  }, [tela, lerSorteio, avisarPalco]);

  /**
   * Gira, ou tira o próximo número. O SERVIDOR decide o resultado.
   *
   * A parede é avisada logo depois: sem o aviso, a animação só começaria na
   * releitura de 20s do palco, e a sala inteira ficaria olhando para uma roda
   * parada depois de alguém apertar o botão.
   */
  const sortear = useCallback(async () => {
    if (!sorteio) return;
    const fn = sorteio.tipo === 'bingo' ? 'fn_tv_bingo_sortear' : 'fn_tv_sorteio_girar';
    const { error } = await rpc(fn, { p_sorteio_id: sorteio.id });
    if (error) {
      setErro((error as { message?: string }).message ?? 'Não foi possível sortear.');
      return;
    }
    await lerSorteio();
    await avisarPalco();
  }, [sorteio, lerSorteio, avisarPalco]);

  /** Alguém bateu: o BINGO toma a parede. */
  const encerrarBingo = useCallback(async (quem: string) => {
    if (!sorteio) return;
    const { error } = await rpc('fn_tv_bingo_encerrar', {
      p_sorteio_id: sorteio.id, p_vencedor: quem,
    });
    if (error) {
      setErro((error as { message?: string }).message ?? 'Não foi possível anunciar o bingo.');
      return;
    }
    await lerSorteio();
    await avisarPalco();
  }, [sorteio, lerSorteio, avisarPalco]);

  /**
   * Nova rodada, sem apagar o jogo.
   *
   * Devolve todos à lista (roleta e sorteio) ou zera a cartela e soma uma
   * rodada (bingo). Apagar e criar de novo perderia o título e a configuração
   * — e a pessoa refaria a lista de trinta nomes.
   */
  const reiniciarSorteio = useCallback(async () => {
    if (!sorteio) return;
    const { error } = await rpc('fn_tv_sorteio_reiniciar', { p_sorteio_id: sorteio.id });
    if (error) {
      setErro((error as { message?: string }).message ?? 'Não foi possível reiniciar.');
      return;
    }
    await lerSorteio();
    await avisarPalco();
  }, [sorteio, lerSorteio, avisarPalco]);

  return {
    empresa, telas, tela, telaId, setTelaId, setores, equipes, criarTela, apagarTela, renomearTela,
    dispararAlerta, sorteio, criarSorteio, sortear, encerrarBingo, reiniciarSorteio,
    pessoasDoSetor, fontesPorTela,
    cenas, cenaId, setCenaId, cenaNoArId,
    fontes, fontesDaPrevia, fontesNoAr,
    carregando, erro, limparErro: () => setErro(null),
    enviarImagem, enviandoImagem,
    criarCena, renomearCena, apagarCena, atualizarCena,
    adicionarFonte, adicionarTemplate, atualizarFonte, removerFonte, moverFonte, moverCamada,
    redimensionarFonte, desfazer, podeDesfazer: ultimaAcao !== null, ultimaAcao,
    midias, soltarArquivo, alternarRotacao,
    cortar, cortando,
    recarregar: async () => { await lerTelas(); await lerCenas(); await lerFontes(); await lerNoAr(); },
  };
}

/** Só para os testes: o limite de silêncio antes de a TV contar como fora. */
export const LIMITE_SINAL_PARA_TESTE = LIMITE_SINAL_MS;
