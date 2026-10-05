/** O aviso de mensagem nova do chat no celular (05/10/2026). */
import { describe, it, expect } from 'vitest';
import {
  montarAvisosChat, previaDoChat, type ItemChat,
} from '../../../supabase/functions/enviar-push/texto';

const item = (parcial: Partial<ItemChat> = {}): ItemChat => ({
  perfil_id: 'ana', conversa_id: 'c1', conversa_tipo: 'direta', conversa_nome: null,
  autor_nome: 'Bruno Lima', autor_foto: 'https://x.supabase.co/storage/v1/object/public/perfis/b.jpg',
  texto: 'Oi, tudo bem?', tem_cpf: false, anexos: [], nao_lidas: 1, ...parcial,
});

describe('previaDoChat', () => {
  it('texto: limpa espaços e corta mensagem longa', () => {
    expect(previaDoChat(item({ texto: '  oi   tudo\nbem ' }))).toBe('oi tudo bem');
    const longa = previaDoChat(item({ texto: 'a'.repeat(300) }));
    expect(longa.length).toBe(120);
    expect(longa.endsWith('…')).toBe(true);
  });

  it('com CPF o texto não vai para a tela de bloqueio', () => {
    expect(previaDoChat(item({ texto: 'CPF 123.456.789-00', tem_cpf: true }))).toBe('Nova mensagem');
  });

  it('só anexo: diz o tipo, sem emoji', () => {
    expect(previaDoChat(item({ texto: null, anexos: [{ tipo: 'image/jpeg' }] }))).toBe('Foto');
    expect(previaDoChat(item({ texto: null, anexos: [{ tipo: 'audio/webm' }] }))).toBe('Áudio');
    expect(previaDoChat(item({ texto: null, anexos: [{ tipo: 'video/mp4' }] }))).toBe('Vídeo');
    expect(previaDoChat(item({ texto: null, anexos: [{ tipo: 'application/pdf', nome: 'boleto.pdf' }] }))).toBe('Arquivo: boleto.pdf');
    expect(previaDoChat(item({ texto: null, anexos: [{ tipo: 'image/png' }, { tipo: 'image/png' }] }))).toBe('2 arquivos');
  });
});

describe('montarAvisosChat', () => {
  it('conversa direta: nome no título, etiqueta e link da conversa, foto de quem mandou', () => {
    const [r] = montarAvisosChat([item()]);
    expect(r.perfilId).toBe('ana');
    expect(r.avisos).toEqual([{
      titulo: 'Bruno Lima',
      corpo: 'Oi, tudo bem?',
      tag: 'chat:c1',
      url: '/#/m?chat=c1',
      foto: 'https://x.supabase.co/storage/v1/object/public/perfis/b.jpg',
    }]);
  });

  it('grupo: «Fulano · Grupo»; várias não lidas aparecem embaixo', () => {
    const [r] = montarAvisosChat([item({ conversa_tipo: 'grupo', conversa_nome: 'Equipe Bruna', nao_lidas: 4 })]);
    expect(r.avisos[0].titulo).toBe('Bruno · Equipe Bruna');
    expect(r.avisos[0].corpo).toBe('Oi, tudo bem?\n4 mensagens não lidas');
  });

  it('sem foto, ou foto fora de https: o aviso usa o ícone do app', () => {
    expect(montarAvisosChat([item({ autor_foto: null })])[0].avisos[0]).not.toHaveProperty('foto');
    expect(montarAvisosChat([item({ autor_foto: 'http://x/y.jpg' })])[0].avisos[0]).not.toHaveProperty('foto');
  });

  it('uma pessoa em duas conversas recebe dois avisos, um por conversa', () => {
    const [r] = montarAvisosChat([item(), item({ conversa_id: 'c2', autor_nome: 'Carla' })]);
    expect(r.avisos.map(a => a.tag)).toEqual(['chat:c1', 'chat:c2']);
  });
});
