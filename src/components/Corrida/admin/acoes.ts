/**
 * acoes.ts — o que o super_admin faz com a corrida (cada função confere de novo
 * no banco: `fn_corrida_exigir_admin`). A gravação acontece aqui, no navegador
 * dele: o motor simula a corrida e grava a festa em vídeo, os arquivos sobem
 * para o bucket `corridas` e o resumo vai para `fn_corrida_gravar`.
 */
import { supabase } from '@/lib/supabase';
import { BUCKET, rpc, type Categoria, type CorridaJson, type EnqueteJson, type PessoaJson } from '../banco';
import { empacotarGravacao } from '../gravacao';
import { empacotarCavalos } from '../cavalos/gravacao';
import { bichinhoDe } from '../motor/bichinhos';
import { SONS } from '../nome';

export interface Painel {
  agora: string;
  corrida: CorridaJson | null;
  pessoas: PessoaJson[];
  historico: Array<{ id: number; nome: string; premio: string | null; estado: string; criada_em: string; vencedor_nome: string | null; categoria?: Categoria }>;
  divulgacoes: Array<{ id: number; titulo: string; criada_em: string; expira_em: string; alvos: number; fecharam: number; categoria?: Categoria }>;
}

/**
 * A categoria só vai na chamada quando é «cavalos»: assim a corrida de bichinhos
 * continua funcionando num banco que ainda não tem a migration 20261022120000.
 */
const comCategoria = (args: Record<string, unknown>, categoria: Categoria) => (categoria === 'cavalos' ? { ...args, p_categoria: categoria } : args);
/** O banco ainda não tem a corrida de cavalos (a função com `p_categoria` não existe). */
export const faltaMigrationCavalos = (e: unknown): boolean => /p_categoria|PGRST202|schema cache|could not find the function/i.test(String(e));

/**
 * Corredor sem perfil no sistema (20261021120000). Sem `id` é novo; com o `id`
 * que o painel devolveu, é o mesmo de antes (guarda o bichinho).
 */
export interface CorredorSemPerfil {
  id?: string;
  nome: string;
  setor: string;
}

export const lerPainel = () => rpc<Painel>('fn_corrida_painel');
export const criarCorrida = (premio: string, corredores: string[], plateia: string[], avulsos: CorredorSemPerfil[], categoria: Categoria = 'bichinhos') =>
  rpc<Painel>('fn_corrida_criar', comCategoria({ p_nome: categoria === 'cavalos' ? 'Corrida de Cavalos' : 'Corrida da Sorte', p_premio: premio, p_corredores: corredores, p_plateia: plateia, p_avulsos: avulsos }, categoria));
export const ajustarCorrida = (id: number, premio: string, corredores: string[], plateia: string[], avulsos: CorredorSemPerfil[]) =>
  rpc<Painel>('fn_corrida_ajustar', { p_corrida: id, p_premio: premio, p_corredores: corredores, p_plateia: plateia, p_avulsos: avulsos });
export const abrirCorrida = (id: number) => rpc<Painel>('fn_corrida_abrir', { p_corrida: id });
export const definirTema = (id: number, tema: string) => rpc<Painel>('fn_corrida_tema', { p_corrida: id, p_tema: tema });
export const preencherEscolhas = (id: number) => rpc<Painel>('fn_corrida_preencher', { p_corrida: id });
export const iniciarCorrida =(id: number) => rpc<Painel>('fn_corrida_iniciar', { p_corrida: id });
export const encerrarCorrida = (id: number, cancelar: boolean) => rpc<Painel>('fn_corrida_encerrar', { p_corrida: id, p_cancelar: cancelar });
export const descartarGravacao = (id: number) => rpc<Painel>('fn_corrida_gravar', { p_corrida: id, p_gravacao: null });
export const divulgar = (titulo: string, mensagem: string, premio: string, alvos: string[], dias: number, categoria: Categoria = 'bichinhos') =>
  rpc<Painel>('fn_corrida_divulgar', comCategoria({ p_titulo: titulo, p_mensagem: mensagem, p_premio: premio, p_alvos: alvos, p_dias: dias }, categoria));
export const tirarDivulgacao = (id: number) => rpc<Painel>('fn_corrida_divulgacao_encerrar', { p_divulgacao: id });

/** A votação de 30 s entre bichinhos e cavalos (20261022130000): o card vai para quem foi chamado. */
export const abrirEnquete = (votantes: string[]) => rpc<{ agora: string; enquete: EnqueteJson }>('fn_corrida_enquete_abrir', { p_votantes: votantes });
/** Depois da contagem: conta os votos (empate vai no sorteio) e avisa cada votante do resultado. */
export const fecharEnquete = (id: number) => rpc<{ agora: string; enquete: EnqueteJson }>('fn_corrida_enquete_fechar', { p_enquete: id });
/** O banco ainda não tem a votação (20261022130000). */
export const faltaMigrationEnquete = (e: unknown): boolean => /fn_corrida_enquete|PGRST202|schema cache|could not find the function/i.test(String(e));

async function subir(caminho: string, dados: Blob | Uint8Array, tipo: string): Promise<void> {
  const corpo = dados instanceof Blob ? dados : new Blob([dados as BlobPart], { type: tipo });
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, corpo, { contentType: tipo, upsert: true, cacheControl: '3600' });
  if (error) throw new Error(`não subiu ${caminho}: ${error.message}`);
}

/**
 * Grava a corrida: simula, grava a festa em vídeo, sobe os arquivos e salva o resumo.
 * `aoProgresso` vai de 0 a 1 (a simulação é a primeira metade, o vídeo a segunda).
 */
export async function gravarCorrida(corrida: CorridaJson, pessoas: PessoaJson[], aoProgresso: (f: number, etapa: string) => void, cancelado: () => boolean): Promise<Painel | null> {
  const corredores = pessoas.filter(p => p.corre);
  // O motor (os mapas, a física, o vídeo) só desce aqui: a aba Geral não carrega nada disso.
  const { criarMotor } = await import('../motor/motor');
  const pista = document.createElement('canvas'), cerimonia = document.createElement('canvas');
  const motor = criarMotor({ pista, cerimonia, sons: SONS });
  try {
    aoProgresso(0, 'Simulando a corrida');
    const r = await motor.gravar({
      pessoas: corredores.map(p => ({ id: p.usuario, nome: p.nome, setor: p.setor, foto: p.foto, est: bichinhoDe(corrida.id, p.usuario, p.escolha) })),
      premio: corrida.premio,
      aoProgresso: f => aoProgresso(f * 0.9, f < 0.5 ? 'Simulando a corrida' : 'Gravando a festa em vídeo'),
      cancelado,
    });
    if (!r || cancelado()) return null;
    aoProgresso(0.9, 'Enviando os arquivos');
    const marca = Date.now().toString(36);
    const arquivo = `${corrida.id}/${marca}-corrida.bin`;
    await subir(arquivo, empacotarGravacao(r.rec), 'application/octet-stream');
    let video: string | null = null, loop: string | null = null;
    if (r.video) {
      video = `${corrida.id}/${marca}-festa.webm`; loop = `${corrida.id}/${marca}-loop.webm`;
      await subir(video, r.video.festa, 'video/webm');
      await subir(loop, r.video.loop, 'video/webm');
    }
    aoProgresso(0.98, 'Salvando');
    const painel = await rpc<Painel>('fn_corrida_gravar', {
      p_corrida: corrida.id,
      p_gravacao: {
        arquivo, video, loop, cues: r.video?.cues ?? [], dur_video: r.video?.dur ?? null,
        mapa: r.mapa, semente: r.semente, faixa: r.faixa, parada: r.parada, vencedor: r.vencedor,
        dur_show: r.durShow, dur_corrida: r.rec.dur,
      },
    });
    aoProgresso(1, 'Pronta');
    return painel;
  } finally {
    motor.destruir();
  }
}

/**
 * Grava a corrida de cavalos: simula (`cavalos/simulacao.js`), sobe as posições
 * e salva o resumo. Não tem vídeo: a festa é desenhada em cada tela. Cada raia
 * é um corredor, na ordem do número do cavalo (`faixa`), e o cavalo de cada
 * raia vai junto (`cavalos`): a tela de quem assiste não depende de já ter
 * recebido o sorteio de quem não escolheu.
 *
 * A lista de quem corre sai do banco na hora (`preencherEscolhas`, que antes
 * sorteia um cavalo livre para quem não escolheu): a da tela pode estar uns
 * segundos atrasada, e um corredor sem cavalo nela tiraria uma raia da gravação.
 */
export async function gravarCorridaCavalos(corrida: CorridaJson, aoProgresso: (f: number, etapa: string) => void, cancelado: () => boolean): Promise<Painel | null> {
  aoProgresso(0.05, 'Sorteando cavalo para quem não escolheu');
  const { pessoas } = await preencherEscolhas(corrida.id);
  const corredores = pessoas.filter(p => p.corre && p.escolha != null).sort((a, b) => (a.escolha ?? 0) - (b.escolha ?? 0));
  if (corredores.length < 2) throw new Error('A corrida precisa de pelo menos 2 cavalos com dono.');
  if (corredores.length !== pessoas.filter(p => p.corre).length) throw new Error('Ainda tem quem corre sem cavalo: preencha antes de gravar.');
  // Um cavalo, um dono: o banco já garante (CAVALO_TEM_DONO); aqui é a última conferência antes de gravar.
  if (new Set(corredores.map(p => p.escolha)).size !== corredores.length) throw new Error('Dois corredores com o mesmo cavalo: descarte e chame de novo.');
  if (cancelado()) return null;
  aoProgresso(0.1, 'Simulando a corrida');
  const { simular } = await import('../cavalos/simulacao.js');
  const semente = crypto.getRandomValues(new Uint32Array(1))[0];
  const rec = simular(semente, corredores.length);
  if (cancelado()) return null;
  aoProgresso(0.6, 'Enviando o arquivo');
  const arquivo = `${corrida.id}/${Date.now().toString(36)}-cavalos.bin`;
  await subir(arquivo, empacotarCavalos(rec), 'application/octet-stream');
  if (cancelado()) return null;
  aoProgresso(0.9, 'Salvando');
  const painel = await rpc<Painel>('fn_corrida_gravar', {
    p_corrida: corrida.id,
    p_gravacao: {
      // O cenário sai do número da corrida, em cada tela (`corrida-cavalos.html`); a chave fica pelo contrato.
      arquivo, mapa: 'da-corrida', semente, faixa: corredores.map(p => p.usuario), cavalos: corredores.map(p => p.escolha), parada: 0,
      vencedor: corredores[rec.vencedor].usuario, dur_corrida: rec.dur, categoria: 'cavalos',
    },
  });
  aoProgresso(1, 'Pronta');
  return painel;
}
