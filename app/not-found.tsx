'use client'

import { useEffect } from 'react'
import Header from '@/components/landingComponents/Header'
import { DotLottieReact } from '@lottiefiles/dotlottie-react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  useEffect(() => {
    document.title = 'Page Not Found - AutoSubs'
  }, [])

  return (
    <div className="min-h-screen pt-11 bg-gradient-to-br from-[#1E40AF] to-[#4F46E5] dark:from-[#1e293b] dark:to-[#0f172a] transition-colors duration-300">
      <Header />
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-4">
        <motion.div 
          className="text-center max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mb-8"
          >
            <DotLottieReact
              src="/auto-subs/assets/404.lottie"
              loop
              autoplay
              style={{ 
                width: '400px', 
                height: '400px',
                maxWidth: '100%',
                margin: '0 auto'
              }}
            />
          </motion.div>

          <motion.p 
            className="text-lg text-blue-200 dark:text-blue-300 mb-8 max-w-md mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            Looks like this page got lost in the timeline. Let&apos;s get you back on track!
          </motion.p>

          <Link href="/" className="inline-block">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button 
                size="lg" 
                variant="outline" 
                className="border-white/50 bg-transparent text-white hover:text-blue-600 hover:bg-white dark:hover:bg-blue-700 dark:hover:text-white font-bold px-8 py-7 text-base transition-all duration-300 flex items-center gap-2"
              >
                Go Home
              </Button>
            </motion.div>
          </Link>

          {/* Additional Info */}
          <motion.div 
            className="mt-12 text-sm text-blue-300 dark:text-blue-400"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.5 }}
          >
            <p>Need help? Join our <a href="https://discord.gg/TBFUfGWegm" className="text-yellow-300 dark:text-sky-400 hover:text-yellow-200 dark:hover:text-sky-300 underline">Discord community</a></p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
