export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      aceites_termo: {
        Row: {
          aceito_em: string
          id: string
          ip: string | null
          termo_id: string
          user_agent: string | null
          usuario_id: string
        }
        Insert: {
          aceito_em?: string
          id?: string
          ip?: string | null
          termo_id: string
          user_agent?: string | null
          usuario_id: string
        }
        Update: {
          aceito_em?: string
          id?: string
          ip?: string | null
          termo_id?: string
          user_agent?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aceites_termo_termo_id_fkey"
            columns: ["termo_id"]
            isOneToOne: false
            referencedRelation: "termos_uso"
            referencedColumns: ["id"]
          },
        ]
      }
      acordos: {
        Row: {
          acordo_grupo_id: string | null
          atualizado_em: string
          criado_em: string
          data_cadastro: string
          data_pagamento: string | null
          empresa_id: string
          estado_uf: string | null
          id: string
          instituicao: string | null
          nome_cliente: string
          nr_cliente: string
          numero_parcela: number | null
          observacoes: string | null
          operador_id: string
          operador_vinculado_id: string | null
          pago_em: string | null
          parcelas: number | null
          setor_id: string | null
          status: string
          tag_ids: string[] | null
          tipo: string
          tipo_receptivo: string | null
          tipo_vinculo: string
          usou_quarenta_pct: boolean
          valor: number
          valor_entrada: number | null
          valor_total: number | null
          vencimento: string
          vinculo_operador_id: string | null
          vinculo_operador_nome: string | null
          whatsapp: string | null
        }
        Insert: {
          acordo_grupo_id?: string | null
          atualizado_em?: string
          criado_em?: string
          data_cadastro?: string
          data_pagamento?: string | null
          empresa_id: string
          estado_uf?: string | null
          id?: string
          instituicao?: string | null
          nome_cliente: string
          nr_cliente: string
          numero_parcela?: number | null
          observacoes?: string | null
          operador_id: string
          operador_vinculado_id?: string | null
          pago_em?: string | null
          parcelas?: number | null
          setor_id?: string | null
          status: string
          tag_ids?: string[] | null
          tipo: string
          tipo_receptivo?: string | null
          tipo_vinculo?: string
          usou_quarenta_pct?: boolean
          valor: number
          valor_entrada?: number | null
          valor_total?: number | null
          vencimento: string
          vinculo_operador_id?: string | null
          vinculo_operador_nome?: string | null
          whatsapp?: string | null
        }
        Update: {
          acordo_grupo_id?: string | null
          atualizado_em?: string
          criado_em?: string
          data_cadastro?: string
          data_pagamento?: string | null
          empresa_id?: string
          estado_uf?: string | null
          id?: string
          instituicao?: string | null
          nome_cliente?: string
          nr_cliente?: string
          numero_parcela?: number | null
          observacoes?: string | null
          operador_id?: string
          operador_vinculado_id?: string | null
          pago_em?: string | null
          parcelas?: number | null
          setor_id?: string | null
          status?: string
          tag_ids?: string[] | null
          tipo?: string
          tipo_receptivo?: string | null
          tipo_vinculo?: string
          usou_quarenta_pct?: boolean
          valor?: number
          valor_entrada?: number | null
          valor_total?: number | null
          vencimento?: string
          vinculo_operador_id?: string | null
          vinculo_operador_nome?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acordos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_config: {
        Row: {
          empresa_id: string | null
          enabled: boolean
          id: string
          max_cols: number
          max_rows: number
          model: string
          prompt_system: string
          temperature: number
          updated_at: string
        }
        Insert: {
          empresa_id?: string | null
          enabled?: boolean
          id?: string
          max_cols?: number
          max_rows?: number
          model?: string
          prompt_system?: string
          temperature?: number
          updated_at?: string
        }
        Update: {
          empresa_id?: string | null
          enabled?: boolean
          id?: string
          max_cols?: number
          max_rows?: number
          model?: string
          prompt_system?: string
          temperature?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      analitico_ajustes_eventos: {
        Row: {
          ajuste_id: string
          autor_id: string | null
          autor_nome: string | null
          criado_em: string
          delta: number | null
          empresa_id: string
          id: string
          observacao: string | null
          tipo: string
          valor_anterior: number | null
          valor_novo: number | null
        }
        Insert: {
          ajuste_id: string
          autor_id?: string | null
          autor_nome?: string | null
          criado_em?: string
          delta?: number | null
          empresa_id: string
          id?: string
          observacao?: string | null
          tipo: string
          valor_anterior?: number | null
          valor_novo?: number | null
        }
        Update: {
          ajuste_id?: string
          autor_id?: string | null
          autor_nome?: string | null
          criado_em?: string
          delta?: number | null
          empresa_id?: string
          id?: string
          observacao?: string | null
          tipo?: string
          valor_anterior?: number | null
          valor_novo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "analitico_ajustes_eventos_ajuste_id_fkey"
            columns: ["ajuste_id"]
            isOneToOne: false
            referencedRelation: "analitico_ajustes_manuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_ajustes_eventos_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_ajustes_eventos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      analitico_ajustes_manuais: {
        Row: {
          atualizado_em: string
          cancelado: boolean
          cancelado_em: string | null
          cancelado_por: string | null
          cancelado_por_nome: string | null
          criado_em: string
          criado_por: string | null
          criado_por_nome: string | null
          editado_por: string | null
          editado_por_nome: string | null
          empresa_id: string
          equipe_id: string | null
          id: string
          mes_referencia: string
          motivo: string
          motivo_cancelamento: string | null
          operador_id: string
          setor_id: string | null
          valor: number
        }
        Insert: {
          atualizado_em?: string
          cancelado?: boolean
          cancelado_em?: string | null
          cancelado_por?: string | null
          cancelado_por_nome?: string | null
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          editado_por?: string | null
          editado_por_nome?: string | null
          empresa_id: string
          equipe_id?: string | null
          id?: string
          mes_referencia: string
          motivo: string
          motivo_cancelamento?: string | null
          operador_id: string
          setor_id?: string | null
          valor: number
        }
        Update: {
          atualizado_em?: string
          cancelado?: boolean
          cancelado_em?: string | null
          cancelado_por?: string | null
          cancelado_por_nome?: string | null
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          editado_por?: string | null
          editado_por_nome?: string | null
          empresa_id?: string
          equipe_id?: string | null
          id?: string
          mes_referencia?: string
          motivo?: string
          motivo_cancelamento?: string | null
          operador_id?: string
          setor_id?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "analitico_ajustes_manuais_cancelado_por_fkey"
            columns: ["cancelado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_ajustes_manuais_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_ajustes_manuais_editado_por_fkey"
            columns: ["editado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_ajustes_manuais_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_ajustes_manuais_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_ajustes_manuais_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_ajustes_manuais_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      analitico_colchao_fora_meta: {
        Row: {
          chave_deduplicacao: string
          codigo: string
          data_pagamento: string
          empresa_id: string
          equipe: string
          forma_pagamento: string
          id: number
          importado_em: string
          importado_por_id: string | null
          lote_id: string
          mes_referencia: string
          nome_cliente: string | null
          nr_documento: string
          operador_id: string | null
          operador_usuario: string
          parcela: string
          setor_id: string | null
          tipo_comissao: string | null
          titulo: string
          total_ho: number
          tpdoc_original: string
          valor_recebido: number
        }
        Insert: {
          chave_deduplicacao: string
          codigo: string
          data_pagamento: string
          empresa_id: string
          equipe?: string
          forma_pagamento: string
          id?: never
          importado_em?: string
          importado_por_id?: string | null
          lote_id: string
          mes_referencia: string
          nome_cliente?: string | null
          nr_documento?: string
          operador_id?: string | null
          operador_usuario: string
          parcela?: string
          setor_id?: string | null
          tipo_comissao?: string | null
          titulo?: string
          total_ho?: number
          tpdoc_original: string
          valor_recebido?: number
        }
        Update: {
          chave_deduplicacao?: string
          codigo?: string
          data_pagamento?: string
          empresa_id?: string
          equipe?: string
          forma_pagamento?: string
          id?: never
          importado_em?: string
          importado_por_id?: string | null
          lote_id?: string
          mes_referencia?: string
          nome_cliente?: string | null
          nr_documento?: string
          operador_id?: string | null
          operador_usuario?: string
          parcela?: string
          setor_id?: string | null
          tipo_comissao?: string | null
          titulo?: string
          total_ho?: number
          tpdoc_original?: string
          valor_recebido?: number
        }
        Relationships: [
          {
            foreignKeyName: "analitico_colchao_fora_meta_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_colchao_fora_meta_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_colchao_fora_meta_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      analitico_exclusoes_setor: {
        Row: {
          criado_em: string
          empresa_id: string
          excluido_por: string | null
          id: string
          mes: string
          setor_id: string
          setor_origem_id: string | null
        }
        Insert: {
          criado_em?: string
          empresa_id: string
          excluido_por?: string | null
          id?: string
          mes: string
          setor_id: string
          setor_origem_id?: string | null
        }
        Update: {
          criado_em?: string
          empresa_id?: string
          excluido_por?: string | null
          id?: string
          mes?: string
          setor_id?: string
          setor_origem_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analitico_exclusoes_setor_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_exclusoes_setor_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_exclusoes_setor_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_exclusoes_setor_setor_origem_id_fkey"
            columns: ["setor_origem_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      analitico_ranking_config: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          criterio: string
          empresa_id: string
          grupos_incluidos: string[]
          perfis_excluidos: string[]
          setor_id: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          criterio?: string
          empresa_id: string
          grupos_incluidos?: string[]
          perfis_excluidos?: string[]
          setor_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          criterio?: string
          empresa_id?: string
          grupos_incluidos?: string[]
          perfis_excluidos?: string[]
          setor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analitico_ranking_config_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_ranking_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_ranking_config_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: true
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      analitico_recebimentos: {
        Row: {
          acordo_id: string | null
          codigo: string
          data_pagamento: string
          empresa_id: string
          forma_detalhe: string | null
          forma_pagamento: string
          id: string
          importado_em: string
          importado_por_id: string | null
          instituicao: string | null
          lote_id: string
          mes_referencia: string
          nome_cliente: string | null
          operador_id: string | null
          operador_usuario: string
          pagamentos_detalhados: Json | null
          setor_id: string | null
          status_tabulacao: string
          tipo_comissao: string | null
          total_ho: number
          valor_recebido: number
          visto: boolean
        }
        Insert: {
          acordo_id?: string | null
          codigo: string
          data_pagamento: string
          empresa_id: string
          forma_detalhe?: string | null
          forma_pagamento: string
          id?: string
          importado_em?: string
          importado_por_id?: string | null
          instituicao?: string | null
          lote_id: string
          mes_referencia: string
          nome_cliente?: string | null
          operador_id?: string | null
          operador_usuario: string
          pagamentos_detalhados?: Json | null
          setor_id?: string | null
          status_tabulacao?: string
          tipo_comissao?: string | null
          total_ho?: number
          valor_recebido?: number
          visto?: boolean
        }
        Update: {
          acordo_id?: string | null
          codigo?: string
          data_pagamento?: string
          empresa_id?: string
          forma_detalhe?: string | null
          forma_pagamento?: string
          id?: string
          importado_em?: string
          importado_por_id?: string | null
          instituicao?: string | null
          lote_id?: string
          mes_referencia?: string
          nome_cliente?: string | null
          operador_id?: string | null
          operador_usuario?: string
          pagamentos_detalhados?: Json | null
          setor_id?: string | null
          status_tabulacao?: string
          tipo_comissao?: string | null
          total_ho?: number
          valor_recebido?: number
          visto?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "analitico_recebimentos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_recebimentos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos_deduplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_recebimentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_recebimentos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_recebimentos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      analitico_resumo_mensal: {
        Row: {
          atualizado_em: string | null
          empresa_id: string
          id: string
          mes: string
          periodo_fim: string | null
          periodo_inicio: string | null
          total_ho: number
          total_operadores: number
          total_pagamentos: number
          total_recebido: number
        }
        Insert: {
          atualizado_em?: string | null
          empresa_id: string
          id?: string
          mes: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          total_ho?: number
          total_operadores?: number
          total_pagamentos?: number
          total_recebido?: number
        }
        Update: {
          atualizado_em?: string | null
          empresa_id?: string
          id?: string
          mes?: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          total_ho?: number
          total_operadores?: number
          total_pagamentos?: number
          total_recebido?: number
        }
        Relationships: [
          {
            foreignKeyName: "analitico_resumo_mensal_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      api_rate_limits: {
        Row: {
          atualizado_em: string
          janela_inicio: string
          requisicoes: number
          rota: string
          usuario_id: string
        }
        Insert: {
          atualizado_em?: string
          janela_inicio?: string
          requisicoes?: number
          rota: string
          usuario_id: string
        }
        Update: {
          atualizado_em?: string
          janela_inicio?: string
          requisicoes?: number
          rota?: string
          usuario_id?: string
        }
        Relationships: []
      }
      atendimento_responsaveis: {
        Row: {
          criado_em: string
          definido_por: string | null
          empresa_id: string
          id: string
          usuario_id: string
        }
        Insert: {
          criado_em?: string
          definido_por?: string | null
          empresa_id: string
          id?: string
          usuario_id: string
        }
        Update: {
          criado_em?: string
          definido_por?: string | null
          empresa_id?: string
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atendimento_responsaveis_definido_por_fkey"
            columns: ["definido_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_responsaveis_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_responsaveis_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      autorizacoes_pedidos: {
        Row: {
          acordo_alvo_id: string | null
          acordo_criado_id: string | null
          acordo_editado_id: string | null
          criado_em: string
          decidido_em: string | null
          decidido_por_id: string | null
          decidido_por_nome: string | null
          dono_id: string | null
          dono_nome: string | null
          empresa_id: string
          erro: string | null
          expira_em: string
          extra_atual_id: string | null
          extra_atual_op_id: string | null
          extra_atual_op_nome: string | null
          id: string
          modo: string
          motivo_recusa: string | null
          nr_label: string
          nr_valor: string
          payload: Json
          resumo: Json
          setor_id: string | null
          setores_escopo: string[]
          solicitante_id: string
          solicitante_nome: string
          status: string
        }
        Insert: {
          acordo_alvo_id?: string | null
          acordo_criado_id?: string | null
          acordo_editado_id?: string | null
          criado_em?: string
          decidido_em?: string | null
          decidido_por_id?: string | null
          decidido_por_nome?: string | null
          dono_id?: string | null
          dono_nome?: string | null
          empresa_id: string
          erro?: string | null
          expira_em?: string
          extra_atual_id?: string | null
          extra_atual_op_id?: string | null
          extra_atual_op_nome?: string | null
          id?: string
          modo: string
          motivo_recusa?: string | null
          nr_label: string
          nr_valor: string
          payload: Json
          resumo?: Json
          setor_id?: string | null
          setores_escopo?: string[]
          solicitante_id: string
          solicitante_nome: string
          status?: string
        }
        Update: {
          acordo_alvo_id?: string | null
          acordo_criado_id?: string | null
          acordo_editado_id?: string | null
          criado_em?: string
          decidido_em?: string | null
          decidido_por_id?: string | null
          decidido_por_nome?: string | null
          dono_id?: string | null
          dono_nome?: string | null
          empresa_id?: string
          erro?: string | null
          expira_em?: string
          extra_atual_id?: string | null
          extra_atual_op_id?: string | null
          extra_atual_op_nome?: string | null
          id?: string
          modo?: string
          motivo_recusa?: string | null
          nr_label?: string
          nr_valor?: string
          payload?: Json
          resumo?: Json
          setor_id?: string | null
          setores_escopo?: string[]
          solicitante_id?: string
          solicitante_nome?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "autorizacoes_pedidos_decidido_por_id_fkey"
            columns: ["decidido_por_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autorizacoes_pedidos_dono_id_fkey"
            columns: ["dono_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autorizacoes_pedidos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autorizacoes_pedidos_extra_atual_op_id_fkey"
            columns: ["extra_atual_op_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autorizacoes_pedidos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autorizacoes_pedidos_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      campanha_facil_descontos: {
        Row: {
          annual: number
          atualizado_em: string
          bundle: number
          criado_em: string
          criado_por: string | null
          empresa_id: string
          id: string
          interest: number
          nome: string
          overdue: number
          settlement: number
        }
        Insert: {
          annual?: number
          atualizado_em?: string
          bundle?: number
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          id?: string
          interest?: number
          nome: string
          overdue?: number
          settlement?: number
        }
        Update: {
          annual?: number
          atualizado_em?: string
          bundle?: number
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          id?: string
          interest?: number
          nome?: string
          overdue?: number
          settlement?: number
        }
        Relationships: [
          {
            foreignKeyName: "campanha_facil_descontos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      campanha_facil_mensagens: {
        Row: {
          atualizado_em: string
          categoria: string
          corpo: string
          criado_em: string
          criado_por: string | null
          criado_por_nome: string | null
          empresa_id: string
          id: string
          titulo: string
        }
        Insert: {
          atualizado_em?: string
          categoria?: string
          corpo: string
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          empresa_id: string
          id?: string
          titulo: string
        }
        Update: {
          atualizado_em?: string
          categoria?: string
          corpo?: string
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          empresa_id?: string
          id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanha_facil_mensagens_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      campanha_facil_mensagens_ocultas: {
        Row: {
          criado_em: string
          empresa_id: string
          ocultado_por: string | null
          template_id: string
        }
        Insert: {
          criado_em?: string
          empresa_id: string
          ocultado_por?: string | null
          template_id: string
        }
        Update: {
          criado_em?: string
          empresa_id?: string
          ocultado_por?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanha_facil_mensagens_ocultas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cargos_permissoes: {
        Row: {
          atualizado_em: string
          cargo: string
          criado_em: string
          descricao: string | null
          empresa_id: string
          id: string
          permissoes: Json
        }
        Insert: {
          atualizado_em?: string
          cargo: string
          criado_em?: string
          descricao?: string | null
          empresa_id: string
          id?: string
          permissoes?: Json
        }
        Update: {
          atualizado_em?: string
          cargo?: string
          criado_em?: string
          descricao?: string | null
          empresa_id?: string
          id?: string
          permissoes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cargos_permissoes_2026_04_16_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_config: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          empresa_id: string
          liberado: boolean
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          empresa_id: string
          liberado?: boolean
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          empresa_id?: string
          liberado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "chat_config_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversas: {
        Row: {
          criado_em: string
          criado_por: string | null
          empresa_id: string
          foto_url: string | null
          id: string
          nome: string | null
          par_maior: string | null
          par_menor: string | null
          somente_lideranca: boolean
          tipo: string
          ultima_mensagem_em: string | null
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          foto_url?: string | null
          id?: string
          nome?: string | null
          par_maior?: string | null
          par_menor?: string | null
          somente_lideranca?: boolean
          tipo?: string
          ultima_mensagem_em?: string | null
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          foto_url?: string | null
          id?: string
          nome?: string | null
          par_maior?: string | null
          par_menor?: string | null
          somente_lideranca?: boolean
          tipo?: string
          ultima_mensagem_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversas_par_maior_fkey"
            columns: ["par_maior"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversas_par_menor_fkey"
            columns: ["par_menor"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_curtidas: {
        Row: {
          criado_em: string
          mensagem_id: string
          perfil_id: string
        }
        Insert: {
          criado_em?: string
          mensagem_id: string
          perfil_id: string
        }
        Update: {
          criado_em?: string
          mensagem_id?: string
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_curtidas_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "chat_mensagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_curtidas_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_disparo_destinos: {
        Row: {
          conversa_id: string
          disparo_id: string
          mensagem_id: string | null
          perfil_id: string
        }
        Insert: {
          conversa_id: string
          disparo_id: string
          mensagem_id?: string | null
          perfil_id: string
        }
        Update: {
          conversa_id?: string
          disparo_id?: string
          mensagem_id?: string | null
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_disparo_destinos_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chat_conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_disparo_destinos_disparo_id_fkey"
            columns: ["disparo_id"]
            isOneToOne: false
            referencedRelation: "chat_disparos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_disparo_destinos_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "chat_mensagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_disparo_destinos_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_disparos: {
        Row: {
          anexos: Json
          autor_id: string
          criado_em: string
          empresa_id: string
          id: string
          texto: string | null
          total_destinos: number
        }
        Insert: {
          anexos?: Json
          autor_id: string
          criado_em?: string
          empresa_id: string
          id?: string
          texto?: string | null
          total_destinos?: number
        }
        Update: {
          anexos?: Json
          autor_id?: string
          criado_em?: string
          empresa_id?: string
          id?: string
          texto?: string | null
          total_destinos?: number
        }
        Relationships: [
          {
            foreignKeyName: "chat_disparos_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_disparos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_mensagens: {
        Row: {
          anexos: Json
          autor_id: string | null
          conversa_id: string
          criado_em: string
          curtida_em: string | null
          curtida_por: string | null
          disparo_id: string | null
          empresa_id: string
          expurgado_em: string | null
          expurgar_em: string | null
          id: string
          respondendo_id: string | null
          sistema: string | null
          sistema_dados: Json | null
          tem_cpf: boolean
          texto: string | null
        }
        Insert: {
          anexos?: Json
          autor_id?: string | null
          conversa_id: string
          criado_em?: string
          curtida_em?: string | null
          curtida_por?: string | null
          disparo_id?: string | null
          empresa_id: string
          expurgado_em?: string | null
          expurgar_em?: string | null
          id?: string
          respondendo_id?: string | null
          sistema?: string | null
          sistema_dados?: Json | null
          tem_cpf?: boolean
          texto?: string | null
        }
        Update: {
          anexos?: Json
          autor_id?: string | null
          conversa_id?: string
          criado_em?: string
          curtida_em?: string | null
          curtida_por?: string | null
          disparo_id?: string | null
          empresa_id?: string
          expurgado_em?: string | null
          expurgar_em?: string | null
          id?: string
          respondendo_id?: string | null
          sistema?: string | null
          sistema_dados?: Json | null
          tem_cpf?: boolean
          texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_mensagens_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chat_conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_mensagens_curtida_por_fkey"
            columns: ["curtida_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_mensagens_disparo_id_fkey"
            columns: ["disparo_id"]
            isOneToOne: false
            referencedRelation: "chat_disparos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_mensagens_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_mensagens_respondendo_id_fkey"
            columns: ["respondendo_id"]
            isOneToOne: false
            referencedRelation: "chat_mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_participantes: {
        Row: {
          adicionado_por: string | null
          admin: boolean
          apagada_em: string | null
          conversa_id: string
          entrou_em: string
          fixada_em: string | null
          oculta_em: string | null
          perfil_id: string
          saiu_em: string | null
          ultima_atividade_em: string | null
          ultima_entrega_em: string | null
          ultima_leitura_em: string | null
        }
        Insert: {
          adicionado_por?: string | null
          admin?: boolean
          apagada_em?: string | null
          conversa_id: string
          entrou_em?: string
          fixada_em?: string | null
          oculta_em?: string | null
          perfil_id: string
          saiu_em?: string | null
          ultima_atividade_em?: string | null
          ultima_entrega_em?: string | null
          ultima_leitura_em?: string | null
        }
        Update: {
          adicionado_por?: string | null
          admin?: boolean
          apagada_em?: string | null
          conversa_id?: string
          entrou_em?: string
          fixada_em?: string | null
          oculta_em?: string | null
          perfil_id?: string
          saiu_em?: string | null
          ultima_atividade_em?: string | null
          ultima_entrega_em?: string | null
          ultima_leitura_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_participantes_adicionado_por_fkey"
            columns: ["adicionado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_participantes_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chat_conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_participantes_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      comemoracao_homenageados: {
        Row: {
          comemoracao_id: string
          operador_id: string
          setores_escolhidos: string[]
        }
        Insert: {
          comemoracao_id: string
          operador_id: string
          setores_escolhidos?: string[]
        }
        Update: {
          comemoracao_id?: string
          operador_id?: string
          setores_escolhidos?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "comemoracao_homenageados_comemoracao_id_fkey"
            columns: ["comemoracao_id"]
            isOneToOne: false
            referencedRelation: "comemoracoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comemoracao_homenageados_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      comemoracao_midias: {
        Row: {
          caminho: string
          criado_em: string
          criado_por: string | null
          empresa_id: string
          expira_em: string | null
          fixada: boolean
          id: string
          inicio_s: number
          nome: string
          tipo: string
          trecho_s: number | null
          url: string
        }
        Insert: {
          caminho: string
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          expira_em?: string | null
          fixada?: boolean
          id?: string
          inicio_s?: number
          nome: string
          tipo: string
          trecho_s?: number | null
          url: string
        }
        Update: {
          caminho?: string
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          expira_em?: string | null
          fixada?: boolean
          id?: string
          inicio_s?: number
          nome?: string
          tipo?: string
          trecho_s?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "comemoracao_midias_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comemoracao_midias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      comemoracao_midias_expurgo: {
        Row: {
          bucket: string
          caminho: string
          criado_em: string
          empresa_id: string
          id: string
          removido_em: string | null
        }
        Insert: {
          bucket?: string
          caminho: string
          criado_em?: string
          empresa_id: string
          id?: string
          removido_em?: string | null
        }
        Update: {
          bucket?: string
          caminho?: string
          criado_em?: string
          empresa_id?: string
          id?: string
          removido_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comemoracao_midias_expurgo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      comemoracao_parabens: {
        Row: {
          comemoracao_id: string
          criado_em: string
          frase: string
          usuario_id: string
        }
        Insert: {
          comemoracao_id: string
          criado_em?: string
          frase: string
          usuario_id: string
        }
        Update: {
          comemoracao_id?: string
          criado_em?: string
          frase?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comemoracao_parabens_comemoracao_id_fkey"
            columns: ["comemoracao_id"]
            isOneToOne: false
            referencedRelation: "comemoracoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comemoracao_parabens_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      comemoracoes: {
        Row: {
          alvo_tipo: string
          anim_texto: string
          cancelada_em: string | null
          criado_em: string
          criado_por: string | null
          duracao_s: number
          efeito: string
          empresa_id: string
          empresa_inteira: boolean
          equipe_id: string | null
          equipes_alvo: string[]
          finalizada_em: string | null
          gif_midia_id: string | null
          id: string
          inicia_em: string
          layout: Json
          mensagem: string | null
          modelo: string
          setor_id: string | null
          setores_alvo: string[]
          som: string
          som_midia_id: string | null
          somente_equipe: boolean
          titulo: string
          volume: number
        }
        Insert: {
          alvo_tipo?: string
          anim_texto?: string
          cancelada_em?: string | null
          criado_em?: string
          criado_por?: string | null
          duracao_s?: number
          efeito?: string
          empresa_id: string
          empresa_inteira?: boolean
          equipe_id?: string | null
          equipes_alvo?: string[]
          finalizada_em?: string | null
          gif_midia_id?: string | null
          id?: string
          inicia_em?: string
          layout?: Json
          mensagem?: string | null
          modelo?: string
          setor_id?: string | null
          setores_alvo?: string[]
          som?: string
          som_midia_id?: string | null
          somente_equipe?: boolean
          titulo: string
          volume?: number
        }
        Update: {
          alvo_tipo?: string
          anim_texto?: string
          cancelada_em?: string | null
          criado_em?: string
          criado_por?: string | null
          duracao_s?: number
          efeito?: string
          empresa_id?: string
          empresa_inteira?: boolean
          equipe_id?: string | null
          equipes_alvo?: string[]
          finalizada_em?: string | null
          gif_midia_id?: string | null
          id?: string
          inicia_em?: string
          layout?: Json
          mensagem?: string | null
          modelo?: string
          setor_id?: string | null
          setores_alvo?: string[]
          som?: string
          som_midia_id?: string | null
          somente_equipe?: boolean
          titulo?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "comemoracoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comemoracoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comemoracoes_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comemoracoes_gif_midia_id_fkey"
            columns: ["gif_midia_id"]
            isOneToOne: false
            referencedRelation: "comemoracao_midias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comemoracoes_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comemoracoes_som_midia_id_fkey"
            columns: ["som_midia_id"]
            isOneToOne: false
            referencedRelation: "comemoracao_midias"
            referencedColumns: ["id"]
          },
        ]
      }
      composicao_mes: {
        Row: {
          ativo: boolean | null
          cargo: string | null
          criado_em: string
          desligado_em: string | null
          email: string | null
          empresa_id: string
          equipe_id: string | null
          equipe_nome: string | null
          equipes_clone: string[]
          foto_url: string | null
          mes: string
          nome: string | null
          operador_id: string
          setor_id: string | null
          situacao: string
          usuario: string | null
        }
        Insert: {
          ativo?: boolean | null
          cargo?: string | null
          criado_em?: string
          desligado_em?: string | null
          email?: string | null
          empresa_id: string
          equipe_id?: string | null
          equipe_nome?: string | null
          equipes_clone?: string[]
          foto_url?: string | null
          mes: string
          nome?: string | null
          operador_id: string
          setor_id?: string | null
          situacao?: string
          usuario?: string | null
        }
        Update: {
          ativo?: boolean | null
          cargo?: string | null
          criado_em?: string
          desligado_em?: string | null
          email?: string | null
          empresa_id?: string
          equipe_id?: string | null
          equipe_nome?: string | null
          equipes_clone?: string[]
          foto_url?: string | null
          mes?: string
          nome?: string | null
          operador_id?: string
          setor_id?: string | null
          situacao?: string
          usuario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "composicao_mes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      composicao_mes_backup_2026_08: {
        Row: {
          criado_em: string | null
          empresa_id: string | null
          equipe_id: string | null
          equipe_nome: string | null
          equipes_clone: string[] | null
          mes: string | null
          operador_id: string | null
          setor_id: string | null
          situacao: string | null
        }
        Insert: {
          criado_em?: string | null
          empresa_id?: string | null
          equipe_id?: string | null
          equipe_nome?: string | null
          equipes_clone?: string[] | null
          mes?: string | null
          operador_id?: string | null
          setor_id?: string | null
          situacao?: string | null
        }
        Update: {
          criado_em?: string | null
          empresa_id?: string | null
          equipe_id?: string | null
          equipe_nome?: string | null
          equipes_clone?: string[] | null
          mes?: string | null
          operador_id?: string | null
          setor_id?: string | null
          situacao?: string | null
        }
        Relationships: []
      }
      composicao_mes_equipe: {
        Row: {
          empresa_id: string
          equipe_id: string
          mes: string
          nome: string
          setor_id: string | null
        }
        Insert: {
          empresa_id: string
          equipe_id: string
          mes: string
          nome: string
          setor_id?: string | null
        }
        Update: {
          empresa_id?: string
          equipe_id?: string
          mes?: string
          nome?: string
          setor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "composicao_mes_equipe_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      composicao_mes_equipe_backup_2026_08: {
        Row: {
          empresa_id: string | null
          equipe_id: string | null
          mes: string | null
          nome: string | null
          setor_id: string | null
        }
        Insert: {
          empresa_id?: string | null
          equipe_id?: string | null
          mes?: string | null
          nome?: string | null
          setor_id?: string | null
        }
        Update: {
          empresa_id?: string | null
          equipe_id?: string | null
          mes?: string | null
          nome?: string | null
          setor_id?: string | null
        }
        Relationships: []
      }
      composicao_mes_lider: {
        Row: {
          criado_em: string
          empresa_id: string
          equipe_id: string
          lider_id: string
          mes: string
          ordem: number
        }
        Insert: {
          criado_em?: string
          empresa_id: string
          equipe_id: string
          lider_id: string
          mes: string
          ordem?: number
        }
        Update: {
          criado_em?: string
          empresa_id?: string
          equipe_id?: string
          lider_id?: string
          mes?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "composicao_mes_lider_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      composicao_mes_setor: {
        Row: {
          alternativo: boolean | null
          ativo: boolean | null
          criado_em: string
          empresa_id: string
          mes: string
          nome: string
          setor_id: string
        }
        Insert: {
          alternativo?: boolean | null
          ativo?: boolean | null
          criado_em?: string
          empresa_id: string
          mes: string
          nome: string
          setor_id: string
        }
        Update: {
          alternativo?: boolean | null
          ativo?: boolean | null
          criado_em?: string
          empresa_id?: string
          mes?: string
          nome?: string
          setor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "composicao_mes_setor_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      contribuicao_receptivo: {
        Row: {
          acumulado: number
          atualizado_em: string
          atualizado_por: string | null
          criado_em: string
          empresa_id: string
          id: string
          mes: string
          meta: number
          setor_id: string
        }
        Insert: {
          acumulado?: number
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          empresa_id: string
          id?: string
          mes: string
          meta?: number
          setor_id: string
        }
        Update: {
          acumulado?: number
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          empresa_id?: string
          id?: string
          mes?: string
          meta?: number
          setor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contribuicao_receptivo_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contribuicao_receptivo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contribuicao_receptivo_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      creators_lab_fliperama: {
        Row: {
          duracao_ms: number | null
          finalizado_em: string | null
          iniciado_em: string
          pontos: number
          usuario_id: string
          venceu: boolean
          vidas_usadas: number
        }
        Insert: {
          duracao_ms?: number | null
          finalizado_em?: string | null
          iniciado_em?: string
          pontos?: number
          usuario_id: string
          venceu?: boolean
          vidas_usadas?: number
        }
        Update: {
          duracao_ms?: number | null
          finalizado_em?: string | null
          iniciado_em?: string
          pontos?: number
          usuario_id?: string
          venceu?: boolean
          vidas_usadas?: number
        }
        Relationships: [
          {
            foreignKeyName: "creators_lab_fliperama_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      creators_lab_progresso: {
        Row: {
          atualizado_em: string
          descoberto_em: string
          elegivel_painel: boolean
          progresso: Json
          usuario_id: string
        }
        Insert: {
          atualizado_em?: string
          descoberto_em?: string
          elegivel_painel?: boolean
          progresso?: Json
          usuario_id: string
        }
        Update: {
          atualizado_em?: string
          descoberto_em?: string
          elegivel_painel?: boolean
          progresso?: Json
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creators_lab_progresso_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      desafios: {
        Row: {
          arte_caminho: string | null
          arte_url: string | null
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          criado_por_nome: string | null
          data_fim: string
          data_inicio: string
          descricao: string | null
          empresa_id: string
          empresas: string[]
          id: string
          midia_caminho: string | null
          midia_url: string | null
          nome: string
          premio: string | null
          regra: Json
          setor_id: string | null
          status: string
          tipo: string
          visibilidade: string
          visual: Json
        }
        Insert: {
          arte_caminho?: string | null
          arte_url?: string | null
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data_fim: string
          data_inicio: string
          descricao?: string | null
          empresa_id: string
          empresas?: string[]
          id?: string
          midia_caminho?: string | null
          midia_url?: string | null
          nome: string
          premio?: string | null
          regra?: Json
          setor_id?: string | null
          status?: string
          tipo?: string
          visibilidade?: string
          visual?: Json
        }
        Update: {
          arte_caminho?: string | null
          arte_url?: string | null
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data_fim?: string
          data_inicio?: string
          descricao?: string | null
          empresa_id?: string
          empresas?: string[]
          id?: string
          midia_caminho?: string | null
          midia_url?: string | null
          nome?: string
          premio?: string | null
          regra?: Json
          setor_id?: string | null
          status?: string
          tipo?: string
          visibilidade?: string
          visual?: Json
        }
        Relationships: [
          {
            foreignKeyName: "desafios_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "desafios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "desafios_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      desafios_setores: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          empresa_id: string
          setor_id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          empresa_id: string
          setor_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          empresa_id?: string
          setor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "desafios_setores_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "desafios_setores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "desafios_setores_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      diario_recebimentos: {
        Row: {
          acordo_codigo: string | null
          chave_unica: string
          cliente_codigo: string | null
          data_pagamento: string | null
          dia_referencia: string
          empresa_id: string
          forma_pagamento: string
          id: string
          id_baixa: string | null
          import_index: number
          importado_em: string
          importado_por_id: string | null
          instituicao: string | null
          lote_id: string
          nome_cliente: string | null
          operador_id: string | null
          operador_usuario: string
          prox_contato: string | null
          setor_id: string | null
          tabulacao: string | null
          valor_recebido: number
          visto: boolean
        }
        Insert: {
          acordo_codigo?: string | null
          chave_unica: string
          cliente_codigo?: string | null
          data_pagamento?: string | null
          dia_referencia: string
          empresa_id: string
          forma_pagamento?: string
          id?: string
          id_baixa?: string | null
          import_index?: number
          importado_em?: string
          importado_por_id?: string | null
          instituicao?: string | null
          lote_id: string
          nome_cliente?: string | null
          operador_id?: string | null
          operador_usuario: string
          prox_contato?: string | null
          setor_id?: string | null
          tabulacao?: string | null
          valor_recebido?: number
          visto?: boolean
        }
        Update: {
          acordo_codigo?: string | null
          chave_unica?: string
          cliente_codigo?: string | null
          data_pagamento?: string | null
          dia_referencia?: string
          empresa_id?: string
          forma_pagamento?: string
          id?: string
          id_baixa?: string | null
          import_index?: number
          importado_em?: string
          importado_por_id?: string | null
          instituicao?: string | null
          lote_id?: string
          nome_cliente?: string | null
          operador_id?: string | null
          operador_usuario?: string
          prox_contato?: string | null
          setor_id?: string | null
          tabulacao?: string | null
          valor_recebido?: number
          visto?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "diario_recebimentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diario_recebimentos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diario_recebimentos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      direto_extra_config: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          empresa_id: string
          escopo: string
          id: string
          referencia_id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          empresa_id: string
          escopo: string
          id?: string
          referencia_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          empresa_id?: string
          escopo?: string
          id?: string
          referencia_id?: string
        }
        Relationships: []
      }
      documentos_lgpd: {
        Row: {
          atualizado_em: string
          conteudo: string
          criado_em: string
          empresa_id: string | null
          id: string
          tipo: string
          titulo: string
          versao: string
        }
        Insert: {
          atualizado_em?: string
          conteudo: string
          criado_em?: string
          empresa_id?: string | null
          id?: string
          tipo: string
          titulo: string
          versao?: string
        }
        Update: {
          atualizado_em?: string
          conteudo?: string
          criado_em?: string
          empresa_id?: string | null
          id?: string
          tipo?: string
          titulo?: string
          versao?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_lgpd_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          ativo: boolean
          atualizado_em: string
          config: Json | null
          criado_em: string
          id: string
          nome: string
          produto: string
          slug: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          config?: Json | null
          criado_em?: string
          id?: string
          nome: string
          produto: string
          slug: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          config?: Json | null
          criado_em?: string
          id?: string
          nome?: string
          produto?: string
          slug?: string
        }
        Relationships: []
      }
      equipe_lideres: {
        Row: {
          criado_em: string
          criado_por: string | null
          empresa_id: string
          equipe_id: string
          id: string
          lider_id: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          equipe_id: string
          id?: string
          lider_id: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          equipe_id?: string
          id?: string
          lider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_lideres_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_lideres_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_lideres_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_lideres_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_operadores_clones: {
        Row: {
          conta_recebimento: boolean
          criado_em: string
          criado_por: string | null
          empresa_id: string
          equipe_id: string
          id: string
          operador_id: string
        }
        Insert: {
          conta_recebimento?: boolean
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          equipe_id: string
          id?: string
          operador_id: string
        }
        Update: {
          conta_recebimento?: boolean
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          equipe_id?: string
          id?: string
          operador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_operadores_clones_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_operadores_clones_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_operadores_clones_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_operadores_clones_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_subgrupos: {
        Row: {
          criado_em: string
          criado_por: string | null
          empresa_id: string
          equipe_id: string
          id: string
          nome: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          equipe_id: string
          id?: string
          nome: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          equipe_id?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_subgrupos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_subgrupos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_subgrupos_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      equipes: {
        Row: {
          created_at: string | null
          empresa_id: string | null
          id: string
          nome: string
          setor_id: string | null
          treinamento: boolean
          treinamento_inicio: string | null
        }
        Insert: {
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          nome: string
          setor_id?: string | null
          treinamento?: boolean
          treinamento_inicio?: string | null
        }
        Update: {
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          nome?: string
          setor_id?: string | null
          treinamento?: boolean
          treinamento_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipes_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_acordos: {
        Row: {
          acordo_id: string
          campo_alterado: string
          criado_em: string
          empresa_id: string | null
          id: string
          usuario_id: string
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          acordo_id: string
          campo_alterado: string
          criado_em?: string
          empresa_id?: string | null
          id?: string
          usuario_id: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          acordo_id?: string
          campo_alterado?: string
          criado_em?: string
          empresa_id?: string | null
          id?: string
          usuario_id?: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_acordos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_acordos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos_deduplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_acordos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_localizacoes: {
        Row: {
          cidade: string | null
          consultado_em: string | null
          estado: string | null
          estado_codigo: string | null
          expira_em: string
          ip: unknown
          pais: string | null
          pais_codigo: string | null
          status: string
          ultima_tentativa_em: string
          ultimo_erro: string | null
        }
        Insert: {
          cidade?: string | null
          consultado_em?: string | null
          estado?: string | null
          estado_codigo?: string | null
          expira_em?: string
          ip: unknown
          pais?: string | null
          pais_codigo?: string | null
          status?: string
          ultima_tentativa_em?: string
          ultimo_erro?: string | null
        }
        Update: {
          cidade?: string | null
          consultado_em?: string | null
          estado?: string | null
          estado_codigo?: string | null
          expira_em?: string
          ip?: unknown
          pais?: string | null
          pais_codigo?: string | null
          status?: string
          ultima_tentativa_em?: string
          ultimo_erro?: string | null
        }
        Relationships: []
      }
      lixeira_acordos: {
        Row: {
          acordo_id: string
          autorizado_por_id: string | null
          autorizado_por_nome: string | null
          dados_completos: Json | null
          empresa_id: string | null
          excluido_em: string | null
          expira_em: string | null
          id: string
          instituicao: string | null
          motivo: string | null
          nome_cliente: string | null
          nr_cliente: string | null
          observacoes: string | null
          operador_id: string | null
          operador_nome: string | null
          status: string | null
          tipo: string | null
          transferido_para_id: string | null
          transferido_para_nome: string | null
          valor: number | null
          vencimento: string | null
        }
        Insert: {
          acordo_id: string
          autorizado_por_id?: string | null
          autorizado_por_nome?: string | null
          dados_completos?: Json | null
          empresa_id?: string | null
          excluido_em?: string | null
          expira_em?: string | null
          id?: string
          instituicao?: string | null
          motivo?: string | null
          nome_cliente?: string | null
          nr_cliente?: string | null
          observacoes?: string | null
          operador_id?: string | null
          operador_nome?: string | null
          status?: string | null
          tipo?: string | null
          transferido_para_id?: string | null
          transferido_para_nome?: string | null
          valor?: number | null
          vencimento?: string | null
        }
        Update: {
          acordo_id?: string
          autorizado_por_id?: string | null
          autorizado_por_nome?: string | null
          dados_completos?: Json | null
          empresa_id?: string | null
          excluido_em?: string | null
          expira_em?: string | null
          id?: string
          instituicao?: string | null
          motivo?: string | null
          nome_cliente?: string | null
          nr_cliente?: string | null
          observacoes?: string | null
          operador_id?: string | null
          operador_nome?: string | null
          status?: string | null
          tipo?: string | null
          transferido_para_id?: string | null
          transferido_para_nome?: string | null
          valor?: number | null
          vencimento?: string | null
        }
        Relationships: []
      }
      lixeira_pix_automatico: {
        Row: {
          acordo_id: string
          dados_completos: Json
          empresa_id: string
          excluido_em: string
          excluido_por: string | null
          excluido_por_nome: string | null
          expira_em: string
          id: string
          nr_cliente: string
          operador_id: string | null
          operador_nome: string | null
          setor_id: string | null
          status: string
          valor: number
        }
        Insert: {
          acordo_id: string
          dados_completos: Json
          empresa_id: string
          excluido_em?: string
          excluido_por?: string | null
          excluido_por_nome?: string | null
          expira_em?: string
          id?: string
          nr_cliente: string
          operador_id?: string | null
          operador_nome?: string | null
          setor_id?: string | null
          status: string
          valor: number
        }
        Update: {
          acordo_id?: string
          dados_completos?: Json
          empresa_id?: string
          excluido_em?: string
          excluido_por?: string | null
          excluido_por_nome?: string | null
          expira_em?: string
          id?: string
          nr_cliente?: string
          operador_id?: string | null
          operador_nome?: string | null
          setor_id?: string | null
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "lixeira_pix_automatico_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      login_busca_limite: {
        Row: {
          atualizado_em: string
          janela_inicio: string
          origem: string
          vazias: number
        }
        Insert: {
          atualizado_em?: string
          janela_inicio?: string
          origem: string
          vazias?: number
        }
        Update: {
          atualizado_em?: string
          janela_inicio?: string
          origem?: string
          vazias?: number
        }
        Relationships: []
      }
      logs_sistema: {
        Row: {
          acao: string
          alvo_rotulo: string | null
          alvo_tipo: string | null
          antes: Json | null
          campos: string[] | null
          categoria: string
          criado_em: string
          depois: Json | null
          descricao: string | null
          detalhes: Json | null
          dispositivo_alterado: boolean
          dispositivo_anterior_id: string | null
          dispositivo_id: string | null
          empresa_id: string | null
          id: string
          ip: string | null
          origem: string
          registro_id: string | null
          rota: string | null
          severidade: string
          tabela: string | null
          user_agent: string | null
          usuario_cargo: string | null
          usuario_email: string | null
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          acao: string
          alvo_rotulo?: string | null
          alvo_tipo?: string | null
          antes?: Json | null
          campos?: string[] | null
          categoria?: string
          criado_em?: string
          depois?: Json | null
          descricao?: string | null
          detalhes?: Json | null
          dispositivo_alterado?: boolean
          dispositivo_anterior_id?: string | null
          dispositivo_id?: string | null
          empresa_id?: string | null
          id?: string
          ip?: string | null
          origem?: string
          registro_id?: string | null
          rota?: string | null
          severidade?: string
          tabela?: string | null
          user_agent?: string | null
          usuario_cargo?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          acao?: string
          alvo_rotulo?: string | null
          alvo_tipo?: string | null
          antes?: Json | null
          campos?: string[] | null
          categoria?: string
          criado_em?: string
          depois?: Json | null
          descricao?: string | null
          detalhes?: Json | null
          dispositivo_alterado?: boolean
          dispositivo_anterior_id?: string | null
          dispositivo_id?: string | null
          empresa_id?: string | null
          id?: string
          ip?: string | null
          origem?: string
          registro_id?: string | null
          rota?: string | null
          severidade?: string
          tabela?: string | null
          user_agent?: string | null
          usuario_cargo?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_sistema_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_sistema_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_lateral_ordem: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          cargo: string
          empresa_id: string
          ordem: string[]
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          cargo?: string
          empresa_id: string
          ordem?: string[]
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          cargo?: string
          empresa_id?: string
          ordem?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "menu_lateral_ordem_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_lateral_ordem_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      mestre_equipes: {
        Row: {
          atualizado_em: string
          cod_grupo_filtro: string
          criado_em: string
          destino: string
          destino_setor_id: string | null
          empresa_id: string
          equipe_id: string | null
          estado: string
          id: string
          nome_subgrupo: string
          primeira_aparicao: string
          ultima_aparicao: string
        }
        Insert: {
          atualizado_em?: string
          cod_grupo_filtro: string
          criado_em?: string
          destino?: string
          destino_setor_id?: string | null
          empresa_id: string
          equipe_id?: string | null
          estado?: string
          id?: string
          nome_subgrupo: string
          primeira_aparicao: string
          ultima_aparicao: string
        }
        Update: {
          atualizado_em?: string
          cod_grupo_filtro?: string
          criado_em?: string
          destino?: string
          destino_setor_id?: string | null
          empresa_id?: string
          equipe_id?: string | null
          estado?: string
          id?: string
          nome_subgrupo?: string
          primeira_aparicao?: string
          ultima_aparicao?: string
        }
        Relationships: [
          {
            foreignKeyName: "mestre_equipes_destino_setor_id_fkey"
            columns: ["destino_setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mestre_equipes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mestre_equipes_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      mestre_eventos: {
        Row: {
          cod_grupo_filtro: string | null
          criado_em: string
          detalhes: Json | null
          empresa_id: string
          id: number
          lote_id: string | null
          rotulo: string | null
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          cod_grupo_filtro?: string | null
          criado_em?: string
          detalhes?: Json | null
          empresa_id: string
          id?: never
          lote_id?: string | null
          rotulo?: string | null
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          cod_grupo_filtro?: string | null
          criado_em?: string
          detalhes?: Json | null
          empresa_id?: string
          id?: never
          lote_id?: string | null
          rotulo?: string | null
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mestre_eventos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mestre_eventos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "mestre_lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mestre_eventos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      mestre_grupos: {
        Row: {
          atualizado_em: string
          cod_grupo_filtro: string
          criado_em: string
          empresa_id: string
          estado: string
          id: string
          nome_grupo_filtro: string
          observacao: string | null
          primeira_aparicao: string
          setor_id: string | null
          ultima_aparicao: string
          vinculado_em: string | null
          vinculado_por_id: string | null
        }
        Insert: {
          atualizado_em?: string
          cod_grupo_filtro: string
          criado_em?: string
          empresa_id: string
          estado?: string
          id?: string
          nome_grupo_filtro?: string
          observacao?: string | null
          primeira_aparicao: string
          setor_id?: string | null
          ultima_aparicao: string
          vinculado_em?: string | null
          vinculado_por_id?: string | null
        }
        Update: {
          atualizado_em?: string
          cod_grupo_filtro?: string
          criado_em?: string
          empresa_id?: string
          estado?: string
          id?: string
          nome_grupo_filtro?: string
          observacao?: string | null
          primeira_aparicao?: string
          setor_id?: string | null
          ultima_aparicao?: string
          vinculado_em?: string | null
          vinculado_por_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mestre_grupos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mestre_grupos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mestre_grupos_vinculado_por_id_fkey"
            columns: ["vinculado_por_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      mestre_lotes: {
        Row: {
          arquivo_hash: string
          arquivo_nome: string
          empresa_id: string
          estado: string
          id: string
          importado_em: string
          importado_por_id: string | null
          linhas: number
          mes: string
          promovido_em: string | null
          substituido_em: string | null
          substituido_por: string | null
          total_recebido: number
        }
        Insert: {
          arquivo_hash: string
          arquivo_nome: string
          empresa_id: string
          estado?: string
          id?: string
          importado_em?: string
          importado_por_id?: string | null
          linhas?: number
          mes: string
          promovido_em?: string | null
          substituido_em?: string | null
          substituido_por?: string | null
          total_recebido?: number
        }
        Update: {
          arquivo_hash?: string
          arquivo_nome?: string
          empresa_id?: string
          estado?: string
          id?: string
          importado_em?: string
          importado_por_id?: string | null
          linhas?: number
          mes?: string
          promovido_em?: string | null
          substituido_em?: string | null
          substituido_por?: string | null
          total_recebido?: number
        }
        Relationships: [
          {
            foreignKeyName: "mestre_lotes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mestre_lotes_importado_por_id_fkey"
            columns: ["importado_por_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mestre_lotes_substituido_por_fkey"
            columns: ["substituido_por"]
            isOneToOne: false
            referencedRelation: "mestre_lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      mestre_recebimentos: {
        Row: {
          cliente: string
          cobradora: string
          cod_cli: string
          cod_grupo: string
          cod_grupo_filtro: string
          cod_grupo_representa: string | null
          colchao: boolean
          dias: number | null
          dias_atraso: number | null
          dias_ligacao_baixa: number | null
          dt_lig: string | null
          dt_pgto: string
          empresa_erp: string
          empresa_id: string
          id: number
          linha_num: number
          lote_id: string
          mes: string
          nome_grupo_filtro: string
          nr_documento: string
          operador_id: string | null
          operador_orig: string | null
          operador_setor_id: string | null
          parcela: string
          prev_pgto: string | null
          recebido: number
          setor: string
          setor_orig: string | null
          subgrupo_equipe: string
          tipo: string
          tipo_venda: string | null
          titulo: string
          tp_doc: string
        }
        Insert: {
          cliente?: string
          cobradora?: string
          cod_cli?: string
          cod_grupo?: string
          cod_grupo_filtro: string
          cod_grupo_representa?: string | null
          colchao?: boolean
          dias?: number | null
          dias_atraso?: number | null
          dias_ligacao_baixa?: number | null
          dt_lig?: string | null
          dt_pgto: string
          empresa_erp?: string
          empresa_id: string
          id?: never
          linha_num: number
          lote_id: string
          mes: string
          nome_grupo_filtro?: string
          nr_documento?: string
          operador_id?: string | null
          operador_orig?: string | null
          operador_setor_id?: string | null
          parcela?: string
          prev_pgto?: string | null
          recebido?: number
          setor?: string
          setor_orig?: string | null
          subgrupo_equipe?: string
          tipo?: string
          tipo_venda?: string | null
          titulo?: string
          tp_doc?: string
        }
        Update: {
          cliente?: string
          cobradora?: string
          cod_cli?: string
          cod_grupo?: string
          cod_grupo_filtro?: string
          cod_grupo_representa?: string | null
          colchao?: boolean
          dias?: number | null
          dias_atraso?: number | null
          dias_ligacao_baixa?: number | null
          dt_lig?: string | null
          dt_pgto?: string
          empresa_erp?: string
          empresa_id?: string
          id?: never
          linha_num?: number
          lote_id?: string
          mes?: string
          nome_grupo_filtro?: string
          nr_documento?: string
          operador_id?: string | null
          operador_orig?: string | null
          operador_setor_id?: string | null
          parcela?: string
          prev_pgto?: string | null
          recebido?: number
          setor?: string
          setor_orig?: string | null
          subgrupo_equipe?: string
          tipo?: string
          tipo_venda?: string | null
          titulo?: string
          tp_doc?: string
        }
        Relationships: [
          {
            foreignKeyName: "mestre_recebimentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mestre_recebimentos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "mestre_lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mestre_recebimentos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mestre_recebimentos_operador_setor_id_fkey"
            columns: ["operador_setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      metas: {
        Row: {
          ano: number
          created_at: string | null
          criado_por: string | null
          empresa_id: string
          id: string
          mes: number
          meta_acordos: number
          meta_indireta_ativa: boolean
          meta_indireta_valor: number
          meta_proporcional: boolean
          meta_valor: number
          metas_extras: Json
          referencia_id: string
          tipo: string
          updated_at: string | null
        }
        Insert: {
          ano: number
          created_at?: string | null
          criado_por?: string | null
          empresa_id: string
          id?: string
          mes: number
          meta_acordos?: number
          meta_indireta_ativa?: boolean
          meta_indireta_valor?: number
          meta_proporcional?: boolean
          meta_valor?: number
          metas_extras?: Json
          referencia_id: string
          tipo: string
          updated_at?: string | null
        }
        Update: {
          ano?: number
          created_at?: string | null
          criado_por?: string | null
          empresa_id?: string
          id?: string
          mes?: number
          meta_acordos?: number
          meta_indireta_ativa?: boolean
          meta_indireta_valor?: number
          meta_proporcional?: boolean
          meta_valor?: number
          metas_extras?: Json
          referencia_id?: string
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      metas_config_mes: {
        Row: {
          ano: number
          atualizado_em: string
          atualizado_por: string | null
          contar_dia_atual: boolean
          criado_em: string
          empresa_id: string
          feriados: Json
          id: string
          mes: number
          quartis: Json
        }
        Insert: {
          ano: number
          atualizado_em?: string
          atualizado_por?: string | null
          contar_dia_atual?: boolean
          criado_em?: string
          empresa_id: string
          feriados?: Json
          id?: string
          mes: number
          quartis?: Json
        }
        Update: {
          ano?: number
          atualizado_em?: string
          atualizado_por?: string | null
          contar_dia_atual?: boolean
          criado_em?: string
          empresa_id?: string
          feriados?: Json
          id?: string
          mes?: number
          quartis?: Json
        }
        Relationships: [
          {
            foreignKeyName: "metas_config_mes_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_config_mes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      metas_validacoes: {
        Row: {
          ano: number
          empresa_id: string
          id: string
          mes: number
          motivo_reabertura: string | null
          reaberto_em: string | null
          reaberto_por: string | null
          setor_id: string
          status: string
          validado_em: string | null
          validado_por: string | null
        }
        Insert: {
          ano: number
          empresa_id: string
          id?: string
          mes: number
          motivo_reabertura?: string | null
          reaberto_em?: string | null
          reaberto_por?: string | null
          setor_id: string
          status?: string
          validado_em?: string | null
          validado_por?: string | null
        }
        Update: {
          ano?: number
          empresa_id?: string
          id?: string
          mes?: number
          motivo_reabertura?: string | null
          reaberto_em?: string | null
          reaberto_por?: string | null
          setor_id?: string
          status?: string
          validado_em?: string | null
          validado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metas_validacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_validacoes_reaberto_por_fkey"
            columns: ["reaberto_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_validacoes_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_validacoes_validado_por_fkey"
            columns: ["validado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos_mensagem: {
        Row: {
          ativo: boolean
          conteudo: string
          criado_em: string
          empresa_id: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          conteudo: string
          criado_em?: string
          empresa_id: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          conteudo?: string
          criado_em?: string
          empresa_id?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "modelos_mensagem_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          acordo_id: string | null
          autor_foto: string | null
          autor_id: string | null
          autor_nome: string | null
          criado_em: string
          empresa_id: string | null
          id: string
          lida: boolean
          mensagem: string
          rota: string | null
          titulo: string
          usuario_id: string | null
        }
        Insert: {
          acordo_id?: string | null
          autor_foto?: string | null
          autor_id?: string | null
          autor_nome?: string | null
          criado_em?: string
          empresa_id?: string | null
          id?: string
          lida?: boolean
          mensagem: string
          rota?: string | null
          titulo: string
          usuario_id?: string | null
        }
        Update: {
          acordo_id?: string | null
          autor_foto?: string | null
          autor_id?: string | null
          autor_nome?: string | null
          criado_em?: string
          empresa_id?: string | null
          id?: string
          lida?: boolean
          mensagem?: string
          rota?: string | null
          titulo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos_deduplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      nr_registros: {
        Row: {
          acordo_id: string
          atualizado_em: string
          campo: string
          criado_em: string
          empresa_id: string
          id: string
          nr_value: string
          operador_id: string
          operador_nome: string | null
        }
        Insert: {
          acordo_id: string
          atualizado_em?: string
          campo?: string
          criado_em?: string
          empresa_id: string
          id?: string
          nr_value: string
          operador_id: string
          operador_nome?: string | null
        }
        Update: {
          acordo_id?: string
          atualizado_em?: string
          campo?: string
          criado_em?: string
          empresa_id?: string
          id?: string
          nr_value?: string
          operador_id?: string
          operador_nome?: string | null
        }
        Relationships: []
      }
      ouvidoria_acessos: {
        Row: {
          concedido_por: string | null
          concedido_por_nome: string | null
          criado_em: string
          empresa_id: string
          id: string
          nivel: string
          usuario_id: string
        }
        Insert: {
          concedido_por?: string | null
          concedido_por_nome?: string | null
          criado_em?: string
          empresa_id: string
          id?: string
          nivel?: string
          usuario_id: string
        }
        Update: {
          concedido_por?: string | null
          concedido_por_nome?: string | null
          criado_em?: string
          empresa_id?: string
          id?: string
          nivel?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ouvidoria_acessos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ouvidoria_acessos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      ouvidoria_atendimentos: {
        Row: {
          atualizado_em: string
          codigo: string | null
          criado_em: string
          criado_por: string | null
          criado_por_nome: string | null
          descricao: string | null
          email: string | null
          empresa_id: string
          estado_uf: string | null
          id: string
          iniciado_em: string
          link: string | null
          nome_cliente: string
          resolucao: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          resolvido_por_nome: string | null
          status: string
          tipo: string
          whatsapp: string | null
        }
        Insert: {
          atualizado_em?: string
          codigo?: string | null
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          descricao?: string | null
          email?: string | null
          empresa_id: string
          estado_uf?: string | null
          id?: string
          iniciado_em?: string
          link?: string | null
          nome_cliente: string
          resolucao?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          resolvido_por_nome?: string | null
          status?: string
          tipo?: string
          whatsapp?: string | null
        }
        Update: {
          atualizado_em?: string
          codigo?: string | null
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          descricao?: string | null
          email?: string | null
          empresa_id?: string
          estado_uf?: string | null
          id?: string
          iniciado_em?: string
          link?: string | null
          nome_cliente?: string
          resolucao?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          resolvido_por_nome?: string | null
          status?: string
          tipo?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ouvidoria_atendimentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ouvidoria_atendimentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis: {
        Row: {
          acesso_multiempresa: boolean
          acesso_multiempresa_em: string | null
          acesso_multiempresa_por_id: string | null
          arquivado: boolean
          ativo: boolean
          atualizado_em: string
          chat_bloqueado: boolean
          chat_boas_vindas_em: string | null
          criado_em: string
          desligado_em: string | null
          email: string
          empresa_id: string
          equipe_id: string | null
          ferias_ate: string | null
          ferias_desde: string | null
          foto_url: string | null
          id: string
          lider_id: string | null
          nome: string
          perfil: string
          pet_despedida: string | null
          senha_alterada: boolean
          setor_id: string | null
          situacao: string
          subgrupo_id: string | null
          tampermonkey_configured: boolean | null
          usuario: string | null
          viu_notificacao_chatplay: boolean | null
        }
        Insert: {
          acesso_multiempresa?: boolean
          acesso_multiempresa_em?: string | null
          acesso_multiempresa_por_id?: string | null
          arquivado?: boolean
          ativo?: boolean
          atualizado_em?: string
          chat_bloqueado?: boolean
          chat_boas_vindas_em?: string | null
          criado_em?: string
          desligado_em?: string | null
          email: string
          empresa_id: string
          equipe_id?: string | null
          ferias_ate?: string | null
          ferias_desde?: string | null
          foto_url?: string | null
          id: string
          lider_id?: string | null
          nome: string
          perfil: string
          pet_despedida?: string | null
          senha_alterada?: boolean
          setor_id?: string | null
          situacao?: string
          subgrupo_id?: string | null
          tampermonkey_configured?: boolean | null
          usuario?: string | null
          viu_notificacao_chatplay?: boolean | null
        }
        Update: {
          acesso_multiempresa?: boolean
          acesso_multiempresa_em?: string | null
          acesso_multiempresa_por_id?: string | null
          arquivado?: boolean
          ativo?: boolean
          atualizado_em?: string
          chat_bloqueado?: boolean
          chat_boas_vindas_em?: string | null
          criado_em?: string
          desligado_em?: string | null
          email?: string
          empresa_id?: string
          equipe_id?: string | null
          ferias_ate?: string | null
          ferias_desde?: string | null
          foto_url?: string | null
          id?: string
          lider_id?: string | null
          nome?: string
          perfil?: string
          pet_despedida?: string | null
          senha_alterada?: boolean
          setor_id?: string | null
          situacao?: string
          subgrupo_id?: string | null
          tampermonkey_configured?: boolean | null
          usuario?: string | null
          viu_notificacao_chatplay?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "perfis_acesso_multiempresa_por_id_fkey"
            columns: ["acesso_multiempresa_por_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_subgrupo_id_fkey"
            columns: ["subgrupo_id"]
            isOneToOne: false
            referencedRelation: "equipe_subgrupos"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis_empresas_acesso: {
        Row: {
          concedido_em: string
          concedido_por: string | null
          empresa_id: string
          perfil_id: string
        }
        Insert: {
          concedido_em?: string
          concedido_por?: string | null
          empresa_id: string
          perfil_id: string
        }
        Update: {
          concedido_em?: string
          concedido_por?: string | null
          empresa_id?: string
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfis_empresas_acesso_concedido_por_fkey"
            columns: ["concedido_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_empresas_acesso_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_empresas_acesso_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis_permissoes: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          empresa_id: string
          id: string
          permissoes: Json
          usuario_id: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          empresa_id: string
          id?: string
          permissoes?: Json
          usuario_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          empresa_id?: string
          id?: string
          permissoes?: Json
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfis_permissoes_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_permissoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_permissoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis_transferencias: {
        Row: {
          acordos_apagados: number
          clones_removidos: Json
          criado_em: string
          criado_por: string | null
          desfeita_em: string | null
          desfeita_por: string | null
          destino_empresa_id: string
          destino_setor_id: string | null
          empresa_id: string
          fantasma_ativo: boolean
          fantasma_removido_em: string | null
          fantasma_removido_por: string | null
          id: string
          levou_acordos: boolean
          mes: string
          origem_equipe_id: string | null
          origem_setor_id: string | null
          perfil_id: string
          perfil_nome: string | null
          relatorio_arquivo: string | null
          tipo: string
        }
        Insert: {
          acordos_apagados?: number
          clones_removidos?: Json
          criado_em?: string
          criado_por?: string | null
          desfeita_em?: string | null
          desfeita_por?: string | null
          destino_empresa_id: string
          destino_setor_id?: string | null
          empresa_id: string
          fantasma_ativo?: boolean
          fantasma_removido_em?: string | null
          fantasma_removido_por?: string | null
          id?: string
          levou_acordos: boolean
          mes: string
          origem_equipe_id?: string | null
          origem_setor_id?: string | null
          perfil_id: string
          perfil_nome?: string | null
          relatorio_arquivo?: string | null
          tipo: string
        }
        Update: {
          acordos_apagados?: number
          clones_removidos?: Json
          criado_em?: string
          criado_por?: string | null
          desfeita_em?: string | null
          desfeita_por?: string | null
          destino_empresa_id?: string
          destino_setor_id?: string | null
          empresa_id?: string
          fantasma_ativo?: boolean
          fantasma_removido_em?: string | null
          fantasma_removido_por?: string | null
          id?: string
          levou_acordos?: boolean
          mes?: string
          origem_equipe_id?: string | null
          origem_setor_id?: string | null
          perfil_id?: string
          perfil_nome?: string | null
          relatorio_arquivo?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfis_transferencias_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_transferencias_desfeita_por_fkey"
            columns: ["desfeita_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_transferencias_destino_empresa_id_fkey"
            columns: ["destino_empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_transferencias_destino_setor_id_fkey"
            columns: ["destino_setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_transferencias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_transferencias_fantasma_removido_por_fkey"
            columns: ["fantasma_removido_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_transferencias_origem_equipe_id_fkey"
            columns: ["origem_equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_transferencias_origem_setor_id_fkey"
            columns: ["origem_setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_transferencias_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      permissoes_backup_20260822_acordos: {
        Row: {
          atualizado_em: string | null
          cargo: string | null
          copiado_em: string | null
          criado_em: string | null
          descricao: string | null
          empresa_id: string | null
          id: string | null
          permissoes: Json | null
        }
        Insert: {
          atualizado_em?: string | null
          cargo?: string | null
          copiado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string | null
          permissoes?: Json | null
        }
        Update: {
          atualizado_em?: string | null
          cargo?: string | null
          copiado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string | null
          permissoes?: Json | null
        }
        Relationships: []
      }
      permissoes_backup_20260822_analitico: {
        Row: {
          atualizado_em: string | null
          cargo: string | null
          copiado_em: string | null
          criado_em: string | null
          descricao: string | null
          empresa_id: string | null
          id: string | null
          permissoes: Json | null
        }
        Insert: {
          atualizado_em?: string | null
          cargo?: string | null
          copiado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string | null
          permissoes?: Json | null
        }
        Update: {
          atualizado_em?: string | null
          cargo?: string | null
          copiado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string | null
          permissoes?: Json | null
        }
        Relationships: []
      }
      permissoes_backup_20260822_dashboard: {
        Row: {
          atualizado_em: string | null
          cargo: string | null
          copiado_em: string | null
          criado_em: string | null
          descricao: string | null
          empresa_id: string | null
          id: string | null
          permissoes: Json | null
        }
        Insert: {
          atualizado_em?: string | null
          cargo?: string | null
          copiado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string | null
          permissoes?: Json | null
        }
        Update: {
          atualizado_em?: string | null
          cargo?: string | null
          copiado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string | null
          permissoes?: Json | null
        }
        Relationships: []
      }
      permissoes_backup_20260822_diretoria: {
        Row: {
          atualizado_em: string | null
          cargo: string | null
          copiado_em: string | null
          criado_em: string | null
          descricao: string | null
          empresa_id: string | null
          id: string | null
          permissoes: Json | null
        }
        Insert: {
          atualizado_em?: string | null
          cargo?: string | null
          copiado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string | null
          permissoes?: Json | null
        }
        Update: {
          atualizado_em?: string | null
          cargo?: string | null
          copiado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string | null
          permissoes?: Json | null
        }
        Relationships: []
      }
      permissoes_backup_20260822_faxina: {
        Row: {
          atualizado_em: string | null
          cargo: string | null
          copiado_em: string | null
          criado_em: string | null
          descricao: string | null
          empresa_id: string | null
          id: string | null
          permissoes: Json | null
        }
        Insert: {
          atualizado_em?: string | null
          cargo?: string | null
          copiado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string | null
          permissoes?: Json | null
        }
        Update: {
          atualizado_em?: string | null
          cargo?: string | null
          copiado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string | null
          permissoes?: Json | null
        }
        Relationships: []
      }
      permissoes_backup_20260822_lixeira: {
        Row: {
          atualizado_em: string | null
          cargo: string | null
          copiado_em: string | null
          criado_em: string | null
          descricao: string | null
          empresa_id: string | null
          id: string | null
          permissoes: Json | null
        }
        Insert: {
          atualizado_em?: string | null
          cargo?: string | null
          copiado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string | null
          permissoes?: Json | null
        }
        Update: {
          atualizado_em?: string | null
          cargo?: string | null
          copiado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string | null
          permissoes?: Json | null
        }
        Relationships: []
      }
      permissoes_backup_20260822_painel_lider: {
        Row: {
          atualizado_em: string | null
          cargo: string | null
          copiado_em: string | null
          criado_em: string | null
          descricao: string | null
          empresa_id: string | null
          id: string | null
          permissoes: Json | null
        }
        Insert: {
          atualizado_em?: string | null
          cargo?: string | null
          copiado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string | null
          permissoes?: Json | null
        }
        Update: {
          atualizado_em?: string | null
          cargo?: string | null
          copiado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string | null
          permissoes?: Json | null
        }
        Relationships: []
      }
      permissoes_backup_20260822_pix: {
        Row: {
          atualizado_em: string | null
          cargo: string | null
          copiado_em: string | null
          criado_em: string | null
          descricao: string | null
          empresa_id: string | null
          id: string | null
          permissoes: Json | null
        }
        Insert: {
          atualizado_em?: string | null
          cargo?: string | null
          copiado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string | null
          permissoes?: Json | null
        }
        Update: {
          atualizado_em?: string | null
          cargo?: string | null
          copiado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string | null
          permissoes?: Json | null
        }
        Relationships: []
      }
      permissoes_backup_20260822_usuarios: {
        Row: {
          atualizado_em: string | null
          cargo: string | null
          copiado_em: string | null
          criado_em: string | null
          descricao: string | null
          empresa_id: string | null
          id: string | null
          permissoes: Json | null
        }
        Insert: {
          atualizado_em?: string | null
          cargo?: string | null
          copiado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string | null
          permissoes?: Json | null
        }
        Update: {
          atualizado_em?: string | null
          cargo?: string | null
          copiado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string | null
          permissoes?: Json | null
        }
        Relationships: []
      }
      pet_economia_regras: {
        Row: {
          ativo: boolean
          atualizado_em: string
          base_recebimento: string
          cargo: string
          janela_dias: number
          moedas_por_real: number
          observacao: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          base_recebimento?: string
          cargo: string
          janela_dias?: number
          moedas_por_real?: number
          observacao?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          base_recebimento?: string
          cargo?: string
          janela_dias?: number
          moedas_por_real?: number
          observacao?: string | null
        }
        Relationships: []
      }
      pet_estado: {
        Row: {
          atualizado_em: string
          criado_em: string
          dormindo: boolean
          itens_desbloqueados: Json
          moedas: number
          moedas_ganhas_total: number
          moedas_gastas_total: number
          nivel: number
          roupa_equipada: string
          streak: number
          ultimo_dia_ativo: string | null
          usuario_id: string
          xp: number
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          dormindo?: boolean
          itens_desbloqueados?: Json
          moedas?: number
          moedas_ganhas_total?: number
          moedas_gastas_total?: number
          nivel?: number
          roupa_equipada?: string
          streak?: number
          ultimo_dia_ativo?: string | null
          usuario_id: string
          xp?: number
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          dormindo?: boolean
          itens_desbloqueados?: Json
          moedas?: number
          moedas_ganhas_total?: number
          moedas_gastas_total?: number
          nivel?: number
          roupa_equipada?: string
          streak?: number
          ultimo_dia_ativo?: string | null
          usuario_id?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "pet_estado_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_inventario: {
        Row: {
          adquirido_em: string
          item_id: string
          origem: string
          usuario_id: string
        }
        Insert: {
          adquirido_em?: string
          item_id: string
          origem?: string
          usuario_id: string
        }
        Update: {
          adquirido_em?: string
          item_id?: string
          origem?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_inventario_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "pet_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_inventario_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_itens: {
        Row: {
          ativo: boolean
          criado_em: string
          descricao: string | null
          disponivel_ate: string | null
          disponivel_de: string | null
          emoji: string | null
          exclusivo: boolean
          id: string
          nome: string
          ordem: number
          preco_moedas: number | null
          raridade: string
          tenant: string | null
          tipo: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          disponivel_ate?: string | null
          disponivel_de?: string | null
          emoji?: string | null
          exclusivo?: boolean
          id: string
          nome: string
          ordem?: number
          preco_moedas?: number | null
          raridade?: string
          tenant?: string | null
          tipo: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          disponivel_ate?: string | null
          disponivel_de?: string | null
          emoji?: string | null
          exclusivo?: boolean
          id?: string
          nome?: string
          ordem?: number
          preco_moedas?: number | null
          raridade?: string
          tenant?: string | null
          tipo?: string
        }
        Relationships: []
      }
      pet_nome_votos: {
        Row: {
          empresa_id: string | null
          nome_escolhido: string
          usuario_id: string
          votado_em: string
        }
        Insert: {
          empresa_id?: string | null
          nome_escolhido: string
          usuario_id: string
          votado_em?: string
        }
        Update: {
          empresa_id?: string | null
          nome_escolhido?: string
          usuario_id?: string
          votado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_nome_votos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_nome_votos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_recompensas: {
        Row: {
          atualizado_em: string
          dia_referencia: string
          moedas_creditadas: number
          setor_id: string | null
          usuario_id: string
          valor_resgatado: number
          valor_validado_no_momento: number | null
        }
        Insert: {
          atualizado_em?: string
          dia_referencia: string
          moedas_creditadas?: number
          setor_id?: string | null
          usuario_id: string
          valor_resgatado?: number
          valor_validado_no_momento?: number | null
        }
        Update: {
          atualizado_em?: string
          dia_referencia?: string
          moedas_creditadas?: number
          setor_id?: string | null
          usuario_id?: string
          valor_resgatado?: number
          valor_validado_no_momento?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_recompensas_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_recompensas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_automatico_acordos: {
        Row: {
          ajuste_em: string | null
          ajuste_motivo: string | null
          ajuste_por: string | null
          ajuste_por_nome: string | null
          ajuste_valor: number | null
          atualizado_em: string
          avaliado_em: string | null
          avaliado_por: string | null
          avaliado_por_nome: string | null
          criado_em: string
          empresa_id: string
          extra: boolean
          id: string
          nr_cliente: string
          operador_id: string
          operador_nome: string | null
          pago: boolean
          pago_em: string | null
          pago_por: string | null
          pago_por_nome: string | null
          pct_comissao: number | null
          setor_id: string | null
          status: string
          valor: number
        }
        Insert: {
          ajuste_em?: string | null
          ajuste_motivo?: string | null
          ajuste_por?: string | null
          ajuste_por_nome?: string | null
          ajuste_valor?: number | null
          atualizado_em?: string
          avaliado_em?: string | null
          avaliado_por?: string | null
          avaliado_por_nome?: string | null
          criado_em?: string
          empresa_id: string
          extra?: boolean
          id?: string
          nr_cliente: string
          operador_id: string
          operador_nome?: string | null
          pago?: boolean
          pago_em?: string | null
          pago_por?: string | null
          pago_por_nome?: string | null
          pct_comissao?: number | null
          setor_id?: string | null
          status?: string
          valor: number
        }
        Update: {
          ajuste_em?: string | null
          ajuste_motivo?: string | null
          ajuste_por?: string | null
          ajuste_por_nome?: string | null
          ajuste_valor?: number | null
          atualizado_em?: string
          avaliado_em?: string | null
          avaliado_por?: string | null
          avaliado_por_nome?: string | null
          criado_em?: string
          empresa_id?: string
          extra?: boolean
          id?: string
          nr_cliente?: string
          operador_id?: string
          operador_nome?: string | null
          pago?: boolean
          pago_em?: string | null
          pago_por?: string | null
          pago_por_nome?: string | null
          pct_comissao?: number | null
          setor_id?: string | null
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pix_automatico_acordos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatico_acordos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatico_acordos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_automatico_config: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          atualizado_por_nome: string | null
          empresa_id: string
          id: string
          meta_acordos_dobra: number
          pct: number
          permite_registro_operador: boolean
          setor_id: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          empresa_id: string
          id?: string
          meta_acordos_dobra?: number
          pct?: number
          permite_registro_operador?: boolean
          setor_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          empresa_id?: string
          id?: string
          meta_acordos_dobra?: number
          pct?: number
          permite_registro_operador?: boolean
          setor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pix_automatico_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatico_config_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_automatico_log: {
        Row: {
          acao: string
          acordo_id: string | null
          antes: Json | null
          autor_id: string | null
          autor_nome: string | null
          criado_em: string
          depois: Json | null
          descricao: string
          empresa_id: string
          id: string
          nr_cliente: string
          operador_id: string | null
          operador_nome: string | null
          valor: number | null
        }
        Insert: {
          acao: string
          acordo_id?: string | null
          antes?: Json | null
          autor_id?: string | null
          autor_nome?: string | null
          criado_em?: string
          depois?: Json | null
          descricao: string
          empresa_id: string
          id?: string
          nr_cliente: string
          operador_id?: string | null
          operador_nome?: string | null
          valor?: number | null
        }
        Update: {
          acao?: string
          acordo_id?: string | null
          antes?: Json | null
          autor_id?: string | null
          autor_nome?: string | null
          criado_em?: string
          depois?: Json | null
          descricao?: string
          empresa_id?: string
          id?: string
          nr_cliente?: string
          operador_id?: string | null
          operador_nome?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pix_automatico_log_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_automatico_metas: {
        Row: {
          ano: number
          atualizado_em: string
          atualizado_por: string | null
          atualizado_por_nome: string | null
          criado_em: string
          empresa_id: string
          equipe_id: string | null
          id: string
          mes: number
          meta_acordos: number
          meta_valor: number
          setor_id: string
        }
        Insert: {
          ano: number
          atualizado_em?: string
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          criado_em?: string
          empresa_id: string
          equipe_id?: string | null
          id?: string
          mes: number
          meta_acordos?: number
          meta_valor?: number
          setor_id: string
        }
        Update: {
          ano?: number
          atualizado_em?: string
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          criado_em?: string
          empresa_id?: string
          equipe_id?: string | null
          id?: string
          mes?: number
          meta_acordos?: number
          meta_valor?: number
          setor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pix_automatico_metas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatico_metas_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatico_metas_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_automatico_nr_pedidos: {
        Row: {
          acordo_id: string | null
          conflito_acordo_id: string | null
          conflito_em: string | null
          conflito_operador: string | null
          conflito_status: string | null
          conflito_valor: number | null
          criado_em: string
          criado_por: string | null
          decidido_em: string | null
          decidido_por: string | null
          decidido_por_nome: string | null
          decisao_motivo: string | null
          empresa_id: string
          extra: boolean
          id: string
          motivo: string | null
          nr_cliente: string
          operador_id: string
          operador_nome: string | null
          setor_id: string | null
          status: string
          valor: number
        }
        Insert: {
          acordo_id?: string | null
          conflito_acordo_id?: string | null
          conflito_em?: string | null
          conflito_operador?: string | null
          conflito_status?: string | null
          conflito_valor?: number | null
          criado_em?: string
          criado_por?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          decidido_por_nome?: string | null
          decisao_motivo?: string | null
          empresa_id: string
          extra?: boolean
          id?: string
          motivo?: string | null
          nr_cliente: string
          operador_id: string
          operador_nome?: string | null
          setor_id?: string | null
          status?: string
          valor: number
        }
        Update: {
          acordo_id?: string | null
          conflito_acordo_id?: string | null
          conflito_em?: string | null
          conflito_operador?: string | null
          conflito_status?: string | null
          conflito_valor?: number | null
          criado_em?: string
          criado_por?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          decidido_por_nome?: string | null
          decisao_motivo?: string | null
          empresa_id?: string
          extra?: boolean
          id?: string
          motivo?: string | null
          nr_cliente?: string
          operador_id?: string
          operador_nome?: string | null
          setor_id?: string | null
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pix_automatico_nr_pedidos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "pix_automatico_acordos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatico_nr_pedidos_conflito_acordo_id_fkey"
            columns: ["conflito_acordo_id"]
            isOneToOne: false
            referencedRelation: "pix_automatico_acordos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatico_nr_pedidos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatico_nr_pedidos_decidido_por_fkey"
            columns: ["decidido_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatico_nr_pedidos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatico_nr_pedidos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatico_nr_pedidos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_automatico_nr_registro: {
        Row: {
          acordo_id: string | null
          atualizado_em: string
          avaliado_em: string | null
          avaliado_por: string | null
          avaliado_por_nome: string | null
          criado_em: string
          empresa_id: string
          id: string
          nr_cliente: string
          nr_normalizado: string
          operador_id: string | null
          operador_nome: string | null
          status: string
        }
        Insert: {
          acordo_id?: string | null
          atualizado_em?: string
          avaliado_em?: string | null
          avaliado_por?: string | null
          avaliado_por_nome?: string | null
          criado_em?: string
          empresa_id: string
          id?: string
          nr_cliente: string
          nr_normalizado: string
          operador_id?: string | null
          operador_nome?: string | null
          status?: string
        }
        Update: {
          acordo_id?: string | null
          atualizado_em?: string
          avaliado_em?: string | null
          avaliado_por?: string | null
          avaliado_por_nome?: string | null
          criado_em?: string
          empresa_id?: string
          id?: string
          nr_cliente?: string
          nr_normalizado?: string
          operador_id?: string | null
          operador_nome?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pix_automatico_nr_registro_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "pix_automatico_acordos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatico_nr_registro_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_automatico_premiacoes_pagamento: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          atualizado_por_nome: string | null
          empresa_id: string
          id: number
          mes: string
          operador_id: string
          operador_nome: string
          pago: boolean
          pago_em: string | null
          pago_por: string | null
          pago_por_nome: string | null
          valor_pago: number | null
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          empresa_id: string
          id?: never
          mes: string
          operador_id: string
          operador_nome: string
          pago?: boolean
          pago_em?: string | null
          pago_por?: string | null
          pago_por_nome?: string | null
          valor_pago?: number | null
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          empresa_id?: string
          id?: never
          mes?: string
          operador_id?: string
          operador_nome?: string
          pago?: boolean
          pago_em?: string | null
          pago_por?: string | null
          pago_por_nome?: string | null
          valor_pago?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pix_automatico_premiacoes_pagamento_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatico_premiacoes_pagamento_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatico_premiacoes_pagamento_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatico_premiacoes_pagamento_pago_por_fkey"
            columns: ["pago_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_automatico_saldos: {
        Row: {
          acordo_id: string | null
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          criado_por_nome: string | null
          empresa_id: string
          id: string
          motivo: string | null
          operador_id: string
          operador_nome: string | null
          reservado_em: string | null
          setor_id: string | null
          valor: number
        }
        Insert: {
          acordo_id?: string | null
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          empresa_id: string
          id?: string
          motivo?: string | null
          operador_id: string
          operador_nome?: string | null
          reservado_em?: string | null
          setor_id?: string | null
          valor: number
        }
        Update: {
          acordo_id?: string | null
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          empresa_id?: string
          id?: string
          motivo?: string | null
          operador_id?: string
          operador_nome?: string | null
          reservado_em?: string | null
          setor_id?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pix_automatico_saldos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "pix_automatico_acordos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatico_saldos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatico_saldos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatico_saldos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      profissionais: {
        Row: {
          atualizado_em: string
          codigo: string
          criado_em: string
          empresa_id: string
          estado_uf: string | null
          id: string
          nome: string
          telefone: string | null
        }
        Insert: {
          atualizado_em?: string
          codigo: string
          criado_em?: string
          empresa_id: string
          estado_uf?: string | null
          id?: string
          nome: string
          telefone?: string | null
        }
        Update: {
          atualizado_em?: string
          codigo?: string
          criado_em?: string
          empresa_id?: string
          estado_uf?: string | null
          id?: string
          nome?: string
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profissionais_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      relatorio_validacoes_dia: {
        Row: {
          dia_referencia: string
          empresa_id: string
          id: string
          origem: string
          qtd_registros_validados: number
          setor_id: string
          validado_em: string
          validado_por: string | null
          valor_validado: number
        }
        Insert: {
          dia_referencia: string
          empresa_id: string
          id?: string
          origem: string
          qtd_registros_validados?: number
          setor_id: string
          validado_em?: string
          validado_por?: string | null
          valor_validado?: number
        }
        Update: {
          dia_referencia?: string
          empresa_id?: string
          id?: string
          origem?: string
          qtd_registros_validados?: number
          setor_id?: string
          validado_em?: string
          validado_por?: string | null
          valor_validado?: number
        }
        Relationships: [
          {
            foreignKeyName: "relatorio_validacoes_dia_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relatorio_validacoes_dia_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relatorio_validacoes_dia_validado_por_fkey"
            columns: ["validado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_celulas: {
        Row: {
          ativo: boolean
          criado_em: string
          empresa_id: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          empresa_id: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          empresa_id?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "rh_celulas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_config_setores: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          atualizado_por_nome: string | null
          celula_id: string
          criado_em: string
          empresa_id: string
          id: string
          setor_id: string
          tipo_remuneracao: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          celula_id: string
          criado_em?: string
          empresa_id: string
          id?: string
          setor_id: string
          tipo_remuneracao: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          celula_id?: string
          criado_em?: string
          empresa_id?: string
          id?: string
          setor_id?: string
          tipo_remuneracao?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_config_setores_celula_id_fkey"
            columns: ["celula_id"]
            isOneToOne: false
            referencedRelation: "rh_celulas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_config_setores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_config_setores_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_dados_operadores: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          atualizado_por_nome: string | null
          cracha: string | null
          criado_em: string
          empresa_id: string
          id: string
          operador_id: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          cracha?: string | null
          criado_em?: string
          empresa_id: string
          id?: string
          operador_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          cracha?: string | null
          criado_em?: string
          empresa_id?: string
          id?: string
          operador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_dados_operadores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_dados_operadores_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_eventos: {
        Row: {
          autor_id: string | null
          autor_nome: string | null
          criado_em: string
          descricao: string
          empresa_id: string
          equipe_id: string | null
          escopo: string
          fechamento_id: string
          id: string
          lancamento_id: string | null
          motivo: string | null
          setor_id: string | null
          tipo: string
          valor_anterior: number | null
          valor_novo: number | null
        }
        Insert: {
          autor_id?: string | null
          autor_nome?: string | null
          criado_em?: string
          descricao: string
          empresa_id: string
          equipe_id?: string | null
          escopo: string
          fechamento_id: string
          id?: string
          lancamento_id?: string | null
          motivo?: string | null
          setor_id?: string | null
          tipo: string
          valor_anterior?: number | null
          valor_novo?: number | null
        }
        Update: {
          autor_id?: string | null
          autor_nome?: string | null
          criado_em?: string
          descricao?: string
          empresa_id?: string
          equipe_id?: string | null
          escopo?: string
          fechamento_id?: string
          id?: string
          lancamento_id?: string | null
          motivo?: string | null
          setor_id?: string | null
          tipo?: string
          valor_anterior?: number | null
          valor_novo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_eventos_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "rh_fechamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_eventos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "rh_lancamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_fechamentos: {
        Row: {
          aberto_em: string
          aberto_por: string | null
          aberto_por_nome: string | null
          atualizado_em: string
          competencia: string
          criado_em: string
          empresa_id: string
          finalizado_em: string | null
          finalizado_por: string | null
          finalizado_por_nome: string | null
          id: string
          mes_apuracao: string
          observacao: string | null
          prazo: string | null
          status: string
        }
        Insert: {
          aberto_em?: string
          aberto_por?: string | null
          aberto_por_nome?: string | null
          atualizado_em?: string
          competencia: string
          criado_em?: string
          empresa_id: string
          finalizado_em?: string | null
          finalizado_por?: string | null
          finalizado_por_nome?: string | null
          id?: string
          mes_apuracao: string
          observacao?: string | null
          prazo?: string | null
          status?: string
        }
        Update: {
          aberto_em?: string
          aberto_por?: string | null
          aberto_por_nome?: string | null
          atualizado_em?: string
          competencia?: string
          criado_em?: string
          empresa_id?: string
          finalizado_em?: string | null
          finalizado_por?: string | null
          finalizado_por_nome?: string | null
          id?: string
          mes_apuracao?: string
          observacao?: string | null
          prazo?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_fechamentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_lancamentos: {
        Row: {
          atualizado_em: string
          celula_snapshot: string
          cracha_snapshot: string | null
          criado_em: string
          decidido_em: string | null
          decidido_por: string | null
          decidido_por_nome: string | null
          devolucao_escopo: string | null
          dispensado: boolean
          dispensado_por: string | null
          dispensado_por_nome: string | null
          empresa_id: string
          enviado_em: string | null
          equipe_id_snapshot: string | null
          equipe_nome_snapshot: string | null
          fechamento_id: string
          id: string
          meta_snapshot: number | null
          motivo_devolucao: string | null
          motivo_dispensa: string | null
          nome_snapshot: string
          observacao: string | null
          operador_id: string
          percentual_snapshot: number | null
          preenchido_em: string | null
          preenchido_por: string | null
          preenchido_por_nome: string | null
          recebido_snapshot: number | null
          setor_id_snapshot: string
          setor_nome_snapshot: string
          status: string
          tipo_remuneracao_snapshot: string
          validado_em: string | null
          validado_por: string | null
          validado_por_nome: string | null
          valor: number | null
        }
        Insert: {
          atualizado_em?: string
          celula_snapshot: string
          cracha_snapshot?: string | null
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          decidido_por_nome?: string | null
          devolucao_escopo?: string | null
          dispensado?: boolean
          dispensado_por?: string | null
          dispensado_por_nome?: string | null
          empresa_id: string
          enviado_em?: string | null
          equipe_id_snapshot?: string | null
          equipe_nome_snapshot?: string | null
          fechamento_id: string
          id?: string
          meta_snapshot?: number | null
          motivo_devolucao?: string | null
          motivo_dispensa?: string | null
          nome_snapshot: string
          observacao?: string | null
          operador_id: string
          percentual_snapshot?: number | null
          preenchido_em?: string | null
          preenchido_por?: string | null
          preenchido_por_nome?: string | null
          recebido_snapshot?: number | null
          setor_id_snapshot: string
          setor_nome_snapshot: string
          status?: string
          tipo_remuneracao_snapshot: string
          validado_em?: string | null
          validado_por?: string | null
          validado_por_nome?: string | null
          valor?: number | null
        }
        Update: {
          atualizado_em?: string
          celula_snapshot?: string
          cracha_snapshot?: string | null
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          decidido_por_nome?: string | null
          devolucao_escopo?: string | null
          dispensado?: boolean
          dispensado_por?: string | null
          dispensado_por_nome?: string | null
          empresa_id?: string
          enviado_em?: string | null
          equipe_id_snapshot?: string | null
          equipe_nome_snapshot?: string | null
          fechamento_id?: string
          id?: string
          meta_snapshot?: number | null
          motivo_devolucao?: string | null
          motivo_dispensa?: string | null
          nome_snapshot?: string
          observacao?: string | null
          operador_id?: string
          percentual_snapshot?: number | null
          preenchido_em?: string | null
          preenchido_por?: string | null
          preenchido_por_nome?: string | null
          recebido_snapshot?: number | null
          setor_id_snapshot?: string
          setor_nome_snapshot?: string
          status?: string
          tipo_remuneracao_snapshot?: string
          validado_em?: string | null
          validado_por?: string | null
          validado_por_nome?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_lancamentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_lancamentos_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "rh_fechamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_lancamentos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      setores: {
        Row: {
          alternativo: boolean
          ativo: boolean
          atualizado_em: string
          criado_em: string
          descricao: string | null
          empresa_id: string
          foto_receptivo_url: string | null
          foto_url: string | null
          id: string
          nome: string
        }
        Insert: {
          alternativo?: boolean
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          empresa_id: string
          foto_receptivo_url?: string | null
          foto_url?: string | null
          id?: string
          nome: string
        }
        Update: {
          alternativo?: boolean
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          empresa_id?: string
          foto_receptivo_url?: string | null
          foto_url?: string | null
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "setores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_whatsapp: {
        Row: {
          atualizado_em: string
          categoria: string
          codigo_cliente: string
          criado_em: string
          empresa_id: string
          equipe_id: string | null
          estado_uf: string | null
          finalizado_em: string | null
          id: string
          iniciado_em: string | null
          mensagem: string
          msg_expurgado_em: string | null
          msg_expurgar_em: string | null
          msg_tem_cpf: boolean
          nao_concluido_em: string | null
          nome_cliente: string | null
          responsavel_id: string | null
          setor_id: string | null
          solicitante_id: string
          status: string
          whatsapp: string
        }
        Insert: {
          atualizado_em?: string
          categoria: string
          codigo_cliente: string
          criado_em?: string
          empresa_id: string
          equipe_id?: string | null
          estado_uf?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string | null
          mensagem: string
          msg_expurgado_em?: string | null
          msg_expurgar_em?: string | null
          msg_tem_cpf?: boolean
          nao_concluido_em?: string | null
          nome_cliente?: string | null
          responsavel_id?: string | null
          setor_id?: string | null
          solicitante_id: string
          status?: string
          whatsapp: string
        }
        Update: {
          atualizado_em?: string
          categoria?: string
          codigo_cliente?: string
          criado_em?: string
          empresa_id?: string
          equipe_id?: string | null
          estado_uf?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string | null
          mensagem?: string
          msg_expurgado_em?: string | null
          msg_expurgar_em?: string | null
          msg_tem_cpf?: boolean
          nao_concluido_em?: string | null
          nome_cliente?: string | null
          responsavel_id?: string | null
          setor_id?: string | null
          solicitante_id?: string
          status?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_whatsapp_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_whatsapp_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_whatsapp_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_whatsapp_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_whatsapp_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_whatsapp_eventos: {
        Row: {
          autor_id: string | null
          criado_em: string
          empresa_id: string
          id: string
          responsavel_anterior: string | null
          responsavel_novo: string | null
          solicitacao_id: string
          status_anterior: string | null
          status_novo: string
          tipo: string
        }
        Insert: {
          autor_id?: string | null
          criado_em?: string
          empresa_id: string
          id?: string
          responsavel_anterior?: string | null
          responsavel_novo?: string | null
          solicitacao_id: string
          status_anterior?: string | null
          status_novo: string
          tipo?: string
        }
        Update: {
          autor_id?: string | null
          criado_em?: string
          empresa_id?: string
          id?: string
          responsavel_anterior?: string | null
          responsavel_novo?: string | null
          solicitacao_id?: string
          status_anterior?: string | null
          status_novo?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_whatsapp_eventos_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_whatsapp_eventos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_whatsapp_eventos_responsavel_anterior_fkey"
            columns: ["responsavel_anterior"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_whatsapp_eventos_responsavel_novo_fkey"
            columns: ["responsavel_novo"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_whatsapp_eventos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes_whatsapp"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_whatsapp_leitura: {
        Row: {
          atualizado_em: string
          empresa_id: string
          lido_ate: string
          solicitacao_id: string
          usuario_id: string
        }
        Insert: {
          atualizado_em?: string
          empresa_id: string
          lido_ate?: string
          solicitacao_id: string
          usuario_id: string
        }
        Update: {
          atualizado_em?: string
          empresa_id?: string
          lido_ate?: string
          solicitacao_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_whatsapp_leitura_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_whatsapp_leitura_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes_whatsapp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_whatsapp_leitura_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_whatsapp_mensagens: {
        Row: {
          autor_id: string
          conteudo: string
          criado_em: string
          empresa_id: string
          expurgado_em: string | null
          expurgar_em: string | null
          id: string
          lida_em: string | null
          solicitacao_id: string
          tem_cpf: boolean
        }
        Insert: {
          autor_id: string
          conteudo: string
          criado_em?: string
          empresa_id: string
          expurgado_em?: string | null
          expurgar_em?: string | null
          id?: string
          lida_em?: string | null
          solicitacao_id: string
          tem_cpf?: boolean
        }
        Update: {
          autor_id?: string
          conteudo?: string
          criado_em?: string
          empresa_id?: string
          expurgado_em?: string | null
          expurgar_em?: string | null
          id?: string
          lida_em?: string | null
          solicitacao_id?: string
          tem_cpf?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_whatsapp_mensagens_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_whatsapp_mensagens_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_whatsapp_mensagens_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes_whatsapp"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          cor: string
          criado_em: string
          empresa_id: string
          id: string
          nome: string
        }
        Insert: {
          cor?: string
          criado_em?: string
          empresa_id: string
          id?: string
          nome: string
        }
        Update: {
          cor?: string
          criado_em?: string
          empresa_id?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      termos_uso: {
        Row: {
          ativo: boolean
          conteudo: string
          criado_em: string
          empresa_id: string
          id: string
          titulo: string
          versao: string
        }
        Insert: {
          ativo?: boolean
          conteudo: string
          criado_em?: string
          empresa_id: string
          id?: string
          titulo: string
          versao: string
        }
        Update: {
          ativo?: boolean
          conteudo?: string
          criado_em?: string
          empresa_id?: string
          id?: string
          titulo?: string
          versao?: string
        }
        Relationships: [
          {
            foreignKeyName: "termos_uso_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          aberto_por: string
          aberto_por_nome: string | null
          assunto: string
          atualizado_em: string
          campos: Json
          categoria: string
          criado_em: string
          descricao: string | null
          empresa_id: string
          fechado_em: string | null
          id: string
          numero: number
          prioridade: string
          responsavel_id: string | null
          responsavel_nome: string | null
          setor_id: string | null
          status: string
        }
        Insert: {
          aberto_por: string
          aberto_por_nome?: string | null
          assunto: string
          atualizado_em?: string
          campos?: Json
          categoria: string
          criado_em?: string
          descricao?: string | null
          empresa_id: string
          fechado_em?: string | null
          id?: string
          numero?: number
          prioridade?: string
          responsavel_id?: string | null
          responsavel_nome?: string | null
          setor_id?: string | null
          status?: string
        }
        Update: {
          aberto_por?: string
          aberto_por_nome?: string | null
          assunto?: string
          atualizado_em?: string
          campos?: Json
          categoria?: string
          criado_em?: string
          descricao?: string | null
          empresa_id?: string
          fechado_em?: string | null
          id?: string
          numero?: number
          prioridade?: string
          responsavel_id?: string | null
          responsavel_nome?: string | null
          setor_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_aberto_por_fkey"
            columns: ["aberto_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets_atendentes: {
        Row: {
          criado_em: string
          criado_por: string | null
          empresa_id: string
          id: string
          perfil_id: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          id?: string
          perfil_id: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          id?: string
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_atendentes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_atendentes_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets_config: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          empresa_id: string
          liberado_para_lideranca: boolean
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          empresa_id: string
          liberado_para_lideranca?: boolean
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          empresa_id?: string
          liberado_para_lideranca?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tickets_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets_eventos: {
        Row: {
          autor_id: string | null
          autor_nome: string | null
          criado_em: string
          de: string | null
          id: string
          para: string | null
          ticket_id: string
          tipo: string
        }
        Insert: {
          autor_id?: string | null
          autor_nome?: string | null
          criado_em?: string
          de?: string | null
          id?: string
          para?: string | null
          ticket_id: string
          tipo: string
        }
        Update: {
          autor_id?: string | null
          autor_nome?: string | null
          criado_em?: string
          de?: string | null
          id?: string
          para?: string | null
          ticket_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_eventos_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets_mensagens: {
        Row: {
          anexos: Json
          autor_foto: string | null
          autor_id: string | null
          autor_nome: string | null
          criado_em: string
          id: string
          texto: string | null
          ticket_id: string
        }
        Insert: {
          anexos?: Json
          autor_foto?: string | null
          autor_id?: string | null
          autor_nome?: string | null
          criado_em?: string
          id?: string
          texto?: string | null
          ticket_id: string
        }
        Update: {
          anexos?: Json
          autor_foto?: string | null
          autor_id?: string | null
          autor_nome?: string | null
          criado_em?: string
          id?: string
          texto?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_mensagens_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_mensagens_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_alertas: {
        Row: {
          criado_em: string
          criado_por: string | null
          criado_por_nome: string | null
          duracao_s: number
          empresa_id: string
          id: string
          mensagem: string | null
          midia_url: string | null
          setor_id: string
          som_url: string | null
          titulo: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          duracao_s?: number
          empresa_id: string
          id?: string
          mensagem?: string | null
          midia_url?: string | null
          setor_id: string
          som_url?: string | null
          titulo: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          duracao_s?: number
          empresa_id?: string
          id?: string
          mensagem?: string | null
          midia_url?: string | null
          setor_id?: string
          som_url?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "tv_alertas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tv_alertas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tv_alertas_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_cenas: {
        Row: {
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          duracao_s: number
          emergencia: boolean
          empresa_id: string
          id: string
          na_rotacao: boolean
          nome: string
          ordem: number
          setor_id: string
          transicao: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          duracao_s?: number
          emergencia?: boolean
          empresa_id: string
          id?: string
          na_rotacao?: boolean
          nome: string
          ordem?: number
          setor_id: string
          transicao?: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          duracao_s?: number
          emergencia?: boolean
          empresa_id?: string
          id?: string
          na_rotacao?: boolean
          nome?: string
          ordem?: number
          setor_id?: string
          transicao?: string
        }
        Relationships: [
          {
            foreignKeyName: "tv_cenas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tv_cenas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tv_cenas_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_estado: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          cena_id: string | null
          tela_id: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          cena_id?: string | null
          tela_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          cena_id?: string | null
          tela_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tv_estado_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tv_estado_cena_id_fkey"
            columns: ["cena_id"]
            isOneToOne: false
            referencedRelation: "tv_cenas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tv_estado_tela_id_fkey"
            columns: ["tela_id"]
            isOneToOne: true
            referencedRelation: "tv_telas"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_fontes: {
        Row: {
          camada: number
          cena_id: string
          config: Json
          criado_em: string
          escala: number
          id: string
          largura: number
          mudo: boolean
          tipo: string
          visivel: boolean
          volume: number
          x: number
          y: number
        }
        Insert: {
          camada?: number
          cena_id: string
          config?: Json
          criado_em?: string
          escala?: number
          id?: string
          largura?: number
          mudo?: boolean
          tipo: string
          visivel?: boolean
          volume?: number
          x?: number
          y?: number
        }
        Update: {
          camada?: number
          cena_id?: string
          config?: Json
          criado_em?: string
          escala?: number
          id?: string
          largura?: number
          mudo?: boolean
          tipo?: string
          visivel?: boolean
          volume?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "tv_fontes_cena_id_fkey"
            columns: ["cena_id"]
            isOneToOne: false
            referencedRelation: "tv_cenas"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_midias: {
        Row: {
          caminho: string
          criado_em: string
          criado_por: string | null
          empresa_id: string
          id: string
          nome: string
          tamanho: number | null
          tipo: string
          url: string
        }
        Insert: {
          caminho: string
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          id?: string
          nome: string
          tamanho?: number | null
          tipo: string
          url: string
        }
        Update: {
          caminho?: string
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          id?: string
          nome?: string
          tamanho?: number | null
          tipo?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "tv_midias_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tv_midias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_sorteios: {
        Row: {
          config: Json
          criado_em: string
          criado_por: string | null
          empresa_id: string
          estado: string
          girado_em: string | null
          girado_por: string | null
          girado_por_nome: string | null
          id: string
          participantes: Json
          resultado: Json
          setor_id: string
          tipo: string
          titulo: string
        }
        Insert: {
          config?: Json
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          estado?: string
          girado_em?: string | null
          girado_por?: string | null
          girado_por_nome?: string | null
          id?: string
          participantes?: Json
          resultado?: Json
          setor_id: string
          tipo: string
          titulo: string
        }
        Update: {
          config?: Json
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          estado?: string
          girado_em?: string | null
          girado_por?: string | null
          girado_por_nome?: string | null
          id?: string
          participantes?: Json
          resultado?: Json
          setor_id?: string
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "tv_sorteios_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tv_sorteios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tv_sorteios_girado_por_fkey"
            columns: ["girado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tv_sorteios_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_telas: {
        Row: {
          ativa: boolean
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          empresa_id: string
          id: string
          nome: string
          rotacao_ativa: boolean
          setor_id: string
          slug: string
          ultimo_sinal: string | null
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          id?: string
          nome: string
          rotacao_ativa?: boolean
          setor_id: string
          slug: string
          ultimo_sinal?: string | null
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          id?: string
          nome?: string
          rotacao_ativa?: boolean
          setor_id?: string
          slug?: string
          ultimo_sinal?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tv_telas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tv_telas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tv_telas_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      uso_sessoes: {
        Row: {
          cargo: string | null
          dia: string
          empresa_id: string
          entradas: number
          primeiro_em: string
          ultimo_em: string
          usuario_id: string
        }
        Insert: {
          cargo?: string | null
          dia: string
          empresa_id: string
          entradas?: number
          primeiro_em?: string
          ultimo_em?: string
          usuario_id: string
        }
        Update: {
          cargo?: string | null
          dia?: string
          empresa_id?: string
          entradas?: number
          primeiro_em?: string
          ultimo_em?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uso_sessoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uso_sessoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      uso_telas: {
        Row: {
          aberturas: number
          cargo: string | null
          dia: string
          empresa_id: string
          primeiro_em: string
          segundos: number
          tela: string
          ultimo_em: string
          usuario_id: string
        }
        Insert: {
          aberturas?: number
          cargo?: string | null
          dia: string
          empresa_id: string
          primeiro_em?: string
          segundos?: number
          tela: string
          ultimo_em?: string
          usuario_id: string
        }
        Update: {
          aberturas?: number
          cargo?: string | null
          dia?: string
          empresa_id?: string
          primeiro_em?: string
          segundos?: number
          tela?: string
          ultimo_em?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uso_telas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uso_telas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      acordos_deduplicados: {
        Row: {
          acordo_grupo_id: string | null
          atualizado_em: string | null
          criado_em: string | null
          data_cadastro: string | null
          empresa_id: string | null
          estado_uf: string | null
          id: string | null
          instituicao: string | null
          nome_cliente: string | null
          nr_cliente: string | null
          numero_parcela: number | null
          observacoes: string | null
          operador_id: string | null
          operador_vinculado_id: string | null
          parcelas: number | null
          setor_id: string | null
          status: string | null
          tag_ids: string[] | null
          tipo: string | null
          tipo_receptivo: string | null
          tipo_vinculo: string | null
          valor: number | null
          vencimento: string | null
          vinculo_operador_id: string | null
          vinculo_operador_nome: string | null
          whatsapp: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acordos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      buscar_email_por_usuario: { Args: { p_usuario: string }; Returns: string }
      buscar_email_por_usuario_empresa: {
        Args: { p_empresa_slug?: string; p_usuario: string }
        Returns: string
      }
      fn_abas_escopo: {
        Args: never
        Returns: {
          aba: string
          chave_aba: string
        }[]
      }
      fn_admin_apagar_acordos_do_usuario: {
        Args: { p_empresa_id?: string; p_user_id: string }
        Returns: number
      }
      fn_admin_delete_user: {
        Args: { p_apagar_acordos?: boolean; p_user_id: string }
        Returns: Json
      }
      fn_admin_resumo_exclusao_usuario: {
        Args: { p_user_id: string }
        Returns: Json
      }
      fn_ajuste_no_meu_alcance: {
        Args: { p_operador: string }
        Returns: boolean
      }
      fn_analitico_atualizar_resumo: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: undefined
      }
      fn_analitico_dashboard_mes: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: {
          dia: string
          forma_detalhe: string
          forma_pagamento: string
          operador_id: string
          qtd: number
          status_tabulacao: string
          total: number
          total_ho: number
        }[]
      }
      fn_analitico_dashboard_mes_json: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: Json
      }
      fn_analitico_destaques_dia: {
        Args: {
          p_empresa_id: string
          p_equipe_id?: string
          p_mes: string
          p_setor_id?: string
        }
        Returns: {
          dia: string
          operador_id: string
          operador_nome: string
          operador_usuario: string
          total_pagamentos: number
          total_recebido: number
        }[]
      }
      fn_analitico_destaques_dia_por_grupo: {
        Args: {
          p_empresa_id: string
          p_equipe_id?: string
          p_mes: string
          p_setor_id?: string
        }
        Returns: {
          dia: string
          equipe_id: string
          equipe_nome: string
          grupo_id: string
          grupo_nome: string
          grupo_tipo: string
          operador_id: string
          operador_nome: string
          operador_usuario: string
          total_pagamentos: number
          total_recebido: number
        }[]
      }
      fn_analitico_resumo_por_operador: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: {
          operador_id: string
          operador_nome: string
          operador_usuario: string
          total_ho: number
          total_pagamentos: number
          total_recebido: number
        }[]
      }
      fn_api_rate_limit_consumir: {
        Args: {
          p_janela_segundos: number
          p_limite: number
          p_rota: string
          p_usuario_id: string
        }
        Returns: {
          permitido: boolean
          restantes: number
          tentar_novamente_em_s: number
        }[]
      }
      fn_arquivar_desligados_anteriores: {
        Args: { p_empresa_id: string }
        Returns: number
      }
      fn_arquivar_desligados_ids: {
        Args: { p_empresa_id: string }
        Returns: string[]
      }
      fn_arquivar_desligados_virada: { Args: never; Returns: number }
      fn_autorizacao_cancelar: { Args: { p_id: string }; Returns: Json }
      fn_autorizacao_decidir: {
        Args: { p_aprovar: boolean; p_id: string; p_motivo?: string }
        Returns: Json
      }
      fn_autorizacao_faxina: { Args: never; Returns: number }
      fn_autorizacao_solicitar: {
        Args: {
          p_acordo_alvo_id?: string
          p_acordo_editado_id?: string
          p_dono_id?: string
          p_dono_nome?: string
          p_extra_atual_id?: string
          p_extra_atual_op_id?: string
          p_extra_atual_op_nome?: string
          p_modo: string
          p_nr_label: string
          p_nr_valor: string
          p_payload: Json
          p_resumo?: Json
        }
        Returns: Json
      }
      fn_can_access_empresa: {
        Args: { target_empresa_id: string }
        Returns: boolean
      }
      fn_chat_abrir: { Args: { p_alvo: string }; Returns: string }
      fn_chat_alcanca: { Args: { p_alvo: string }; Returns: boolean }
      fn_chat_avisar: {
        Args: { p_conversa: string; p_dados?: Json; p_tipo: string }
        Returns: undefined
      }
      fn_chat_contatos: {
        Args: never
        Returns: {
          cargo: string
          empresa_slug: string
          equipe_id: string
          equipe_nome: string
          foto_url: string
          multiempresa: boolean
          nome: string
          perfil_id: string
          setor_id: string
          setor_nome: string
          usuario: string
        }[]
      }
      fn_chat_curtir: {
        Args: { p_curtir: boolean; p_mensagem_id: string }
        Returns: number
      }
      fn_chat_destinos_disparo: {
        Args: { p_disparo: string; p_inicio?: number; p_limite?: number }
        Returns: {
          conversa_id: string
          empresa_slug: string
          foto_url: string
          nome: string
          perfil_id: string
          usuario: string
        }[]
      }
      fn_chat_disparar: {
        Args: { p_anexos?: Json; p_destinos: string[]; p_texto: string }
        Returns: Json
      }
      fn_chat_empresas_das_conversas: {
        Args: never
        Returns: {
          empresa_slug: string
          multiempresa: boolean
          perfil_id: string
        }[]
      }
      fn_chat_equipes_do_perfil: {
        Args: { p_perfil: string }
        Returns: {
          equipe_id: string
          setor_id: string
        }[]
      }
      fn_chat_grupo_adicionar: {
        Args: { p_conversa: string; p_membros: string[] }
        Returns: number
      }
      fn_chat_grupo_admin: {
        Args: { p_admin: boolean; p_conversa: string; p_membro: string }
        Returns: undefined
      }
      fn_chat_grupo_administro: {
        Args: { p_conversa: string }
        Returns: boolean
      }
      fn_chat_grupo_config: {
        Args: {
          p_conversa: string
          p_foto_url?: string
          p_nome?: string
          p_somente_lideranca?: boolean
        }
        Returns: undefined
      }
      fn_chat_grupo_criar: {
        Args: { p_foto_url?: string; p_membros: string[]; p_nome: string }
        Returns: string
      }
      fn_chat_grupo_foto_minha: {
        Args: { p_caminho: string }
        Returns: boolean
      }
      fn_chat_grupo_membros: {
        Args: { p_conversa: string }
        Returns: {
          admin: boolean
          cargo: string
          foto_url: string
          nome: string
          perfil_id: string
          usuario: string
        }[]
      }
      fn_chat_grupo_remover: {
        Args: { p_conversa: string; p_membro: string }
        Returns: undefined
      }
      fn_chat_grupo_sair: { Args: { p_conversa: string }; Returns: undefined }
      fn_chat_leio_ate: { Args: { p_conversa: string }; Returns: string }
      fn_chat_leio_conversa: { Args: { p_conversa: string }; Returns: boolean }
      fn_chat_midias: {
        Args: { p_conversa: string; p_limite?: number }
        Returns: {
          anexo: Json
          autor_id: string
          autor_nome: string
          criado_em: string
          mensagem_id: string
        }[]
      }
      fn_chat_minhas_conversas: {
        Args: never
        Returns: {
          em_historico: boolean
          entrega_do_outro: string
          entrega_minha: string
          fixada: boolean
          id: string
          leitura_do_outro: string
          nao_lidas: number
          outro_empresa: string
          outro_foto: string
          outro_id: string
          outro_nome: string
          outro_perfil: string
          outro_usuario: string
          participantes: number
          sai: boolean
          somente_lideranca: boolean
          sou_admin: boolean
          tipo: string
          ultima_atividade_em: string
          ultima_mensagem_em: string
          ultimo_anexos: Json
          ultimo_autor_id: string
          ultimo_texto: string
        }[]
      }
      fn_chat_minhas_conversas_antes_adm_20260831: {
        Args: never
        Returns: {
          em_historico: boolean
          entrega_do_outro: string
          entrega_minha: string
          id: string
          leitura_do_outro: string
          nao_lidas: number
          outro_empresa: string
          outro_foto: string
          outro_id: string
          outro_nome: string
          outro_usuario: string
          ultima_atividade_em: string
          ultima_mensagem_em: string
          ultimo_anexos: Json
          ultimo_autor_id: string
          ultimo_texto: string
        }[]
      }
      fn_chat_minhas_conversas_antes_grupos_20260901: {
        Args: never
        Returns: {
          em_historico: boolean
          entrega_do_outro: string
          entrega_minha: string
          id: string
          leitura_do_outro: string
          nao_lidas: number
          outro_empresa: string
          outro_foto: string
          outro_id: string
          outro_nome: string
          outro_perfil: string
          outro_usuario: string
          ultima_atividade_em: string
          ultima_mensagem_em: string
          ultimo_anexos: Json
          ultimo_autor_id: string
          ultimo_texto: string
        }[]
      }
      fn_chat_monitor_conversas: {
        Args: { p_alvo: string }
        Returns: {
          id: string
          outro_foto: string
          outro_id: string
          outro_nome: string
          outro_perfil: string
          participantes: number
          tipo: string
          ultima_mensagem_em: string
          ultimo_anexos: Json
          ultimo_autor_id: string
          ultimo_texto: string
        }[]
      }
      fn_chat_monitor_recentes: {
        Args: { p_limite?: number }
        Returns: {
          conversa_id: string
          foto_url: string
          participantes: number
          quem_id: string
          quem_nome: string
          tipo: string
          titulo: string
          ultima_mensagem_em: string
          ultimo_anexos: Json
          ultimo_autor_id: string
          ultimo_autor_nome: string
          ultimo_texto: string
        }[]
      }
      fn_chat_monitoraveis: {
        Args: { p_busca?: string }
        Returns: {
          cargo: string
          empresa_slug: string
          foto_url: string
          nome: string
          perfil_id: string
          setor_nome: string
          usuario: string
        }[]
      }
      fn_chat_monitoro_conversa: {
        Args: { p_conversa: string }
        Returns: boolean
      }
      fn_chat_pode_usar: { Args: { p_perfil?: string }; Returns: boolean }
      fn_chat_posso_escrever: { Args: { p_conversa: string }; Returns: boolean }
      fn_chat_posso_ler_anexo: { Args: { p_caminho: string }; Returns: boolean }
      fn_chat_posso_monitorar: { Args: { p_alvo: string }; Returns: boolean }
      fn_chat_quem_curtiu: {
        Args: { p_mensagem_id: string }
        Returns: {
          foto_url: string
          nome: string
          perfil_id: string
        }[]
      }
      fn_chat_setores_do_perfil: {
        Args: { p_perfil: string }
        Returns: {
          setor_id: string
        }[]
      }
      fn_chat_sou_parte: { Args: { p_conversa: string }; Returns: boolean }
      fn_chat_uma_conversa: {
        Args: { p_conversa: string }
        Returns: {
          id: string
          outro_empresa: string
          outro_foto: string
          outro_id: string
          outro_nome: string
          outro_usuario: string
          ultima_mensagem_em: string
        }[]
      }
      fn_comemoracao_faxina: {
        Args: never
        Returns: {
          comemoracoes_finalizadas: number
          midias_apagadas: number
        }[]
      }
      fn_comemoracao_finalizar: { Args: { p_id: string }; Returns: undefined }
      fn_comemoracao_midia_fixar: {
        Args: { p_fixar: boolean; p_id: string }
        Returns: {
          caminho: string
          criado_em: string
          criado_por: string | null
          empresa_id: string
          expira_em: string | null
          fixada: boolean
          id: string
          inicio_s: number
          nome: string
          tipo: string
          trecho_s: number | null
          url: string
        }
        SetofOptions: {
          from: "*"
          to: "comemoracao_midias"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_comemoracao_pode_criar: { Args: never; Returns: boolean }
      fn_composicao_mes_completar_clones: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: Json
      }
      fn_composicao_mes_congelar: { Args: never; Returns: number }
      fn_composicao_mes_snapshot: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: number
      }
      fn_converter_para_extra: {
        Args: {
          p_acordo_id: string
          p_instituicao: string
          p_nome_cliente: string
          p_novo_direto_op_id: string
          p_novo_direto_op_nome: string
          p_nr_cliente: string
          p_parcelas?: number
          p_tipo: string
          p_valor: number
          p_vencimento: string
          p_whatsapp?: string
        }
        Returns: undefined
      }
      fn_creators_lab_descobridores: {
        Args: never
        Returns: {
          descoberto_em: string
          foto_url: string
          nome: string
          posicao: number
          usuario_id: string
        }[]
      }
      fn_creators_lab_ranking: {
        Args: never
        Returns: {
          duracao_ms: number
          foto_url: string
          jogado_em: string
          nome: string
          pontos: number
          posicao: number
          usuario_id: string
          venceu: boolean
          vidas_usadas: number
        }[]
      }
      fn_desafio_alcanca_empresa: {
        Args: { p_empresas: string[] }
        Returns: boolean
      }
      fn_desafio_dados: { Args: { p_desafio_id: string }; Returns: Json }
      fn_desafio_em_cartaz: { Args: never; Returns: Json }
      fn_desafio_empresas: {
        Args: { p_empresa_id: string; p_empresas: string[] }
        Returns: string[]
      }
      fn_desafio_no_meu_alcance: {
        Args: { p_regra: Json; p_setor_id: string; p_visibilidade: string }
        Returns: boolean
      }
      fn_desafio_pessoas: { Args: { p_empresa_id: string }; Returns: Json }
      fn_desafio_pessoas_empresas: {
        Args: { p_empresas: string[] }
        Returns: Json
      }
      fn_desafio_pessoas_interna: {
        Args: { p_empresa_id: string }
        Returns: Json
      }
      fn_desafio_pessoas_multi: {
        Args: { p_convidados?: string[]; p_empresas: string[] }
        Returns: Json
      }
      fn_desafio_setores_disponiveis: { Args: never; Returns: Json }
      fn_desafio_super_admins: { Args: never; Returns: Json }
      fn_diario_resumo_mensal: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: {
          dia_referencia: string
          fora_vinculo: boolean
          operador_id: string
          operador_nome: string
          operador_usuario: string
          setor_geral: string
          total_pagamentos: number
          total_recebido: number
        }[]
      }
      fn_diario_resumo_mes: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: {
          total_dias: number
          total_recebido: number
        }[]
      }
      fn_direto_extra_ativo: {
        Args: { p_empresa_id: string; p_user_id: string }
        Returns: boolean
      }
      fn_direto_extra_definir: {
        Args: {
          p_ativo: boolean
          p_empresa_id: string
          p_escopo: string
          p_referencia_id: string
        }
        Returns: Json
      }
      fn_diretoria_setores_do_mes: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: {
          por_tipo: Json
          qtd_restante: number
          setor_id: string
          setor_nome: string
          total_acordos: number
          total_agendado: number
          total_nao_pago: number
          total_recebido: number
          total_restante: number
        }[]
      }
      fn_eh_cpf: { Args: { p_valor: string }; Returns: boolean }
      fn_empresa_id_bookplay: { Args: never; Returns: string }
      fn_encerrar_ferias_diario: { Args: never; Returns: number }
      fn_encerrar_ferias_vencidas: {
        Args: { p_empresa_id: string }
        Returns: string[]
      }
      fn_equipes_com_lideranca: {
        Args: { p_perfil: string }
        Returns: {
          equipe_id: string
          setor_id: string
        }[]
      }
      fn_equipes_do_operador: {
        Args: { p_operador: string }
        Returns: {
          equipe_id: string
          setor_id: string
        }[]
      }
      fn_equipes_operadores_para_clone: {
        Args: { p_empresa: string }
        Returns: {
          equipe_id: string
          id: string
          nome: string
          perfil: string
          setor_id: string
        }[]
      }
      fn_expurgar_cpf_chat: { Args: never; Returns: number }
      fn_get_perfil_usuario: { Args: { uid: string }; Returns: string }
      fn_get_setor_usuario: { Args: { uid: string }; Returns: string }
      fn_log_contexto: { Args: { p_header: string }; Returns: string }
      fn_log_diff: {
        Args: { p_antes: Json; p_depois: Json; p_ignorar?: string[] }
        Returns: Json
      }
      fn_log_login_recusado: {
        Args: { p_identificador: string; p_motivo?: string }
        Returns: undefined
      }
      fn_log_mascarar: { Args: { p_dados: Json }; Returns: Json }
      fn_log_registrar: {
        Args: {
          p_acao: string
          p_alvo_rotulo?: string
          p_alvo_tipo?: string
          p_antes?: Json
          p_campos?: string[]
          p_categoria?: string
          p_depois?: Json
          p_descricao?: string
          p_detalhes?: Json
          p_empresa_id?: string
          p_origem?: string
          p_registro_id?: string
          p_rota?: string
          p_severidade?: string
          p_tabela?: string
          p_usuario_id?: string
        }
        Returns: string
      }
      fn_log_rotulo_campo: { Args: { p_campo: string }; Returns: string }
      fn_logs_expurgar: {
        Args: { p_dias?: number; p_empresa_id?: string }
        Returns: number
      }
      fn_logs_resumo: {
        Args: {
          p_acao?: string
          p_ate?: string
          p_busca?: string
          p_categoria?: string
          p_de?: string
          p_empresa_id?: string
          p_origem?: string
          p_severidade?: string
          p_tabela?: string
          p_usuario_id?: string
        }
        Returns: Json
      }
      fn_logs_retencao_aplicar: { Args: { p_dias?: number }; Returns: number }
      fn_mestre_abrir_lote: {
        Args: {
          p_arquivo: string
          p_empresa_id: string
          p_hash: string
          p_mes: string
        }
        Returns: string
      }
      fn_mestre_comparar_setores: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: {
          cod_grupo_filtro: string
          diferenca: number
          estado: string
          mestre_colchao_fora: number
          mestre_comparavel: number
          mestre_contribuido: number
          mestre_emprestado_de: number
          mestre_emprestado_para: number
          mestre_proprio: number
          mestre_total: number
          rotulo: string
          setor_id: string
          setor_nome: string
          sistema_ajustes: number
          sistema_analitico: number
          sistema_contrib_receptivo: number
          sistema_linhas: number
          sistema_total: number
        }[]
      }
      fn_mestre_congelar_operadores: {
        Args: { p_lote_id: string }
        Returns: number
      }
      fn_mestre_conta_na_meta: {
        Args: { p_colchao: boolean; p_dt: string }
        Returns: boolean
      }
      fn_mestre_descartar_lote: {
        Args: { p_lote_id: string }
        Returns: undefined
      }
      fn_mestre_destino_equipe: {
        Args: {
          p_cod: string
          p_destino: string
          p_empresa_id: string
          p_setor_id?: string
          p_subgrupo: string
        }
        Returns: undefined
      }
      fn_mestre_e_equipe: { Args: { p_nome: string }; Returns: boolean }
      fn_mestre_emprestados: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: {
          ajuste_valor: number
          cobradora: string
          de_carteira: string
          de_cod: string
          de_setor: string
          de_setor_id: string
          linhas: number
          operador_id: string
          operador_nome: string
          para_setor: string
          para_setor_id: string
          valor: number
        }[]
      }
      fn_mestre_emprestimo_do_setor: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: {
          pessoas: number
          setor_id: string
          valor: number
        }[]
      }
      fn_mestre_inserir_linhas: {
        Args: { p_linhas: Json; p_lote_id: string }
        Returns: number
      }
      fn_mestre_linhas_do_operador: {
        Args: {
          p_cobradora: string
          p_cod: string
          p_empresa_id: string
          p_limite?: number
          p_mes: string
          p_subgrupo?: string
        }
        Returns: {
          cliente: string
          cod_cli: string
          colchao: boolean
          conta_na_meta: boolean
          dias_atraso: number
          dt_lig: string
          dt_pgto: string
          empresa_erp: string
          linha_num: number
          nr_documento: string
          parcela: string
          recebido: number
          setor_carimbado: string
          tipo: string
          tipo_venda: string
          titulo: string
          tp_doc: string
        }[]
      }
      fn_mestre_operadores_da_equipe: {
        Args: {
          p_cod: string
          p_empresa_id: string
          p_mes: string
          p_subgrupo: string
        }
        Returns: {
          cobradora: string
          colchao_fora: number
          colchao_valor: number
          dias: number
          equipe_atual: string
          extra_valor: number
          integral_valor: number
          linhas: number
          nrs: number
          perfil_ativo: boolean
          perfil_id: string
          perfil_nome: string
          recebido: number
          setor_atual: string
        }[]
      }
      fn_mestre_operadores_divergentes: {
        Args: { p_cod: string; p_empresa_id: string; p_mes: string }
        Returns: {
          cobradora: string
          equipe_atual: string
          equipe_esperada: string
          nome_subgrupo: string
          perfil_id: string
          perfil_nome: string
          problema: string
          recebido: number
        }[]
      }
      fn_mestre_origens_do_grupo: {
        Args: { p_cod: string; p_empresa_id: string; p_mes: string }
        Returns: {
          cod_outro: string
          linhas: number
          origem: string
          rotulo: string
          soma: boolean
          tipo: string
          valor: number
        }[]
      }
      fn_mestre_promover_lote: { Args: { p_lote_id: string }; Returns: Json }
      fn_mestre_resumo_equipes: {
        Args: { p_cod: string; p_empresa_id: string; p_mes: string }
        Returns: {
          cobradoras: number
          colchao_fora: number
          destino: string
          destino_setor_id: string
          destino_setor_nome: string
          e_equipe: boolean
          equipe_id: string
          equipe_nome: string
          estado: string
          extra_valor: number
          integral_valor: number
          linhas: number
          nome_subgrupo: string
          primeira_aparicao: string
          recebido: number
          ultima_aparicao: string
        }[]
      }
      fn_mestre_resumo_grupos: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: {
          atestado_valor: number
          cobradoras: number
          cod_grupo_filtro: string
          colchao_fora: number
          colchao_valor: number
          contrib_extra: number
          contrib_integral: number
          dias: number
          emprestado_para: number
          emprestado_pessoas: number
          equipes: number
          estado: string
          extra_proprio: number
          integral_proprio: number
          linhas: number
          nome_cadastrado: string
          nome_no_relatorio: string
          para_outros_extra: number
          para_outros_integral: number
          primeira_aparicao: string
          recebido_proprio: number
          recebido_total: number
          saiu_outro_setor: number
          saiu_somente_geral: number
          sem_destino: number
          setor_id: string
          setor_nome: string
          ultima_aparicao: string
        }[]
      }
      fn_mestre_resumo_setores: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: {
          dos_grupos: number
          grupos: number
          recebido_emprestado: number
          recebido_movido: number
          setor_id: string
          setor_nome: string
          total: number
        }[]
      }
      fn_mestre_setores_sem_grupo: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: {
          setor_id: string
          setor_nome: string
          sistema_linhas: number
          sistema_total: number
        }[]
      }
      fn_mestre_vincular_equipe: {
        Args: {
          p_cod: string
          p_empresa_id: string
          p_equipe_id: string
          p_estado: string
          p_subgrupo: string
        }
        Returns: undefined
      }
      fn_mestre_vincular_grupo: {
        Args: {
          p_cod: string
          p_empresa_id: string
          p_estado: string
          p_observacao?: string
          p_setor_id: string
        }
        Returns: undefined
      }
      fn_mestre_vinculo_operadores: {
        Args: { p_cod: string; p_empresa_id: string; p_mes: string }
        Returns: {
          nome_subgrupo: string
          operadores: number
          sem_cadastro: number
          vinculados: number
        }[]
      }
      fn_meta_esta_bloqueada: {
        Args: {
          p_ano: number
          p_empresa_id: string
          p_mes: number
          p_referencia_id: string
          p_tipo: string
        }
        Returns: boolean
      }
      fn_metas_esta_validada: {
        Args: {
          p_ano: number
          p_empresa_id: string
          p_mes: number
          p_setor_id: string
        }
        Returns: boolean
      }
      fn_metas_reabrir_setor: {
        Args: {
          p_ano: number
          p_empresa_id: string
          p_mes: number
          p_motivo: string
          p_setor_id: string
        }
        Returns: {
          erro: string
          ok: boolean
        }[]
      }
      fn_metas_upsert: {
        Args: { p_payloads: Json }
        Returns: {
          bloqueados: Json
          salvos: number
        }[]
      }
      fn_metas_validar_setor: {
        Args: {
          p_ano: number
          p_empresa_id: string
          p_mes: number
          p_setor_id: string
        }
        Returns: {
          erro: string
          ok: boolean
        }[]
      }
      fn_multiempresa_definir: {
        Args: { p_liberado: boolean; p_usuario_id: string }
        Returns: Json
      }
      fn_multiempresa_definir_empresa: {
        Args: {
          p_empresa_id: string
          p_liberado: boolean
          p_usuario_id: string
        }
        Returns: Json
      }
      fn_multiempresa_elegiveis: {
        Args: never
        Returns: {
          email: string
          empresa_nome: string
          foto_url: string
          nome: string
          perfil: string
          usuario_id: string
        }[]
      }
      fn_multiempresa_listar: {
        Args: never
        Returns: {
          concedido_em: string
          concedido_por: string
          e_super_admin: boolean
          email: string
          empresa_nome: string
          empresas_liberadas: Json
          foto_url: string
          nome: string
          perfil: string
          usuario_id: string
        }[]
      }
      fn_nr_campo_chave: {
        Args: { p_instituicao: string; p_nr_cliente: string }
        Returns: string
      }
      fn_nr_dono_conflitante: {
        Args: {
          p_campo: string
          p_empresa_id: string
          p_grupo_id?: string
          p_nr: string
          p_operador_id: string
        }
        Returns: string
      }
      fn_nr_exigir_livre: {
        Args: {
          p_campo: string
          p_empresa_id: string
          p_grupo_id?: string
          p_nr: string
          p_operador_id: string
        }
        Returns: undefined
      }
      fn_operador_clonado_no_setor: {
        Args: { p_operador_id: string; p_setor_id: string }
        Returns: boolean
      }
      fn_operador_no_meu_alcance_de_equipe: {
        Args: { p_operador: string }
        Returns: boolean
      }
      fn_operador_setor_id: { Args: { p_operador_id: string }; Returns: string }
      fn_origem_da_requisicao: { Args: never; Returns: string }
      fn_ouvidoria_nivel: {
        Args: { target_empresa_id: string }
        Returns: string
      }
      fn_perfil_tem: {
        Args: { p_chave: string; p_perfil: string }
        Returns: boolean
      }
      fn_permissoes_catalogo: {
        Args: never
        Returns: {
          chave: string
          explicita: boolean
          padrao: string[]
          tenants: string[]
        }[]
      }
      fn_permissoes_catalogo_antes_campos_20260906: {
        Args: never
        Returns: {
          chave: string
          explicita: boolean
          padrao: string[]
          tenants: string[]
        }[]
      }
      fn_permissoes_catalogo_antes_desafios2_20260903: {
        Args: never
        Returns: {
          chave: string
          explicita: boolean
          padrao: string[]
          tenants: string[]
        }[]
      }
      fn_permissoes_catalogo_antes_equipe_20260903: {
        Args: never
        Returns: {
          chave: string
          explicita: boolean
          padrao: string[]
          tenants: string[]
        }[]
      }
      fn_permissoes_catalogo_antes_grupos_20260901: {
        Args: never
        Returns: {
          chave: string
          explicita: boolean
          padrao: string[]
          tenants: string[]
        }[]
      }
      fn_permissoes_catalogo_antes_modulos_20260827: {
        Args: never
        Returns: {
          chave: string
          explicita: boolean
          padrao: string[]
          tenants: string[]
        }[]
      }
      fn_permissoes_catalogo_antes_premiacao_20260903: {
        Args: never
        Returns: {
          chave: string
          explicita: boolean
          padrao: string[]
          tenants: string[]
        }[]
      }
      fn_permissoes_catalogo_antes_ranking_20260903: {
        Args: never
        Returns: {
          chave: string
          explicita: boolean
          padrao: string[]
          tenants: string[]
        }[]
      }
      fn_permissoes_catalogo_antes_remocao_20260831: {
        Args: never
        Returns: {
          chave: string
          explicita: boolean
          padrao: string[]
          tenants: string[]
        }[]
      }
      fn_permissoes_catalogo_antes_remocao_20260905: {
        Args: never
        Returns: {
          chave: string
          explicita: boolean
          padrao: string[]
          tenants: string[]
        }[]
      }
      fn_permissoes_catalogo_antes_tv_20260902: {
        Args: never
        Returns: {
          chave: string
          explicita: boolean
          padrao: string[]
          tenants: string[]
        }[]
      }
      fn_permissoes_semear_empresa: {
        Args: { p_empresa_id: string }
        Returns: number
      }
      fn_pet_admin_ajustar_moedas:
        | {
            Args: { p_delta: number; p_usuario: string }
            Returns: {
              moedas_total: number
              ok: boolean
            }[]
          }
        | {
            Args: { p_delta: number; p_motivo: string; p_usuario: string }
            Returns: {
              moedas_total: number
              ok: boolean
            }[]
          }
      fn_pet_admin_listar: {
        Args: never
        Returns: {
          cargo: string
          moedas: number
          moedas_ganhas_total: number
          moedas_gastas_total: number
          nivel: number
          nome: string
          qtd_itens: number
          roupa_equipada: string
          streak: number
          ultimo_dia_ativo: string
          usuario_id: string
          xp: number
        }[]
      }
      fn_pet_comprar_item: {
        Args: { p_item_id: string }
        Returns: {
          erro: string
          moedas_total: number
          ok: boolean
        }[]
      }
      fn_pet_dias_disponiveis: {
        Args: never
        Returns: {
          delta: number
          dia: string
          ja_resgatado: number
          setor_id: string
          total_dia: number
        }[]
      }
      fn_pet_discrepancias_validacao: {
        Args: { p_ano: number; p_empresa_id: string; p_mes: number }
        Returns: {
          dia_referencia: string
          diferenca: number
          moedas_creditadas: number
          setor_id: string
          setor_nome: string
          usuario_id: string
          usuario_nome: string
          valor_atual: number
          valor_validado: number
        }[]
      }
      fn_pet_estado_get: {
        Args: never
        Returns: {
          atualizado_em: string
          criado_em: string
          dormindo: boolean
          itens_desbloqueados: Json
          moedas: number
          moedas_ganhas_total: number
          moedas_gastas_total: number
          nivel: number
          roupa_equipada: string
          streak: number
          ultimo_dia_ativo: string | null
          usuario_id: string
          xp: number
        }
        SetofOptions: {
          from: "*"
          to: "pet_estado"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_pet_gastar_moedas: {
        Args: { p_item?: string; p_valor: number }
        Returns: {
          moedas_total: number
          ok: boolean
        }[]
      }
      fn_pet_nome_resultado: {
        Args: never
        Returns: {
          empresa_id: string
          empresa_slug: string
          nome_escolhido: string
          votos: number
        }[]
      }
      fn_pet_recompensa_disponivel: {
        Args: never
        Returns: {
          moedas_disponivel: number
          valor_disponivel: number
        }[]
      }
      fn_pet_resgatar_recompensa: {
        Args: never
        Returns: {
          moedas_creditadas: number
          moedas_total: number
          valor_base: number
        }[]
      }
      fn_pet_salvar_visual: {
        Args: { p_dormindo: boolean; p_roupa: string }
        Returns: undefined
      }
      fn_pet_taxa: { Args: never; Returns: number }
      fn_pix_dias_uteis_apos: {
        Args: { p_base: string; p_dias: number }
        Returns: string
      }
      fn_pix_expurga_desaprovados: {
        Args: { p_empresa_id: string }
        Returns: number
      }
      fn_pix_lixeira_purgar: { Args: { p_empresa_id: string }; Returns: number }
      fn_pix_log: {
        Args: {
          p_acao: string
          p_acordo_id: string
          p_antes?: Json
          p_depois?: Json
          p_descricao: string
          p_empresa_id: string
          p_nr: string
          p_operador_id: string
          p_operador_nome: string
          p_valor: number
        }
        Returns: undefined
      }
      fn_pix_nr_normalizar: { Args: { p_nr: string }; Returns: string }
      fn_pix_nr_pedido_cancelar: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      fn_pix_nr_pedido_decidir: {
        Args: { p_aprovar: boolean; p_motivo?: string; p_pedido_id: string }
        Returns: {
          acordo_id: string | null
          conflito_acordo_id: string | null
          conflito_em: string | null
          conflito_operador: string | null
          conflito_status: string | null
          conflito_valor: number | null
          criado_em: string
          criado_por: string | null
          decidido_em: string | null
          decidido_por: string | null
          decidido_por_nome: string | null
          decisao_motivo: string | null
          empresa_id: string
          extra: boolean
          id: string
          motivo: string | null
          nr_cliente: string
          operador_id: string
          operador_nome: string | null
          setor_id: string | null
          status: string
          valor: number
        }
        SetofOptions: {
          from: "*"
          to: "pix_automatico_nr_pedidos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_pix_nr_pedir: {
        Args: {
          p_extra?: boolean
          p_motivo?: string
          p_nr_cliente: string
          p_operador_id: string
          p_valor: number
        }
        Returns: {
          acordo_id: string | null
          conflito_acordo_id: string | null
          conflito_em: string | null
          conflito_operador: string | null
          conflito_status: string | null
          conflito_valor: number | null
          criado_em: string
          criado_por: string | null
          decidido_em: string | null
          decidido_por: string | null
          decidido_por_nome: string | null
          decisao_motivo: string | null
          empresa_id: string
          extra: boolean
          id: string
          motivo: string | null
          nr_cliente: string
          operador_id: string
          operador_nome: string | null
          setor_id: string | null
          status: string
          valor: number
        }
        SetofOptions: {
          from: "*"
          to: "pix_automatico_nr_pedidos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_pix_pode_ajustar_saldo: { Args: never; Returns: boolean }
      fn_pix_premiacao_marcar_pagamento:
        | {
            Args: {
              p_empresa_id: string
              p_mes: string
              p_operador_id: string
              p_pago: boolean
            }
            Returns: {
              atualizado_em: string
              atualizado_por: string | null
              atualizado_por_nome: string | null
              empresa_id: string
              id: number
              mes: string
              operador_id: string
              operador_nome: string
              pago: boolean
              pago_em: string | null
              pago_por: string | null
              pago_por_nome: string | null
              valor_pago: number | null
            }
            SetofOptions: {
              from: "*"
              to: "pix_automatico_premiacoes_pagamento"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_empresa_id: string
              p_mes: string
              p_operador_id: string
              p_pago: boolean
              p_valor_pago: number
            }
            Returns: {
              atualizado_em: string
              atualizado_por: string | null
              atualizado_por_nome: string | null
              empresa_id: string
              id: number
              mes: string
              operador_id: string
              operador_nome: string
              pago: boolean
              pago_em: string | null
              pago_por: string | null
              pago_por_nome: string | null
              valor_pago: number | null
            }
            SetofOptions: {
              from: "*"
              to: "pix_automatico_premiacoes_pagamento"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      fn_pix_restaurar_lixeira: { Args: { p_item_id: string }; Returns: string }
      fn_pix_saldo_aplicar: {
        Args: { p_acordo_id: string }
        Returns: {
          ajuste_em: string | null
          ajuste_motivo: string | null
          ajuste_por: string | null
          ajuste_por_nome: string | null
          ajuste_valor: number | null
          atualizado_em: string
          avaliado_em: string | null
          avaliado_por: string | null
          avaliado_por_nome: string | null
          criado_em: string
          empresa_id: string
          extra: boolean
          id: string
          nr_cliente: string
          operador_id: string
          operador_nome: string | null
          pago: boolean
          pago_em: string | null
          pago_por: string | null
          pago_por_nome: string | null
          pct_comissao: number | null
          setor_id: string | null
          status: string
          valor: number
        }
        SetofOptions: {
          from: "*"
          to: "pix_automatico_acordos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_pix_saldo_definir: {
        Args: {
          p_empresa_id: string
          p_motivo?: string
          p_operador_id: string
          p_somar?: boolean
          p_valor: number
        }
        Returns: {
          acordo_id: string | null
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          criado_por_nome: string | null
          empresa_id: string
          id: string
          motivo: string | null
          operador_id: string
          operador_nome: string | null
          reservado_em: string | null
          setor_id: string | null
          valor: number
        }
        SetofOptions: {
          from: "*"
          to: "pix_automatico_saldos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_pix_saldo_retirar: {
        Args: { p_acordo_id: string }
        Returns: {
          ajuste_em: string | null
          ajuste_motivo: string | null
          ajuste_por: string | null
          ajuste_por_nome: string | null
          ajuste_valor: number | null
          atualizado_em: string
          avaliado_em: string | null
          avaliado_por: string | null
          avaliado_por_nome: string | null
          criado_em: string
          empresa_id: string
          extra: boolean
          id: string
          nr_cliente: string
          operador_id: string
          operador_nome: string | null
          pago: boolean
          pago_em: string | null
          pago_por: string | null
          pago_por_nome: string | null
          pct_comissao: number | null
          setor_id: string | null
          status: string
          valor: number
        }
        SetofOptions: {
          from: "*"
          to: "pix_automatico_acordos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_pix_valor_br: { Args: { p_valor: number }; Returns: string }
      fn_pode_autorizar_pedido: {
        Args: { p_empresa_id: string; p_setores: string[] }
        Returns: boolean
      }
      fn_pode_editar_foto_setor: {
        Args: { p_setor_id: string }
        Returns: boolean
      }
      fn_pode_gerir_acordo: {
        Args: { p_operador_id: string; p_setor_id: string }
        Returns: boolean
      }
      fn_pp_ho_percentual: { Args: never; Returns: number }
      fn_profissional_registrar_uf: {
        Args: {
          p_codigo: string
          p_empresa_id: string
          p_estado_uf: string
          p_nome?: string
        }
        Returns: string
      }
      fn_recebimento_indireto_mes: {
        Args: { p_empresa_id: string; p_mes: string; p_operadores?: string[] }
        Returns: {
          operador_id: string
          qtd: number
          total_bruto: number
        }[]
      }
      fn_relatorio_reabrir_setor: {
        Args: {
          p_ano: number
          p_empresa_id: string
          p_mes: number
          p_motivo: string
          p_origem?: string
          p_setor_id: string
        }
        Returns: {
          dias_removidos: number
          erro: string
          ok: boolean
        }[]
      }
      fn_relatorio_status_validacao: {
        Args: {
          p_ano: number
          p_empresa_id: string
          p_mes: number
          p_setor_id: string
        }
        Returns: {
          dias_com_dado: number
          dias_validados: number
          origem: string
          valor_atual: number
          valor_validado: number
        }[]
      }
      fn_relatorio_validar_setor: {
        Args: {
          p_ano: number
          p_empresa_id: string
          p_mes: number
          p_origem?: string
          p_setor_id: string
        }
        Returns: {
          dias_validados: number
          erro: string
          ok: boolean
        }[]
      }
      fn_rh_abrir_competencia: {
        Args: {
          p_competencia: string
          p_empresa_id: string
          p_mes_apuracao?: string
          p_prazo?: string
        }
        Returns: {
          aberto_em: string
          aberto_por: string | null
          aberto_por_nome: string | null
          atualizado_em: string
          competencia: string
          criado_em: string
          empresa_id: string
          finalizado_em: string | null
          finalizado_por: string | null
          finalizado_por_nome: string | null
          id: string
          mes_apuracao: string
          observacao: string | null
          prazo: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "rh_fechamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_rh_aprovar_equipe: {
        Args: { p_equipe_id: string; p_fechamento_id: string }
        Returns: number
      }
      fn_rh_aprovar_operador: {
        Args: { p_lancamento_id: string }
        Returns: {
          atualizado_em: string
          celula_snapshot: string
          cracha_snapshot: string | null
          criado_em: string
          decidido_em: string | null
          decidido_por: string | null
          decidido_por_nome: string | null
          devolucao_escopo: string | null
          dispensado: boolean
          dispensado_por: string | null
          dispensado_por_nome: string | null
          empresa_id: string
          enviado_em: string | null
          equipe_id_snapshot: string | null
          equipe_nome_snapshot: string | null
          fechamento_id: string
          id: string
          meta_snapshot: number | null
          motivo_devolucao: string | null
          motivo_dispensa: string | null
          nome_snapshot: string
          observacao: string | null
          operador_id: string
          percentual_snapshot: number | null
          preenchido_em: string | null
          preenchido_por: string | null
          preenchido_por_nome: string | null
          recebido_snapshot: number | null
          setor_id_snapshot: string
          setor_nome_snapshot: string
          status: string
          tipo_remuneracao_snapshot: string
          validado_em: string | null
          validado_por: string | null
          validado_por_nome: string | null
          valor: number | null
        }
        SetofOptions: {
          from: "*"
          to: "rh_lancamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_rh_concluir_equipe: {
        Args: { p_equipe_id: string; p_fechamento_id: string }
        Returns: number
      }
      fn_rh_congelar_percentual: {
        Args: {
          p_lancamento_id: string
          p_meta: number
          p_percentual: number
          p_recebido: number
        }
        Returns: {
          atualizado_em: string
          celula_snapshot: string
          cracha_snapshot: string | null
          criado_em: string
          decidido_em: string | null
          decidido_por: string | null
          decidido_por_nome: string | null
          devolucao_escopo: string | null
          dispensado: boolean
          dispensado_por: string | null
          dispensado_por_nome: string | null
          empresa_id: string
          enviado_em: string | null
          equipe_id_snapshot: string | null
          equipe_nome_snapshot: string | null
          fechamento_id: string
          id: string
          meta_snapshot: number | null
          motivo_devolucao: string | null
          motivo_dispensa: string | null
          nome_snapshot: string
          observacao: string | null
          operador_id: string
          percentual_snapshot: number | null
          preenchido_em: string | null
          preenchido_por: string | null
          preenchido_por_nome: string | null
          recebido_snapshot: number | null
          setor_id_snapshot: string
          setor_nome_snapshot: string
          status: string
          tipo_remuneracao_snapshot: string
          validado_em: string | null
          validado_por: string | null
          validado_por_nome: string | null
          valor: number | null
        }
        SetofOptions: {
          from: "*"
          to: "rh_lancamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_rh_cracha_visivel: {
        Args: { p_empresa_id: string; p_operador_id: string }
        Returns: boolean
      }
      fn_rh_definir_prazo: {
        Args: { p_fechamento_id: string; p_motivo?: string; p_prazo: string }
        Returns: {
          aberto_em: string
          aberto_por: string | null
          aberto_por_nome: string | null
          atualizado_em: string
          competencia: string
          criado_em: string
          empresa_id: string
          finalizado_em: string | null
          finalizado_por: string | null
          finalizado_por_nome: string | null
          id: string
          mes_apuracao: string
          observacao: string | null
          prazo: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "rh_fechamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_rh_devolver_equipe: {
        Args: { p_equipe_id: string; p_fechamento_id: string; p_motivo: string }
        Returns: number
      }
      fn_rh_devolver_operador: {
        Args: { p_lancamento_id: string; p_motivo: string }
        Returns: {
          atualizado_em: string
          celula_snapshot: string
          cracha_snapshot: string | null
          criado_em: string
          decidido_em: string | null
          decidido_por: string | null
          decidido_por_nome: string | null
          devolucao_escopo: string | null
          dispensado: boolean
          dispensado_por: string | null
          dispensado_por_nome: string | null
          empresa_id: string
          enviado_em: string | null
          equipe_id_snapshot: string | null
          equipe_nome_snapshot: string | null
          fechamento_id: string
          id: string
          meta_snapshot: number | null
          motivo_devolucao: string | null
          motivo_dispensa: string | null
          nome_snapshot: string
          observacao: string | null
          operador_id: string
          percentual_snapshot: number | null
          preenchido_em: string | null
          preenchido_por: string | null
          preenchido_por_nome: string | null
          recebido_snapshot: number | null
          setor_id_snapshot: string
          setor_nome_snapshot: string
          status: string
          tipo_remuneracao_snapshot: string
          validado_em: string | null
          validado_por: string | null
          validado_por_nome: string | null
          valor: number | null
        }
        SetofOptions: {
          from: "*"
          to: "rh_lancamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_rh_dispensar_operador: {
        Args: {
          p_dispensado: boolean
          p_lancamento_id: string
          p_motivo?: string
        }
        Returns: {
          atualizado_em: string
          celula_snapshot: string
          cracha_snapshot: string | null
          criado_em: string
          decidido_em: string | null
          decidido_por: string | null
          decidido_por_nome: string | null
          devolucao_escopo: string | null
          dispensado: boolean
          dispensado_por: string | null
          dispensado_por_nome: string | null
          empresa_id: string
          enviado_em: string | null
          equipe_id_snapshot: string | null
          equipe_nome_snapshot: string | null
          fechamento_id: string
          id: string
          meta_snapshot: number | null
          motivo_devolucao: string | null
          motivo_dispensa: string | null
          nome_snapshot: string
          observacao: string | null
          operador_id: string
          percentual_snapshot: number | null
          preenchido_em: string | null
          preenchido_por: string | null
          preenchido_por_nome: string | null
          recebido_snapshot: number | null
          setor_id_snapshot: string
          setor_nome_snapshot: string
          status: string
          tipo_remuneracao_snapshot: string
          validado_em: string | null
          validado_por: string | null
          validado_por_nome: string | null
          valor: number | null
        }
        SetofOptions: {
          from: "*"
          to: "rh_lancamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_rh_enviar_setor: {
        Args: { p_fechamento_id: string; p_setor_id: string }
        Returns: number
      }
      fn_rh_equipes_que_lidero: { Args: never; Returns: string[] }
      fn_rh_evento: {
        Args: {
          p_descricao: string
          p_equipe_id?: string
          p_escopo: string
          p_fechamento_id: string
          p_lancamento_id: string
          p_motivo?: string
          p_setor_id?: string
          p_tipo: string
          p_valor_anterior?: number
          p_valor_novo?: number
        }
        Returns: undefined
      }
      fn_rh_exigir_aberto: {
        Args: { p_fechamento_id: string }
        Returns: {
          aberto_em: string
          aberto_por: string | null
          aberto_por_nome: string | null
          atualizado_em: string
          competencia: string
          criado_em: string
          empresa_id: string
          finalizado_em: string | null
          finalizado_por: string | null
          finalizado_por_nome: string | null
          id: string
          mes_apuracao: string
          observacao: string | null
          prazo: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "rh_fechamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_rh_finalizar_competencia: {
        Args: { p_fechamento_id: string }
        Returns: {
          aberto_em: string
          aberto_por: string | null
          aberto_por_nome: string | null
          atualizado_em: string
          competencia: string
          criado_em: string
          empresa_id: string
          finalizado_em: string | null
          finalizado_por: string | null
          finalizado_por_nome: string | null
          id: string
          mes_apuracao: string
          observacao: string | null
          prazo: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "rh_fechamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_rh_lancamento_visivel: {
        Args: { p_empresa_id: string; p_equipe_id: string; p_setor_id: string }
        Returns: boolean
      }
      fn_rh_notificar: {
        Args: {
          p_empresa_id: string
          p_mensagem: string
          p_rota: string
          p_titulo: string
          p_usuario_id: string
        }
        Returns: undefined
      }
      fn_rh_pode: { Args: { p_chave: string }; Returns: boolean }
      fn_rh_reabrir_competencia: {
        Args: { p_fechamento_id: string; p_motivo: string }
        Returns: {
          aberto_em: string
          aberto_por: string | null
          aberto_por_nome: string | null
          atualizado_em: string
          competencia: string
          criado_em: string
          empresa_id: string
          finalizado_em: string | null
          finalizado_por: string | null
          finalizado_por_nome: string | null
          id: string
          mes_apuracao: string
          observacao: string | null
          prazo: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "rh_fechamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_rh_salvar_cracha: {
        Args: { p_cracha: string; p_empresa_id: string; p_operador_id: string }
        Returns: {
          atualizado_em: string
          atualizado_por: string | null
          atualizado_por_nome: string | null
          cracha: string | null
          criado_em: string
          empresa_id: string
          id: string
          operador_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rh_dados_operadores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_rh_salvar_lancamento: {
        Args: {
          p_lancamento_id: string
          p_observacao?: string
          p_valor: number
        }
        Returns: {
          atualizado_em: string
          celula_snapshot: string
          cracha_snapshot: string | null
          criado_em: string
          decidido_em: string | null
          decidido_por: string | null
          decidido_por_nome: string | null
          devolucao_escopo: string | null
          dispensado: boolean
          dispensado_por: string | null
          dispensado_por_nome: string | null
          empresa_id: string
          enviado_em: string | null
          equipe_id_snapshot: string | null
          equipe_nome_snapshot: string | null
          fechamento_id: string
          id: string
          meta_snapshot: number | null
          motivo_devolucao: string | null
          motivo_dispensa: string | null
          nome_snapshot: string
          observacao: string | null
          operador_id: string
          percentual_snapshot: number | null
          preenchido_em: string | null
          preenchido_por: string | null
          preenchido_por_nome: string | null
          recebido_snapshot: number | null
          setor_id_snapshot: string
          setor_nome_snapshot: string
          status: string
          tipo_remuneracao_snapshot: string
          validado_em: string | null
          validado_por: string | null
          validado_por_nome: string | null
          valor: number | null
        }
        SetofOptions: {
          from: "*"
          to: "rh_lancamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_rh_validar_equipe: {
        Args: { p_equipe_id: string; p_fechamento_id: string }
        Returns: number
      }
      fn_set_setor_foto: {
        Args: { p_campo?: string; p_foto_url: string; p_setor_id: string }
        Returns: boolean
      }
      fn_setores_do_operador: {
        Args: { p_operador: string }
        Returns: string[]
      }
      fn_sincronizar_cartoes_pagos: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: number
      }
      fn_situacao_operador: { Args: { p_operador_id: string }; Returns: string }
      fn_super_admin_permissoes_completas: { Args: never; Returns: Json }
      fn_sync_par_vinculo: {
        Args: {
          p_acordo_id: string
          p_nome_cliente: string
          p_parcelas?: number
          p_status?: string
          p_tipo: string
          p_valor: number
          p_vencimento: string
          p_whatsapp?: string
        }
        Returns: undefined
      }
      fn_texto_censurado_cpf: { Args: never; Returns: string }
      fn_texto_tem_cpf: { Args: { p_texto: string }; Returns: boolean }
      fn_ticket_nome_do_autor: { Args: never; Returns: string }
      fn_ticket_notificar: {
        Args: {
          p_destinos: string[]
          p_empresa_id: string
          p_mensagem: string
          p_ticket_id: string
          p_titulo: string
        }
        Returns: undefined
      }
      fn_ticket_pode_abrir: { Args: never; Returns: boolean }
      fn_ticket_pode_atender: { Args: never; Returns: boolean }
      fn_ticket_visivel: {
        Args: { p_aberto_por: string; p_empresa_id: string; p_setor_id: string }
        Returns: boolean
      }
      fn_transferencia_desfazer: {
        Args: { p_transferencia_id: string }
        Returns: Json
      }
      fn_transferencia_mover_empresa: {
        Args: { p_empresa_id: string; p_perfil_id: string; p_setor_id: string }
        Returns: Json
      }
      fn_transferir_acordo_nr: {
        Args: {
          p_acordo_id: string
          p_motivo?: string
          p_novo_operador_id?: string
        }
        Returns: Json
      }
      fn_tv_alerta_disparar: {
        Args: {
          p_duracao_s?: number
          p_mensagem?: string
          p_midia_url?: string
          p_setor_id: string
          p_som_url?: string
          p_titulo: string
        }
        Returns: {
          criado_em: string
          criado_por: string | null
          criado_por_nome: string | null
          duracao_s: number
          empresa_id: string
          id: string
          mensagem: string | null
          midia_url: string | null
          setor_id: string
          som_url: string | null
          titulo: string
        }
        SetofOptions: {
          from: "*"
          to: "tv_alertas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_tv_bingo_encerrar: {
        Args: { p_sorteio_id: string; p_vencedor: string }
        Returns: {
          config: Json
          criado_em: string
          criado_por: string | null
          empresa_id: string
          estado: string
          girado_em: string | null
          girado_por: string | null
          girado_por_nome: string | null
          id: string
          participantes: Json
          resultado: Json
          setor_id: string
          tipo: string
          titulo: string
        }
        SetofOptions: {
          from: "*"
          to: "tv_sorteios"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_tv_bingo_sortear: {
        Args: { p_ate?: number; p_sorteio_id: string }
        Returns: {
          config: Json
          criado_em: string
          criado_por: string | null
          empresa_id: string
          estado: string
          girado_em: string | null
          girado_por: string | null
          girado_por_nome: string | null
          id: string
          participantes: Json
          resultado: Json
          setor_id: string
          tipo: string
          titulo: string
        }
        SetofOptions: {
          from: "*"
          to: "tv_sorteios"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_tv_cortar: {
        Args: { p_cena_id: string; p_tela_id: string }
        Returns: {
          atualizado_em: string
          atualizado_por: string | null
          cena_id: string | null
          tela_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tv_estado"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_tv_metricas_setor: {
        Args: { p_empresa_id: string; p_mes: string; p_setor_id: string }
        Returns: Json
      }
      fn_tv_palco: {
        Args: { p_cena_id?: string; p_slug: string }
        Returns: Json
      }
      fn_tv_rotacao: {
        Args: { p_ativa: boolean; p_tela_id: string }
        Returns: boolean
      }
      fn_tv_sinal_vida: { Args: { p_slug: string }; Returns: undefined }
      fn_tv_sorteio_criar:
        | {
            Args: {
              p_participantes?: Json
              p_setor_id: string
              p_tipo: string
              p_titulo: string
            }
            Returns: {
              config: Json
              criado_em: string
              criado_por: string | null
              empresa_id: string
              estado: string
              girado_em: string | null
              girado_por: string | null
              girado_por_nome: string | null
              id: string
              participantes: Json
              resultado: Json
              setor_id: string
              tipo: string
              titulo: string
            }
            SetofOptions: {
              from: "*"
              to: "tv_sorteios"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_config?: Json
              p_participantes?: Json
              p_setor_id: string
              p_tipo: string
              p_titulo: string
            }
            Returns: {
              config: Json
              criado_em: string
              criado_por: string | null
              empresa_id: string
              estado: string
              girado_em: string | null
              girado_por: string | null
              girado_por_nome: string | null
              id: string
              participantes: Json
              resultado: Json
              setor_id: string
              tipo: string
              titulo: string
            }
            SetofOptions: {
              from: "*"
              to: "tv_sorteios"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      fn_tv_sorteio_girar: {
        Args: { p_sorteio_id: string }
        Returns: {
          config: Json
          criado_em: string
          criado_por: string | null
          empresa_id: string
          estado: string
          girado_em: string | null
          girado_por: string | null
          girado_por_nome: string | null
          id: string
          participantes: Json
          resultado: Json
          setor_id: string
          tipo: string
          titulo: string
        }
        SetofOptions: {
          from: "*"
          to: "tv_sorteios"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_tv_sorteio_reiniciar: {
        Args: { p_sorteio_id: string }
        Returns: {
          config: Json
          criado_em: string
          criado_por: string | null
          empresa_id: string
          estado: string
          girado_em: string | null
          girado_por: string | null
          girado_por_nome: string | null
          id: string
          participantes: Json
          resultado: Json
          setor_id: string
          tipo: string
          titulo: string
        }
        SetofOptions: {
          from: "*"
          to: "tv_sorteios"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_user_acesso_multiempresa: { Args: never; Returns: boolean }
      fn_user_empresa_id: { Args: never; Returns: string }
      fn_user_empresa_is_bookplay: { Args: never; Returns: boolean }
      fn_user_empresa_is_pagueplay: { Args: never; Returns: boolean }
      fn_user_empresas_liberadas: { Args: never; Returns: string[] }
      fn_user_equipes: { Args: never; Returns: string[] }
      fn_user_escopo: { Args: { p_aba: string }; Returns: number }
      fn_user_escopo_acordos: { Args: never; Returns: number }
      fn_user_escopo_analitico: { Args: never; Returns: number }
      fn_user_escopo_perfis: { Args: never; Returns: number }
      fn_user_has_any_role: { Args: { roles: string[] }; Returns: boolean }
      fn_user_is_super_admin: { Args: never; Returns: boolean }
      fn_user_perfil: { Args: never; Returns: string }
      fn_user_setor_id: { Args: never; Returns: string }
      fn_user_tem: { Args: { p_chave: string }; Returns: boolean }
      fn_uso_adocao_tela: {
        Args: {
          p_ate: string
          p_cargo?: string
          p_desde: string
          p_empresa_id: string
          p_equipe_id?: string
          p_setor_id?: string
          p_tela?: string
        }
        Returns: {
          aberturas: number
          cargo: string
          empresa_id: string
          empresa_nome: string
          equipe_nome: string
          nome: string
          segundos: number
          setor_nome: string
          ultimo_em: string
          usuario_id: string
        }[]
      }
      fn_uso_detalhe_pessoa: {
        Args: { p_ate: string; p_desde: string; p_usuario_id: string }
        Returns: {
          aberturas: number
          dias: number
          primeiro_em: string
          segundos: number
          tela: string
          ultimo_em: string
        }[]
      }
      fn_uso_detalhe_pessoa_dias: {
        Args: { p_ate: string; p_desde: string; p_usuario_id: string }
        Returns: {
          aberturas: number
          dia: string
          segundos: number
        }[]
      }
      fn_uso_expurgar: { Args: { p_dias?: number }; Returns: number }
      fn_uso_perfil_pessoa: {
        Args: { p_ate: string; p_desde: string; p_usuario_id: string }
        Returns: Json
      }
      fn_uso_por_dia: {
        Args: {
          p_ate: string
          p_cargo?: string
          p_desde: string
          p_empresa_id: string
          p_equipe_id?: string
          p_setor_id?: string
        }
        Returns: {
          aberturas: number
          dia: string
          pessoas: number
          segundos: number
        }[]
      }
      fn_uso_por_pessoa: {
        Args: {
          p_ate: string
          p_cargo?: string
          p_desde: string
          p_empresa_id: string
          p_equipe_id?: string
          p_setor_id?: string
        }
        Returns: {
          aberturas: number
          cargo: string
          dias_ativos: number
          empresa_id: string
          empresa_nome: string
          empresas: string[]
          equipe_nome: string
          nome: string
          segundos: number
          setor_nome: string
          telas_usadas: number
          ultimo_em: string
          usuario_id: string
        }[]
      }
      fn_uso_por_tela: {
        Args: {
          p_ate: string
          p_cargo?: string
          p_desde: string
          p_empresa_id: string
          p_equipe_id?: string
          p_setor_id?: string
        }
        Returns: {
          aberturas: number
          pessoas: number
          segundos: number
          tela: string
        }[]
      }
      fn_uso_registrar: {
        Args: { p_abertura?: boolean; p_segundos?: number; p_tela: string }
        Returns: undefined
      }
      fn_uso_registrar_sessao: { Args: never; Returns: undefined }
      fn_uso_sem_acesso: {
        Args: {
          p_ate: string
          p_cargo?: string
          p_desde: string
          p_empresa_id: string
          p_equipe_id?: string
          p_setor_id?: string
        }
        Returns: {
          cargo: string
          criado_em: string
          empresa_id: string
          empresa_nome: string
          equipe_nome: string
          nome: string
          setor_nome: string
          situacao: string
          ultimo_em: string
          usuario: string
          usuario_id: string
        }[]
      }
      fn_vincular_extra_ao_direto: {
        Args: {
          p_direto_id: string
          p_extra_op_id: string
          p_extra_op_nome: string
          p_instituicao: string
          p_nome_cliente: string
          p_nr_cliente: string
          p_parcelas?: number
          p_tipo: string
          p_valor: number
          p_vencimento: string
          p_whatsapp?: string
        }
        Returns: undefined
      }
      fn_wpp_chat_aberto: {
        Args: { p_solicitacao_id: string }
        Returns: boolean
      }
      fn_wpp_diretorio: {
        Args: never
        Returns: {
          foto_url: string
          id: string
          nome: string
        }[]
      }
      fn_wpp_eh_responsavel: { Args: never; Returns: boolean }
      fn_wpp_marcar_nao_concluidos: {
        Args: { p_empresa_id: string }
        Returns: number
      }
      fn_wpp_pode_falar: {
        Args: { p_solicitacao_id: string }
        Returns: boolean
      }
      fn_wpp_pode_ver_solicitacao: {
        Args: { p_solicitacao_id: string }
        Returns: boolean
      }
      fn_wpp_tem_visao_geral: { Args: never; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      perfil_usuario:
        | "operador"
        | "lider"
        | "administrador"
        | "super_admin"
        | "elite"
        | "gerencia"
        | "diretoria"
        | "ouvidoria"
      status_acordo:
        | "pendente"
        | "pago"
        | "verificar"
        | "vencido"
        | "cancelado"
        | "em_acompanhamento"
      tipo_acordo: "boleto" | "pix" | "cartao"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      perfil_usuario: [
        "operador",
        "lider",
        "administrador",
        "super_admin",
        "elite",
        "gerencia",
        "diretoria",
        "ouvidoria",
      ],
      status_acordo: [
        "pendente",
        "pago",
        "verificar",
        "vencido",
        "cancelado",
        "em_acompanhamento",
      ],
      tipo_acordo: ["boleto", "pix", "cartao"],
    },
  },
} as const
