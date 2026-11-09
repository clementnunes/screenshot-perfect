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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          access_token_hash: string | null
          analysis_error: string | null
          analysis_status: string
          candidate_id: string
          consent_at: string | null
          created_at: string
          cv_filename: string | null
          cv_pages: Json | null
          cv_path: string | null
          cv_text: string | null
          id: string
          identity_confirmed_at: string | null
          job_id: string
          match_score: number | null
          recommendation: string | null
          source: string
          status: string
          token_expires_at: string | null
          token_revoked: boolean
          updated_at: string
        }
        Insert: {
          access_token_hash?: string | null
          analysis_error?: string | null
          analysis_status?: string
          candidate_id: string
          consent_at?: string | null
          created_at?: string
          cv_filename?: string | null
          cv_pages?: Json | null
          cv_path?: string | null
          cv_text?: string | null
          id?: string
          identity_confirmed_at?: string | null
          job_id: string
          match_score?: number | null
          recommendation?: string | null
          source?: string
          status?: string
          token_expires_at?: string | null
          token_revoked?: boolean
          updated_at?: string
        }
        Update: {
          access_token_hash?: string | null
          analysis_error?: string | null
          analysis_status?: string
          candidate_id?: string
          consent_at?: string | null
          created_at?: string
          cv_filename?: string | null
          cv_pages?: Json | null
          cv_path?: string | null
          cv_text?: string | null
          id?: string
          identity_confirmed_at?: string | null
          job_id?: string
          match_score?: number | null
          recommendation?: string | null
          source?: string
          status?: string
          token_expires_at?: string | null
          token_revoked?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor: string
          created_at: string
          details: Json
          entity: string
          entity_id: string | null
          id: string
          idempotency_key: string | null
        }
        Insert: {
          action: string
          actor: string
          created_at?: string
          details?: Json
          entity: string
          entity_id?: string | null
          id?: string
          idempotency_key?: string | null
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          details?: Json
          entity?: string
          entity_id?: string | null
          id?: string
          idempotency_key?: string | null
        }
        Relationships: []
      }
      candidates: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cv_analyses: {
        Row: {
          application_id: string
          confidence: number | null
          created_at: string
          id: string
          match_score: number | null
          model: string | null
          recommendation: string | null
          result: Json
        }
        Insert: {
          application_id: string
          confidence?: number | null
          created_at?: string
          id?: string
          match_score?: number | null
          model?: string | null
          recommendation?: string | null
          result: Json
        }
        Update: {
          application_id?: string
          confidence?: number | null
          created_at?: string
          id?: string
          match_score?: number | null
          model?: string | null
          recommendation?: string | null
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cv_analyses_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_answers: {
        Row: {
          answer_text: string
          id: string
          input_mode: string
          interview_id: string
          question_id: string
          updated_at: string
        }
        Insert: {
          answer_text?: string
          id?: string
          input_mode?: string
          interview_id: string
          question_id: string
          updated_at?: string
        }
        Update: {
          answer_text?: string
          id?: string
          input_mode?: string
          interview_id?: string
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_answers_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_questions: {
        Row: {
          application_id: string | null
          created_at: string
          id: string
          job_id: string
          kind: string
          position: number
          question: string
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          id?: string
          job_id: string
          kind: string
          position?: number
          question: string
        }
        Update: {
          application_id?: string | null
          created_at?: string
          id?: string
          job_id?: string
          kind?: string
          position?: number
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_questions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_questions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          analysis_status: string
          application_id: string
          completed_at: string | null
          created_at: string
          current_index: number
          id: string
          invited_at: string | null
          started_at: string | null
          status: string
          summary: Json | null
          updated_at: string
        }
        Insert: {
          analysis_status?: string
          application_id: string
          completed_at?: string | null
          created_at?: string
          current_index?: number
          id?: string
          invited_at?: string | null
          started_at?: string | null
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Update: {
          analysis_status?: string
          application_id?: string
          completed_at?: string | null
          created_at?: string
          current_index?: number
          id?: string
          invited_at?: string | null
          started_at?: string | null
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      job_criteria: {
        Row: {
          created_at: string
          id: string
          job_id: string
          mandatory: boolean
          name: string
          position: number
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          mandatory?: boolean
          name: string
          position?: number
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          mandatory?: boolean
          name?: string
          position?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_criteria_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          confirmation_message: string
          contract_type: string
          created_at: string
          description: string
          diplomas: string
          experience: string
          id: string
          invitation_message: string
          link_validity_days: number
          location: string
          match_threshold: number
          missions: string
          rejection_template: string
          sender_email: string
          skills: string
          title: string
          updated_at: string
        }
        Insert: {
          confirmation_message?: string
          contract_type?: string
          created_at?: string
          description?: string
          diplomas?: string
          experience?: string
          id?: string
          invitation_message?: string
          link_validity_days?: number
          location?: string
          match_threshold?: number
          missions?: string
          rejection_template?: string
          sender_email?: string
          skills?: string
          title: string
          updated_at?: string
        }
        Update: {
          confirmation_message?: string
          contract_type?: string
          created_at?: string
          description?: string
          diplomas?: string
          experience?: string
          id?: string
          invitation_message?: string
          link_validity_days?: number
          location?: string
          match_threshold?: number
          missions?: string
          rejection_template?: string
          sender_email?: string
          skills?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          application_id: string | null
          created_at: string
          id: string
          payload: Json
          read_at: string | null
          status: string
          type: string
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          status?: string
          type: string
        }
        Update: {
          application_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_decisions: {
        Row: {
          application_id: string
          comment: string | null
          created_at: string
          decided_by: string
          decided_by_email: string | null
          decision: string
          id: string
        }
        Insert: {
          application_id: string
          comment?: string | null
          created_at?: string
          decided_by: string
          decided_by_email?: string | null
          decision: string
          id?: string
        }
        Update: {
          application_id?: string
          comment?: string | null
          created_at?: string
          decided_by?: string
          decided_by_email?: string | null
          decision?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_decisions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_recruiter: { Args: never; Returns: boolean }
      prepare_portal_interview: {
        Args: { p_application: string; p_questions: Json }
        Returns: string
      }
      save_portal_answer: {
        Args: {
          p_application: string
          p_index: number
          p_question: string
          p_text: string
        }
        Returns: string
      }
      submit_portal_interview: {
        Args: { p_application: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "recruiter"
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
      app_role: ["admin", "recruiter"],
    },
  },
} as const
