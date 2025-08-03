'use client'

import { MessageCircle } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="py-8 w-full bg-gray-900 dark:bg-gray-950 text-white transition-colors duration-300">
      <div className="container mx-auto px-6 lg:px-10 max-w-6xl">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <p className="text-sm mb-4 md:mb-0 text-gray-300 dark:text-gray-400 transition-colors duration-300 hover:text-blue-400 dark:hover:text-blue-300">
            © {new Date().getFullYear()} Tom Moroney. All rights reserved.
          </p>
          
          <nav className="flex flex-wrap justify-center md:justify-end gap-6">
            <a 
              className="text-sm text-gray-300 dark:text-gray-400 hover:text-blue-400 dark:hover:text-blue-300 hover:underline underline-offset-4 transition-colors duration-300"
              href="https://github.com/tmoroney/auto-subs"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            
            <a 
              className="text-sm text-gray-300 dark:text-gray-400 hover:text-blue-400 dark:hover:text-blue-300 hover:underline underline-offset-4 transition-colors duration-300"
              href="https://github.com/tmoroney/auto-subs/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
            >
              MIT License
            </a>
            
            <a
              className="text-sm text-gray-300 dark:text-gray-400 hover:text-blue-400 dark:hover:text-blue-300 hover:underline underline-offset-4 transition-colors duration-300 flex items-center"
              href="https://discord.com/invite/TBFUfGWegm"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="h-4 w-4 mr-1 transition-transform duration-300" />
              Join our Discord for Support
            </a>
          </nav>
        </div>
      </div>
    </footer>
  )
}
