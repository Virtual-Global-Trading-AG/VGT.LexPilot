import MainLayout from "@/components/layouts/main-layout";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <MainLayout>
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Willkommen bei LexPilot AI
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Intelligente Rechtsanalyse für Schweizer Recht
          </p>
          <div className="flex justify-center space-x-4">
            <Button size="lg">
              Dokument hochladen
            </Button>
            <Button variant="outline" size="lg">
              Mehr erfahren
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          <div className="p-6 border border-border rounded-lg">
            <h3 className="text-lg font-semibold mb-2">DSGVO-Compliance</h3>
            <p className="text-muted-foreground">
              Automatische Überprüfung der Datenschutz-Compliance Ihrer Dokumente
            </p>
          </div>
          <div className="p-6 border border-border rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Vertragsanalyse</h3>
            <p className="text-muted-foreground">
              Intelligente Analyse von Verträgen und Identifikation von Risiken
            </p>
          </div>
          <div className="p-6 border border-border rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Rechtliche Zusammenfassung</h3>
            <p className="text-muted-foreground">
              Automatische Erstellung rechtlicher Zusammenfassungen und Empfehlungen
            </p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
