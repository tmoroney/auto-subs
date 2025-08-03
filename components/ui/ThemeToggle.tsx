'use client'

import { useTheme } from '@/components/ThemeProvider'
import { Moon, Sun } from 'lucide-react'
import { motion } from 'framer-motion'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <motion.button
      onClick={toggleTheme}
      className="relative p-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      aria-label="Toggle theme">
      <motion.div initial={false} animate={{ rotate: theme === 'dark' ? 30 : 0 }} transition={{ duration: 0.3 }}>
        <Sun className="h-5 w-5 text-yellow-500 dark:hidden" />
        <Moon className="h-5 w-5 text-blue-400 hidden dark:block" />
      </motion.div>
      
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-400/20 to-blue-500/20 dark:from-blue-400/20 dark:to-purple-500/20"
        initial={{ opacity: 0 }}
        animate={{ opacity: theme === 'dark' ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      />
    </motion.button>
  )
}
