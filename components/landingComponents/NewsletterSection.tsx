'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle } from 'lucide-react'
import dynamic from 'next/dynamic'

// Dynamically import confetti with no SSR
const ReactConfetti = dynamic(() => import('react-confetti'), {
  ssr: false
})

interface NewsletterSectionProps {
  onNavigate?: (sectionId: string) => void
}

export default function NewsletterSection({}: NewsletterSectionProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const observerOptions = {
      threshold: 0.2,
      rootMargin: '0px 0px -100px 0px'
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      })
    }, observerOptions)

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  const triggerConfetti = () => {
    setShowConfetti(true)
    setTimeout(() => setShowConfetti(false), 5000) // Show confetti for 5 seconds
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    
    setIsSubmitting(true)
    
    try {
      // Submit to Google Forms
      const formData = new FormData()
      formData.append('entry.1512513490', email)  // The field name from Google Forms
      
      await fetch('https://docs.google.com/forms/d/e/1FAIpQLSdw8M8f4KrEiloXorB0ob6J0ywiutdPSaGASN49a2sGmLYsGw/formResponse', {
        method: 'POST',
        mode: 'no-cors',
        body: formData
      })
      
      // Show success state with confetti
      setShowSuccess(true)
      triggerConfetti()
      setEmail('')
      
      // Reset success message after 5 seconds
      setTimeout(() => {
        setShowSuccess(false)
      }, 5000)
    } catch (error) {
      console.error('Error submitting form:', error)
      alert('There was an error. Please try again later.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section 
      ref={sectionRef}
      className="w-full py-24 md:py-40 bg-gray-50 dark:bg-gray-900 scroll-mt-20 relative overflow-hidden transition-colors duration-300"
    >
      {showConfetti && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <ReactConfetti
            width={typeof window !== 'undefined' ? window.innerWidth : 0}
            height={typeof window !== 'undefined' ? window.innerHeight : 0}
            recycle={false}
            numberOfPieces={500}
            gravity={0.2}
          />
        </div>
      )}
      <div className="container mx-auto px-6 lg:px-10 max-w-6xl">
        <div className="flex flex-col items-center space-y-6 text-center">
          <div className={`space-y-4 transition-all duration-1000 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl text-gray-900 dark:text-white">
              Stay Updated
            </h2>
            <p className="mx-auto max-w-[600px] text-gray-600 dark:text-gray-300 text-lg md:text-xl">
              Join our mailing list for the latest AutoSubs updates and releases.
            </p>
          </div>

          <div className={`w-full max-w-md space-y-2 transition-all duration-1000 delay-300 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
            <form 
              className="flex space-x-2"
              onSubmit={handleSubmit}
            >
              <Input
                className="flex-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 border-gray-300 dark:border-gray-600 py-5 transition-all duration-300 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400"
                placeholder="Enter your email"
                type="email"
                id="email"
                name="entry.1512513490"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
              />
              <Button 
                type="submit" 
                className="bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white py-5 transition-all duration-300"
              >
                {showSuccess ? (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Subscribed!
                  </>
                ) : isSubmitting ? (
                  'Subscribing...'
                ) : (
                  'Subscribe'
                )}
              </Button>
            </form>

            {showSuccess ? (
              <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 p-3 rounded-lg mt-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                <span>Thanks for subscribing!</span>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                No spam, unsubscribe anytime.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
