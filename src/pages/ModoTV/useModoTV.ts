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
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useAuth } from '@/hooks/useAuth';
import type { CenaNoAr, Fonte, TipoFonte } from './geometria';
import { normalizarSlug } from './slug';

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

  const lerNoArDesenhado = useCallback(async () => {
    if (!tela?.slug) { setFontesNoAr([]); return; }
    const { data } = await rpc<CenaNoAr>('fn_tv_palco', { p_slug: tela.slug });
    setFontesNoAr(data?.fontes ?? []);
  }, [tela?.slug]);

  useEffect(() => {
    void lerNoArDesenhado();
    const relogio = setInterval(() => { void lerNoArDesenhado(); }, 30_000);
    return () => clearInterval(relogio);
  }, [lerNoArDesenhado]);

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

    const { error } = await db('tv_fontes').insert({
      cena_id: cenaId,
      tipo,
      config: padroes[tipo].config,
      x: 50, y: 50, largura: padroes[tipo].largura, escala: 1,
      camada,
      visivel: true,
    });
    if (error) { setErro(error.message); return; }
    await lerFontes();
    await lerDadosPrevia();
  }, [cenaId, fontes, lerFontes, lerDadosPrevia]);

  /**
   * Grava a mudança de uma fonte.
   *
   * O estado local é atualizado ANTES da ida ao banco — arrastar precisa
   * responder no mesmo quadro, e esperar a resposta do servidor a cada pixel
   * faria o elemento andar aos trancos atrás do cursor.
   */
  const atualizarFonte = useCallback(async (id: string, mudanca: Partial<Fonte>) => {
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
   * O arrasto.
   *
   * Enquanto o botão está apertado só o estado local muda — a fonte acompanha o
   * cursor no mesmo quadro. A gravação acontece UMA vez, ao soltar. Sem essa
   * separação, atravessar o palco com uma fonte dispararia uma centena de
   * UPDATEs, e a fonte andaria aos trancos atrás do cursor esperando cada um.
   */
  const moverFonte = useCallback((id: string, x: number, y: number, definitivo: boolean) => {
    setFontes(atual => atual.map(f => (f.id === id ? { ...f, x, y } : f)));
    if (!definitivo) return;
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
  }, []);

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
    const { error } = await db('tv_fontes').delete().eq('id', id);
    if (error) { setErro(error.message); return; }
    await lerFontes();
  }, [lerFontes]);

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
    const canal = supabase.channel(`tv-palco-${tela.slug}`);
    await canal.subscribe();
    await canal.send({ type: 'broadcast', event: 'cortar', payload: {} });
    void supabase.removeChannel(canal);
  }, [telaId, cenaId, tela, lerNoArDesenhado]);

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
    const canal = supabase.channel(`tv-palco-${tela.slug}`);
    await canal.subscribe();
    await canal.send({ type: 'broadcast', event: 'cortar', payload: {} });
    void supabase.removeChannel(canal);
    await lerNoArDesenhado();
  }, [telaId, tela, lerTelas, lerNoArDesenhado]);

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

  return {
    empresa, telas, tela, telaId, setTelaId, setores, criarTela,
    cenas, cenaId, setCenaId, cenaNoArId,
    fontes, fontesDaPrevia, fontesNoAr,
    carregando, erro, limparErro: () => setErro(null),
    enviarImagem, enviandoImagem,
    criarCena, renomearCena, apagarCena, atualizarCena,
    adicionarFonte, atualizarFonte, removerFonte, moverFonte, moverCamada,
    midias, soltarArquivo, alternarRotacao,
    cortar, cortando,
    recarregar: async () => { await lerTelas(); await lerCenas(); await lerFontes(); await lerNoAr(); },
  };
}

/** Só para os testes: o limite de silêncio antes de a TV contar como fora. */
export const LIMITE_SINAL_PARA_TESTE = LIMITE_SINAL_MS;
