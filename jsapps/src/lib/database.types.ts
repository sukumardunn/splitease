// Hand-authored to match the migrations in supabase/migrations/ — currently
// 20260719000001 (phase 4a) + 20260725000001 (phase 5a import batches)
// + 20260725000002 (atomic expense update RPC)
// + 20260725000003 (atomic group update RPC)
// + 20260725000005 (expense_receipts + expenses.split_mode).
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
        Row: { id: string; owner_id: string; name: string; email: string; avatar: string; deleted_at: string | null; created_at: string; import_batch_id: string | null };
        Insert: { id?: string; owner_id: string; name: string; email?: string; avatar?: string; deleted_at?: string | null; created_at?: string; import_batch_id?: string | null };
        Update: { id?: string; owner_id?: string; name?: string; email?: string; avatar?: string; deleted_at?: string | null; created_at?: string; import_batch_id?: string | null };
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
        Row: { id: string; owner_id: string; description: string; amount: number; paid_by: string; date: string; category: string; currency: string; group_id: string | null; notes: string | null; deleted_at: string | null; created_at: string; import_batch_id: string | null; split_mode: string | null };
        Insert: { id?: string; owner_id: string; description: string; amount: number; paid_by: string; date?: string; category?: string; currency?: string; group_id?: string | null; notes?: string | null; deleted_at?: string | null; created_at?: string; import_batch_id?: string | null; split_mode?: string | null };
        Update: { id?: string; owner_id?: string; description?: string; amount?: number; paid_by?: string; date?: string; category?: string; currency?: string; group_id?: string | null; notes?: string | null; deleted_at?: string | null; created_at?: string; import_batch_id?: string | null; split_mode?: string | null };
        Relationships: [];
      };
      // Receipt images, stored in Postgres rather than a Storage bucket
      // (20260725000005). `data_base64` is the image payload WITHOUT a `data:`
      // URI prefix, and is never selected by the startup load — see
      // services/receiptStore.ts.
      expense_receipts: {
        Row: { expense_id: string; owner_id: string; mime_type: string; byte_size: number; data_base64: string; created_at: string };
        Insert: { expense_id: string; owner_id: string; mime_type: string; byte_size: number; data_base64: string; created_at?: string };
        Update: { expense_id?: string; owner_id?: string; mime_type?: string; byte_size?: number; data_base64?: string; created_at?: string };
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
      import_batches: {
        Row: { id: string; owner_id: string; source: string; filename: string; expense_count: number; friend_count: number; undone_at: string | null; created_at: string };
        Insert: { id?: string; owner_id: string; source?: string; filename?: string; expense_count?: number; friend_count?: number; undone_at?: string | null; created_at?: string };
        Update: { id?: string; owner_id?: string; source?: string; filename?: string; expense_count?: number; friend_count?: number; undone_at?: string | null; created_at?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      // Atomic expense create/edit (20260725000002): upsert the parent and replace
      // its payer/split rows in one transaction. Returns the expense id it wrote,
      // or null if the upsert matched nothing. `security invoker`, so RLS still
      // scopes it to the caller's own expenses.
      update_expense_with_children: {
        Args: { p_expense: Json; p_payers?: Json; p_splits?: Json };
        Returns: string | null;
      };
      // Atomic group edit (20260725000003): the same shape one table over — upsert
      // the group and replace its `group_members` rows in one transaction.
      update_group_with_members: {
        Args: { p_group: Json; p_members?: Json };
        Returns: string | null;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
