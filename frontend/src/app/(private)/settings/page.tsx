"use client"

import MainLayout from '@/components/layouts/main-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthStore } from '@/lib/stores/authStore';
import { useState } from 'react';
import {
  User,
  CreditCard,
  Bell,
  Shield,
  CheckCircle,
  Crown,
  Zap,
  LogOut,
  Trash2,
} from 'lucide-react';

const subscriptionPlans = [
  {
    name: 'Basic',
    price: 'CHF 99',
    period: 'pro Monat',
    current: false,
    features: [
      '5 Vertragsanalysen pro Monat',
      'Basis-Risikobewertung',
      'Standard-Vorlagen',
      'E-Mail-Support',
    ],
  },
  {
    name: 'Pro',
    price: 'CHF 299',
    period: 'pro Monat',
    current: true,
    popular: true,
    features: [
      'Unbegrenzte Vertragsanalysen',
      'Erweiterte Risikobewertung',
      'Alle Vorlagen + Custom Templates',
      'DSGVO-Echtzeit-Check',
      'Automatische Fristenwarnungen',
      'Prioritäts-Support',
    ],
  },
  {
    name: 'Enterprise',
    price: 'auf Anfrage',
    period: '',
    current: false,
    features: [
      'Alles aus Pro',
      'Multi-User-Zugang',
      'API-Zugang',
      'Individuelle Anpassungen',
      'Dedicated Account Manager',
      'SLA-Garantie',
    ],
  },
];

const notificationSettings = [
  {
    id: 'email-notifications',
    title: 'E-Mail-Benachrichtigungen',
    description: 'Erhalten Sie Updates über neue Analysen und wichtige Ereignisse',
    enabled: true,
  },
  {
    id: 'deadline-warnings',
    title: 'Frist-Warnungen',
    description: 'Benachrichtigung bei bevorstehenden Vertragsfristen',
    enabled: true,
  },
  {
    id: 'analysis-reports',
    title: 'Analyse-Berichte',
    description: 'Wöchentliche Zusammenfassung Ihrer Vertragsanalysen',
    enabled: true,
  },
];

export default function SettingsPage() {
  const { userProfile, signOut, loading } = useAuthStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const getInitials = () => {
    if (userProfile?.displayName) {
      return userProfile.displayName.split(' ').map(n => n[0]).join('').toUpperCase();
    }
    if (userProfile?.firstName && userProfile?.lastName) {
      return `${userProfile.firstName[0]}${userProfile.lastName[0]}`.toUpperCase();
    }
    if (userProfile?.email) {
      return userProfile.email[0]?.toUpperCase() || 'U';
    }
    return 'U';
  };

  const getDisplayName = () => {
    if (userProfile?.displayName) return userProfile.displayName;
    if (userProfile?.firstName && userProfile?.lastName) {
      return `${userProfile.firstName} ${userProfile.lastName}`;
    }
    if (userProfile?.firstName) return userProfile.firstName;
    return 'Benutzer';
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Einstellungen</h1>
          <p className="text-muted-foreground">
            Verwalten Sie Ihr Profil, Abonnement und Benachrichtigungen
          </p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile" className="flex items-center space-x-2">
              <User className="h-4 w-4" />
              <span>Benutzerprofil</span>
            </TabsTrigger>
            <TabsTrigger value="subscription" className="flex items-center space-x-2">
              <CreditCard className="h-4 w-4" />
              <span>Tarifübersicht</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center space-x-2">
              <Bell className="h-4 w-4" />
              <span>Benachrichtigungen</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center space-x-2">
              <Shield className="h-4 w-4" />
              <span>Sicherheit</span>
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Benutzerprofil</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-6">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={userProfile?.photoURL} alt="User" />
                    <AvatarFallback className="text-lg">{getInitials()}</AvatarFallback>
                  </Avatar>
                  <div className="space-y-2">
                    <Button variant="outline">Foto ändern</Button>
                    <p className="text-sm text-muted-foreground">
                      JPG, GIF oder PNG. Max. 1MB.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Vorname</Label>
                    <Input id="firstName" defaultValue={userProfile?.firstName || ''} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Nachname</Label>
                    <Input id="lastName" defaultValue={userProfile?.lastName || ''} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-Mail</Label>
                    <Input id="email" type="email" defaultValue={userProfile?.email || ''} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">Unternehmen</Label>
                    <Input id="company" defaultValue={userProfile?.company || ''} />
                  </div>
                </div>

                <Button>
                  Profil bearbeiten
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Subscription Tab */}
          <TabsContent value="subscription" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {subscriptionPlans.map((plan) => (
                <Card
                  key={plan.name}
                  className={`relative ${
                    plan.current
                      ? 'border-primary ring-2 ring-primary/20'
                      : plan.popular
                      ? 'border-primary'
                      : ''
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-blue-500 text-white">Beliebt</Badge>
                    </div>
                  )}
                  {plan.current && (
                    <div className="absolute -top-3 right-4">
                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                        Aktueller Plan
                      </Badge>
                    </div>
                  )}
                  
                  <CardHeader className="text-center">
                    <CardTitle className="flex items-center justify-center space-x-2">
                      {plan.name === 'Pro' && <Crown className="h-5 w-5 text-yellow-500" />}
                      {plan.name === 'Enterprise' && <Zap className="h-5 w-5 text-purple-500" />}
                      <span>{plan.name}</span>
                    </CardTitle>
                    <div className="space-y-1">
                      <div className="text-3xl font-bold">{plan.price}</div>
                      {plan.period && (
                        <div className="text-sm text-muted-foreground">{plan.period}</div>
                      )}
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    <ul className="space-y-2">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-start space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    
                    <Button
                      className="w-full"
                      variant={plan.current ? 'secondary' : 'default'}
                      disabled={plan.current}
                    >
                      {plan.current ? 'Aktueller Plan' : 'Upgrade'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Benachrichtigungen</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Konfigurieren Sie, wie und wann Sie benachrichtigt werden möchten
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {notificationSettings.map((setting) => (
                  <div
                    key={setting.id}
                    className="flex items-center justify-between space-x-4 p-4 rounded-lg border"
                  >
                    <div className="space-y-1">
                      <div className="font-medium">{setting.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {setting.description}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={setting.id}
                        defaultChecked={setting.enabled}
                        className="rounded border-gray-300"
                      />
                      <Label htmlFor={setting.id} className="sr-only">
                        {setting.title}
                      </Label>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Sicherheitseinstellungen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="currentPassword">Aktuelles Passwort</Label>
                    <Input id="currentPassword" type="password" />
                  </div>
                  <div>
                    <Label htmlFor="newPassword">Neues Passwort</Label>
                    <Input id="newPassword" type="password" />
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
                    <Input id="confirmPassword" type="password" />
                  </div>
                  <Button>Passwort ändern</Button>
                </div>

                <div className="border-t pt-6">
                  <h3 className="font-medium mb-4">Zwei-Faktor-Authentifizierung</h3>
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <div className="font-medium">2FA aktivieren</div>
                      <div className="text-sm text-muted-foreground">
                        Zusätzliche Sicherheit für Ihr Konto
                      </div>
                    </div>
                    <Button variant="outline">Einrichten</Button>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h3 className="font-medium mb-4">Konto-Aktionen</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800">
                      <div>
                        <div className="font-medium text-red-900 dark:text-red-100">Abmelden</div>
                        <div className="text-sm text-red-700 dark:text-red-300">
                          Melden Sie sich von Ihrem Konto ab
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={handleSignOut}
                        disabled={isLoggingOut}
                        className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900"
                      >
                        {isLoggingOut ? (
                          <>Wird abgemeldet...</>
                        ) : (
                          <>
                            <LogOut className="w-4 h-4 mr-2" />
                            Abmelden
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800">
                      <div>
                        <div className="font-medium text-red-900 dark:text-red-100">Konto löschen</div>
                        <div className="text-sm text-red-700 dark:text-red-300">
                          Konto und alle Daten dauerhaft löschen
                        </div>
                      </div>
                      <Button 
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Konto löschen
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
