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
      // Input validation
      if (!username || !password || !licenseKey) {
        toast({ title: "Validation Error", description: "All fields are required.", variant: "destructive" });
        return { error: new Error("All fields are required") };
      }

      if (password.length < 6) {
        toast({ title: "Validation Error", description: "Password must be at least 6 characters long.", variant: "destructive" });
        return { error: new Error("Password too short") };
      }

      const normalizedLicense = licenseKey.trim();
      const generatedEmail = `${username}@users.local`;

      console.log("Attempting signup with:", { email: generatedEmail, username });

      // First, validate the license key before creating the user
      console.log("Validating license key:", normalizedLicense);
      
      // Test if we can access the license_keys table at all
      const { data: testData, error: testErr, count } = await supabase
        .from('license_keys')
        .select('*', { count: 'exact' })
        .limit(1);
      
      console.log("License table access test:", { testData, testErr, count });
      
      const { data: keyData, error: keyErr } = await supabase
        .from('license_keys')
        .select('id, is_used, license_key')
        .eq('license_key', normalizedLicense)
        .limit(1)
        .maybeSingle();

      console.log("License query result:", { keyData, keyErr });

      if (keyErr) {
        console.error("License validation error:", keyErr);
        toast({ title: "License validation failed", description: keyErr.message, variant: "destructive" });
        return { error: keyErr };
      }

      if (!keyData) {
        console.log("License key not found in database");
        toast({ title: "Invalid license key", description: "License key not found.", variant: "destructive" });
        return { error: new Error('License key not found') };
      }

      if (keyData.is_used) {
        console.log("License key already used:", keyData);
        toast({ title: "License key already used", description: "This license key has already been used.", variant: "destructive" });
        return { error: new Error('License key already used') };
      }

      console.log("License key validation successful:", keyData);

      // Now attempt to create the user
      const { data: signUpData, error: authError } = await supabase.auth.signUp({
        email: generatedEmail,
        password,
        options: { 
          data: { 
            username, 
            license_key: normalizedLicense
          } 
        },
      });

      if (authError) {
        console.error("Auth error:", authError);
        const raw = (authError?.message || '').toLowerCase();
        const isDuplicate = raw.includes('duplicate') || raw.includes('already registered') || raw.includes('users_email_key');
        const message = isDuplicate ? 'Username is already taken.' : authError.message;
        toast({ title: "Sign Up Failed", description: message, variant: "destructive" });
        return { error: authError };
      }

      if (!signUpData.user) {
        console.error("No user data returned from signup");
        toast({ title: "Sign Up Failed", description: "Failed to create user account.", variant: "destructive" });
        return { error: new Error("Failed to create user account") };
      }

      console.log("User created successfully:", signUpData.user.id);

      // Create or update profile row, and return the row to get its id (for license_keys.used_by FK)
      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .upsert({
          user_id: signUpData.user.id,
          username,
          license_key: normalizedLicense,
          ip_lock_enabled: true,
        } as any, { onConflict: 'user_id' })
        .select()
        .single();

      if (profileError) {
        console.error("Profile creation error:", profileError);
        await supabase.auth.signOut();
        const message = profileError.message?.toLowerCase().includes('duplicate') ? 'Username is already taken.' : profileError.message;
        toast({ title: "Profile creation failed", description: message, variant: "destructive" });
        return { error: profileError };
      }

      // Mark license as used (license_keys.used_by references profiles.id)
      const { error: updateKeyError } = await supabase
        .from('license_keys')
        .update({ 
          is_used: true, 
          used_by: profileRow?.id ?? null, 
          used_at: new Date().toISOString() 
        })
        .eq('id', keyData.id);

      if (updateKeyError) {
        console.error("License update error:", updateKeyError);
        toast({ title: "License update failed", description: updateKeyError.message, variant: "destructive" });
        return { error: updateKeyError };
      }

      // Set initial IP for the new user
      try {
        const { error: ipError } = await supabase.rpc('update_user_ip', {
          user_id_param: signUpData.user.id
        });
        
        if (ipError) {
          console.error("Initial IP setting error:", ipError);
          // Don't fail signup for IP errors, just log it
        }
      } catch (ipError) {
        console.error("Initial IP setting error:", ipError);
        // Don't fail signup for IP errors, just log it
      }

      toast({ title: "Account Created", description: "Your account has been created successfully." });
      return { error: null };
    } catch (error) {
      console.error("Unexpected sign up error:", error);
      toast({ title: "Sign Up Failed", description: "An unexpected error occurred during signup.", variant: "destructive" });
      return { error };
    }
  };

  const signIn = async (username: string, password: string) => {
    try {
      if (!username || !password) {
        toast({ title: "Validation Error", description: "Username and password are required.", variant: "destructive" });
        return { error: new Error("Username and password are required") };
      }

      const generatedEmail = `${username}@users.local`;
      console.log("Attempting signin with:", { email: generatedEmail });
      
      const { data: signInData, error } = await supabase.auth.signInWithPassword({ 
        email: generatedEmail, 
        password 
      });
      
      if (error) {
        console.error("Sign in error:", error);
        toast({ title: "Sign In Failed", description: error.message, variant: "destructive" });
        return { error };
      }

      // If sign in successful, update user IP
      if (signInData.user) {
        try {
          const { error: ipError } = await supabase.rpc('update_user_ip', {
            user_id_param: signInData.user.id
          });
          
          if (ipError) {
            console.error("IP update error:", ipError);
            // If IP lock fails, sign out the user
            await supabase.auth.signOut();
            toast({ 
              title: "Access Denied", 
              description: "IP address mismatch. Please contact an administrator to reset your IP lock.", 
              variant: "destructive" 
            });
            return { error: new Error("IP address mismatch") };
          }
        } catch (ipError) {
          console.error("IP update error:", ipError);
          await supabase.auth.signOut();
          toast({ 
            title: "Access Denied", 
            description: "IP address mismatch. Please contact an administrator to reset your IP lock.", 
            variant: "destructive" 
          });
          return { error: new Error("IP address mismatch") };
        }
      }
      
      return { error: null };
    } catch (error) {
      console.error("Unexpected sign in error:", error);
      toast({ title: "Sign In Failed", description: "An unexpected error occurred", variant: "destructive" });
      return { error };
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Sign out error:", error);
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