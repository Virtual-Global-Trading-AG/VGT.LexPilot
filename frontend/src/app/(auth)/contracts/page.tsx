import MainLayout from '@/components/layouts/main-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Upload,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Download,
  Trash2,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
} from 'lucide-react';

const contracts = [
  {
    id: '1',
    title: 'Arbeitsvertrag_Schmidt_AG.pdf',
    type: 'Arbeitsvertrag',
    uploadDate: '15.8.2025',
    status: 'analyzed',
    risk: 'high',
    size: '2.3 MB',
  },
  {
    id: '2',
    title: 'NDA_Startup_Kooperation.pdf',
    type: 'Geheimhaltungsvereinbarung',
    uploadDate: '30.9.2025',
    status: 'analyzed',
    risk: 'medium',
    size: '1.8 MB',
  },
  {
    id: '3',
    title: 'AGB_Webshop_2025.pdf',
    type: 'Allgemeine Geschäftsbedingungen',
    uploadDate: '31.12.2025',
    status: 'analyzed',
    risk: 'low',
    size: '4.1 MB',
  },
];

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
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Vertrag hochladen
          </Button>
        </div>

        {/* Upload Area */}
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                <FileText className="h-10 w-10 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Vertrag zur Analyse hochladen</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Ziehen Sie eine PDF-Datei hierher oder klicken Sie zum Auswählen
                </p>
              </div>
              <Button size="lg">
                Datei auswählen
              </Button>
            </div>
          </CardContent>
        </Card>

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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titel</TableHead>
                  <TableHead>Risiko</TableHead>
                  <TableHead>Frist</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{contract.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {contract.uploadDate} • {contract.size}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getRiskBadge(contract.risk)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {contract.uploadDate}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(contract.status)}
                        <span className="text-sm">{getStatusText(contract.status)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Aktionen öffnen</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Eye className="mr-2 h-4 w-4" />
                            Details
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Download className="mr-2 h-4 w-4" />
                            Herunterladen
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Löschen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
