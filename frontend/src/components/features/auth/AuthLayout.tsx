"use client"

import { motion } from "motion/react"
import { ReactNode } from "react"

interface AuthLayoutProps {
  children: ReactNode
  title?: string
  subtitle?: string
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md mx-auto">
          {children}
        </div>
      </div>

      {/* Right side - Branding */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden">
        {/* Background with gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-purple-600 to-blue-800">
          {/* Animated background patterns */}
          <motion.div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `radial-gradient(circle at 20% 80%, white 1px, transparent 1px),
                               radial-gradient(circle at 80% 20%, white 1px, transparent 1px),
                               radial-gradient(circle at 40% 40%, white 1px, transparent 1px)`,
              backgroundSize: '100px 100px, 80px 80px, 120px 120px'
            }}
            animate={{
              backgroundPosition: ['0% 0%', '100% 100%'],
            }}
            transition={{
              duration: 20,
              repeat: Infinity,
              repeatType: 'reverse',
              ease: 'linear'
            }}
          />
          
          {/* Floating elements */}
          <motion.div
            className="absolute top-1/4 left-1/4 w-32 h-32 bg-white/10 rounded-full blur-xl"
            animate={{
              y: [-20, 20, -20],
              x: [-10, 10, -10],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          <motion.div
            className="absolute top-3/4 right-1/4 w-24 h-24 bg-white/10 rounded-full blur-xl"
            animate={{
              y: [20, -20, 20],
              x: [10, -10, 10],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-12 text-white">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            <h1 className="text-4xl font-bold mb-6">
              LexPilot AI
            </h1>
            <p className="text-xl text-blue-100 mb-8 leading-relaxed">
              Intelligente Rechtsanalyse für das Schweizer Recht. 
              Nutzen Sie die Kraft der KI für präzise und effiziente 
              Rechtsdokumentanalyse.
            </p>
            
            <div className="space-y-4">
              <motion.div 
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
              >
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-blue-100">KI-gestützte Dokumentanalyse</span>
              </motion.div>
              <motion.div 
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 }}
              >
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-blue-100">DSGVO-konforme Verarbeitung</span>
              </motion.div>
              <motion.div 
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 }}
              >
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-blue-100">Spezialisiert auf Schweizer Recht</span>
              </motion.div>
              <motion.div 
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 }}
              >
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-blue-100">Sichere Cloud-basierte Lösung</span>
              </motion.div>
            </div>

            <motion.div
              className="mt-12 p-6 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 }}
            >
              <p className="text-sm text-blue-100 italic">
                &ldquo;LexPilot hat unsere Rechtsdokumentanalyse revolutioniert. 
                Die Präzision und Geschwindigkeit der KI-Analyse ist beeindruckend.&rdquo;
              </p>
              <p className="text-xs text-blue-200 mt-2">
                — Dr. Sarah Müller, Rechtsanwältin
              </p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
