/** Os textos dos avisos — pagamento, saída, metas e equipe (visual de 30/09/2026: sem emoji, ícone por tipo). */
import { describe, it, expect } from 'vitest';
import {
  faixasBatidas, horaCheia, montarAvisos, montarAvisosDeSaida, montarAvisosMetaEquipe,
  montarAvisosMetaOperador, montarResumosEquipe, primeiroNome,
  type ItemFila, type OperadorNaMeta,
} from '../../../supabase/functions/enviar-push/texto';

const it_ = (id: number, valor: number, detalhe: string | null, cliente = 'MARIA SILVA', forma = 'boleto_pix', perfil = 'ana', codigo: string | null = null): ItemFila =>
  ({ id, perfil_id: perfil, valor, forma_pagamento: forma, forma_detalhe: detalhe, nome_cliente: cliente, codigo });

const nbsp = (s: string) => s.replace(/\u00a0/g, ' ');

describe('montarAvisos', () => {
  it('até o corte: um aviso por pagamento — cliente e NR, embaixo forma e valor', () => {
    const [r] = montarAvisos([
      it_(1, 350, 'Pix', 'MARIA SILVA', 'boleto_pix', 'ana', '12345'),
      it_(2, 520, 'Boleto', '98765 - JOAO SOUZA', 'boleto_pix', 'ana', '98765'),
    ], {}, 3);
    expect(r.avisos).toHaveLength(2);
    expect(r.avisos[0]).toMatchObject({ titulo: 'Pagamento recebido', icone: 'pagamento' });
    expect(nbsp(r.avisos[0].corpo)).toBe('Maria S. · NR 12345\nPix · R$ 350,00');
    // O código grudado no nome sai do nome; fica só no NR.
    expect(nbsp(r.avisos[1].corpo)).toBe('Joao S. · NR 98765\nBoleto · R$ 520,00');
    expect(r.ids).toEqual([1, 2]);
  });

  it('acima do corte: um resumo com total, formas no plural e o recebido do mês', () => {
    const itens = [it_(1, 100, 'Pix'), it_(2, 200, 'Pix'), it_(3, 300, 'Pix'), it_(4, 400, 'Pix'), it_(5, 500, 'Boleto'), it_(6, 640, 'Boleto')];
    const [r] = montarAvisos(itens, { ana: { em_ho: false, antes: 36_280.5, depois: 38_420.5, degraus: [] } }, 3);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0].titulo).toBe('6 pagamentos recebidos');
    expect(nbsp(r.avisos[0].corpo)).toBe('R$ 2.140,00 · 4 Pix, 2 boletos\nNo mês: R$ 38.420,50');
    expect(r.ids).toHaveLength(6);
  });

  it('PaguePlay sem detalhe: «Pix/Boleto»; fila antiga sem NR', () => {
    const [r] = montarAvisos([it_(1, 1000, null)], {}, 3);
    expect(nbsp(r.avisos[0].corpo)).toBe('Maria S.\nPix/Boleto · R$ 1.000,00');
  });

  it('a meta não sai mais do lote de pagamentos (vem de montarAvisosMetaOperador)', () => {
    const [r] = montarAvisos([it_(1, 650, 'Pix')],
      { ana: { em_ho: false, antes: 900, depois: 1550, degraus: [1000, 1500, 2000] } }, 3);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0].icone).toBe('pagamento');
  });

  it('separa por pessoa; nenhum texto com emoji', () => {
    const r = montarAvisos([it_(1, 10, 'Pix', 'A', 'boleto_pix', 'ana'), it_(2, 20, 'Pix', 'B', 'boleto_pix', 'bia')], {}, 3);
    expect(r.map(x => x.perfilId).sort()).toEqual(['ana', 'bia']);
    for (const p of r) for (const a of p.avisos) expect(a.titulo + a.corpo).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('faixasBatidas', () => {
  it('conta degraus alcançados', () => {
    expect(faixasBatidas(1550, [1000, 1500, 2000])).toBe(2);
    expect(faixasBatidas(999.99, [1000])).toBe(0);
    expect(faixasBatidas(1000, [1000])).toBe(1);
  });
});

describe('montarAvisosDeSaida', () => {
  const s_ = (id: number, valor: number, codigo = '222', perfil = 'ana') =>
    ({ id, perfil_id: perfil, valor, forma_pagamento: 'boleto_pix', forma_detalhe: null,
       nome_cliente: '222 - MARIA SILVA', codigo, motivo: 'transferido' });

  it('um aviso por pagamento: cliente, NR, valor e o recebido de hoje', () => {
    const [r] = montarAvisosDeSaida([s_(4, 200)], { ana: { em_ho: false, hoje: 100, mes: 3100 } }, 3);
    expect(r.avisos[0]).toMatchObject({ titulo: 'Pagamento retirado do recebimento', icone: 'saida' });
    expect(nbsp(r.avisos[0].corpo)).toBe('Maria S. · NR 222 · R$ 200,00\nRecebido hoje: R$ 100,00');
    expect(r.ids).toEqual([4]);
  });

  it('PaguePlay: o «hoje» diz que é H.O.', () => {
    const [r] = montarAvisosDeSaida([s_(4, 200)], { ana: { em_ho: true, hoje: 25, mes: 700 } }, 3);
    expect(nbsp(r.avisos[0].corpo)).toContain('Recebido hoje (H.O.): R$ 25,00');
  });

  it('acima do corte: um resumo com o total que saiu, hoje e mês', () => {
    const itens = [1, 2, 3, 4].map(i => s_(i, 100, String(i)));
    const [r] = montarAvisosDeSaida(itens, { ana: { em_ho: false, hoje: 50, mes: 900 } }, 3);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0].titulo).toBe('4 pagamentos retirados do recebimento');
    expect(nbsp(r.avisos[0].corpo)).toBe('R$ 400,00 no total\nRecebido hoje: R$ 50,00 · no mês: R$ 900,00');
  });
});

describe('metas alcançadas (20260930195304)', () => {
  const op = (faixa: number, extra: Partial<OperadorNaMeta> = {}): OperadorNaMeta => ({
    perfil_id: 'maria', nome: 'MARIA DA SILVA', mes: '2026-09', faixa, proprio: true,
    equipes: [{ equipe_id: 'e1', equipe_nome: 'Equipe Bryan', destinatarios: ['lider', 'elite'] }],
    ...extra,
  });
  const de = (r: ReturnType<typeof montarAvisosMetaOperador>, id: string) => r.find(p => p.perfilId === id)?.avisos ?? [];

  it('1ª meta: a pessoa recebe os parabéns pelo primeiro nome', () => {
    const r = montarAvisosMetaOperador([op(1)]);
    expect(de(r, 'maria')).toEqual([{
      titulo: 'Parabéns, Maria', corpo: 'Você alcançou a 1ª meta do mês.',
      tag: 'meta:maria:2026-09:1', url: '/#/m', icone: 'meta',
    }]);
  });

  it('da 2ª em diante: só «Você alcançou a 2ª meta!»', () => {
    const [a] = de(montarAvisosMetaOperador([op(2)]), 'maria');
    expect(a).toMatchObject({ titulo: 'Você alcançou a 2ª meta!', corpo: '', icone: 'meta' });
  });

  it('quem lidera (e o elite que ligou) recebe o nome abreviado e a equipe, sem valor', () => {
    const r = montarAvisosMetaOperador([op(1)]);
    for (const id of ['lider', 'elite']) {
      expect(de(r, id)).toEqual([{
        titulo: 'Maria S. alcançou a 1ª meta', corpo: 'Equipe Bryan',
        tag: 'meta-op:maria:2026-09:1', url: '/#/m/equipe?equipe=e1&aba=quartis', icone: 'operador',
      }]);
    }
  });

  it('sem aparelho: só quem lidera; líder de duas equipes da pessoa recebe um aviso só', () => {
    const r = montarAvisosMetaOperador([op(1, {
      proprio: false,
      equipes: [
        { equipe_id: 'e1', equipe_nome: 'Equipe Bryan', destinatarios: ['lider'] },
        { equipe_id: 'e2', equipe_nome: 'Equipe Clone', destinatarios: ['lider', 'maria'] },
      ],
    })]);
    expect(de(r, 'maria')).toEqual([]);
    expect(de(r, 'lider')).toHaveLength(1);
  });

  it('primeiro nome capitalizado', () => {
    expect(primeiroNome('JOAO PEDRO SOUZA')).toBe('Joao');
    expect(primeiroNome(null)).toBe('');
  });
});

describe('avisos da equipe (20260930192744)', () => {
  it('equipe alcançou a meta: só os destinatários (líder e quem ligou), sem valores', () => {
    const r = montarAvisosMetaEquipe([{
      equipe_id: 'e1', equipe_nome: 'Equipe Bryan', mes: '2026-09', destinatarios: ['lider', 'elite'],
    }]);
    expect(r.map(p => p.perfilId).sort()).toEqual(['elite', 'lider']);
    expect(r[0].avisos).toEqual([{
      titulo: 'Equipe Bryan alcançou a meta',
      corpo: 'Parabéns! Meta do mês concluída.',
      tag: 'meta-equipe:e1:2026-09',
      url: '/#/m/equipe?equipe=e1',
      icone: 'equipe',
    }]);
  });

  it('resumo por hora: quanto entrou, a janela e o recebido de hoje', () => {
    const [r] = montarResumosEquipe([{
      equipe_id: 'e1', equipe_nome: 'Equipe Bryan', dia: '2026-09-30',
      novo: 3200, qtd_novos: 8, hoje: '12400.5',
      desde: '2026-09-30T17:00:04Z', ate: '2026-09-30T18:00:03Z', destinatarios: ['lider', 'lider'],
    }]);
    expect(r.perfilId).toBe('lider');
    expect(r.avisos).toHaveLength(1);
    expect(nbsp(r.avisos[0].titulo)).toBe('Equipe Bryan · R$ 3.200,00');
    expect(nbsp(r.avisos[0].corpo)).toBe('8 pagamentos das 14h às 15h\nRecebido hoje: R$ 12.400,50');
    expect(r.avisos[0]).toMatchObject({ url: '/#/m/equipe?equipe=e1&aba=hoje', icone: 'resumo' });
  });

  it('primeiro resumo do dia, um pagamento; nada quando não entrou nada', () => {
    const base = { equipe_id: 'e1', equipe_nome: 'Equipe Bryan', dia: '2026-09-30', hoje: 350, ate: '2026-09-30T12:59:40Z', destinatarios: ['l'] };
    const [r] = montarResumosEquipe([{ ...base, novo: 350, qtd_novos: 1, desde: null }]);
    expect(nbsp(r.avisos[0].corpo)).toBe('1 pagamento até as 10h\nRecebido hoje: R$ 350,00');
    expect(montarResumosEquipe([{ ...base, novo: 0, qtd_novos: 0, desde: null }])).toEqual([]);
  });

  it('hora cheia em São Paulo, arredondada', () => {
    expect(horaCheia('2026-09-30T17:29:00Z')).toBe('14h');
    expect(horaCheia('2026-09-30T17:31:00Z')).toBe('15h');
    expect(horaCheia('2026-10-01T02:45:00Z')).toBe('0h');
  });
});

describe('sw.js', () => {
  it('só aceita ícones conhecidos, e cada um existe em public/icons/avisos', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const raiz = path.resolve(__dirname, '../../../public');
    const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
    const lista = /const ICONES = \[([^\]]+)\]/.exec(sw)?.[1].match(/'([a-z]+)'/g)?.map(x => x.slice(1, -1)) ?? [];
    expect(lista.sort()).toEqual(['equipe', 'meta', 'operador', 'pagamento', 'resumo', 'saida']);
    for (const k of lista) expect(fs.existsSync(path.join(raiz, 'icons', 'avisos', `${k}.png`))).toBe(true);
  });
});
