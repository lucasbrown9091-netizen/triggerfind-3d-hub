import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Globe, Trash2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Upload {
  id: string;
  folder_name: string;
  file_count: number;
  uploaded_at: string;
}

interface ScanResult {
  id: string;
  scan_type: string;
  results: any;
  created_at: string;
}

export default function Dashboard() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [selectedUpload, setSelectedUpload] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("triggers");
  const [searchQuery, setSearchQuery] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [deletingWebhook, setDeletingWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<"idle"|"success"|"error">("idle");
  const [webhookError, setWebhookError] = useState("");

  useEffect(() => {
    if (user) {
      fetchUploads();
    }
  }, [user]);

  useEffect(() => {
    if (selectedUpload) {
      fetchScanResults(selectedUpload);
    }
  }, [selectedUpload]);

  const fetchUploads = async () => {
    const { data, error } = await supabase
      .from('user_uploads')
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch uploads",
        variant: "destructive",
      });
    } else {
      setUploads(data || []);
      if (data && data.length > 0 && !selectedUpload) {
        setSelectedUpload(data[0].id);
      }
    }
  };

  const fetchScanResults = async (uploadId: string) => {
    const { data, error } = await supabase
      .from('scan_results')
      .select('*')
      .eq('upload_id', uploadId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching scan results:", error);
      setScanResults([]);
    } else {
      setScanResults(data || []);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    
    try {
      // Get current user's profile to get user_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) {
        throw new Error('User profile not found');
      }

      // Create upload record
      const folderName = `dump_${Date.now()}`;
      const { data, error } = await supabase
        .from('user_uploads')
        .insert({
          user_id: profile.user_id,
          folder_name: folderName,
          upload_path: `/uploads/${folderName}`,
          file_count: files.length,
        })
        .select()
        .single();

      if (error) throw error;

      // Read files and run detections, capturing file paths
      const textFileExt = /\.(lua|js|ts|json|cfg|xml|yml|yaml|ini|md|log|txt|py|cs|cpp|c|java|rb|go)$/i;
      const maxBytes = 2_000_000; // 2MB per file
      const filesArray = Array.from(files);
      const perFile: { path: string; text: string }[] = [];
      for (const file of filesArray) {
        if (textFileExt.test(file.name)) {
          const blob = file.slice(0, maxBytes);
          const text = await blob.text();
          perFile.push({ path: (file as any).webkitRelativePath || file.name, text });
        }
      }
      const allText = perFile.map(f => `\n/* FILE: ${f.path} */\n${f.text}`).join("\n\n");

      // Patterns
      const triggerNameRegex = /\bTrigger(Server)?Event\s*\(\s*(["'`])([^"'`]+)\2/gi;
      const triggerArgsRegex = /\bTrigger(Server)?Event\s*\(([^\)]*)\)/gi;
      // Match full call expressions, including across newlines inside arguments
      const eventCallRegex = /\bTrigger(Server)?Event\s*\([\s\S]*?\)/gi;
      const lineServerRegex = /^\s*TriggerServerEvent\s*\([^\n]*\)/i;
      const lineClientRegex = /^\s*TriggerEvent\s*\([^\n]*\)/i;
      const autoKeywords = [
        'PugFishToggleItem',
        'ak4y-dailyWheel:giveItem',
        'Pug:server:RobberyGiveItem',
        'lation_mining:sellItem',
        '17mov_postman:collectLetter',
        'jg-mechanic:server:buy-item',
        'pug-fishing:Server:ToggleItem',
        'jim-mining-main:server:toggleItem',
        'brutal_shop_robbery:server:AddItem',
        'angelicxs-CivilianJobs:Server:Payment',
        'mc9-taco:server:addItem',
        'xmmx_letscookplus:server:toggleItem',
        'bobi-selldrugs:server:RetrieveDrugs',
        'jim-mechanic:server:toggleItem',
        'jim-consumables:server:toggleItem',
        'CL-PoliceGarageV2:RefundRent',
        'brutal_hunting:server:AddItem',
        'cdn-fuel:station:server:Withdraw',
        'ak47_drugmanager:pickedupitem',
        'angelicxs-CivilianJobs:Server:GainItem',
        't1ger_lib:server:addItem',
        'CPT_Raids:Server:GiveItem',
        'mc9-coretto:server:addItem'
      ];
      const argKeywords = ['amount','item','itemname','paytype'];
      const vector3Regex = /\bvector3\s*\([^\)]*\)/gi;
      const vector2Regex = /\bvector2\s*\([^\)]*\)/gi;
      const vector4Regex = /\bvector4\s*\([^\)]*\)/gi;
      const webhookRegex = /https:\/\/discord\.com\/api\/webhooks\/[\w\-\/]+/gi;

      // Detections with file paths
      type Found = { file: string; text: string };
      const triggerLinesServer: Found[] = [];
      const triggerLinesClient: Found[] = [];
      const triggerAutoByKeywords: Found[] = [];
      const triggerByArgKeywords: Found[] = [];
      const v2: Found[] = [];
      const v3: Found[] = [];
      const v4: Found[] = [];
      const webhooks: Found[] = [];

      // Collect per-file to attach file path
      for (const { path, text } of perFile) {
        // event-call based
        let c: RegExpExecArray | null;
        while ((c = eventCallRegex.exec(text)) !== null) {
          const call = c[0].replace(/\s+/g, ' ').trim().slice(0, 400);
          if (/^\s*TriggerServerEvent/i.test(call)) triggerLinesServer.push({ file: path, text: call });
          else if (/^\s*TriggerEvent/i.test(call)) triggerLinesClient.push({ file: path, text: call });
        }
        // line-based keywords
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          const lower = trimmed.toLowerCase();
          if (autoKeywords.some(k => lower.includes(k.toLowerCase()))) {
            triggerAutoByKeywords.push({ file: path, text: trimmed.slice(0, 400) });
          }
          if ((/^\s*triggerserverevent|^\s*triggerevent/i).test(trimmed) && argKeywords.some(k => lower.includes(k))) {
            triggerByArgKeywords.push({ file: path, text: trimmed.slice(0, 400) });
          }
        }
        // vectors/webhooks
        const collect = (re: RegExp, into: Found[]) => {
          let r: RegExpExecArray | null;
          while ((r = re.exec(text)) !== null) into.push({ file: path, text: r[0].trim().slice(0, 200) });
        };
        collect(vector2Regex, v2);
        collect(vector3Regex, v3);
        collect(vector4Regex, v4);
        collect(webhookRegex, webhooks);
      }

      // Insert scan results
      const now = new Date().toISOString();
      // de-duplicate (by file+text)
      const uniqBy = (arr: Found[]) => {
        const seen = new Set<string>();
        const out: Found[] = [];
        for (const it of arr) {
          const key = `${it.file}|${it.text}`;
          if (!seen.has(key)) { seen.add(key); out.push(it); }
        }
        return out;
      };
      const inserts = [
        {
          scan_type: 'triggers',
          results: { parts: {
            TriggerServerEvent: uniqBy(triggerLinesServer).slice(0, 2000),
            TriggerEvent: uniqBy(triggerLinesClient).slice(0, 2000),
            AutoDetectedTriggers: uniqBy(triggerAutoByKeywords).slice(0, 2000),
            TriggersDetectedByArguments: uniqBy(triggerByArgKeywords).slice(0, 2000)
          },
          processed_at: now }
        },
        {
          scan_type: 'locations',
          results: { vector2: uniqBy(v2).slice(0, 1000), vector3: uniqBy(v3).slice(0, 1000), vector4: uniqBy(v4).slice(0, 1000), processed_at: now }
        },
        {
          scan_type: 'webhooks',
          results: { items: uniqBy(webhooks).slice(0, 1000), processed_at: now }
        },
        {
          scan_type: 'webhook_deleter',
          results: { hint: 'Use the deleter UI to remove Discord webhooks', processed_at: now }
        }
      ];

      for (const row of inserts) {
        await supabase.from('scan_results').insert({
          upload_id: data.id,
          user_id: profile.user_id,
          scan_type: row.scan_type,
          results: row.results
        });
      }

      toast({
        title: "Upload Successful",
        description: `${files.length} files uploaded and processed`,
      });

      fetchUploads();
      setSelectedUpload(data.id);
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen pt-16 flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const getResultsByType = (type: string) => {
    const raw = scanResults.find(result => result.scan_type === type)?.results || {};
    if (type === 'triggers') {
      const serverLines: {file:string;text:string}[] = raw.parts?.TriggerServerEvent || [];
      const clientLines: {file:string;text:string}[] = raw.parts?.TriggerEvent || [];
      const autoByKeywords: {file:string;text:string}[] = raw.parts?.AutoDetectedTriggers || [];
      const byArgKeywords: {file:string;text:string}[] = raw.parts?.TriggersDetectedByArguments || [];
      const join = (arr: {file:string;text:string}[]) => arr.map(x => `${x.file}\n${x.text}`);
      return {
        count: (serverLines.length + clientLines.length + autoByKeywords.length + byArgKeywords.length),
        items: [...join(serverLines), ...join(clientLines), ...join(autoByKeywords), ...join(byArgKeywords)]
      };
    }
    if (type === 'locations') {
      const v2: {file:string;text:string}[] = raw.vector2 || [];
      const v3: {file:string;text:string}[] = raw.vector3 || [];
      const v4: {file:string;text:string}[] = raw.vector4 || [];
      const join = (label: string, arr: {file:string;text:string}[]) => arr.map(x => `${x.file}\n${x.text}`);
      const items = [
        ...join('vector3', v3),
        ...join('vector2', v2),
        ...join('vector4', v4),
      ];
      return { count: items.length, items };
    }
    if (type === 'webhooks') {
      const items: {file:string;text:string}[] = raw.items || [];
      const joined = items.map(x => `${x.file}\n${x.text}`);
      return { count: joined.length, items: joined };
    }
    if (type === 'webhook_deleter') {
      return { count: 0, items: [] };
    }
    return { count: 0, items: [] };
  };

  const triggerResults = getResultsByType('triggers');
  const webhookResults = getResultsByType('webhooks');
  const locationResults = getResultsByType('locations');
  const deleterResults = getResultsByType('webhook_deleter');

  return (
    <div className="min-h-screen pt-16 bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            Customer{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Dashboard
            </span>
          </h1>
          <p className="text-muted-foreground">Upload and analyze your dump files</p>
        </div>

        {/* Upload Section */}
        <Card className="p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center">
              <Upload className="mr-2 h-5 w-5" />
              File Upload
            </h2>
            <Badge variant="outline">{uploads.length} total uploads</Badge>
          </div>
          
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <input
              type="file"
              multiple
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
              id="file-upload"
              {...({ webkitdirectory: "" } as any)}
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <div className="space-y-4">
                <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                <div>
                  <p className="text-lg font-medium">
                    {uploading ? "Uploading..." : "Upload Dump Folder"}
                  </p>
                  <p className="text-muted-foreground">
                    Select a folder containing your dump files
                  </p>
                </div>
                <Button disabled={uploading}>
                  {uploading ? "Processing..." : "Select Folder"}
                </Button>
              </div>
            </label>
          </div>
        </Card>

        {/* Upload History */}
        {uploads.length > 0 && (
          <Card className="p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Recent Uploads</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {uploads.map((upload) => (
                <Card
                  key={upload.id}
                  className={`p-4 transition-colors ${
                    selectedUpload === upload.id ? 'ring-2 ring-primary' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium truncate cursor-pointer" onClick={() => setSelectedUpload(upload.id)}>
                      {upload.folder_name}
                    </h3>
                    <Badge variant="outline">{upload.file_count} files</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {new Date(upload.uploaded_at).toLocaleDateString()}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={async () => {
                      const newName = prompt('Rename folder to:', upload.folder_name);
                      if (!newName) return;
                      const trimmed = newName.trim();
                      if (!trimmed || trimmed === upload.folder_name) return;
                      const { error } = await supabase
                        .from('user_uploads')
                        .update({ folder_name: trimmed })
                        .eq('id', upload.id);
                      if (error) {
                        toast({ title: 'Rename failed', description: error.message, variant: 'destructive' });
                      } else {
                        // Optimistic UI update
                        setUploads(prev => prev.map(u => u.id === upload.id ? { ...u, folder_name: trimmed } : u));
                        if (selectedUpload === upload.id) {
                          // no change needed to selection, but ensures re-render
                          setSelectedUpload(upload.id);
                        }
                        toast({ title: 'Renamed', description: 'Folder renamed successfully' });
                      }
                    }}>Rename</Button>
                    <Button size="sm" variant="destructive" onClick={async () => {
                      if (!confirm('Delete this upload and its results?')) return;
                      const { error: e1 } = await supabase
                        .from('scan_results')
                        .delete()
                        .eq('upload_id', upload.id);
                      if (e1) {
                        toast({ title: 'Delete failed', description: e1.message, variant: 'destructive' });
                        return;
                      }
                      const { error: e2 } = await supabase
                        .from('user_uploads')
                        .delete()
                        .eq('id', upload.id);
                      if (e2) {
                        toast({ title: 'Delete failed', description: e2.message, variant: 'destructive' });
                        return;
                      }
                      toast({ title: 'Deleted', description: 'Upload deleted' });
                      fetchUploads();
                      if (selectedUpload === upload.id) setSelectedUpload(null);
                    }}>Delete</Button>
                  </div>
                </Card>
              ))}
            </div>
          </Card>
        )}

        {/* Analysis Results */}
        {selectedUpload && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-6">Analysis Results</h2>
            
            <Tabs defaultValue="triggers" className="w-full" onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="triggers" className="flex items-center">
                  <Zap className="mr-2 h-4 w-4" />
                  Triggers
                </TabsTrigger>
                <TabsTrigger value="webhooks" className="flex items-center">
                  <Globe className="mr-2 h-4 w-4" />
                  Webhooks
                </TabsTrigger>
                <TabsTrigger value="locations" className="flex items-center">
                  <FileText className="mr-2 h-4 w-4" />
                  Locations
                </TabsTrigger>
                <TabsTrigger value="deleter" className="flex items-center">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Webhook Deleter
                </TabsTrigger>
              </TabsList>

              <TabsContent value="triggers" className="mt-6">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Detected Triggers</h3>
                    <Badge>{triggerResults.count} found</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input placeholder="Search triggers..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  </div>

                  {(() => {
                    const raw = scanResults.find(r => r.scan_type === 'triggers')?.results || {} as any;
                    const parts = raw.parts || {} as any;
                    const server = (parts.TriggerServerEvent || []) as {file:string;text:string}[];
                    const client = (parts.TriggerEvent || []) as {file:string;text:string}[];
                    const autoKW = (parts.AutoDetectedTriggers || []) as {file:string;text:string}[];
                    const argKW = (parts.TriggersDetectedByArguments || []) as {file:string;text:string}[];
                    const matches = (x: {file:string;text:string}) => (x.file + "\n" + x.text).toLowerCase().includes(searchQuery.toLowerCase());

                    return (
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card className="p-3">
                          <h4 className="font-semibold mb-2">TriggerServerEvent</h4>
                          <div className="h-96 overflow-auto space-y-2">
                            {server.filter(matches).map((x, idx) => (
                              <Card key={`srv-${idx}`} className="p-2">
                                <p className="text-[11px] text-muted-foreground mb-1 break-words">{x.file}</p>
                                <pre className="text-xs whitespace-pre-wrap break-words">{x.text}</pre>
                              </Card>
                            ))}
                            {server.length === 0 && <p className="text-muted-foreground">No server triggers</p>}
                          </div>
                        </Card>
                        <Card className="p-3">
                          <h4 className="font-semibold mb-2">TriggerEvent</h4>
                          <div className="h-96 overflow-auto space-y-2">
                            {client.filter(matches).map((x, idx) => (
                              <Card key={`cli-${idx}`} className="p-2">
                                <p className="text-[11px] text-muted-foreground mb-1 break-words">{x.file}</p>
                                <pre className="text-xs whitespace-pre-wrap break-words">{x.text}</pre>
                              </Card>
                            ))}
                            {client.length === 0 && <p className="text-muted-foreground">No client triggers</p>}
                          </div>
                        </Card>
                        <Card className="p-3">
                          <h4 className="font-semibold mb-2">Auto detected triggers</h4>
                          <div className="h-96 overflow-auto space-y-2">
                            {autoKW.filter(matches).map((x, idx) => (
                              <Card key={`auto-${idx}`} className="p-2">
                                <p className="text-[11px] text-muted-foreground mb-1 break-words">{x.file}</p>
                                <pre className="text-xs whitespace-pre-wrap break-words">{x.text}</pre>
                              </Card>
                            ))}
                            {autoKW.length === 0 && <p className="text-muted-foreground">No auto detected triggers</p>}
                          </div>
                        </Card>
                        <Card className="p-3">
                          <h4 className="font-semibold mb-2">Auto detected triggers by arguments</h4>
                          <div className="h-96 overflow-auto space-y-2">
                            {argKW.filter(matches).map((x, idx) => (
                              <Card key={`arg-${idx}`} className="p-2">
                                <p className="text-[11px] text-muted-foreground mb-1 break-words">{x.file}</p>
                                <pre className="text-xs whitespace-pre-wrap break-words">{x.text}</pre>
                              </Card>
                            ))}
                            {argKW.length === 0 && <p className="text-muted-foreground">No argument-detected triggers</p>}
                          </div>
                        </Card>
                      </div>
                    );
                  })()}
                </div>
              </TabsContent>

              <TabsContent value="webhooks" className="mt-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Webhook Analysis</h3>
                    <Badge>{webhookResults.count} found</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input placeholder="Search webhooks..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  </div>
                  <div className="grid gap-4">
                    {webhookResults.items?.filter((s: string) => s.toLowerCase().includes(searchQuery.toLowerCase())).map((item: string, index: number) => (
                      <Card key={index} className="p-4">
                        <pre className="text-xs whitespace-pre-wrap break-words">{item}</pre>
                      </Card>
                    )) || <p className="text-muted-foreground">No webhooks detected</p>}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="locations" className="mt-6">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Location Data</h3>
                    <Badge>{locationResults.count} found</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input placeholder="Search locations..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  </div>

                  {(() => {
                    const raw = scanResults.find(r => r.scan_type === 'locations')?.results || {} as any;
                    const v2 = (raw.vector2 || []) as {file:string;text:string}[];
                    const v3 = (raw.vector3 || []) as {file:string;text:string}[];
                    const v4 = (raw.vector4 || []) as {file:string;text:string}[];
                    const matches = (x: {file:string;text:string}) => (x.file + "\n" + x.text).toLowerCase().includes(searchQuery.toLowerCase());
                    return (
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <Card className="p-3">
                          <h4 className="font-semibold mb-2">vector3</h4>
                          <div className="h-96 overflow-auto space-y-2">
                            {v3.filter(matches).map((x, idx) => (
                              <Card key={`v3-${idx}`} className="p-2">
                                <p className="text-[11px] text-muted-foreground mb-1 break-words">{x.file}</p>
                                <pre className="text-xs whitespace-pre-wrap break-words">{x.text}</pre>
                              </Card>
                            ))}
                            {v3.length === 0 && <p className="text-muted-foreground">No vector3 entries</p>}
                          </div>
                        </Card>
                        <Card className="p-3">
                          <h4 className="font-semibold mb-2">vector2</h4>
                          <div className="h-96 overflow-auto space-y-2">
                            {v2.filter(matches).map((x, idx) => (
                              <Card key={`v2-${idx}`} className="p-2">
                                <p className="text-[11px] text-muted-foreground mb-1 break-words">{x.file}</p>
                                <pre className="text-xs whitespace-pre-wrap break-words">{x.text}</pre>
                              </Card>
                            ))}
                            {v2.length === 0 && <p className="text-muted-foreground">No vector2 entries</p>}
                          </div>
                        </Card>
                        <Card className="p-3">
                          <h4 className="font-semibold mb-2">vector4</h4>
                          <div className="h-96 overflow-auto space-y-2">
                            {v4.filter(matches).map((x, idx) => (
                              <Card key={`v4-${idx}`} className="p-2">
                                <p className="text-[11px] text-muted-foreground mb-1 break-words">{x.file}</p>
                                <pre className="text-xs whitespace-pre-wrap break-words">{x.text}</pre>
                              </Card>
                            ))}
                            {v4.length === 0 && <p className="text-muted-foreground">No vector4 entries</p>}
                          </div>
                        </Card>
                      </div>
                    );
                  })()}
                </div>
              </TabsContent>

              <TabsContent value="deleter" className="mt-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Webhook Deleter</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input placeholder="Enter Discord webhook URL" value={webhookUrl} onChange={e => { setWebhookUrl(e.target.value); setWebhookStatus('idle'); setWebhookError(''); }} />
                    <Button disabled={deletingWebhook} onClick={async () => {
                      if (!webhookUrl) { setWebhookStatus('error'); setWebhookError('Please enter a webhook URL.'); return; }
                      const regex = new RegExp('^https://([a-z0-9-]+\\.)?discord\\.com/api/.*');
                      if (!regex.test(webhookUrl)) { setWebhookStatus('error'); setWebhookError('Not a valid Discord webhook URL.'); return; }
                      setDeletingWebhook(true);
                      try {
                        const resp = await fetch(webhookUrl, { method: 'DELETE' });
                        if (resp.status === 404) throw new Error('This webhook does not exist (maybe already deleted).');
                        if (!resp.ok) throw new Error('Failed to delete webhook.');
                        setWebhookStatus('success'); setWebhookUrl('');
                      } catch (err: any) {
                        setWebhookStatus('error'); setWebhookError(err?.message || 'Unknown error');
                      } finally {
                        setDeletingWebhook(false);
                      }
                    }}>Delete webhook</Button>
                  </div>
                  {webhookStatus === 'error' && <p className="text-sm text-red-500">{webhookError}</p>}
                  {webhookStatus === 'success' && <p className="text-sm text-green-500">Webhook deleted.</p>}
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        )}
      </div>
    </div>
  );
}