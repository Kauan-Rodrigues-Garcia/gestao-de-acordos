/**
 * acoes.ts — o que o super_admin faz com a corrida (cada função confere de novo
 * no banco: `fn_corrida_exigir_admin`). A gravação acontece aqui, no navegador
 * dele: o motor simula a corrida e grava a festa em vídeo, os arquivos sobem
 * para o bucket `corridas` e o resumo vai para `fn_corrida_gravar`.
 */
import { supabase } from '@/lib/supabase';
import { BUCKET, rpc, type CorridaJson, type PessoaJson } from '../banco';
import { empacotarGravacao } from '../gravacao';
import { bichinhoDe } from '../motor/bichinhos';
import { SONS } from '../nome';

export interface Painel {
  agora: string;
  corrida: CorridaJson | null;
  pessoas: PessoaJson[];
  historico: Array<{ id: number; nome: string; premio: string | null; estado: string; criada_em: string; vencedor_nome: string | null }>;
  divulgacoes: Array<{ id: number; titulo: string; criada_em: string; expira_em: string; alvos: number; fecharam: number }>;
}

export const lerPainel = () => rpc<Painel>('fn_corrida_painel');
export const criarCorrida = (premio: string, corredores: string[], plateia: string[]) =>
  rpc<Painel>('fn_corrida_criar', { p_nome: 'Corrida da Sorte', p_premio: premio, p_corredores: corredores, p_plateia: plateia });
export const ajustarCorrida = (id: number, premio: string, corredores: string[], plateia: string[]) =>
  rpc<Painel>('fn_corrida_ajustar', { p_corrida: id, p_premio: premio, p_corredores: corredores, p_plateia: plateia });
export const abrirCorrida = (id: number) => rpc<Painel>('fn_corrida_abrir', { p_corrida: id });
export const definirTema = (id: number, tema: string) => rpc<Painel>('fn_corrida_tema', { p_corrida: id, p_tema: tema });
export const preencherEscolhas = (id: number) => rpc<Painel>('fn_corrida_preencher', { p_corrida: id });
export const iniciarCorrida =(id: number) => rpc<Painel>('fn_corrida_iniciar', { p_corrida: id });
export const encerrarCorrida = (id: number, cancelar: boolean) => rpc<Painel>('fn_corrida_encerrar', { p_corrida: id, p_cancelar: cancelar });
export const descartarGravacao = (id: number) => rpc<Painel>('fn_corrida_gravar', { p_corrida: id, p_gravacao: null });
export const divulgar = (titulo: string, mensagem: string, premio: string, alvos: string[], dias: number) =>
  rpc<Painel>('fn_corrida_divulgar', { p_titulo: titulo, p_mensagem: mensagem, p_premio: premio, p_alvos: alvos, p_dias: dias });
export const tirarDivulgacao = (id: number) => rpc<Painel>('fn_corrida_divulgacao_encerrar', { p_divulgacao: id });

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
