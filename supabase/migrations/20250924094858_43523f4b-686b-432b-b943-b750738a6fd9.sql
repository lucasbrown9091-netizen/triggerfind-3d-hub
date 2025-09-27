-- Create user profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  license_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add IP locking columns if they don't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS locked_ip TEXT,
ADD COLUMN IF NOT EXISTS ip_lock_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS last_ip TEXT,
ADD COLUMN IF NOT EXISTS ip_updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create valid license keys table
CREATE TABLE IF NOT EXISTS public.license_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  license_key TEXT NOT NULL UNIQUE,
  is_used BOOLEAN NOT NULL DEFAULT false,
  used_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  used_at TIMESTAMP WITH TIME ZONE
);

-- Create user uploads table for dump files
CREATE TABLE IF NOT EXISTS public.user_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  folder_name TEXT NOT NULL,
  upload_path TEXT NOT NULL,
  file_count INTEGER DEFAULT 0,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create scan results table for processed dumps
CREATE TABLE IF NOT EXISTS public.scan_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id UUID NOT NULL REFERENCES public.user_uploads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  scan_type TEXT NOT NULL CHECK (scan_type IN ('triggers', 'webhooks', 'locations', 'webhook_deleter')),
  results JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles' 
    AND policyname = 'Users can view their own profile'
  ) THEN
    CREATE POLICY "Users can view their own profile" 
    ON public.profiles 
    FOR SELECT 
    USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles' 
    AND policyname = 'Users can update their own profile'
  ) THEN
    CREATE POLICY "Users can update their own profile" 
    ON public.profiles 
    FOR UPDATE 
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- RLS Policies for user_uploads
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_uploads' 
    AND policyname = 'Users can view their own uploads'
  ) THEN
    CREATE POLICY "Users can view their own uploads" 
    ON public.user_uploads 
    FOR SELECT 
    USING (user_id = (SELECT user_id FROM public.profiles WHERE user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_uploads' 
    AND policyname = 'Users can insert their own uploads'
  ) THEN
    CREATE POLICY "Users can insert their own uploads" 
    ON public.user_uploads 
    FOR INSERT 
    WITH CHECK (user_id = (SELECT user_id FROM public.profiles WHERE user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_uploads' 
    AND policyname = 'Users can delete their own uploads'
  ) THEN
    CREATE POLICY "Users can delete their own uploads" 
    ON public.user_uploads 
    FOR DELETE 
    USING (user_id = (SELECT user_id FROM public.profiles WHERE user_id = auth.uid()));
  END IF;
END $$;

-- RLS Policies for scan_results
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'scan_results' 
    AND policyname = 'Users can view their own scan results'
  ) THEN
    CREATE POLICY "Users can view their own scan results" 
    ON public.scan_results 
    FOR SELECT 
    USING (user_id = (SELECT user_id FROM public.profiles WHERE user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'scan_results' 
    AND policyname = 'Users can insert their own scan results'
  ) THEN
    CREATE POLICY "Users can insert their own scan results" 
    ON public.scan_results 
    FOR INSERT 
    WITH CHECK (user_id = (SELECT user_id FROM public.profiles WHERE user_id = auth.uid()));
  END IF;
END $$;

-- RLS Policies for license_keys (admin only for now)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'license_keys' 
    AND policyname = 'Only service role can manage license keys'
  ) THEN
    CREATE POLICY "Only service role can manage license keys" 
    ON public.license_keys 
    FOR ALL
    USING (false);
  END IF;
END $$;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function removed - profile creation handled by frontend

-- Trigger for new user signup (disabled - handled by frontend)
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_signup();

-- IP Locking Functions
-- Create function to get client IP address
CREATE OR REPLACE FUNCTION public.get_client_ip()
RETURNS TEXT AS $$
DECLARE
  client_ip TEXT;
BEGIN
  -- Try to get IP from various headers (in order of preference)
  client_ip := COALESCE(
    current_setting('request.headers.x-forwarded-for', true),
    current_setting('request.headers.x-real-ip', true),
    current_setting('request.headers.cf-connecting-ip', true),
    current_setting('request.headers.x-client-ip', true),
    current_setting('request.headers.x-original-forwarded-for', true),
    current_setting('request.headers.true-client-ip', true),
    current_setting('request.headers.x-cluster-client-ip', true),
    current_setting('request.headers.x-forwarded', true),
    current_setting('request.headers.forwarded-for', true),
    current_setting('request.headers.forwarded', true)
  );
  
  -- If we got a comma-separated list (from load balancers), take the first one
  IF client_ip IS NOT NULL AND position(',' in client_ip) > 0 THEN
    client_ip := trim(split_part(client_ip, ',', 1));
  END IF;
  
  -- Clean up the IP (remove any whitespace)
  IF client_ip IS NOT NULL THEN
    client_ip := trim(client_ip);
  END IF;
  
  -- Return the IP or a fallback
  RETURN COALESCE(client_ip, '127.0.0.1');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check if IP is locked
CREATE OR REPLACE FUNCTION public.check_ip_lock(user_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
  profile_record RECORD;
  current_ip TEXT;
BEGIN
  -- Get current IP
  current_ip := public.get_client_ip();
  
  -- Get profile with IP lock info
  SELECT locked_ip, ip_lock_enabled, last_ip
  INTO profile_record
  FROM public.profiles
  WHERE user_id = user_id_param;
  
  -- If no profile found, allow access (shouldn't happen)
  IF NOT FOUND THEN
    RETURN true;
  END IF;
  
  -- If IP lock is disabled, allow access
  IF NOT profile_record.ip_lock_enabled THEN
    RETURN true;
  END IF;
  
  -- If no locked IP is set, allow access and update with current IP
  IF profile_record.locked_ip IS NULL THEN
    UPDATE public.profiles
    SET locked_ip = current_ip, last_ip = current_ip, ip_updated_at = now()
    WHERE user_id = user_id_param;
    RETURN true;
  END IF;
  
  -- Check if current IP matches locked IP
  RETURN profile_record.locked_ip = current_ip;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to reset IP lock (for Discord bot)
CREATE OR REPLACE FUNCTION public.reset_ip_lock(target_user_id UUID, admin_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Reset the IP lock (no admin check needed for Discord bot)
  UPDATE public.profiles
  SET locked_ip = NULL, last_ip = NULL, ip_updated_at = now()
  WHERE user_id = target_user_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to update user IP on login
CREATE OR REPLACE FUNCTION public.update_user_ip(user_id_param UUID)
RETURNS VOID AS $$
DECLARE
  current_ip TEXT;
  profile_record RECORD;
BEGIN
  -- Get current IP
  current_ip := public.get_client_ip();
  
  -- Get current profile
  SELECT locked_ip, ip_lock_enabled
  INTO profile_record
  FROM public.profiles
  WHERE user_id = user_id_param;
  
  -- If IP lock is enabled and locked IP is set, check if it matches
  IF profile_record.ip_lock_enabled AND profile_record.locked_ip IS NOT NULL THEN
    IF profile_record.locked_ip != current_ip THEN
      RAISE EXCEPTION 'IP address mismatch. Please contact an administrator to reset your IP lock.';
    END IF;
  END IF;
  
  -- Update the last IP and timestamp
  UPDATE public.profiles
  SET last_ip = current_ip, ip_updated_at = now()
  WHERE user_id = user_id_param;
  
  -- If no locked IP is set, set it to current IP
  IF profile_record.locked_ip IS NULL THEN
    UPDATE public.profiles
    SET locked_ip = current_ip
    WHERE user_id = user_id_param;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update profiles RLS to include IP lock check
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" 
ON public.profiles 
FOR SELECT 
USING (user_id = auth.uid() AND public.check_ip_lock(auth.uid()));