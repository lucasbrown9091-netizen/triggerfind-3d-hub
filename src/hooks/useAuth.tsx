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
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (username: string, password: string, licenseKey: string) => {
    try {
      // 1) Validate license key before creating auth user (allowed for anon)
      const { data: keyRow, error: keyFetchError } = await supabase
        .from('license_keys')
        .select('*')
        .eq('license_key', licenseKey)
        .eq('is_used', false)
        .single();

      if (keyFetchError || !keyRow) {
        toast({
          title: "Invalid license key",
          description: "Please check your license key and try again.",
          variant: "destructive",
        });
        return { error: keyFetchError || new Error('Invalid license key') };
      }

      // 2) Create auth user with deterministic synthetic email from username
      const generatedEmail = `${username}@users.local`;

      const { data: signUpData, error: authError } = await supabase.auth.signUp({
        email: generatedEmail,
        password,
        options: {
          data: {
            username,
            license_key: licenseKey,
          },
        },
      });

      if (authError || !signUpData.user) {
        const message = authError?.message || 'Unable to create user';
        // Common cause: duplicate synthetic email when username already exists
        toast({
          title: "Sign Up Failed",
          description: message,
          variant: "destructive",
        });
        return { error: authError || new Error(message) };
      }

      // 3) Create profile row (RLS should allow the authenticated user to create their own profile)
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: signUpData.user.id,
          username,
          license_key: licenseKey,
          license_type: keyRow.license_type,
        });

      if (profileError) {
        const message = profileError.message?.toLowerCase().includes('duplicate')
          ? 'Username is already taken.'
          : profileError.message;
        toast({
          title: "Profile creation failed",
          description: message,
          variant: "destructive",
        });
        return { error: profileError };
      }

      // 4) Mark license as used only after successful profile creation
      const { error: updateKeyError } = await supabase
        .from('license_keys')
        .update({ is_used: true, used_by: signUpData.user.id, used_at: new Date().toISOString() })
        .eq('id', keyRow.id);

      if (updateKeyError) {
        toast({
          title: "License update failed",
          description: updateKeyError.message,
          variant: "destructive",
        });
        return { error: updateKeyError };
      }

      toast({
        title: "Account Created",
        description: "Your account has been created successfully.",
      });

      return { error: null };
    } catch (error) {
      console.error("Sign up error:", error);
      return { error };
    }
  };

  const signIn = async (username: string, password: string) => {
    try {
      // Generate the same synthetic email used at signup
      const generatedEmail = `${username}@users.local`;

      const { error } = await supabase.auth.signInWithPassword({
        email: generatedEmail,
        password,
      });

      if (error) {
        toast({
          title: "Sign In Failed",
          description: error.message,
          variant: "destructive",
        });
      }

      return { error };
    } catch (error) {
      console.error("Sign in error:", error);
      toast({
        title: "Sign In Failed",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
      return { error };
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const value = {
    user,
    session,
    signUp,
    signIn,
    signOut,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}