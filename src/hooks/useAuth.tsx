import { createContext, useContext, useEffect, useState, ReactNode } from "react";
// Switched to custom API with JWT
import { useToast } from "@/hooks/use-toast";

interface AuthContextType {
  user: { id: string; username: string } | null;
  session: { token: string } | null;
  signUp: (username: string, password: string, licenseKey: string) => Promise<{ error: any }>;
  signIn: (username: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const [session, setSession] = useState<{ token: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const token = localStorage.getItem('jwt');
    const username = localStorage.getItem('username');
    const userId = localStorage.getItem('userId');
    if (token && username && userId) {
      setSession({ token });
      setUser({ id: userId, username });
    }
    setLoading(false);
  }, []);

  const signUp = async (username: string, password: string, licenseKey: string) => {
    try {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/auth/signup`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, licenseKey })
        })
        const data = await res.json()
        if (!res.ok) {
          toast({ title: 'Sign Up Failed', description: data.error || 'Signup failed', variant: 'destructive' })
          return { error: new Error(data.error || 'Signup failed') }
        }
        localStorage.setItem('jwt', data.token)
        localStorage.setItem('username', data.user.username)
        localStorage.setItem('userId', data.user.id)
        setSession({ token: data.token })
        setUser(data.user)
        toast({ title: 'Account Created', description: 'Your account has been created successfully.' })
        return { error: null }
      } catch (e) {
        toast({ title: 'Sign Up Failed', description: 'Network error', variant: 'destructive' })
        return { error: e }
      }
    } catch (error) {
      console.error("Sign up error:", error);
      return { error };
    }
  };

  const signIn = async (username: string, password: string) => {
    try {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/auth/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        })
        const data = await res.json()
        if (!res.ok) {
          toast({ title: 'Sign In Failed', description: data.error || 'Invalid credentials', variant: 'destructive' })
          return { error: new Error(data.error || 'Invalid credentials') }
        }
        localStorage.setItem('jwt', data.token)
        localStorage.setItem('username', data.user.username)
        localStorage.setItem('userId', data.user.id)
        setSession({ token: data.token })
        setUser(data.user)
        return { error: null }
      } catch (e) {
        toast({ title: 'Sign In Failed', description: 'Network error', variant: 'destructive' })
        return { error: e }
      }
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
    localStorage.removeItem('jwt')
    localStorage.removeItem('username')
    localStorage.removeItem('userId')
    setSession(null)
    setUser(null)
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