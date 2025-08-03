'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Rabbit, Bird, Turtle } from 'lucide-react'

const models = [
  { name: 'Whisper Small', description: 'Balanced speed and accuracy.', icon: Rabbit },
  { name: 'Whisper Medium', description: 'Great accuracy, moderate speed.', icon: Bird },
  { name: 'Whisper Large-V3', description: 'Most accurate, but slower.', icon: Turtle },
]

export function ModelSelectionCard() {
  const [selected, setSelected] = useState(0)

  return (
    <div className="w-full h-[250px] bg-white p-4 rounded-lg shadow-md border border-gray-200">
      {models.map((model, index) => (
        <motion.div
          key={model.name}
          className="flex items-center gap-4 p-3 rounded-md cursor-pointer transition-colors hover:bg-gray-100/70"
          onClick={() => setSelected(index)}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <model.icon className="w-5 h-5 text-gray-500" />
          <div className="flex-grow">
            <p className="font-semibold text-gray-800 text-left">{model.name}</p>
            <p className="text-sm text-gray-500 text-left">{model.description}</p>
          </div>
          <AnimatePresence>
            {selected === index && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              >
                <Check className="w-5 h-5 text-blue-600" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  )
}