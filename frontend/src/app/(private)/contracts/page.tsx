'use client';

import MainLayout from '@/components/layouts/main-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/lib/hooks/use-toast';
import { useDocuments, useDocumentUpload } from '@/lib/hooks/useApi';
import { useJobMonitor } from '@/lib/contexts/JobMonitorContext';
import { useAuthStore } from '@/lib/stores/authStore';
import { SwissObligationAnalysisResult, SwissObligationSectionResult } from '@/types';
import { AlertCircle, CheckCircle, ChevronDown, ChevronRight, Clock, Download, FileSearch, FileText, Filter, MessageSquare, Plus, Scale, Search, Trash2, TrendingUp, Upload, UserCheck, X, } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink } from "lucide-react";
import { useSearchParams } from 'next/navigation';



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
      return <CheckCircle className="h-4 w-4 text-green-500"/>;
    case 'processing':
      return <Clock className="h-4 w-4 text-blue-500"/>;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500"/>;
    default:
      return <FileText className="h-4 w-4 text-gray-500"/>;
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

// Inner component that uses the JobMonitor context
function ContractsPageContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('analyzed');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contractQuestionsFileInputRef = useRef<HTMLInputElement>(null);
  const { uploadDocumentDirect, uploadContractForQuestions, getContractQuestionsDocuments, askDocumentQuestion, uploading, uploadProgress, error, clearError } = useDocumentUpload();
  const {
    getDocuments,
    deleteDocument,
    getDocumentText,
    analyzeContract,
    getJobStatus,
    getUserJobs,
    getSwissObligationAnalysesByDocumentId,
    getSharedSwissObligationAnalyses,
    startLawyerReview,
    submitLawyerAnalysisResult,
    getAllUserDocuments,
    documents,
    pagination,
    loading: documentsLoading,
    error: documentsError,
    clearError: clearDocumentsError
  } = useDocuments();
  const [dragActive, setDragActive] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<{ id: string, name: string } | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [contractQuestionsDialogOpen, setContractQuestionsDialogOpen] = useState(false);
  const [allUserDocuments, setAllUserDocuments] = useState<any[]>([]);
  const [allDocumentsLoading, setAllDocumentsLoading] = useState(false);
  const [contractQuestionsDocuments, setContractQuestionsDocuments] = useState<any[]>([]);
  const [contractQuestionsLoading, setContractQuestionsLoading] = useState(false);

  // Question dialog state
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const [selectedDocumentForQuestion, setSelectedDocumentForQuestion] = useState<any>(null);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [questionAnswer, setQuestionAnswer] = useState('');
  const [askingQuestion, setAskingQuestion] = useState(false);

  // Function to load all user documents
  const loadAllUserDocuments = async (tag?: string) => {
    setAllDocumentsLoading(true);
    try {
      const result = await getAllUserDocuments(tag);
      if (result.success && result.data) {
        setAllUserDocuments(result.data.documents);
      }
    } catch (error) {
      console.error('Error loading all user documents:', error);
    } finally {
      setAllDocumentsLoading(false);
    }
  };

  // Function to load contract questions documents
  const loadContractQuestionsDocuments = async () => {
    setContractQuestionsLoading(true);
    try {
      const documents = await getContractQuestionsDocuments();
      if (documents) {
        setContractQuestionsDocuments(documents);
      }
    } catch (error) {
      console.error('Error loading contract questions documents:', error);
    } finally {
      setContractQuestionsLoading(false);
    }
  };

  // Function to load shared analyses for lawyers
  const loadSharedAnalyses = async () => {
    setSharedAnalysesLoading(true);
    try {
      const result = await getSharedSwissObligationAnalyses(10);
      if (result.success && result.data) {
        setSharedAnalyses(result.data.analyses || []);
      }
    } catch (error) {
      console.error('Error loading shared analyses:', error);
    } finally {
      setSharedAnalysesLoading(false);
    }
  };
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'contract' | 'nda' | 'terms_conditions' | 'other'>('contract');
  const [extractedText, setExtractedText] = useState<string>('');
  const [extractingText, setExtractingText] = useState<boolean>(false);
  const [extractedDocumentInfo, setExtractedDocumentInfo] = useState<{ fileName: string, documentId: string } | null>(null);
  const [anonymizedKeywords, setAnonymizedKeywords] = useState<Array<{keyword: string, replaceWith: string}>>([]);
  const [currentTextInput, setCurrentTextInput] = useState('');
  const [swissAnalysisLoading, setSwissAnalysisLoading] = useState<string | null>(null);
  const [documentAnalyses, setDocumentAnalyses] = useState<Record<string, SwissObligationAnalysisResult[]>>({});
  const [selectedAnalysis, setSelectedAnalysis] = useState<SwissObligationAnalysisResult | null>(null);
  const [sidenavOpen, setSidenavOpen] = useState(false);
  const [sharedAnalyses, setSharedAnalyses] = useState<SwissObligationAnalysisResult[]>([]);
  const [sharedAnalysesLoading, setSharedAnalysesLoading] = useState(false);

  // Lawyer decision modal state
  const [lawyerDecisionModalOpen, setLawyerDecisionModalOpen] = useState(false);
  const [selectedAnalysisForDecision, setSelectedAnalysisForDecision] = useState<SwissObligationAnalysisResult | null>(null);
  const [lawyerDecision, setLawyerDecision] = useState<'APPROVED' | 'DECLINE' | null>(null);
  const [lawyerComment, setLawyerComment] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [deletingDocument, setDeletingDocument] = useState(false);

  const { toast } = useToast();
  const { startJobMonitoring, activeJobs } = useJobMonitor();
  const { userProfile } = useAuthStore();

  // Handle query parameter for tab switching
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'generated') {
      setActiveTab('all');
      // Load generated documents when switching to this tab
      loadAllUserDocuments('generated');
    }
  }, [searchParams]);

  // Helper functions for managing texts to replace
  const addTextToReplace = () => {
    if (currentTextInput.trim() && !anonymizedKeywords.some(item => item.keyword === currentTextInput.trim())) {
      const newReplaceWith = `ANONYM_${anonymizedKeywords.length + 1}`;
      setAnonymizedKeywords([...anonymizedKeywords, { keyword: currentTextInput.trim(), replaceWith: newReplaceWith }]);
      setCurrentTextInput('');
    }
  };

  const removeTextToReplace = (index: number) => {
    const updatedKeywords = anonymizedKeywords.filter((_, i) => i !== index);
    // Re-number the replaceWith values to maintain sequential numbering
    const renumberedKeywords = updatedKeywords.map((item, idx) => ({
      ...item,
      replaceWith: `ANONYM_${idx + 1}`
    }));
    setAnonymizedKeywords(renumberedKeywords);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTextToReplace();
    }
  };

  // Helper function for handling analysis details
  const handleAnalysisRowClick = (analysis: SwissObligationAnalysisResult) => {
    setSelectedAnalysis(analysis);
    setSidenavOpen(true);
  };

  // Helper function to check if a document has an active analysis job
  const isDocumentAnalysisRunning = (documentId: string) => {
    return activeJobs.some(job => 
      job.type === 'contract-analysis' &&
      job.documentId === documentId
    );
  };

  // Handler for opening lawyer decision modal
  const handleOpenLawyerDecisionModal = (analysis: SwissObligationAnalysisResult) => {
    setSelectedAnalysisForDecision(analysis);
    setLawyerDecision(null);
    setLawyerComment('');
    setLawyerDecisionModalOpen(true);
  };

  // Handler for closing lawyer decision modal
  const handleCloseLawyerDecisionModal = () => {
    setLawyerDecisionModalOpen(false);
    setSelectedAnalysisForDecision(null);
    setLawyerDecision(null);
    setLawyerComment('');
  };

  // Handler for submitting lawyer decision
  const handleSubmitLawyerDecision = async () => {
    if (!selectedAnalysisForDecision || !lawyerDecision) {
      toast({
        variant: 'destructive',
        title: 'Fehler',
        description: 'Bitte wählen Sie eine Entscheidung aus.'
      });
      return;
    }

    if (lawyerDecision === 'DECLINE' && !lawyerComment.trim()) {
      toast({
        variant: 'destructive',
        title: 'Kommentar erforderlich',
        description: 'Bei einer Ablehnung ist ein Kommentar erforderlich.'
      });
      return;
    }

    setSubmittingDecision(true);

    try {
      const result = await submitLawyerAnalysisResult(
        selectedAnalysisForDecision.analysisId,
        lawyerDecision,
        lawyerDecision === 'DECLINE' ? lawyerComment : undefined
      );

      if (result.success) {
        toast({
          variant: 'success',
          title: 'Entscheidung gespeichert',
          description: lawyerDecision === 'APPROVED' 
            ? 'Die Analyse wurde erfolgreich genehmigt.' 
            : 'Die Analyse wurde erfolgreich abgelehnt.'
        });

        // Close modal and reload shared analyses
        handleCloseLawyerDecisionModal();
        loadSharedAnalyses();
      } else {
        toast({
          variant: 'destructive',
          title: 'Fehler beim Speichern',
          description: result.error || 'Unerwarteter Fehler beim Speichern der Entscheidung.'
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Netzwerkfehler',
        description: 'Fehler beim Speichern der Entscheidung. Bitte versuchen Sie es erneut.'
      });
    } finally {
      setSubmittingDecision(false);
    }
  };

  // Helper function to get analysis status for a document
  const getDocumentAnalysisStatus = (documentId: string) => {
    const runningJob = activeJobs.find(job => 
      job.type === 'contract-analysis' &&
      job.documentId === documentId
    );
    return runningJob ? 'running' : 'idle';
  };

  // Helper function to translate lawyer status
  const translateLawyerStatus = (status: string) => {
    switch (status) {
      case 'CHECK_PENDING':
        return 'In Bearbeitung';
      case 'APPROVED':
        return 'Genehmigt';
      case 'DECLINE':
        return 'Abgelehnt';
      default:
        return '';
    }
  };

  // State for lawyer comment modal
  const [lawyerCommentModalOpen, setLawyerCommentModalOpen] = useState(false);
  const [selectedLawyerComment, setSelectedLawyerComment] = useState<string>('');

  // Handler for opening lawyer comment modal
  const handleOpenLawyerCommentModal = (comment: string) => {
    setSelectedLawyerComment(comment);
    setLawyerCommentModalOpen(true);
  };

  // Handler for closing lawyer comment modal
  const handleCloseLawyerCommentModal = () => {
    setLawyerCommentModalOpen(false);
    setSelectedLawyerComment('');
  };


  // Group documents by category (contract_questions documents are already filtered out in the backend)
  const groupedDocuments = documents
    .reduce((groups: Record<string, any[]>, document) => {
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

  // Load analyses for a single document
  const loadSingleDocumentAnalysis = async (documentId: string) => {
    try {
      const result = await getSwissObligationAnalysesByDocumentId(documentId);
      if (result.success && result.data?.analyses) {
        setDocumentAnalyses(prev => ({
          ...prev,
          [documentId]: result.data.analyses
        }));
      } else {
        // Remove analyses if none found
        setDocumentAnalyses(prev => {
          const newAnalyses = { ...prev };
          delete newAnalyses[documentId];
          return newAnalyses;
        });
      }
    } catch (err) {
      console.error(`Error loading analysis for document ${documentId}:`, err);
    }
  };

  // Fetch documents on component mount
  useEffect(() => {
    if (userProfile?.role === 'lawyer') {
      // For lawyers, load shared analyses instead of documents
      loadSharedAnalyses();
    } else {
      // For regular users, load documents as usual
      getDocuments({
        page: 1,
        limit: 10,
        sortBy: 'uploadedAt',
        sortOrder: 'desc'
      });
    }
  }, [getDocuments, userProfile?.role]);

  // Load analyses when documents are loaded
  useEffect(() => {
    if (documents.length > 0) {
      loadAllDocumentAnalyses(documents);
    }
  }, [documents]);

  // Track previous jobs to detect completed jobs
  const previousJobsRef = useRef<Map<string, { jobId: string; documentId?: string }>>(new Map());

  // Monitor active jobs and update only specific document rows when Swiss obligation analysis completes
  useEffect(() => {
    // Create a map of current Swiss obligation analysis jobs
    const currentSwissJobs = new Map<string, { jobId: string; documentId?: string }>();
    activeJobs
      .filter(job => job.type === 'contract-analysis')
      .forEach(job => {
        currentSwissJobs.set(job.jobId, { jobId: job.jobId, documentId: job.documentId });
      });

    // Check if any Swiss obligation analysis jobs have completed (removed from active jobs)
    const completedJobs: { jobId: string; documentId?: string }[] = [];
    previousJobsRef.current.forEach((jobInfo, jobId) => {
      if (!currentSwissJobs.has(jobId)) {
        completedJobs.push(jobInfo);
      }
    });

    // If jobs completed, update only the specific document analyses instead of reloading entire table
    if (completedJobs.length > 0) {
      console.log('Swiss obligation analysis completed, updating specific document rows...');
      completedJobs.forEach(({ documentId }) => {
        if (documentId) {
          loadSingleDocumentAnalysis(documentId);
        }
      });
    }

    // Update the previous jobs for next comparison
    previousJobsRef.current = currentSwissJobs;
  }, [activeJobs, loadSingleDocumentAnalysis]);


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
        variant: 'destructive',
        title: 'Ungültiger Dateityp',
        description: 'Nur PDF und Word-Dokumente sind erlaubt.'
      });
      return;
    }

    // Validate file size (50MB max)
    if (file.size > 52428800) {
      toast({
        variant: 'destructive',
        title: 'Datei zu groß',
        description: 'Die Datei ist zu groß. Maximale Größe: 50MB'
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
          variant: 'success',
          title: 'Upload erfolgreich',
          description: 'Vertrag wurde erfolgreich hochgeladen! Eine Vertragsanalyse wird automatisch gestartet.'
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
        variant: 'destructive',
        title: 'Upload fehlgeschlagen',
        description: 'Fehler beim Hochladen des Vertrags.'
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

  const handleContractQuestionsUpload = () => {
    setContractQuestionsDialogOpen(true);
  };

  const handleContractQuestionsFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];

    // Close the dialog immediately after file selection
    setContractQuestionsDialogOpen(false);

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown'
    ];

    if (!allowedTypes.includes(file.type)) {
      toast({
        variant: 'destructive',
        title: 'Ungültiger Dateityp',
        description: 'Bitte wählen Sie eine PDF-, DOCX-, DOC-, TXT- oder MD-Datei aus.'
      });
      return;
    }

    try {
      const result = await uploadContractForQuestions(file, {
        description: `Vertrag für Fragen: ${file.name}`,
        tags: ['contract_questions', 'vector_store']
      });

      if (result) {
        toast({
          variant: 'success',
          title: 'Vertrag hochgeladen',
          description: `${file.name} wurde erfolgreich hochgeladen und ist bereit für Fragen!`
        });

        // Refresh the contract questions documents list to show the new contract
        loadContractQuestionsDocuments();
      }
    } catch (err) {
      console.error('Contract questions upload error:', err);
      toast({
        variant: 'destructive',
        title: 'Upload fehlgeschlagen',
        description: 'Fehler beim Hochladen des Vertrags für Fragen.'
      });
    }
  };

  // Question dialog handlers
  const handleOpenQuestionDialog = (document: any) => {
    if (!document.documentMetadata.vectorStoreId) {
      toast({
        variant: 'destructive',
        title: 'Dokument nicht bereit',
        description: 'Dieses Dokument ist noch nicht bereit für Fragen. Bitte warten Sie, bis die Verarbeitung abgeschlossen ist.'
      });
      return;
    }

    setSelectedDocumentForQuestion(document);
    setCurrentQuestion('');
    setQuestionAnswer('');
    setQuestionDialogOpen(true);
  };

  const handleCloseQuestionDialog = () => {
    setQuestionDialogOpen(false);
    setSelectedDocumentForQuestion(null);
    setCurrentQuestion('');
    setQuestionAnswer('');
  };

  const handleSubmitQuestion = async () => {
    if (!currentQuestion.trim() || !selectedDocumentForQuestion) {
      return;
    }

    setAskingQuestion(true);
    try {
      const result = await askDocumentQuestion(
        currentQuestion.trim(),
        selectedDocumentForQuestion.documentMetadata.vectorStoreId
      );

      if (result) {
        // Handle both structured and unstructured responses
        if (result.is_structured && result.structured_answer) {
          setQuestionAnswer(JSON.stringify(result.structured_answer));
        } else {
          setQuestionAnswer(result.answer || 'Keine Antwort erhalten');
        }
        toast({
          variant: 'success',
          title: 'Frage beantwortet',
          description: 'Die Antwort wurde erfolgreich generiert.'
        });
      }
    } catch (err) {
      console.error('Question submission error:', err);
      toast({
        variant: 'destructive',
        title: 'Fehler beim Stellen der Frage',
        description: 'Es gab einen Fehler beim Verarbeiten Ihrer Frage.'
      });
    } finally {
      setAskingQuestion(false);
    }
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

    setDeletingDocument(true);

    try {
      const success = await deleteDocument(documentToDelete.id);
      if (success) {
        toast({
          variant: 'success',
          title: 'Dokument gelöscht',
          description: 'Dokument wurde erfolgreich gelöscht!'
        });

        // Check if the deleted document was a contract questions document
        const isContractQuestionsDocument = contractQuestionsDocuments.some(
          doc => doc.documentId === documentToDelete.id
        );

        if (isContractQuestionsDocument) {
          // Refresh the contract questions documents list
          loadContractQuestionsDocuments();
        } else {
          // Refresh the main documents list
          getDocuments({
            page: 1,
            limit: 10,
            sortBy: 'uploadedAt',
            sortOrder: 'desc'
          });
        }
      } else {
        toast({
          variant: 'destructive',
          title: 'Löschen fehlgeschlagen',
          description: 'Fehler beim Löschen des Dokuments.'
        });
      }
    } catch (err) {
      console.error('Delete error:', err);
      toast({
        variant: 'destructive',
        title: 'Löschen fehlgeschlagen',
        description: 'Fehler beim Löschen des Dokuments.'
      });
    } finally {
      setDeletingDocument(false);
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
          variant: 'success',
          title: 'Text extrahiert',
          description: `Text wurde erfolgreich aus "${result.data.fileName}" extrahiert.`
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Textextraktion fehlgeschlagen',
          description: result.error || 'Fehler beim Extrahieren des Texts.'
        });
      }
    } catch (err) {
      console.error('Text extraction error:', err);
      toast({
        variant: 'destructive',
        title: 'Textextraktion fehlgeschlagen',
        description: 'Unerwarteter Fehler beim Extrahieren des Texts.'
      });
    } finally {
      setExtractingText(false);
    }
  };

  const handleContractAnalysis = async (documentId: string, fileName: string) => {
    try {
      // Start the analysis job
      const result = await analyzeContract(documentId);

      if (result.success && result.data?.jobId) {
        // Start monitoring the job immediately for instant feedback
        startJobMonitoring(result.data.jobId, 'contract-analysis', documentId, fileName);

        toast({
          title: 'Analyse gestartet',
          description: `Schweizer Obligationenrecht-Analyse für "${fileName}" wurde im Hintergrund gestartet. Sie erhalten eine Benachrichtigung, wenn die Analyse abgeschlossen ist.`
        });

        // Clear loading state immediately since job monitoring will handle the rest
        setSwissAnalysisLoading(null);
      } else {
        toast({
          variant: 'destructive',
          title: 'Analyse fehlgeschlagen',
          description: result.error || 'Fehler beim Starten der Schweizer Obligationenrecht-Analyse.'
        });
        setSwissAnalysisLoading(null);
      }
    } catch (err: any) {
      console.error('Swiss obligation analysis error:', err);
      toast({
        variant: 'destructive',
        title: 'Analyse fehlgeschlagen',
        description: 'Unerwarteter Fehler beim Starten der Schweizer Obligationenrecht-Analyse.'
      });
      setSwissAnalysisLoading(null);
    }
  };

  const handleStartLawyerReview = async (documentId: string, fileName: string) => {
    try {
      const result = await startLawyerReview(documentId);

      if (result.success) {
        toast({
          title: 'Anwaltsprüfung gestartet',
          description: `Die Analyse für "${fileName}" wird durch einen Anwalt erledigt.`
        });

        // Reload the contract table to reflect the updated lawyer status
        await loadSingleDocumentAnalysis(documentId);
      } else {
        toast({
          variant: 'destructive',
          title: 'Anwaltsprüfung fehlgeschlagen',
          description: result.error || 'Fehler beim Starten der Anwaltsprüfung.'
        });
      }
    } catch (err: any) {
      console.error('Lawyer review error:', err);
      toast({
        variant: 'destructive',
        title: 'Anwaltsprüfung fehlgeschlagen',
        description: 'Unerwarteter Fehler beim Starten der Anwaltsprüfung.'
      });
    }
  };

  return (
    <>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Verträge</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Verwalten und analysieren Sie Ihre Rechtsdokumente
            </p>
          </div>
        </div>

        {/* Filters and Search */}
        {false && (
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
                <Input
                  placeholder="Verträge durchsuchen..."
                  className="pl-9"
                />
              </div>
            </div>
            <Button variant="outline">
              <Filter className="mr-2 h-4 w-4"/>
              Filter
            </Button>
          </div>
        )}
        {/* Modern Unified Contract Management Interface */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="text-center mb-4 sm:mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Vertragsmanagement</h2>
            <p className="text-sm sm:text-base text-gray-600">Verwalten Sie Ihre Verträge, Dokumente und Fragen an einem zentralen Ort</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 h-auto p-1 bg-white border border-gray-200 rounded-xl shadow-sm gap-1 sm:gap-0">
            <TabsTrigger 
              value="analyzed" 
              className="flex flex-col sm:flex-col items-center gap-1 sm:gap-2 py-3 sm:py-4 px-3 sm:px-6 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:border-blue-200 data-[state=active]:shadow-sm rounded-lg transition-all duration-200 hover:bg-gray-50"
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="font-medium text-sm sm:text-base">
                  {userProfile?.role === 'lawyer' ? 'Zu prüfende Dokumente' : 'Analysierte Verträge'}
                </span>
              </div>
              <span className="text-xs text-gray-500 hidden sm:block">Risikoanalyse & Compliance</span>
            </TabsTrigger>
            <TabsTrigger 
              value="questions" 
              onClick={() => loadContractQuestionsDocuments()}
              className="flex flex-col sm:flex-col items-center gap-1 sm:gap-2 py-3 sm:py-4 px-3 sm:px-6 data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700 data-[state=active]:border-purple-200 data-[state=active]:shadow-sm rounded-lg transition-all duration-200 hover:bg-gray-50"
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium text-sm sm:text-base">Vertragsfragen</span>
              </div>
              <span className="text-xs text-gray-500 hidden sm:block">KI-gestützte Beratung</span>
            </TabsTrigger>
            <TabsTrigger
              value="all"
              onClick={() => loadAllUserDocuments('generated')}
              className="flex flex-col sm:flex-col items-center gap-1 sm:gap-2 py-3 sm:py-4 px-3 sm:px-6 data-[state=active]:bg-green-50 data-[state=active]:text-green-700 data-[state=active]:border-green-200 data-[state=active]:shadow-sm rounded-lg transition-all duration-200 hover:bg-gray-50"
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <span className="font-medium text-sm sm:text-base">Generierte Dokumente</span>
              </div>
              <span className="text-xs text-gray-500 hidden sm:block">Alle erstellten Dokumente</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analyzed" className="mt-6">
            {userProfile?.role !== 'lawyer' && (
              <div className="flex justify-center sm:justify-end mb-6">
                <Button onClick={handleButtonClick} disabled={uploading} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm w-full sm:w-auto">
                  <Upload className="mr-2 h-4 w-4"/>
                  {uploading ? 'Wird hochgeladen...' : 'Vertrag hochladen'}
                </Button>
              </div>
            )}
            <Card className="border-0 shadow-lg bg-white rounded-xl">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-t-xl border-b border-blue-200">
                <CardTitle className="text-lg sm:text-xl font-semibold text-blue-900 flex items-center gap-2 pt-4 sm:pt-6">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {userProfile?.role === 'lawyer' ? 'Zu prüfende Dokumente' : 'Analysierte Verträge'}
                </CardTitle>
                <p className="text-xs sm:text-sm text-blue-700 mt-1">
                  {userProfile?.role === 'lawyer' 
                    ? 'Bewerten Sie die automatischen Analysen und geben Sie Ihr Feedback ab' 
                    : 'Übersicht über alle analysierten Verträge mit Risikobewertung und Compliance-Status'
                  }
                </p>
              </CardHeader>
              <CardContent>
                {userProfile?.role === 'lawyer' ? (
                  // Lawyer view - show shared analyses
                  sharedAnalysesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-sm text-muted-foreground">Lade Dokumente...</div>
                    </div>
                  ) : sharedAnalyses.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-sm text-muted-foreground">Keine zu prüfenden Dokumente gefunden</div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Desktop Table View */}
                      <div className="hidden md:block">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Dokument</TableHead>
                              <TableHead>Risiko</TableHead>
                              <TableHead>Erstellt</TableHead>
                              <TableHead>Aktionen</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sharedAnalyses.map((analysis) => (
                              <TableRow 
                                key={analysis.analysisId}
                                className="cursor-pointer hover:bg-gray-50"
                                onClick={() => handleAnalysisRowClick(analysis)}
                              >
                                <TableCell>
                                  <div className="space-y-1">
                                    <div className="font-medium">{analysis.document.documentMetadata.fileName || analysis.document.documentMetadata.originalName || 'Unbekannt'}</div>
                                    <div className="text-sm text-muted-foreground">
                                      {analysis.document.documentMetadata.uploadedAt ? new Date(analysis.document.documentMetadata.uploadedAt).toLocaleDateString('de-DE') : 'Unbekannt'} • {analysis.document.documentMetadata.size ? `${(analysis.document.documentMetadata.size / 1024 / 1024).toFixed(1)} MB` : 'Unbekannt'}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={analysis.overallCompliance?.isCompliant ? 'default' : 'destructive'} className="text-xs">
                                    {analysis.overallCompliance?.isCompliant ? 'Konform' : 'Nicht konform'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="text-sm">
                                    {new Date(analysis.createdAt).toLocaleDateString('de-DE')}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center space-x-2">
                                    {analysis.document?.downloadUrl && (
                                      <a
                                        href={analysis.document.downloadUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
                                        title="Dokument öffnen"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                      </a>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenLawyerDecisionModal(analysis);
                                      }}
                                      title="Analyse bewerten"
                                    >
                                      <UserCheck className="h-4 w-4"/>
                                      <span className="sr-only">Analyse bewerten</span>
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile Card View */}
                      <div className="md:hidden space-y-4">
                        {sharedAnalyses.map((analysis) => (
                          <Card 
                            key={analysis.analysisId}
                            className="cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => handleAnalysisRowClick(analysis)}
                          >
                            <CardContent className="p-4">
                              <div className="space-y-3">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm truncate">
                                      {analysis.document.documentMetadata.fileName || analysis.document.documentMetadata.originalName || 'Unbekannt'}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {analysis.document.documentMetadata.uploadedAt ? new Date(analysis.document.documentMetadata.uploadedAt).toLocaleDateString('de-DE') : 'Unbekannt'}
                                      {analysis.document.documentMetadata.size && ` • ${(analysis.document.documentMetadata.size / 1024 / 1024).toFixed(1)} MB`}
                                    </div>
                                  </div>
                                  <Badge variant={analysis.overallCompliance?.isCompliant ? 'default' : 'destructive'} className="text-xs ml-2">
                                    {analysis.overallCompliance?.isCompliant ? 'Konform' : 'Nicht konform'}
                                  </Badge>
                                </div>

                                <div className="flex items-center justify-between">
                                  <div className="text-xs text-muted-foreground">
                                    Erstellt: {new Date(analysis.createdAt).toLocaleDateString('de-DE')}
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    {analysis.document?.downloadUrl && (
                                      <a
                                        href={analysis.document.downloadUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
                                        title="Dokument öffnen"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                      </a>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenLawyerDecisionModal(analysis);
                                      }}
                                      title="Analyse bewerten"
                                    >
                                      <UserCheck className="h-4 w-4"/>
                                      <span className="sr-only">Analyse bewerten</span>
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )
                ) : (
                  // Regular user view - show documents
                  documentsLoading ? (
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
                          {/* Desktop Table View */}
                          <div className="hidden md:block">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Titel</TableHead>
                                  <TableHead>Risiko</TableHead>
                                  <TableHead>Hochgeladen</TableHead>
                                  <TableHead>Status Anwalt</TableHead>
                                  <TableHead>Aktionen</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {categoryDocuments.map((document) => (
                                  <React.Fragment key={document.documentId}>
                                    <TableRow 
                                      className={`border-b ${documentAnalyses[document.documentId] && !isDocumentAnalysisRunning(document.documentId) ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                                      onClick={() => documentAnalyses[document.documentId] && !isDocumentAnalysisRunning(document.documentId) && handleAnalysisRowClick(documentAnalyses[document.documentId][0])}
                                    >
                                      <TableCell>
                                        <div className="space-y-1">
                                          <div className="font-medium">{document.documentMetadata.fileName || document.documentMetadata.originalName || 'Unbekannt'}</div>
                                          <div className="text-sm text-muted-foreground">
                                            {document.documentMetadata.uploadedAt ? new Date(document.documentMetadata.uploadedAt).toLocaleDateString('de-DE') : 'Unbekannt'} • {document.documentMetadata.size ? `${(document.documentMetadata.size / 1024 / 1024).toFixed(1)} MB` : 'Unbekannt'}
                                            {isDocumentAnalysisRunning(document.documentId) ? (
                                              <span className="ml-2">
                                                • <span className="text-blue-600 flex items-center"><Clock className="h-3 w-3 mr-1 animate-spin"/>Analyse läuft</span>
                                              </span>
                                            ) : documentAnalyses[document.documentId] && (
                                              <span className="ml-2">
                                                • <span className="text-blue-600">Vertragsanalyse: {Math.round((documentAnalyses[document.documentId][0].overallCompliance?.complianceScore || 0) * 100)}% konform</span>
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        {!isDocumentAnalysisRunning(document.documentId) && documentAnalyses[document.documentId] ? (
                                          <Badge variant={documentAnalyses[document.documentId][0].overallCompliance?.isCompliant ? 'default' : 'destructive'} className="text-xs">
                                            {documentAnalyses[document.documentId][0].overallCompliance?.isCompliant ? 'Konform' : 'Nicht konform'}
                                          </Badge>
                                        ) : (
                                          <span className="text-sm text-muted-foreground">-</span>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <div className="text-sm">
                                          {document.documentMetadata.uploadedAt ? new Date(document.documentMetadata.uploadedAt).toLocaleDateString('de-DE') : 'Unbekannt'}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        {documentAnalyses[document.documentId]?.length > 0 && documentAnalyses[document.documentId][0].lawyerStatus && documentAnalyses[document.documentId][0].lawyerStatus !== 'UNCHECKED' ? (
                                          <div className="flex items-center space-x-2">
                                            <Badge 
                                              variant={
                                                documentAnalyses[document.documentId][0].lawyerStatus === 'APPROVED' ? 'default' :
                                                documentAnalyses[document.documentId][0].lawyerStatus === 'DECLINE' ? 'destructive' :
                                                'secondary'
                                              } 
                                              className="text-xs"
                                            >
                                              {translateLawyerStatus(documentAnalyses[document.documentId][0].lawyerStatus)}
                                            </Badge>
                                            {documentAnalyses[document.documentId][0].lawyerStatus === 'DECLINE' && documentAnalyses[document.documentId][0].lawyerComment && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleOpenLawyerCommentModal(documentAnalyses[document.documentId][0].lawyerComment || '');
                                                }}
                                                title="Kommentar anzeigen"
                                              >
                                                <FileText className="h-3 w-3"/>
                                                <span className="sr-only">Kommentar anzeigen</span>
                                              </Button>
                                            )}
                                          </div>
                                        ) : (
                                          <span className="text-sm text-muted-foreground">-</span>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center space-x-2">
                                          {document.downloadUrl && (
                                            <a
                                              href={document.downloadUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
                                              title="PDF öffnen"
                                            >
                                              <ExternalLink className="h-4 w-4" />
                                            </a>
                                          )}
                                          {/* Just for debugging */}
                                          {false && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleExtractText(document.documentId, document.documentMetadata.fileName || 'Unbekannt');
                                              }}
                                              disabled={extractingText}
                                            >
                                              <FileSearch className="h-4 w-4"/>
                                              <span className="sr-only">Text extrahieren</span>
                                            </Button>
                                          )}
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleContractAnalysis(document.documentId, document.documentMetadata.fileName || 'Unbekannt');
                                            }}
                                            disabled={swissAnalysisLoading === document.documentId || isDocumentAnalysisRunning(document.documentId)}
                                            title={
                                              isDocumentAnalysisRunning(document.documentId)
                                                ? 'Vertragsanalyse läuft bereits - bitte warten Sie bis zum Abschluss'
                                                : documentAnalyses[document.documentId]?.length > 0
                                                ? 'Vertragsanalyse erneut ausführen (überschreibt bestehende Analyse)'
                                                : 'Vertragsanalyse starten'
                                            }
                                          >
                                            <Scale className="h-4 w-4"/>
                                            <span className="sr-only">
                                              {documentAnalyses[document.documentId]?.length > 0
                                                ? 'Analyse erneut ausführen'
                                                : 'Schweizer Obligationenrecht-Analyse'
                                              }
                                            </span>
                                          </Button>
                                          {/* Only show lawyer review button if document has analysis and lawyerStatus is UNCHECKED */}
                                          {documentAnalyses[document.documentId]?.length > 0 && 
                                           documentAnalyses[document.documentId][0].lawyerStatus === 'UNCHECKED' && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleStartLawyerReview(document.documentId, document.documentMetadata.fileName || 'Unbekannt');
                                              }}
                                              title="Kontrolle durch Anwalt starten"
                                            >
                                              <UserCheck className="h-4 w-4"/>
                                              <span className="sr-only">Kontrolle durch Anwalt starten</span>
                                            </Button>
                                          )}
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDeleteDocument(document.documentId, document.documentMetadata.fileName || 'Unbekannt');
                                            }}
                                          >
                                            <Trash2 className="h-4 w-4"/>
                                            <span className="sr-only">Löschen</span>
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  </React.Fragment>
                                ))}
                              </TableBody>
                            </Table>
                          </div>

                          {/* Mobile Card View */}
                          <div className="md:hidden space-y-3">
                            {categoryDocuments.map((document) => (
                              <Card 
                                key={document.documentId}
                                className={`${documentAnalyses[document.documentId] && !isDocumentAnalysisRunning(document.documentId) ? 'cursor-pointer hover:shadow-md' : ''} transition-shadow`}
                                onClick={() => documentAnalyses[document.documentId] && !isDocumentAnalysisRunning(document.documentId) && handleAnalysisRowClick(documentAnalyses[document.documentId][0])}
                              >
                                <CardContent className="p-4">
                                  <div className="space-y-3">
                                    {/* Header with title and risk badge */}
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm truncate">
                                          {document.documentMetadata.fileName || document.documentMetadata.originalName || 'Unbekannt'}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                          {document.documentMetadata.uploadedAt ? new Date(document.documentMetadata.uploadedAt).toLocaleDateString('de-DE') : 'Unbekannt'}
                                          {document.documentMetadata.size && ` • ${(document.documentMetadata.size / 1024 / 1024).toFixed(1)} MB`}
                                        </div>
                                      </div>
                                      {!isDocumentAnalysisRunning(document.documentId) && documentAnalyses[document.documentId] ? (
                                        <Badge variant={documentAnalyses[document.documentId][0].overallCompliance?.isCompliant ? 'default' : 'destructive'} className="text-xs ml-2">
                                          {documentAnalyses[document.documentId][0].overallCompliance?.isCompliant ? 'Konform' : 'Nicht konform'}
                                        </Badge>
                                      ) : null}
                                    </div>

                                    {/* Analysis status */}
                                    {isDocumentAnalysisRunning(document.documentId) ? (
                                      <div className="flex items-center text-xs text-blue-600">
                                        <Clock className="h-3 w-3 mr-1 animate-spin"/>
                                        Analyse läuft
                                      </div>
                                    ) : documentAnalyses[document.documentId] && (
                                      <div className="text-xs text-blue-600">
                                        Vertragsanalyse: {Math.round((documentAnalyses[document.documentId][0].overallCompliance?.complianceScore || 0) * 100)}% konform
                                      </div>
                                    )}

                                    {/* Lawyer status */}
                                    {documentAnalyses[document.documentId]?.length > 0 && documentAnalyses[document.documentId][0].lawyerStatus && documentAnalyses[document.documentId][0].lawyerStatus !== 'UNCHECKED' && (
                                      <div className="flex items-center space-x-2">
                                        <span className="text-xs text-muted-foreground">Anwalt:</span>
                                        <Badge 
                                          variant={
                                            documentAnalyses[document.documentId][0].lawyerStatus === 'APPROVED' ? 'default' :
                                            documentAnalyses[document.documentId][0].lawyerStatus === 'DECLINE' ? 'destructive' :
                                            'secondary'
                                          } 
                                          className="text-xs"
                                        >
                                          {translateLawyerStatus(documentAnalyses[document.documentId][0].lawyerStatus)}
                                        </Badge>
                                        {documentAnalyses[document.documentId][0].lawyerStatus === 'DECLINE' && documentAnalyses[document.documentId][0].lawyerComment && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenLawyerCommentModal(documentAnalyses[document.documentId][0].lawyerComment || '');
                                            }}
                                            title="Kommentar anzeigen"
                                          >
                                            <FileText className="h-3 w-3"/>
                                            <span className="sr-only">Kommentar anzeigen</span>
                                          </Button>
                                        )}
                                      </div>
                                    )}

                                    {/* Action buttons */}
                                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                                      <div className="flex items-center space-x-2">
                                        {document.downloadUrl && (
                                          <a
                                            href={document.downloadUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
                                            title="PDF öffnen"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <ExternalLink className="h-4 w-4" />
                                          </a>
                                        )}
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleContractAnalysis(document.documentId, document.documentMetadata.fileName || 'Unbekannt');
                                          }}
                                          disabled={swissAnalysisLoading === document.documentId || isDocumentAnalysisRunning(document.documentId)}
                                          title={
                                            isDocumentAnalysisRunning(document.documentId)
                                              ? 'Vertragsanalyse läuft bereits - bitte warten Sie bis zum Abschluss'
                                              : documentAnalyses[document.documentId]?.length > 0
                                              ? 'Vertragsanalyse erneut ausführen (überschreibt bestehende Analyse)'
                                              : 'Vertragsanalyse starten'
                                          }
                                        >
                                          <Scale className="h-4 w-4"/>
                                          <span className="sr-only">
                                            {documentAnalyses[document.documentId]?.length > 0
                                              ? 'Analyse erneut ausführen'
                                              : 'Schweizer Obligationenrecht-Analyse'
                                            }
                                          </span>
                                        </Button>
                                        {/* Only show lawyer review button if document has analysis and lawyerStatus is UNCHECKED */}
                                        {documentAnalyses[document.documentId]?.length > 0 && 
                                         documentAnalyses[document.documentId][0].lawyerStatus === 'UNCHECKED' && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleStartLawyerReview(document.documentId, document.documentMetadata.fileName || 'Unbekannt');
                                            }}
                                            title="Kontrolle durch Anwalt starten"
                                          >
                                            <UserCheck className="h-4 w-4"/>
                                            <span className="sr-only">Kontrolle durch Anwalt starten</span>
                                          </Button>
                                        )}
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteDocument(document.documentId, document.documentMetadata.fileName || 'Unbekannt');
                                        }}
                                        title="Löschen"
                                      >
                                        <Trash2 className="h-4 w-4"/>
                                        <span className="sr-only">Löschen</span>
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all" className="mt-6">
            <Card className="border-0 shadow-lg bg-white rounded-xl">
              <CardHeader className="bg-gradient-to-r from-green-50 to-green-100 rounded-t-xl border-b border-green-200">
                <CardTitle className="text-lg sm:text-xl font-semibold text-green-900 flex items-center gap-2 pt-4 sm:pt-6">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Generierte Dokumente
                </CardTitle>
                <p className="text-xs sm:text-sm text-green-700 mt-1">
                  Alle von der KI generierten und bearbeiteten Dokumente in chronologischer Übersicht
                </p>
              </CardHeader>
              <CardContent>
                {allDocumentsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-muted-foreground">Lade alle Dokumente...</div>
                  </div>
                ) : allUserDocuments.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-muted-foreground">Keine Dokumente gefunden</div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      {allUserDocuments.length} Dokument{allUserDocuments.length !== 1 ? 'e' : ''} gefunden
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Titel</TableHead>
                          <TableHead>Kategorie</TableHead>
                          <TableHead>Hochgeladen</TableHead>
                          <TableHead className="w-24">Aktionen</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allUserDocuments.map((document) => (
                          <TableRow key={document.documentId}>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{document.documentMetadata.fileName || 'Unbekannt'}</div>
                                <div className="text-sm text-muted-foreground">
                                  {document.documentMetadata.size ? `${(document.documentMetadata.size / 1024 / 1024).toFixed(1)} MB` : 'Unbekannt'}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {getCategoryBadge(document.documentMetadata.category || 'other')}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <p className="text-sm"></p>
                              </div>
                              <div className="text-sm cursor-default"
                                   title={document.documentMetadata.uploadedAt
                                     ? new Date(document.documentMetadata.uploadedAt).toLocaleString('de-DE', {
                                     year: 'numeric',
                                     month: '2-digit',
                                     day: '2-digit',
                                     hour: '2-digit',
                                     minute: '2-digit',
                                     hour12: false
                                   }).replace(',', '') + 'h'
                                     : 'Unbekannt'
                                   }
                              >
                                {document.documentMetadata.uploadedAt ? new Date(document.documentMetadata.uploadedAt).toLocaleDateString('de-DE') : 'Unbekannt'}
                              </div>
                            </TableCell>
                            <TableCell>
                              {document.downloadUrl && (
                                <a
                                  href={document.downloadUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
                                  title="PDF öffnen"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="questions" className="mt-6">
            <div className="flex justify-center sm:justify-end mb-6">
              <Button
                onClick={handleContractQuestionsUpload}
                disabled={uploading}
                className="bg-purple-600 hover:bg-purple-700 text-white shadow-sm w-full sm:w-auto"
              >
                <Upload className="mr-2 h-4 w-4"/>
                {uploading ? 'Wird hochgeladen...' : 'Vertrag hochladen'}
              </Button>
            </div>
            <Card className="border-0 shadow-lg bg-white rounded-xl">
              <CardHeader className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-t-xl border-b border-purple-200">
                <CardTitle className="text-lg sm:text-xl font-semibold text-purple-900 flex items-center gap-2 pt-4 sm:pt-6">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Vertragsfragen
                </CardTitle>
                <p className="text-xs sm:text-sm text-purple-700 mt-1">
                  Laden Sie Verträge hoch, um KI-gestützte Fragen dazu zu stellen.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Contract Questions Documents List */}
                  <div>
                    {contractQuestionsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="text-sm text-muted-foreground">Lade Dokumente...</div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {contractQuestionsDocuments.length === 0 ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="text-sm text-muted-foreground">Noch keine Verträge für Fragen hochgeladen</div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Dateiname</TableHead>
                                  <TableHead>Größe</TableHead>
                                  <TableHead>Hochgeladen</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead className="w-24">Aktionen</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {contractQuestionsDocuments.map((document) => (
                                  <TableRow key={document.documentId}>
                                    <TableCell>
                                      <div className="space-y-1">
                                        <div className="font-medium">{document.documentMetadata.fileName || 'Unbekannt'}</div>
                                        <div className="text-sm text-muted-foreground">
                                          {document.documentMetadata.description || 'Vertrag für Fragen'}
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="text-sm">
                                        {document.documentMetadata.size ? `${(document.documentMetadata.size / 1024 / 1024).toFixed(1)} MB` : 'Unbekannt'}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="text-sm">
                                        {document.documentMetadata.uploadedAt ? new Date(document.documentMetadata.uploadedAt).toLocaleDateString('de-DE') : 'Unbekannt'}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="default" className="text-xs">
                                        {document.documentMetadata.vectorStoreId ? 'Bereit für Fragen' : 'Wird verarbeitet'}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center space-x-2">
                                        {document.downloadUrl && (
                                          <a
                                            href={document.downloadUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
                                            title="Dokument öffnen"
                                          >
                                            <ExternalLink className="h-4 w-4" />
                                          </a>
                                        )}
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-9 px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200 font-medium"
                                          onClick={() => handleOpenQuestionDialog(document)}
                                          title="Frage zu diesem Dokument stellen"
                                          disabled={!document.documentMetadata.vectorStoreId}
                                        >
                                          <MessageSquare className="h-4 w-4 mr-1"/>
                                          <span className="text-xs">Frage stellen</span>
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                          onClick={() => handleDeleteDocument(document.documentId, document.documentMetadata.fileName || 'Unbekannt')}
                                          title="Dokument löschen"
                                        >
                                          <Trash2 className="h-4 w-4"/>
                                          <span className="sr-only">Dokument löschen</span>
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Extracted Text Display */}
        {extractedText && extractedDocumentInfo && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileSearch className="h-5 w-5"/>
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
                        variant: 'success',
                        title: 'Text kopiert',
                        description: 'Der extrahierte Text wurde in die Zwischenablage kopiert.'
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
              disabled={deletingDocument}
            >
              {deletingDocument ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Wird gelöscht...
                </>
              ) : (
                'Löschen'
              )}
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
                  <FileText className="h-6 w-6 text-muted-foreground"/>
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
                  variant={selectedFile ? 'outline' : 'default'}
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
                  <SelectValue placeholder="Kategorie auswählen"/>
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
                  <Plus className="h-4 w-4"/>
                </Button>
              </div>
              {anonymizedKeywords.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">Zu ersetzende Texte:</p>
                  <div className="flex flex-wrap gap-1">
                    {anonymizedKeywords.map((item, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {item.keyword} → {item.replaceWith}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto p-0 ml-1"
                          onClick={() => removeTextToReplace(index)}
                        >
                          <X className="h-3 w-3"/>
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

      {/* Contract Questions Upload Dialog */}
      <Dialog open={contractQuestionsDialogOpen} onOpenChange={setContractQuestionsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vertrag für Fragen hochladen</DialogTitle>
            <DialogDescription>
              Wählen Sie einen Vertrag aus, um KI-gestützte Fragen dazu stellen zu können.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* File Selection Area */}
            <div className="space-y-2">
              <Label>Datei auswählen</Label>
              <div
                className="flex flex-col items-center justify-center space-y-4 text-center border-2 border-dashed rounded-lg p-6 transition-colors border-purple-200 bg-purple-50 hover:border-purple-300"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
                  <FileText className="h-6 w-6 text-purple-600"/>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-purple-900">Vertrag auswählen</p>
                  <p className="text-xs text-purple-600">PDF, DOCX, DOC, TXT, MD (max. 50MB)</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => contractQuestionsFileInputRef.current?.click()}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Datei auswählen
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setContractQuestionsDialogOpen(false)}
              disabled={uploading}
            >
              Abbrechen
            </Button>
          </DialogFooter>
          <input
            ref={contractQuestionsFileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.md"
            onChange={(e) => handleContractQuestionsFileSelect(e.target.files)}
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
                  <Scale className="h-5 w-5 text-blue-600"/>
                  <h2 className="text-lg font-semibold">Detaillierte Analyse-Ergebnisse</h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidenavOpen(false)}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4"/>
                </Button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Vertragsland</Label>
                          <Badge variant="outline" className="text-sm">
                            {selectedAnalysis.documentContext.country}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Anwendbares Recht</Label>
                          <Badge variant="outline" className="text-sm">
                            {selectedAnalysis.documentContext.legalFramework}
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
                      <Badge variant={selectedAnalysis.overallCompliance?.isCompliant ? 'default' : 'destructive'}>
                        {selectedAnalysis.overallCompliance?.isCompliant ? 'Konform' : 'Nicht konform'}
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
                              <Badge variant={section.isCompliant ? 'default' : 'destructive'} className="text-xs">
                                {section.isCompliant ? 'Konform' : 'Nicht konform'}
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

                          {/* Recommendations Section */}
                          {section.recommendations && section.recommendations.length > 0 && (
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-blue-600">Empfehlungen ({section.recommendations.length}):</Label>
                              <div className="space-y-2">
                                {section.recommendations.map((recommendation: string, recommendationIndex: number) => (
                                  <div key={recommendationIndex} className="text-sm bg-blue-50 p-3 rounded border-l-4 border-blue-400">
                                    <div className="text-blue-800">• {recommendation}</div>
                                  </div>
                                ))}
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

      {/* Lawyer Decision Modal */}
      {lawyerDecisionModalOpen && selectedAnalysisForDecision && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Analyse bewerten</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCloseLawyerDecisionModal}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Dokument:</Label>
                  <p className="text-sm text-muted-foreground">
                    {selectedAnalysisForDecision.documentContext?.documentType || 'Unbekannter Dokumenttyp'}
                  </p>
                </div>

                <div>
                  <Label className="text-sm font-medium">Entscheidung:</Label>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="approve"
                        name="decision"
                        value="APPROVED"
                        checked={lawyerDecision === 'APPROVED'}
                        onChange={(e) => setLawyerDecision(e.target.value as 'APPROVED')}
                        className="h-4 w-4 text-green-600"
                      />
                      <Label htmlFor="approve" className="text-sm text-green-600 font-medium">
                        Genehmigen
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="decline"
                        name="decision"
                        value="DECLINE"
                        checked={lawyerDecision === 'DECLINE'}
                        onChange={(e) => setLawyerDecision(e.target.value as 'DECLINE')}
                        className="h-4 w-4 text-red-600"
                      />
                      <Label htmlFor="decline" className="text-sm text-red-600 font-medium">
                        Ablehnen
                      </Label>
                    </div>
                  </div>
                </div>

                {lawyerDecision === 'DECLINE' && (
                  <div>
                    <Label htmlFor="comment" className="text-sm font-medium">
                      Kommentar (erforderlich):
                    </Label>
                    <Textarea
                      id="comment"
                      value={lawyerComment}
                      onChange={(e) => setLawyerComment(e.target.value)}
                      placeholder="Bitte geben Sie einen Grund für die Ablehnung an..."
                      className="mt-1"
                      rows={3}
                    />
                  </div>
                )}

                <div className="flex justify-end space-x-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={handleCloseLawyerDecisionModal}
                    disabled={submittingDecision}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    onClick={handleSubmitLawyerDecision}
                    disabled={submittingDecision || !lawyerDecision}
                    className={lawyerDecision === 'APPROVED' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                  >
                    {submittingDecision ? 'Wird gespeichert...' : 
                     lawyerDecision === 'APPROVED' ? 'Genehmigen' : 'Ablehnen'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lawyer Comment Modal */}
      {lawyerCommentModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Anwaltskommentar</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCloseLawyerCommentModal}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Grund der Ablehnung:</Label>
                  <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-800 whitespace-pre-wrap">
                      {selectedLawyerComment}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button
                    variant="outline"
                    onClick={handleCloseLawyerCommentModal}
                  >
                    Schließen
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Question Dialog */}
      <Dialog open={questionDialogOpen} onOpenChange={setQuestionDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Search className="h-5 w-5"/>
              <span>Frage an Dokument stellen</span>
            </DialogTitle>
            <DialogDescription>
              {selectedDocumentForQuestion && (
                <span>
                  Stellen Sie eine Frage zu: <strong>{selectedDocumentForQuestion.documentMetadata.fileName}</strong>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Question Input */}
            <div className="space-y-2">
              <Label htmlFor="question-input">Ihre Frage</Label>
              <Textarea
                id="question-input"
                placeholder="Stellen Sie hier Ihre Frage zum Dokument..."
                value={currentQuestion}
                onChange={(e) => setCurrentQuestion(e.target.value)}
                className="min-h-[100px]"
                disabled={askingQuestion}
              />
              <div className="text-sm text-muted-foreground">
                {currentQuestion.length}/2000 Zeichen
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end">
              <Button
                onClick={handleSubmitQuestion}
                disabled={!currentQuestion.trim() || askingQuestion || currentQuestion.length > 2000}
                className="min-w-[120px]"
              >
                {askingQuestion ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Wird bearbeitet...
                  </>
                ) : (
                  'Frage stellen'
                )}
              </Button>
            </div>

            {/* Answer Display */}
            {questionAnswer && (
              <div className="space-y-2 border-t pt-4">
                <Label>Antwort</Label>
                {(() => {
                  // Try to parse structured answer
                  try {
                    const parsedAnswer = JSON.parse(questionAnswer);
                    if (parsedAnswer.answer && parsedAnswer.answer.summary) {
                      // Structured answer display
                      return (
                        <div className="space-y-6">
                          {/* Question Display */}
                          <Card className="border-l-4 border-l-blue-500">
                            <CardHeader className="pb-3">
                              <CardTitle className="flex items-center space-x-2 text-lg">
                                <MessageSquare className="h-5 w-5 text-blue-500" />
                                <span>Ihre Frage</span>
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm text-muted-foreground italic">{currentQuestion}</p>
                            </CardContent>
                          </Card>

                          {/* Summary Card with Gradient Background */}
                          <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                            <CardHeader className="pb-3">
                              <CardTitle className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <TrendingUp className="h-5 w-5 text-blue-600" />
                                  <span>Zusammenfassung</span>
                                </div>
                                <Badge 
                                  variant={parsedAnswer.answer.confidence >= 0.8 ? "default" : parsedAnswer.answer.confidence >= 0.6 ? "secondary" : "destructive"}
                                  className={parsedAnswer.answer.confidence >= 0.8 ? "bg-green-500 hover:bg-green-600" : parsedAnswer.answer.confidence >= 0.6 ? "bg-yellow-500 hover:bg-yellow-600" : ""}
                                >
                                  {parsedAnswer.answer.confidence >= 0.8 ? "Hoch" : parsedAnswer.answer.confidence >= 0.6 ? "Mittel" : "Niedrig"} ({Math.round(parsedAnswer.answer.confidence * 100)}%)
                                </Badge>
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm font-medium text-gray-800 mb-3">{parsedAnswer.answer.summary}</p>
                              <div className="text-sm text-gray-600">
                                <p>{parsedAnswer.answer.detailed_explanation}</p>
                              </div>
                            </CardContent>
                          </Card>

                          {/* Key Points */}
                          {parsedAnswer.answer.key_points && parsedAnswer.answer.key_points.length > 0 && (
                            <Card>
                              <CardHeader className="pb-3">
                                <CardTitle className="flex items-center space-x-2">
                                  <CheckCircle className="h-5 w-5 text-green-600" />
                                  <span>Wichtige Punkte</span>
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <ul className="space-y-2">
                                  {parsedAnswer.answer.key_points.map((point: string, index: number) => (
                                    <li key={index} className="flex items-start space-x-2">
                                      <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                                      <span className="text-sm text-gray-700">{point}</span>
                                    </li>
                                  ))}
                                </ul>
                              </CardContent>
                            </Card>
                          )}

                          {/* Sources */}
                          {parsedAnswer.sources && parsedAnswer.sources.length > 0 && (
                            <Card>
                              <CardHeader className="pb-3">
                                <CardTitle className="flex items-center space-x-2">
                                  <FileText className="h-5 w-5 text-purple-600" />
                                  <span>Quellen ({parsedAnswer.sources.length})</span>
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="space-y-3">
                                  {parsedAnswer.sources.map((source: any, index: number) => (
                                    <Card key={index} className="border border-gray-200">
                                      <CardHeader className="pb-2">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center space-x-2">
                                            <span className="text-sm font-medium">Quelle {index + 1}</span>
                                            <span className="text-xs text-muted-foreground">({source.context})</span>
                                          </div>
                                          <Badge variant="outline" className="text-xs">
                                            Relevanz: {Math.round(source.relevance_score * 100)}%
                                          </Badge>
                                        </div>
                                      </CardHeader>
                                      <CardContent className="pt-0">
                                        <div className="bg-gray-50 p-3 rounded-md">
                                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{source.content}</p>
                                        </div>
                                      </CardContent>
                                    </Card>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </div>
                      );
                    }
                  } catch (e) {
                    // Fall back to plain text display
                  }

                  // Plain text fallback
                  return (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="whitespace-pre-wrap text-sm">
                        {questionAnswer}
                      </div>
                    </div>
                  );
                })()}
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(questionAnswer);
                      toast({
                        variant: 'success',
                        title: 'Antwort kopiert',
                        description: 'Die Antwort wurde in die Zwischenablage kopiert.'
                      });
                    }}
                  >
                    Antwort kopieren
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseQuestionDialog}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden file input for contract questions upload */}
      <input
        ref={contractQuestionsFileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.md"
        onChange={(e) => handleContractQuestionsFileSelect(e.target.files)}
        className="hidden"
        style={{ display: 'none' }}
      />

    </>
  );
}

export default function ContractsPage() {
  return (
    <MainLayout>
      <ContractsPageContent />
    </MainLayout>
  );
}
