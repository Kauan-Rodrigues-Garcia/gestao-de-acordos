-- Remove os resíduos comprovados do Receptivo/BookPlay em agosto/2026.
--
-- Eles entraram antes dos filtros de Retenção/Colchão e permaneceram porque a
-- importação reconciliava apenas NRs presentes no arquivo novo. A aplicação
-- passa a sincronizar ausentes no relatório mensal completo; esta migração
-- corrige uma única vez o histórico que já estava no banco. O DELETE é
-- idempotente para também funcionar em bancos novos, que não possuem esse mês.
delete from public.analitico_recebimentos ar
  using public.empresas e, public.setores s
  where e.id = ar.empresa_id
    and s.id = ar.setor_id
    and e.nome = 'BOOKPLAY'
    and s.nome = 'Receptivo'
    and ar.mes_referencia = date '2026-08-01'
    and (
      lower(ar.operador_usuario) in (
        'amanda_gabriely', 'beatriz_silvestre', 'caio_henrique',
        'grace_kato', 'jessica_laan', 'jessica_s_souza',
        'monica_souza', 'pamela_correa', 'rayssa_r_lellis',
        'tamiris_hilario', 'vitoria_nascimento'
      )
      or (
        ar.operador_usuario = 'KAUAN_TEIXEIRA'
        and ar.codigo in ('12980581', '13006520', '13015019')
      )
      or (
        ar.operador_usuario = 'THIAGO_ALVES'
        and ar.codigo = '12995133'
      )
    );
