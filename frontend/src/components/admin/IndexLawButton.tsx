'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Database } from 'lucide-react';
import apiClient from '@/lib/api/client';

export default function IndexLawButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleIndexDsg = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.post('/admin/law-texts/index');
      
      if (response.success) {
        alert('Gesetze wurden erfolgreich indexiert.');
      } else {
        alert(`Fehler: ${response.error || 'Indexierung fehlgeschlagen.'}`);
      }
    } catch (error) {
      alert('Beim Indexieren ist ein Fehler aufgetreten.');
      console.error('Error indexing Law:', error);
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
      {isLoading ? 'Indexiere Gesetze...' : 'Gesetze indexieren'}
    </Button>
  );
}