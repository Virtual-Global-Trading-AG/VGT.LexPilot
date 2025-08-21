'use client';

import MainLayout from '@/components/layouts/main-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useDocumentUpload, useDocuments } from '@/lib/hooks/useApi';
import React, { useRef, useState, useEffect } from 'react';
import { useToast } from '@/lib/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Upload,
  Search,
  Filter,
  Eye,
  Download,
  Trash2,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  FileSearch,
  X,
  Plus,
  Scale,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { SwissObligationAnalysisResult, SwissObligationSectionResult } from '@/types';


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

const getCategoryBadge = (category: string) => {
  switch (category) {
    case 'contract':
      return <Badge variant="default">Vertrag</Badge>;
    case 'nda':
      return <Badge variant="secondary">NDA</Badge>;
    case 'terms_conditions':
      return <Badge variant="outline">AGB</Badge>;
    case 'other':
      return <Badge variant="outline">Sonstiges</Badge>;
    default:
      return <Badge variant="outline">Unbekannt</Badge>;
  }
};

const getCategoryDisplayName = (category: string) => {
  switch (category) {
    case 'contract':
      return 'Verträge';
    case 'nda':
      return 'Geheimhaltungsvereinbarungen (NDA)';
    case 'terms_conditions':
      return 'Allgemeine Geschäftsbedingungen (AGB)';
    case 'other':
      return 'Sonstige Dokumente';
    default:
      return 'Unbekannte Kategorie';
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
  const { getDocuments, deleteDocument, getDocumentText, analyzeSwissObligationLaw, getJobStatus, getUserJobs, getSwissObligationAnalysesByDocumentId, documents, pagination, loading: documentsLoading, error: documentsError, clearError: clearDocumentsError } = useDocuments();
  const [dragActive, setDragActive] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<{id: string, name: string} | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'contract' | 'nda' | 'terms_conditions' | 'other'>('contract');
  const [extractedText, setExtractedText] = useState<string>('');
  const [extractingText, setExtractingText] = useState<boolean>(false);
  const [extractedDocumentInfo, setExtractedDocumentInfo] = useState<{fileName: string, documentId: string} | null>(null);
  const [anonymizedKeywords, setAnonymizedKeywords] = useState<string[]>([]);
  const [currentTextInput, setCurrentTextInput] = useState('');
  const [swissAnalysisLoading, setSwissAnalysisLoading] = useState<string | null>(null);
  const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(new Set());
  const [documentAnalyses, setDocumentAnalyses] = useState<Record<string, SwissObligationAnalysisResult[]>>({});
  const [selectedAnalysis, setSelectedAnalysis] = useState<SwissObligationAnalysisResult | null>(null);
  const [sidenavOpen, setSidenavOpen] = useState(false);
  const { toast } = useToast();

  // Helper functions for managing texts to replace
  const addTextToReplace = () => {
    if (currentTextInput.trim() && !anonymizedKeywords.includes(currentTextInput.trim())) {
      setAnonymizedKeywords([...anonymizedKeywords, currentTextInput.trim()]);
      setCurrentTextInput('');
    }
  };

  const removeTextToReplace = (index: number) => {
    setAnonymizedKeywords(anonymizedKeywords.filter((_, i) => i !== index));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTextToReplace();
    }
  };

  // Helper functions for managing document expansion and analyses
  const toggleDocumentExpansion = (documentId: string) => {
    const newExpanded = new Set(expandedDocuments);

    if (expandedDocuments.has(documentId)) {
      newExpanded.delete(documentId);
    } else {
      newExpanded.add(documentId);
    }

    setExpandedDocuments(newExpanded);
  };


  const handleAnalysisRowClick = (analysis: SwissObligationAnalysisResult) => {
    setSelectedAnalysis(analysis);
    setSidenavOpen(true);
  };

  // Group documents by category
  const groupedDocuments = documents.reduce((groups: Record<string, any[]>, document) => {
    const category = document.documentMetadata?.category || 'other';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(document);
    return groups;
  }, {});

  // Load all document analyses for the given documents
  const loadAllDocumentAnalyses = async (documents: any[]) => {
    const analysesPromises = documents.map(async (document) => {
      try {
        const result = await getSwissObligationAnalysesByDocumentId(document.documentId);
        if (result.success && result.data?.analyses) {
          return { documentId: document.documentId, analyses: result.data.analyses };
        }
        return { documentId: document.documentId, analyses: [] };
      } catch (err) {
        console.error(`Error loading analyses for document ${document.documentId}:`, err);
        return { documentId: document.documentId, analyses: [] };
      }
    });

    const analysesResults = await Promise.all(analysesPromises);
    const analysesMap: Record<string, SwissObligationAnalysisResult[]> = {};

    analysesResults.forEach(({ documentId, analyses }) => {
      if (analyses.length > 0) {
        analysesMap[documentId] = analyses;
      }
    });

    setDocumentAnalyses(analysesMap);
  };

  // Fetch documents on component mount
  useEffect(() => {
    getDocuments({
      page: 1,
      limit: 10,
      sortBy: 'uploadedAt',
      sortOrder: 'desc'
    });
  }, [getDocuments]);

  // Load analyses when documents are loaded
  useEffect(() => {
    if (documents.length > 0) {
      loadAllDocumentAnalyses(documents);
    }
  }, [documents]);

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedTypes.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Ungültiger Dateityp",
        description: "Nur PDF und Word-Dokumente sind erlaubt."
      });
      return;
    }

    // Validate file size (50MB max)
    if (file.size > 52428800) {
      toast({
        variant: "destructive",
        title: "Datei zu groß",
        description: "Die Datei ist zu groß. Maximale Größe: 50MB"
      });
      return;
    }

    // Store file (dialog is already open)
    setSelectedFile(file);
  };

  const handleFileUpload = async (file: File, category: 'contract' | 'nda' | 'other') => {
    try {

      const result = await uploadDocumentDirect(file, {
        category: category,
        description: `Hochgeladenes Dokument: ${file.name}`,
        anonymizedKeywords: anonymizedKeywords.length > 0 ? anonymizedKeywords : undefined
      });

      if (result) {
        toast({
          variant: "success",
          title: "Upload erfolgreich",
          description: "Vertrag wurde erfolgreich hochgeladen!"
        });
        // Reset text replacement list
        setAnonymizedKeywords([]);
        setCurrentTextInput('');
        // Refresh the documents list
        getDocuments({
          page: 1,
          limit: 10,
          sortBy: 'uploadedAt',
          sortOrder: 'desc'
        });
      }
    } catch (err) {
      console.error('Upload error:', err);
      toast({
        variant: "destructive",
        title: "Upload fehlgeschlagen",
        description: "Fehler beim Hochladen des Vertrags."
      });
    }
  };

  const handleCategoryConfirm = async () => {
    if (!selectedFile) return;

    setCategoryDialogOpen(false);
    await handleFileUpload(selectedFile, selectedCategory);
    setSelectedFile(null);
  };

  const handleCategoryCancel = () => {
    setCategoryDialogOpen(false);
    setSelectedFile(null);
    setSelectedCategory('contract');
    setAnonymizedKeywords([]);
    setCurrentTextInput('');
  };

  const handleButtonClick = () => {
    setCategoryDialogOpen(true);
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
      setCategoryDialogOpen(true);
      // Set the file after opening the dialog
      setTimeout(() => {
        handleFileSelect(e.dataTransfer.files);
      }, 100);
    }
  };

  const handleDeleteDocument = (documentId: string, fileName: string) => {
    setDocumentToDelete({ id: documentId, name: fileName });
    setDeleteDialogOpen(true);
  };

  const confirmDeleteDocument = async () => {
    if (!documentToDelete) return;

    try {
      const success = await deleteDocument(documentToDelete.id);
      if (success) {
        toast({
          variant: "success",
          title: "Dokument gelöscht",
          description: "Dokument wurde erfolgreich gelöscht!"
        });
        // Refresh the documents list
        getDocuments({
          page: 1,
          limit: 10,
          sortBy: 'uploadedAt',
          sortOrder: 'desc'
        });
      } else {
        toast({
          variant: "destructive",
          title: "Löschen fehlgeschlagen",
          description: "Fehler beim Löschen des Dokuments."
        });
      }
    } catch (err) {
      console.error('Delete error:', err);
      toast({
        variant: "destructive",
        title: "Löschen fehlgeschlagen",
        description: "Fehler beim Löschen des Dokuments."
      });
    } finally {
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
    }
  };

  const handleExtractText = async (documentId: string, fileName: string) => {
    setExtractingText(true);
    setExtractedText('');
    setExtractedDocumentInfo(null);

    try {
      const result = await getDocumentText(documentId);

      if (result.success && result.data) {
        setExtractedText(result.data.text);
        setExtractedDocumentInfo({
          fileName: result.data.fileName,
          documentId: result.data.documentId
        });
        toast({
          variant: "success",
          title: "Text extrahiert",
          description: `Text wurde erfolgreich aus "${result.data.fileName}" extrahiert.`
        });
      } else {
        toast({
          variant: "destructive",
          title: "Textextraktion fehlgeschlagen",
          description: result.error || "Fehler beim Extrahieren des Texts."
        });
      }
    } catch (err) {
      console.error('Text extraction error:', err);
      toast({
        variant: "destructive",
        title: "Textextraktion fehlgeschlagen",
        description: "Unerwarteter Fehler beim Extrahieren des Texts."
      });
    } finally {
      setExtractingText(false);
    }
  };

  const handleSwissObligationAnalysis = async (documentId: string, fileName: string) => {
    setSwissAnalysisLoading(documentId);

    try {
      // Start the analysis job
      const result = await analyzeSwissObligationLaw(documentId);

      if (result.success && result.data?.jobId) {
        toast({
          title: "Analyse gestartet",
          description: `Schweizer Obligationenrecht-Analyse für "${fileName}" wurde im Hintergrund gestartet. Sie erhalten eine Benachrichtigung, wenn die Analyse abgeschlossen ist.`
        });

        // Clear loading state immediately since global monitoring will handle the rest
        setSwissAnalysisLoading(null);
      } else {
        toast({
          variant: "destructive",
          title: "Analyse fehlgeschlagen",
          description: result.error || "Fehler beim Starten der Schweizer Obligationenrecht-Analyse."
        });
        setSwissAnalysisLoading(null);
      }
    } catch (err) {
      console.error('Swiss obligation analysis error:', err);
      toast({
        variant: "destructive",
        title: "Analyse fehlgeschlagen",
        description: "Unerwarteter Fehler beim Starten der Schweizer Obligationenrecht-Analyse."
      });
      setSwissAnalysisLoading(null);
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
            {documentsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground">Lade Dokumente...</div>
              </div>
            ) : documentsError ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-red-600">
                  Fehler beim Laden der Dokumente: {documentsError}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="ml-2"
                    onClick={() => {
                      clearDocumentsError();
                      getDocuments({
                        page: 1,
                        limit: 10,
                        sortBy: 'uploadedAt',
                        sortOrder: 'desc'
                      });
                    }}
                  >
                    Erneut versuchen
                  </Button>
                </div>
              </div>
            ) : documents.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground">Keine Dokumente gefunden</div>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedDocuments).map(([category, categoryDocuments]) => (
                  <div key={category} className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <h3 className="text-lg font-semibold">{getCategoryDisplayName(category)}</h3>
                      {getCategoryBadge(category)}
                      <span className="text-sm text-muted-foreground">({categoryDocuments.length})</span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead>Titel</TableHead>
                          <TableHead>Risiko</TableHead>
                          <TableHead>Hochgeladen</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Aktionen</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryDocuments.map((document) => (
                          <React.Fragment key={document.documentId}>
                            <TableRow className="border-b">
                              <TableCell>
                                {documentAnalyses[document.documentId] && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => toggleDocumentExpansion(document.documentId)}
                                  >
                                    {expandedDocuments.has(document.documentId) ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <div className="font-medium">{document.documentMetadata.fileName || document.documentMetadata.originalName || 'Unbekannt'}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {document.documentMetadata.uploadedAt ? new Date(document.documentMetadata.uploadedAt).toLocaleDateString('de-DE') : 'Unbekannt'} • {document.documentMetadata.size ? `${(document.documentMetadata.size / 1024 / 1024).toFixed(1)} MB` : 'Unbekannt'}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  {document.documentMetadata.uploadedAt ? new Date(document.documentMetadata.uploadedAt).toLocaleDateString('de-DE') : 'Unbekannt'}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  {getStatusIcon(document.documentMetadata.status || 'unknown')}
                                  <span className="text-sm">{getStatusText(document.documentMetadata.status || 'unknown')}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                    <Download className="h-4 w-4" />
                                    <span className="sr-only">Herunterladen</span>
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    onClick={() => handleExtractText(document.documentId, document.documentMetadata.fileName || 'Unbekannt')}
                                    disabled={extractingText}
                                  >
                                    <FileSearch className="h-4 w-4" />
                                    <span className="sr-only">Text extrahieren</span>
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                    onClick={() => handleSwissObligationAnalysis(document.documentId, document.documentMetadata.fileName || 'Unbekannt')}
                                    disabled={swissAnalysisLoading === document.documentId}
                                    title="Schweizer Obligationenrecht-Analyse"
                                  >
                                    <Scale className="h-4 w-4" />
                                    <span className="sr-only">Schweizer Obligationenrecht-Analyse</span>
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => handleDeleteDocument(document.documentId, document.documentMetadata.fileName || 'Unbekannt')}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Löschen</span>
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>

                            {/* Analysis Results Sub-rows */}
                            {expandedDocuments.has(document.documentId) && documentAnalyses[document.documentId] && (
                              <>
                                {documentAnalyses[document.documentId].map((analysis, analysisIndex) => (
                                  <TableRow 
                                    key={`${document.documentId}-analysis-${analysisIndex}`}
                                    className="bg-slate-50 hover:bg-slate-100 cursor-pointer border-l-4 border-l-blue-500"
                                    onClick={() => handleAnalysisRowClick(analysis)}
                                  >
                                    <TableCell></TableCell>
                                    <TableCell>
                                      <div className="pl-6 space-y-1">
                                        <div className="flex items-center space-x-2">
                                          <Scale className="h-4 w-4 text-blue-600" />
                                          <span className="font-medium text-sm">Schweizer Obligationenrecht-Analyse</span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          ID: {analysis.analysisId} • {analysis.sections?.length || 0} Abschnitte
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant={analysis.overallCompliance?.isCompliant ? "default" : "destructive"} className="text-xs">
                                        {analysis.overallCompliance?.isCompliant ? "Konform" : "Nicht konform"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      <div className="text-sm">
                                        {analysis.createdAt ? new Date(analysis.createdAt).toLocaleDateString('de-DE') : 'Unbekannt'}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center space-x-2">
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                        <span className="text-sm">Abgeschlossen</span>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="text-sm text-muted-foreground">
                                        Score: {Math.round((analysis.overallCompliance?.complianceScore || 0) * 100)}%
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </>
                            )}
                          </React.Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Extracted Text Display */}
        {extractedText && extractedDocumentInfo && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileSearch className="h-5 w-5" />
                <span>Extrahierter Text</span>
              </CardTitle>
              <div className="text-sm text-muted-foreground">
                Dokument: {extractedDocumentInfo.fileName} • {extractedText.length} Zeichen
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="extracted-text">Dokumentinhalt</Label>
                <Textarea
                  id="extracted-text"
                  value={extractedText}
                  readOnly
                  className="min-h-[300px] font-mono text-sm"
                  placeholder="Der extrahierte Text wird hier angezeigt..."
                />
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>Nur-Lesen Modus</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(extractedText);
                      toast({
                        variant: "success",
                        title: "Text kopiert",
                        description: "Der extrahierte Text wurde in die Zwischenablage kopiert."
                      });
                    }}
                  >
                    Text kopieren
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading indicator for text extraction */}
        {extractingText && (
          <Card>
            <CardContent className="py-8">
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <span className="text-sm text-muted-foreground">Text wird extrahiert...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading indicator for Swiss obligation analysis */}
        {swissAnalysisLoading && (
          <Card>
            <CardContent className="py-8">
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <span className="text-sm text-muted-foreground">Schweizer Obligationenrecht-Analyse läuft...</span>
              </div>
            </CardContent>
          </Card>
        )}

      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dokument löschen</DialogTitle>
            <DialogDescription>
              Sind Sie sicher, dass Sie "{documentToDelete?.name}" löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDocumentToDelete(null);
              }}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteDocument}
            >
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Selection Dialog with File Upload */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dokument hochladen</DialogTitle>
            <DialogDescription>
              Wählen Sie eine Datei und die entsprechende Kategorie für Ihr Dokument.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* File Selection Area */}
            <div className="space-y-2">
              <Label>Datei auswählen</Label>
              <div 
                className={`flex flex-col items-center justify-center space-y-4 text-center border-2 border-dashed rounded-lg p-6 transition-colors ${
                  dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
                } ${selectedFile ? 'border-green-500 bg-green-50' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                {selectedFile ? (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-green-700">{selectedFile.name}</p>
                    <p className="text-xs text-green-600">
                      {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Datei hierher ziehen oder auswählen</p>
                    <p className="text-xs text-muted-foreground">PDF, DOC, DOCX (max. 50MB)</p>
                  </div>
                )}
                <Button 
                  size="sm" 
                  variant={selectedFile ? "outline" : "default"}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {selectedFile ? 'Andere Datei wählen' : 'Datei auswählen'}
                </Button>
              </div>
            </div>

            {/* Category Selection */}
            <div className="space-y-2">
              <Label htmlFor="category">Kategorie</Label>
              <Select value={selectedCategory} onValueChange={(value: 'contract' | 'nda' | 'terms_conditions' | 'other') => setSelectedCategory(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Kategorie auswählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contract">Vertrag</SelectItem>
                  <SelectItem value="nda">Geheimhaltungsvereinbarung (NDA)</SelectItem>
                  <SelectItem value="terms_conditions">AGB</SelectItem>
                  <SelectItem value="other">Sonstiges</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Text Replacement Section */}
            <div className="space-y-2">
              <Label>Texte zum Ersetzen (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Geben Sie spezifische Texte an, die im Dokument durch Platzhalter ersetzt werden sollen.
              </p>
              <div className="flex space-x-2">
                <Input
                  placeholder="Text eingeben..."
                  value={currentTextInput}
                  onChange={(e) => setCurrentTextInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={addTextToReplace}
                  disabled={!currentTextInput.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {anonymizedKeywords.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">Zu ersetzende Texte:</p>
                  <div className="flex flex-wrap gap-1">
                    {anonymizedKeywords.map((text, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {text}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto p-0 ml-1"
                          onClick={() => removeTextToReplace(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCategoryCancel}
              disabled={uploading}
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleCategoryConfirm}
              disabled={!selectedFile || uploading}
            >
              {uploading ? 'Wird hochgeladen...' : 'Hochladen'}
            </Button>
          </DialogFooter>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
          />
        </DialogContent>
      </Dialog>

      {/* Analysis Details Sidenav */}
      {sidenavOpen && selectedAnalysis && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-opacity-50 transition-opacity"
            onClick={() => setSidenavOpen(false)}
          />

          {/* Sidenav */}
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl transform transition-transform">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b bg-slate-50">
                <div className="flex items-center space-x-2">
                  <Scale className="h-5 w-5 text-blue-600" />
                  <h2 className="text-lg font-semibold">Detaillierte Analyse-Ergebnisse</h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidenavOpen(false)}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Analysis Overview */}
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Analyse-ID</Label>
                    <p className="text-sm font-mono bg-muted p-2 rounded">{selectedAnalysis.analysisId}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Dokument-ID</Label>
                    <p className="text-sm font-mono bg-muted p-2 rounded">{selectedAnalysis.documentId}</p>
                  </div>
                </div>

                {/* Document Context Details */}
                {selectedAnalysis.documentContext && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold">Dokumentkontext</h3>
                    <div className="p-4 border rounded-lg bg-slate-50 space-y-4">
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Dokumenttyp</Label>
                          <Badge variant="outline" className="text-sm">
                            {selectedAnalysis.documentContext.documentType}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Geschäftsbereich</Label>
                          <Badge variant="outline" className="text-sm">
                            {selectedAnalysis.documentContext.businessDomain}
                          </Badge>
                        </div>
                      </div>

                      {selectedAnalysis.documentContext.keyTerms && selectedAnalysis.documentContext.keyTerms.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Schlüsselbegriffe</Label>
                          <div className="flex flex-wrap gap-2">
                            {selectedAnalysis.documentContext.keyTerms.map((term: string, index: number) => (
                              <Badge key={index} variant="secondary" className="text-sm">
                                {term}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedAnalysis.documentContext.contextDescription && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Kontextbeschreibung</Label>
                          <p className="text-sm text-slate-700 bg-white p-3 rounded border">
                            {selectedAnalysis.documentContext.contextDescription}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Overall Compliance Details */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Gesamtbewertung</h3>
                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Status:</span>
                      <Badge variant={selectedAnalysis.overallCompliance?.isCompliant ? "default" : "destructive"}>
                        {selectedAnalysis.overallCompliance?.isCompliant ? "Konform" : "Nicht konform"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Compliance-Score:</span>
                      <span className="font-mono">{Math.round((selectedAnalysis.overallCompliance?.complianceScore || 0) * 100)}%</span>
                    </div>
                    <div className="space-y-2">
                      <span className="font-medium">Zusammenfassung:</span>
                      <p className="text-sm text-muted-foreground">{selectedAnalysis.overallCompliance?.summary}</p>
                    </div>
                  </div>
                </div>

                {/* Summary Statistics */}
                {selectedAnalysis.summary && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold">Statistiken</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <div className="text-2xl font-bold">{selectedAnalysis.summary.totalSections}</div>
                        <div className="text-xs text-muted-foreground">Abschnitte</div>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{selectedAnalysis.summary.compliantSections}</div>
                        <div className="text-xs text-muted-foreground">Konform</div>
                      </div>
                      <div className="text-center p-3 bg-red-50 rounded-lg">
                        <div className="text-2xl font-bold text-red-600">{selectedAnalysis.summary.totalViolations}</div>
                        <div className="text-xs text-muted-foreground">Verstöße</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Detailed Sections */}
                {selectedAnalysis.sections && selectedAnalysis.sections.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold">Detaillierte Abschnitts-Analyse</h3>
                    <div className="space-y-4">
                      {selectedAnalysis.sections.map((section: SwissObligationSectionResult, index: number) => (
                        <div key={section.sectionId || index} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium">Abschnitt {index + 1}</h4>
                            <div className="flex items-center space-x-2">
                              <Badge variant={section.isCompliant ? "default" : "destructive"} className="text-xs">
                                {section.isCompliant ? "Konform" : "Nicht konform"}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Vertrauen: {Math.round((section.confidence || 0) * 100)}%
                              </span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Inhalt:</Label>
                            <p className="text-sm bg-muted p-3 rounded max-h-32 overflow-y-auto">{section.title}</p>
                          </div>

                          {section.complianceAnalysis?.reasoning && (
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">Rechtliche Begründung:</Label>
                              <p className="text-sm text-muted-foreground bg-gray-50 p-3 rounded">{section.complianceAnalysis.reasoning}</p>
                            </div>
                          )}

                          {/* Findings Section */}
                          {section.findings && section.findings.length > 0 && (
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-red-600">Rechtliche Befunde ({section.findings.length}):</Label>
                              <div className="space-y-2">
                                {section.findings.map((finding: any, findingIndex: number) => (
                                  <div key={finding.id || findingIndex} className="text-sm bg-red-50 p-3 rounded border-l-4 border-red-400">
                                    <div className="font-medium text-red-800">{finding.title}</div>
                                    <div className="text-red-700 mt-1">{finding.description}</div>
                                    {finding.severity && (
                                      <Badge variant="destructive" className="mt-2 text-xs">
                                        {finding.severity}
                                      </Badge>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {section.violationCount > 0 && (
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-red-600">Verstöße ({section.violationCount}):</Label>
                              <div className="space-y-1">
                                {section.violations && section.violations.length > 0 ? (
                                  section.violations.map((violation: string, violationIndex: number) => (
                                    <div key={violationIndex} className="text-sm text-red-600 bg-red-50 p-2 rounded">
                                      • {violation}
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
                                    {section.violationCount} potenzielle Verstöße identifiziert
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timestamps */}
                <div className="grid grid-cols-1 gap-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Erstellt am:</Label>
                    <p className="text-sm text-muted-foreground">
                      {selectedAnalysis.createdAt ? new Date(selectedAnalysis.createdAt).toLocaleString('de-DE') : 'Unbekannt'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Abgeschlossen am:</Label>
                    <p className="text-sm text-muted-foreground">
                      {selectedAnalysis.completedAt ? new Date(selectedAnalysis.completedAt).toLocaleString('de-DE') : 'Unbekannt'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </MainLayout>
  );
}
