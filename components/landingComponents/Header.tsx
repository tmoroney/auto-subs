'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { DownloadModal } from '@/components/ui/DownloadModal'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

export default function Header() {
  const [isVisible, setIsVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > lastScrollY) {
        setIsVisible(false)
      } else {
        setIsVisible(true)
      }
      setLastScrollY(window.scrollY)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [lastScrollY])

  return (
    <div>
    <header
      className={`fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 lg:px-8 py-4 transition-all duration-300 overflow-x-hidden ${
        isVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}
    >
      <div className="container mx-auto max-w-full sm:max-w-5xl px-0 sm:px-2">
        <div
          className={`rounded-lg sm:rounded-full py-2 sm:py-3 px-2 sm:px-4 flex items-center justify-between bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-lg transition-all duration-300 w-full max-w-full`}
        >
          <a className="flex items-center justify-center flex-shrink-0 min-w-0" href="#">
            <Image src="/auto-subs/assets/logo.png" alt="AutoSubs Logo" width={32} height={32} className="w-7 h-7 sm:w-9 sm:h-9" />
            <span className="ml-1.5 sm:ml-2 text-sm sm:text-lg font-semibold text-gray-900 dark:text-gray-100 font-['Poppins'] hidden sm:block">AutoSubs</span>
          </a>
          <nav className="flex items-center gap-1 sm:gap-2 md:gap-4 flex-shrink-0">
            <ThemeToggle />
            <a
              className="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors duration-300"
              href="#support" >
              Support Project
            </a>
            <a
              className="hidden md:block text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors duration-300"
              href="https://discord.com/invite/TBFUfGWegm" >
              Join Discord
            </a>
            <button
              className="text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full cursor-pointer transition-colors duration-300 whitespace-nowrap flex-shrink-0"
              onClick={() => setIsModalOpen(true)}
            >
              Download
            </button>
          </nav>
        </div>
      </div>
    </header>
    <DownloadModal 
      isOpen={isModalOpen} 
      onClose={() => setIsModalOpen(false)} 
    />
    </div>
  )
}