import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { User, Document, Analysis } from '@/types';

interface AppState {
  // User state
  user: User | null;
  isAuthenticated: boolean;
  
  // Documents state
  documents: Document[];
  selectedDocument: Document | null;
  
  // Analysis state
  analyses: Analysis[];
  currentAnalysis: Analysis | null;
  
  // UI state
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setUser: (user: User | null) => void;
  setDocuments: (documents: Document[]) => void;
  addDocument: (document: Document) => void;
  updateDocument: (id: string, updates: Partial<Document>) => void;
  setSelectedDocument: (document: Document | null) => void;
  
  setAnalyses: (analyses: Analysis[]) => void;
  addAnalysis: (analysis: Analysis) => void;
  updateAnalysis: (id: string, updates: Partial<Analysis>) => void;
  setCurrentAnalysis: (analysis: Analysis | null) => void;
  
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        // Initial state
        user: null,
        isAuthenticated: false,
        documents: [],
        selectedDocument: null,
        analyses: [],
        currentAnalysis: null,
        isLoading: false,
        error: null,

        // User actions
        setUser: (user) => set({ user, isAuthenticated: !!user }),

        // Document actions
        setDocuments: (documents) => set({ documents }),
        addDocument: (document) => set((state) => ({ 
          documents: [...state.documents, document] 
        })),
        updateDocument: (id, updates) => set((state) => ({
          documents: state.documents.map(doc => 
            doc.id === id ? { ...doc, ...updates } : doc
          ),
          selectedDocument: state.selectedDocument?.id === id 
            ? { ...state.selectedDocument, ...updates } 
            : state.selectedDocument
        })),
        setSelectedDocument: (document) => set({ selectedDocument: document }),

        // Analysis actions
        setAnalyses: (analyses) => set({ analyses }),
        addAnalysis: (analysis) => set((state) => ({
          analyses: [...state.analyses, analysis]
        })),
        updateAnalysis: (id, updates) => set((state) => ({
          analyses: state.analyses.map(analysis => 
            analysis.id === id ? { ...analysis, ...updates } : analysis
          ),
          currentAnalysis: state.currentAnalysis?.id === id 
            ? { ...state.currentAnalysis, ...updates } 
            : state.currentAnalysis
        })),
        setCurrentAnalysis: (analysis) => set({ currentAnalysis: analysis }),

        // UI actions
        setLoading: (isLoading) => set({ isLoading }),
        setError: (error) => set({ error }),
        clearError: () => set({ error: null }),
      }),
      {
        name: 'lexPilot-storage',
        partialize: (state) => ({ 
          user: state.user,
          isAuthenticated: state.isAuthenticated 
        }),
      }
    ),
    {
      name: 'lexPilot-store',
    }
  )
);
