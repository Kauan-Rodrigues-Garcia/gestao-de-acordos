import { describe, expect, it } from 'vitest';
import { filtrarUsuariosVisiveis } from './usuarios-visibilidade';

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
