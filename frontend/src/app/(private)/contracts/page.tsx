'use client';

import MainLayout from '@/components/layouts/main-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useDocumentUpload, useDocuments } from '@/lib/hooks/useApi';
import { useRef, useState, useEffect } from 'react';
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
} from 'lucide-react';


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
  const { getDocuments, deleteDocument, getDocumentText, analyzeSwissObligationLaw, documents, pagination, loading: documentsLoading, error: documentsError, clearError: clearDocumentsError } = useDocuments();
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
  const [swissAnalysisResults, setSwissAnalysisResults] = useState<any>(null);
  const [analysisDetailsOpen, setAnalysisDetailsOpen] = useState(false);
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

  // Group documents by category
  const groupedDocuments = documents.reduce((groups: Record<string, any[]>, document) => {
    const category = document.documentMetadata?.category || 'other';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(document);
    return groups;
  }, {});

  // Fetch documents on component mount
  useEffect(() => {
    getDocuments({
      page: 1,
      limit: 10,
      sortBy: 'uploadedAt',
      sortOrder: 'desc'
    });
  }, [getDocuments]);

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
    setSwissAnalysisResults(null);

    try {
      const result = await analyzeSwissObligationLaw(documentId);

      if (result.success && result.data) {
        setSwissAnalysisResults(result.data);
        toast({
          variant: "success",
          title: "Analyse abgeschlossen",
          description: `Schweizer Obligationenrecht-Analyse für "${fileName}" wurde erfolgreich durchgeführt.`
        });
      } else {
        toast({
          variant: "destructive",
          title: "Analyse fehlgeschlagen",
          description: result.error || "Fehler bei der Schweizer Obligationenrecht-Analyse."
        });
      }
    } catch (err) {
      console.error('Swiss obligation analysis error:', err);
      toast({
        variant: "destructive",
        title: "Analyse fehlgeschlagen",
        description: "Unerwarteter Fehler bei der Schweizer Obligationenrecht-Analyse."
      });
    } finally {
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
                          <TableHead>Titel</TableHead>
                          <TableHead>Risiko</TableHead>
                          <TableHead>Hochgeladen</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Aktionen</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryDocuments.map((document) => (
                          <TableRow key={document.documentId}>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{document.documentMetadata.fileName || document.documentMetadata.originalName || 'Unbekannt'}</div>
                                <div className="text-sm text-muted-foreground">
                                  {document.documentMetadata.uploadedAt ? new Date(document.documentMetadata.uploadedAt).toLocaleDateString('de-DE') : 'Unbekannt'} • {document.documentMetadata.size ? `${(document.documentMetadata.size / 1024 / 1024).toFixed(1)} MB` : 'Unbekannt'}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {getRiskBadge(document.documentMetadata.riskLevel || 'unknown')}
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
                                  <Eye className="h-4 w-4" />
                                  <span className="sr-only">Details</span>
                                </Button>
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

        {/* Swiss Obligation Analysis Results */}
        {swissAnalysisResults && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Scale className="h-5 w-5" />
                <span>Schweizer Obligationenrecht-Analyse</span>
              </CardTitle>
              <div className="text-sm text-muted-foreground">
                Analyse-ID: {swissAnalysisResults.analysisId} • {swissAnalysisResults.sections?.length || 0} Abschnitte analysiert
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Overall Compliance */}
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">Gesamtbewertung</h3>
                    <Badge variant={swissAnalysisResults.overallCompliance?.isCompliant ? "default" : "destructive"}>
                      {swissAnalysisResults.overallCompliance?.isCompliant ? "Konform" : "Nicht konform"}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mb-2">
                    Compliance-Score: {Math.round((swissAnalysisResults.overallCompliance?.complianceScore || 0) * 100)}%
                  </div>
                  <p className="text-sm">{swissAnalysisResults.overallCompliance?.summary}</p>
                </div>

                {/* Summary Statistics */}
                {swissAnalysisResults.summary && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-2xl font-bold">{swissAnalysisResults.summary.totalSections}</div>
                      <div className="text-xs text-muted-foreground">Abschnitte</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{swissAnalysisResults.summary.compliantSections}</div>
                      <div className="text-xs text-muted-foreground">Konform</div>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded-lg">
                      <div className="text-2xl font-bold text-red-600">{swissAnalysisResults.summary.totalViolations}</div>
                      <div className="text-xs text-muted-foreground">Verstöße</div>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{swissAnalysisResults.summary.totalRecommendations}</div>
                      <div className="text-xs text-muted-foreground">Empfehlungen</div>
                    </div>
                  </div>
                )}

                {/* Sections Overview */}
                {swissAnalysisResults.sections && swissAnalysisResults.sections.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold">Abschnitte</h3>
                    <div className="space-y-2">
                      {swissAnalysisResults.sections.map((section: any, index: number) => (
                        <div key={section.sectionId || index} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-sm">{section.title}</div>
                              <div className="text-xs text-muted-foreground">
                                {section.violationCount} Verstöße • {section.recommendationCount} Empfehlungen
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Badge variant={section.isCompliant ? "default" : "destructive"} className="text-xs">
                                {section.isCompliant ? "Konform" : "Nicht konform"}
                              </Badge>
                              <div className="text-xs text-muted-foreground">
                                {Math.round((section.confidence || 0) * 100)}%
                              </div>
                            </div>
                          </div>

                          {/* Preview of violations and recommendations */}
                          {(section.violations?.length > 0 || section.recommendations?.length > 0) && (
                            <div className="space-y-1 pt-2 border-t">
                              {section.violations?.length > 0 && (
                                <div className="space-y-1">
                                  <div className="text-xs font-medium text-red-600">Verstöße:</div>
                                  {section.violations.slice(0, 2).map((violation: string, violationIndex: number) => (
                                    <div key={violationIndex} className="text-xs text-red-600 bg-red-50 p-1 rounded">
                                      • {violation.length > 100 ? violation.substring(0, 100) + '...' : violation}
                                    </div>
                                  ))}
                                  {section.violations.length > 2 && (
                                    <div className="text-xs text-red-500 italic">
                                      +{section.violations.length - 2} weitere Verstöße
                                    </div>
                                  )}
                                </div>
                              )}

                              {section.recommendations?.length > 0 && (
                                <div className="space-y-1">
                                  <div className="text-xs font-medium text-blue-600">Empfehlungen:</div>
                                  {section.recommendations.slice(0, 2).map((recommendation: string, recommendationIndex: number) => (
                                    <div key={recommendationIndex} className="text-xs text-blue-600 bg-blue-50 p-1 rounded">
                                      • {recommendation.length > 100 ? recommendation.substring(0, 100) + '...' : recommendation}
                                    </div>
                                  ))}
                                  {section.recommendations.length > 2 && (
                                    <div className="text-xs text-blue-500 italic">
                                      +{section.recommendations.length - 2} weitere Empfehlungen
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-between items-center pt-4 border-t">
                  <span className="text-xs text-muted-foreground">
                    Erstellt: {swissAnalysisResults.createdAt ? new Date(swissAnalysisResults.createdAt).toLocaleString('de-DE') : 'Unbekannt'}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAnalysisDetailsOpen(true)}
                  >
                    Details anzeigen
                  </Button>
                </div>
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

      {/* Analysis Details Dialog */}
      <Dialog open={analysisDetailsOpen} onOpenChange={setAnalysisDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Scale className="h-5 w-5" />
              <span>Detaillierte Analyse-Ergebnisse</span>
            </DialogTitle>
            <DialogDescription>
              Vollständige Ergebnisse der Schweizer Obligationenrecht-Analyse
            </DialogDescription>
          </DialogHeader>

          {swissAnalysisResults && (
            <div className="space-y-6">
              {/* Analysis Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Analyse-ID</Label>
                  <p className="text-sm font-mono bg-muted p-2 rounded">{swissAnalysisResults.analysisId}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Dokument-ID</Label>
                  <p className="text-sm font-mono bg-muted p-2 rounded">{swissAnalysisResults.documentId}</p>
                </div>
              </div>

              {/* Overall Compliance Details */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Gesamtbewertung</h3>
                <div className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Status:</span>
                    <Badge variant={swissAnalysisResults.overallCompliance?.isCompliant ? "default" : "destructive"}>
                      {swissAnalysisResults.overallCompliance?.isCompliant ? "Konform" : "Nicht konform"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Compliance-Score:</span>
                    <span className="font-mono">{Math.round((swissAnalysisResults.overallCompliance?.complianceScore || 0) * 100)}%</span>
                  </div>
                  <div className="space-y-2">
                    <span className="font-medium">Zusammenfassung:</span>
                    <p className="text-sm text-muted-foreground">{swissAnalysisResults.overallCompliance?.summary}</p>
                  </div>
                </div>
              </div>

              {/* Detailed Sections */}
              {swissAnalysisResults.sections && swissAnalysisResults.sections.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Detaillierte Abschnitts-Analyse</h3>
                  <div className="space-y-4">
                    {swissAnalysisResults.sections.map((section: any, index: number) => (
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

                        {section.reasoning && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Rechtliche Begründung:</Label>
                            <p className="text-sm text-muted-foreground bg-gray-50 p-3 rounded">{section.reasoning}</p>
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

                        {section.recommendationCount > 0 && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-blue-600">Empfehlungen ({section.recommendationCount}):</Label>
                            <div className="space-y-1">
                              {section.recommendations && section.recommendations.length > 0 ? (
                                section.recommendations.map((recommendation: string, recommendationIndex: number) => (
                                  <div key={recommendationIndex} className="text-sm text-blue-600 bg-blue-50 p-2 rounded">
                                    • {recommendation}
                                  </div>
                                ))
                              ) : (
                                <p className="text-sm text-blue-600 bg-blue-50 p-2 rounded">
                                  {section.recommendationCount} Empfehlungen zur Verbesserung
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Erstellt am:</Label>
                  <p className="text-sm text-muted-foreground">
                    {swissAnalysisResults.createdAt ? new Date(swissAnalysisResults.createdAt).toLocaleString('de-DE') : 'Unbekannt'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Abgeschlossen am:</Label>
                  <p className="text-sm text-muted-foreground">
                    {swissAnalysisResults.completedAt ? new Date(swissAnalysisResults.completedAt).toLocaleString('de-DE') : 'Unbekannt'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAnalysisDetailsOpen(false)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
