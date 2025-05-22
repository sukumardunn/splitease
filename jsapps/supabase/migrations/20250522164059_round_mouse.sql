/*
  # Initial Schema Setup for SplitEase

  1. New Tables
    - `users`
      - `id` (uuid, primary key)
      - `email` (text, unique)
      - `name` (text)
      - `avatar_url` (text)
      - `created_at` (timestamp)
    
    - `groups`
      - `id` (uuid, primary key)
      - `name` (text)
      - `avatar_url` (text)
      - `created_at` (timestamp)
      - `created_by` (uuid, references users)
    
    - `group_members`
      - `group_id` (uuid, references groups)
      - `user_id` (uuid, references users)
      - `joined_at` (timestamp)
    
    - `expenses`
      - `id` (uuid, primary key)
      - `description` (text)
      - `amount` (decimal)
      - `paid_by` (uuid, references users)
      - `group_id` (uuid, references groups, nullable)
      - `category` (text)
      - `currency` (text)
      - `created_at` (timestamp)
    
    - `expense_splits`
      - `expense_id` (uuid, references expenses)
      - `user_id` (uuid, references users)
      - `amount` (decimal)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Create users table
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT auth.uid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  avatar_url text,
  created_at timestamptz DEFAULT now()
);

-- Create groups table
CREATE TABLE groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id) NOT NULL
);

-- Create group_members table
CREATE TABLE group_members (
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- Create expenses table
CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  amount decimal NOT NULL CHECK (amount > 0),
  paid_by uuid REFERENCES users(id) NOT NULL,
  group_id uuid REFERENCES groups(id) ON DELETE SET NULL,
  category text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz DEFAULT now()
);

-- Create expense_splits table
CREATE TABLE expense_splits (
  expense_id uuid REFERENCES expenses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  amount decimal NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (expense_id, user_id)
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read own data" ON users
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can read groups they belong to" ON groups
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = groups.id AND user_id = auth.uid()
  ));

CREATE POLICY "Users can create groups" ON groups
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Group creators can update groups" ON groups
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can read group memberships" ON group_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid()
  ));

CREATE POLICY "Users can manage group memberships" ON group_members
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM groups
    WHERE id = group_members.group_id AND created_by = auth.uid()
  ));

CREATE POLICY "Users can read expenses they're involved in" ON expenses
  FOR SELECT TO authenticated
  USING (
    paid_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM expense_splits
      WHERE expense_id = expenses.id AND user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = expenses.group_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create expenses" ON expenses
  FOR INSERT TO authenticated
  WITH CHECK (paid_by = auth.uid());

CREATE POLICY "Users can read splits they're involved in" ON expense_splits
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM expenses
      WHERE id = expense_splits.expense_id AND (
        paid_by = auth.uid() OR
        group_id IN (
          SELECT group_id FROM group_members WHERE user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can create splits for their expenses" ON expense_splits
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenses
      WHERE id = expense_splits.expense_id AND paid_by = auth.uid()
    )
  );