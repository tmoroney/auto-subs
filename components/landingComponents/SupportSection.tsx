'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Star, Heart, Type } from 'lucide-react'

interface SupportSectionProps {
  onNavigate: (sectionId: string) => void
}

export default function SupportSection({ onNavigate }: SupportSectionProps) {
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const [visibleCards, setVisibleCards] = useState<number[]>([])

  useEffect(() => {
    const observerOptions = {
      threshold: 0.2,
      rootMargin: '0px 0px -50px 0px'
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          
          const index = cardRefs.current.findIndex(ref => ref === entry.target)
          if (index !== -1 && !visibleCards.includes(index)) {
            setVisibleCards(prev => [...prev, index])
          }
        }
      })
    }, observerOptions)

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    cardRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref)
    })

    return () => observer.disconnect()
  }, [])

  const supportOptions = [
    {
      icon: Star,
      title: "Star on GitHub",
      description: "Can't donate? Give us a star on GitHub to help others discover AutoSubs.",
      buttonText: "Give a Star",
      buttonColor: "bg-yellow-500 hover:bg-yellow-600",
      iconColor: "text-yellow-400",
      url: "https://github.com/tmoroney/auto-subs"
    },
    {
      icon: Heart,
      title: "Support Development",
      description: "Your donation helps me dedicate more time to improving AutoSubs and adding exciting new features.",
      buttonText: "Donate Now",
      buttonColor: "bg-red-500 hover:bg-red-600",
      iconColor: "text-red-500",
      url: "https://www.buymeacoffee.com/tmoroney"
    },
    {
      icon: Type,
      title: "Subtitle Templates",
      description: "Purchase the supporter pack with 20+ subtitle templates and animations.",
      buttonText: "Coming Soon...",
      buttonColor: "bg-purple-600 hover:bg-purple-700",
      iconColor: "text-purple-600",
      url: "#"
    }
  ]

  return (
    <section 
      id="support" 
      ref={sectionRef}
      className="w-full py-20 md:py-32 bg-gradient-to-r from-blue-500 to-purple-600 text-white scroll-mt-20"
    >
      <div className="container mx-auto px-6 lg:px-10 max-w-6xl">
        <div className="flex flex-col items-center space-y-8 text-center">
          <div className={`space-y-4 transition-all duration-1000 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">
              Support the Project
            </h2>
            <p className="mx-auto max-w-[700px] text-lg md:text-xl text-blue-100">
              Help us keep AutoSubs free and open-source. Your support goes a long way.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-6 mt-8">
            {supportOptions.map((option, index) => {
              const IconComponent = option.icon
              return (
                <div
                  key={index}
                  ref={(el) => (cardRefs.current[index] = el)}
                  className={`flex flex-col items-center bg-white rounded-lg px-10 py-10 shadow-sm text-gray-900 transition-all duration-700 ${
                    visibleCards.includes(index) 
                      ? 'translate-y-0 opacity-100 scale-100' 
                      : 'translate-y-20 opacity-0 scale-95'
                  } hover:shadow-2xl`}
                  style={{ transitionDelay: `${index * 200}ms` }}
                >
                  <IconComponent className={`h-16 w-16 ${option.iconColor} mb-6 transition-transform duration-500`} />
                  
                  <h3 className="text-2xl font-semibold mb-4 text-gray-900 transition-colors duration-300">
                    {option.title}
                  </h3>
                  
                  <p className="text-gray-600 mb-6 transition-colors duration-300">
                    {option.description}
                  </p>
                  
                  <a href={option.url} target={option.url.startsWith('http') ? "_blank" : undefined} rel={option.url.startsWith('http') ? "noopener noreferrer" : undefined}>
                    <Button className={`${option.buttonColor} text-white font-semibold px-8 py-6 text-lg btn-hover-effect transition-all duration-300`}>
                      {option.buttonText}
                    </Button>
                  </a>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      
      <style jsx>{`
        .btn-hover-effect {
          transition: all 0.3s ease;
        }
        .btn-hover-effect:hover {
          transform: translateY(-3px);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        .btn-hover-effect:active {
          transform: translateY(-1px);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
      `}</style>
    </section>
  )
}
