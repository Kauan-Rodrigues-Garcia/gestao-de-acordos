/**
 * Dados FICTÍCIOS do Desafio do Vale, para o «Ver como» do super_admin
 * (23/11/2026): «como se já batessem, já tivessem cupons», para ver o visual
 * de cada situação sem esperar o dado real. Nada daqui vai para o banco.
 */
import { listarDiasUteisIntervalo } from '@/lib/diasUteis';
import { metaDoOperadorNoDesafio } from '@/lib/desafioMediaOperador';
import { montarSetorNoDesafio, type SetorNoDesafio } from '@/services/desafioCobranca/equipeNoDesafio';
import type { DesafioVale, PessoaNoRanking, PixDoCupom, RankingDoVale } from './desafioVale.service';
import { contarCupons, cuponsPorOperador, diasDoPeriodo, type CuponsDoPix, type MetaNoVale } from './regras';

export interface Ficticio {
  /** Quantas médias a pessoa simulada fez. */
  medias: number;
  aprovados: number;
  pendentes: number;
}

/** A média diária fictícia quando a pessoa não tem a real (ou nenhuma foi escolhida). */
const MEDIA_FICTICIA = 10_000;
const DIAS_UTEIS_FICTICIOS = 19;

/** Espalha `total` pelos dias úteis do desafio até `hoje` (ao menos o 1º dia). */
function espalhar(d: Pick<DesafioVale, 'inicio' | 'fim'>, total: number, hoje: string): Record<string, number> {
  const ate = hoje < d.inicio ? d.inicio : hoje > d.fim ? d.fim : hoje;
  const uteis = listarDiasUteisIntervalo(d.inicio, ate);
  const dias = uteis.length ? uteis : [d.inicio];
  const parte = Math.round((total / dias.length) * 100) / 100;
  const saida: Record<string, number> = {};
  dias.forEach((dia, i) => {
    saida[dia] = i === dias.length - 1 ? Math.round((total - parte * (dias.length - 1)) * 100) / 100 : parte;
  });
  return saida;
}

/** As médias da pessoa como se ela tivesse feito `medias`. Usa a média real dela, se houver. */
export function metaFicticia(
  d: Pick<DesafioVale, 'inicio' | 'fim' | 'medias'>, medias: number, hoje: string, real?: MetaNoVale | null,
): MetaNoVale {
  const mediaDiaria = real && real.mediaDiaria > 0 ? real.mediaDiaria : MEDIA_FICTICIA;
  const diasUteisMes = real && real.diasUteisMes > 0 ? real.diasUteisMes : DIAS_UTEIS_FICTICIOS;
  const metaMensal = mediaDiaria * diasUteisMes;
  const porDia = espalhar(d, Math.round(mediaDiaria * Math.max(0, medias) * 100) / 100, hoje);
  const dias = diasDoPeriodo(d.inicio, d.fim);
  const recebidoPorDia = dias.map(dia => porDia[dia] ?? 0);
  const iHoje = dias.indexOf(hoje) >= 0 ? dias.indexOf(hoje) : hoje < d.inicio ? 0 : dias.length;
  const base = metaDoOperadorNoDesafio({ metaMensal, diasUteisMes, recebidoNoDesafio: recebidoPorDia, hoje: iHoje, fator: d.medias });
  const desde = hoje > d.inicio ? hoje : d.inicio;
  const diasUteisRestantes = desde > d.fim ? 0 : listarDiasUteisIntervalo(desde, d.fim).length;
  return {
    ...base, metaMensal, diasUteisMes, recebidoPorDia, diasUteisRestantes,
    porDiaUtil: base.falta !== null && base.falta > 0 && diasUteisRestantes > 0 ? base.falta / diasUteisRestantes : null,
  };
}

/** Pix fictícios do período: `aprovados` e `pendentes`, com NR de mentira. */
export function pixFicticios(
  d: Pick<DesafioVale, 'cupom_inicio' | 'cupom_fim'>, aprovados: number, pendentes: number, operadorId = 'ficticio', nome = 'Operador fictício',
): PixDoCupom[] {
  const inicio = d.cupom_inicio ?? '2026-11-23';
  const fim = d.cupom_fim ?? inicio;
  const dias = diasDoPeriodo(inicio, fim);
  const linha = (i: number, status: PixDoCupom['status']): PixDoCupom => ({
    id: `${operadorId}-${status}-${i}`, operador_id: operadorId, operador_nome: nome, setor_id: null,
    nr_cliente: String(90000000 + i), status,
    criado_em: `${dias[i % Math.max(dias.length, 1)] ?? inicio}T15:00:00Z`,
  });
  return [
    ...Array.from({ length: Math.max(0, aprovados) }, (_, i) => linha(i, 'aprovado')),
    ...Array.from({ length: Math.max(0, pendentes) }, (_, i) => linha(aprovados + i, 'pendente')),
  ];
}

export function cuponsFicticios(
  d: Pick<DesafioVale, 'cupom_inicio' | 'cupom_fim' | 'cupom_pix'>, f: Pick<Ficticio, 'aprovados' | 'pendentes'>,
): CuponsDoPix & { linhas: PixDoCupom[] } {
  const linhas = pixFicticios(d, f.aprovados, f.pendentes);
  return { linhas, ...contarCupons(linhas, d.cupom_pix) };
}

/**
 * Um setor fictício para a aba Equipes do líder: duas equipes, gente que
 * passou, que bateu, que está perto e que está longe, com cupons variados.
 */
const TIME: { nome: string; equipe: 0 | 1; medias: number; aprovados: number; pendentes: number }[] = [
  { nome: 'Ana (fictícia)', equipe: 0, medias: 11.2, aprovados: 12, pendentes: 0 },
  { nome: 'Bruno (fictício)', equipe: 0, medias: 9.4, aprovados: 7, pendentes: 2 },
  { nome: 'Carla (fictícia)', equipe: 0, medias: 9, aprovados: 3, pendentes: 3 },
  { nome: 'Diego (fictício)', equipe: 0, medias: 8.6, aprovados: 2, pendentes: 1 },
  { nome: 'Elaine (fictícia)', equipe: 0, medias: 5.1, aprovados: 0, pendentes: 2 },
  { nome: 'Fábio (fictício)', equipe: 1, medias: 10, aprovados: 6, pendentes: 0 },
  { nome: 'Gabi (fictícia)', equipe: 1, medias: 7.3, aprovados: 4, pendentes: 4 },
  { nome: 'Hugo (fictício)', equipe: 1, medias: 6.2, aprovados: 1, pendentes: 0 },
  { nome: 'Iara (fictícia)', equipe: 1, medias: 3.4, aprovados: 0, pendentes: 0 },
  { nome: 'João (fictício)', equipe: 1, medias: 0.8, aprovados: 0, pendentes: 1 },
];

export function setorFicticio(
  d: Pick<DesafioVale, 'inicio' | 'fim' | 'medias' | 'cupom_inicio' | 'cupom_fim' | 'cupom_pix'>, hoje: string,
): { setor: SetorNoDesafio; cupons: Map<string, CuponsDoPix>; pix: PixDoCupom[] } {
  const dias = diasDoPeriodo(d.inicio, d.fim);
  const iHoje = dias.indexOf(hoje) >= 0 ? dias.indexOf(hoje) : hoje < d.inicio ? 0 : dias.length - 1;
  const equipes = [{ id: 'ficticia-1', nome: 'Equipe Azul (fictícia)' }, { id: 'ficticia-2', nome: 'Equipe Verde (fictícia)' }];
  const recebido = new Map<string, Record<string, number>>();
  const metaDoMes = new Map<string, number>();
  const pix: PixDoCupom[] = [];
  TIME.forEach((p, i) => {
    const id = `ficticio-${i}`;
    metaDoMes.set(id, MEDIA_FICTICIA * DIAS_UTEIS_FICTICIOS);
    recebido.set(id, espalhar(d, MEDIA_FICTICIA * p.medias, hoje));
    pix.push(...pixFicticios(d, p.aprovados, p.pendentes, id, p.nome));
  });
  // A régua fictícia tem 19 dias úteis: os dois feriados de novembro/2026.
  const feriados = ['2026-11-02', '2026-11-20'];
  const setor = montarSetorNoDesafio({
    regras: { dias, regra_medias: d.medias, regra_medias_maior: d.medias },
    pessoas: TIME.map((p, i) => ({ id: `ficticio-${i}`, nome: p.nome, equipe_id: equipes[p.equipe].id })),
    equipes, metaDoMes, recebido, feriados: () => feriados, hoje: iHoje,
  });
  return { setor, cupons: cuponsPorOperador(pix, d.cupom_pix), pix };
}


/** O ranking fictício (setor sem Pix): o time de mentira, com «você» em 3º. */
export function rankingFicticio(
  d: Pick<DesafioVale, 'cupom_inicio' | 'cupom_fim'>, qtd: number, verTodos: boolean,
): RankingDoVale {
  const lista: PessoaNoRanking[] = TIME
    .map((p, i) => ({ perfil_id: `ficticio-${i}`, nome: i === 2 ? 'Você (fictício)' : p.nome, valor: Math.round(MEDIA_FICTICIA * p.medias * 0.45), posicao: 0, eu: i === 2 }))
    .sort((a, b) => b.valor - a.valor)
    .map((p, i) => ({ ...p, posicao: i + 1 }));
  const corte = lista[Math.min(qtd, lista.length) - 1]?.valor ?? null;
  return {
    setor_id: 'ficticio', qtd, de: d.cupom_inicio ?? '', ate: d.cupom_fim ?? '', pessoas: lista.length, corte,
    topo: lista.filter(p => p.posicao <= qtd), eu: lista.find(p => p.eu) ?? null, todos: verTodos ? lista : null,
  };
}
