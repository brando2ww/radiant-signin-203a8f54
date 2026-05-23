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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      account_movements: {
        Row: {
          amount: number
          balance_after: number
          bank_account_id: string
          created_at: string | null
          description: string | null
          id: string
          reference_id: string | null
          reference_type: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          bank_account_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          bank_account_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_movements_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          account_type: string | null
          agency: string | null
          bank_name: string | null
          color: string | null
          created_at: string | null
          current_balance: number | null
          icon: string | null
          id: string
          initial_balance: number | null
          is_active: boolean | null
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_number?: string | null
          account_type?: string | null
          agency?: string | null
          bank_name?: string | null
          color?: string | null
          created_at?: string | null
          current_balance?: number | null
          icon?: string | null
          id?: string
          initial_balance?: number | null
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_number?: string | null
          account_type?: string | null
          agency?: string | null
          bank_name?: string | null
          color?: string | null
          created_at?: string | null
          current_balance?: number | null
          icon?: string | null
          id?: string
          initial_balance?: number | null
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      bills: {
        Row: {
          amount: number
          attachment_url: string | null
          bank_account_id: string | null
          category: string | null
          created_at: string | null
          current_installment: number | null
          due_date: string
          id: string
          installments: number | null
          is_recurring: boolean | null
          notes: string | null
          paid_at: string | null
          parent_bill_id: string | null
          payment_method: string | null
          status: string | null
          title: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          bank_account_id?: string | null
          category?: string | null
          created_at?: string | null
          current_installment?: number | null
          due_date: string
          id?: string
          installments?: number | null
          is_recurring?: boolean | null
          notes?: string | null
          paid_at?: string | null
          parent_bill_id?: string | null
          payment_method?: string | null
          status?: string | null
          title: string
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          bank_account_id?: string | null
          category?: string | null
          created_at?: string | null
          current_installment?: number | null
          due_date?: string
          id?: string
          installments?: number | null
          is_recurring?: boolean | null
          notes?: string | null
          paid_at?: string | null
          parent_bill_id?: string | null
          payment_method?: string | null
          status?: string | null
          title?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_parent_bill_id_fkey"
            columns: ["parent_bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          background_color: string | null
          business_description: string | null
          business_name: string
          business_slogan: string | null
          cover_url: string | null
          created_at: string | null
          google_review_url: string | null
          id: string
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          slug: string | null
          thank_you_message: string | null
          updated_at: string | null
          user_id: string
          welcome_message: string | null
        }
        Insert: {
          background_color?: string | null
          business_description?: string | null
          business_name: string
          business_slogan?: string | null
          cover_url?: string | null
          created_at?: string | null
          google_review_url?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string | null
          thank_you_message?: string | null
          updated_at?: string | null
          user_id: string
          welcome_message?: string | null
        }
        Update: {
          background_color?: string | null
          business_description?: string | null
          business_name?: string
          business_slogan?: string | null
          cover_url?: string | null
          created_at?: string | null
          google_review_url?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string | null
          thank_you_message?: string | null
          updated_at?: string | null
          user_id?: string
          welcome_message?: string | null
        }
        Relationships: []
      }
      campaign_prize_wins: {
        Row: {
          campaign_id: string
          coupon_code: string
          coupon_expires_at: string
          created_at: string
          customer_name: string
          customer_whatsapp: string
          evaluation_id: string
          id: string
          is_redeemed: boolean
          prize_id: string
          redeemed_at: string | null
        }
        Insert: {
          campaign_id: string
          coupon_code: string
          coupon_expires_at: string
          created_at?: string
          customer_name: string
          customer_whatsapp: string
          evaluation_id: string
          id?: string
          is_redeemed?: boolean
          prize_id: string
          redeemed_at?: string | null
        }
        Update: {
          campaign_id?: string
          coupon_code?: string
          coupon_expires_at?: string
          created_at?: string
          customer_name?: string
          customer_whatsapp?: string
          evaluation_id?: string
          id?: string
          is_redeemed?: boolean
          prize_id?: string
          redeemed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_prize_wins_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "evaluation_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_prize_wins_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: true
            referencedRelation: "customer_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_prize_wins_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "campaign_prizes"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_prizes: {
        Row: {
          campaign_id: string
          color: string
          coupon_validity_days: number
          created_at: string
          id: string
          is_active: boolean
          max_quantity: number | null
          name: string
          probability: number
          redeemed_count: number
          reward_product_id: string | null
          reward_type: string
          reward_value: number | null
        }
        Insert: {
          campaign_id: string
          color?: string
          coupon_validity_days?: number
          created_at?: string
          id?: string
          is_active?: boolean
          max_quantity?: number | null
          name: string
          probability?: number
          redeemed_count?: number
          reward_product_id?: string | null
          reward_type?: string
          reward_value?: number | null
        }
        Update: {
          campaign_id?: string
          color?: string
          coupon_validity_days?: number
          created_at?: string
          id?: string
          is_active?: boolean
          max_quantity?: number | null
          name?: string
          probability?: number
          redeemed_count?: number
          reward_product_id?: string | null
          reward_type?: string
          reward_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_prizes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "evaluation_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_prizes_reward_product_id_fkey"
            columns: ["reward_product_id"]
            isOneToOne: false
            referencedRelation: "pdv_products"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_access_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          operator_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          operator_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          operator_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_access_logs_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "checklist_operators"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: Database["public"]["Enums"]["checklist_alert_type"]
          created_at: string
          execution_id: string | null
          id: string
          is_acknowledged: boolean
          item_id: string | null
          message: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: Database["public"]["Enums"]["checklist_alert_type"]
          created_at?: string
          execution_id?: string | null
          id?: string
          is_acknowledged?: boolean
          item_id?: string | null
          message: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: Database["public"]["Enums"]["checklist_alert_type"]
          created_at?: string
          execution_id?: string | null
          id?: string
          is_acknowledged?: boolean
          item_id?: string | null
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "checklist_operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_alerts_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "checklist_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_alerts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_evidence_reviews: {
        Row: {
          comment: string | null
          created_at: string
          execution_item_id: string
          id: string
          reviewer_id: string | null
          status: Database["public"]["Enums"]["evidence_review_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          execution_item_id: string
          id?: string
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["evidence_review_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          execution_item_id?: string
          id?: string
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["evidence_review_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_evidence_reviews_execution_item_id_fkey"
            columns: ["execution_item_id"]
            isOneToOne: true
            referencedRelation: "checklist_execution_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_evidence_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "checklist_operators"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_execution_items: {
        Row: {
          completed_at: string | null
          execution_id: string
          id: string
          is_compliant: boolean | null
          item_id: string
          photo_url: string | null
          value: Json | null
        }
        Insert: {
          completed_at?: string | null
          execution_id: string
          id?: string
          is_compliant?: boolean | null
          item_id: string
          photo_url?: string | null
          value?: Json | null
        }
        Update: {
          completed_at?: string | null
          execution_id?: string
          id?: string
          is_compliant?: boolean | null
          item_id?: string
          photo_url?: string | null
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_execution_items_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "checklist_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_execution_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_executions: {
        Row: {
          checklist_id: string
          completed_at: string | null
          created_at: string
          execution_date: string
          id: string
          operator_id: string | null
          schedule_id: string | null
          score: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["checklist_execution_status"]
          user_id: string
        }
        Insert: {
          checklist_id: string
          completed_at?: string | null
          created_at?: string
          execution_date?: string
          id?: string
          operator_id?: string | null
          schedule_id?: string | null
          score?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["checklist_execution_status"]
          user_id: string
        }
        Update: {
          checklist_id?: string
          completed_at?: string | null
          created_at?: string
          execution_date?: string
          id?: string
          operator_id?: string | null
          schedule_id?: string | null
          score?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["checklist_execution_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_executions_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_executions_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "checklist_operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_executions_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "checklist_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          checklist_id: string
          created_at: string
          id: string
          is_critical: boolean
          is_required: boolean
          item_type: Database["public"]["Enums"]["checklist_item_type"]
          max_value: number | null
          min_value: number | null
          options: Json | null
          requires_photo: boolean
          sort_order: number
          title: string
          training_instruction: string | null
          training_video_url: string | null
        }
        Insert: {
          checklist_id: string
          created_at?: string
          id?: string
          is_critical?: boolean
          is_required?: boolean
          item_type?: Database["public"]["Enums"]["checklist_item_type"]
          max_value?: number | null
          min_value?: number | null
          options?: Json | null
          requires_photo?: boolean
          sort_order?: number
          title: string
          training_instruction?: string | null
          training_video_url?: string | null
        }
        Update: {
          checklist_id?: string
          created_at?: string
          id?: string
          is_critical?: boolean
          is_required?: boolean
          item_type?: Database["public"]["Enums"]["checklist_item_type"]
          max_value?: number | null
          min_value?: number | null
          options?: Json | null
          requires_photo?: boolean
          sort_order?: number
          title?: string
          training_instruction?: string | null
          training_video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_operators: {
        Row: {
          access_level: Database["public"]["Enums"]["operator_access_level"]
          avatar_color: string | null
          created_at: string
          default_shift: string | null
          hired_at: string | null
          id: string
          is_active: boolean
          last_access_at: string | null
          name: string
          notes: string | null
          pin: string
          role: string
          sector: Database["public"]["Enums"]["checklist_sector"]
          updated_at: string
          user_id: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["operator_access_level"]
          avatar_color?: string | null
          created_at?: string
          default_shift?: string | null
          hired_at?: string | null
          id?: string
          is_active?: boolean
          last_access_at?: string | null
          name: string
          notes?: string | null
          pin: string
          role?: string
          sector?: Database["public"]["Enums"]["checklist_sector"]
          updated_at?: string
          user_id: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["operator_access_level"]
          avatar_color?: string | null
          created_at?: string
          default_shift?: string | null
          hired_at?: string | null
          id?: string
          is_active?: boolean
          last_access_at?: string | null
          name?: string
          notes?: string | null
          pin?: string
          role?: string
          sector?: Database["public"]["Enums"]["checklist_sector"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      checklist_schedules: {
        Row: {
          allow_late_completion: boolean | null
          assigned_operator_id: string | null
          assigned_sector:
            | Database["public"]["Enums"]["checklist_sector"]
            | null
          checklist_id: string
          created_at: string
          days_of_week: Json
          id: string
          is_active: boolean
          max_duration_minutes: number
          notes: string | null
          notify_on_overdue: boolean | null
          recurrence_date: string | null
          recurrence_day_of_month: number | null
          recurrence_type: string | null
          require_photo: boolean | null
          shift: string
          start_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_late_completion?: boolean | null
          assigned_operator_id?: string | null
          assigned_sector?:
            | Database["public"]["Enums"]["checklist_sector"]
            | null
          checklist_id: string
          created_at?: string
          days_of_week?: Json
          id?: string
          is_active?: boolean
          max_duration_minutes?: number
          notes?: string | null
          notify_on_overdue?: boolean | null
          recurrence_date?: string | null
          recurrence_day_of_month?: number | null
          recurrence_type?: string | null
          require_photo?: boolean | null
          shift?: string
          start_time?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_late_completion?: boolean | null
          assigned_operator_id?: string | null
          assigned_sector?:
            | Database["public"]["Enums"]["checklist_sector"]
            | null
          checklist_id?: string
          created_at?: string
          days_of_week?: Json
          id?: string
          is_active?: boolean
          max_duration_minutes?: number
          notes?: string | null
          notify_on_overdue?: boolean | null
          recurrence_date?: string | null
          recurrence_day_of_month?: number | null
          recurrence_type?: string | null
          require_photo?: boolean | null
          shift?: string
          start_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_schedules_assigned_operator_id_fkey"
            columns: ["assigned_operator_id"]
            isOneToOne: false
            referencedRelation: "checklist_operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_schedules_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists: {
        Row: {
          color: string | null
          created_at: string
          default_shift: string | null
          description: string | null
          id: string
          is_active: boolean
          is_template: boolean
          name: string
          qr_access_enabled: boolean
          sector: Database["public"]["Enums"]["checklist_sector"]
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          default_shift?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_template?: boolean
          name: string
          qr_access_enabled?: boolean
          sector?: Database["public"]["Enums"]["checklist_sector"]
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          default_shift?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_template?: boolean
          name?: string
          qr_access_enabled?: boolean
          sector?: Database["public"]["Enums"]["checklist_sector"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_cards: {
        Row: {
          brand: string | null
          closing_day: number | null
          color: string | null
          created_at: string | null
          credit_limit: number | null
          current_balance: number | null
          due_day: number | null
          id: string
          is_active: boolean | null
          last_four_digits: string | null
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          brand?: string | null
          closing_day?: number | null
          color?: string | null
          created_at?: string | null
          credit_limit?: number | null
          current_balance?: number | null
          due_day?: number | null
          id?: string
          is_active?: boolean | null
          last_four_digits?: string | null
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          brand?: string | null
          closing_day?: number | null
          color?: string | null
          created_at?: string | null
          credit_limit?: number | null
          current_balance?: number | null
          due_day?: number | null
          id?: string
          is_active?: boolean | null
          last_four_digits?: string | null
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      crm_activities: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          is_completed: boolean | null
          lead_id: string
          scheduled_at: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_completed?: boolean | null
          lead_id: string
          scheduled_at?: string | null
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_completed?: boolean | null
          lead_id?: string
          scheduled_at?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          avatar_url: string | null
          closed_date: string | null
          company: string | null
          converted_to_transaction_id: string | null
          created_at: string
          email: string | null
          estimated_value: number | null
          expected_close_date: string | null
          first_contact_date: string | null
          id: string
          last_contact_date: string | null
          name: string
          phone: string | null
          position: string | null
          priority: string | null
          project_description: string | null
          project_title: string
          source: string | null
          stage: string
          status: string | null
          tags: string[] | null
          updated_at: string
          user_id: string
          win_probability: number | null
        }
        Insert: {
          avatar_url?: string | null
          closed_date?: string | null
          company?: string | null
          converted_to_transaction_id?: string | null
          created_at?: string
          email?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          first_contact_date?: string | null
          id?: string
          last_contact_date?: string | null
          name: string
          phone?: string | null
          position?: string | null
          priority?: string | null
          project_description?: string | null
          project_title: string
          source?: string | null
          stage?: string
          status?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id: string
          win_probability?: number | null
        }
        Update: {
          avatar_url?: string | null
          closed_date?: string | null
          company?: string | null
          converted_to_transaction_id?: string | null
          created_at?: string
          email?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          first_contact_date?: string | null
          id?: string
          last_contact_date?: string | null
          name?: string
          phone?: string | null
          position?: string | null
          priority?: string | null
          project_description?: string | null
          project_title?: string
          source?: string | null
          stage?: string
          status?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string
          win_probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_converted_to_transaction_id_fkey"
            columns: ["converted_to_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_notes: {
        Row: {
          content: string
          created_at: string
          id: string
          is_pinned: boolean | null
          lead_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          lead_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          lead_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_evaluations: {
        Row: {
          campaign_id: string | null
          created_at: string
          customer_birth_date: string
          customer_name: string
          customer_whatsapp: string
          evaluation_date: string
          external_id: string | null
          id: string
          nps_comment: string | null
          nps_score: number | null
          source: string
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          customer_birth_date: string
          customer_name: string
          customer_whatsapp: string
          evaluation_date?: string
          external_id?: string | null
          id?: string
          nps_comment?: string | null
          nps_score?: number | null
          source?: string
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          customer_birth_date?: string
          customer_name?: string
          customer_whatsapp?: string
          evaluation_date?: string
          external_id?: string | null
          id?: string
          nps_comment?: string | null
          nps_score?: number | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_evaluations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "evaluation_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_addresses: {
        Row: {
          city: string
          complement: string | null
          created_at: string
          customer_id: string
          id: string
          is_default: boolean | null
          label: string | null
          neighborhood: string
          number: string
          reference: string | null
          state: string
          street: string
          zip_code: string | null
        }
        Insert: {
          city: string
          complement?: string | null
          created_at?: string
          customer_id: string
          id?: string
          is_default?: boolean | null
          label?: string | null
          neighborhood: string
          number: string
          reference?: string | null
          state: string
          street: string
          zip_code?: string | null
        }
        Update: {
          city?: string
          complement?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          is_default?: boolean | null
          label?: string | null
          neighborhood?: string
          number?: string
          reference?: string | null
          state?: string
          street?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "delivery_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          order_position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          order_position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          order_position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      delivery_coupons: {
        Row: {
          code: string
          created_at: string
          first_order_only: boolean
          id: string
          internal_notes: string | null
          is_active: boolean | null
          max_discount: number | null
          min_order_value: number | null
          per_customer_limit: number
          type: string
          usage_count: number | null
          usage_limit: number | null
          user_id: string
          valid_from: string
          valid_until: string
          value: number
        }
        Insert: {
          code: string
          created_at?: string
          first_order_only?: boolean
          id?: string
          internal_notes?: string | null
          is_active?: boolean | null
          max_discount?: number | null
          min_order_value?: number | null
          per_customer_limit?: number
          type?: string
          usage_count?: number | null
          usage_limit?: number | null
          user_id: string
          valid_from?: string
          valid_until: string
          value: number
        }
        Update: {
          code?: string
          created_at?: string
          first_order_only?: boolean
          id?: string
          internal_notes?: string | null
          is_active?: boolean | null
          max_discount?: number | null
          min_order_value?: number | null
          per_customer_limit?: number
          type?: string
          usage_count?: number | null
          usage_limit?: number | null
          user_id?: string
          valid_from?: string
          valid_until?: string
          value?: number
        }
        Relationships: []
      }
      delivery_customers: {
        Row: {
          birth_date: string | null
          cpf: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone: string
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_drivers: {
        Row: {
          avatar_color: string | null
          avatar_url: string | null
          created_at: string
          current_order_id: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          plate: string | null
          status: Database["public"]["Enums"]["delivery_driver_status"]
          updated_at: string
          user_id: string
          vehicle_type: Database["public"]["Enums"]["delivery_vehicle_type"]
        }
        Insert: {
          avatar_color?: string | null
          avatar_url?: string | null
          created_at?: string
          current_order_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          plate?: string | null
          status?: Database["public"]["Enums"]["delivery_driver_status"]
          updated_at?: string
          user_id: string
          vehicle_type?: Database["public"]["Enums"]["delivery_vehicle_type"]
        }
        Update: {
          avatar_color?: string | null
          avatar_url?: string | null
          created_at?: string
          current_order_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          plate?: string | null
          status?: Database["public"]["Enums"]["delivery_driver_status"]
          updated_at?: string
          user_id?: string
          vehicle_type?: Database["public"]["Enums"]["delivery_vehicle_type"]
        }
        Relationships: [
          {
            foreignKeyName: "delivery_drivers_current_order_fk"
            columns: ["current_order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_funnel_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      delivery_loyalty_points: {
        Row: {
          created_at: string
          customer_id: string
          description: string | null
          id: string
          points: number
          reference_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          description?: string | null
          id?: string
          points: number
          reference_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          description?: string | null
          id?: string
          points?: number
          reference_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_loyalty_points_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "delivery_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_loyalty_prizes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          max_quantity: number | null
          name: string
          points_cost: number
          redeemed_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          max_quantity?: number | null
          name: string
          points_cost: number
          redeemed_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          max_quantity?: number | null
          name?: string
          points_cost?: number
          redeemed_count?: number
          user_id?: string
        }
        Relationships: []
      }
      delivery_loyalty_settings: {
        Row: {
          cashback_value_per_point: number
          created_at: string
          id: string
          is_active: boolean
          min_points_redeem: number
          points_per_real: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cashback_value_per_point?: number
          created_at?: string
          id?: string
          is_active?: boolean
          min_points_redeem?: number
          points_per_real?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cashback_value_per_point?: number
          created_at?: string
          id?: string
          is_active?: boolean
          min_points_redeem?: number
          points_per_real?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      delivery_option_item_recipes: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          option_item_id: string
          quantity: number
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          option_item_id: string
          quantity?: number
          unit?: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          option_item_id?: string
          quantity?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_option_item_recipes_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "pdv_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_option_item_recipes_option_item_id_fkey"
            columns: ["option_item_id"]
            isOneToOne: false
            referencedRelation: "delivery_product_option_items"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_order_item_options: {
        Row: {
          id: string
          item_name: string
          option_item_id: string | null
          option_name: string
          order_item_id: string
          price_adjustment: number | null
          quantity: number
        }
        Insert: {
          id?: string
          item_name: string
          option_item_id?: string | null
          option_name: string
          order_item_id: string
          price_adjustment?: number | null
          quantity?: number
        }
        Update: {
          id?: string
          item_name?: string
          option_item_id?: string | null
          option_name?: string
          order_item_id?: string
          price_adjustment?: number | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_order_item_options_option_item_id_fkey"
            columns: ["option_item_id"]
            isOneToOne: false
            referencedRelation: "delivery_product_option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_order_item_options_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "delivery_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_order_item_options_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "vw_print_bridge_delivery_items"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_order_items: {
        Row: {
          id: string
          notes: string | null
          order_id: string
          product_id: string
          product_name: string
          production_center_id: string | null
          quantity: number
          subtotal: number
          unit_price: number
        }
        Insert: {
          id?: string
          notes?: string | null
          order_id: string
          product_id: string
          product_name: string
          production_center_id?: string | null
          quantity?: number
          subtotal: number
          unit_price: number
        }
        Update: {
          id?: string
          notes?: string | null
          order_id?: string
          product_id?: string
          product_name?: string
          production_center_id?: string | null
          quantity?: number
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "delivery_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_order_items_production_center_id_fkey"
            columns: ["production_center_id"]
            isOneToOne: false
            referencedRelation: "pdv_production_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_orders: {
        Row: {
          cancellation_category: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by_user_id: string | null
          cashier_confirmed_at: string | null
          cashier_session_id: string | null
          change_for: number | null
          confirmed_at: string | null
          coupon_code: string | null
          created_at: string
          customer_delivery_confirmed_at: string | null
          customer_id: string
          customer_name: string
          customer_notified: boolean
          customer_phone: string
          delivered_at: string | null
          delivery_address_id: string | null
          delivery_address_text: string | null
          delivery_fee: number | null
          discount: number | null
          driver_assigned_at: string | null
          driver_id: string | null
          estimated_time: number | null
          id: string
          idempotency_key: string | null
          notes: string | null
          order_number: string
          order_type: string
          payment_method: string
          payment_status: string | null
          ready_at: string | null
          status: string
          subtotal: number
          ticket_number: number | null
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cancellation_category?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          cashier_confirmed_at?: string | null
          cashier_session_id?: string | null
          change_for?: number | null
          confirmed_at?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_delivery_confirmed_at?: string | null
          customer_id: string
          customer_name: string
          customer_notified?: boolean
          customer_phone: string
          delivered_at?: string | null
          delivery_address_id?: string | null
          delivery_address_text?: string | null
          delivery_fee?: number | null
          discount?: number | null
          driver_assigned_at?: string | null
          driver_id?: string | null
          estimated_time?: number | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          order_number: string
          order_type?: string
          payment_method: string
          payment_status?: string | null
          ready_at?: string | null
          status?: string
          subtotal: number
          ticket_number?: number | null
          total: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cancellation_category?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          cashier_confirmed_at?: string | null
          cashier_session_id?: string | null
          change_for?: number | null
          confirmed_at?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_delivery_confirmed_at?: string | null
          customer_id?: string
          customer_name?: string
          customer_notified?: boolean
          customer_phone?: string
          delivered_at?: string | null
          delivery_address_id?: string | null
          delivery_address_text?: string | null
          delivery_fee?: number | null
          discount?: number | null
          driver_assigned_at?: string | null
          driver_id?: string | null
          estimated_time?: number | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          order_number?: string
          order_type?: string
          payment_method?: string
          payment_status?: string | null
          ready_at?: string | null
          status?: string
          subtotal?: number
          ticket_number?: number | null
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_orders_cashier_session_id_fkey"
            columns: ["cashier_session_id"]
            isOneToOne: false
            referencedRelation: "pdv_cashier_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "delivery_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_delivery_address_id_fkey"
            columns: ["delivery_address_id"]
            isOneToOne: false
            referencedRelation: "delivery_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "delivery_drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_product_option_items: {
        Row: {
          created_at: string
          id: string
          is_available: boolean | null
          item_kind: string
          linked_product_id: string | null
          name: string
          option_id: string
          order_position: number
          price_adjustment: number | null
          source_pdv_option_item_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_available?: boolean | null
          item_kind?: string
          linked_product_id?: string | null
          name: string
          option_id: string
          order_position?: number
          price_adjustment?: number | null
          source_pdv_option_item_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_available?: boolean | null
          item_kind?: string
          linked_product_id?: string | null
          name?: string
          option_id?: string
          order_position?: number
          price_adjustment?: number | null
          source_pdv_option_item_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_product_option_items_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "delivery_product_options"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_product_options: {
        Row: {
          allow_quantity: boolean
          created_at: string
          id: string
          is_required: boolean | null
          max_selections: number | null
          min_selections: number | null
          name: string
          order_position: number
          product_id: string
          source_pdv_option_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          allow_quantity?: boolean
          created_at?: string
          id?: string
          is_required?: boolean | null
          max_selections?: number | null
          min_selections?: number | null
          name: string
          order_position?: number
          product_id: string
          source_pdv_option_id?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          allow_quantity?: boolean
          created_at?: string
          id?: string
          is_required?: boolean | null
          max_selections?: number | null
          min_selections?: number | null
          name?: string
          order_position?: number
          product_id?: string
          source_pdv_option_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "delivery_products"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_product_recipes: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          product_id: string
          quantity: number
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          product_id: string
          quantity?: number
          unit?: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          product_id?: string
          quantity?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_product_recipes_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "pdv_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_product_recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "delivery_products"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_products: {
        Row: {
          available_days: Json | null
          base_price: number
          category_id: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean | null
          is_featured: boolean | null
          name: string
          order_position: number
          preparation_time: number | null
          promotional_price: number | null
          serves: number | null
          source_pdv_product_id: string | null
          sync_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          available_days?: Json | null
          base_price: number
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          is_featured?: boolean | null
          name: string
          order_position?: number
          preparation_time?: number | null
          promotional_price?: number | null
          serves?: number | null
          source_pdv_product_id?: string | null
          sync_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          available_days?: Json | null
          base_price?: number
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          is_featured?: boolean | null
          name?: string
          order_position?: number
          preparation_time?: number | null
          promotional_price?: number | null
          serves?: number | null
          source_pdv_product_id?: string | null
          sync_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "delivery_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_products_source_pdv_product_id_fkey"
            columns: ["source_pdv_product_id"]
            isOneToOne: false
            referencedRelation: "pdv_products"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_reviews: {
        Row: {
          comment: string | null
          created_at: string
          customer_id: string
          id: string
          order_id: string
          rating: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_id: string
          id?: string
          order_id: string
          rating: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          order_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "delivery_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_settings: {
        Row: {
          accepts_cash: boolean | null
          accepts_credit: boolean | null
          accepts_debit: boolean | null
          accepts_pix: boolean | null
          auto_accept_orders: boolean | null
          blocked_dates: Json | null
          business_hours: Json | null
          cep_ranges: Json
          covered_city: Json | null
          created_at: string
          default_delivery_fee: number | null
          delivery_zones: Json | null
          estimated_preparation_time: number | null
          excluded_ceps: Json | null
          google_tag_id: string | null
          id: string
          is_open: boolean | null
          max_delivery_distance: number | null
          meta_pixel_id: string | null
          min_order_value: number | null
          payment_overdue_minutes: number
          pix_key: string | null
          updated_at: string
          user_id: string
          whatsapp_notifications: boolean | null
        }
        Insert: {
          accepts_cash?: boolean | null
          accepts_credit?: boolean | null
          accepts_debit?: boolean | null
          accepts_pix?: boolean | null
          auto_accept_orders?: boolean | null
          blocked_dates?: Json | null
          business_hours?: Json | null
          cep_ranges?: Json
          covered_city?: Json | null
          created_at?: string
          default_delivery_fee?: number | null
          delivery_zones?: Json | null
          estimated_preparation_time?: number | null
          excluded_ceps?: Json | null
          google_tag_id?: string | null
          id?: string
          is_open?: boolean | null
          max_delivery_distance?: number | null
          meta_pixel_id?: string | null
          min_order_value?: number | null
          payment_overdue_minutes?: number
          pix_key?: string | null
          updated_at?: string
          user_id: string
          whatsapp_notifications?: boolean | null
        }
        Update: {
          accepts_cash?: boolean | null
          accepts_credit?: boolean | null
          accepts_debit?: boolean | null
          accepts_pix?: boolean | null
          auto_accept_orders?: boolean | null
          blocked_dates?: Json | null
          business_hours?: Json | null
          cep_ranges?: Json
          covered_city?: Json | null
          created_at?: string
          default_delivery_fee?: number | null
          delivery_zones?: Json | null
          estimated_preparation_time?: number | null
          excluded_ceps?: Json | null
          google_tag_id?: string | null
          id?: string
          is_open?: boolean | null
          max_delivery_distance?: number | null
          meta_pixel_id?: string | null
          min_order_value?: number | null
          payment_overdue_minutes?: number
          pix_key?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_notifications?: boolean | null
        }
        Relationships: []
      }
      establishment_users: {
        Row: {
          created_at: string | null
          discount_password: string | null
          display_name: string | null
          email: string | null
          establishment_owner_id: string
          id: string
          invited_at: string | null
          is_active: boolean | null
          max_discount_percent: number | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          discount_password?: string | null
          display_name?: string | null
          email?: string | null
          establishment_owner_id: string
          id?: string
          invited_at?: string | null
          is_active?: boolean | null
          max_discount_percent?: number | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          discount_password?: string | null
          display_name?: string | null
          email?: string | null
          establishment_owner_id?: string
          id?: string
          invited_at?: string | null
          is_active?: boolean | null
          max_discount_percent?: number | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "establishment_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_answers: {
        Row: {
          comment: string | null
          created_at: string
          evaluation_id: string
          id: string
          question_id: string
          score: number
          selected_options: Json | null
          text_answer: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          evaluation_id: string
          id?: string
          question_id: string
          score: number
          selected_options?: Json | null
          text_answer?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          evaluation_id?: string
          id?: string
          question_id?: string
          score?: number
          selected_options?: Json | null
          text_answer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_answers_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "customer_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_campaign_questions: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          is_active: boolean
          is_required: boolean
          max_length: number
          options: Json | null
          order_position: number
          placeholder: string | null
          question_text: string
          question_type: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          max_length?: number
          options?: Json | null
          order_position?: number
          placeholder?: string | null
          question_text: string
          question_type?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          max_length?: number
          options?: Json | null
          order_position?: number
          placeholder?: string | null
          question_text?: string
          question_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_campaign_questions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "evaluation_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_campaigns: {
        Row: {
          background_color: string | null
          created_at: string
          description: string | null
          google_redirect_mode: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          roulette_cooldown_hours: number | null
          roulette_enabled: boolean
          thank_you_message: string | null
          updated_at: string
          user_id: string
          welcome_message: string | null
          wheel_primary_color: string | null
          wheel_secondary_color: string | null
        }
        Insert: {
          background_color?: string | null
          created_at?: string
          description?: string | null
          google_redirect_mode?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          roulette_cooldown_hours?: number | null
          roulette_enabled?: boolean
          thank_you_message?: string | null
          updated_at?: string
          user_id: string
          welcome_message?: string | null
          wheel_primary_color?: string | null
          wheel_secondary_color?: string | null
        }
        Update: {
          background_color?: string | null
          created_at?: string
          description?: string | null
          google_redirect_mode?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          roulette_cooldown_hours?: number | null
          roulette_enabled?: boolean
          thank_you_message?: string | null
          updated_at?: string
          user_id?: string
          welcome_message?: string | null
          wheel_primary_color?: string | null
          wheel_secondary_color?: string | null
        }
        Relationships: []
      }
      evaluation_questions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          order_position: number
          question_text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          order_position?: number
          question_text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          order_position?: number
          question_text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          bank_account_id: string | null
          created_at: string
          current_amount: number
          description: string | null
          id: string
          is_completed: boolean
          name: string
          target_amount: number
          target_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bank_account_id?: string | null
          created_at?: string
          current_amount?: number
          description?: string | null
          id?: string
          is_completed?: boolean
          name: string
          target_amount?: number
          target_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bank_account_id?: string | null
          created_at?: string
          current_amount?: number
          description?: string | null
          id?: string
          is_completed?: boolean
          name?: string
          target_amount?: number
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_goals: {
        Row: {
          created_at: string | null
          id: string
          investment_goal: number | null
          month_year: string
          revenue_goal: number | null
          savings_goal: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          investment_goal?: number | null
          month_year: string
          revenue_goal?: number | null
          savings_goal?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          investment_goal?: number | null
          month_year?: string
          revenue_goal?: number | null
          savings_goal?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      operational_task_instances: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          id: string
          notes: string | null
          photo_url: string | null
          requires_photo: boolean
          shift: string
          status: string
          task_date: string
          template_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          notes?: string | null
          photo_url?: string | null
          requires_photo?: boolean
          shift?: string
          status?: string
          task_date?: string
          template_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          notes?: string | null
          photo_url?: string | null
          requires_photo?: boolean
          shift?: string
          status?: string
          task_date?: string
          template_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_task_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "operational_task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_task_settings: {
        Row: {
          alert_browser_notifications: boolean | null
          alert_critical_delay_minutes: number | null
          alert_critical_enabled: boolean | null
          alert_daily_summary_enabled: boolean | null
          alert_daily_summary_target: string | null
          alert_daily_summary_time: string | null
          alert_overdue_delay_minutes: number | null
          alert_overdue_enabled: boolean | null
          alert_temperature_enabled: boolean | null
          alert_whatsapp_number: string | null
          allow_free_notes: boolean | null
          allow_late_completion: boolean | null
          auto_generate: boolean
          block_early_execution: boolean | null
          created_at: string
          default_max_duration_minutes: number | null
          id: string
          min_pin_digits: number | null
          qr_code_enabled: boolean
          report_daily_content: Json | null
          report_weekly_day: number | null
          report_weekly_enabled: boolean | null
          require_photo_default: boolean | null
          sectors_config: Json | null
          session_timeout_minutes: number | null
          shifts: Json
          show_countdown_timer: boolean | null
          updated_at: string
          user_id: string
          whatsapp_report_enabled: boolean | null
          whatsapp_report_phone: string | null
          whatsapp_report_time: string | null
        }
        Insert: {
          alert_browser_notifications?: boolean | null
          alert_critical_delay_minutes?: number | null
          alert_critical_enabled?: boolean | null
          alert_daily_summary_enabled?: boolean | null
          alert_daily_summary_target?: string | null
          alert_daily_summary_time?: string | null
          alert_overdue_delay_minutes?: number | null
          alert_overdue_enabled?: boolean | null
          alert_temperature_enabled?: boolean | null
          alert_whatsapp_number?: string | null
          allow_free_notes?: boolean | null
          allow_late_completion?: boolean | null
          auto_generate?: boolean
          block_early_execution?: boolean | null
          created_at?: string
          default_max_duration_minutes?: number | null
          id?: string
          min_pin_digits?: number | null
          qr_code_enabled?: boolean
          report_daily_content?: Json | null
          report_weekly_day?: number | null
          report_weekly_enabled?: boolean | null
          require_photo_default?: boolean | null
          sectors_config?: Json | null
          session_timeout_minutes?: number | null
          shifts?: Json
          show_countdown_timer?: boolean | null
          updated_at?: string
          user_id: string
          whatsapp_report_enabled?: boolean | null
          whatsapp_report_phone?: string | null
          whatsapp_report_time?: string | null
        }
        Update: {
          alert_browser_notifications?: boolean | null
          alert_critical_delay_minutes?: number | null
          alert_critical_enabled?: boolean | null
          alert_daily_summary_enabled?: boolean | null
          alert_daily_summary_target?: string | null
          alert_daily_summary_time?: string | null
          alert_overdue_delay_minutes?: number | null
          alert_overdue_enabled?: boolean | null
          alert_temperature_enabled?: boolean | null
          alert_whatsapp_number?: string | null
          allow_free_notes?: boolean | null
          allow_late_completion?: boolean | null
          auto_generate?: boolean
          block_early_execution?: boolean | null
          created_at?: string
          default_max_duration_minutes?: number | null
          id?: string
          min_pin_digits?: number | null
          qr_code_enabled?: boolean
          report_daily_content?: Json | null
          report_weekly_day?: number | null
          report_weekly_enabled?: boolean | null
          require_photo_default?: boolean | null
          sectors_config?: Json | null
          session_timeout_minutes?: number | null
          shifts?: Json
          show_countdown_timer?: boolean | null
          updated_at?: string
          user_id?: string
          whatsapp_report_enabled?: boolean | null
          whatsapp_report_phone?: string | null
          whatsapp_report_time?: string | null
        }
        Relationships: []
      }
      operational_task_templates: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          requires_photo: boolean
          shift: string
          sort_order: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          requires_photo?: boolean
          shift?: string
          sort_order?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          requires_photo?: boolean
          shift?: string
          sort_order?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      operator_scores: {
        Row: {
          badges: Json | null
          created_at: string
          id: string
          on_time_count: number
          operator_id: string
          period_end: string
          period_start: string
          score: number
          total_executions: number
          user_id: string
        }
        Insert: {
          badges?: Json | null
          created_at?: string
          id?: string
          on_time_count?: number
          operator_id: string
          period_end: string
          period_start: string
          score?: number
          total_executions?: number
          user_id: string
        }
        Update: {
          badges?: Json | null
          created_at?: string
          id?: string
          on_time_count?: number
          operator_id?: string
          period_end?: string
          period_start?: string
          score?: number
          total_executions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_scores_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "checklist_operators"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_action_audit_log: {
        Row: {
          action: Database["public"]["Enums"]["pdv_permission_action"]
          actor_role: Database["public"]["Enums"]["app_role"] | null
          actor_user_id: string
          created_at: string
          id: string
          owner_user_id: string
          payload: Json | null
          reason: string | null
          source_id: string | null
          source_type: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["pdv_permission_action"]
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          actor_user_id: string
          created_at?: string
          id?: string
          owner_user_id: string
          payload?: Json | null
          reason?: string | null
          source_id?: string | null
          source_type?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["pdv_permission_action"]
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          actor_user_id?: string
          created_at?: string
          id?: string
          owner_user_id?: string
          payload?: Json | null
          reason?: string | null
          source_id?: string | null
          source_type?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      pdv_action_permissions: {
        Row: {
          action: Database["public"]["Enums"]["pdv_permission_action"]
          allowed: boolean
          created_at: string
          id: string
          owner_user_id: string
          requires_reason: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          action: Database["public"]["Enums"]["pdv_permission_action"]
          allowed?: boolean
          created_at?: string
          id?: string
          owner_user_id: string
          requires_reason?: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          action?: Database["public"]["Enums"]["pdv_permission_action"]
          allowed?: boolean
          created_at?: string
          id?: string
          owner_user_id?: string
          requires_reason?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      pdv_authorized_employees: {
        Row: {
          avatar_url: string | null
          created_at: string
          credit_limit: number
          full_name: string
          id: string
          internal_notes: string | null
          is_active: boolean
          role_title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          credit_limit?: number
          full_name: string
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          role_title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          credit_limit?: number
          full_name?: string
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          role_title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pdv_bank_accounts: {
        Row: {
          account_number: string | null
          bank_name: string | null
          created_at: string | null
          current_balance: number | null
          id: string
          initial_balance: number | null
          is_active: boolean | null
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_number?: string | null
          bank_name?: string | null
          created_at?: string | null
          current_balance?: number | null
          id?: string
          initial_balance?: number | null
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_number?: string | null
          bank_name?: string | null
          created_at?: string | null
          current_balance?: number | null
          id?: string
          initial_balance?: number | null
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pdv_cash_closures: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          counted_cash: number | null
          counted_credit: number | null
          counted_debit: number | null
          counted_meal_voucher: number | null
          counted_pix: number | null
          created_at: string | null
          difference_cash: number | null
          difference_credit: number | null
          difference_debit: number | null
          difference_meal_voucher: number | null
          difference_pix: number | null
          expected_cash: number | null
          expected_credit: number | null
          expected_debit: number | null
          expected_meal_voucher: number | null
          expected_pix: number | null
          id: string
          notes: string | null
          shift: string
          shift_date: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          counted_cash?: number | null
          counted_credit?: number | null
          counted_debit?: number | null
          counted_meal_voucher?: number | null
          counted_pix?: number | null
          created_at?: string | null
          difference_cash?: number | null
          difference_credit?: number | null
          difference_debit?: number | null
          difference_meal_voucher?: number | null
          difference_pix?: number | null
          expected_cash?: number | null
          expected_credit?: number | null
          expected_debit?: number | null
          expected_meal_voucher?: number | null
          expected_pix?: number | null
          id?: string
          notes?: string | null
          shift: string
          shift_date: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          counted_cash?: number | null
          counted_credit?: number | null
          counted_debit?: number | null
          counted_meal_voucher?: number | null
          counted_pix?: number | null
          created_at?: string | null
          difference_cash?: number | null
          difference_credit?: number | null
          difference_debit?: number | null
          difference_meal_voucher?: number | null
          difference_pix?: number | null
          expected_cash?: number | null
          expected_credit?: number | null
          expected_debit?: number | null
          expected_meal_voucher?: number | null
          expected_pix?: number | null
          id?: string
          notes?: string | null
          shift?: string
          shift_date?: string
          user_id?: string
        }
        Relationships: []
      }
      pdv_cash_movements: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          handled_at: string | null
          handled_by: string | null
          id: string
          order_id: string | null
          payment_id: string | null
          payment_method: string | null
          shift: string | null
          shift_date: string
          type: Database["public"]["Enums"]["pdv_cash_movement_type"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          order_id?: string | null
          payment_id?: string | null
          payment_method?: string | null
          shift?: string | null
          shift_date: string
          type: Database["public"]["Enums"]["pdv_cash_movement_type"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          order_id?: string | null
          payment_id?: string | null
          payment_method?: string | null
          shift?: string | null
          shift_date?: string
          type?: Database["public"]["Enums"]["pdv_cash_movement_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_cash_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pdv_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_cash_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "vw_print_bridge_comanda_items"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "pdv_cash_movements_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "pdv_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_cashier_close_blind_snapshots: {
        Row: {
          cashier_session_id: string
          declared_cash: number
          declared_credit: number | null
          declared_debit: number | null
          declared_fiado: number | null
          declared_online_delivery: number | null
          declared_other: number | null
          declared_pix: number | null
          declared_total: number
          declared_voucher: number | null
          id: string
          operator_id: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          cashier_session_id: string
          declared_cash?: number
          declared_credit?: number | null
          declared_debit?: number | null
          declared_fiado?: number | null
          declared_online_delivery?: number | null
          declared_other?: number | null
          declared_pix?: number | null
          declared_total?: number
          declared_voucher?: number | null
          id?: string
          operator_id: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          cashier_session_id?: string
          declared_cash?: number
          declared_credit?: number | null
          declared_debit?: number | null
          declared_fiado?: number | null
          declared_online_delivery?: number | null
          declared_other?: number | null
          declared_pix?: number | null
          declared_total?: number
          declared_voucher?: number | null
          id?: string
          operator_id?: string
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_cashier_close_blind_snapshots_cashier_session_id_fkey"
            columns: ["cashier_session_id"]
            isOneToOne: true
            referencedRelation: "pdv_cashier_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_cashier_movements: {
        Row: {
          amount: number
          cashier_session_id: string
          created_at: string
          delivery_order_id: string | null
          description: string | null
          discount_authorized_by: string | null
          discount_reason: string | null
          id: string
          payment_method: string | null
          source: string
          type: string
        }
        Insert: {
          amount: number
          cashier_session_id: string
          created_at?: string
          delivery_order_id?: string | null
          description?: string | null
          discount_authorized_by?: string | null
          discount_reason?: string | null
          id?: string
          payment_method?: string | null
          source?: string
          type: string
        }
        Update: {
          amount?: number
          cashier_session_id?: string
          created_at?: string
          delivery_order_id?: string | null
          description?: string | null
          discount_authorized_by?: string | null
          discount_reason?: string | null
          id?: string
          payment_method?: string | null
          source?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_cashier_movements_cashier_session_id_fkey"
            columns: ["cashier_session_id"]
            isOneToOne: false
            referencedRelation: "pdv_cashier_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_cashier_movements_delivery_order_id_fkey"
            columns: ["delivery_order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_cashier_sessions: {
        Row: {
          balance_difference: number | null
          cash_difference: number | null
          closed_at: string | null
          closed_by_user_id: string | null
          closing_balance: number | null
          closing_justification: string | null
          closing_status: string | null
          created_at: string
          credit_difference: number | null
          debit_difference: number | null
          declared_cash: number | null
          declared_credit: number | null
          declared_debit: number | null
          declared_fiado: number | null
          declared_online_delivery: number | null
          declared_other: number | null
          declared_pix: number | null
          declared_total_sales: number | null
          declared_voucher: number | null
          difference_justified: boolean | null
          expected_balance: number | null
          fiado_difference: number | null
          fraud_risk_level: string | null
          id: string
          justification_cash: string | null
          justification_credit: string | null
          justification_debit: string | null
          justification_fiado: string | null
          justification_online_delivery: string | null
          justification_other: string | null
          justification_pix: string | null
          justification_voucher: string | null
          notes: string | null
          online_delivery_difference: number | null
          opened_at: string
          opened_by_user_id: string | null
          opening_balance: number
          other_difference: number | null
          pix_difference: number | null
          total_card: number
          total_cash: number
          total_change: number
          total_credit: number
          total_debit: number
          total_difference: number | null
          total_fiado: number
          total_online_delivery: number
          total_other: number
          total_pix: number
          total_sales: number
          total_voucher: number
          total_withdrawals: number
          updated_at: string
          user_id: string
          voucher_difference: number | null
        }
        Insert: {
          balance_difference?: number | null
          cash_difference?: number | null
          closed_at?: string | null
          closed_by_user_id?: string | null
          closing_balance?: number | null
          closing_justification?: string | null
          closing_status?: string | null
          created_at?: string
          credit_difference?: number | null
          debit_difference?: number | null
          declared_cash?: number | null
          declared_credit?: number | null
          declared_debit?: number | null
          declared_fiado?: number | null
          declared_online_delivery?: number | null
          declared_other?: number | null
          declared_pix?: number | null
          declared_total_sales?: number | null
          declared_voucher?: number | null
          difference_justified?: boolean | null
          expected_balance?: number | null
          fiado_difference?: number | null
          fraud_risk_level?: string | null
          id?: string
          justification_cash?: string | null
          justification_credit?: string | null
          justification_debit?: string | null
          justification_fiado?: string | null
          justification_online_delivery?: string | null
          justification_other?: string | null
          justification_pix?: string | null
          justification_voucher?: string | null
          notes?: string | null
          online_delivery_difference?: number | null
          opened_at?: string
          opened_by_user_id?: string | null
          opening_balance?: number
          other_difference?: number | null
          pix_difference?: number | null
          total_card?: number
          total_cash?: number
          total_change?: number
          total_credit?: number
          total_debit?: number
          total_difference?: number | null
          total_fiado?: number
          total_online_delivery?: number
          total_other?: number
          total_pix?: number
          total_sales?: number
          total_voucher?: number
          total_withdrawals?: number
          updated_at?: string
          user_id: string
          voucher_difference?: number | null
        }
        Update: {
          balance_difference?: number | null
          cash_difference?: number | null
          closed_at?: string | null
          closed_by_user_id?: string | null
          closing_balance?: number | null
          closing_justification?: string | null
          closing_status?: string | null
          created_at?: string
          credit_difference?: number | null
          debit_difference?: number | null
          declared_cash?: number | null
          declared_credit?: number | null
          declared_debit?: number | null
          declared_fiado?: number | null
          declared_online_delivery?: number | null
          declared_other?: number | null
          declared_pix?: number | null
          declared_total_sales?: number | null
          declared_voucher?: number | null
          difference_justified?: boolean | null
          expected_balance?: number | null
          fiado_difference?: number | null
          fraud_risk_level?: string | null
          id?: string
          justification_cash?: string | null
          justification_credit?: string | null
          justification_debit?: string | null
          justification_fiado?: string | null
          justification_online_delivery?: string | null
          justification_other?: string | null
          justification_pix?: string | null
          justification_voucher?: string | null
          notes?: string | null
          online_delivery_difference?: number | null
          opened_at?: string
          opened_by_user_id?: string | null
          opening_balance?: number
          other_difference?: number | null
          pix_difference?: number | null
          total_card?: number
          total_cash?: number
          total_change?: number
          total_credit?: number
          total_debit?: number
          total_difference?: number | null
          total_fiado?: number
          total_online_delivery?: number
          total_other?: number
          total_pix?: number
          total_sales?: number
          total_voucher?: number
          total_withdrawals?: number
          updated_at?: string
          user_id?: string
          voucher_difference?: number | null
        }
        Relationships: []
      }
      pdv_chart_of_accounts: {
        Row: {
          account_type: string
          code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          parent_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_type: string
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          parent_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_type?: string
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          parent_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "pdv_chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_cmv_reports: {
        Row: {
          cmv_percentage: number | null
          created_at: string | null
          generated_at: string | null
          id: string
          period_end: string
          period_start: string
          product_margins: Json | null
          total_cmv: number | null
          total_revenue: number | null
          user_id: string
        }
        Insert: {
          cmv_percentage?: number | null
          created_at?: string | null
          generated_at?: string | null
          id?: string
          period_end: string
          period_start: string
          product_margins?: Json | null
          total_cmv?: number | null
          total_revenue?: number | null
          user_id: string
        }
        Update: {
          cmv_percentage?: number | null
          created_at?: string | null
          generated_at?: string | null
          id?: string
          period_end?: string
          period_start?: string
          product_margins?: Json | null
          total_cmv?: number | null
          total_revenue?: number | null
          user_id?: string
        }
        Relationships: []
      }
      pdv_comanda_items: {
        Row: {
          charging_session_id: string | null
          comanda_id: string
          composition_group_label: string | null
          composition_position: number | null
          created_at: string
          id: string
          is_composite_child: boolean
          kitchen_status: string
          modifiers: Json | null
          notes: string | null
          paid_quantity: number
          parent_item_id: string | null
          product_id: string | null
          product_name: string
          production_center_id: string | null
          quantity: number
          ready_at: string | null
          sent_to_kitchen_at: string | null
          subtotal: number
          unit_price: number
        }
        Insert: {
          charging_session_id?: string | null
          comanda_id: string
          composition_group_label?: string | null
          composition_position?: number | null
          created_at?: string
          id?: string
          is_composite_child?: boolean
          kitchen_status?: string
          modifiers?: Json | null
          notes?: string | null
          paid_quantity?: number
          parent_item_id?: string | null
          product_id?: string | null
          product_name: string
          production_center_id?: string | null
          quantity?: number
          ready_at?: string | null
          sent_to_kitchen_at?: string | null
          subtotal: number
          unit_price: number
        }
        Update: {
          charging_session_id?: string | null
          comanda_id?: string
          composition_group_label?: string | null
          composition_position?: number | null
          created_at?: string
          id?: string
          is_composite_child?: boolean
          kitchen_status?: string
          modifiers?: Json | null
          notes?: string | null
          paid_quantity?: number
          parent_item_id?: string | null
          product_id?: string | null
          product_name?: string
          production_center_id?: string | null
          quantity?: number
          ready_at?: string | null
          sent_to_kitchen_at?: string | null
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pdv_comanda_items_comanda_id_fkey"
            columns: ["comanda_id"]
            isOneToOne: false
            referencedRelation: "pdv_comandas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_comanda_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "pdv_comanda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_comanda_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "vw_print_bridge_comanda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_comanda_items_production_center_id_fkey"
            columns: ["production_center_id"]
            isOneToOne: false
            referencedRelation: "pdv_production_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_comandas: {
        Row: {
          cancellation_category: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by_user_id: string | null
          cashier_session_id: string | null
          close_reason: string | null
          closed_by_user_id: string | null
          closed_by_waiter_at: string | null
          comanda_number: string
          created_at: string
          customer_name: string | null
          customer_notified: boolean
          id: string
          notes: string | null
          order_id: string | null
          pending_subtotal: number
          person_number: number | null
          status: string
          subtotal: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cancellation_category?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          cashier_session_id?: string | null
          close_reason?: string | null
          closed_by_user_id?: string | null
          closed_by_waiter_at?: string | null
          comanda_number: string
          created_at?: string
          customer_name?: string | null
          customer_notified?: boolean
          id?: string
          notes?: string | null
          order_id?: string | null
          pending_subtotal?: number
          person_number?: number | null
          status?: string
          subtotal?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cancellation_category?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          cashier_session_id?: string | null
          close_reason?: string | null
          closed_by_user_id?: string | null
          closed_by_waiter_at?: string | null
          comanda_number?: string
          created_at?: string
          customer_name?: string | null
          customer_notified?: boolean
          id?: string
          notes?: string | null
          order_id?: string | null
          pending_subtotal?: number
          person_number?: number | null
          status?: string
          subtotal?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_comandas_cashier_session_id_fkey"
            columns: ["cashier_session_id"]
            isOneToOne: false
            referencedRelation: "pdv_cashier_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_comandas_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pdv_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_comandas_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "vw_print_bridge_comanda_items"
            referencedColumns: ["order_id"]
          },
        ]
      }
      pdv_cost_centers: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      pdv_customers: {
        Row: {
          birth_date: string | null
          cpf: string | null
          created_at: string | null
          email: string | null
          id: string
          last_visit: string | null
          name: string
          notes: string | null
          phone: string | null
          total_spent: number | null
          updated_at: string | null
          user_id: string
          visit_count: number | null
        }
        Insert: {
          birth_date?: string | null
          cpf?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          last_visit?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          total_spent?: number | null
          updated_at?: string | null
          user_id: string
          visit_count?: number | null
        }
        Update: {
          birth_date?: string | null
          cpf?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          last_visit?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          total_spent?: number | null
          updated_at?: string | null
          user_id?: string
          visit_count?: number | null
        }
        Relationships: []
      }
      pdv_device_config: {
        Row: {
          activated_at: string | null
          activation_token: string
          created_at: string
          id: string
          is_active: boolean
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          activation_token: string
          created_at?: string
          id?: string
          is_active?: boolean
          user_id: string
        }
        Update: {
          activated_at?: string | null
          activation_token?: string
          created_at?: string
          id?: string
          is_active?: boolean
          user_id?: string
        }
        Relationships: []
      }
      pdv_employee_consumption: {
        Row: {
          closed_at: string | null
          comanda_id: string | null
          created_at: string
          employee_name: string
          id: string
          notes: string | null
          status: string
          total: number
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          comanda_id?: string | null
          created_at?: string
          employee_name: string
          id?: string
          notes?: string | null
          status?: string
          total?: number
          user_id: string
        }
        Update: {
          closed_at?: string | null
          comanda_id?: string | null
          created_at?: string
          employee_name?: string
          id?: string
          notes?: string | null
          status?: string
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_employee_consumption_comanda_id_fkey"
            columns: ["comanda_id"]
            isOneToOne: false
            referencedRelation: "pdv_comandas"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_employee_consumption_entries: {
        Row: {
          comanda_id: string | null
          created_at: string
          employee_id: string
          id: string
          items: Json
          operator_id: string | null
          over_limit_justification: string | null
          paid_amount: number
          status: string
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          comanda_id?: string | null
          created_at?: string
          employee_id: string
          id?: string
          items?: Json
          operator_id?: string | null
          over_limit_justification?: string | null
          paid_amount?: number
          status?: string
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          comanda_id?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          items?: Json
          operator_id?: string | null
          over_limit_justification?: string | null
          paid_amount?: number
          status?: string
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_employee_consumption_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "pdv_authorized_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_employee_consumption_payments: {
        Row: {
          amount: number
          cashier_session_id: string | null
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          operator_id: string | null
          payment_method: string
          user_id: string
        }
        Insert: {
          amount: number
          cashier_session_id?: string | null
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          operator_id?: string | null
          payment_method?: string
          user_id: string
        }
        Update: {
          amount?: number
          cashier_session_id?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          operator_id?: string | null
          payment_method?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_employee_consumption_payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "pdv_authorized_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_financial_transactions: {
        Row: {
          amount: number
          bank_account_id: string | null
          chart_account_id: string | null
          cost_center_id: string | null
          created_at: string | null
          customer_id: string | null
          description: string
          document_number: string | null
          due_date: string
          fee_amount: number
          fee_fixed_applied: number
          fee_percentage_applied: number
          gross_amount: number | null
          id: string
          net_amount: number | null
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          status: string | null
          supplier_id: string | null
          transaction_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          chart_account_id?: string | null
          cost_center_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          description: string
          document_number?: string | null
          due_date: string
          fee_amount?: number
          fee_fixed_applied?: number
          fee_percentage_applied?: number
          gross_amount?: number | null
          id?: string
          net_amount?: number | null
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          status?: string | null
          supplier_id?: string | null
          transaction_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          chart_account_id?: string | null
          cost_center_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          description?: string
          document_number?: string | null
          due_date?: string
          fee_amount?: number
          fee_fixed_applied?: number
          fee_percentage_applied?: number
          gross_amount?: number | null
          id?: string
          net_amount?: number | null
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          status?: string | null
          supplier_id?: string | null
          transaction_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_financial_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "pdv_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_financial_transactions_chart_account_id_fkey"
            columns: ["chart_account_id"]
            isOneToOne: false
            referencedRelation: "pdv_chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_financial_transactions_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "pdv_cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_financial_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pdv_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_financial_transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pdv_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_ifood_products: {
        Row: {
          created_at: string | null
          id: string
          ifood_product_id: string | null
          ifood_sku: string | null
          last_synced_at: string | null
          pdv_product_id: string | null
          sync_enabled: boolean | null
          sync_error: string | null
          sync_status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          ifood_product_id?: string | null
          ifood_sku?: string | null
          last_synced_at?: string | null
          pdv_product_id?: string | null
          sync_enabled?: boolean | null
          sync_error?: string | null
          sync_status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          ifood_product_id?: string | null
          ifood_sku?: string | null
          last_synced_at?: string | null
          pdv_product_id?: string | null
          sync_enabled?: boolean | null
          sync_error?: string | null
          sync_status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_ifood_products_pdv_product_id_fkey"
            columns: ["pdv_product_id"]
            isOneToOne: false
            referencedRelation: "pdv_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_ifood_sync_logs: {
        Row: {
          created_at: string | null
          details: Json | null
          error_message: string | null
          id: string
          status: string
          sync_type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          status: string
          sync_type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          status?: string
          sync_type?: string
          user_id?: string
        }
        Relationships: []
      }
      pdv_ifood_webhooks: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_id: string | null
          event_type: string
          id: string
          payload: Json
          pdv_order_id: string | null
          processed: boolean | null
          processed_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_id?: string | null
          event_type: string
          id?: string
          payload: Json
          pdv_order_id?: string | null
          processed?: boolean | null
          processed_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_id?: string | null
          event_type?: string
          id?: string
          payload?: Json
          pdv_order_id?: string | null
          processed?: boolean | null
          processed_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_ifood_webhooks_pdv_order_id_fkey"
            columns: ["pdv_order_id"]
            isOneToOne: false
            referencedRelation: "pdv_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_ifood_webhooks_pdv_order_id_fkey"
            columns: ["pdv_order_id"]
            isOneToOne: false
            referencedRelation: "vw_print_bridge_comanda_items"
            referencedColumns: ["order_id"]
          },
        ]
      }
      pdv_ingredient_categories: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      pdv_ingredient_suppliers: {
        Row: {
          created_at: string | null
          id: string
          ingredient_id: string
          is_preferred: boolean | null
          last_price: number | null
          last_purchase_date: string | null
          notes: string | null
          supplier_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          ingredient_id: string
          is_preferred?: boolean | null
          last_price?: number | null
          last_purchase_date?: string | null
          notes?: string | null
          supplier_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          ingredient_id?: string
          is_preferred?: boolean | null
          last_price?: number | null
          last_purchase_date?: string | null
          notes?: string | null
          supplier_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_ingredient_suppliers_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "pdv_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_ingredient_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pdv_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_ingredients: {
        Row: {
          automatic_output: string | null
          average_cost: number | null
          category: string | null
          code: string | null
          cost_center: string | null
          created_at: string | null
          current_balance: number | null
          current_stock: number | null
          ean: string | null
          ean_quantity: number | null
          expiration_date: string | null
          factory_code: string | null
          icms_rate: number | null
          id: string
          last_entry_date: string | null
          loss_percentage: number | null
          max_stock: number | null
          min_stock: number | null
          name: string
          observations: string | null
          origin: string | null
          purchase_lot: number | null
          real_cost: number | null
          sector: string | null
          selling_price: number | null
          supplier_id: string | null
          unit: string
          unit_cost: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          automatic_output?: string | null
          average_cost?: number | null
          category?: string | null
          code?: string | null
          cost_center?: string | null
          created_at?: string | null
          current_balance?: number | null
          current_stock?: number | null
          ean?: string | null
          ean_quantity?: number | null
          expiration_date?: string | null
          factory_code?: string | null
          icms_rate?: number | null
          id?: string
          last_entry_date?: string | null
          loss_percentage?: number | null
          max_stock?: number | null
          min_stock?: number | null
          name: string
          observations?: string | null
          origin?: string | null
          purchase_lot?: number | null
          real_cost?: number | null
          sector?: string | null
          selling_price?: number | null
          supplier_id?: string | null
          unit: string
          unit_cost: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          automatic_output?: string | null
          average_cost?: number | null
          category?: string | null
          code?: string | null
          cost_center?: string | null
          created_at?: string | null
          current_balance?: number | null
          current_stock?: number | null
          ean?: string | null
          ean_quantity?: number | null
          expiration_date?: string | null
          factory_code?: string | null
          icms_rate?: number | null
          id?: string
          last_entry_date?: string | null
          loss_percentage?: number | null
          max_stock?: number | null
          min_stock?: number | null
          name?: string
          observations?: string | null
          origin?: string | null
          purchase_lot?: number | null
          real_cost?: number | null
          sector?: string | null
          selling_price?: number | null
          supplier_id?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_ingredients_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pdv_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_invoice_item_links: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          last_used_at: string
          product_code: string | null
          product_ean: string | null
          supplier_cnpj: string | null
          supplier_id: string | null
          times_used: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          last_used_at?: string
          product_code?: string | null
          product_ean?: string | null
          supplier_cnpj?: string | null
          supplier_id?: string | null
          times_used?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          last_used_at?: string
          product_code?: string | null
          product_ean?: string | null
          supplier_cnpj?: string | null
          supplier_id?: string | null
          times_used?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_invoice_item_links_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "pdv_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_invoice_item_links_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pdv_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_invoice_items: {
        Row: {
          cfop: string | null
          cofins_value: number | null
          created_at: string
          discount_value: number | null
          freight_value: number | null
          icms_value: number | null
          id: string
          ingredient_id: string | null
          insurance_value: number | null
          invoice_id: string
          ipi_value: number | null
          item_number: number
          match_status: string
          ncm: string | null
          other_expenses: number | null
          pis_value: number | null
          product_code: string | null
          product_ean: string | null
          product_name: string
          quantity: number
          suggested_ingredient_id: string | null
          total_value: number
          unit: string
          unit_value: number
        }
        Insert: {
          cfop?: string | null
          cofins_value?: number | null
          created_at?: string
          discount_value?: number | null
          freight_value?: number | null
          icms_value?: number | null
          id?: string
          ingredient_id?: string | null
          insurance_value?: number | null
          invoice_id: string
          ipi_value?: number | null
          item_number: number
          match_status?: string
          ncm?: string | null
          other_expenses?: number | null
          pis_value?: number | null
          product_code?: string | null
          product_ean?: string | null
          product_name: string
          quantity: number
          suggested_ingredient_id?: string | null
          total_value: number
          unit: string
          unit_value: number
        }
        Update: {
          cfop?: string | null
          cofins_value?: number | null
          created_at?: string
          discount_value?: number | null
          freight_value?: number | null
          icms_value?: number | null
          id?: string
          ingredient_id?: string | null
          insurance_value?: number | null
          invoice_id?: string
          ipi_value?: number | null
          item_number?: number
          match_status?: string
          ncm?: string | null
          other_expenses?: number | null
          pis_value?: number | null
          product_code?: string | null
          product_ean?: string | null
          product_name?: string
          quantity?: number
          suggested_ingredient_id?: string | null
          total_value?: number
          unit?: string
          unit_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "pdv_invoice_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "pdv_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "pdv_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_invoice_items_suggested_ingredient_id_fkey"
            columns: ["suggested_ingredient_id"]
            isOneToOne: false
            referencedRelation: "pdv_ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_invoices: {
        Row: {
          created_at: string
          discount_value: number | null
          emission_date: string
          entry_date: string | null
          financial_transaction_id: string | null
          freight_value: number | null
          id: string
          import_errors: Json | null
          insurance_value: number | null
          invoice_key: string
          invoice_number: string
          invoice_type: string
          notes: string | null
          operation_type: string
          other_expenses: number | null
          pdf_url: string | null
          series: string | null
          source: string
          status: string
          supplier_cnpj: string
          supplier_id: string | null
          supplier_name: string
          total_invoice: number
          total_products: number
          total_tax: number
          updated_at: string
          user_id: string
          xml_url: string | null
        }
        Insert: {
          created_at?: string
          discount_value?: number | null
          emission_date: string
          entry_date?: string | null
          financial_transaction_id?: string | null
          freight_value?: number | null
          id?: string
          import_errors?: Json | null
          insurance_value?: number | null
          invoice_key: string
          invoice_number: string
          invoice_type: string
          notes?: string | null
          operation_type: string
          other_expenses?: number | null
          pdf_url?: string | null
          series?: string | null
          source?: string
          status?: string
          supplier_cnpj: string
          supplier_id?: string | null
          supplier_name: string
          total_invoice?: number
          total_products?: number
          total_tax?: number
          updated_at?: string
          user_id: string
          xml_url?: string | null
        }
        Update: {
          created_at?: string
          discount_value?: number | null
          emission_date?: string
          entry_date?: string | null
          financial_transaction_id?: string | null
          freight_value?: number | null
          id?: string
          import_errors?: Json | null
          insurance_value?: number | null
          invoice_key?: string
          invoice_number?: string
          invoice_type?: string
          notes?: string | null
          operation_type?: string
          other_expenses?: number | null
          pdf_url?: string | null
          series?: string | null
          source?: string
          status?: string
          supplier_cnpj?: string
          supplier_id?: string | null
          supplier_name?: string
          total_invoice?: number
          total_products?: number
          total_tax?: number
          updated_at?: string
          user_id?: string
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_invoices_financial_transaction_id_fkey"
            columns: ["financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "pdv_financial_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pdv_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_nfce_emissions: {
        Row: {
          ambiente: string
          cancellation_protocol: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cashier_session_id: string | null
          chave_acesso: string | null
          comanda_id: string | null
          created_at: string
          customer_cpf: string | null
          customer_email: string | null
          customer_name: string | null
          danfe_html_url: string | null
          danfe_pdf_url: string | null
          data_autorizacao: string | null
          data_emissao: string
          error_payload: Json | null
          forma_pagamento: string | null
          id: string
          items_snapshot: Json | null
          last_status_check_at: string | null
          numero: number | null
          nuvem_fiscal_id: string | null
          order_id: string | null
          parcelas: number | null
          parent_emission_id: string | null
          protocolo_autorizacao: string | null
          rejection_reason: string | null
          serie: string | null
          status: string
          table_id: string | null
          updated_at: string
          user_id: string
          valor_desconto: number
          valor_servico: number
          valor_total: number
          xml_url: string | null
        }
        Insert: {
          ambiente?: string
          cancellation_protocol?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cashier_session_id?: string | null
          chave_acesso?: string | null
          comanda_id?: string | null
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string | null
          danfe_html_url?: string | null
          danfe_pdf_url?: string | null
          data_autorizacao?: string | null
          data_emissao?: string
          error_payload?: Json | null
          forma_pagamento?: string | null
          id?: string
          items_snapshot?: Json | null
          last_status_check_at?: string | null
          numero?: number | null
          nuvem_fiscal_id?: string | null
          order_id?: string | null
          parcelas?: number | null
          parent_emission_id?: string | null
          protocolo_autorizacao?: string | null
          rejection_reason?: string | null
          serie?: string | null
          status?: string
          table_id?: string | null
          updated_at?: string
          user_id: string
          valor_desconto?: number
          valor_servico?: number
          valor_total?: number
          xml_url?: string | null
        }
        Update: {
          ambiente?: string
          cancellation_protocol?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cashier_session_id?: string | null
          chave_acesso?: string | null
          comanda_id?: string | null
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string | null
          danfe_html_url?: string | null
          danfe_pdf_url?: string | null
          data_autorizacao?: string | null
          data_emissao?: string
          error_payload?: Json | null
          forma_pagamento?: string | null
          id?: string
          items_snapshot?: Json | null
          last_status_check_at?: string | null
          numero?: number | null
          nuvem_fiscal_id?: string | null
          order_id?: string | null
          parcelas?: number | null
          parent_emission_id?: string | null
          protocolo_autorizacao?: string | null
          rejection_reason?: string | null
          serie?: string | null
          status?: string
          table_id?: string | null
          updated_at?: string
          user_id?: string
          valor_desconto?: number
          valor_servico?: number
          valor_total?: number
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_nfce_emissions_parent_emission_id_fkey"
            columns: ["parent_emission_id"]
            isOneToOne: false
            referencedRelation: "pdv_nfce_emissions"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_notifications: {
        Row: {
          created_at: string | null
          data: Json | null
          id: string
          message: string
          read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          id?: string
          message: string
          read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          id?: string
          message?: string
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      pdv_option_item_recipes: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          option_item_id: string
          quantity: number
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          option_item_id: string
          quantity?: number
          unit?: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          option_item_id?: string
          quantity?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_option_item_recipes_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "pdv_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_option_item_recipes_option_item_id_fkey"
            columns: ["option_item_id"]
            isOneToOne: false
            referencedRelation: "pdv_product_option_items"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_order_items: {
        Row: {
          added_at: string | null
          added_by: string | null
          assigned_to_person: number | null
          composition_group_label: string | null
          composition_position: number | null
          created_at: string | null
          id: string
          is_composite_child: boolean
          kitchen_status: string | null
          modifiers: Json | null
          notes: string | null
          order_id: string
          parent_item_id: string | null
          product_id: string
          product_name: string
          production_center_id: string | null
          quantity: number
          ready_at: string | null
          sent_to_kitchen_at: string | null
          subtotal: number
          unit_price: number
          weight: number | null
        }
        Insert: {
          added_at?: string | null
          added_by?: string | null
          assigned_to_person?: number | null
          composition_group_label?: string | null
          composition_position?: number | null
          created_at?: string | null
          id?: string
          is_composite_child?: boolean
          kitchen_status?: string | null
          modifiers?: Json | null
          notes?: string | null
          order_id: string
          parent_item_id?: string | null
          product_id: string
          product_name: string
          production_center_id?: string | null
          quantity?: number
          ready_at?: string | null
          sent_to_kitchen_at?: string | null
          subtotal: number
          unit_price: number
          weight?: number | null
        }
        Update: {
          added_at?: string | null
          added_by?: string | null
          assigned_to_person?: number | null
          composition_group_label?: string | null
          composition_position?: number | null
          created_at?: string | null
          id?: string
          is_composite_child?: boolean
          kitchen_status?: string | null
          modifiers?: Json | null
          notes?: string | null
          order_id?: string
          parent_item_id?: string | null
          product_id?: string
          product_name?: string
          production_center_id?: string | null
          quantity?: number
          ready_at?: string | null
          sent_to_kitchen_at?: string | null
          subtotal?: number
          unit_price?: number
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pdv_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "vw_print_bridge_comanda_items"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "pdv_order_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "pdv_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_order_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "vw_print_bridge_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pdv_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_order_items_production_center_id_fkey"
            columns: ["production_center_id"]
            isOneToOne: false
            referencedRelation: "pdv_production_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_orders: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cashier_session_id: string | null
          closed_at: string | null
          closed_by_user_id: string | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          delivery_order_id: string | null
          discount: number | null
          id: string
          opened_at: string | null
          opened_by: string | null
          order_number: string
          paid_at: string | null
          service_fee: number | null
          service_fee_paid: number
          source: string
          status: string
          subtotal: number | null
          table_id: string | null
          ticket_number: number | null
          total: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cashier_session_id?: string | null
          closed_at?: string | null
          closed_by_user_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          delivery_order_id?: string | null
          discount?: number | null
          id?: string
          opened_at?: string | null
          opened_by?: string | null
          order_number: string
          paid_at?: string | null
          service_fee?: number | null
          service_fee_paid?: number
          source: string
          status?: string
          subtotal?: number | null
          table_id?: string | null
          ticket_number?: number | null
          total?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cashier_session_id?: string | null
          closed_at?: string | null
          closed_by_user_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          delivery_order_id?: string | null
          discount?: number | null
          id?: string
          opened_at?: string | null
          opened_by?: string | null
          order_number?: string
          paid_at?: string | null
          service_fee?: number | null
          service_fee_paid?: number
          source?: string
          status?: string
          subtotal?: number | null
          table_id?: string | null
          ticket_number?: number | null
          total?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_orders_cashier_session_id_fkey"
            columns: ["cashier_session_id"]
            isOneToOne: false
            referencedRelation: "pdv_cashier_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pdv_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_orders_delivery_order_id_fkey"
            columns: ["delivery_order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "pdv_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_payment_items: {
        Row: {
          comanda_item_id: string
          created_at: string
          id: string
          payment_id: string
          quantity_paid: number
          subtotal_paid: number
          unit_price: number
        }
        Insert: {
          comanda_item_id: string
          created_at?: string
          id?: string
          payment_id: string
          quantity_paid: number
          subtotal_paid: number
          unit_price: number
        }
        Update: {
          comanda_item_id?: string
          created_at?: string
          id?: string
          payment_id?: string
          quantity_paid?: number
          subtotal_paid?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pdv_payment_items_comanda_item_id_fkey"
            columns: ["comanda_item_id"]
            isOneToOne: false
            referencedRelation: "pdv_comanda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_payment_items_comanda_item_id_fkey"
            columns: ["comanda_item_id"]
            isOneToOne: false
            referencedRelation: "vw_print_bridge_comanda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_payment_items_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "pdv_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_payment_method_fees: {
        Row: {
          created_at: string
          fee_fixed: number
          fee_percentage: number
          id: string
          is_active: boolean
          label: string
          method_key: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fee_fixed?: number
          fee_percentage?: number
          id?: string
          is_active?: boolean
          label: string
          method_key: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fee_fixed?: number
          fee_percentage?: number
          id?: string
          is_active?: boolean
          label?: string
          method_key?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pdv_payments: {
        Row: {
          amount: number
          authorization_code: string | null
          cash_received: number | null
          change_amount: number | null
          created_at: string | null
          fee_amount: number
          fee_fixed_applied: number
          fee_percentage_applied: number
          gross_amount: number | null
          id: string
          installments: number | null
          net_amount: number | null
          nsu: string | null
          order_id: string
          payment_method: string
          pix_txid: string | null
          processed_at: string | null
          processed_by: string | null
        }
        Insert: {
          amount: number
          authorization_code?: string | null
          cash_received?: number | null
          change_amount?: number | null
          created_at?: string | null
          fee_amount?: number
          fee_fixed_applied?: number
          fee_percentage_applied?: number
          gross_amount?: number | null
          id?: string
          installments?: number | null
          net_amount?: number | null
          nsu?: string | null
          order_id: string
          payment_method: string
          pix_txid?: string | null
          processed_at?: string | null
          processed_by?: string | null
        }
        Update: {
          amount?: number
          authorization_code?: string | null
          cash_received?: number | null
          change_amount?: number | null
          created_at?: string | null
          fee_amount?: number
          fee_fixed_applied?: number
          fee_percentage_applied?: number
          gross_amount?: number | null
          id?: string
          installments?: number | null
          net_amount?: number | null
          nsu?: string | null
          order_id?: string
          payment_method?: string
          pix_txid?: string | null
          processed_at?: string | null
          processed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pdv_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "vw_print_bridge_comanda_items"
            referencedColumns: ["order_id"]
          },
        ]
      }
      pdv_print_jobs: {
        Row: {
          attempts: number
          center_id: string | null
          center_name: string | null
          created_at: string
          error_message: string | null
          id: string
          payload: Json
          printed_at: string | null
          printer_ip: string | null
          printer_port: number | null
          source_item_id: string
          source_kind: string
          status: string
          tenant_user_id: string
        }
        Insert: {
          attempts?: number
          center_id?: string | null
          center_name?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          payload: Json
          printed_at?: string | null
          printer_ip?: string | null
          printer_port?: number | null
          source_item_id: string
          source_kind: string
          status?: string
          tenant_user_id: string
        }
        Update: {
          attempts?: number
          center_id?: string | null
          center_name?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          payload?: Json
          printed_at?: string | null
          printer_ip?: string | null
          printer_port?: number | null
          source_item_id?: string
          source_kind?: string
          status?: string
          tenant_user_id?: string
        }
        Relationships: []
      }
      pdv_product_composition_groups: {
        Row: {
          allow_quantity: boolean
          created_at: string
          id: string
          is_required: boolean
          max_selections: number
          min_selections: number
          name: string
          order_position: number
          parent_product_id: string
          type: string
        }
        Insert: {
          allow_quantity?: boolean
          created_at?: string
          id?: string
          is_required?: boolean
          max_selections?: number
          min_selections?: number
          name: string
          order_position?: number
          parent_product_id: string
          type?: string
        }
        Update: {
          allow_quantity?: boolean
          created_at?: string
          id?: string
          is_required?: boolean
          max_selections?: number
          min_selections?: number
          name?: string
          order_position?: number
          parent_product_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_product_composition_groups_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "pdv_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_product_compositions: {
        Row: {
          child_product_id: string
          created_at: string | null
          group_id: string | null
          id: string
          order_position: number
          parent_product_id: string
          quantity: number
        }
        Insert: {
          child_product_id: string
          created_at?: string | null
          group_id?: string | null
          id?: string
          order_position?: number
          parent_product_id: string
          quantity?: number
        }
        Update: {
          child_product_id?: string
          created_at?: string | null
          group_id?: string | null
          id?: string
          order_position?: number
          parent_product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "pdv_product_compositions_child_product_id_fkey"
            columns: ["child_product_id"]
            isOneToOne: false
            referencedRelation: "pdv_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_product_compositions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "pdv_product_composition_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_product_compositions_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "pdv_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_product_modifiers: {
        Row: {
          affects_recipe: boolean | null
          created_at: string | null
          id: string
          is_available: boolean | null
          name: string
          price_adjustment: number | null
          product_id: string
        }
        Insert: {
          affects_recipe?: boolean | null
          created_at?: string | null
          id?: string
          is_available?: boolean | null
          name: string
          price_adjustment?: number | null
          product_id: string
        }
        Update: {
          affects_recipe?: boolean | null
          created_at?: string | null
          id?: string
          is_available?: boolean | null
          name?: string
          price_adjustment?: number | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_product_modifiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pdv_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_product_option_items: {
        Row: {
          created_at: string
          id: string
          is_available: boolean | null
          item_kind: string
          linked_product_id: string | null
          name: string
          option_id: string
          order_position: number | null
          price_adjustment: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_available?: boolean | null
          item_kind?: string
          linked_product_id?: string | null
          name: string
          option_id: string
          order_position?: number | null
          price_adjustment?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_available?: boolean | null
          item_kind?: string
          linked_product_id?: string | null
          name?: string
          option_id?: string
          order_position?: number | null
          price_adjustment?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_product_option_items_linked_product_id_fkey"
            columns: ["linked_product_id"]
            isOneToOne: false
            referencedRelation: "pdv_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_product_option_items_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "pdv_product_options"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_product_options: {
        Row: {
          created_at: string
          id: string
          is_required: boolean | null
          max_selections: number | null
          min_selections: number | null
          name: string
          order_position: number | null
          product_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean | null
          max_selections?: number | null
          min_selections?: number | null
          name: string
          order_position?: number | null
          product_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean | null
          max_selections?: number | null
          min_selections?: number | null
          name?: string
          order_position?: number | null
          product_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pdv_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_product_recipes: {
        Row: {
          created_at: string | null
          id: string
          ingredient_id: string
          product_id: string
          quantity: number
          unit: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          ingredient_id: string
          product_id: string
          quantity: number
          unit: string
        }
        Update: {
          created_at?: string | null
          id?: string
          ingredient_id?: string
          product_id?: string
          quantity?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_product_recipes_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "pdv_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_product_recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pdv_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_production_centers: {
        Row: {
          color: string
          created_at: string
          display_order: number
          icon: string
          id: string
          is_active: boolean
          name: string
          printer_ip: string | null
          printer_name: string | null
          printer_port: number | null
          slug: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          display_order?: number
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          printer_ip?: string | null
          printer_name?: string | null
          printer_port?: number | null
          slug: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          display_order?: number
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          printer_ip?: string | null
          printer_name?: string | null
          printer_port?: number | null
          slug?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pdv_products: {
        Row: {
          available_days: Json | null
          available_times: Json | null
          category: string
          cest: string | null
          cfop: string | null
          cofins_cst: string | null
          cofins_rate: number | null
          created_at: string | null
          csosn: string | null
          cst_icms: string | null
          description: string | null
          ean: string | null
          icms_rate: number | null
          id: string
          image_url: string | null
          is_available: boolean | null
          is_composite: boolean | null
          is_sold_by_weight: boolean | null
          name: string
          ncm: string | null
          origin: string | null
          pis_cst: string | null
          pis_rate: number | null
          preparation_time: number | null
          price_balcao: number | null
          price_delivery: number | null
          price_salon: number
          printer_station: string
          serves: number | null
          stock_deduction_mode: string | null
          tax_unit: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          available_days?: Json | null
          available_times?: Json | null
          category: string
          cest?: string | null
          cfop?: string | null
          cofins_cst?: string | null
          cofins_rate?: number | null
          created_at?: string | null
          csosn?: string | null
          cst_icms?: string | null
          description?: string | null
          ean?: string | null
          icms_rate?: number | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          is_composite?: boolean | null
          is_sold_by_weight?: boolean | null
          name: string
          ncm?: string | null
          origin?: string | null
          pis_cst?: string | null
          pis_rate?: number | null
          preparation_time?: number | null
          price_balcao?: number | null
          price_delivery?: number | null
          price_salon: number
          printer_station?: string
          serves?: number | null
          stock_deduction_mode?: string | null
          tax_unit?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          available_days?: Json | null
          available_times?: Json | null
          category?: string
          cest?: string | null
          cfop?: string | null
          cofins_cst?: string | null
          cofins_rate?: number | null
          created_at?: string | null
          csosn?: string | null
          cst_icms?: string | null
          description?: string | null
          ean?: string | null
          icms_rate?: number | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          is_composite?: boolean | null
          is_sold_by_weight?: boolean | null
          name?: string
          ncm?: string | null
          origin?: string | null
          pis_cst?: string | null
          pis_rate?: number | null
          preparation_time?: number | null
          price_balcao?: number | null
          price_delivery?: number | null
          price_salon?: number
          printer_station?: string
          serves?: number | null
          stock_deduction_mode?: string | null
          tax_unit?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pdv_purchase_order_items: {
        Row: {
          created_at: string | null
          id: string
          ingredient_id: string
          notes: string | null
          purchase_order_id: string
          quantity: number
          quantity_received: number | null
          quotation_response_id: string | null
          total_price: number
          unit: string
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          ingredient_id: string
          notes?: string | null
          purchase_order_id: string
          quantity: number
          quantity_received?: number | null
          quotation_response_id?: string | null
          total_price: number
          unit: string
          unit_price: number
        }
        Update: {
          created_at?: string | null
          id?: string
          ingredient_id?: string
          notes?: string | null
          purchase_order_id?: string
          quantity?: number
          quantity_received?: number | null
          quotation_response_id?: string | null
          total_price?: number
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pdv_purchase_order_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "pdv_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "pdv_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_purchase_order_items_quotation_response_id_fkey"
            columns: ["quotation_response_id"]
            isOneToOne: false
            referencedRelation: "pdv_quotation_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_purchase_orders: {
        Row: {
          actual_delivery: string | null
          created_at: string | null
          discount: number | null
          expected_delivery: string | null
          freight: number | null
          id: string
          notes: string | null
          order_date: string | null
          order_number: string
          payment_terms: string | null
          quotation_request_id: string | null
          status: string | null
          subtotal: number | null
          supplier_id: string | null
          total: number | null
          updated_at: string | null
          user_id: string
          whatsapp_sent_at: string | null
        }
        Insert: {
          actual_delivery?: string | null
          created_at?: string | null
          discount?: number | null
          expected_delivery?: string | null
          freight?: number | null
          id?: string
          notes?: string | null
          order_date?: string | null
          order_number: string
          payment_terms?: string | null
          quotation_request_id?: string | null
          status?: string | null
          subtotal?: number | null
          supplier_id?: string | null
          total?: number | null
          updated_at?: string | null
          user_id: string
          whatsapp_sent_at?: string | null
        }
        Update: {
          actual_delivery?: string | null
          created_at?: string | null
          discount?: number | null
          expected_delivery?: string | null
          freight?: number | null
          id?: string
          notes?: string | null
          order_date?: string | null
          order_number?: string
          payment_terms?: string | null
          quotation_request_id?: string | null
          status?: string | null
          subtotal?: number | null
          supplier_id?: string | null
          total?: number | null
          updated_at?: string | null
          user_id?: string
          whatsapp_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_purchase_orders_quotation_request_id_fkey"
            columns: ["quotation_request_id"]
            isOneToOne: false
            referencedRelation: "pdv_quotation_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pdv_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_quotation_item_suppliers: {
        Row: {
          created_at: string | null
          id: string
          quotation_item_id: string
          sent_at: string | null
          supplier_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          quotation_item_id: string
          sent_at?: string | null
          supplier_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          quotation_item_id?: string
          sent_at?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_quotation_item_suppliers_quotation_item_id_fkey"
            columns: ["quotation_item_id"]
            isOneToOne: false
            referencedRelation: "pdv_quotation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_quotation_item_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pdv_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_quotation_items: {
        Row: {
          created_at: string | null
          id: string
          ingredient_id: string
          notes: string | null
          quantity_needed: number
          quotation_request_id: string
          unit: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          ingredient_id: string
          notes?: string | null
          quantity_needed: number
          quotation_request_id: string
          unit: string
        }
        Update: {
          created_at?: string | null
          id?: string
          ingredient_id?: string
          notes?: string | null
          quantity_needed?: number
          quotation_request_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_quotation_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "pdv_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_quotation_items_quotation_request_id_fkey"
            columns: ["quotation_request_id"]
            isOneToOne: false
            referencedRelation: "pdv_quotation_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_quotation_requests: {
        Row: {
          created_at: string | null
          deadline: string | null
          id: string
          message_template: string | null
          notes: string | null
          request_number: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          deadline?: string | null
          id?: string
          message_template?: string | null
          notes?: string | null
          request_number: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          deadline?: string | null
          id?: string
          message_template?: string | null
          notes?: string | null
          request_number?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pdv_quotation_responses: {
        Row: {
          brand: string | null
          created_at: string | null
          delivery_days: number | null
          expiration_date: string | null
          id: string
          is_winner: boolean | null
          minimum_order: number | null
          notes: string | null
          origin: string | null
          payment_terms: string | null
          quotation_item_id: string
          received_at: string | null
          supplier_id: string
          total_price: number | null
          unit_price: number | null
        }
        Insert: {
          brand?: string | null
          created_at?: string | null
          delivery_days?: number | null
          expiration_date?: string | null
          id?: string
          is_winner?: boolean | null
          minimum_order?: number | null
          notes?: string | null
          origin?: string | null
          payment_terms?: string | null
          quotation_item_id: string
          received_at?: string | null
          supplier_id: string
          total_price?: number | null
          unit_price?: number | null
        }
        Update: {
          brand?: string | null
          created_at?: string | null
          delivery_days?: number | null
          expiration_date?: string | null
          id?: string
          is_winner?: boolean | null
          minimum_order?: number | null
          notes?: string | null
          origin?: string | null
          payment_terms?: string | null
          quotation_item_id?: string
          received_at?: string | null
          supplier_id?: string
          total_price?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_quotation_responses_quotation_item_id_fkey"
            columns: ["quotation_item_id"]
            isOneToOne: false
            referencedRelation: "pdv_quotation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_quotation_responses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pdv_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_sectors: {
        Row: {
          color: string | null
          created_at: string | null
          deleted_at: string | null
          height: number | null
          id: string
          is_active: boolean | null
          name: string
          position_x: number | null
          position_y: number | null
          user_id: string
          width: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          deleted_at?: string | null
          height?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          position_x?: number | null
          position_y?: number | null
          user_id: string
          width?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          deleted_at?: string | null
          height?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          position_x?: number | null
          position_y?: number | null
          user_id?: string
          width?: number | null
        }
        Relationships: []
      }
      pdv_settings: {
        Row: {
          accept_tips: boolean | null
          accepted_payment_methods: Json | null
          allow_negative_balance: boolean | null
          auto_print_to_kitchen: boolean | null
          business_address: string | null
          business_cnpj: string | null
          business_hours: Json | null
          business_name: string | null
          business_phone: string | null
          counter_table_name: string
          created_at: string | null
          default_preparation_time: number | null
          delivery_fee: number | null
          enable_desktop_notifications: boolean | null
          enable_multiple_payments: boolean | null
          enable_service_fee: boolean | null
          enable_sound_notifications: boolean | null
          id: string
          ifood_access_token: string | null
          ifood_auto_accept: boolean | null
          ifood_enabled: boolean | null
          ifood_merchant_id: string | null
          ifood_refresh_token: string | null
          ifood_sync_menu: boolean | null
          ifood_token_expires_at: string | null
          integrate_with_delivery: boolean | null
          max_tables_per_order: number | null
          min_order_value: number | null
          new_order_sound: string | null
          nfe_aliquota_cofins: number | null
          nfe_aliquota_icms: number | null
          nfe_aliquota_pis: number | null
          nfe_ambiente: string | null
          nfe_auto_emit: boolean | null
          nfe_auto_import_cnpj: string | null
          nfe_auto_import_enabled: boolean | null
          nfe_certificate_password: string | null
          nfe_certificate_url: string | null
          nfe_cfop_padrao: string | null
          nfe_csc_id: string | null
          nfe_csc_token: string | null
          nfe_cst_csosn: string | null
          nfe_email_customer: boolean | null
          nfe_enable_nfce: boolean | null
          nfe_endereco_fiscal: Json | null
          nfe_inscricao_municipal: string | null
          nfe_nome_fantasia: string | null
          nfe_numero_inicial: number | null
          nfe_serie: string | null
          nfe_serie_nfce: string | null
          order_ready_sound: string | null
          printers: Json | null
          require_customer_identification: boolean | null
          require_discount_reason: boolean
          requires_opening_balance: boolean | null
          salon_layout: Json | null
          service_fee_percentage: number | null
          shifts: Json | null
          state_registration: string | null
          tax_regime: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accept_tips?: boolean | null
          accepted_payment_methods?: Json | null
          allow_negative_balance?: boolean | null
          auto_print_to_kitchen?: boolean | null
          business_address?: string | null
          business_cnpj?: string | null
          business_hours?: Json | null
          business_name?: string | null
          business_phone?: string | null
          counter_table_name?: string
          created_at?: string | null
          default_preparation_time?: number | null
          delivery_fee?: number | null
          enable_desktop_notifications?: boolean | null
          enable_multiple_payments?: boolean | null
          enable_service_fee?: boolean | null
          enable_sound_notifications?: boolean | null
          id?: string
          ifood_access_token?: string | null
          ifood_auto_accept?: boolean | null
          ifood_enabled?: boolean | null
          ifood_merchant_id?: string | null
          ifood_refresh_token?: string | null
          ifood_sync_menu?: boolean | null
          ifood_token_expires_at?: string | null
          integrate_with_delivery?: boolean | null
          max_tables_per_order?: number | null
          min_order_value?: number | null
          new_order_sound?: string | null
          nfe_aliquota_cofins?: number | null
          nfe_aliquota_icms?: number | null
          nfe_aliquota_pis?: number | null
          nfe_ambiente?: string | null
          nfe_auto_emit?: boolean | null
          nfe_auto_import_cnpj?: string | null
          nfe_auto_import_enabled?: boolean | null
          nfe_certificate_password?: string | null
          nfe_certificate_url?: string | null
          nfe_cfop_padrao?: string | null
          nfe_csc_id?: string | null
          nfe_csc_token?: string | null
          nfe_cst_csosn?: string | null
          nfe_email_customer?: boolean | null
          nfe_enable_nfce?: boolean | null
          nfe_endereco_fiscal?: Json | null
          nfe_inscricao_municipal?: string | null
          nfe_nome_fantasia?: string | null
          nfe_numero_inicial?: number | null
          nfe_serie?: string | null
          nfe_serie_nfce?: string | null
          order_ready_sound?: string | null
          printers?: Json | null
          require_customer_identification?: boolean | null
          require_discount_reason?: boolean
          requires_opening_balance?: boolean | null
          salon_layout?: Json | null
          service_fee_percentage?: number | null
          shifts?: Json | null
          state_registration?: string | null
          tax_regime?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accept_tips?: boolean | null
          accepted_payment_methods?: Json | null
          allow_negative_balance?: boolean | null
          auto_print_to_kitchen?: boolean | null
          business_address?: string | null
          business_cnpj?: string | null
          business_hours?: Json | null
          business_name?: string | null
          business_phone?: string | null
          counter_table_name?: string
          created_at?: string | null
          default_preparation_time?: number | null
          delivery_fee?: number | null
          enable_desktop_notifications?: boolean | null
          enable_multiple_payments?: boolean | null
          enable_service_fee?: boolean | null
          enable_sound_notifications?: boolean | null
          id?: string
          ifood_access_token?: string | null
          ifood_auto_accept?: boolean | null
          ifood_enabled?: boolean | null
          ifood_merchant_id?: string | null
          ifood_refresh_token?: string | null
          ifood_sync_menu?: boolean | null
          ifood_token_expires_at?: string | null
          integrate_with_delivery?: boolean | null
          max_tables_per_order?: number | null
          min_order_value?: number | null
          new_order_sound?: string | null
          nfe_aliquota_cofins?: number | null
          nfe_aliquota_icms?: number | null
          nfe_aliquota_pis?: number | null
          nfe_ambiente?: string | null
          nfe_auto_emit?: boolean | null
          nfe_auto_import_cnpj?: string | null
          nfe_auto_import_enabled?: boolean | null
          nfe_certificate_password?: string | null
          nfe_certificate_url?: string | null
          nfe_cfop_padrao?: string | null
          nfe_csc_id?: string | null
          nfe_csc_token?: string | null
          nfe_cst_csosn?: string | null
          nfe_email_customer?: boolean | null
          nfe_enable_nfce?: boolean | null
          nfe_endereco_fiscal?: Json | null
          nfe_inscricao_municipal?: string | null
          nfe_nome_fantasia?: string | null
          nfe_numero_inicial?: number | null
          nfe_serie?: string | null
          nfe_serie_nfce?: string | null
          order_ready_sound?: string | null
          printers?: Json | null
          require_customer_identification?: boolean | null
          require_discount_reason?: boolean
          requires_opening_balance?: boolean | null
          salon_layout?: Json | null
          service_fee_percentage?: number | null
          shifts?: Json | null
          state_registration?: string | null
          tax_regime?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pdv_stock_movements: {
        Row: {
          comanda_item_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          ingredient_id: string
          order_item_id: string | null
          quantity: number
          reason: string | null
          type: Database["public"]["Enums"]["pdv_stock_movement_type"]
          unit_cost: number | null
        }
        Insert: {
          comanda_item_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          ingredient_id: string
          order_item_id?: string | null
          quantity: number
          reason?: string | null
          type: Database["public"]["Enums"]["pdv_stock_movement_type"]
          unit_cost?: number | null
        }
        Update: {
          comanda_item_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          ingredient_id?: string
          order_item_id?: string | null
          quantity?: number
          reason?: string | null
          type?: Database["public"]["Enums"]["pdv_stock_movement_type"]
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_stock_movements_comanda_item_id_fkey"
            columns: ["comanda_item_id"]
            isOneToOne: false
            referencedRelation: "pdv_comanda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_stock_movements_comanda_item_id_fkey"
            columns: ["comanda_item_id"]
            isOneToOne: false
            referencedRelation: "vw_print_bridge_comanda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_stock_movements_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "pdv_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_stock_movements_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "pdv_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_stock_movements_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "vw_print_bridge_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_suppliers: {
        Row: {
          address: string | null
          address_complement: string | null
          category: string | null
          city: string | null
          cnpj: string | null
          commercial_notes: string | null
          company_name: string | null
          contact_name: string | null
          contacts: Json | null
          cpf: string | null
          created_at: string | null
          credit_limit: number | null
          delivery_time: number | null
          delivery_time_unit: string | null
          email: string | null
          financial_notes: string | null
          ibge_code: string | null
          id: string
          is_active: boolean | null
          is_billing_address: boolean | null
          municipal_registration: string | null
          name: string
          neighborhood: string | null
          notes: string | null
          payment_terms: string | null
          phone: string | null
          preferred_payment_method: string | null
          state: string | null
          state_registration: string | null
          updated_at: string | null
          user_id: string
          whatsapp: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_complement?: string | null
          category?: string | null
          city?: string | null
          cnpj?: string | null
          commercial_notes?: string | null
          company_name?: string | null
          contact_name?: string | null
          contacts?: Json | null
          cpf?: string | null
          created_at?: string | null
          credit_limit?: number | null
          delivery_time?: number | null
          delivery_time_unit?: string | null
          email?: string | null
          financial_notes?: string | null
          ibge_code?: string | null
          id?: string
          is_active?: boolean | null
          is_billing_address?: boolean | null
          municipal_registration?: string | null
          name: string
          neighborhood?: string | null
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          preferred_payment_method?: string | null
          state?: string | null
          state_registration?: string | null
          updated_at?: string | null
          user_id: string
          whatsapp?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_complement?: string | null
          category?: string | null
          city?: string | null
          cnpj?: string | null
          commercial_notes?: string | null
          company_name?: string | null
          contact_name?: string | null
          contacts?: Json | null
          cpf?: string | null
          created_at?: string | null
          credit_limit?: number | null
          delivery_time?: number | null
          delivery_time_unit?: string | null
          email?: string | null
          financial_notes?: string | null
          ibge_code?: string | null
          id?: string
          is_active?: boolean | null
          is_billing_address?: boolean | null
          municipal_registration?: string | null
          name?: string
          neighborhood?: string | null
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          preferred_payment_method?: string | null
          state?: string | null
          state_registration?: string | null
          updated_at?: string | null
          user_id?: string
          whatsapp?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      pdv_tables: {
        Row: {
          capacity: number
          created_at: string | null
          current_order_id: string | null
          deleted_at: string | null
          id: string
          is_active: boolean | null
          is_virtual: boolean
          merged_with: string | null
          position_x: number | null
          position_y: number | null
          sector_id: string | null
          shape: string | null
          status: Database["public"]["Enums"]["pdv_table_status"] | null
          table_number: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          capacity?: number
          created_at?: string | null
          current_order_id?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean | null
          is_virtual?: boolean
          merged_with?: string | null
          position_x?: number | null
          position_y?: number | null
          sector_id?: string | null
          shape?: string | null
          status?: Database["public"]["Enums"]["pdv_table_status"] | null
          table_number: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          capacity?: number
          created_at?: string | null
          current_order_id?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean | null
          is_virtual?: boolean
          merged_with?: string | null
          position_x?: number | null
          position_y?: number | null
          sector_id?: string | null
          shape?: string | null
          status?: Database["public"]["Enums"]["pdv_table_status"] | null
          table_number?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_tables_merged_with_fkey"
            columns: ["merged_with"]
            isOneToOne: false
            referencedRelation: "pdv_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_tables_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "pdv_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_transactions: {
        Row: {
          amount: number
          cancelled_at: string | null
          created_at: string
          flag: string | null
          id: string
          last_digits: string | null
          method: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          cancelled_at?: string | null
          created_at?: string
          flag?: string | null
          id?: string
          last_digits?: string | null
          method: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          cancelled_at?: string | null
          created_at?: string
          flag?: string | null
          id?: string
          last_digits?: string | null
          method?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      product_expiry_tracking: {
        Row: {
          batch_id: string | null
          category: string | null
          created_at: string
          discard_reason: string | null
          discarded_at: string | null
          discarded_quantity: number | null
          expiry_date: string
          id: string
          notes: string | null
          origin: string | null
          product_name: string
          quantity: number | null
          registered_by: string | null
          status: Database["public"]["Enums"]["expiry_status"]
          storage_location: string | null
          temperature: number | null
          unit: string | null
          unit_cost: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_id?: string | null
          category?: string | null
          created_at?: string
          discard_reason?: string | null
          discarded_at?: string | null
          discarded_quantity?: number | null
          expiry_date: string
          id?: string
          notes?: string | null
          origin?: string | null
          product_name: string
          quantity?: number | null
          registered_by?: string | null
          status?: Database["public"]["Enums"]["expiry_status"]
          storage_location?: string | null
          temperature?: number | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_id?: string | null
          category?: string | null
          created_at?: string
          discard_reason?: string | null
          discarded_at?: string | null
          discarded_quantity?: number | null
          expiry_date?: string
          id?: string
          notes?: string | null
          origin?: string | null
          product_name?: string
          quantity?: number | null
          registered_by?: string | null
          status?: Database["public"]["Enums"]["expiry_status"]
          storage_location?: string | null
          temperature?: number | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_expiry_tracking_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "checklist_operators"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          cover_image_url: string | null
          created_at: string | null
          document: string | null
          document_type: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          document?: string | null
          document_type?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          document?: string | null
          document_type?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      shared_products: {
        Row: {
          cloned_product_id: string | null
          created_at: string | null
          id: string
          last_synced_at: string | null
          source_product_id: string
          source_tenant_id: string
          sync_enabled: boolean | null
          target_tenant_id: string
        }
        Insert: {
          cloned_product_id?: string | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          source_product_id: string
          source_tenant_id: string
          sync_enabled?: boolean | null
          target_tenant_id: string
        }
        Update: {
          cloned_product_id?: string | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          source_product_id?: string
          source_tenant_id?: string
          sync_enabled?: boolean | null
          target_tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_products_cloned_product_id_fkey"
            columns: ["cloned_product_id"]
            isOneToOne: false
            referencedRelation: "pdv_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_products_source_product_id_fkey"
            columns: ["source_product_id"]
            isOneToOne: false
            referencedRelation: "pdv_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_products_source_tenant_id_fkey"
            columns: ["source_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_products_target_tenant_id_fkey"
            columns: ["target_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_table_layouts: {
        Row: {
          cloned_table_id: string | null
          created_at: string | null
          id: string
          source_table_id: string
          source_tenant_id: string
          target_tenant_id: string
        }
        Insert: {
          cloned_table_id?: string | null
          created_at?: string | null
          id?: string
          source_table_id: string
          source_tenant_id: string
          target_tenant_id: string
        }
        Update: {
          cloned_table_id?: string | null
          created_at?: string | null
          id?: string
          source_table_id?: string
          source_tenant_id?: string
          target_tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_table_layouts_cloned_table_id_fkey"
            columns: ["cloned_table_id"]
            isOneToOne: false
            referencedRelation: "pdv_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_table_layouts_source_table_id_fkey"
            columns: ["source_table_id"]
            isOneToOne: false
            referencedRelation: "pdv_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_table_layouts_source_tenant_id_fkey"
            columns: ["source_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_table_layouts_target_tenant_id_fkey"
            columns: ["target_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          category: string
          color: string
          created_at: string
          description: string | null
          end_time: string
          id: string
          location: string | null
          priority: string
          related_bill_id: string | null
          related_transaction_id: string | null
          start_time: string
          status: string
          tags: string[] | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          color?: string
          created_at?: string
          description?: string | null
          end_time: string
          id?: string
          location?: string | null
          priority?: string
          related_bill_id?: string | null
          related_transaction_id?: string | null
          start_time: string
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          color?: string
          created_at?: string
          description?: string | null
          end_time?: string
          id?: string
          location?: string | null
          priority?: string
          related_bill_id?: string | null
          related_transaction_id?: string | null
          start_time?: string
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tenant_integrations: {
        Row: {
          created_at: string | null
          id: string
          integration_slug: string
          is_active: boolean | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          integration_slug: string
          is_active?: boolean | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          integration_slug?: string
          is_active?: boolean | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_modules: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          module: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          module: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          module?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_modules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          created_by: string | null
          document: string | null
          id: string
          is_active: boolean
          name: string
          owner_user_id: string | null
          parent_tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_user_id?: string | null
          parent_tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_user_id?: string | null
          parent_tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_parent_tenant_id_fkey"
            columns: ["parent_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          bank_account_id: string | null
          category: string
          created_at: string | null
          credit_card_id: string | null
          description: string | null
          id: string
          is_recurring: boolean | null
          payment_method: string | null
          transaction_date: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          category: string
          created_at?: string | null
          credit_card_id?: string | null
          description?: string | null
          id?: string
          is_recurring?: boolean | null
          payment_method?: string | null
          transaction_date: string
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          category?: string
          created_at?: string | null
          credit_card_id?: string | null
          description?: string | null
          id?: string
          is_recurring?: boolean | null
          payment_method?: string | null
          transaction_date?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      two_factor_codes: {
        Row: {
          code: string
          created_at: string | null
          expires_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string | null
          expires_at: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_modules: {
        Row: {
          acquired_at: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          module: Database["public"]["Enums"]["user_module"]
          trial_ends_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          acquired_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          module: Database["public"]["Enums"]["user_module"]
          trial_ends_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          acquired_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          module?: Database["public"]["Enums"]["user_module"]
          trial_ends_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string | null
          currency: string | null
          date_format: string | null
          density: string | null
          financial_settings: Json | null
          id: string
          language: string | null
          notifications: Json | null
          nps_enabled: boolean | null
          security_settings: Json | null
          sidebar_expanded: boolean | null
          theme: string | null
          time_format: string | null
          timezone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          date_format?: string | null
          density?: string | null
          financial_settings?: Json | null
          id?: string
          language?: string | null
          notifications?: Json | null
          nps_enabled?: boolean | null
          security_settings?: Json | null
          sidebar_expanded?: boolean | null
          theme?: string | null
          time_format?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          date_format?: string | null
          density?: string | null
          financial_settings?: Json | null
          id?: string
          language?: string | null
          notifications?: Json | null
          nps_enabled?: boolean | null
          security_settings?: Json | null
          sidebar_expanded?: boolean | null
          theme?: string | null
          time_format?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          company_name: string | null
          created_at: string | null
          email: string
          id: string
          main_challenge: string | null
          monthly_revenue: string | null
          name: string
          notes: string | null
          phone: string
          position: number | null
          referral_code: string | null
          referred_by: string | null
          status: string | null
          updated_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          email: string
          id?: string
          main_challenge?: string | null
          monthly_revenue?: string | null
          name: string
          notes?: string | null
          phone: string
          position?: number | null
          referral_code?: string | null
          referred_by?: string | null
          status?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          email?: string
          id?: string
          main_challenge?: string | null
          monthly_revenue?: string | null
          name?: string
          notes?: string | null
          phone?: string
          position?: number | null
          referral_code?: string | null
          referred_by?: string | null
          status?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      whatsapp_connections: {
        Row: {
          connected_at: string | null
          connection_name: string | null
          connection_status: string | null
          created_at: string | null
          id: string
          instance_name: string
          last_seen_at: string | null
          phone_number: string | null
          profile_name: string | null
          profile_picture_url: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          connected_at?: string | null
          connection_name?: string | null
          connection_status?: string | null
          created_at?: string | null
          id?: string
          instance_name: string
          last_seen_at?: string | null
          phone_number?: string | null
          profile_name?: string | null
          profile_picture_url?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          connected_at?: string | null
          connection_name?: string | null
          connection_status?: string | null
          created_at?: string | null
          id?: string
          instance_name?: string
          last_seen_at?: string | null
          phone_number?: string | null
          profile_name?: string | null
          profile_picture_url?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_notification_preferences: {
        Row: {
          bills_days_before: number
          bills_reminder: boolean
          created_at: string
          credit_cards_days_before: number
          credit_cards_reminder: boolean
          daily_summary: boolean
          daily_summary_time: string
          id: string
          monthly_report: boolean
          updated_at: string
          user_id: string
          weekly_report: boolean
          weekly_report_day: number
        }
        Insert: {
          bills_days_before?: number
          bills_reminder?: boolean
          created_at?: string
          credit_cards_days_before?: number
          credit_cards_reminder?: boolean
          daily_summary?: boolean
          daily_summary_time?: string
          id?: string
          monthly_report?: boolean
          updated_at?: string
          user_id: string
          weekly_report?: boolean
          weekly_report_day?: number
        }
        Update: {
          bills_days_before?: number
          bills_reminder?: boolean
          created_at?: string
          credit_cards_days_before?: number
          credit_cards_reminder?: boolean
          daily_summary?: boolean
          daily_summary_time?: string
          id?: string
          monthly_report?: boolean
          updated_at?: string
          user_id?: string
          weekly_report?: boolean
          weekly_report_day?: number
        }
        Relationships: []
      }
      whatsapp_session_context: {
        Row: {
          conversation_state: string | null
          created_at: string | null
          id: string
          last_account_id: string | null
          last_message_at: string | null
          pending_delete: Json | null
          pending_edit: Json | null
          pending_event: Json | null
          pending_installment: Json | null
          pending_messages: Json | null
          pending_receipt: Json | null
          pending_transaction: Json | null
          phone_number: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          conversation_state?: string | null
          created_at?: string | null
          id?: string
          last_account_id?: string | null
          last_message_at?: string | null
          pending_delete?: Json | null
          pending_edit?: Json | null
          pending_event?: Json | null
          pending_installment?: Json | null
          pending_messages?: Json | null
          pending_receipt?: Json | null
          pending_transaction?: Json | null
          phone_number: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          conversation_state?: string | null
          created_at?: string | null
          id?: string
          last_account_id?: string | null
          last_message_at?: string | null
          pending_delete?: Json | null
          pending_edit?: Json | null
          pending_event?: Json | null
          pending_installment?: Json | null
          pending_messages?: Json | null
          pending_receipt?: Json | null
          pending_transaction?: Json | null
          phone_number?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_session_context_last_account_id_fkey"
            columns: ["last_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_verifications: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          is_verified: boolean | null
          phone_number: string
          user_id: string
          verification_code: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          is_verified?: boolean | null
          phone_number: string
          user_id: string
          verification_code: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          is_verified?: boolean | null
          phone_number?: string
          user_id?: string
          verification_code?: string
          verified_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      vw_print_bridge_comanda_items: {
        Row: {
          center_name: string | null
          comanda_id: string | null
          comanda_number: string | null
          composition_group_label: string | null
          composition_position: number | null
          customer_name: string | null
          id: string | null
          is_composite_child: boolean | null
          is_virtual: boolean | null
          kitchen_status: string | null
          modifiers: Json | null
          notes: string | null
          order_id: string | null
          order_number: string | null
          parent_item_id: string | null
          parent_product_name: string | null
          printer_ip: string | null
          printer_port: number | null
          product_name: string | null
          production_center_id: string | null
          quantity: number | null
          sent_to_kitchen_at: string | null
          table_id: string | null
          table_number: string | null
          tenant_user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_comanda_items_comanda_id_fkey"
            columns: ["comanda_id"]
            isOneToOne: false
            referencedRelation: "pdv_comandas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_comanda_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "pdv_comanda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_comanda_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "vw_print_bridge_comanda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_comanda_items_production_center_id_fkey"
            columns: ["production_center_id"]
            isOneToOne: false
            referencedRelation: "pdv_production_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "pdv_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_print_bridge_delivery_items: {
        Row: {
          center_name: string | null
          customer_name: string | null
          customer_phone: string | null
          delivery_address_text: string | null
          id: string | null
          notes: string | null
          options: Json | null
          order_id: string | null
          order_number: string | null
          order_type: string | null
          printer_ip: string | null
          printer_port: number | null
          product_name: string | null
          production_center_id: string | null
          quantity: number | null
          tenant_user_id: string | null
          ticket_number: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_order_items_production_center_id_fkey"
            columns: ["production_center_id"]
            isOneToOne: false
            referencedRelation: "pdv_production_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_print_bridge_order_items: {
        Row: {
          center_name: string | null
          composition_group_label: string | null
          composition_position: number | null
          id: string | null
          is_composite_child: boolean | null
          is_virtual: boolean | null
          kitchen_status: string | null
          modifiers: Json | null
          notes: string | null
          order_id: string | null
          order_number: string | null
          parent_item_id: string | null
          parent_product_name: string | null
          printer_ip: string | null
          printer_port: number | null
          product_name: string | null
          production_center_id: string | null
          quantity: number | null
          sent_to_kitchen_at: string | null
          table_id: string | null
          table_number: string | null
          tenant_user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pdv_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "vw_print_bridge_comanda_items"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "pdv_order_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "pdv_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_order_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "vw_print_bridge_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_order_items_production_center_id_fkey"
            columns: ["production_center_id"]
            isOneToOne: false
            referencedRelation: "pdv_production_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "pdv_tables"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_device_token: {
        Args: { p_token: string }
        Returns: {
          device_id: string
          owner_user_id: string
        }[]
      }
      consume_ingredients_for_comanda_items: {
        Args: { p_item_ids: string[] }
        Returns: {
          out_ingredient_id: string
          out_total_consumed: number
        }[]
      }
      consume_ingredients_for_delivery_order: {
        Args: { p_order_id: string }
        Returns: {
          out_ingredient_id: string
          out_total_consumed: number
        }[]
      }
      delivery_assign_order_ticket: {
        Args: { p_order_id: string }
        Returns: number
      }
      delivery_clone_options_from_pdv: {
        Args: { p_pdv_product_id: string }
        Returns: Json
      }
      get_user_child_tenant_ids: { Args: never; Returns: string[] }
      get_user_parent_tenant_ids: { Args: never; Returns: string[] }
      has_module_access: {
        Args: {
          _module: Database["public"]["Enums"]["user_module"]
          _user_id: string
        }
        Returns: boolean
      }
      has_pdv_action: {
        Args: {
          _action: Database["public"]["Enums"]["pdv_permission_action"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_prize_redeemed_count: {
        Args: { prize_id: string }
        Returns: undefined
      }
      is_establishment_member: { Args: { owner_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      log_pdv_action: {
        Args: {
          _action: Database["public"]["Enums"]["pdv_permission_action"]
          _payload: Json
          _reason: string
          _source_id: string
          _source_type: string
          _target_id: string
          _target_type: string
        }
        Returns: string
      }
      pdv_assign_order_ticket: { Args: { p_order_id: string }; Returns: number }
      pdv_cancel_comanda: {
        Args: {
          p_category: string
          p_comanda_id: string
          p_customer_notified: boolean
          p_reason: string
        }
        Returns: Json
      }
      pdv_cancel_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: Json
      }
      pdv_change_table: {
        Args: {
          p_reason?: string
          p_source_table_id: string
          p_target_table_id: string
        }
        Returns: Json
      }
      pdv_close_attendance: {
        Args: {
          p_close_whole_table?: boolean
          p_comanda_id: string
          p_reason?: string
        }
        Returns: Json
      }
      pdv_ensure_counter_table: {
        Args: { _name: string; _owner: string }
        Returns: string
      }
      pdv_finalize_paid_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: Json
      }
      pdv_lock_comanda_items: {
        Args: { p_item_ids: string[]; p_session_id: string }
        Returns: {
          locked_id: string
        }[]
      }
      pdv_next_comanda_number: {
        Args: { p_owner: string }
        Returns: {
          cashier_session_id: string
          comanda_number: string
        }[]
      }
      pdv_recompute_session_totals: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      pdv_register_employee_consumption: {
        Args: { p_employee_id: string; p_items: Json; p_justification?: string }
        Returns: Json
      }
      pdv_resolve_owner: { Args: { _user_id: string }; Returns: string }
      pdv_settle_employee_consumption: {
        Args: { p_amount: number; p_employee_id: string; p_session_id?: string }
        Returns: Json
      }
      pdv_split_comanda_item: {
        Args: { p_item_id: string; p_qty: number }
        Returns: string
      }
      pdv_transfer_items:
        | {
            Args: {
              p_item_ids: string[]
              p_qty_map: Json
              p_reason?: string
              p_target_id: string
              p_target_kind: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_item_ids: string[]
              p_qty_map: Json
              p_reason?: string
              p_target_comanda_name?: string
              p_target_id: string
              p_target_kind: string
            }
            Returns: Json
          }
      pdv_unlock_comanda_items: {
        Args: { p_item_ids: string[]; p_session_id: string }
        Returns: undefined
      }
      pdv_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      redeem_loyalty_prize: {
        Args: { _customer_id: string; _prize_id: string; _user_id: string }
        Returns: string
      }
      resolve_business_slug: { Args: { _slug: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "proprietario"
        | "gerente"
        | "caixa"
        | "garcom"
        | "cozinheiro"
        | "estoquista"
        | "financeiro"
        | "atendente_delivery"
      checklist_alert_type:
        | "prazo_expirado"
        | "temperatura_fora"
        | "item_critico"
      checklist_execution_status:
        | "pendente"
        | "em_andamento"
        | "concluido"
        | "atrasado"
        | "nao_iniciado"
      checklist_item_type:
        | "checkbox"
        | "number"
        | "text"
        | "photo"
        | "temperature"
        | "stars"
        | "multiple_choice"
      checklist_sector:
        | "cozinha"
        | "salao"
        | "caixa"
        | "bar"
        | "estoque"
        | "gerencia"
      delivery_driver_status: "disponivel" | "em_entrega" | "inativo"
      delivery_vehicle_type: "moto" | "bicicleta" | "carro" | "a_pe"
      evidence_review_status: "pendente" | "aprovado" | "reprovado"
      expiry_status: "valido" | "proximo_vencimento" | "vencido" | "descartado"
      operator_access_level: "operador" | "lider" | "gestor"
      pdv_cash_movement_type:
        | "abertura"
        | "venda"
        | "sangria"
        | "suprimento"
        | "fechamento"
      pdv_permission_action:
        | "change_table"
        | "transfer_table_to_table"
        | "transfer_comanda_to_comanda"
        | "transfer_table_to_comanda"
        | "transfer_comanda_to_table"
        | "close_attendance"
        | "cancel_item"
        | "cancel_paid_item"
        | "apply_discount"
        | "remove_service_fee"
        | "view_history"
        | "process_payment"
        | "refund_payment"
        | "cancel_comanda"
      pdv_stock_movement_type:
        | "entrada"
        | "saida_venda"
        | "saida_perda"
        | "ajuste"
      pdv_table_status:
        | "livre"
        | "ocupada"
        | "aguardando_pedido"
        | "aguardando_cozinha"
        | "pediu_conta"
        | "pendente_pagamento"
      user_module: "financeiro" | "crm" | "delivery" | "pdv" | "avaliacoes"
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
      app_role: [
        "proprietario",
        "gerente",
        "caixa",
        "garcom",
        "cozinheiro",
        "estoquista",
        "financeiro",
        "atendente_delivery",
      ],
      checklist_alert_type: [
        "prazo_expirado",
        "temperatura_fora",
        "item_critico",
      ],
      checklist_execution_status: [
        "pendente",
        "em_andamento",
        "concluido",
        "atrasado",
        "nao_iniciado",
      ],
      checklist_item_type: [
        "checkbox",
        "number",
        "text",
        "photo",
        "temperature",
        "stars",
        "multiple_choice",
      ],
      checklist_sector: [
        "cozinha",
        "salao",
        "caixa",
        "bar",
        "estoque",
        "gerencia",
      ],
      delivery_driver_status: ["disponivel", "em_entrega", "inativo"],
      delivery_vehicle_type: ["moto", "bicicleta", "carro", "a_pe"],
      evidence_review_status: ["pendente", "aprovado", "reprovado"],
      expiry_status: ["valido", "proximo_vencimento", "vencido", "descartado"],
      operator_access_level: ["operador", "lider", "gestor"],
      pdv_cash_movement_type: [
        "abertura",
        "venda",
        "sangria",
        "suprimento",
        "fechamento",
      ],
      pdv_permission_action: [
        "change_table",
        "transfer_table_to_table",
        "transfer_comanda_to_comanda",
        "transfer_table_to_comanda",
        "transfer_comanda_to_table",
        "close_attendance",
        "cancel_item",
        "cancel_paid_item",
        "apply_discount",
        "remove_service_fee",
        "view_history",
        "process_payment",
        "refund_payment",
        "cancel_comanda",
      ],
      pdv_stock_movement_type: [
        "entrada",
        "saida_venda",
        "saida_perda",
        "ajuste",
      ],
      pdv_table_status: [
        "livre",
        "ocupada",
        "aguardando_pedido",
        "aguardando_cozinha",
        "pediu_conta",
        "pendente_pagamento",
      ],
      user_module: ["financeiro", "crm", "delivery", "pdv", "avaliacoes"],
    },
  },
} as const
