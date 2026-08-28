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
          criado_em: string
          empresa_id: string
          equipe_id: string | null
          equipe_nome: string | null
          equipes_clone: string[]
          mes: string
          operador_id: string
          setor_id: string | null
          situacao: string
        }
        Insert: {
          criado_em?: string
          empresa_id: string
          equipe_id?: string | null
          equipe_nome?: string | null
          equipes_clone?: string[]
          mes: string
          operador_id: string
          setor_id?: string | null
          situacao?: string
        }
        Update: {
          criado_em?: string
          empresa_id?: string
          equipe_id?: string | null
          equipe_nome?: string | null
          equipes_clone?: string[]
          mes?: string
          operador_id?: string
          setor_id?: string | null
          situacao?: string
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
          slug: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          config?: Json | null
          criado_em?: string
          id?: string
          nome: string
          slug: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          config?: Json | null
          criado_em?: string
          id?: string
          nome?: string
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
            isOneToOne: true
            referencedRelation: "empresas"
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
          criado_em: string
          desligado_em: string | null
          email: string
          empresa_id: string
          equipe_id: string | null
          foto_url: string | null
          id: string
          lider_id: string | null
          nome: string
          perfil: string
          pet_despedida: string | null
          senha_alterada: boolean
          setor_id: string | null
          situacao: string
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
          criado_em?: string
          desligado_em?: string | null
          email: string
          empresa_id: string
          equipe_id?: string | null
          foto_url?: string | null
          id: string
          lider_id?: string | null
          nome: string
          perfil: string
          pet_despedida?: string | null
          senha_alterada?: boolean
          setor_id?: string | null
          situacao?: string
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
          criado_em?: string
          desligado_em?: string | null
          email?: string
          empresa_id?: string
          equipe_id?: string | null
          foto_url?: string | null
          id?: string
          lider_id?: string | null
          nome?: string
          perfil?: string
          pet_despedida?: string | null
          senha_alterada?: boolean
          setor_id?: string | null
          situacao?: string
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
          acordo_id: string
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
          acordo_id: string
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
          acordo_id?: string
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
          empresa_id: string
          enviado_em: string | null
          equipe_id_snapshot: string | null
          equipe_nome_snapshot: string | null
          fechamento_id: string
          id: string
          meta_snapshot: number | null
          motivo_devolucao: string | null
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
          empresa_id: string
          enviado_em?: string | null
          equipe_id_snapshot?: string | null
          equipe_nome_snapshot?: string | null
          fechamento_id: string
          id?: string
          meta_snapshot?: number | null
          motivo_devolucao?: string | null
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
          empresa_id?: string
          enviado_em?: string | null
          equipe_id_snapshot?: string | null
          equipe_nome_snapshot?: string | null
          fechamento_id?: string
          id?: string
          meta_snapshot?: number | null
          motivo_devolucao?: string | null
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
      fn_eh_cpf: { Args: { p_valor: string }; Returns: boolean }
      fn_empresa_id_bookplay: { Args: never; Returns: string }
      fn_equipes_do_operador: {
        Args: { p_operador: string }
        Returns: {
          equipe_id: string
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
      fn_operador_setor_id: { Args: { p_operador_id: string }; Returns: string }
      fn_origem_da_requisicao: { Args: never; Returns: string }
      fn_ouvidoria_nivel: {
        Args: { target_empresa_id: string }
        Returns: string
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
      fn_pix_pode_ajustar_saldo: { Args: Record<string, never>; Returns: boolean }
      fn_pix_saldo_aplicar: {
        Args: { p_acordo_id: string }
        Returns: Database["public"]["Tables"]["pix_automatico_acordos"]["Row"]
      }
      fn_pix_saldo_definir: {
        Args: {
          p_empresa_id: string
          p_operador_id: string
          p_valor: number
          p_motivo?: string | null
          p_somar?: boolean
        }
        Returns: Database["public"]["Tables"]["pix_automatico_saldos"]["Row"] | null
      }
      fn_pix_saldo_retirar: {
        Args: { p_acordo_id: string }
        Returns: Database["public"]["Tables"]["pix_automatico_acordos"]["Row"]
      }
      fn_pix_restaurar_lixeira: { Args: { p_item_id: string }; Returns: string }
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
      fn_user_acesso_multiempresa: { Args: never; Returns: boolean }
      fn_rh_abrir_competencia: {
        Args: {
          p_empresa_id: string
          p_competencia: string
          p_mes_apuracao?: string | null
          p_prazo?: string | null
        }
        Returns: Database["public"]["Tables"]["rh_fechamentos"]["Row"]
      }
      fn_rh_aprovar_equipe: {
        Args: { p_fechamento_id: string; p_equipe_id: string }
        Returns: number
      }
      fn_rh_aprovar_operador: {
        Args: { p_lancamento_id: string }
        Returns: Database["public"]["Tables"]["rh_lancamentos"]["Row"]
      }
      fn_rh_concluir_equipe: {
        Args: { p_fechamento_id: string; p_equipe_id: string }
        Returns: number
      }
      fn_rh_congelar_percentual: {
        Args: {
          p_lancamento_id: string
          p_percentual: number
          p_meta: number
          p_recebido: number
        }
        Returns: Database["public"]["Tables"]["rh_lancamentos"]["Row"]
      }
      fn_rh_definir_prazo: {
        Args: { p_fechamento_id: string; p_prazo: string | null; p_motivo?: string | null }
        Returns: Database["public"]["Tables"]["rh_fechamentos"]["Row"]
      }
      fn_rh_devolver_equipe: {
        Args: { p_fechamento_id: string; p_equipe_id: string; p_motivo: string }
        Returns: number
      }
      fn_rh_devolver_operador: {
        Args: { p_lancamento_id: string; p_motivo: string }
        Returns: Database["public"]["Tables"]["rh_lancamentos"]["Row"]
      }
      fn_rh_enviar_setor: {
        Args: { p_fechamento_id: string; p_setor_id: string }
        Returns: number
      }
      fn_rh_equipes_que_lidero: { Args: Record<string, never>; Returns: string[] }
      fn_rh_finalizar_competencia: {
        Args: { p_fechamento_id: string }
        Returns: Database["public"]["Tables"]["rh_fechamentos"]["Row"]
      }
      fn_rh_pode: { Args: { p_chave: string }; Returns: boolean }
      fn_rh_reabrir_competencia: {
        Args: { p_fechamento_id: string; p_motivo: string }
        Returns: Database["public"]["Tables"]["rh_fechamentos"]["Row"]
      }
      fn_rh_salvar_cracha: {
        Args: { p_empresa_id: string; p_operador_id: string; p_cracha: string | null }
        Returns: Database["public"]["Tables"]["rh_dados_operadores"]["Row"]
      }
      fn_rh_salvar_lancamento: {
        Args: { p_lancamento_id: string; p_valor: number; p_observacao?: string | null }
        Returns: Database["public"]["Tables"]["rh_lancamentos"]["Row"]
      }
      fn_user_empresa_id: { Args: never; Returns: string }
      fn_user_empresa_is_bookplay: { Args: never; Returns: boolean }
      fn_user_empresa_is_pagueplay: { Args: never; Returns: boolean }
      fn_user_has_any_role: { Args: { roles: string[] }; Returns: boolean }
      fn_user_is_super_admin: { Args: never; Returns: boolean }
      fn_user_perfil: { Args: never; Returns: string }
      fn_user_setor_id: { Args: never; Returns: string }
      fn_uso_adocao_tela: {
        Args: {
          p_ate: string
          p_cargo?: string
          p_desde: string
          p_empresa_id: string
          p_tela: string
        }
        Returns: {
          aberturas: number
          cargo: string
          empresa_id: string
          empresa_nome: string
          nome: string
          segundos: number
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
      fn_uso_por_dia: {
        Args: {
          p_ate: string
          p_cargo?: string
          p_desde: string
          p_empresa_id: string
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
        }
        Returns: {
          aberturas: number
          cargo: string
          dias_ativos: number
          empresa_id: string
          empresa_nome: string
          nome: string
          segundos: number
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
