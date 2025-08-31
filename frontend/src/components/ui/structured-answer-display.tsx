'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  MessageSquare, 
  TrendingUp, 
  CheckCircle, 
  FileText, 
  Info, 
  ChevronDown, 
  ChevronRight,
  Copy,
  Clock
} from 'lucide-react';
import { useToast } from '@/lib/hooks/use-toast';

interface StructuredAnswerSource {
  content: string;
  context: string;
  relevance_score: number;
}

interface StructuredAnswerData {
  answer: {
    summary: string;
    detailed_explanation: string;
    key_points: string[];
    confidence: number;
    document_references: string[];
  };
  sources: StructuredAnswerSource[];
  metadata: {
    search_queries_used: string[];
    sources_found: number;
    timestamp: string;
    processing_time?: number;
    model_used?: string;
    vector_store_id?: string;
  };
}

interface StructuredAnswerDisplayProps {
  data: StructuredAnswerData;
  question: string;
}

export function StructuredAnswerDisplay({ data, question }: StructuredAnswerDisplayProps) {
  const [expandedSources, setExpandedSources] = useState<Set<number>>(new Set());
  const [showMetadata, setShowMetadata] = useState(false);
  const { toast } = useToast();

  const toggleSource = (index: number) => {
    const newExpanded = new Set(expandedSources);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSources(newExpanded);
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.8) {
      return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Hoch ({Math.round(confidence * 100)}%)</Badge>;
    } else if (confidence >= 0.6) {
      return <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600">Mittel ({Math.round(confidence * 100)}%)</Badge>;
    } else {
      return <Badge variant="destructive">Niedrig ({Math.round(confidence * 100)}%)</Badge>;
    }
  };

  const getRelevanceBadge = (score: number) => {
    const percentage = Math.round(score * 100);
    if (score >= 0.8) {
      return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600 text-xs">Relevanz: {percentage}%</Badge>;
    } else if (score >= 0.6) {
      return <Badge variant="secondary" className="text-xs">Relevanz: {percentage}%</Badge>;
    } else {
      return <Badge variant="outline" className="text-xs">Relevanz: {percentage}%</Badge>;
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      variant: 'success',
      title: `${label} kopiert`,
      description: `${label} wurde in die Zwischenablage kopiert.`
    });
  };

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
          <p className="text-sm text-muted-foreground italic">{question}</p>
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
            {getConfidenceBadge(data.answer.confidence)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium text-gray-800 mb-3">{data.answer.summary}</p>
          <div className="text-sm text-gray-600">
            <p>{data.answer.detailed_explanation}</p>
          </div>
          <div className="flex justify-end mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(data.answer.summary + '\n\n' + data.answer.detailed_explanation, 'Antwort')}
              className="text-xs"
            >
              <Copy className="h-3 w-3 mr-1" />
              Kopieren
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Key Points with Green Bullet Points */}
      {data.answer.key_points && data.answer.key_points.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span>Wichtige Punkte</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.answer.key_points.map((point, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span className="text-sm text-gray-700">{point}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Sources with Expandable Cards */}
      {data.sources && data.sources.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-purple-600" />
              <span>Quellen ({data.sources.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.sources.map((source, index) => (
                <Card key={index} className="border border-gray-200">
                  <CardHeader 
                    className="pb-2 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleSource(index)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {expandedSources.has(index) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <span className="text-sm font-medium">Quelle {index + 1}</span>
                        <span className="text-xs text-muted-foreground">({source.context})</span>
                      </div>
                      {getRelevanceBadge(source.relevance_score)}
                    </div>
                  </CardHeader>
                  {expandedSources.has(index) && (
                    <CardContent className="pt-0">
                      <div className="bg-gray-50 p-3 rounded-md">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{source.content}</p>
                      </div>
                      <div className="flex justify-end mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(source.content, 'Quelle')}
                          className="text-xs"
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Kopieren
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document References */}
      {data.answer.document_references && data.answer.document_references.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-orange-600" />
              <span>Dokumentreferenzen</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.answer.document_references.map((ref, index) => (
                <div key={index} className="bg-orange-50 p-3 rounded-md border-l-4 border-l-orange-400">
                  <p className="text-sm text-gray-700 italic">"{ref}"</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metadata - Collapsible */}
      <Card>
        <CardHeader 
          className="pb-3 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setShowMetadata(!showMetadata)}
        >
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Info className="h-5 w-5 text-gray-600" />
              <span>Analyse-Details</span>
            </div>
            {showMetadata ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </CardTitle>
        </CardHeader>
        {showMetadata && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Zeitstempel:</span>
                  <span className="text-muted-foreground">
                    {new Date(data.metadata.timestamp).toLocaleString('de-DE')}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Gefundene Quellen:</span>
                  <span className="ml-2 text-muted-foreground">{data.metadata.sources_found}</span>
                </div>
                {data.metadata.model_used && (
                  <div>
                    <span className="font-medium">Verwendetes Modell:</span>
                    <span className="ml-2 text-muted-foreground">{data.metadata.model_used}</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {data.metadata.search_queries_used && data.metadata.search_queries_used.length > 0 && (
                  <div>
                    <span className="font-medium">Suchbegriffe:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {data.metadata.search_queries_used.map((query, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {query}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {data.metadata.vector_store_id && (
                  <div>
                    <span className="font-medium">Vector Store ID:</span>
                    <span className="ml-2 text-muted-foreground font-mono text-xs">
                      {data.metadata.vector_store_id.substring(0, 20)}...
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}