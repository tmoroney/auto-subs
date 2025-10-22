'use client'

import { useRef, useEffect } from 'react'
import { useInView } from 'framer-motion'

interface Step {
  number: number;
  title: string;
  description: string;
}

interface StepItemProps {
  step: Step;
  index: number;
  isActive: boolean;
  setActiveStep: (index: number) => void;
}

export function StepItem({ step, index, isActive, setActiveStep }: StepItemProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { margin: "-50% 0px -50% 0px" })

  useEffect(() => {
    if (isInView) {
      setActiveStep(index)
    }
  }, [isInView, index, setActiveStep])

  return (
    <div 
      ref={ref} 
      onClick={() => setActiveStep(index)}
      className="h-40 flex flex-col justify-center transition-all duration-300 cursor-pointer group"
    >
      <div className={`transition-all duration-300 p-4 rounded-lg ${
        isActive 
          ? 'opacity-100 bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-600 dark:border-purple-400' 
          : 'opacity-40 hover:opacity-70 group-hover:bg-gray-50 dark:group-hover:bg-gray-800/30'
      }`}>
        <h3 className={`text-3xl font-bold mb-3 transition-colors duration-300 ${
          isActive
            ? 'text-purple-600 dark:text-purple-400'
            : 'text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400'
        }`}>
          {step.number}. {step.title}
        </h3>
        <p className="text-lg text-gray-600 dark:text-gray-300">
          {step.description}
        </p>
      </div>
    </div>
  )
}