'use client'

import { useState, useEffect, useRef } from 'react'
import { Zap, Paintbrush, Speech, Globe } from 'lucide-react'

export default function FeaturesSection() {
  const [visibleCards, setVisibleCards] = useState<number[]>([])
  const sectionRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const observerOptions = {
      threshold: 0.2,
      rootMargin: '0px 0px -50px 0px'
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const index = cardRefs.current.findIndex(ref => ref === entry.target)
          if (index !== -1 && !visibleCards.includes(index)) {
            setVisibleCards(prev => [...prev, index])
          }
        }
      })
    }, observerOptions)

    cardRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref)
    })

    return () => observer.disconnect()
  }, [visibleCards])

  const features = [
    {
      icon: Zap,
      title: "Fast Generate",
      description: "Quickly generate accurate subtitles in minutes.",
      gradient: "from-blue-50 to-white",
      iconColor: "text-blue-600"
    },
    {
      icon: Paintbrush,
      title: "Customise",
      description: "Create unique subtitles with custom colours and effects.",
      gradient: "from-purple-50 to-white",
      iconColor: "text-purple-600"
    },
    {
      icon: Speech,
      title: "Diarize Audio",
      description: "Differentiate speakers and style subtitles uniquely.",
      gradient: "from-red-50 to-white",
      iconColor: "text-red-600"
    },
    {
      icon: Globe,
      title: "Multilingual",
      description: "Transcribe in 50+ languages and translate easily.",
      gradient: "from-green-50 to-white",
      iconColor: "text-green-600"
    }
  ]

  return (
    <section 
      id="features" 
      ref={sectionRef}
      className="w-full py-20 md:py-32 bg-white scroll-mt-20"
    >
      <div className="container mx-auto px-6 lg:px-10 max-w-6xl mb-10">
        <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl text-center mb-16 text-gray-900 opacity-0 animate-fade-in">
          Key Features
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {features.map((feature, index) => {
            const IconComponent = feature.icon
            return (
              <div
                key={index}
                ref={(el) => (cardRefs.current[index] = el)}
                className={`flex flex-col items-center text-center bg-gradient-to-b ${feature.gradient} rounded-lg p-8 shadow-sm transition-all duration-700 ${
                  visibleCards.includes(index) 
                    ? 'translate-y-0 opacity-100 scale-100' 
                    : 'translate-y-20 opacity-0 scale-95'
                }`}
                style={{ transitionDelay: `${index * 150}ms` }}
              >
                <div className={`relative mb-6 transition-transform duration-500 ${
                  visibleCards.includes(index) ? 'rotate-0' : 'rotate-12'
                }`}>
                  <IconComponent className={`h-16 w-16 ${feature.iconColor} transition-all duration-500`} />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/20 rounded-full blur-xl" />
                </div>
                
                <h3 className="text-2xl font-semibold mb-4 text-gray-900 transition-colors duration-300">
                  {feature.title}
                </h3>
                
                <p className="text-gray-600 transition-colors duration-300 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            )
          })}
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
        
        .animate-fade-in {
          animation: fade-in 0.8s ease-out forwards;
        }
      `}</style>
    </section>
  )
}
