// Ensaio TEMPORÁRIO: o mesmo contrato do useModoTV arquivado, com o estado em
// memória e dados fictícios. Nada aqui fala com o banco.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Alerta, DadosMeta, DadosSorteio, Fonte, LinhaRanking, Participante, TipoFonte } from './geometria';
import { normalizarSlug } from './slug';
import { TEMPLATES, type Template } from './templates';

export interface Tela {
  id: string; slug: string; nome: string; setor_id: string; empresa_id: string;
  ultimo_sinal: string | null; rotacao_ativa: boolean;
}
export interface Cena {
  id: string; nome: string; ordem: number; setor_id: string; empresa_id: string;
  transicao: 'corte' | 'fade' | 'deslize'; duracao_s: number; na_rotacao: boolean; emergencia: boolean;
}
export interface Midia { id: string; url: string; caminho: string; tipo: 'imagem' | 'video'; nome: string }

export function telaOnline(ultimoSinal: string | null): boolean {
  return !!ultimoSinal;
}

// ── dados fictícios ─────────────────────────────────────────────────────────
const CORES = ['#0ea5e9', '#16a34a', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#ec4899', '#6366f1'];
function avatar(nome: string, i: number) {
  const ini = nome.split(' ').map(p => p[0]).slice(0, 2).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="${CORES[i % CORES.length]}"/><text x="60" y="60" dy=".35em" text-anchor="middle" font-family="Inter,Arial" font-weight="700" font-size="48" fill="#fff">${ini}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
const NOMES = ['Juliana Prado', 'Rafael Moura', 'Bianca Torres', 'Diego Almeida', 'Camila Rocha', 'Lucas Ferreira', 'Patrícia Nunes', 'Gustavo Lima', 'Larissa Campos', 'Thiago Reis'];
const TOTAIS = [24870, 21340, 19920, 17650, 15410, 13980, 12730, 11260, 9840, 8120];
export const PESSOAS = NOMES.map((nome, i) => ({ id: `p${i}`, nome, foto_url: avatar(nome, i) }));
const RANKING: LinhaRanking[] = PESSOAS.map((p, i) => ({ nome: p.nome, foto_url: p.foto_url, total: TOTAIS[i] }));

const S4 = 'setor-play4';
const EMPRESA = 'bookplay';

function metaDoSetor(realizado: number, hoje: number): DadosMeta {
  const alvo = 180000, dias = 22, decorridos = 19, restantes = 3;
  return {
    alvo, realizado, realizado_hoje: hoje, falta: Math.max(0, alvo - realizado),
    dias_uteis: dias, dias_decorridos: decorridos, dias_restantes: restantes,
    meta_diaria: alvo / dias, ritmo_necessario: Math.max(0, alvo - realizado) / restantes,
    esperado_ate_hoje: (alvo / dias) * decorridos, projecao: (realizado / decorridos) * dias,
  };
}

let seq = 0;
const novoId = (p: string) => `${p}-${++seq}`;

function fonte(tipo: TipoFonte, config: Record<string, unknown>, x: number, y: number, largura: number, camada: number, escala = 1): Fonte {
  return { id: novoId('f'), tipo, config, x, y, largura, escala, camada, visivel: true, dados: null };
}
function deTemplate(id: string, base = 0): Fonte[] {
  const t = TEMPLATES.find(t => t.id === id)!;
  return t.fontes.map((f, i) => fonte(f.tipo, { ...f.config }, f.x, f.y, f.largura, (f.camada ?? 0) < 0 ? -1 : base + i + 1, f.escala ?? 1));
}
const FUNDO = (cor = '#0d1b24', cor2 = '#08323d') => fonte('fundo', { cor, cor_2: cor2, angulo: 160 }, 50, 50, 100, -1);

interface Store {
  telas: Tela[];
  telaId: string;
  cenas: Cena[];
  cenaId: string | null;
  fontesPorCena: Record<string, Fonte[]>;
  /** O que cada tela mostra: a geometria cortada (os números se resolvem na hora). */
  noAr: Record<string, { cenaId: string; fontes: Fonte[] } | null>;
  alertas: Alerta[];
  sorteio: DadosSorteio | null;
  midias: Midia[];
  realizado: number;
  hoje: number;
}

function inicial(): Store {
  const agora = new Date().toISOString();
  const telas: Tela[] = [
    { id: 't1', slug: 'play-4', nome: 'TV do Play 4', setor_id: S4, empresa_id: EMPRESA, ultimo_sinal: agora, rotacao_ativa: false },
    { id: 't2', slug: 'recepcao', nome: 'TV da Recepção', setor_id: 'setor-rec', empresa_id: EMPRESA, ultimo_sinal: agora, rotacao_ativa: false },
    { id: 't3', slug: 'play-5', nome: 'TV do Play 5', setor_id: 'setor-p5', empresa_id: EMPRESA, ultimo_sinal: agora, rotacao_ativa: true },
  ];
  const cena = (id: string, nome: string, ordem: number, extra: Partial<Cena> = {}): Cena => ({
    id, nome, ordem, setor_id: S4, empresa_id: EMPRESA, transicao: 'fade', duracao_s: 15, na_rotacao: true, emergencia: false, ...extra,
  });
  const cenas = [
    cena('c1', 'Meta do mês', 0, { emergencia: true }),
    cena('c2', 'Ranking do mês', 1),
    cena('c3', 'Meta de hoje', 2, { transicao: 'deslize' }),
    cena('c4', 'Roleta do café', 3, { na_rotacao: false }),
  ];
  const fontesPorCena: Record<string, Fonte[]> = {
    c1: deTemplate('meta-completa'),
    c2: [
      FUNDO('#0b1f2a', '#102a43'),
      fonte('ranking', { modelo: 'lista', titulo: 'Ranking do mês', quantidade: 5, mostrar_valor: true }, 38, 54, 52, 1),
      fonte('meta', { modelo: 'rosca', titulo: 'Meta do mês', mostrar_valor: true }, 80, 55, 24, 2),
      fonte('relogio', { tamanho: 96, cor: '#ffffff', segundos: false }, 88, 9, 22, 3),
    ],
    c3: [FUNDO('#0d1b24', '#0b3a2c'), fonte('meta', { modelo: 'diaria', titulo: 'Meta de hoje', origem: 'mensal' }, 50, 50, 58, 1)],
    c4: [FUNDO('#1a0b2e', '#0b2a3a'), fonte('sorteio', { modelo: 'roleta', titulo: 'Roleta do café' }, 50, 50, 36, 1)],
  };
  // As outras telas: só o que está no ar, para o mosaico.
  const recepcao = [FUNDO('#1b1530', '#2a1f4a'), fonte('texto', { texto: 'Bem-vindo à BookPlay', tamanho: 120, cor: '#ffffff', peso: 800, alinhamento: 'center' }, 50, 42, 80, 1), fonte('relogio', { tamanho: 140, cor: '#c4b5fd', segundos: false }, 50, 68, 30, 2)];
  const play5 = [FUNDO('#0b1f2a', '#07323f'), fonte('ranking', { modelo: 'podio', titulo: 'Pódio do mês', quantidade: 3, mostrar_valor: true }, 50, 55, 62, 1)];
  return {
    telas, telaId: 't1', cenas, cenaId: 'c1', fontesPorCena,
    noAr: {
      t1: { cenaId: 'c1', fontes: clonar(fontesPorCena.c1) },
      t2: { cenaId: 'x2', fontes: recepcao },
      t3: { cenaId: 'x3', fontes: play5 },
    },
    alertas: [], sorteio: null, midias: [], realizado: 132480, hoje: 6850,
  };
}

function clonar(fs: Fonte[]): Fonte[] {
  return fs.map(f => ({ ...f, config: { ...f.config } }));
}

type Acao =
  | { tipo: 'atualizar'; id: string; antes: Partial<Fonte>; rotulo: string }
  | { tipo: 'criar'; ids: string[]; rotulo: string }
  | { tipo: 'remover'; fonte: Fonte; cenaId: string; rotulo: string };

// ── o contexto: mesa e parede leem o MESMO estado ───────────────────────────
type Lab = ReturnType<typeof useLabInterno>;
const Ctx = createContext<Lab | null>(null);

export function LabProvider({ children }: { children: React.ReactNode }) {
  const lab = useLabInterno();
  return createElement(Ctx.Provider, { value: lab }, children);
}

export function useModoTV() {
  const v = useContext(Ctx);
  if (!v) throw new Error('LabProvider ausente');
  return v;
}

function useLabInterno() {
  const [st, setSt] = useState<Store>(inicial);
  const stRef = useRef(st);
  stRef.current = st;
  const [cortando, setCortando] = useState(false);
  const [ultimaAcao, setUltimaAcao] = useState<string | null>(null);
  const pilha = useRef<Acao[]>([]);
  const gesto = useRef<{ id: string; antes: Partial<Fonte> } | null>(null);
  const proximoIndice = useRef<number | null>(null);
  const atrasoCorte = useRef(260);
  const [, setTique] = useState(0);

  const tela = st.telas.find(t => t.id === st.telaId) ?? null;
  const cenas = st.cenas.filter(c => c.setor_id === tela?.setor_id).sort((a, b) => a.ordem - b.ordem);
  const fontes = st.cenaId ? (st.fontesPorCena[st.cenaId] ?? []) : [];

  const resolver = useCallback((f: Fonte, s: Store): Fonte => {
    let dados: Fonte['dados'] = null;
    if (f.tipo === 'meta') dados = metaDoSetor(s.realizado, s.hoje);
    else if (f.tipo === 'ranking') dados = RANKING.slice(0, Number(f.config.quantidade) || 5);
    else if (f.tipo === 'sorteio') {
      const modelo = String(f.config.modelo ?? '');
      dados = s.sorteio && (!modelo || s.sorteio.tipo === modelo) ? s.sorteio : null;
    } else if (f.tipo === 'desafio') dados = { nome: 'Quem fechar mais acordos Pix', premio: 'Folga na sexta', data_fim: '2026-10-31', dias_restantes: 4 };
    return { ...f, dados };
  }, []);

  const ordenar = (fs: Fonte[]) => [...fs].sort((a, b) => a.camada - b.camada);
  const fontesDaPrevia = ordenar(fontes).map(f => resolver(f, st));
  const noArDe = useCallback((telaId: string, s: Store = stRef.current) => {
    const n = s.noAr[telaId];
    return n ? ordenar(n.fontes).filter(f => f.visivel !== false).map(f => resolver(f, s)) : [];
  }, [resolver]);
  const fontesNoAr = noArDe(st.telaId, st);
  const cenaNoArId = st.noAr[st.telaId]?.cenaId ?? null;
  const fontesPorTela = Object.fromEntries(st.telas.map(t => [t.id, noArDe(t.id, st)]));

  // ── edição da cena ────────────────────────────────────────────────────────
  const mexerFontes = useCallback((fn: (fs: Fonte[]) => Fonte[]) => {
    setSt(s => {
      if (!s.cenaId) return s;
      return { ...s, fontesPorCena: { ...s.fontesPorCena, [s.cenaId]: fn(s.fontesPorCena[s.cenaId] ?? []) } };
    });
  }, []);

  const empilhar = useCallback((a: Acao) => {
    pilha.current = [...pilha.current, a].slice(-40);
    setUltimaAcao(a.rotulo);
  }, []);

  const gravar = useCallback((id: string, m: Partial<Fonte>) => {
    mexerFontes(fs => fs.map(f => (f.id === id ? { ...f, ...m } : f)));
  }, [mexerFontes]);

  const atualizarFonte = useCallback(async (id: string, m: Partial<Fonte>) => {
    const atual = (stRef.current.fontesPorCena[stRef.current.cenaId ?? ''] ?? []).find(f => f.id === id);
    if (!atual) return;
    const antes: Partial<Fonte> = {};
    for (const k of Object.keys(m) as (keyof Fonte)[]) (antes as Record<string, unknown>)[k] = atual[k];
    const ultima = pilha.current[pilha.current.length - 1];
    if (!(ultima && ultima.tipo === 'atualizar' && ultima.id === id && ultima.rotulo === 'editar fonte')) {
      empilhar({ tipo: 'atualizar', id, antes, rotulo: 'editar fonte' });
    }
    gravar(id, m);
  }, [empilhar, gravar]);

  const abrirGesto = (id: string, campos: (keyof Fonte)[]) => {
    if (gesto.current?.id === id) return;
    const atual = (stRef.current.fontesPorCena[stRef.current.cenaId ?? ''] ?? []).find(f => f.id === id);
    if (!atual) return;
    const antes: Partial<Fonte> = {};
    for (const c of campos) (antes as Record<string, unknown>)[c] = atual[c];
    gesto.current = { id, antes };
  };
  const fecharGesto = (rotulo: string) => {
    const g = gesto.current;
    gesto.current = null;
    if (g) empilhar({ tipo: 'atualizar', id: g.id, antes: g.antes, rotulo });
  };

  const moverFonte = useCallback((id: string, x: number, y: number, definitivo: boolean) => {
    abrirGesto(id, ['x', 'y']);
    gravar(id, { x, y });
    if (definitivo) fecharGesto('mover');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gravar]);

  const redimensionarFonte = useCallback((id: string, r: { x: number; largura: number; escala: number }, definitivo: boolean) => {
    abrirGesto(id, ['x', 'largura', 'escala']);
    gravar(id, r);
    if (definitivo) fecharGesto('redimensionar');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gravar]);

  const adicionarFonte = useCallback(async (tipo: TipoFonte) => {
    const padroes: Record<TipoFonte, { config: Record<string, unknown>; largura: number }> = {
      texto: { config: { texto: 'Novo texto', tamanho: 72, cor: '#ffffff', peso: 700, alinhamento: 'center' }, largura: 60 },
      imagem: { config: { url: '', ajuste: 'cover' }, largura: 40 },
      ranking: { config: { titulo: 'Ranking do mês', quantidade: 5, mostrar_valor: true }, largura: 55 },
      meta: { config: { titulo: 'Meta do mês' }, largura: 45 },
      fundo: { config: { cor: '#0d1b24', cor_2: '#08323d', angulo: 160 }, largura: 100 },
      relogio: { config: { tamanho: 120, cor: '#ffffff', segundos: false }, largura: 30 },
      video: { config: { url: '', ajuste: 'cover' }, largura: 50 },
      desafio: { config: { titulo: 'Desafio' }, largura: 55 },
      sorteio: { config: { titulo: '' }, largura: 60 },
    };
    const fs = stRef.current.fontesPorCena[stRef.current.cenaId ?? ''] ?? [];
    const camadas = fs.map(f => f.camada);
    const camada = tipo === 'fundo' ? Math.min(0, ...camadas) - 1 : Math.max(0, ...camadas) + 1;
    const f = fonte(tipo, { ...padroes[tipo].config }, 50, 50, padroes[tipo].largura, camada);
    mexerFontes(a => [...a, f]);
    empilhar({ tipo: 'criar', ids: [f.id], rotulo: `adicionar ${tipo}` });
    return f.id;
  }, [mexerFontes, empilhar]);

  const adicionarTemplate = useCallback(async (template: Template) => {
    const fs = stRef.current.fontesPorCena[stRef.current.cenaId ?? ''] ?? [];
    const camadas = fs.map(f => f.camada);
    const topo = fs.length ? Math.max(...camadas) : 0;
    const base = fs.length ? Math.min(...camadas) : 0;
    const novas = template.fontes.map((t, i) => fonte(t.tipo, { ...t.config }, t.x, t.y, t.largura,
      (t.camada ?? 0) < 0 ? base + (t.camada ?? 0) : topo + 1 + i, t.escala ?? 1));
    mexerFontes(a => [...a, ...novas]);
    empilhar({ tipo: 'criar', ids: novas.map(n => n.id), rotulo: `adicionar «${template.nome}»` });
    return novas[novas.length - 1]?.id;
  }, [mexerFontes, empilhar]);

  const removerFonte = useCallback(async (id: string) => {
    const s = stRef.current;
    const f = (s.fontesPorCena[s.cenaId ?? ''] ?? []).find(x => x.id === id);
    if (!f || !s.cenaId) return;
    empilhar({ tipo: 'remover', fonte: f, cenaId: s.cenaId, rotulo: 'remover fonte' });
    mexerFontes(a => a.filter(x => x.id !== id));
  }, [mexerFontes, empilhar]);

  const moverCamada = useCallback(async (id: string, d: 'frente' | 'tras') => {
    mexerFontes(fs => {
      const ord = ordenar(fs);
      const i = ord.findIndex(f => f.id === id);
      const j = d === 'frente' ? i + 1 : i - 1;
      if (i < 0 || j < 0 || j >= ord.length) return fs;
      const a = ord[i], b = ord[j];
      return fs.map(f => (f.id === a.id ? { ...f, camada: b.camada } : f.id === b.id ? { ...f, camada: a.camada } : f));
    });
  }, [mexerFontes]);

  const desfazer = useCallback(async () => {
    const a = pilha.current.pop();
    setUltimaAcao(pilha.current[pilha.current.length - 1]?.rotulo ?? null);
    if (!a) return;
    if (a.tipo === 'atualizar') gravar(a.id, a.antes);
    else if (a.tipo === 'criar') mexerFontes(fs => fs.filter(f => !a.ids.includes(f.id)));
    else setSt(s => ({ ...s, fontesPorCena: { ...s.fontesPorCena, [a.cenaId]: [...(s.fontesPorCena[a.cenaId] ?? []), a.fonte] } }));
  }, [gravar, mexerFontes]);

  // ── cenas ─────────────────────────────────────────────────────────────────
  const setCenaId = useCallback((id: string | null) => setSt(s => ({ ...s, cenaId: id })), []);
  const setTelaId = useCallback((id: string) => setSt(s => {
    const t = s.telas.find(x => x.id === id);
    const primeira = s.cenas.filter(c => c.setor_id === t?.setor_id).sort((a, b) => a.ordem - b.ordem)[0];
    return { ...s, telaId: id, cenaId: primeira?.id ?? null };
  }), []);

  const criarCena = useCallback(async (nome: string) => {
    const id = novoId('c');
    setSt(s => {
      const t = s.telas.find(x => x.id === s.telaId)!;
      const ordem = s.cenas.filter(c => c.setor_id === t.setor_id).length;
      const c: Cena = { id, nome: nome.trim() || 'Cena sem nome', ordem, setor_id: t.setor_id, empresa_id: EMPRESA, transicao: 'fade', duracao_s: 15, na_rotacao: false, emergencia: false };
      return { ...s, cenas: [...s.cenas, c], fontesPorCena: { ...s.fontesPorCena, [id]: [] }, cenaId: s.cenaId };
    });
  }, []);
  const renomearCena = useCallback(async (id: string, nome: string) => {
    setSt(s => ({ ...s, cenas: s.cenas.map(c => (c.id === id ? { ...c, nome } : c)) }));
  }, []);
  const apagarCena = useCallback(async (id: string) => {
    setSt(s => ({ ...s, cenas: s.cenas.filter(c => c.id !== id), cenaId: s.cenaId === id ? null : s.cenaId }));
  }, []);
  const atualizarCena = useCallback(async (id: string, m: Partial<Cena>) => {
    setSt(s => ({ ...s, cenas: s.cenas.map(c => (c.id === id ? { ...c, ...m } : c)) }));
  }, []);

  // ── o corte ───────────────────────────────────────────────────────────────
  const aplicarCorte = (s: Store, telaId: string, cenaId: string | null): Store => ({
    ...s, noAr: { ...s.noAr, [telaId]: cenaId ? { cenaId, fontes: clonar(s.fontesPorCena[cenaId] ?? []) } : null },
  });

  const cortar = useCallback(async (alvo?: string | null) => {
    setCortando(true);
    await new Promise(r => setTimeout(r, atrasoCorte.current));
    atrasoCorte.current = 260;
    setSt(s => {
      const cena = alvo === undefined ? s.cenaId : alvo;
      const telas = s.telas.map(t => (t.id === s.telaId ? { ...t, rotacao_ativa: false } : t));
      return aplicarCorte({ ...s, telas }, s.telaId, cena);
    });
    setCortando(false);
  }, []);

  const alternarRotacao = useCallback(async (ativa: boolean) => {
    setSt(s => {
      const telas = s.telas.map(t => (t.id === s.telaId ? { ...t, rotacao_ativa: ativa } : t));
      let novo: Store = { ...s, telas };
      if (ativa) {
        const t = telas.find(x => x.id === s.telaId)!;
        const fila = s.cenas.filter(c => c.setor_id === t.setor_id && c.na_rotacao).sort((a, b) => a.ordem - b.ordem);
        if (fila[0]) novo = aplicarCorte(novo, s.telaId, fila[0].id);
      }
      return novo;
    });
  }, []);

  // A rotação: troca de cena no tempo de cada uma.
  const telaAtiva = st.telas.find(t => t.id === st.telaId);
  const noArAgora = st.noAr[st.telaId]?.cenaId;
  useEffect(() => {
    if (!telaAtiva?.rotacao_ativa) return;
    const s = stRef.current;
    const fila = s.cenas.filter(c => c.setor_id === telaAtiva.setor_id && c.na_rotacao).sort((a, b) => a.ordem - b.ordem);
    if (fila.length < 2) return;
    const i = Math.max(0, fila.findIndex(c => c.id === noArAgora));
    const dur = (window as unknown as { __labRotacaoS?: number }).__labRotacaoS ?? fila[i].duracao_s;
    const t = setTimeout(() => {
      setSt(s2 => aplicarCorte(s2, telaAtiva.id, fila[(i + 1) % fila.length].id));
    }, dur * 1000);
    return () => clearTimeout(t);
  }, [telaAtiva?.rotacao_ativa, telaAtiva?.id, telaAtiva?.setor_id, noArAgora]);

  // ── alerta ────────────────────────────────────────────────────────────────
  const dispararAlerta = useCallback(async (titulo: string, mensagem?: string, midiaUrl?: string, somUrl?: string, duracaoS = 10) => {
    const a: Alerta = { id: novoId('a'), titulo, mensagem: mensagem ?? null, midia_url: midiaUrl ?? null, som_url: somUrl ?? null, duracao_s: duracaoS, criado_em: new Date().toISOString(), resta_s: duracaoS };
    setSt(s => ({ ...s, alertas: [...s.alertas, a] }));
  }, []);
  // Os alertas vivem pelo relógio, como no banco.
  useEffect(() => {
    if (st.alertas.length === 0) return;
    const t = setInterval(() => {
      setSt(s => {
        const vivos = s.alertas.filter(a => Date.now() - new Date(a.criado_em).getTime() < a.duracao_s * 1000);
        return vivos.length === s.alertas.length ? s : { ...s, alertas: vivos };
      });
      setTique(x => x + 1);
    }, 500);
    return () => clearInterval(t);
  }, [st.alertas.length]);
  const alertasVivos: Alerta[] = st.alertas.map(a => ({ ...a, resta_s: a.duracao_s - (Date.now() - new Date(a.criado_em).getTime()) / 1000 }));

  // ── jogos ─────────────────────────────────────────────────────────────────
  const criarSorteio = useCallback(async (tipo: 'roleta' | 'bingo' | 'sorteio', titulo: string, participantes: unknown[] | null, config: Record<string, unknown>) => {
    const lista = (participantes ?? PESSOAS.slice(0, 8).map(p => ({ id: p.id, nome: p.nome, foto_url: p.foto_url }))) as (string | Participante)[];
    setSt(s => ({
      ...s,
      sorteio: { id: novoId('s'), tipo, titulo, participantes: tipo === 'bingo' ? [] : lista, resultado: tipo === 'bingo' ? { numeros: [], rodada: 1 } : { historico: [] }, config: config as DadosSorteio['config'], estado: 'aberto', girado_em: null },
    }));
  }, []);
  const sortear = useCallback(async () => {
    setSt(s => {
      const so = s.sorteio;
      if (!so) return s;
      const em = new Date().toISOString();
      if (so.tipo === 'bingo') {
        const ate = so.config?.ate ?? 75;
        const ja = so.resultado.numeros ?? [];
        let n = proximoIndice.current ?? 1 + Math.floor(Math.random() * ate);
        proximoIndice.current = null;
        while (ja.includes(n)) n = (n % ate) + 1;
        return { ...s, sorteio: { ...so, resultado: { ...so.resultado, numeros: [...ja, n] }, girado_em: em } };
      }
      let participantes = so.participantes;
      const ultimo = so.resultado.ultimo;
      if (ultimo && so.config?.remover_ao_sair) {
        participantes = participantes.filter((_, i) => i !== ultimo.indice);
      }
      const indice = proximoIndice.current ?? Math.floor(Math.random() * participantes.length);
      proximoIndice.current = null;
      const giro = { item: participantes[indice], indice, em };
      return { ...s, sorteio: { ...so, participantes, resultado: { ...so.resultado, ultimo: giro, historico: [...(so.resultado.historico ?? []), giro] }, girado_em: em, estado: 'aberto' } };
    });
  }, []);
  const encerrarBingo = useCallback(async (quem: string) => {
    setSt(s => (s.sorteio ? { ...s, sorteio: { ...s.sorteio, resultado: { ...s.sorteio.resultado, bingo: { quem, em: new Date().toISOString() } } } } : s));
  }, []);
  const reiniciarSorteio = useCallback(async () => {
    setSt(s => (s.sorteio ? { ...s, sorteio: { ...s.sorteio, resultado: s.sorteio.tipo === 'bingo' ? { numeros: [], rodada: (s.sorteio.resultado.rodada ?? 1) + 1 } : { historico: [] } } } : s));
  }, []);

  // ── telas ─────────────────────────────────────────────────────────────────
  const criarTela = useCallback(async (nome: string, slug: string, setorId: string) => {
    const id = novoId('t');
    setSt(s => ({ ...s, telas: [...s.telas, { id, slug: normalizarSlug(slug || nome), nome: nome.trim() || 'Tela sem nome', setor_id: setorId, empresa_id: EMPRESA, ultimo_sinal: null, rotacao_ativa: false }], noAr: { ...s.noAr, [id]: null } }));
  }, []);
  const apagarTela = useCallback(async (id: string) => setSt(s => ({ ...s, telas: s.telas.filter(t => t.id !== id) })), []);
  const renomearTela = useCallback(async (id: string, nome: string) => setSt(s => ({ ...s, telas: s.telas.map(t => (t.id === id ? { ...t, nome } : t)) })), []);

  // ── mídia ─────────────────────────────────────────────────────────────────
  const [enviandoImagem, setEnviando] = useState(false);
  const enviarImagem = useCallback(async (arquivo: File) => {
    setEnviando(true);
    await new Promise(r => setTimeout(r, 400));
    const url = URL.createObjectURL(arquivo);
    const tipo: 'imagem' | 'video' = arquivo.type.startsWith('video') ? 'video' : 'imagem';
    setSt(s => ({ ...s, midias: [...s.midias, { id: novoId('m'), url, caminho: arquivo.name, tipo, nome: arquivo.name }] }));
    setEnviando(false);
    return { url, tipo };
  }, []);
  const soltarArquivo = useCallback(async (arquivo: File, x: number, y: number) => {
    const r = await enviarImagem(arquivo);
    if (!r) return;
    const fs = stRef.current.fontesPorCena[stRef.current.cenaId ?? ''] ?? [];
    const f = fonte(r.tipo, { url: r.url, ajuste: 'cover' }, x, y, 30, Math.max(0, ...fs.map(f => f.camada)) + 1);
    mexerFontes(a => [...a, f]);
    empilhar({ tipo: 'criar', ids: [f.id], rotulo: 'soltar arquivo' });
  }, [enviarImagem, mexerFontes, empilhar]);

  // Ganchos do roteiro de gravação.
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__labTv = {
      proximoIndice: (i: number) => { proximoIndice.current = i; },
      atrasoCorte: (ms: number) => { atrasoCorte.current = ms; },
      receber: (valor: number) => setSt(s => ({ ...s, realizado: s.realizado + valor, hoje: s.hoje + valor })),
    };
  }, []);

  const setores = useMemo(() => [{ id: S4, nome: 'Play 4' }, { id: 'setor-p5', nome: 'Play 5' }, { id: 'setor-rec', nome: 'Receptivo' }], []);

  return {
    empresa: { id: EMPRESA }, telas: st.telas, tela, telaId: st.telaId, setTelaId, setores,
    equipes: [{ id: 'e1', nome: 'Equipe Alfa' }, { id: 'e2', nome: 'Equipe Beta' }],
    criarTela, apagarTela, renomearTela,
    dispararAlerta, alertas: alertasVivos, sorteio: st.sorteio, criarSorteio, sortear, encerrarBingo, reiniciarSorteio,
    pessoasDoSetor: PESSOAS, fontesPorTela,
    cenas, cenaId: st.cenaId, setCenaId, cenaNoArId,
    cenaNoAr: st.cenas.find(c => c.id === cenaNoArId) ?? null,
    fontes, fontesDaPrevia, fontesNoAr,
    carregando: false, erro: null as string | null, limparErro: () => {},
    enviarImagem, enviandoImagem,
    criarCena, renomearCena, apagarCena, atualizarCena,
    adicionarFonte, adicionarTemplate, atualizarFonte, removerFonte, moverFonte, moverCamada,
    redimensionarFonte, desfazer, podeDesfazer: ultimaAcao !== null, ultimaAcao,
    midias: st.midias, soltarArquivo, alternarRotacao,
    cortar, cortando,
    recarregar: async () => {},
  };
}
