import { motion } from 'framer-motion'
import { PenSquare } from 'lucide-react'

const speakers = [
  { name: 'Speaker 1', lines: '94 lines', color: 'bg-red-500' },
  { name: 'Speaker 2', lines: '94 lines', color: 'bg-green-500' },
  { name: 'Speaker 3', lines: '94 lines', color: 'bg-blue-500' },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.3, delayChildren: 0.2 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 },
}

export function AiProcessingCard() {
  return (
    <motion.div 
      className="w-full h-[250px] bg-white p-4 rounded-lg shadow-md border border-gray-200 space-y-2 dark:bg-gray-800 dark:border-gray-700"
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.8 }}
    >
      {speakers.map((speaker) => (
        <motion.div
          key={speaker.name}
          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg dark:bg-gray-700"
          variants={itemVariants}
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full ${speaker.color} flex items-center justify-center text-white font-bold text-sm`}>
              S{speaker.name.split(' ')[1]}
            </div>
            <div>
              <p className="font-semibold text-gray-800 dark:text-white">{speaker.name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{speaker.lines}</p>
            </div>
          </div>
          <button className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-blue-600 transition-colors dark:text-gray-400 dark:hover:text-blue-400">
            <PenSquare size={16} /> Modify
          </button>
        </motion.div>
      ))}
    </motion.div>
  )
}