'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

interface HeaderProps {
  onNavigate: (sectionId: string) => void
}

export default function Header({ onNavigate }: HeaderProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)

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
    <header
      className={`fixed top-0 left-0 right-0 z-50 px-6 lg:px-10 py-4 transition-all duration-300 ${
        isVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}
    >
      <div className="container mx-auto max-w-6xl">
        <div
          className={`rounded-full py-3 px-6 flex items-center bg-white/90 backdrop-blur-md shadow-lg transition-all duration-300`}
        >
          <a className="flex items-center justify-center" href="#">
            <Image src="/auto-subs/assets/logo.png" alt="AutoSubs Logo" width={40} height={40} />
            <span className="ml-2 text-2xl font-semibold text-gray-900 font-['Poppins']">
              AutoSubs
            </span>
          </a>
          <nav className="ml-auto flex items-center gap-6 sm:gap-8">
            <a
              className="hidden md:block text-sm font-medium hover:text-blue-600 text-gray-700 cursor-pointer transition-colors duration-300"
              onClick={() => handleNavigation('how-it-works')}
            >
              How It Works
            </a>
            <a
              className="hidden sm:block text-sm font-medium hover:text-blue-600 text-gray-700 cursor-pointer transition-colors duration-300"
              onClick={() => handleNavigation('features')}
            >
              Features
            </a>
            <a
              className="hidden sm:block text-sm font-medium hover:text-blue-600 text-gray-700 cursor-pointer transition-colors duration-300"
              onClick={() => handleNavigation('about')}
            >
              About
            </a>
            <a
              className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-full cursor-pointer transition-colors duration-300"
              onClick={() => handleNavigation('support')}
            >
              Support
            </a>
          </nav>
        </div>
      </div>
    </header>
  )
}