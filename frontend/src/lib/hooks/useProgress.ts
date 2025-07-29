// React hook für Real-time Progress Updates via Firestore
import { useState, useEffect, useCallback } from 'react';
import { onSnapshot, doc, collection } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthStore } from '../stores/authStore';

export interface ProgressUpdate {
  type: 'progress' | 'complete' | 'error';
  data: {
    progress?: number;
    message?: string;
    result?: unknown;
    error?: string;
  };
  timestamp: Date;
}

export function useAnalysisProgress(requestId?: string) {
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  
  const user = useAuthStore(state => state.user);
  const userId = user?.uid;

  const reset = useCallback(() => {
    setProgress(0);
    setMessage('');
    setIsComplete(false);
    setError(null);
    setResult(null);
  }, []);

  useEffect(() => {
    if (!userId || !requestId) {
      return;
    }

    // Listen for progress updates
    const unsubscribe = onSnapshot(
      doc(db, `analysis_progress/${userId}/updates/${requestId}`),
      (doc) => {
        if (doc.exists()) {
          const update = doc.data() as ProgressUpdate;
          
          switch (update.type) {
            case 'progress':
              if (update.data.progress !== undefined) {
                setProgress(update.data.progress);
              }
              if (update.data.message) {
                setMessage(update.data.message);
              }
              break;
              
            case 'complete':
              setProgress(100);
              setMessage('Analysis completed');
              setIsComplete(true);
              if (update.data.result) {
                setResult(update.data.result);
              }
              break;
              
            case 'error':
              setError(update.data.error || 'An error occurred');
              setIsComplete(true);
              break;
          }
        }
      },
      (error) => {
        console.error('Error listening to progress updates:', error);
        setError('Failed to receive progress updates');
      }
    );

    return () => unsubscribe();
  }, [userId, requestId]);

  return {
    progress,
    message,
    isComplete,
    error,
    result,
    reset
  };
}

export function useAnalysisHistory() {
  const [analyses, setAnalyses] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const user = useAuthStore(state => state.user);
  const userId = user?.uid;

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Listen for analysis history
    const unsubscribe = onSnapshot(
      collection(db, `users/${userId}/analyses`),
      (snapshot) => {
        const analysisData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate()
        }));
        
        // Sort by creation date (newest first)
        analysisData.sort((a, b) => 
          (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
        );
        
        setAnalyses(analysisData);
        setLoading(false);
        setError(null);
      },
      (error) => {
        console.error('Error fetching analysis history:', error);
        setError('Failed to load analysis history');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  return {
    analyses,
    loading,
    error
  };
}

export function useDocumentProgress(documentId?: string) {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [status, setStatus] = useState<'uploading' | 'processing' | 'complete' | 'error' | 'idle'>('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const user = useAuthStore(state => state.user);
  const userId = user?.uid;

  const reset = useCallback(() => {
    setUploadProgress(0);
    setProcessingProgress(0);
    setStatus('idle');
    setMessage('');
    setError(null);
  }, []);

  useEffect(() => {
    if (!userId || !documentId) {
      return;
    }

    // Listen for document processing updates
    const unsubscribe = onSnapshot(
      doc(db, `document_progress/${userId}/documents/${documentId}`),
      (doc) => {
        if (doc.exists()) {
          const update = doc.data();
          
          if (update.uploadProgress !== undefined) {
            setUploadProgress(update.uploadProgress);
          }
          
          if (update.processingProgress !== undefined) {
            setProcessingProgress(update.processingProgress);
          }
          
          if (update.status) {
            setStatus(update.status);
          }
          
          if (update.message) {
            setMessage(update.message);
          }
          
          if (update.error) {
            setError(update.error);
          }
        }
      },
      (error) => {
        console.error('Error listening to document progress:', error);
        setError('Failed to receive progress updates');
      }
    );

    return () => unsubscribe();
  }, [userId, documentId]);

  return {
    uploadProgress,
    processingProgress,
    status,
    message,
    error,
    reset
  };
}

// Utility hook to generate unique request IDs
export function useRequestId() {
  const generateId = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  return { generateId };
}
