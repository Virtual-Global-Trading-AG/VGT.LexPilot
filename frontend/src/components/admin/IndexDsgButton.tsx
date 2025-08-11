'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Database } from 'lucide-react';
import apiClient from '@/lib/api/client';

export default function IndexDsgButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleIndexDsg = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.post('/admin/legal-texts/index-specific');
      
      if (response.success) {
        alert('DSG wurde erfolgreich indexiert.');
      } else {
        alert(`Fehler: ${response.error || 'Indexierung fehlgeschlagen.'}`);
      }
    } catch (error) {
      alert('Beim Indexieren ist ein Fehler aufgetreten.');
      console.error('Error indexing DSG:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      onClick={handleIndexDsg} 
      disabled={isLoading}
      variant="outline"
    >
      <Database className="mr-2 h-4 w-4" />
      {isLoading ? 'Indexiere DSG...' : 'DSG indexieren'}
    </Button>
  );
}