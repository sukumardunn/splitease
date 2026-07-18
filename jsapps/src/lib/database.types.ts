// Hand-authored to match supabase/migrations/20260719000001_phase4a_auth_persistence.sql.
// T8 reconciles this against `supabase gen types typescript --local` (generator wins).
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; name: string; email: string; avatar: string; created_at: string };
        Insert: { id: string; name?: string; email?: string; avatar?: string; created_at?: string };
        Update: { id?: string; name?: string; email?: string; avatar?: string; created_at?: string };
        Relationships: [];
      };
      friends: {
        Row: { id: string; owner_id: string; name: string; email: string; avatar: string; deleted_at: string | null; created_at: string };
        Insert: { id?: string; owner_id: string; name: string; email?: string; avatar?: string; deleted_at?: string | null; created_at?: string };
        Update: { id?: string; owner_id?: string; name?: string; email?: string; avatar?: string; deleted_at?: string | null; created_at?: string };
        Relationships: [];
      };
      groups: {
        Row: { id: string; owner_id: string; name: string; avatar: string; deleted_at: string | null; created_at: string };
        Insert: { id?: string; owner_id: string; name: string; avatar?: string; deleted_at?: string | null; created_at?: string };
        Update: { id?: string; owner_id?: string; name?: string; avatar?: string; deleted_at?: string | null; created_at?: string };
        Relationships: [];
      };
      group_members: {
        Row: { group_id: string; person_id: string };
        Insert: { group_id: string; person_id: string };
        Update: { group_id?: string; person_id?: string };
        Relationships: [];
      };
      expenses: {
        Row: { id: string; owner_id: string; description: string; amount: number; paid_by: string; date: string; category: string; currency: string; group_id: string | null; notes: string | null; deleted_at: string | null; created_at: string };
        Insert: { id?: string; owner_id: string; description: string; amount: number; paid_by: string; date?: string; category?: string; currency?: string; group_id?: string | null; notes?: string | null; deleted_at?: string | null; created_at?: string };
        Update: { id?: string; owner_id?: string; description?: string; amount?: number; paid_by?: string; date?: string; category?: string; currency?: string; group_id?: string | null; notes?: string | null; deleted_at?: string | null; created_at?: string };
        Relationships: [];
      };
      expense_payers: {
        Row: { expense_id: string; person_id: string; amount: number };
        Insert: { expense_id: string; person_id: string; amount: number };
        Update: { expense_id?: string; person_id?: string; amount?: number };
        Relationships: [];
      };
      expense_splits: {
        Row: { expense_id: string; person_id: string; amount: number };
        Insert: { expense_id: string; person_id: string; amount: number };
        Update: { expense_id?: string; person_id?: string; amount?: number };
        Relationships: [];
      };
      settlements: {
        Row: { id: string; owner_id: string; from_person_id: string; to_person_id: string; amount: number; currency: string; date: string; group_id: string | null; deleted_at: string | null; created_at: string };
        Insert: { id?: string; owner_id: string; from_person_id: string; to_person_id: string; amount: number; currency?: string; date?: string; group_id?: string | null; deleted_at?: string | null; created_at?: string };
        Update: { id?: string; owner_id?: string; from_person_id?: string; to_person_id?: string; amount?: number; currency?: string; date?: string; group_id?: string | null; deleted_at?: string | null; created_at?: string };
        Relationships: [];
      };
      activity_events: {
        Row: { id: string; owner_id: string; actor_id: string; action: string; entity_type: string; entity_id: string; group_id: string | null; before: Json | null; after: Json | null; created_at: string };
        Insert: { id?: string; owner_id: string; actor_id: string; action: string; entity_type: string; entity_id: string; group_id?: string | null; before?: Json | null; after?: Json | null; created_at?: string };
        Update: { id?: string; owner_id?: string; actor_id?: string; action?: string; entity_type?: string; entity_id?: string; group_id?: string | null; before?: Json | null; after?: Json | null; created_at?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
