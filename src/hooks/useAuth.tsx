import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  signUp: (username: string, password: string, licenseKey: string) => Promise<{ error: any }>;
  signIn: (username: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (username: string, password: string, licenseKey: string) => {
    try {
      // Defer license validation to post-auth if anon is blocked by RLS
      const normalizedLicense = licenseKey.trim();

      const generatedEmail = `${username}@users.local`;
      const { data: signUpData, error: authError } = await supabase.auth.signUp({
        email: generatedEmail,
        password,
        options: { data: { username, license_key: normalizedLicense } },
      });
      if (authError || !signUpData.user) {
        const raw = (authError?.message || '').toLowerCase();
        const isDuplicate = raw.includes('duplicate') || raw.includes('already registered') || raw.includes('users_email_key');
        const message = isDuplicate ? 'Username is already taken.' : (authError?.message || 'Unable to create user');
        toast({ title: "Sign Up Failed", description: message, variant: "destructive" });
        return { error: authError || new Error(message) };
      }

      // Validate license post-auth
      const { data: keyData, error: keyErr } = await supabase
        .from('license_keys')
        .select('id, is_used, license_type')
        .eq('license_key', normalizedLicense)
        .limit(1)
        .maybeSingle();
      if (keyErr || !keyData || keyData.is_used) {
        await supabase.auth.signOut();
        toast({ title: "Invalid license key", description: "Please check your license key and try again.", variant: "destructive" });
        return { error: keyErr || new Error('Invalid license key') };
      }

      // Create profile row
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: signUpData.user.id,
          username,
          license_key: normalizedLicense,
          license_type: keyData.license_type,
        });
      if (profileError) {
        const message = profileError.message?.toLowerCase().includes('duplicate') ? 'Username is already taken.' : profileError.message;
        toast({ title: "Profile creation failed", description: message, variant: "destructive" });
        return { error: profileError };
      }

      // Mark license as used
      const { error: updateKeyError } = await supabase
        .from('license_keys')
        .update({ is_used: true, used_by: signUpData.user.id, used_at: new Date().toISOString() })
        .eq('id', keyData.id);
      if (updateKeyError) {
        toast({ title: "License update failed", description: updateKeyError.message, variant: "destructive" });
        return { error: updateKeyError };
      }

      toast({ title: "Account Created", description: "Your account has been created successfully." });
      return { error: null };
    } catch (error) {
      console.error("Sign up error:", error);
      return { error };
    }
  };

  const signIn = async (username: string, password: string) => {
    try {
      const generatedEmail = `${username}@users.local`;
      const { error } = await supabase.auth.signInWithPassword({ email: generatedEmail, password });
      if (error) {
        toast({ title: "Sign In Failed", description: error.message, variant: "destructive" });
      }
      return { error };
    } catch (error) {
      console.error("Sign in error:", error);
      toast({ title: "Sign In Failed", description: "An unexpected error occurred", variant: "destructive" });
      return { error };
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const value = { user, session, signUp, signIn, signOut, loading };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}