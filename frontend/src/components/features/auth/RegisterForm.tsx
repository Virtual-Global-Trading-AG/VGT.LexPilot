"use client"

import { useState, useEffect } from "react"
import { motion } from "motion/react"
import { Eye, EyeOff, Mail, Lock, User, Building, ArrowRight, Check, CheckCircle } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { useAuthStore } from "@/lib/stores/authStore"

export function RegisterForm() {
  const router = useRouter()
  const { register, loading, error, clearError } = useAuthStore()
  
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    company: ""
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [registrationSuccess, setRegistrationSuccess] = useState(false)

  // Debug log for registrationSuccess changes
  console.log('registrationSuccess state:', registrationSuccess);

  useEffect(() => {
    console.log('registrationSuccess changed to:', registrationSuccess);
  }, [registrationSuccess]);

  const passwordRequirements = [
    { regex: /.{6,}/, text: "Mindestens 6 Zeichen" },
    { regex: /[A-Z]/, text: "Ein Großbuchstabe" },
    { regex: /[a-z]/, text: "Ein Kleinbuchstabe" },
    { regex: /[0-9]/, text: "Eine Zahl" },
  ]

  const validateForm = () => {
    const errors: Record<string, string> = {}
    
    if (!formData.email) {
      errors.email = "E-Mail ist erforderlich"
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = "Ungültige E-Mail-Adresse"
    }
    
    if (!formData.password) {
      errors.password = "Passwort ist erforderlich"
    } else if (formData.password.length < 6) {
      errors.password = "Passwort muss mindestens 6 Zeichen lang sein"
    }
    
    if (!formData.confirmPassword) {
      errors.confirmPassword = "Passwort-Bestätigung ist erforderlich"
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = "Passwörter stimmen nicht überein"
    }
    
    if (!formData.firstName.trim()) {
      errors.firstName = "Vorname ist erforderlich"
    }
    
    if (!formData.lastName.trim()) {
      errors.lastName = "Nachname ist erforderlich"
    }
    
    if (!agreedToTerms) {
      errors.terms = "Sie müssen den AGB zustimmen"
    }
    
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    
    if (!validateForm()) return
    
    console.log('Starting registration...'); // Debug log
    
    const success = await register({
      email: formData.email,
      password: formData.password,
      displayName: `${formData.firstName} ${formData.lastName}`.trim(),
      firstName: formData.firstName,
      lastName: formData.lastName
    })
    
    console.log('Registration success:', success); // Debug log
    
    if (success) {
      console.log('Setting registrationSuccess to true'); // Debug log
      setRegistrationSuccess(true)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear validation error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: "" }))
    }
  }

  const getPasswordStrength = () => {
    const metRequirements = passwordRequirements.filter(req => 
      req.regex.test(formData.password)
    ).length
    return (metRequirements / passwordRequirements.length) * 100
  }

  const getPasswordStrengthColor = () => {
    const strength = getPasswordStrength()
    if (strength < 25) return "bg-red-500"
    if (strength < 50) return "bg-orange-500"
    if (strength < 75) return "bg-yellow-500"
    return "bg-green-500"
  }

  // Show success message if registration was successful
  if (registrationSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg mx-auto"
      >
        <Card className="border-0 shadow-2xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm">
          <CardHeader className="space-y-1 text-center pb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="mx-auto w-16 h-16 bg-gradient-to-r from-green-600 to-blue-600 rounded-xl flex items-center justify-center mb-4"
            >
              <CheckCircle className="w-8 h-8 text-white" />
            </motion.div>
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
              Registrierung erfolgreich!
            </CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400">
              Ihr Account wurde erfolgreich erstellt
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-4"
            >
              <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  Eine Bestätigungs-E-Mail wurde an <strong>{formData.email}</strong> gesendet.
                </AlertDescription>
              </Alert>

              <div className="space-y-2 text-gray-600 dark:text-gray-400">
                <p>
                  Bitte überprüfen Sie Ihr E-Mail-Postfach und klicken Sie auf den Bestätigungslink, 
                  um Ihren Account zu aktivieren.
                </p>
                <p className="text-sm">
                  Nach der Bestätigung können Sie sich mit Ihren Zugangsdaten anmelden.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="space-y-4"
            >
              <Button
                onClick={() => router.push("/login")}
                className="w-full h-12 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white font-medium transition-all duration-200"
              >
                Zur Anmeldung
              </Button>

              <div className="text-center">
                <button
                  onClick={() => setRegistrationSuccess(false)}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  Zurück zur Registrierung
                </button>
              </div>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-lg mx-auto"
    >
      <Card className="border-0 shadow-2xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm">
        <CardHeader className="space-y-1 text-center pb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="mx-auto w-12 h-12 bg-gradient-to-r from-green-600 to-blue-600 rounded-xl flex items-center justify-center mb-4"
          >
            <User className="w-6 h-6 text-white" />
          </motion.div>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
            Account erstellen
          </CardTitle>
          <CardDescription className="text-gray-600 dark:text-gray-400">
            Registrieren Sie sich für LexForm AI
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-4"
            >
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-4">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-2"
              >
                <Label htmlFor="firstName" className="text-sm font-medium">
                  Vorname
                </Label>
                <Input
                  id="firstName"
                  type="text"
                  placeholder="Max"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange("firstName", e.target.value)}
                  className={`h-12 transition-all duration-200 ${
                    validationErrors.firstName ? "border-red-500 focus:ring-red-500" : ""
                  }`}
                  disabled={loading}
                />
                {validationErrors.firstName && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-red-500"
                  >
                    {validationErrors.firstName}
                  </motion.p>
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-2"
              >
                <Label htmlFor="lastName" className="text-sm font-medium">
                  Nachname
                </Label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Mustermann"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange("lastName", e.target.value)}
                  className={`h-12 transition-all duration-200 ${
                    validationErrors.lastName ? "border-red-500 focus:ring-red-500" : ""
                  }`}
                  disabled={loading}
                />
                {validationErrors.lastName && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-red-500"
                  >
                    {validationErrors.lastName}
                  </motion.p>
                )}
              </motion.div>
            </div>

            {/* Email */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="space-y-2"
            >
              <Label htmlFor="email" className="text-sm font-medium">
                E-Mail-Adresse
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  id="email"
                  type="email"
                  placeholder="max@beispiel.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  className={`pl-10 h-12 transition-all duration-200 ${
                    validationErrors.email ? "border-red-500 focus:ring-red-500" : ""
                  }`}
                  disabled={loading}
                />
              </div>
              {validationErrors.email && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-red-500"
                >
                  {validationErrors.email}
                </motion.p>
              )}
            </motion.div>

            {/* Company (Optional) */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
              className="space-y-2"
            >
              <Label htmlFor="company" className="text-sm font-medium">
                Unternehmen <span className="text-gray-400">(optional)</span>
              </Label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  id="company"
                  type="text"
                  placeholder="Ihr Unternehmen"
                  value={formData.company}
                  onChange={(e) => handleInputChange("company", e.target.value)}
                  className="pl-10 h-12"
                  disabled={loading}
                />
              </div>
            </motion.div>

            {/* Password */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
              className="space-y-2"
            >
              <Label htmlFor="password" className="text-sm font-medium">
                Passwort
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Sicheres Passwort"
                  value={formData.password}
                  onChange={(e) => handleInputChange("password", e.target.value)}
                  className={`pl-10 pr-10 h-12 transition-all duration-200 ${
                    validationErrors.password ? "border-red-500 focus:ring-red-500" : ""
                  }`}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  disabled={loading}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              
              {/* Password Strength Indicator */}
              {formData.password && (
                <div className="space-y-2">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <motion.div
                      className={`h-2 rounded-full transition-all duration-300 ${getPasswordStrengthColor()}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${getPasswordStrength()}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {passwordRequirements.map((req, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-1 ${
                          req.regex.test(formData.password)
                            ? "text-green-600 dark:text-green-400"
                            : "text-gray-400"
                        }`}
                      >
                        <Check className="w-3 h-3" />
                        <span>{req.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {validationErrors.password && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-red-500"
                >
                  {validationErrors.password}
                </motion.p>
              )}
            </motion.div>

            {/* Confirm Password */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7 }}
              className="space-y-2"
            >
              <Label htmlFor="confirmPassword" className="text-sm font-medium">
                Passwort bestätigen
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Passwort wiederholen"
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                  className={`pl-10 pr-10 h-12 transition-all duration-200 ${
                    validationErrors.confirmPassword ? "border-red-500 focus:ring-red-500" : ""
                  }`}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  disabled={loading}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {validationErrors.confirmPassword && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-red-500"
                >
                  {validationErrors.confirmPassword}
                </motion.p>
              )}
            </motion.div>

            {/* Terms Agreement */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 }}
              className="space-y-2"
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="terms"
                  checked={agreedToTerms}
                  onChange={(e) => {
                    setAgreedToTerms(e.target.checked)
                    if (validationErrors.terms) {
                      setValidationErrors(prev => ({ ...prev, terms: "" }))
                    }
                  }}
                  className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  disabled={loading}
                />
                <label htmlFor="terms" className="text-sm text-gray-600 dark:text-gray-400">
                  Ich stimme den{" "}
                  <Link href="/terms" className="text-blue-600 hover:text-blue-700 underline">
                    Allgemeinen Geschäftsbedingungen
                  </Link>{" "}
                  und der{" "}
                  <Link href="/privacy" className="text-blue-600 hover:text-blue-700 underline">
                    Datenschutzerklärung
                  </Link>{" "}
                  zu.
                </label>
              </div>
              {validationErrors.terms && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-red-500"
                >
                  {validationErrors.terms}
                </motion.p>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
            >
              <Button
                type="submit"
                className="w-full h-12 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white font-medium transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <Spinner size="sm" />
                    <span>Account wird erstellt...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span>Account erstellen</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                )}
              </Button>
            </motion.div>
          </form>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0 }}
            className="text-center"
          >
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Bereits ein Account?{" "}
              <Link
                href="/login"
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
              >
                Anmelden
              </Link>
            </p>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
