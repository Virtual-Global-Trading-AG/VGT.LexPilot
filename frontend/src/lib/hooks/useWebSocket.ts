"use client";

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppStore } from '@/lib/store';
import type { WebSocketEvent, AnalysisResult } from '@/types';

export function useWebSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { user, updateAnalysis, setError } = useAppStore();

  useEffect(() => {
    if (!user) return;

    // Initialize socket connection
    const socketInstance = io(process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001', {
      auth: {
        userId: user.id,
      },
      transports: ['websocket', 'polling'],
    });

    socketInstance.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    });

    socketInstance.on('analysis_progress', (data: WebSocketEvent) => {
      if (data.type === 'analysis_progress') {
        const analysisId = data.data.analysisId as string;
        if (analysisId) {
          updateAnalysis(analysisId, {
            status: 'running',
            // Add progress data if available
          });
        }
      }
    });

    socketInstance.on('analysis_complete', (data: WebSocketEvent) => {
      if (data.type === 'analysis_complete') {
        const analysisId = data.data.analysisId as string;
        const result = data.data.result as AnalysisResult;
        if (analysisId) {
          updateAnalysis(analysisId, {
            status: 'completed',
            result: result,
            completedAt: new Date(),
          });
        }
      }
    });

    socketInstance.on('error', (data: WebSocketEvent) => {
      console.error('WebSocket error:', data);
      const message = (data.data.message as string) || 'WebSocket error occurred';
      setError(message);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [user, updateAnalysis, setError]);

  const emit = (event: string, data: unknown) => {
    if (socket && isConnected) {
      socket.emit(event, data);
    }
  };

  return {
    socket,
    isConnected,
    emit,
  };
}
