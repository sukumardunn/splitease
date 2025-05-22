export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          name: string
          avatar_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string
          avatar_url?: string | null
          created_at?: string
        }
      }
      groups: {
        Row: {
          id: string
          name: string
          avatar_url: string | null
          created_at: string
          created_by: string
        }
        Insert: {
          id?: string
          name: string
          avatar_url?: string | null
          created_at?: string
          created_by: string
        }
        Update: {
          id?: string
          name?: string
          avatar_url?: string | null
          created_at?: string
          created_by?: string
        }
      }
      group_members: {
        Row: {
          group_id: string
          user_id: string
          joined_at: string
        }
        Insert: {
          group_id: string
          user_id: string
          joined_at?: string
        }
        Update: {
          group_id?: string
          user_id?: string
          joined_at?: string
        }
      }
      expenses: {
        Row: {
          id: string
          description: string
          amount: number
          paid_by: string
          group_id: string | null
          category: string
          currency: string
          created_at: string
        }
        Insert: {
          id?: string
          description: string
          amount: number
          paid_by: string
          group_id?: string | null
          category: string
          currency?: string
          created_at?: string
        }
        Update: {
          id?: string
          description?: string
          amount?: number
          paid_by?: string
          group_id?: string | null
          category?: string
          currency?: string
          created_at?: string
        }
      }
      expense_splits: {
        Row: {
          expense_id: string
          user_id: string
          amount: number
          created_at: string
        }
        Insert: {
          expense_id: string
          user_id: string
          amount: number
          created_at?: string
        }
        Update: {
          expense_id?: string
          user_id?: string
          amount?: number
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}