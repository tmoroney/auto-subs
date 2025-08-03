'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Star, Heart, Type } from 'lucide-react'

interface SupportSectionProps {
  onNavigate?: (sectionId: string) => void
}

export default function SupportSection({ onNavigate }: SupportSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [visibleCards, setVisibleCards] = useState<number[]>([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const cardIndex = parseInt(entry.target.getAttribute('data-card') || '0')
          if (entry.isIntersecting) {
            setVisibleCards(prev => [...prev, cardIndex])
          }
        })
      },
      { 
        threshold: 0.1,
        rootMargin: '50px'
      }
    )

    const cards = document.querySelectorAll('[data-card]')
    cards.forEach(card => observer.observe(card))

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
          <div className="space-y-4 transition-all duration-1000">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">
              Support the Project
            </h2>
            <p className="mx-auto max-w-[700px] text-lg md:text-xl text-blue-100">
              Help us keep AutoSubs free and open-source. Your support goes a long way.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-8 mt-12">
            {supportOptions.map((option, index) => {
              const IconComponent = option.icon
              return (
                <div
                  key={index}
                  data-card={index}
                  className={`flex flex-col items-center bg-white rounded-xl px-8 py-12 shadow-lg text-gray-900 transition-all duration-1000 ease-out transform ${
                    visibleCards.includes(index) 
                    ? 'translate-y-0 opacity-100 scale-100' 
                    : 'translate-y-16 opacity-0 scale-90'
                } hover:shadow-2xl`}
                style={{ transitionDelay: `${index * 200}ms` }}
              >
                  <div className="relative mb-6">
                    <IconComponent className={`h-20 w-20 ${option.iconColor} mb-4 transition-transform duration-500 group-hover:scale-110`} />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white opacity-20 rounded-full blur-xl"></div>
                  </div>
                  
                  <h3 className="text-2xl font-bold mb-3 text-gray-900 transition-colors duration-300">
                    {option.title}
                  </h3>
                  
                  <p className="text-gray-600 mb-8 text-center leading-relaxed transition-colors duration-300">
                    {option.description}
                  </p>
                  
                  <a href={option.url} target={option.url.startsWith('http') ? "_blank" : undefined} rel={option.url.startsWith('http') ? "noopener noreferrer" : undefined}>
                    <Button className={`${option.buttonColor} text-white font-bold px-8 py-4 text-lg transform transition-all duration-300 hover:scale-105 hover:shadow-xl active:scale-95`}>
                      {option.buttonText}
                    </Button>
                  </a>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      

    </section>
  )
}
