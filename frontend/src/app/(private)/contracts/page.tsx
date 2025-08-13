'use client';

import React, { useState } from 'react';
import MainLayout from '@/components/layouts/main-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Upload,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Download,
  Trash2,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  RefreshCw,
} from 'lucide-react';
import DocumentUpload from '@/components/features/document-upload';
import { useDocuments } from '@/lib/hooks/useDocuments';
import documentService from '@/lib/api/documents';
import { useToast } from '@/lib/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

const contracts = [
  {
    id: '1',
    title: 'Arbeitsvertrag_Schmidt_AG.pdf',
    type: 'Arbeitsvertrag',
    uploadDate: '15.8.2025',
    status: 'analyzed',
    risk: 'high',
    size: '2.3 MB',
  },
  {
    id: '2',
    title: 'NDA_Startup_Kooperation.pdf',
    type: 'Geheimhaltungsvereinbarung',
    uploadDate: '30.9.2025',
    status: 'analyzed',
    risk: 'medium',
    size: '1.8 MB',
  },
  {
    id: '3',
    title: 'AGB_Webshop_2025.pdf',
    type: 'Allgemeine Geschäftsbedingungen',
    uploadDate: '31.12.2025',
    status: 'analyzed',
    risk: 'low',
    size: '4.1 MB',
  },
];

const getRiskBadge = (risk: string) => {
  switch (risk) {
    case 'high':
      return <Badge variant="destructive">Hoch</Badge>;
    case 'medium':
      return <Badge variant="default" className="bg-orange-500">Mittel</Badge>;
    case 'low':
      return <Badge variant="secondary">Niedrig</Badge>;
    default:
      return <Badge variant="outline">Unbekannt</Badge>;
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'analyzed':
    case 'processed':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'processing':
    case 'uploading':
      return <Clock className="h-4 w-4 text-blue-500" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case 'uploaded':
      return <FileText className="h-4 w-4 text-blue-500" />;
    default:
      return <FileText className="h-4 w-4 text-gray-500" />;
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'analyzed':
    case 'processed':
      return 'Analysiert';
    case 'processing':
      return 'Wird verarbeitet';
    case 'uploading':
      return 'Wird hochgeladen';
    case 'uploaded':
      return 'Hochgeladen';
    case 'error':
      return 'Fehler';
    default:
      return 'Unbekannt';
  }
};

export default function ContractsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const { toast } = useToast();
  
  const {
    documents,
    loading,
    error,
    pagination,
    filters,
    searchDocuments,
    refreshDocuments,
    deleteDocument,
    setPage,
  } = useDocuments({
    initialLimit: 10,
    autoLoad: true,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchDocuments(searchQuery);
  };

  const handleUploadComplete = (documentId: string) => {
    console.log('Upload completed:', documentId);
    setUploadDialogOpen(false);
    refreshDocuments(); // Refresh the document list
    toast({
      title: "Upload erfolgreich",
      description: `Dokument wurde erfolgreich hochgeladen (ID: ${documentId})`,
    });
  };

  const handleUploadError = (error: string) => {
    console.error('Upload error:', error);
    toast({
      title: "Upload fehlgeschlagen",
      description: error,
      variant: "destructive",
    });
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (confirm('Sind Sie sicher, dass Sie dieses Dokument löschen möchten?')) {
      const success = await deleteDocument(documentId);
      if (success) {
        toast({
          title: "Dokument gelöscht",
          description: "Das Dokument wurde erfolgreich gelöscht.",
        });
      } else {
        toast({
          title: "Löschen fehlgeschlagen",
          description: "Das Dokument konnte nicht gelöscht werden.",
          variant: "destructive",
        });
      }
    }
  };

  const handleDownloadDocument = async (documentId: string) => {
    try {
      const response = await documentService.getDownloadUrl(documentId);
      if (response.success && response.data) {
        window.open(response.data.downloadUrl, '_blank');
        toast({
          title: "Download gestartet",
          description: "Der Download wurde gestartet.",
        });
      } else {
        console.error('Download failed:', response.error);
        toast({
          title: "Download fehlgeschlagen",
          description: response.error || "Der Download konnte nicht gestartet werden.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download fehlgeschlagen",
        description: "Ein Fehler ist beim Download aufgetreten.",
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    // Handle different date formats
    let date: Date;
    
    // Check if it's already in ISO format
    if (dateString.includes('T') || dateString.includes('-')) {
      date = new Date(dateString);
    } else {
      // Handle German date format like "15.8.2025"
      const parts = dateString.split('.');
      if (parts.length === 3) {
        const [day, month, year] = parts;
        if (day && month && year) {
          date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        } else {
          date = new Date(dateString);
        }
      } else {
        date = new Date(dateString);
      }
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return dateString; // Return original string if parsing failed
    }
    
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  // Combine API documents with mock data for demo purposes
  const allDocuments = [...documents, ...contracts.map(contract => {
    // Parse size from string like "2.3 MB" to bytes
    let sizeInBytes: number;
    const sizeMatch = contract.size.match(/^([\d.]+)\s*(MB|KB|GB|Bytes?)$/i);
    if (sizeMatch && sizeMatch[1] && sizeMatch[2]) {
      const value = sizeMatch[1];
      const unit = sizeMatch[2];
      const numValue = parseFloat(value);
      switch (unit.toUpperCase()) {
        case 'GB':
          sizeInBytes = numValue * 1024 * 1024 * 1024;
          break;
        case 'MB':
          sizeInBytes = numValue * 1024 * 1024;
          break;
        case 'KB':
          sizeInBytes = numValue * 1024;
          break;
        default:
          sizeInBytes = numValue;
      }
    } else {
      sizeInBytes = 0;
    }

    return {
      documentId: contract.id,
      fileName: contract.title,
      contentType: 'application/pdf',
      size: sizeInBytes,
      status: contract.status as any,
      uploadedAt: contract.uploadDate,
      category: 'contract' as const,
      // Mock risk data - in real app this would come from analysis results
      risk: contract.risk,
    };
  })];

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Verträge</h1>
            <p className="text-muted-foreground">
              Verwalten und analysieren Sie Ihre Rechtsdokumente
            </p>
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={refreshDocuments}
              disabled={loading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Aktualisieren
            </Button>
            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Upload className="mr-2 h-4 w-4" />
                  Vertrag hochladen
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Vertrag hochladen</DialogTitle>
                </DialogHeader>
                <DocumentUpload
                  onUploadComplete={handleUploadComplete}
                  onUploadError={handleUploadError}
                  acceptedFileTypes={['.pdf', '.doc', '.docx']}
                  maxFileSize={10 * 1024 * 1024} // 10MB
                  multiple={false}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
              <span className="text-red-700 dark:text-red-400">{error}</span>
            </div>
          </div>
        )}

        {/* Filters and Search */}
        <div className="flex items-center space-x-4">
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Verträge durchsuchen..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </form>
          <Button variant="outline" type="submit" onClick={handleSearch}>
            <Filter className="mr-2 h-4 w-4" />
            Suchen
          </Button>
        </div>

        {/* Contracts Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              Analysierte Verträge
              {loading && (
                <span className="ml-2 text-sm text-muted-foreground">
                  (Wird geladen...)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allDocuments.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Noch keine Dokumente hochgeladen
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Laden Sie Ihr erstes Dokument hoch, um zu beginnen
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titel</TableHead>
                    <TableHead>Risiko</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allDocuments.map((document) => (
                    <TableRow key={document.documentId}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{document.fileName}</div>
                          <div className="text-sm text-muted-foreground">
                            {formatDate(document.uploadedAt)} • {formatFileSize(document.size)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {(document as any).risk ? getRiskBadge((document as any).risk) : (
                          <Badge variant="outline">Nicht analysiert</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {formatDate(document.uploadedAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(document.status)}
                          <span className="text-sm">{getStatusText(document.status)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Aktionen öffnen</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="mr-2 h-4 w-4" />
                              Details
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDownloadDocument(document.documentId)}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Herunterladen
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={() => handleDeleteDocument(document.documentId)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Löschen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Seite {pagination.page} von {pagination.totalPages} 
              ({pagination.total} Dokumente gesamt)
            </p>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPage(pagination.page - 1)}
              >
                Vorherige
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage(pagination.page + 1)}
              >
                Nächste
              </Button>
            </div>
          </div>
        )}
      </div>
      <Toaster />
    </MainLayout>
  );
}
