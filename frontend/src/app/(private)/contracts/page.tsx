'use client';

import MainLayout from '@/components/layouts/main-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useDocumentUpload } from '@/lib/hooks/useApi';
import { useRef, useState } from 'react';
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
} from 'lucide-react';

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
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'processing':
      return <Clock className="h-4 w-4 text-blue-500" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <FileText className="h-4 w-4 text-gray-500" />;
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'analyzed':
      return 'Analysiert';
    case 'processing':
      return 'Wird verarbeitet';
    case 'error':
      return 'Fehler';
    default:
      return 'Unbekannt';
  }
};

export default function ContractsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadDocumentDirect, uploading, uploadProgress, error, clearError } = useDocumentUpload();
  const [dragActive, setDragActive] = useState(false);

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file) return;

    handleFileUpload(file);
  };

  const handleFileUpload = async (file: File) => {
    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedTypes.includes(file.type)) {
      alert('Nur PDF und Word-Dokumente sind erlaubt.');
      return;
    }

    // Validate file size (50MB max)
    if (file.size > 52428800) {
      alert('Die Datei ist zu groß. Maximale Größe: 50MB');
      return;
    }

    try {
      const result = await uploadDocumentDirect(file, {
        category: 'contract',
        description: `Hochgeladener Vertrag: ${file.name}`
      });

      if (result) {
        alert('Vertrag erfolgreich hochgeladen!');
        // Refresh the page or update the contracts list
        window.location.reload();
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Fehler beim Hochladen des Vertrags.');
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

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
          <Button onClick={handleButtonClick} disabled={uploading}>
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? 'Wird hochgeladen...' : 'Vertrag hochladen'}
          </Button>
        </div>

        {/* Upload Area */}
        <Card>
          <CardContent className="p-8">
            <div 
              className={`flex flex-col items-center justify-center space-y-4 text-center border-2 border-dashed rounded-lg p-8 transition-colors ${
                dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
              } ${uploading ? 'opacity-50' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                <FileText className="h-10 w-10 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">
                  {uploading ? 'Wird hochgeladen...' : 'Vertrag zur Analyse hochladen'}
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  {uploading 
                    ? `Upload-Fortschritt: ${uploadProgress}%`
                    : 'Ziehen Sie eine PDF-Datei hierher oder klicken Sie zum Auswählen'
                  }
                </p>
              </div>
              {uploading ? (
                <div className="w-full max-w-xs">
                  <div className="bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                </div>
              ) : (
                <Button size="lg" onClick={handleButtonClick}>
                  Datei auswählen
                </Button>
              )}
              {error && (
                <p className="text-sm text-red-600 mt-2">{error}</p>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />
          </CardContent>
        </Card>

        {/* Filters and Search */}
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Verträge durchsuchen..."
                className="pl-9"
              />
            </div>
          </div>
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            Filter
          </Button>
        </div>

        {/* Contracts Table */}
        <Card>
          <CardHeader>
            <CardTitle>Analysierte Verträge</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titel</TableHead>
                  <TableHead>Risiko</TableHead>
                  <TableHead>Frist</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{contract.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {contract.uploadDate} • {contract.size}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getRiskBadge(contract.risk)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {contract.uploadDate}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(contract.status)}
                        <span className="text-sm">{getStatusText(contract.status)}</span>
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
                          <DropdownMenuItem>
                            <Download className="mr-2 h-4 w-4" />
                            Herunterladen
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">
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
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
