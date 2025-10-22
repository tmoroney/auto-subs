'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { ModelSelectionCard } from '../ui/ModelSelectionCard'
import { AiProcessingCard } from '../ui/AIProcessingCard'
import { StepItem } from '../ui/StepItem'

const steps = [
  {
    number: 1,
    title: "Model Selection",
    description: "Choose from a variety of AI transcription models, balancing speed and accuracy.",
  },
  {
    number: 2,
    title: "AI Processing",
    description: "Quickly generates accurate subtitles and identifies the different speakers.",
  },
  {
    number: 3,
    title: "Edit and Export",
    description: "Easily make edits and export your video with professional-quality subtitles.",
  }
];

const visualComponents = [
  <div key="model" className="w-full max-w-md mx-auto">
    <ModelSelectionCard />
  </div>,
  <div key="ai" className="w-full max-w-md mx-auto">
    <AiProcessingCard />
  </div>,
  <div key="gif" className="w-full max-w-md mx-auto">
    <Image
      src="/auto-subs/assets/example.gif"
      alt="Editing subtitles in DaVinci Resolve"
      width={400}
      height={264}
      unoptimized
      className="w-full object-contain rounded-xl shadow-2xl shadow-gray-400/30 dark:shadow-gray-800/50"
    />
  </div>
];

export default function HowItWorksSection() {
  const [activeStep, setActiveStep] = useState(0)
  const sectionRef = useRef<HTMLDivElement>(null)
  const hasScrolled = useRef(false)

  useEffect(() => {
    const handleScroll = (e: WheelEvent) => {
      if (!sectionRef.current) return
      
      const rect = sectionRef.current.getBoundingClientRect()
      const isInView = rect.top <= window.innerHeight / 2 && rect.bottom >= window.innerHeight / 2
      
      if (isInView && !hasScrolled.current) {
        e.preventDefault()
        
        if (e.deltaY > 0 && activeStep < steps.length - 1) {
          setActiveStep(prev => prev + 1)
          hasScrolled.current = true
          setTimeout(() => { hasScrolled.current = false }, 2500)
        } else if (e.deltaY < 0 && activeStep > 0) {
          setActiveStep(prev => prev - 1)
          hasScrolled.current = true
          setTimeout(() => { hasScrolled.current = false }, 2500)
        } else if (e.deltaY > 0 && activeStep === steps.length - 1) {
          // normal scroll after last step
          return
        }
      }
    }

    window.addEventListener('wheel', handleScroll, { passive: false })
    return () => window.removeEventListener('wheel', handleScroll)
  }, [activeStep])

  return (
    <section className="py-20 bg-white dark:bg-gray-900 transition-colors duration-300">
      <div className="container mx-auto px-6 lg:px-8">
        <div className="text-center mb-16">
          <motion.h2 
            className="text-4xl font-bold text-gray-900 dark:text-white mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            How It Works
          </motion.h2>
        </div>
        <div className="grid md:grid-cols-2 gap-x-20 h-[50vh]">
          <div className="flex flex-col justify-center">
            {steps.map((step, index) => (
              <StepItem 
                key={step.number}
                step={step}
                index={index}
                isActive={activeStep === index}
                setActiveStep={setActiveStep}
              />
            ))}
          </div>

          <div className="hidden md:flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeStep}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
                className="w-full max-w-md"
              >
                {visualComponents[activeStep]}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}