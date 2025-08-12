'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, Check } from 'lucide-react'

interface DownloadModalProps {
  isOpen: boolean
  onClose: () => void
}

interface DownloadOption {
  name: string
  version: string
  size: string
  os: 'Windows' | 'macOS' | 'Linux'
  downloadUrl: string
  isRecommended?: boolean
}

export function DownloadModal({ isOpen, onClose }: DownloadModalProps) {
  const [currentOS, setCurrentOS] = useState<'Windows' | 'macOS' | 'Linux'>('Windows')
  const [isMobile, setIsMobile] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    const detectOS = () => {
      const platform = window.navigator.userAgent.toLowerCase()
      const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i
      
      setIsMobile(mobileRegex.test(window.navigator.userAgent))
      
      if (platform.includes('win')) return 'Windows'
      if (platform.includes('mac')) return 'macOS'
      if (platform.includes('linux')) return 'Linux'
      return 'Windows'
    }
    setCurrentOS(detectOS())
  }, [])

  const downloadOptions: DownloadOption[] = [
    {
      name: 'AutoSubs for Windows',
      version: 'v3.0.1',
      size: '68 MB',
      os: 'Windows',
      downloadUrl: 'https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-windows-x86_64.exe',
      isRecommended: currentOS === 'Windows'
    },
    {
      name: 'AutoSubs for macOS',
      version: 'v3.0.1',
      size: '66 MB',
      os: 'macOS',
      downloadUrl: 'https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-macOS-arm64.pkg',
      isRecommended: currentOS === 'macOS'
    }
  ]

  const handleDownload = (url: string) => {
    setDownloading(url)
    const link = document.createElement('a')
    link.href = url
    link.download = url.split('/').pop() || 'auto-subs'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    setTimeout(() => {
      setDownloading(null)
      onClose()
    }, 2000)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white dark:bg-gray-900 rounded-lg sm:rounded-xl shadow-2xl w-full max-w-[calc(100vw-1rem)] sm:max-w-md md:max-w-lg lg:max-w-2xl max-h-[calc(100vh-2rem)] sm:max-h-[90vh] overflow-y-auto mx-auto border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            {isMobile ? (
              <div className="p-8 text-center">
                <div className="mb-6">
                  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Download size={32} className="text-gray-600 dark:text-gray-300" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    AutoSubs is Desktop Only
                  </h2>
                  <p className="text-gray-600 dark:text-gray-300">
                    AutoSubs is currently only available for Windows, macOS, and Linux desktop computers. 
                    Please visit this page on a desktop computer to download.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>Tip:</strong> You can also access the downloads on our{' '}
                      <a
                        href="https://github.com/tmoroney/auto-subs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        GitHub releases page
                      </a>{' '}
                      from any device.
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="w-full bg-gray-900 dark:bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-blue-700 transition-colors"
                  >
                    Got it
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Download AutoSubs</h2>
                    <button
                      onClick={onClose}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-800 dark:text-gray-200"
                      aria-label="Close"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 mt-2">
                    Choose the version for your operating system
                  </p>
                </div>

                <div className="p-6 space-y-4">
                  {downloadOptions.map((option) => (
                    <div
                      key={option.os}
                      className={`border rounded-lg p-4 transition-all ${
                        option.isRecommended
                          ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                            option.isRecommended 
                              ? 'bg-blue-500 text-white' 
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                          }`}>
                            {option.os === 'Windows' && 'Win'}
                            {option.os === 'macOS' && 'Mac'}
                            {option.os === 'Linux' && 'Lin'}
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                              {option.name}
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                              {option.version} • {option.size}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {option.isRecommended && (
                            <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-100 px-2 py-1 rounded-full">
                              Recommended
                            </span>
                          )}
                          <button
                            onClick={() => handleDownload(option.downloadUrl)}
                            disabled={downloading === option.downloadUrl}
                            className={`px-4 py-2 rounded-lg font-medium transition-all ${
                              option.isRecommended
                                ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                                : 'bg-gray-900 dark:bg-gray-800 text-white hover:bg-gray-800 dark:hover:bg-gray-700'
                            } ${
                              downloading === option.downloadUrl
                                ? 'opacity-70 cursor-not-allowed'
                                : ''
                            }`}
                          >
                            {downloading === option.downloadUrl ? (
                              <div className="flex items-center space-x-1 text-green-600 dark:text-green-400">
                                <Check size={16} className="text-current" />
                                <span>Downloading...</span>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-1">
                                <Download size={16} className="text-current" />
                                <span>Download</span>
                              </div>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-6 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-2">Need help?</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    <a href="https://discord.com/invite/TBFUfGWegm" className="text-blue-600 dark:text-blue-400 hover:underline">
                    Join our Discord Server
                    </a>
                  </p>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
