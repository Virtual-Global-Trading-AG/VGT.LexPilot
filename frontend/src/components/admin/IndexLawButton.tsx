'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Database } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useToast } from '@/lib/hooks/use-toast';

export default function IndexLawButton() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleIndexDsg = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.post('/admin/law-texts/index');

      if (response.success) {
        toast({
          variant: "success",
          title: "Indexierung erfolgreich",
          description: "Gesetze wurden erfolgreich indexiert."
        });
      } else {
        toast({
          variant: "destructive",
          title: "Indexierung fehlgeschlagen",
          description: response.error || 'Indexierung fehlgeschlagen.'
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Indexierung fehlgeschlagen",
        description: "Beim Indexieren ist ein Fehler aufgetreten."
      });
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
