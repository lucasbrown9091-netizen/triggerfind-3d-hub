-- Add IP locking functionality to profiles table
-- This migration adds IP address tracking and locking to user profiles

-- Add IP locking columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS locked_ip TEXT,
ADD COLUMN IF NOT EXISTS ip_lock_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS last_ip TEXT,
ADD COLUMN IF NOT EXISTS ip_updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create admin profiles table for IP management
CREATE TABLE IF NOT EXISTS public.admin_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on admin_profiles
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

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

-- Create function to reset IP lock (admin only)
CREATE OR REPLACE FUNCTION public.reset_ip_lock(target_user_id UUID, admin_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  -- Check if the requesting user is an admin
  SELECT admin_profiles.is_admin INTO is_admin
  FROM public.admin_profiles
  WHERE user_id = admin_user_id;
  
  -- If not admin, deny access
  IF NOT FOUND OR NOT is_admin THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Reset the IP lock
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

-- RLS Policies for admin_profiles
CREATE POLICY "Admins can view all admin profiles" 
ON public.admin_profiles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_profiles 
    WHERE user_id = auth.uid() AND is_admin = true
  )
);

CREATE POLICY "Admins can insert admin profiles" 
ON public.admin_profiles 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_profiles 
    WHERE user_id = auth.uid() AND is_admin = true
  )
);

-- Update profiles RLS to include IP lock check
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" 
ON public.profiles 
FOR SELECT 
USING (user_id = auth.uid() AND public.check_ip_lock(auth.uid()));

-- Add policy for admins to view all profiles
CREATE POLICY "admins_can_view_all_profiles" 
ON public.profiles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_profiles 
    WHERE user_id = auth.uid() AND is_admin = true
  )
);

-- Add policy for admins to update profiles (for IP reset)
CREATE POLICY "admins_can_update_profiles" 
ON public.profiles 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_profiles 
    WHERE user_id = auth.uid() AND is_admin = true
  )
);

-- Create trigger to update IP on successful login
CREATE OR REPLACE FUNCTION public.handle_successful_login()
RETURNS TRIGGER AS $$
BEGIN
  -- Update user IP on successful login
  PERFORM public.update_user_ip(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: This trigger would need to be created on the auth.users table
-- but since we can't modify auth schema directly, we'll handle this in the application layer

-- Insert a default admin user (you'll need to replace this with actual admin user ID)
-- This is just a placeholder - you should replace 'your-admin-user-id' with the actual admin user ID
-- INSERT INTO public.admin_profiles (user_id, is_admin) 
-- VALUES ('your-admin-user-id', true) 
-- ON CONFLICT (user_id) DO UPDATE SET is_admin = true;
