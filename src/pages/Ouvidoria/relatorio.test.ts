import { describe, expect, it } from 'vitest';
import type { Manifestacao } from './ouvidoria';
import { intervaloDe, relatorio } from './relatorio';

const base = {
  id: '1', empresa_id: 'e', setor_id: 's', numero: 1, codigo: 'OUV-00001', data_manifestacao: '2026-11-03',
  canal: 'telefone', nome_profissional: 'X', codigo_cliente: null, conselho_uf: null, assunto: 'operador',
  descricao: 'x', anuidades: [], situacao_financeira: null, providencia: null, responsavel_id: null,
  responsavel_nome: null, data_resposta: null, status: 'aberto', acompanhar: true, observacoes: null,
  criado_por: 'ana', criado_por_nome: 'Ana', criado_em: '', atualizado_por_nome: null, atualizado_em: '',
} as Manifestacao;
const m = (o: Partial<Manifestacao>): Manifestacao => ({ ...base, ...o });

describe('relatório da Ouvidoria', () => {
  it('períodos', () => {
    expect(intervaloDe('mes', '2026-11-09')).toEqual({ de: '2026-11-01', ate: '2026-11-09' });
    expect(intervaloDe('mes_passado', '2026-01-15')).toEqual({ de: '2025-12-01', ate: '2025-12-31' });
    expect(intervaloDe('90d', '2026-11-09')).toEqual({ de: '2026-08-12', ate: '2026-11-09' });
    expect(intervaloDe('tudo', '2026-11-09')).toEqual({ de: null, ate: null });
  });

  it('números do período, retorno em dias úteis e retrato de hoje', () => {
    const lista = [
      // 30/10 (sex) → 04/11 (qua): 03 e 04 úteis (02/11 é feriado) = 2 dias úteis; fora do mês.
      m({ id: 'a', data_manifestacao: '2026-10-30', data_resposta: '2026-11-04', status: 'concluido' }),
      // 03/11 → 05/11 = 2 dias úteis; no mês.
      m({ id: 'b', data_manifestacao: '2026-11-03', data_resposta: '2026-11-05', assunto: 'chatplay', canal: 'whatsapp' }),
      m({ id: 'c', data_manifestacao: '2026-11-02', responsavel_id: 'fabio', responsavel_nome: 'Fábio', ticket_status: 'pendente' }),
      m({ id: 'd', data_manifestacao: '2026-11-04', acompanhar: false, status: 'concluido' }),
    ];
    const r = relatorio(lista, 'mes', '2026-11-09');
    expect(r.registradas).toBe(3);
    expect(r.acompanhadas).toBe(2);
    expect(r.taxaRetorno).toBe(50);
    expect(r.mediaDiasRetorno).toBe(2);
    expect(r.abertasAgora).toBe(2); // b e c — retrato de hoje, sem período
    expect(r.ticketsPendentes).toBe(1);
    expect(r.porAssunto).toEqual([
      { chave: 'operador', rotulo: 'Operador', valor: 2 },
      { chave: 'chatplay', rotulo: 'ChatPlay', valor: 1 },
    ]);
    expect(r.porEncaminhado).toEqual([{ chave: 'Fábio', rotulo: 'Fábio', valor: 1 }]);
    expect(r.porMes.map(f => f.valor)).toEqual([0, 0, 0, 0, 1, 3]);
    expect(r.porMes.at(-1)?.rotulo).toBe('nov/26');
  });
});
