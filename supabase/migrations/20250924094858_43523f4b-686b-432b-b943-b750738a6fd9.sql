-- Create user profiles table with license key validation
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  license_key TEXT NOT NULL,
  license_type TEXT NOT NULL CHECK (license_type IN ('1_week', '1_month', 'lifetime')),
  license_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create valid license keys table
CREATE TABLE public.license_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  license_key TEXT NOT NULL UNIQUE,
  license_type TEXT NOT NULL CHECK (license_type IN ('1_week', '1_month', 'lifetime')),
  is_used BOOLEAN NOT NULL DEFAULT false,
  used_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  used_at TIMESTAMP WITH TIME ZONE
);

-- Create user uploads table for dump files
CREATE TABLE public.user_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  folder_name TEXT NOT NULL,
  upload_path TEXT NOT NULL,
  file_count INTEGER DEFAULT 0,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create scan results table for processed dumps
CREATE TABLE public.scan_results (
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
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

-- RLS Policies for user_uploads
CREATE POLICY "Users can view their own uploads" 
ON public.user_uploads 
FOR SELECT 
USING (user_id = (SELECT user_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert their own uploads" 
ON public.user_uploads 
FOR INSERT 
WITH CHECK (user_id = (SELECT user_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete their own uploads" 
ON public.user_uploads 
FOR DELETE 
USING (user_id = (SELECT user_id FROM public.profiles WHERE user_id = auth.uid()));

-- RLS Policies for scan_results
CREATE POLICY "Users can view their own scan results" 
ON public.scan_results 
FOR SELECT 
USING (user_id = (SELECT user_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert their own scan results" 
ON public.scan_results 
FOR INSERT 
WITH CHECK (user_id = (SELECT user_id FROM public.profiles WHERE user_id = auth.uid()));

-- RLS Policies for license_keys (admin only for now)
CREATE POLICY "Only service role can manage license keys" 
ON public.license_keys 
FOR ALL
USING (false);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to handle new user registration with license validation
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  license_rec RECORD;
  license_duration INTERVAL;
BEGIN
  -- Check if license key exists and is not used
  SELECT * INTO license_rec 
  FROM public.license_keys 
  WHERE license_key = NEW.raw_user_meta_data ->> 'license_key' 
  AND is_used = false;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or already used license key';
  END IF;
  
  -- Calculate license expiration
  CASE license_rec.license_type
    WHEN '1_week' THEN license_duration := INTERVAL '7 days';
    WHEN '1_month' THEN license_duration := INTERVAL '30 days';
    WHEN 'lifetime' THEN license_duration := NULL;
  END CASE;
  
  -- Insert profile
  INSERT INTO public.profiles (
    user_id, 
    username, 
    license_key, 
    license_type,
    license_expires_at
  ) VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'username',
    license_rec.license_key,
    license_rec.license_type,
    CASE WHEN license_duration IS NOT NULL THEN now() + license_duration ELSE NULL END
  );
  
  -- Mark license key as used
  UPDATE public.license_keys 
  SET is_used = true, used_by = NEW.id, used_at = now()
  WHERE license_key = license_rec.license_key;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_signup();