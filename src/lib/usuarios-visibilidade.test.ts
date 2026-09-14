import { describe, expect, it } from 'vitest';
import { filtrarTransferenciasVisiveis, filtrarUsuariosVisiveis } from './usuarios-visibilidade';

const pessoas = [
  { id: 'mesmo', perfil: 'operador', setor_id: 'setor-a' },
  { id: 'outro', perfil: 'operador', setor_id: 'setor-b' },
  { id: 'admin-mesmo', perfil: 'administrador', setor_id: 'setor-a' },
  { id: 'admin-outro', perfil: 'super_admin', setor_id: 'setor-b' },
];

describe('filtrarUsuariosVisiveis', () => {
  it('mantém o próprio setor mesmo quando pode ver contas administrativas', () => {
    const resultado = filtrarUsuariosVisiveis(pessoas, {
      podeVerAdministradores: true,
      veTodosSetores: false,
      setorAtualId: 'setor-a',
    });

    expect(resultado.map(p => p.id)).toEqual(['mesmo', 'admin-mesmo']);
  });

  it('mostra todos os setores sem revelar administradores quando a chave está desligada', () => {
    const resultado = filtrarUsuariosVisiveis(pessoas, {
      podeVerAdministradores: false,
      veTodosSetores: true,
      setorAtualId: 'setor-a',
    });

    expect(resultado.map(p => p.id)).toEqual(['mesmo', 'outro']);
  });

  it('combina setor e ocultação de administradores sem um eixo ampliar o outro', () => {
    const resultado = filtrarUsuariosVisiveis(pessoas, {
      podeVerAdministradores: false,
      veTodosSetores: false,
      setorAtualId: 'setor-a',
    });

    expect(resultado.map(p => p.id)).toEqual(['mesmo']);
  });
});

/*
 * Pedido de 14/09/2026: «Play 1 só vê transferências entrando para ele, ou ele
 * transferindo para outros setores — Play 4 transferir para Play 5 não o afeta».
 */
describe('filtrarTransferenciasVisiveis', () => {
  const transferencias = [
    { id: 'sai-do-1',   origemSetorId: 'play-1', destinoSetorId: 'play-3' },
    { id: 'entra-no-1', origemSetorId: 'play-3', destinoSetorId: 'play-1' },
    { id: '4-para-5',   origemSetorId: 'play-4', destinoSetorId: 'play-5' },
    { id: 'sem-setor',  origemSetorId: null,     destinoSetorId: 'play-5' },
  ];

  it('com alcance de setor, mostra só o que sai do setor ou entra nele', () => {
    const r = filtrarTransferenciasVisiveis(transferencias, {
      veTodosSetores: false, setorAtualId: 'play-1',
    });
    expect(r.map(t => t.id)).toEqual(['sai-do-1', 'entra-no-1']);
  });

  it('com alcance de todos os setores, mostra tudo', () => {
    const r = filtrarTransferenciasVisiveis(transferencias, {
      veTodosSetores: true, setorAtualId: 'play-1',
    });
    expect(r).toHaveLength(4);
  });

  it('sem setor e sem alcance amplo, não mostra nada', () => {
    const r = filtrarTransferenciasVisiveis(transferencias, {
      veTodosSetores: false, setorAtualId: null,
    });
    expect(r).toEqual([]);
  });
});
