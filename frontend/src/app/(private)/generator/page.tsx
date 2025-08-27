'use client';

import MainLayout from '@/components/layouts/main-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/lib/hooks/use-toast';
import { useContractGeneration } from '@/lib/hooks/useApi';
import {
  FileText,
  Briefcase,
  Shield,
  Calendar,
  Zap,
  BookOpen,
  Download,
  Trash2,
  Eye,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';

const contractTemplates = [
  {
    id: 'employment',
    title: 'Arbeitsvertrag',
    description: 'Standardvorlage für Arbeitsverträge',
    category: 'Personal',
    icon: Briefcase,
    selected: true,
  },
  {
    id: 'nda',
    title: 'Geheimhaltungsvereinbarung (NDA)',
    description: 'Standardvorlage für Geheimhaltungsvereinbarungen (Comming Soon)',
    category: 'Geschäft',
    icon: Shield,
    selected: false,
    disabled: true,
  },
  {
    id: 'terms',
    title: 'Allgemeine Geschäftsbedingungen',
    description: 'AGB-Vorlage für Online-Shops und Dienstleister (Comming Soon)',
    category: 'E-Commerce',
    icon: BookOpen,
    selected: false,
    disabled: true,
  },
];

export default function GeneratorPage() {
  const { toast } = useToast();
  const {
    generateContract: generateContractAPI,
    downloadContractPDF: downloadContractPDFAPI,
    loading: isGenerating,
    error: generationError,
    progress: generationProgress,
    progressMessage: generationMessage,
    clearError
  } = useContractGeneration();

  // State for template selection
  const [selectedTemplate, setSelectedTemplate] = useState('employment');

  // State for form fields
  const [formData, setFormData] = useState<Record<string, any>>({
    // NDA fields
    disclosingParty: '',
    receivingParty: '',
    purpose: '',
    duration: 5,
    mutualNDA: false,
    // Employment fields
    employeeName: '',
    employerName: '',
    employerAddress: '',
    employerPhone: '',
    employerWebsite: '',
    employeeAddress: '',
    position: '',
    salary: '',
    startDate: '',
    workingHours: 100,
    probationPeriod: 3,
    vacationDays: 25,
    // Terms fields
    companyName: '',
    companyAddress: '',
    businessType: 'Dienstleistung',
    paymentTerms: '30 Tage',
    warrantyPeriod: 12,
    jurisdiction: 'Zürich',
    dataProtection: true
  });

  // State for contract generation
  const [generatedContract, setGeneratedContract] = useState<any>(null);

  // Handle form field changes
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle template selection
  const handleTemplateSelect = (templateId: string) => {
    // Check if template is disabled
    const template = contractTemplates.find(t => t.id === templateId);
    if (template?.disabled) {
      return; // Don't allow selection of disabled templates
    }

    setSelectedTemplate(templateId);
    // Reset form data when template changes - keep default values
    setFormData({
      // NDA fields
      disclosingParty: '',
      receivingParty: '',
      purpose: '',
      duration: 5,
      mutualNDA: false,
      // Employment fields
      employeeName: '',
      employerName: '',
      employerAddress: '',
      employerPhone: '',
      employerWebsite: '',
      employeeAddress: '',
      position: '',
      salary: '',
      startDate: '',
      workingHours: 100,
      probationPeriod: 3,
      vacationDays: 25,
      // Terms fields
      companyName: '',
      companyAddress: '',
      businessType: 'Dienstleistung',
      paymentTerms: '30 Tage',
      warrantyPeriod: 12,
      jurisdiction: 'Zürich',
      dataProtection: true
    });
  };

  // Map form data to backend parameters
  const mapFormDataToBackendParams = () => {
    if (selectedTemplate === 'nda') {
      return {
        disclosingParty: formData.disclosingParty,
        receivingParty: formData.receivingParty,
        purpose: formData.purpose,
        duration: formData.duration,
        mutualNDA: formData.mutualNDA
      };
    } else if (selectedTemplate === 'employment') {
      return {
        employeeName: formData.employeeName,
        employerName: formData.employerName,
        employerAddress: formData.employerAddress,
        employerPhone: formData.employerPhone,
        employerWebsite: formData.employerWebsite,
        employeeAddress: formData.employeeAddress,
        position: formData.position,
        salary: formData.salary,
        startDate: formData.startDate,
        workingHours: formData.workingHours,
        probationPeriod: formData.probationPeriod,
        vacationDays: formData.vacationDays
      };
    } else if (selectedTemplate === 'terms') {
      return {
        companyName: formData.companyName,
        companyAddress: formData.companyAddress,
        businessType: formData.businessType,
        paymentTerms: formData.paymentTerms,
        warrantyPeriod: formData.warrantyPeriod,
        jurisdiction: formData.jurisdiction,
        dataProtection: formData.dataProtection
      };
    }
    return {};
  };

  // Generate contract
  const generateContract = async () => {
    // Validate required fields based on contract type
    let missingFields: string[] = [];

    if (selectedTemplate === 'nda') {
      if (!formData.disclosingParty) missingFields.push('Offenlegende Partei');
      if (!formData.receivingParty) missingFields.push('Empfangende Partei');
      if (!formData.purpose) missingFields.push('Zweck der Offenlegung');
    } else if (selectedTemplate === 'employment') {
      if (!formData.employeeName) missingFields.push('Name des Arbeitnehmers');
      if (!formData.employerName) missingFields.push('Name des Arbeitgebers');
      if (!formData.employerAddress) missingFields.push('Adresse des Arbeitgebers');
      if (!formData.employeeAddress) missingFields.push('Adresse des Arbeitnehmers');
      if (!formData.position) missingFields.push('Position/Stelle');
      if (!formData.salary) missingFields.push('Gehalt');
      if (!formData.startDate) missingFields.push('Arbeitsbeginn');
    } else if (selectedTemplate === 'terms') {
      if (!formData.companyName) missingFields.push('Firmenname');
      if (!formData.companyAddress) missingFields.push('Firmenadresse');
      if (!formData.jurisdiction) missingFields.push('Gerichtsstand');
    }

    if (missingFields.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Fehlende Angaben',
        description: `Bitte füllen Sie folgende Pflichtfelder aus: ${missingFields.join(', ')}`
      });
      return;
    }

    // Clear any previous errors
    clearError();

    try {
      const parameters = mapFormDataToBackendParams();

      const result = await generateContractAPI({
        contractType: selectedTemplate,
        parameters
      });

      if (result) {
        setGeneratedContract(result);
        toast({
          title: 'Vertrag generiert',
          description: 'Der Vertrag wurde erfolgreich erstellt und gespeichert.'
        });
      }
    } catch (error) {
      console.error('Contract generation error:', error);
      toast({
        variant: 'destructive',
        title: 'Generierung fehlgeschlagen',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler'
      });
    }
  };


  // Update contract templates to be interactive
  const updatedContractTemplates = contractTemplates.map(template => ({
    ...template,
    selected: template.id === selectedTemplate
  }));

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Generator</h1>
            <p className="text-muted-foreground">
              Erstellen Sie rechtssichere Verträge mit KI-Unterstützung
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Template Selection */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <FileText className="h-5 w-5" />
                  <span>Vorlagen auswählen</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {updatedContractTemplates.map((template) => {
                  const Icon = template.icon;
                  const isDisabled = template.disabled;
                  return (
                    <div
                      key={template.id}
                      onClick={() => !isDisabled && handleTemplateSelect(template.id)}
                      className={`rounded-lg border-2 p-4 transition-all ${
                        isDisabled
                          ? 'cursor-not-allowed opacity-50 border-gray-200 bg-gray-50'
                          : `cursor-pointer hover:border-primary ${
                              template.selected
                                ? 'border-primary bg-primary/5'
                                : 'border-border'
                            }`
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <Icon className={`h-6 w-6 shrink-0 ${isDisabled ? 'text-gray-400' : 'text-primary'}`} />
                        <div className="flex-1">
                          <h3 className={`font-medium ${isDisabled ? 'text-gray-500' : 'text-foreground'}`}>
                            {template.title}
                            {isDisabled && <span className="ml-2 text-xs">(Momentan deaktiviert)</span>}
                          </h3>
                          <p className={`text-sm mt-1 ${isDisabled ? 'text-gray-400' : 'text-muted-foreground'}`}>
                            {template.description}
                          </p>
                          <Badge variant={isDisabled ? "outline" : "secondary"} className="mt-2 text-xs">
                            {template.category}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Contract Form */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  {selectedTemplate === 'nda' && <Shield className="h-5 w-5" />}
                  {selectedTemplate === 'employment' && <Briefcase className="h-5 w-5" />}
                  {selectedTemplate === 'terms' && <BookOpen className="h-5 w-5" />}
                  <span>
                    {selectedTemplate === 'nda' && 'Geheimhaltungsvereinbarung (NDA)'}
                    {selectedTemplate === 'employment' && 'Arbeitsvertrag'}
                    {selectedTemplate === 'terms' && 'Allgemeine Geschäftsbedingungen'}
                  </span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Füllen Sie die Felder aus, um Ihren personalisierten Vertrag zu erstellen
                </p>
              </CardHeader>
              <CardContent className="space-y-6">

                {/* NDA Form */}
                {selectedTemplate === 'nda' && (
                  <div className="space-y-4">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Vertragsparteien</h3>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="disclosingParty">Offenlegende Partei *</Label>
                          <Input
                            id="disclosingParty"
                            placeholder="Name der offenlegenden Partei"
                            value={formData.disclosingParty}
                            onChange={(e) => handleInputChange('disclosingParty', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="receivingParty">Empfangende Partei *</Label>
                          <Input
                            id="receivingParty"
                            placeholder="Name der empfangenden Partei"
                            value={formData.receivingParty}
                            onChange={(e) => handleInputChange('receivingParty', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="purpose">Zweck der Offenlegung *</Label>
                      <Textarea
                        id="purpose"
                        placeholder="Beschreiben Sie den Zweck, für den die vertraulichen Informationen offengelegt werden..."
                        rows={3}
                        value={formData.purpose}
                        onChange={(e) => handleInputChange('purpose', e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="duration">Dauer der Geheimhaltung (Jahre)</Label>
                        <Input
                          id="duration"
                          type="number"
                          placeholder="5"
                          value={formData.duration}
                          onChange={(e) => handleInputChange('duration', parseInt(e.target.value) || 5)}
                        />
                      </div>
                      <div className="space-y-2 flex items-center">
                        <input
                          id="mutualNDA"
                          type="checkbox"
                          checked={formData.mutualNDA}
                          onChange={(e) => handleInputChange('mutualNDA', e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        <Label htmlFor="mutualNDA" className="ml-2">
                          Gegenseitige Geheimhaltung
                        </Label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Employment Form */}
                {selectedTemplate === 'employment' && (
                  <div className="space-y-4">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Vertragsparteien</h3>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="employerName">Name des Arbeitgebers *</Label>
                          <Input
                            id="employerName"
                            placeholder="Firmenname oder Name des Arbeitgebers"
                            value={formData.employerName}
                            onChange={(e) => handleInputChange('employerName', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="employeeName">Name des Arbeitnehmers *</Label>
                          <Input
                            id="employeeName"
                            placeholder="Vollständiger Name des Arbeitnehmers"
                            value={formData.employeeName}
                            onChange={(e) => handleInputChange('employeeName', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="employerAddress">Adresse des Arbeitgebers *</Label>
                          <Input
                            id="employerAddress"
                            placeholder="Vollständige Adresse des Arbeitgebers"
                            value={formData.employerAddress}
                            onChange={(e) => handleInputChange('employerAddress', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="employeeAddress">Adresse des Arbeitnehmers *</Label>
                          <Input
                            id="employeeAddress"
                            placeholder="Vollständige Adresse des Arbeitnehmers"
                            value={formData.employeeAddress}
                            onChange={(e) => handleInputChange('employeeAddress', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="employerPhone">Telefonnummer des Arbeitgebers</Label>
                          <Input
                            id="employerPhone"
                            placeholder="z.B. +41 44 123 45 67"
                            value={formData.employerPhone}
                            onChange={(e) => handleInputChange('employerPhone', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="employerWebsite">Website des Arbeitgebers</Label>
                          <Input
                            id="employerWebsite"
                            placeholder="z.B. https://www.beispiel.ch"
                            value={formData.employerWebsite}
                            onChange={(e) => handleInputChange('employerWebsite', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Stellendetails</h3>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="position">Position/Stelle *</Label>
                          <Input
                            id="position"
                            placeholder="z.B. Software Entwickler"
                            value={formData.position}
                            onChange={(e) => handleInputChange('position', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="salary">Gehalt (CHF) *</Label>
                          <Input
                            id="salary"
                            type="number"
                            placeholder="80000"
                            value={formData.salary}
                            onChange={(e) => handleInputChange('salary', parseInt(e.target.value) || '')}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="startDate">Arbeitsbeginn *</Label>
                        <Input
                          id="startDate"
                          type="date"
                          value={formData.startDate}
                          onChange={(e) => handleInputChange('startDate', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="workingHours">Arbeitspensum (%)</Label>
                        <Input
                          id="workingHours"
                          type="number"
                          placeholder="100"
                          value={formData.workingHours}
                          onChange={(e) => handleInputChange('workingHours', parseInt(e.target.value) || 100)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="probationPeriod">Probezeit (Monate)</Label>
                        <Input
                          id="probationPeriod"
                          type="number"
                          placeholder="3"
                          value={formData.probationPeriod}
                          onChange={(e) => handleInputChange('probationPeriod', parseInt(e.target.value) || 3)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="vacationDays">Ferientage pro Jahr</Label>
                      <Input
                        id="vacationDays"
                        type="number"
                        placeholder="25"
                        value={formData.vacationDays}
                        onChange={(e) => handleInputChange('vacationDays', parseInt(e.target.value) || 25)}
                      />
                    </div>
                  </div>
                )}

                {/* Terms Form */}
                {selectedTemplate === 'terms' && (
                  <div className="space-y-4">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Unternehmensdaten</h3>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="companyName">Firmenname *</Label>
                          <Input
                            id="companyName"
                            placeholder="Vollständiger Firmenname"
                            value={formData.companyName}
                            onChange={(e) => handleInputChange('companyName', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="companyAddress">Firmenadresse *</Label>
                          <Input
                            id="companyAddress"
                            placeholder="Vollständige Firmenadresse"
                            value={formData.companyAddress}
                            onChange={(e) => handleInputChange('companyAddress', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Geschäftsdetails</h3>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="businessType">Art des Geschäfts</Label>
                          <Select value={formData.businessType} onValueChange={(value) => handleInputChange('businessType', value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Geschäftsart wählen" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Online-Shop">Online-Shop</SelectItem>
                              <SelectItem value="Dienstleistung">Dienstleistung</SelectItem>
                              <SelectItem value="Software/SaaS">Software/SaaS</SelectItem>
                              <SelectItem value="Beratung">Beratung</SelectItem>
                              <SelectItem value="Sonstiges">Sonstiges</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="paymentTerms">Zahlungsbedingungen</Label>
                          <Select value={formData.paymentTerms} onValueChange={(value) => handleInputChange('paymentTerms', value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Zahlungsbedingungen wählen" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Sofort">Sofort</SelectItem>
                              <SelectItem value="7 Tage">7 Tage</SelectItem>
                              <SelectItem value="14 Tage">14 Tage</SelectItem>
                              <SelectItem value="30 Tage">30 Tage</SelectItem>
                              <SelectItem value="60 Tage">60 Tage</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="warrantyPeriod">Gewährleistung (Monate)</Label>
                        <Input
                          id="warrantyPeriod"
                          type="number"
                          placeholder="12"
                          value={formData.warrantyPeriod}
                          onChange={(e) => handleInputChange('warrantyPeriod', parseInt(e.target.value) || 12)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="jurisdiction">Gerichtsstand *</Label>
                        <Input
                          id="jurisdiction"
                          placeholder="z.B. Zürich"
                          value={formData.jurisdiction}
                          onChange={(e) => handleInputChange('jurisdiction', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2 flex items-center">
                        <input
                          id="dataProtection"
                          type="checkbox"
                          checked={formData.dataProtection}
                          onChange={(e) => handleInputChange('dataProtection', e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        <Label htmlFor="dataProtection" className="ml-2">
                          Datenschutz einbeziehen
                        </Label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Generation Progress */}
                {isGenerating && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Fortschritt</span>
                      <span className="text-sm text-muted-foreground">{generationProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${generationProgress}%` }}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">{generationMessage}</p>
                  </div>
                )}

                {/* Generated Contract Preview */}
                {generatedContract && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold">Vertrag erfolgreich generiert</h3>
                    <div className="border rounded-lg p-4 bg-green-50">
                      <p className="text-sm text-green-800">
                        Ihr {generatedContract.contractType} wurde erfolgreich erstellt und gespeichert. 
                        Sie können das PDF öffnen
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <a
                        href={generatedContract.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex"
                      >
                        <Button variant="outline">
                          <Download className="h-4 w-4 mr-2"/>
                          PDF öffnen
                        </Button>
                      </a>
                    </div>

                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex space-x-4 pt-4">
                  <Button 
                    className="flex-1" 
                    size="lg"
                    onClick={generateContract}
                    disabled={isGenerating}
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    {isGenerating ? 'Generiert...' : 'Vertrag generieren'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
