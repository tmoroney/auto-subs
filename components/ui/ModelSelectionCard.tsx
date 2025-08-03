'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import Image from 'next/image'

const models = [
  { name: 'Whisper Tiny', description: 'Agile and lightweight like a hummingbird. Best for drafts, low-resource devices, and simple audio. Quick but less accurate on tough speech.', icon: '/auto-subs/assets/hummingbird.png' },
  { name: 'Whisper Base', description: 'Agile and resourceful as an otter. Excels at everyday transcription with reliable speed and accuracy.', icon: '/auto-subs/assets/otter.png' },
  { name: 'Whisper Small', description: 'Clever and versatile as a fox. Better accuracy than Tiny/Base. Still fast. Good for varied accents and conditions.', icon: '/auto-subs/assets/fox.png' },
  { name: 'Whisper Medium', description: 'Sharp and discerning like an owl. Offers high accuracy, especially adept at handling challenging audio conditions. A balanced choice for precision.', icon: '/auto-subs/assets/owl.png' },
  { name: 'Whisper Large turbo', description: 'Swift and efficient like a phoenix rising. Delivers near-Large accuracy at significantly higher speed.', icon: '/auto-subs/assets/phoenix.png' },
  { name: 'Whisper Large', description: 'Powerful and thorough as an elephant. Most accurate, best for complex audio or many speakers. Requires lots of RAM and a strong GPU.', icon: '/auto-subs/assets/elephant.png' },
]

export function ModelSelectionCard() {
  const [selected, setSelected] = useState(0)

  return (
    <TooltipProvider>
      <div className="w-full bg-white p-6 rounded-lg shadow-md border border-gray-200 dark:bg-gray-800 dark:border-gray-700 h-[250px]">
        <div className="flex justify-center items-center gap-4 mb-6">
          {models.map((model, index) => (
            <Tooltip key={model.name}>
              <TooltipTrigger asChild>
                <motion.div
                  className={`relative cursor-pointer transition-all duration-300 rounded-lg p-1`}
                  onClick={() => setSelected(index)}
                  whileTap={{ scale: 0.95 }}
                >
                  <div className="relative flex items-center justify-center">
                    <Image 
                      src={model.icon} 
                      alt={model.name} 
                      width={80} 
                      height={80}
                      className={`object-contain transition-all duration-300 ${
                        selected === index ? 'opacity-100' : 'opacity-70'
                      }`}
                    />
                    
                    {/* Subtle selection indicator - bottom dot */}
                    {selected === index && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-2 h-2 bg-blue-500 rounded-full"
                      />
                    )}
                  </div>
                </motion.div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{model.name}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="text-center"
          >
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
              {models[selected].name}
            </h3>
            <p className="text-gray-600 dark:text-gray-300">
              {models[selected].description}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </TooltipProvider>
  )
}