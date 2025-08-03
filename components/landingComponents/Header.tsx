'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { DownloadModal } from '@/components/ui/DownloadModal'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

interface HeaderProps {
  onNavigate: (sectionId: string) => void
}

export default function Header({ onNavigate }: HeaderProps) {
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

  const handleNavigation = (sectionId: string) => {
    onNavigate(sectionId)
  }

  return (
    <div>
    <header
      className={`fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 lg:px-8 py-4 transition-all duration-300 ${
        isVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}
    >
      <div className="container mx-auto max-w-full sm:max-w-5xl px-2">
        <div
          className={`rounded-lg sm:rounded-full py-3 px-4 flex items-center justify-between bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-lg transition-all duration-300 w-full max-w-full`}
        >
          <a className="flex items-center justify-center flex-shrink-0" href="#">
            <Image src="/auto-subs/assets/logo.png" alt="AutoSubs Logo" width={32} height={32} className="w-8 h-8 sm:w-9 sm:h-9" />
            <span className="ml-2 text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 font-['Poppins'] hidden sm:block">AutoSubs</span>
          </a>
          <nav className="flex items-center gap-2 sm:gap-4">
            <ThemeToggle />
            <a
              className="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors duration-300"
              onClick={() => handleNavigation('support')} >
              Support Project
            </a>
            <a
              className="hidden md:block text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors duration-300"
              onClick={() => window.open('https://discord.com/invite/TBFUfGWegm', '_blank')} >
              Join Discord
            </a>
            <button
              className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 px-4 py-2 rounded-full cursor-pointer transition-colors duration-300 whitespace-nowrap flex-shrink-0"
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