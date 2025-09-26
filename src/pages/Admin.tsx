import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Shield, RefreshCw, Search, User, Lock, Unlock } from "lucide-react";

interface UserProfile {
  id: string;
  user_id: string;
  username: string;
  locked_ip: string | null;
  ip_lock_enabled: boolean;
  last_ip: string | null;
  ip_updated_at: string | null;
  created_at: string;
}

export default function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);

  useEffect(() => {
    checkAdminStatus();
    fetchProfiles();
  }, []);

  const checkAdminStatus = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('admin_profiles')
        .select('is_admin')
        .eq('user_id', user.id)
        .single();
      
      if (error) {
        console.error("Admin check error:", error);
        return;
      }
      
      setIsAdmin(data?.is_admin || false);
    } catch (error) {
      console.error("Admin check error:", error);
    }
  };

  const fetchProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error("Error fetching profiles:", error);
        toast({ title: "Error", description: "Failed to fetch user profiles", variant: "destructive" });
        return;
      }
      
      setProfiles(data || []);
    } catch (error) {
      console.error("Error fetching profiles:", error);
      toast({ title: "Error", description: "Failed to fetch user profiles", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const resetUserIP = async (userId: string, username: string) => {
    if (!user) return;
    
    setResetting(userId);
    try {
      const { error } = await supabase.rpc('reset_ip_lock', {
        target_user_id: userId,
        admin_user_id: user.id
      });
      
      if (error) {
        console.error("Reset IP error:", error);
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
      
      toast({ title: "Success", description: `IP lock reset for ${username}` });
      fetchProfiles(); // Refresh the list
    } catch (error) {
      console.error("Reset IP error:", error);
      toast({ title: "Error", description: "Failed to reset IP lock", variant: "destructive" });
    } finally {
      setResetting(null);
    }
  };

  const toggleIPLock = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ ip_lock_enabled: !currentStatus })
        .eq('user_id', userId);
      
      if (error) {
        console.error("Toggle IP lock error:", error);
        toast({ title: "Error", description: "Failed to toggle IP lock", variant: "destructive" });
        return;
      }
      
      toast({ title: "Success", description: `IP lock ${!currentStatus ? 'enabled' : 'disabled'}` });
      fetchProfiles(); // Refresh the list
    } catch (error) {
      console.error("Toggle IP lock error:", error);
      toast({ title: "Error", description: "Failed to toggle IP lock", variant: "destructive" });
    }
  };

  const filteredProfiles = profiles.filter(profile =>
    profile.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center bg-background">
        <Card className="p-8 text-center">
          <Shield className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">You need administrator privileges to access this page.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-16 bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Admin Panel</h1>
          <p className="text-muted-foreground">Manage user IP locks and permissions</p>
        </div>

        <Card className="p-6">
          <div className="mb-6">
            <Label htmlFor="search" className="text-sm font-medium">Search Users</Label>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Search by username..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p>Loading user profiles...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Locked IP</TableHead>
                    <TableHead>Last IP</TableHead>
                    <TableHead>IP Lock Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProfiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          {profile.username}
                        </div>
                      </TableCell>
                      <TableCell>
                        {profile.locked_ip ? (
                          <Badge variant="outline">{profile.locked_ip}</Badge>
                        ) : (
                          <span className="text-muted-foreground">Not set</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {profile.last_ip ? (
                          <Badge variant="secondary">{profile.last_ip}</Badge>
                        ) : (
                          <span className="text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={profile.ip_lock_enabled ? "default" : "secondary"}>
                          {profile.ip_lock_enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {profile.ip_updated_at ? (
                          new Date(profile.ip_updated_at).toLocaleString()
                        ) : (
                          <span className="text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toggleIPLock(profile.user_id, profile.ip_lock_enabled)}
                          >
                            {profile.ip_lock_enabled ? (
                              <>
                                <Unlock className="h-4 w-4 mr-1" />
                                Disable
                              </>
                            ) : (
                              <>
                                <Lock className="h-4 w-4 mr-1" />
                                Enable
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => resetUserIP(profile.user_id, profile.username)}
                            disabled={resetting === profile.user_id}
                          >
                            {resetting === profile.user_id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <RefreshCw className="h-4 w-4 mr-1" />
                                Reset IP
                              </>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
