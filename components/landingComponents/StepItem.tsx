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
    <div ref={ref} className="h-40 flex flex-col justify-center transition-opacity duration-300">
      <div className={`transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-40'}`}>
        <h3 className="text-3xl font-bold text-gray-900 mb-3">
          {step.number}. {step.title}
        </h3>
        <p className="text-lg text-gray-600">
          {step.description}
        </p>
      </div>
    </div>
  )
}