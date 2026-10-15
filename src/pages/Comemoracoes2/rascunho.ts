/**
 * rascunho.ts — a comemoração que está sendo montada no estúdio.
 *
 * Um objeto só, em vez de quinze `useState` espalhados: o "Duplicar" do
 * histórico, o "Usar" de quem bateu a meta e o "Recomeçar" trocam o rascunho
 * inteiro de uma vez, e a validação lê tudo de um lugar.
 *
 * Puro, sem React: as regras de "dá para enviar?" e "quem vai ver?" têm teste.
 */
import type {
  AlvoTipo, Comemoracao, PessoaComemoracao,
} from '@/services/comemoracoes.service';
import { MAX_HOMENAGEADOS } from '@/services/comemoracoes.service';
import type { MidiaComemoracao } from '@/services/comemoracaoMidias.service';
import { somValido, type SomId } from '@/pages/Comemoracoes/catalogo';
import { VOLUME_PADRAO } from '@/pages/Comemoracoes/volume';
import {
  aplicarModelo, designPadrao, type DesignCard,
} from '@/components/comemoracao2/design';

export const TITULO_PADRAO = 'META BATIDA!';
export const MAX_TITULO = 48;
export const MAX_MENSAGEM = 160;
export const DURACAO_PADRAO_S = 15;

export interface Rascunho {
  titulo:        string;
  mensagem:      string;
  design:        DesignCard;
  alvoTipo:      AlvoTipo;
  escolhidos:    PessoaComemoracao[];
  equipeId:      string;
  setorId:       string;
  somenteEquipe: boolean;
  som:           SomId;
  /** Música da empresa no lugar do som do catálogo. */
  musica:        MidiaComemoracao | null;
  volume:        number;
  duracaoS:      number;
  agendar:       boolean;
  /** `datetime-local`: 'yyyy-MM-ddTHH:mm', no fuso do navegador. */
  quando:        string;
}

/** `datetime-local` quer o fuso LOCAL, não ISO em UTC. */
export function paraInputLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function rascunhoInicial(agora = new Date()): Rascunho {
  return {
    titulo:        TITULO_PADRAO,
    mensagem:      '',
    design:        designPadrao(),
    alvoTipo:      'operadores',
    escolhidos:    [],
    equipeId:      '',
    setorId:       '',
    somenteEquipe: false,
    som:           'conquista',
    musica:        null,
    volume:        VOLUME_PADRAO,
    duracaoS:      DURACAO_PADRAO_S,
    agendar:       false,
    quando:        paraInputLocal(new Date(agora.getTime() + 10 * 60_000)),
  };
}

/**
 * "Duplicar" do histórico: a comemoração vira rascunho de novo.
 *
 * Volta sem data (comemorar de novo é agora, por padrão) e, se for da 1.0,
 * ganha o card 2.0 de fábrica com o mesmo texto e as mesmas pessoas.
 */
export function rascunhoDeComemoracao(
  c: Comemoracao,
  musicas: MidiaComemoracao[],
  agora = new Date(),
): Rascunho {
  const base = rascunhoInicial(agora);
  return {
    ...base,
    titulo:        c.titulo.slice(0, MAX_TITULO),
    mensagem:      (c.mensagem ?? '').slice(0, MAX_MENSAGEM),
    design:        c.design ?? base.design,
    alvoTipo:      c.alvo_tipo,
    escolhidos:    c.alvo_tipo === 'operadores' ? c.homenageados.slice(0, MAX_HOMENAGEADOS) : [],
    equipeId:      c.equipe_id ?? '',
    setorId:       c.setor_id ?? '',
    somenteEquipe: c.somente_equipe,
    som:           somValido(c.som),
    musica:        c.som_midia_id ? musicas.find((m) => m.id === c.som_midia_id) ?? null : null,
    volume:        c.volume,
    duracaoS:      c.duracao_s,
  };
}

/**
 * O "pre-save" de meta batida da 2.0: fundo dourado, letra de impacto, selo
 * com o mês e a pessoa já escolhida. O resto do rascunho (som, volume,
 * duração) fica como está.
 */
export function rascunhoMetaBatida(
  atual: Rascunho,
  pessoa: PessoaComemoracao & { pct?: number },
  nomeDoMes: string,
): Rascunho {
  const nome = pessoa.nome.trim().split(/\s+/)[0] ?? pessoa.nome;
  const pct = pessoa.pct && pessoa.pct > 100 ? `${pessoa.pct}% da meta` : 'a meta';
  const design = aplicarModelo({
    ...atual.design,
    papel:   'ouro-real',
    fonte:   'impacto',
    entrada: 'impacto',
    efeito:  'confete',
    selo:    `Meta de ${nomeDoMes}`.toUpperCase(),
  }, 'classico');
  return {
    ...atual,
    titulo:     TITULO_PADRAO,
    mensagem:   `${nome} bateu ${pct}! Dedicação que inspira o time todo.`.slice(0, MAX_MENSAGEM),
    design:     { ...design, gif: atual.design.gif },
    alvoTipo:   'operadores',
    escolhidos: [{ id: pessoa.id, nome: pessoa.nome, foto_url: pessoa.foto_url }],
    equipeId:   '',
    setorId:    '',
    agendar:    false,
  };
}

/** O que ainda falta para dar para enviar. Vazio = pronto. */
export function pendencias(r: Rascunho, erroAgendamento: string | null): string[] {
  const falta: string[] = [];
  if (!r.titulo.trim()) falta.push('Escreva o título.');
  if (r.alvoTipo === 'operadores' && r.escolhidos.length === 0) falta.push('Escolha quem bateu a meta.');
  if (r.alvoTipo === 'equipe' && !r.equipeId) falta.push('Escolha a equipe.');
  if (r.alvoTipo === 'setor' && !r.setorId) falta.push('Escolha o setor.');
  if (r.agendar && erroAgendamento) falta.push(erroAgendamento);
  return falta;
}

// ── Plateia ──────────────────────────────────────────────────────────────────

export interface PessoaDaPlateia {
  id:        string;
  setor_id:  string | null;
  equipe_id: string | null;
}

/**
 * Quantas pessoas devem ver a festa — o "vai aparecer para N pessoas" do
 * estúdio, para ninguém disparar para a empresa inteira sem querer.
 *
 * É uma ESTIMATIVA feita no navegador, pela mesma régua do banco
 * (`REGRAS-DE-NEGOCIO.md` §13.4-b): setor = empresa inteira; equipe = setor
 * da equipe (ou só a equipe); pessoas = setor de cada uma (ou só a equipe de
 * cada uma). Clones e líderes de outras equipes podem somar alguns a mais —
 * daí a tela dizer "cerca de".
 */
export function contarPlateia(
  r: Pick<Rascunho, 'alvoTipo' | 'escolhidos' | 'equipeId' | 'setorId' | 'somenteEquipe'>,
  pessoas: PessoaDaPlateia[],
  equipes: { id: string; setor_id: string | null }[],
): number {
  if (r.alvoTipo === 'setor') return r.setorId ? pessoas.length : 0;

  if (r.alvoTipo === 'equipe') {
    if (!r.equipeId) return 0;
    if (r.somenteEquipe) return pessoas.filter((p) => p.equipe_id === r.equipeId).length;
    const setor = equipes.find((e) => e.id === r.equipeId)?.setor_id ?? null;
    return setor ? pessoas.filter((p) => p.setor_id === setor).length : 0;
  }

  const porId = new Map(pessoas.map((p) => [p.id, p]));
  const escolhidos = r.escolhidos.map((e) => porId.get(e.id)).filter((p): p is PessoaDaPlateia => !!p);
  if (r.somenteEquipe) {
    const eqs = new Set(escolhidos.map((p) => p.equipe_id).filter(Boolean));
    const vistos = new Set(pessoas.filter((p) => p.equipe_id && eqs.has(p.equipe_id)).map((p) => p.id));
    for (const p of escolhidos) vistos.add(p.id);
    return vistos.size;
  }
  const setores = new Set(escolhidos.map((p) => p.setor_id).filter(Boolean));
  const vistos = new Set(pessoas.filter((p) => p.setor_id && setores.has(p.setor_id)).map((p) => p.id));
  for (const p of escolhidos) vistos.add(p.id);
  return vistos.size;
}
