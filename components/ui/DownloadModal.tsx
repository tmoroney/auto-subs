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
      version: 'v2.1.0',
      size: '45.2 MB',
      os: 'Windows',
      downloadUrl: '/downloads/auto-subs-windows-v2.1.0.exe',
      isRecommended: currentOS === 'Windows'
    },
    {
      name: 'AutoSubs for macOS',
      version: 'v2.1.0',
      size: '52.8 MB',
      os: 'macOS',
      downloadUrl: '/downloads/auto-subs-macos-v2.1.0.dmg',
      isRecommended: currentOS === 'macOS'
    },
    {
      name: 'AutoSubs for Linux',
      version: 'v2.1.0',
      size: '48.1 MB',
      os: 'Linux',
      downloadUrl: '/downloads/auto-subs-linux-v2.1.0.AppImage',
      isRecommended: currentOS === 'Linux'
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
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-lg sm:rounded-xl shadow-2xl w-full max-w-[calc(100vw-1rem)] sm:max-w-md md:max-w-lg lg:max-w-2xl max-h-[calc(100vh-2rem)] sm:max-h-[90vh] overflow-y-auto mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {isMobile ? (
              <div className="p-8 text-center">
                <div className="mb-6">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Download size={32} className="text-gray-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    AutoSubs is Desktop Only
                  </h2>
                  <p className="text-gray-600">
                    AutoSubs is currently only available for Windows, macOS, and Linux desktop computers. 
                    Please visit this page on a desktop computer to download.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      <strong>Tip:</strong> You can also access the downloads on our{' '}
                      <a
                        href="https://github.com/tmoroney/auto-subs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-medium"
                      >
                        GitHub releases page
                      </a>{' '}
                      from any device.
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="w-full bg-gray-900 text-white py-3 px-4 rounded-lg font-medium hover:bg-gray-800 transition-colors"
                  >
                    Got it
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-gray-900">Download AutoSubs</h2>
                    <button
                      onClick={onClose}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <p className="text-gray-600 mt-2">
                    Choose the version for your operating system
                  </p>
                </div>

                <div className="p-6 space-y-4">
                  {downloadOptions.map((option) => (
                    <div
                      key={option.os}
                      className={`border rounded-lg p-4 transition-all ${
                        option.isRecommended
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                            option.isRecommended ? 'bg-blue-500 text-white' : 'bg-gray-100'
                          }`}>
                            {option.os === 'Windows' && 'Win'}
                            {option.os === 'macOS' && 'Mac'}
                            {option.os === 'Linux' && 'Lin'}
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {option.name}
                            </h3>
                            <p className="text-sm text-gray-600">
                              {option.version} • {option.size}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {option.isRecommended && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                              Recommended
                            </span>
                          )}
                          <button
                            onClick={() => handleDownload(option.downloadUrl)}
                            disabled={downloading === option.downloadUrl}
                            className={`px-4 py-2 rounded-lg font-medium transition-all ${
                              option.isRecommended
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-gray-900 text-white hover:bg-gray-800'
                            } ${
                              downloading === option.downloadUrl
                                ? 'opacity-50 cursor-not-allowed'
                                : ''
                            }`}
                          >
                            {downloading === option.downloadUrl ? (
                              <div className="flex items-center space-x-2">
                                <Check size={16} />
                                <span>Downloading...</span>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <Download size={16} />
                                <span>Download</span>
                              </div>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-6 border-t border-gray-200">
                  <div className="text-sm text-gray-600">
                    <p>System detected: {currentOS}</p>
                    <p className="mt-1">
                      Need a different version? All downloads are also available on our{' '}
                      <a
                        href="https://github.com/tmoroney/auto-subs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        GitHub releases page
                      </a>
                    </p>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
