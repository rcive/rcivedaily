-- ==========================================================
-- RCIVE DAILY - schema.sql (reviewed v2)
-- Run in Supabase SQL Editor. Needs Postgres 15+ (all new projects).
-- Before running: Auth > Providers > Email > turn OFF "Confirm email",
-- and set minimum password length to 8.
-- ==========================================================

-- If you already ran the old schema, uncomment this reset block first:
-- DROP TABLE IF EXISTS public.transactions, public.meals, public.wallets,
--   public.categories, public.settings, public.profiles CASCADE;
-- DROP POLICY IF EXISTS "Users can upload their own receipts" ON storage.objects;
-- DROP POLICY IF EXISTS "Users can update their own receipts" ON storage.objects;
-- DROP POLICY IF EXISTS "Users can view their own receipts" ON storage.objects;
-- DROP POLICY IF EXISTS "Users can delete their own receipts" ON storage.objects;

-- ----------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------
CREATE TABLE public.profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,20}$'),
  role       text NOT NULL DEFAULT 'user'    CHECK (role IN ('user','admin')),
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.settings (
  user_id        uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  monthly_budget numeric NOT NULL DEFAULT 0 CHECK (monthly_budget >= 0),
  savings_goal   numeric NOT NULL DEFAULT 0 CHECK (savings_goal >= 0),
  theme          text NOT NULL DEFAULT 'system' CHECK (theme IN ('system','light','dark')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  type       text NOT NULL CHECK (type IN ('income','expense')),
  is_bazar   boolean NOT NULL DEFAULT false,  -- expense category counted for meal rate
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, type, name),
  UNIQUE (id, user_id)                        -- target for composite FK
);

CREATE TABLE public.wallets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 30),
  opening_balance numeric NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name),
  UNIQUE (id, user_id)
);

CREATE TABLE public.transactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('income','expense','transfer')),
  amount       numeric NOT NULL CHECK (amount > 0),
  date         date NOT NULL,
  category_id  uuid,
  wallet_id    uuid NOT NULL,
  to_wallet_id uuid,
  notes        text CHECK (notes IS NULL OR char_length(notes) <= 500),
  receipt_path text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- Composite FKs: a user can only reference THEIR OWN wallets/categories
  CONSTRAINT tx_wallet_fk    FOREIGN KEY (wallet_id, user_id)    REFERENCES public.wallets(id, user_id),
  CONSTRAINT tx_to_wallet_fk FOREIGN KEY (to_wallet_id, user_id) REFERENCES public.wallets(id, user_id),
  CONSTRAINT tx_category_fk  FOREIGN KEY (category_id, user_id)  REFERENCES public.categories(id, user_id)
                             ON DELETE SET NULL (category_id),
  CONSTRAINT tx_transfer_chk CHECK (
    (type = 'transfer' AND to_wallet_id IS NOT NULL AND wallet_id <> to_wallet_id AND category_id IS NULL)
    OR (type IN ('income','expense') AND to_wallet_id IS NULL)
  )
);

CREATE TABLE public.meals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date       date NOT NULL,
  breakfast  numeric NOT NULL DEFAULT 1 CHECK (breakfast IN (0, 0.5, 1)),
  lunch      numeric NOT NULL DEFAULT 1 CHECK (lunch     IN (0, 0.5, 1)),
  dinner     numeric NOT NULL DEFAULT 1 CHECK (dinner    IN (0, 0.5, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

-- ----------------------------------------------------------
-- 2. INDEXES (unique constraints above already cover user_id lookups)
-- ----------------------------------------------------------
CREATE INDEX tx_user_date_idx  ON public.transactions (user_id, date DESC);
CREATE INDEX tx_wallet_idx     ON public.transactions (wallet_id);
CREATE INDEX tx_to_wallet_idx  ON public.transactions (to_wallet_id);
CREATE INDEX tx_category_idx   ON public.transactions (category_id);
CREATE INDEX profiles_status_idx ON public.profiles (status);

-- ----------------------------------------------------------
-- 3. HELPER FUNCTIONS (all with fixed search_path)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_approved()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND status = 'approved'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin(), public.is_approved() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_admin(), public.is_approved() TO authenticated;

-- Auto-create profile, settings, default wallets and categories on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role, status)
  VALUES (NEW.id, lower(split_part(NEW.email, '@', 1)), 'user', 'pending');

  INSERT INTO public.settings (user_id) VALUES (NEW.id);

  INSERT INTO public.wallets (user_id, name)
  SELECT NEW.id, n FROM unnest(ARRAY['Cash','Bank','bKash','Nagad','Card']) AS n;

  INSERT INTO public.categories (user_id, name, type, is_bazar) VALUES
    (NEW.id, 'বাজার',        'expense', true),
    (NEW.id, 'বাসা ভাড়া',   'expense', false),
    (NEW.id, 'কারেন্ট বিল',  'expense', false),
    (NEW.id, 'ইন্টারনেট',    'expense', false),
    (NEW.id, 'যাতায়াত',     'expense', false),
    (NEW.id, 'চা-নাস্তা',    'expense', false),
    (NEW.id, 'অন্যান্য',      'expense', false),
    (NEW.id, 'বেতন',         'income',  false),
    (NEW.id, 'ফ্রিল্যান্সিং', 'income',  false),
    (NEW.id, 'অন্যান্য',      'income',  false);

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Block role/status/username tampering by normal users.
-- auth.uid() IS NULL = SQL Editor / service role, so the manual admin SQL below works.
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.id       := OLD.id;
  NEW.username := OLD.username;

  IF public.is_admin() THEN
    -- Admin may change others, but cannot demote/block themselves
    IF OLD.id = auth.uid() THEN
      NEW.role   := OLD.role;
      NEW.status := OLD.status;
    END IF;
    RETURN NEW;
  END IF;

  NEW.role   := OLD.role;
  NEW.status := OLD.status;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.protect_profile_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_profile_protection ON public.profiles;
CREATE TRIGGER enforce_profile_protection
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated     BEFORE UPDATE ON public.profiles     FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_settings_updated     BEFORE UPDATE ON public.settings     FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_wallets_updated      BEFORE UPDATE ON public.wallets      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_transactions_updated BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_meals_updated        BEFORE UPDATE ON public.meals        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------
-- 4. ADMIN RPCs (admin never reads users' private rows, only counts)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_user_stats()
RETURNS TABLE (
  id uuid, username text, role text, status text,
  created_at timestamptz, tx_count bigint, meal_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.username, p.role, p.status, p.created_at,
         (SELECT count(*) FROM public.transactions t WHERE t.user_id = p.id),
         (SELECT count(*) FROM public.meals m       WHERE m.user_id = p.id)
  FROM public.profiles p
  WHERE public.is_admin()
  ORDER BY p.created_at DESC;
$$;

-- Deletes the auth account too (profile + all data cascade).
-- Receipt files must be removed via the Storage API from the admin page BEFORE calling this.
CREATE OR REPLACE FUNCTION public.admin_delete_user(target uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF target = auth.uid() THEN
    RAISE EXCEPTION 'cannot delete yourself';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = target AND role = 'admin') THEN
    RAISE EXCEPTION 'cannot delete another admin';
  END IF;
  DELETE FROM auth.users WHERE id = target;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_user_stats(), public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_user_stats(), public.admin_delete_user(uuid) TO authenticated;

-- ----------------------------------------------------------
-- 5. WALLET BALANCE VIEW (single source of truth: opening + transactions)
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW public.wallet_balances WITH (security_invoker = true) AS
SELECT
  w.id AS wallet_id, w.user_id, w.name, w.opening_balance,
  w.opening_balance
  + COALESCE((SELECT sum(t.amount) FROM public.transactions t WHERE t.wallet_id    = w.id AND t.type = 'income'), 0)
  - COALESCE((SELECT sum(t.amount) FROM public.transactions t WHERE t.wallet_id    = w.id AND t.type IN ('expense','transfer')), 0)
  + COALESCE((SELECT sum(t.amount) FROM public.transactions t WHERE t.to_wallet_id = w.id AND t.type = 'transfer'), 0)
  AS balance
FROM public.wallets w;

REVOKE ALL ON public.wallet_balances FROM anon;

-- ----------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ----------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles: read own (needed to check status at login), admin reads/updates all.
-- No INSERT policy (trigger only), no user UPDATE policy, no DELETE policy (use admin_delete_user).
CREATE POLICY profiles_select_own   ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_select_admin ON public.profiles FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY profiles_update_admin ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- User data: own rows AND account must be approved (pending/rejected/blocked get nothing,
-- even with a still-valid login token).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['settings','categories','wallets','transactions','meals'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (user_id = auth.uid() AND public.is_approved())
         WITH CHECK (user_id = auth.uid() AND public.is_approved())',
      'own_' || t, t);
  END LOOP;
END $$;

-- ----------------------------------------------------------
-- 7. STORAGE (private bucket, 2MB, images only, per-user folder: <uid>/<file>)
-- ----------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('receipts', 'receipts', false, 2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS receipts_insert ON storage.objects;
DROP POLICY IF EXISTS receipts_select ON storage.objects;
DROP POLICY IF EXISTS receipts_update ON storage.objects;
DROP POLICY IF EXISTS receipts_delete ON storage.objects;

CREATE POLICY receipts_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text AND public.is_approved());
CREATE POLICY receipts_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text AND public.is_approved());
CREATE POLICY receipts_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text AND public.is_approved())
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY receipts_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ----------------------------------------------------------
-- 8. MAKE YOURSELF ADMIN (run AFTER registering your account in the app)
-- ----------------------------------------------------------
-- UPDATE public.profiles
-- SET role = 'admin', status = 'approved'
-- WHERE username = 'YOUR_USERNAME';
