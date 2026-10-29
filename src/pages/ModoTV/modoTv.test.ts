import { describe, expect, it } from 'vitest';
import { destaqueDaTela, montarVisao, moedaTv, nomeCurto, percentualTv, serieAcumulada, tamanhoQueCabe } from './numeros';
import { alvoDoDiaProprio, campoVisivel, midiaSegura, novaTela, opcao, rotuloTempo, segundosDaTela, segundosDoArquivo, telasValidas, templateDe } from './templates';
import { numerosDemo } from './demo';
import { estadoDaTv, situacaoDoPainel } from './apoio';
import { diferencaDoServidor, telaNoInstante } from './relogio';
import type { NumerosTv } from './tipos';

const base = (parcial: Partial<NumerosTv> = {}): NumerosTv => ({ ...numerosDemo(), ...parcial });

describe('montarVisao', () => {
  it('conta falta, fração, ritmo e projeção em bruto', () => {
    const v = montarVisao(base({ meta: 100_000, recebido: 60_000, dias_uteis: 20, dias_decorridos: 15 }), 'bruto');
    expect(v.falta).toBe(40_000);
    expect(v.fracao).toBeCloseTo(0.6);
    expect(v.diasRestantes).toBe(5);
    expect(v.ritmo).toBe(8_000);
    expect(v.projecao).toBe(80_000);
    expect(v.hoje.alvo).toBe(5_000);
    expect(v.batida).toBe(false);
  });

  it('Nosso produto ignora o H.O. do painel', () => {
    const v = montarVisao(base({ regra: 'nosso_produto' }), 'ho');
    expect(v.unidade).toBe('bruto');
  });

  it('Cofen em H.O.: meta convertida pelo percentual da empresa, recebido da coluna H.O.', () => {
    const v = montarVisao(base({ regra: 'cofen', meta: 100_000, recebido_ho: 10_000, ho_percentual: 0.25 }), 'ho');
    expect(v.unidade).toBe('ho');
    expect(v.meta).toBe(25_000);
    expect(v.recebido).toBe(10_000);
    expect(v.falta).toBe(15_000);
  });

  it('percentual inválido volta ao padrão de 22,60%', () => {
    const v = montarVisao(base({ regra: 'cofen', meta: 100_000, ho_percentual: 'lixo' }), 'ho');
    expect(v.meta).toBe(22_600);
  });

  it('meta batida não tem falta nem ritmo', () => {
    const v = montarVisao(base({ meta: 50_000, recebido: 60_000 }), 'bruto');
    expect(v.batida).toBe(true);
    expect(v.falta).toBe(0);
    expect(v.ritmo).toBe(0);
  });

  it('último dia útil: o ritmo é tudo o que falta', () => {
    const v = montarVisao(base({ meta: 100_000, recebido: 90_000, dias_uteis: 20, dias_decorridos: 20 }), 'bruto');
    expect(v.ritmo).toBe(10_000);
  });

  it('alvo manual de hoje substitui a meta ÷ dias úteis', () => {
    const v = montarVisao(base({ recebido_hoje: 1_000 }), 'bruto', 4_000);
    expect(v.hoje.alvo).toBe(4_000);
    expect(v.hoje.falta).toBe(3_000);
  });

  it('pacote torto não quebra a parede', () => {
    const v = montarVisao({ ...base(), meta: undefined, ranking: null, dias_uteis: 'x' } as unknown as NumerosTv, 'bruto');
    expect(v.meta).toBe(0);
    expect(v.fracao).toBe(0);
    expect(v.ranking).toEqual([]);
  });
});

describe('formatos da parede', () => {
  it('dinheiro exato, com centavos', () => {
    expect(moedaTv(1234.99).replace(/\s/g, ' ')).toBe('R$ 1.234,99');
    expect(moedaTv(500000).replace(/\s/g, ' ')).toBe('R$ 500.000,00');
    expect(moedaTv(0.005).replace(/\s/g, ' ')).toBe('R$ 0,01');
  });
  it('o corpo encolhe para o valor caber', () => {
    expect(tamanhoQueCabe('R$ 1.000,00', 2000, 250)).toBe(250);
    expect(tamanhoQueCabe('R$ 1.234.567,89', 1600, 250)).toBeLessThan(250);
  });
  it('percentual cortado, nunca arredondado para 100%', () => {
    expect(percentualTv(0.9996)).toBe('99,9%');
    expect(percentualTv(1.125)).toBe('112,5%');
  });
  it('nome curto', () => {
    expect(nomeCurto('Maria Aparecida Souza')).toBe('Maria Souza');
    expect(nomeCurto(' Ana  Lima ')).toBe('Ana Lima');
  });
});

describe('telas e opções', () => {
  it('descarta tela de template que não existe', () => {
    expect(telasValidas([{ id: 'a', template: 'contagem' }, { id: 'b', template: 'roleta' }, null, 'x'])).toEqual([
      { id: 'a', template: 'contagem', opcoes: {}, segundos: null },
    ]);
  });

  it('opção fora do tipo cai no padrão', () => {
    const t = { template: 'lista' as const, opcoes: { quantidade: '7', mostrar_valor: 'sim', titulo: 42 } };
    expect(opcao(t, 'quantidade')).toBe('5');
    expect(opcao(t, 'mostrar_valor')).toBe(true);
    expect(opcao(t, 'titulo')).toBe('Ranking do mês');
  });

  it('texto é cortado no máximo do campo', () => {
    const t = { template: 'recado' as const, opcoes: { texto: 'x'.repeat(500) } };
    expect(opcao<string>(t, 'texto')).toHaveLength(120);
  });
});

describe('midiaSegura', () => {
  const BASE = 'https://abc.supabase.co';
  it('aceita só o balde tv/paineis do projeto', () => {
    const ok = `${BASE}/storage/v1/object/public/tv/paineis/123/foto.png`;
    expect(midiaSegura(ok, BASE)).toBe(ok);
    expect(midiaSegura(`${BASE}/`, BASE)).toBeNull();
    expect(midiaSegura('https://outro.site/foto.png', BASE)).toBeNull();
    expect(midiaSegura(`${BASE}/storage/v1/object/public/avatars/x.png`, BASE)).toBeNull();
    expect(midiaSegura(`${BASE}/storage/v1/object/public/tv/paineis/../x.png`, BASE)).toBeNull();
    expect(midiaSegura(123, BASE)).toBeNull();
  });
});

describe('estadoDaTv', () => {
  const agora = Date.parse('2026-10-27T12:00:00Z');
  const v1 = '2026-10-27T11:00:00.123456+00:00';
  const v2 = '2026-10-27T11:59:50+00:00';
  const tv = (p: Partial<{ ultimo_sinal: string | null; saiu_em: string | null; versao_exibida: string | null }>) =>
    ({ ultimo_sinal: '2026-10-27T11:59:30Z', saiu_em: null, versao_exibida: v1, ...p });

  it('ligada e em dia', () => {
    expect(estadoDaTv(tv({}), v1, agora)).toBe('em_dia');
  });
  it('ligada com a versão anterior: atualizando', () => {
    expect(estadoDaTv(tv({}), v2, agora)).toBe('atualizando');
  });
  it('sem sinal depois de 75 s', () => {
    expect(estadoDaTv(tv({ ultimo_sinal: '2026-10-27T11:58:40Z' }), v1, agora)).toBe('sem_sinal');
    expect(estadoDaTv(tv({ ultimo_sinal: null }), v1, agora)).toBe('sem_sinal');
  });
  it('página fechada vence o sinal anterior; sinal depois de fechar = reaberta', () => {
    expect(estadoDaTv(tv({ saiu_em: '2026-10-27T11:59:40Z' }), v1, agora)).toBe('fechada');
    expect(estadoDaTv(tv({ saiu_em: '2026-10-27T11:59:00Z' }), v1, agora)).toBe('em_dia');
  });
});

describe('situacaoDoPainel', () => {
  const agora = Date.parse('2026-10-27T12:00:00Z');
  const v = '2026-10-27T11:00:00Z';
  const ligada = { ultimo_sinal: '2026-10-27T11:59:30Z', saiu_em: null, versao_exibida: v };
  it('rascunho vem antes de tudo', () => {
    expect(situacaoDoPainel(true, [ligada], v, agora).tipo).toBe('rascunho');
  });
  it('sem TV, TV desligada, enviando e no ar', () => {
    expect(situacaoDoPainel(false, [], v, agora).tipo).toBe('sem_tv');
    expect(situacaoDoPainel(false, [{ ...ligada, ultimo_sinal: '2026-10-27T10:00:00Z' }], v, agora))
      .toEqual({ tipo: 'tvs_desligadas', ultimoSinal: '2026-10-27T10:00:00Z' });
    expect(situacaoDoPainel(false, [{ ...ligada, versao_exibida: '2026-10-27T10:00:00Z' }], v, agora).tipo).toBe('enviando');
    expect(situacaoDoPainel(false, [ligada, { ...ligada, ultimo_sinal: null }], v, agora))
      .toEqual({ tipo: 'no_ar', ligadas: 1, total: 2 });
  });
});

describe('tempo de cada tela', () => {
  it('tela sem tempo próprio usa o padrão do painel', () => {
    expect(segundosDaTela({ segundos: null }, 30)).toBe(30);
    expect(segundosDaTela({ segundos: 300 }, 30)).toBe(300);
    expect(segundosDaTela({ segundos: 2 }, 30)).toBe(30);
    expect(segundosDaTela({}, 0)).toBe(20);
  });
  it('«duração do arquivo»: o vídeo inteiro + 1 s, entre 5 s e 1 h', () => {
    expect(segundosDoArquivo(72.4)).toBe(74);
    expect(segundosDoArquivo(30)).toBe(31);
    expect(segundosDoArquivo(1.2)).toBe(5);
    expect(segundosDoArquivo(7200)).toBe(3600);
    expect(segundosDoArquivo(null)).toBeNull();
    expect(segundosDoArquivo(Infinity)).toBeNull();
    expect(novaTela('video').opcoes).toEqual({ tempo_do_arquivo: true });
    expect(novaTela('imagem').opcoes).toEqual({});
    expect(opcao<boolean>(novaTela('video'), 'com_som')).toBe(false);
  });
  it('tempo inválido no jsonb vira nulo', () => {
    expect(telasValidas([{ id: 'a', template: 'podio', segundos: 99999 }])[0].segundos).toBeNull();
    expect(telasValidas([{ id: 'a', template: 'podio', segundos: 90 }])[0].segundos).toBe(90);
  });
  it('rótulo', () => {
    expect(rotuloTempo(20)).toBe('20 s');
    expect(rotuloTempo(60)).toBe('1 min');
    expect(rotuloTempo(90)).toBe('1 min 30 s');
    expect(rotuloTempo(3600)).toBe('1 h');
  });
});

describe('telaNoInstante — TV e PC no mesmo compasso', () => {
  const telas = [{ segundos: null }, { segundos: 30 }, { segundos: null }];
  const inicio = Date.parse('2026-10-27T12:00:00Z');

  it('conta a partir da versão do painel, com o tempo de cada tela', () => {
    expect(telaNoInstante(telas, 10, inicio, inicio)).toEqual({ indice: 0, restanteMs: 10_000 });
    expect(telaNoInstante(telas, 10, inicio, inicio + 12_000)).toEqual({ indice: 1, restanteMs: 28_000 });
    expect(telaNoInstante(telas, 10, inicio, inicio + 45_000)).toEqual({ indice: 2, restanteMs: 5_000 });
  });

  it('dá a volta: 50 s depois, recomeça na primeira', () => {
    expect(telaNoInstante(telas, 10, inicio, inicio + 51_000).indice).toBe(0);
  });

  it('relógio atrás da versão não quebra: primeira tela', () => {
    expect(telaNoInstante(telas, 10, inicio, inicio - 5_000).indice).toBe(0);
  });

  it('diferença do servidor', () => {
    expect(diferencaDoServidor('2026-10-27T12:00:05Z', inicio)).toBe(5_000);
    expect(diferencaDoServidor(undefined, inicio)).toBeNull();
    expect(diferencaDoServidor('lixo', inicio)).toBeNull();
  });
});

describe('Meta de hoje: do sistema ou outra', () => {
  const tela = (opcoes: Record<string, unknown>) => ({ template: 'hoje' as const, opcoes });
  const campoValor = templateDe('hoje')!.campos.find(c => c.chave === 'alvo_manual')!;

  it('do sistema: sem alvo próprio, e o campo de valor some', () => {
    expect(alvoDoDiaProprio(tela({}))).toBeNull();
    expect(alvoDoDiaProprio(tela({ origem_alvo: 'sistema', alvo_manual: 9000 }))).toBeNull();
    expect(campoVisivel(tela({ origem_alvo: 'sistema' }), campoValor)).toBe(false);
  });

  it('outra meta: o percentual conta sobre o valor digitado', () => {
    const t = tela({ origem_alvo: 'propria', alvo_manual: 20_000 });
    expect(alvoDoDiaProprio(t)).toBe(20_000);
    expect(campoVisivel(t, campoValor)).toBe(true);
    const v = montarVisao(base({ recebido_hoje: 5_000 }), 'bruto', alvoDoDiaProprio(t));
    expect(v.hoje.fracao).toBe(0.25);
  });

  it('tela antiga, só com o valor, continua como outra meta', () => {
    expect(alvoDoDiaProprio(tela({ alvo_manual: 7_000 }))).toBe(7_000);
    expect(campoVisivel(tela({ alvo_manual: 7_000 }), campoValor)).toBe(true);
  });
});

describe('serieAcumulada — o gráfico fecha no total oficial', () => {
  const n = { mes: '2026-10', hoje: '2026-10-05', recebido: 1_000, recebido_ho: 226 };

  it('acumula por dia e escala para terminar no recebido', () => {
    const s = serieAcumulada({ ...n, serie: [
      { dia: '2026-10-01', valor: 100, valor_ho: 20 },
      { dia: '2026-10-03', valor: 300, valor_ho: 60 },
    ] }, 'bruto');
    expect(s.map(p => p.dia)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(s[1].valor).toBe(250);
    expect(s[2].valor).toBe(250);
    expect(s[3].valor).toBe(1_000);
    expect(s[5].valor).toBe(1_000);
  });

  it('ignora dia depois de hoje e, sem série, faz a reta', () => {
    expect(serieAcumulada({ ...n, serie: [{ dia: '2026-10-09', valor: 50, valor_ho: 1 }] }, 'bruto'))
      .toEqual([{ dia: 0, valor: 0 }, { dia: 5, valor: 1_000 }]);
    expect(serieAcumulada({ ...n }, 'ho')).toEqual([{ dia: 0, valor: 0 }, { dia: 5, valor: 226 }]);
  });
});

describe('cena Destaque em gibi', () => {
  const E1 = '11111111-1111-4111-8111-111111111111';
  const base = { ...numerosDemo(), regra: 'cofen' as const, mes: '2026-10', hoje: '2026-10-29', equipe_id: null, setor_nome: 'Play 1',
    equipes: [{ id: E1, nome: 'Rosa' }],
    destaques: [
      { escopo: 'setor', dia: 'mes', id: 'a', nome: 'Ana Lima', foto: null, valor: 900, valor_ho: 200, pagamentos: 9 },
      { escopo: 'setor', dia: '2026-10-27', id: 'b', nome: 'Bia', foto: null, valor: 300, valor_ho: 70, pagamentos: 3 },
      { escopo: 'setor', dia: '2026-10-28', id: 'c', nome: 'Caio', foto: null, valor: 400, valor_ho: 90, pagamentos: 4 },
      { escopo: E1, dia: '2026-10-28', id: 'd', nome: 'Davi', foto: null, valor: 150, valor_ho: 30, pagamentos: 2 },
    ] };
  const tela = (opcoes: Record<string, unknown>) => ({ template: 'destaque' as const, opcoes });
  const v = montarVisao(base, 'bruto');

  it('dia anterior: o último dia com recebimento antes de hoje', () => {
    const d = destaqueDaTela(v, tela({}));
    expect(d.pessoa?.nome).toBe('Caio');
    expect(d.dia).toBe('2026-10-28');
    expect(d.onde).toBe('Play 1');
  });
  it('mês, dia escolhido, e o valor na unidade do painel (H.O. no Cofen)', () => {
    expect(destaqueDaTela(v, tela({ dia: 'mes' })).pessoa?.nome).toBe('Ana Lima');
    expect(destaqueDaTela(v, tela({ dia: 'data', data: '2026-10-27' })).pessoa?.valor).toBe(300);
    expect(destaqueDaTela(montarVisao(base, 'ho'), tela({ dia: 'data', data: '2026-10-27' })).pessoa?.valor).toBe(70);
  });
  it('equipe: a escolhida, ou a do painel; sem nenhuma, pede para escolher', () => {
    const d = destaqueDaTela(v, tela({ escopo: 'equipe', equipe_id: E1 }));
    expect(d.pessoa?.nome).toBe('Davi');
    expect(d.onde).toBe('Equipe Rosa');
    expect(destaqueDaTela(v, tela({ escopo: 'equipe' })).motivo).toMatch(/Escolha a equipe/);
    expect(destaqueDaTela(montarVisao({ ...base, equipe_id: E1 }, 'bruto'), tela({ escopo: 'equipe' })).pessoa?.nome).toBe('Davi');
  });
  it('sem ninguém: hoje ainda vazio, dia de outro mês', () => {
    expect(destaqueDaTela(v, tela({ dia: 'hoje' })).pessoa).toBeNull();
    expect(destaqueDaTela(v, tela({ dia: 'data', data: '2026-09-10' })).motivo).toMatch(/mês atual/);
    expect(destaqueDaTela(montarVisao({ ...base, destaques: undefined }, 'bruto'), tela({ dia: 'mes' })).pessoa).toBeNull();
  });
});
