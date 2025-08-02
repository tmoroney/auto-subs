'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface NewsletterSectionProps {
  onNavigate?: (sectionId: string) => void
}

export default function NewsletterSection({ onNavigate }: NewsletterSectionProps) {
  const [isVisible, setIsVisible] = useState(false)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    // Simulate form submission
    setTimeout(() => {
      setIsSubmitting(false)
      setEmail('')
      // You could add a success message here
    }, 1000)
  }

  return (
    <section 
      ref={sectionRef}
      className="w-full py-24 md:py-40 bg-gray-50 scroll-mt-20"
    >
      <div className="container mx-auto px-6 lg:px-10 max-w-6xl">
        <div className="flex flex-col items-center space-y-6 text-center">
          <div className={`space-y-4 transition-all duration-1000 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl text-gray-900">
              Stay Updated
            </h2>
            <p className="mx-auto max-w-[600px] text-gray-600 text-lg md:text-xl">
              Join our mailing list for the latest AutoSubs updates and releases.
            </p>
          </div>
          
          <div className={`w-full max-w-md space-y-2 transition-all duration-1000 delay-300 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
            <form 
              action="https://docs.google.com/forms/d/e/1FAIpQLSdw8M8f4KrEiloXorB0ob6J0ywiutdPSaGASN49a2sGmLYsGw/formResponse" 
              method="POST" 
              className="flex space-x-2"
              onSubmit={handleSubmit}
              rel="noopener noreferrer"
            >
              <Input
                className="flex-1 bg-white text-gray-900 placeholder-gray-500 border-gray-300 py-5 transition-all duration-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                className="bg-blue-600 text-white hover:bg-blue-700 font-semibold px-6 py-5 border text-md transition-all duration-300 disabled:opacity-50"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Subscribing...' : 'Subscribe'}
              </Button>
            </form>
            
            <p className="text-sm text-gray-500 mt-2">
              No spam, unsubscribe anytime.
            </p>
          </div>
        </div>
      </div>
      
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  )
}
