-- IP Locking functionality for user profiles
-- This migration adds IP address tracking and locking to user profiles

-- Add IP locking columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS locked_ip TEXT,
ADD COLUMN IF NOT EXISTS ip_lock_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS last_ip TEXT,
ADD COLUMN IF NOT EXISTS ip_updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create function to get client IP address
CREATE OR REPLACE FUNCTION public.get_client_ip()
RETURNS TEXT AS $$
BEGIN
  -- Try to get IP from various headers (in order of preference)
  RETURN COALESCE(
    current_setting('request.headers.x-forwarded-for', true),
    current_setting('request.headers.x-real-ip', true),
    current_setting('request.headers.cf-connecting-ip', true),
    current_setting('request.headers.x-client-ip', true),
    '127.0.0.1' -- fallback for local development
  );
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

-- Note: This trigger would need to be created on the auth.users table
-- but since we can't modify auth schema directly, we'll handle this in the application layer
