/**
 * A janela de usuário MONTA, e obedece a chave de cada campo?
 *
 * ## Por que ele existe
 *
 * A janela ganhou seis chaves de permissão em 06/09/2026 — uma por campo. Chave
 * lida errado aqui não estoura: ela abre um campo que deveria estar trancado, e
 * isso só aparece quando alguém edita o que não devia. Um teste de montagem não
 * pega tudo, mas pega o caso em que a prop simplesmente não é consultada.
 *
 * Também responde a primeira pergunta de sempre — abre? —, que é o que faltava
 * na reforma do Analítico e derrubou a tela do líder em produção.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Perfil, Setor } from '@/lib/supabase';
import { DialogUsuario, type PodeNoUsuario, type UserForm } from './DialogUsuario';

const TUDO: PodeNoUsuario = {
  nome: true, login: true, foto: true, cargo: true, senha: true, excluir: true,
};
const NADA: PodeNoUsuario = {
  nome: false, login: false, foto: false, cargo: false, senha: false, excluir: false,
};

const PESSOA = {
  id: 'p1', nome: 'Ana Souza', email: 'ana@empresa.com', usuario: 'ana.souza',
  perfil: 'operador', ativo: true, lider_id: null, setor_id: 'setor-1',
  empresa_id: 'emp-1',
} as Perfil;

const FORM: UserForm = {
  nome: 'Ana Souza', email: 'ana@empresa.com', usuario: 'ana.souza',
  senha: '', perfil: 'operador', setor_id: 'setor-1', empresa_id: 'emp-1',
};

const SETORES = [{ id: 'setor-1', nome: 'Play 1', ativo: true, empresa_id: 'emp-1' }] as Setor[];

function montar(over: Partial<React.ComponentProps<typeof DialogUsuario>> = {}) {
  return render(
    <DialogUsuario
      aberto onFechar={vi.fn()}
      editando={PESSOA} form={FORM} setForm={vi.fn()}
      pode={TUDO} isSuperAdmin={false} souEu={false} online
      setoresDoForm={SETORES} setores={SETORES} empresas={[]} empresaAtualNome="PaguePlay"
      cargoEscopoEmpresa={false} setorVazioParaPreencher={false}
      salvando={false} onSalvar={vi.fn()}
      uploadando={false} onEscolherFoto={vi.fn()} onRemoverFoto={vi.fn()}
      novaSenha="" setNovaSenha={vi.fn()} salvandoSenha={false} onSalvarSenha={vi.fn()}
      onPedirExclusao={vi.fn()} excluindo={false}
      {...over}
    />,
  );
}

describe('DialogUsuario monta', () => {
  it('o cabeçalho mostra de quem é a ficha, não o rótulo «Editar Usuário»', () => {
    montar();
    expect(screen.getAllByText('Ana Souza').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Operador').length).toBeGreaterThan(0);
    expect(screen.queryByText('Editar Usuário')).not.toBeInTheDocument();
  });

  it('as seções dão esqueleto à janela', () => {
    montar();
    expect(screen.getByText('Identidade')).toBeInTheDocument();
    expect(screen.getByText('Função e lotação')).toBeInTheDocument();
    expect(screen.getByText('Acesso')).toBeInTheDocument();
  });

  it('criar é outra janela: sem ficha, com senha, e o botão diz o que faz', () => {
    montar({ editando: null });
    expect(screen.getByText('Novo usuário')).toBeInTheDocument();
    expect(screen.getByText('Criar usuário')).toBeInTheDocument();
    expect(screen.queryByText('Acesso')).not.toBeInTheDocument();
  });
});

describe('cada campo obedece a própria chave', () => {
  it('com tudo liberado, os campos são editáveis', () => {
    montar();
    expect(screen.getByDisplayValue('Ana Souza')).toBeEnabled();
    expect(screen.getByDisplayValue('ana.souza')).toBeEnabled();
    // A pessoa de teste nao tem foto, entao o botao convida a adicionar.
    expect(screen.getByText('Adicionar foto')).toBeInTheDocument();
  });

  it('sem chave, o campo vira leitura e DIZ por quê', () => {
    // Sumir o campo faria a pessoa procurar onde ele foi parar; mostrá-lo
    // trancado com o motivo responde a pergunta antes dela.
    montar({ pode: NADA });
    expect(screen.queryByDisplayValue('Ana Souza')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('ana.souza')).not.toBeInTheDocument();
    expect(screen.queryByText('Adicionar foto')).not.toBeInTheDocument();
    expect(screen.getAllByText(/não tem permissão para alterar este campo/i).length)
      .toBeGreaterThan(0);
  });

  it('sem `senha`, a seção Acesso não existe', () => {
    montar({ pode: { ...TUDO, senha: false } });
    expect(screen.queryByText('Acesso')).not.toBeInTheDocument();
  });

  it('sem `excluir`, não há botão de excluir', () => {
    // Ele aparecia para qualquer um que abrisse a janela — inclusive um líder,
    // que então tomava um 42501 do banco.
    montar({ pode: { ...TUDO, excluir: false } });
    expect(screen.queryByText('Excluir usuário')).not.toBeInTheDocument();
  });

  it('ninguém exclui a si mesmo, nem com a chave ligada', () => {
    montar({ souEu: true });
    expect(screen.queryByText('Excluir usuário')).not.toBeInTheDocument();
  });

  it('sem `cargo`, o Select vira etiqueta trancada', () => {
    montar({ pode: { ...TUDO, cargo: false } });
    // O rótulo do cargo continua legível — só não dá para trocá-lo.
    expect(screen.getAllByText('Operador').length).toBeGreaterThan(0);
  });
});

describe('setor e empresa continuam sendo transferência', () => {
  it('o setor de quem já tem um é leitura, e aponta para o Transferir', () => {
    montar();
    expect(screen.getByText(/Mover de setor é uma transferência/i)).toBeInTheDocument();
    expect(screen.getByText('Play 1')).toBeInTheDocument();
  });

  it('quem está SEM setor ganha o campo aberto — mesmo sem chave de campo', () => {
    // A regra do `setorVazioParaPreencher`: sair de nulo para um setor não é
    // mudar de setor, é ganhar o primeiro. Ela não passa pelas chaves de campo.
    montar({ pode: NADA, setorVazioParaPreencher: true });
    expect(screen.getByText(/pertence a um setor e está[\s\S]*sem nenhum/i)).toBeInTheDocument();
  });

  it('a cúpula não tem setor, e a janela explica em vez de mostrar campo morto', () => {
    montar({ cargoEscopoEmpresa: true });
    expect(screen.getByText('Empresa inteira')).toBeInTheDocument();
  });
});
