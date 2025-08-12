'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, Check, Loader2 } from 'lucide-react'

import { DownloadOption } from '@/types/interfaces'
import { downloads } from '@/data/downloads'

interface DownloadModalProps {
  isOpen: boolean
  onClose: () => void
}

export function DownloadModal({ isOpen, onClose }: DownloadModalProps) {
  const [currentOS, setCurrentOS] = useState<'Windows' | 'macOS' | 'Linux'>('Windows')
  const [macArch, setMacArch] = useState<'arm64' | 'x86_64' | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    const detect = () => {
      const ua = window.navigator.userAgent
      const uaLower = ua.toLowerCase()
      const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i

      setIsMobile(mobileRegex.test(ua))

      // OS
      let os: 'Windows' | 'macOS' | 'Linux' = 'Windows'
      if (uaLower.includes('win')) os = 'Windows'
      else if (uaLower.includes('mac')) os = 'macOS'
      else if (uaLower.includes('linux')) os = 'Linux'
      setCurrentOS(os)

      // macOS architecture heuristic
      if (os === 'macOS') {
        // Prefer User-Agent Client Hints if available (Chromium)
        // @ts-ignore - not all browsers expose userAgentData
        const uad = navigator.userAgentData
        if (uad && typeof uad.getHighEntropyValues === 'function') {
          // Best effort, non-blocking
          try {
            // @ts-ignore
            uad.getHighEntropyValues(['architecture']).then((hints: { architecture?: string }) => {
              const arch = hints?.architecture?.toLowerCase()
              if (arch?.includes('arm')) setMacArch('arm64')
              else if (arch?.includes('x86')) setMacArch('x86_64')
            }).catch(() => { /* ignore */ })
          } catch { /* ignore */ }
        }

        // Fallback heuristics from UA
        if (uaLower.includes('arm64') || uaLower.includes('apple silicon') || uaLower.includes('aarch64')) {
          setMacArch('arm64')
        } else if (uaLower.includes('intel') || uaLower.includes('x86_64') || uaLower.includes('x86-64')) {
          setMacArch('x86_64')
        } else {
          // Safari often reports Intel on Apple Silicon; if on macOS and not sure, prefer arm64 (most modern Macs)
          setMacArch('arm64')
        }
      } else {
        setMacArch(null)
      }
    }
    detect()
  }, [])

  const downloadOptions: DownloadOption[] = [
    ...downloads
  ]

  // Compute a runtime-recommended download url based on detected OS/arch
  const recommendedUrl = (() => {
    if (currentOS === 'Windows') {
      return downloadOptions.find(o => o.os === 'Windows')?.downloadUrl
    }
    if (currentOS === 'macOS') {
      if (macArch === 'arm64') {
        return downloadOptions.find(o => o.os === 'macOS' && /(arm64|Apple\s*Silicon|\barm\b|mac[-_ ]?arm)/i.test(o.name + ' ' + o.downloadUrl))?.downloadUrl
          ?? downloadOptions.find(o => o.name.includes('Apple Silicon'))?.downloadUrl
      }
      if (macArch === 'x86_64') {
        return downloadOptions.find(o => o.os === 'macOS' && /(x86_64|x86-64|Intel|mac[-_ ]?intel)/i.test(o.name + ' ' + o.downloadUrl))?.downloadUrl
          ?? downloadOptions.find(o => o.name.includes('Intel'))?.downloadUrl
      }
    }
    return undefined
  })()

  const handleDownload = async (url: string) => {
    try {
      setDownloading(url)
      const response = await fetch(url, { mode: 'cors', redirect: 'follow' })
      if (!response.ok) throw new Error(`Download failed: ${response.status}`)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const filename = url.split('/').pop() || 'auto-subs'
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch (e) {
      // Fallback: try direct anchor click without navigation side-effects
      const a = document.createElement('a')
      a.href = url
      a.setAttribute('download', url.split('/').pop() || 'auto-subs')
      a.rel = 'noopener'
      a.target = '_self'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } finally {
      // Keep indicator visible briefly for UX even if browser saves instantly
      setTimeout(() => setDownloading(null), 2500)
    }
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
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700 h-9 px-4 py-2"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Download AutoSubs</h2>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    aria-label="Close"
                  >
                    <X size={20} className="text-gray-600 dark:text-gray-300" />
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    Detected OS: <span className="font-medium">{currentOS}</span>
                    {currentOS === 'macOS' && (
                      <>
                        {' '}• Architecture: <span className="font-medium">{macArch ?? 'detecting...'}</span>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {downloadOptions.map((option) => {
                      const isRuntimeRecommended = recommendedUrl && option.downloadUrl === recommendedUrl
                      const effectiveRecommended = !!isRuntimeRecommended || !!option.isRecommended
                      return (
                        <div
                          key={option.downloadUrl}
                          className={`p-4 rounded-xl border transition-all ${
                          effectiveRecommended 
                            ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/30'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                            effectiveRecommended 
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
                              {effectiveRecommended && (
                                <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-100 px-2 py-1 rounded-full">
                                  Recommended
                                </span>
                              )}
                              <button
                                onClick={() => handleDownload(option.downloadUrl)}
                                disabled={downloading === option.downloadUrl}
                                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                effectiveRecommended
                                  ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                                  : 'bg-gray-900 dark:bg-gray-800 text-white hover:bg-gray-800 dark:hover:bg-gray-700'
                                } ${
                                  downloading === option.downloadUrl
                                    ? 'opacity-70 cursor-not-allowed'
                                    : ''
                                }`}
                              >
                                {downloading === option.downloadUrl ? (
                                  <div className="flex items-center space-x-1">
                                    <Loader2 size={16} className="animate-spin" />
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
                      )
                    })}
                  </div>

                  <div className="p-6 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-2">Need help?</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      <a href="https://discord.com/invite/TBFUfGWegm" className="text-blue-600 dark:text-blue-400 hover:underline">
                      Join our Discord Server
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
