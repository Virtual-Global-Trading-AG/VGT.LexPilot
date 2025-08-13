'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  X,
  Loader2,
} from 'lucide-react';
import documentService, { DocumentUploadRequest } from '@/lib/api/documents';

interface UploadedFile {
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  documentId?: string;
  // File properties we need
  file: File;
  name: string;
  size: number;
  type: string;
}

interface DocumentUploadProps {
  onUploadComplete?: (documentId: string) => void;
  onUploadError?: (error: string) => void;
  acceptedFileTypes?: string[];
  maxFileSize?: number; // in bytes
  multiple?: boolean;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({
  onUploadComplete,
  onUploadError,
  acceptedFileTypes = ['.pdf', '.doc', '.docx', '.txt'],
  maxFileSize = 10 * 1024 * 1024, // 10MB default
  multiple = false,
}) => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [metadata, setMetadata] = useState<{
    category: 'contract' | 'legal_document' | 'policy' | 'other';
    description: string;
    tags: string;
  }>({
    category: 'contract',
    description: '',
    tags: '',
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: UploadedFile[] = acceptedFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
      progress: 0,
      status: 'pending' as const,
      file: file,
      name: file.name,
      size: file.size,
      type: file.type,
    }));

    setFiles((prev) => (multiple ? [...prev, ...newFiles] : newFiles));
  }, [multiple]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: acceptedFileTypes.reduce((acc, type) => {
      if (type === '.pdf') acc['application/pdf'] = ['.pdf'];
      if (type === '.doc') acc['application/msword'] = ['.doc'];
      if (type === '.docx') acc['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] = ['.docx'];
      if (type === '.txt') acc['text/plain'] = ['.txt'];
      return acc;
    }, {} as Record<string, string[]>),
    maxSize: maxFileSize,
    multiple,
    disabled: uploading,
  });

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== fileId));
  };

  const uploadFile = async (file: UploadedFile) => {
    try {
      // Update file status to uploading
      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id ? { ...f, status: 'uploading' as const } : f
        )
      );

      const uploadMetadata: DocumentUploadRequest['metadata'] = {
        category: metadata.category,
        description: metadata.description || undefined,
        tags: metadata.tags ? metadata.tags.split(',').map(tag => tag.trim()) : undefined,
      };

      const result = await documentService.uploadDocument(
        file.file, // Use the actual File object
        uploadMetadata,
        (progress) => {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === file.id ? { ...f, progress } : f
            )
          );
        }
      );

      if (result.success && result.data) {
        // Update file status to success
        setFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? {
                  ...f,
                  status: 'success' as const,
                  progress: 100,
                  documentId: result.data!.documentId,
                }
              : f
          )
        );

        onUploadComplete?.(result.data.documentId);
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      
      // Update file status to error
      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id
            ? { ...f, status: 'error' as const, error: errorMessage }
            : f
        )
      );

      onUploadError?.(errorMessage);
    }
  };

  const uploadAllFiles = async () => {
    setUploading(true);
    
    try {
      const pendingFiles = files.filter((file) => file.status === 'pending');
      
      // Upload files sequentially to avoid overwhelming the server
      for (const file of pendingFiles) {
        await uploadFile(file);
      }
    } finally {
      setUploading(false);
    }
  };

  const getFileIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'uploading':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <FileText className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: UploadedFile['status']) => {
    switch (status) {
      case 'uploading':
        return <Badge variant="default" className="bg-blue-500">Wird hochgeladen</Badge>;
      case 'success':
        return <Badge variant="default" className="bg-green-500">Erfolgreich</Badge>;
      case 'error':
        return <Badge variant="destructive">Fehler</Badge>;
      default:
        return <Badge variant="outline">Bereit</Badge>;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const hasPendingFiles = files.some((file) => file.status === 'pending');
  const hasErrors = files.some((file) => file.status === 'error');

  return (
    <div className="space-y-4">
      {/* Metadata Configuration */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-semibold">Dokument-Metadaten</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Kategorie</Label>
              <Select
                value={metadata.category}
                onValueChange={(value: any) =>
                  setMetadata((prev) => ({ ...prev, category: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kategorie auswählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contract">Vertrag</SelectItem>
                  <SelectItem value="legal_document">Rechtsdokument</SelectItem>
                  <SelectItem value="policy">Richtlinie</SelectItem>
                  <SelectItem value="other">Sonstiges</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (kommasepariert)</Label>
              <Input
                id="tags"
                value={metadata.tags}
                onChange={(e) =>
                  setMetadata((prev) => ({ ...prev, tags: e.target.value }))
                }
                placeholder="z.B. arbeitsvertrag, befristet, vollzeit"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Beschreibung (optional)</Label>
            <Textarea
              id="description"
              value={metadata.description}
              onChange={(e) =>
                setMetadata((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Kurze Beschreibung des Dokuments..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Upload Area */}
      <Card>
        <CardContent className="p-8">
          <div
            {...getRootProps()}
            className={`
              flex flex-col items-center justify-center space-y-4 text-center
              border-2 border-dashed rounded-lg p-8 transition-colors cursor-pointer
              ${isDragActive && !isDragReject ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' : ''}
              ${isDragReject ? 'border-red-500 bg-red-50 dark:bg-red-950' : ''}
              ${uploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-400'}
              ${files.length === 0 ? 'border-gray-300' : 'border-gray-200'}
            `}
          >
            <input {...getInputProps()} />
            
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <Upload className="h-10 w-10 text-muted-foreground" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">
                {isDragActive
                  ? isDragReject
                    ? 'Dateityp nicht unterstützt'
                    : 'Datei hier ablegen...'
                  : 'Dokument zur Analyse hochladen'
                }
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {isDragActive
                  ? isDragReject
                    ? `Unterstützte Formate: ${acceptedFileTypes.join(', ')}`
                    : 'Lassen Sie die Datei los, um sie hochzuladen'
                  : `Ziehen Sie eine Datei hierher oder klicken Sie zum Auswählen. Unterstützte Formate: ${acceptedFileTypes.join(', ')}`
                }
              </p>
              <p className="text-xs text-muted-foreground">
                Maximale Dateigröße: {formatFileSize(maxFileSize)}
              </p>
            </div>
            
            {!isDragActive && (
              <Button size="lg" disabled={uploading}>
                Datei auswählen
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* File List */}
      {files.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Ausgewählte Dateien ({files.length})
                </h3>
                {hasPendingFiles && (
                  <Button
                    onClick={uploadAllFiles}
                    disabled={uploading}
                    size="sm"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Wird hochgeladen...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Alle hochladen
                      </>
                    )}
                  </Button>
                )}
              </div>

              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center space-x-3 p-3 border rounded-lg"
                >
                  {getFileIcon(file.status)}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      {file.status !== 'uploading' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(file.id)}
                          className="ml-2"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </span>
                      {getStatusBadge(file.status)}
                    </div>

                    {file.status === 'uploading' && (
                      <Progress value={file.progress} className="mt-2" />
                    )}

                    {file.status === 'error' && file.error && (
                      <Alert className="mt-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          {file.error}
                        </AlertDescription>
                      </Alert>
                    )}

                    {file.status === 'success' && file.documentId && (
                      <p className="text-xs text-green-600 mt-1">
                        Dokument-ID: {file.documentId}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Summary */}
      {hasErrors && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Einige Dateien konnten nicht hochgeladen werden. Überprüfen Sie die Fehler oben und versuchen Sie es erneut.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default DocumentUpload;
