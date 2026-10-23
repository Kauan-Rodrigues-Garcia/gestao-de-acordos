/**
 * O cadastro separa BookPlay e PaguePlay pela CIDADE do setor, e não pela
 * empresa (23/10/2026)?
 *
 * A regra antiga listava os setores da empresa escolhida. O caso que ela errava:
 * um setor de Marília cadastrado na empresa BookPlay (o Play Night) aparecia na
 * BookPlay. Aqui ele tem de aparecer na PaguePlay, e escolher ele tem de levar a
 * empresa do setor para o formulário — é ela que a FK composta exige.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Empresa, Setor } from '@/lib/supabase';
import type { UserForm } from './DialogUsuario';
import { DialogNovoUsuario } from './DialogNovoUsuario';

vi.mock('@/hooks/useCargos', () => ({
  useCadastroDeCargos: () => [
    { slug: 'operador', nome: 'Operador', ativo: true },
    { slug: 'lider', nome: 'Líder', ativo: true },
  ],
}));

const FORM: UserForm = {
  nome: 'Ana Clara Souza', email: '', usuario: '', senha: '', perfil: 'operador',
  setor_id: '', empresa_id: 'emp-bp', robo: false, menor_aprendiz: false,
};

const CIDADES = [{ id: 'c-bir', nome: 'Birigui' }, { id: 'c-mar', nome: 'Marília' }];
const SETORES = [
  { id: 's-play1', nome: 'Play 1', ativo: true, empresa_id: 'emp-bp', cidade_id: 'c-bir', regra: 'nosso_produto' },
  { id: 's-night', nome: 'Play Night', ativo: true, empresa_id: 'emp-bp', cidade_id: 'c-mar', regra: 'nosso_produto' },
  { id: 's-conecta', nome: 'Conecta Play', ativo: true, empresa_id: 'emp-pp', cidade_id: 'c-mar', regra: 'cofen' },
] as Setor[];
const EMPRESAS = [{ id: 'emp-bp', nome: 'BookPlay' }, { id: 'emp-pp', nome: 'PaguePlay' }] as Empresa[];

function montar(setForm = vi.fn(), over: Partial<React.ComponentProps<typeof DialogNovoUsuario>> = {}) {
  render(
    <DialogNovoUsuario
      aberto onFechar={vi.fn()} form={FORM} setForm={setForm}
      podeCargo isSuperAdmin={false}
      setores={SETORES} cidades={CIDADES} empresas={EMPRESAS} empresaAtualNome="BookPlay"
      setorDeQuemCria="s-play1"
      cargoEscopoEmpresa={false} setorNucleoId={null}
      salvando={false} onSalvar={vi.fn()}
      {...over}
    />,
  );
  return setForm;
}

describe('DialogNovoUsuario', () => {
  it('abre na marca de quem cria e mostra só os setores de Birigui', () => {
    montar();
    expect(screen.getByText('Play 1')).toBeInTheDocument();
    expect(screen.queryByText('Play Night')).not.toBeInTheDocument();
    expect(screen.queryByText('Conecta Play')).not.toBeInTheDocument();
  });

  it('PaguePlay lista todo setor de Marília, venha da empresa que vier', () => {
    montar();
    fireEvent.click(screen.getByText('PaguePlay'));
    expect(screen.getByText('Play Night')).toBeInTheDocument();
    expect(screen.getByText('Conecta Play')).toBeInTheDocument();
    expect(screen.queryByText('Play 1')).not.toBeInTheDocument();
    expect(screen.getByText('Cofen')).toBeInTheDocument();
  });

  it('escolher o setor leva a empresa dele para o formulário', () => {
    const setForm = montar();
    fireEvent.click(screen.getByText('PaguePlay'));
    fireEvent.click(screen.getByText('Conecta Play'));
    const atualizar = setForm.mock.calls.at(-1)![0] as (f: UserForm) => UserForm;
    expect(atualizar(FORM)).toMatchObject({ setor_id: 's-conecta', empresa_id: 'emp-pp' });
  });

  it('cúpula não escolhe setor: o passo 3 mostra a empresa', () => {
    montar(vi.fn(), { cargoEscopoEmpresa: true });
    expect(screen.queryByText('Play 1')).not.toBeInTheDocument();
    expect(screen.getByText('Empresa')).toBeInTheDocument();
  });
});
