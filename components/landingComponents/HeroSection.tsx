'use client'

import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Download, Github } from 'lucide-react'
import { useState } from 'react'
import { DownloadModal } from '@/components/ui/DownloadModal'
import { motion } from 'framer-motion'
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
    },
  },
}

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 0.8,
      ease: 'easeOut',
    },
  },
}

export default function HeroSection() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  return (
    <section 
      id="hero"
      className="relative w-full h-screen min-h-[750px] bg-gradient-to-br from-[#1E40AF] to-[#4F46E5] text-white overflow-hidden flex items-center"
    >
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-400 rounded-full mix-blend-lighten filter blur-3xl opacity-40 animate-blob"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-lighten filter blur-3xl opacity-40 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 right-1/3 w-80 h-80 bg-indigo-400 rounded-full mix-blend-lighten filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>

      <div className="container mx-auto px-6 lg:px-8 relative z-10">
        <motion.div 
          className="grid lg:grid-cols-2 gap-16 items-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* left column */}
          <div className="text-center lg:text-left space-y-6">
            <motion.div
              className="flex justify-center lg:justify-start"
              variants={itemVariants}
            >
              <div className="inline-block bg-white/20 backdrop-blur-sm text-yellow-300 text-sm font-semibold px-4 py-1.5 rounded-full border border-white/30 shadow-md">
                <span className="inline-flex items-center gap-1.5">
                  V3 OUT NOW
                  <span className="inline-flex">
                    <DotLottieReact
                      src="/auto-subs/assets/sparkles.lottie"
                      loop
                      autoplay
                      style={{ width: '25px', height: '25px' }}
                    />
                  </span>
                </span>
              </div>
            </motion.div>

            <motion.h1 
              className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight text-shadow-md"
              variants={itemVariants}
            >
              AI-Powered Subtitles
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-400 mt-2">
                for DaVinci Resolve
              </span>
            </motion.h1>
            
            <motion.p className="text-lg md:text-xl text-blue-100 max-w-xl mx-auto lg:mx-0" variants={itemVariants}>
              Generate and style subtitles directly on your editing timeline to match your brand.
            </motion.p>

            <motion.div 
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start pt-4"
              variants={itemVariants}
            >
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  size="lg" 
                  className="bg-white text-blue-600 hover:bg-gray-100 font-bold px-8 py-7 text-base shadow-lg hover:shadow-xl hover:shadow-white/10 transition-all duration-300 flex items-center gap-2 w-full sm:w-auto"
                  onClick={() => setIsModalOpen(true)}
                >
                  <Download size={20} />
                  Download AutoSubs - It&apos;s free
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="border-white/50 bg-transparent text-white hover:text-blue-600 hover:bg-white font-bold px-8 py-7 text-base transition-all duration-300 flex items-center gap-2 w-full sm:w-auto"
                  onClick={() => window.open('https://github.com/tmoroney/auto-subs', '_blank')}
                >
                  <Github size={20} />
                  View on GitHub
                </Button>
              </motion.div>
            </motion.div>
          </div>

          <div className="relative rounded-xl overflow-hidden">
              <Image
                src="/auto-subs/assets/AutoSubs.png"
                alt="AutoSubs Interface Preview for DaVinci Resolve"
                width={1200}
                height={782}
                className="rounded-xl"
                priority
              />
          </div>
        </motion.div>
      </div>
      <DownloadModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </section>
  )
}