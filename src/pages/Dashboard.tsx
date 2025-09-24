import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Globe, Trash2, Zap } from "lucide-react";
// Using custom API instead of Supabase
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
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/uploads`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('jwt') || ''}` }
    })
    if (!res.ok) {
      toast({ title: 'Error', description: 'Failed to fetch uploads', variant: 'destructive' })
      return
    }
    const json = await res.json()
    const data = (json.uploads || []).map((u: any) => ({
      id: u._id,
      folder_name: u.folderName,
      file_count: u.fileCount,
      uploaded_at: u.uploadedAt || u.createdAt
    }))
    setUploads(data)
    if (data.length > 0 && !selectedUpload) setSelectedUpload(data[0].id)
  };

  const fetchScanResults = async (uploadId: string) => {
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/scans?uploadId=${uploadId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('jwt') || ''}` }
    })
    if (!res.ok) {
      setScanResults([])
      return
    }
    const json = await res.json()
    const data = (json.scans || []).map((s: any) => ({
      id: s._id,
      scan_type: s.scanType,
      results: s.results,
      created_at: s.createdAt
    }))
    setScanResults(data)
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    
    try {
      const folderName = `dump_${Date.now()}`
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/uploads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('jwt') || ''}`
        },
        body: JSON.stringify({ folderName, uploadPath: `/uploads/${folderName}`, fileCount: files.length })
      })
      if (!res.ok) throw new Error('Upload failed')
      const { upload } = await res.json()
      toast({ title: 'Upload Successful', description: `${files.length} files uploaded and processed` })
      fetchUploads()
      setSelectedUpload(upload._id)
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
    return scanResults.find(result => result.scan_type === type)?.results || { count: 0, items: [] };
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
                  className={`p-4 cursor-pointer transition-colors ${
                    selectedUpload === upload.id ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setSelectedUpload(upload.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium truncate">{upload.folder_name}</h3>
                    <Badge variant="outline">{upload.file_count} files</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(upload.uploaded_at).toLocaleDateString()}
                  </p>
                </Card>
              ))}
            </div>
          </Card>
        )}

        {/* Analysis Results */}
        {selectedUpload && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-6">Analysis Results</h2>
            
            <Tabs defaultValue="triggers" className="w-full">
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
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Detected Triggers</h3>
                    <Badge>{triggerResults.count} found</Badge>
                  </div>
                  <div className="grid gap-4">
                    {triggerResults.items?.map((item: string, index: number) => (
                      <Card key={index} className="p-4">
                        <p className="text-sm">{item}</p>
                      </Card>
                    )) || <p className="text-muted-foreground">No triggers detected</p>}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="webhooks" className="mt-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Webhook Analysis</h3>
                    <Badge>{webhookResults.count} found</Badge>
                  </div>
                  <div className="grid gap-4">
                    {webhookResults.items?.map((item: string, index: number) => (
                      <Card key={index} className="p-4">
                        <p className="text-sm">{item}</p>
                      </Card>
                    )) || <p className="text-muted-foreground">No webhooks detected</p>}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="locations" className="mt-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Location Data</h3>
                    <Badge>{locationResults.count} found</Badge>
                  </div>
                  <div className="grid gap-4">
                    {locationResults.items?.map((item: string, index: number) => (
                      <Card key={index} className="p-4">
                        <p className="text-sm">{item}</p>
                      </Card>
                    )) || <p className="text-muted-foreground">No location data found</p>}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="deleter" className="mt-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Webhook Deletion Candidates</h3>
                    <Badge>{deleterResults.count} found</Badge>
                  </div>
                  <div className="grid gap-4">
                    {deleterResults.items?.map((item: string, index: number) => (
                      <Card key={index} className="p-4 flex items-center justify-between">
                        <p className="text-sm">{item}</p>
                        <Button size="sm" variant="destructive">
                          Delete
                        </Button>
                      </Card>
                    )) || <p className="text-muted-foreground">No deletion candidates found</p>}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        )}
      </div>
    </div>
  );
}