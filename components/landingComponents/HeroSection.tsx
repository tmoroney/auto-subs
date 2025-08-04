'use client'

// if you want to use the "v3 out now" badge, uncomment line 11 and line 61-78

import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Download, Github } from 'lucide-react'
import { useState, useEffect } from 'react'
import { DownloadModal } from '@/components/ui/DownloadModal'
import { motion } from 'framer-motion'
import AutoSubsInterface from './AutoSubsInterface'
// import { DotLottieReact } from '@lottiefiles/dotlottie-react';

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
} as const;

interface HeroSectionProps {
  downloadLink: string;
}

interface AnimatedCounterProps {
  endValue: number;
  label: string;
  suffix?: string;
  delay?: number;
}

function AnimatedCounter({ endValue, label, suffix, delay = 0 }: AnimatedCounterProps) {
  const [count, setCount] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Set visibility to trigger animation
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  useEffect(() => {
    if (!isVisible) return;
    
    const duration = Math.max(1000, endValue * 15);
    const increment = Math.max(1, Math.ceil(endValue / 50))
    const intervalTime = Math.max(10, duration / (endValue / increment));

    const intervalId = setInterval(() => {
      setCount((prevCount) => {
        const nextCount = prevCount + increment;
        if (nextCount >= endValue) {
          clearInterval(intervalId);
          return endValue;
        }
        return nextCount;
      });
    }, intervalTime);

    return () => clearInterval(intervalId);
  }, [endValue, isVisible]);

  return (
    <div className="text-center">
      <motion.span
        className="text-4xl font-bold"
        variants={itemVariants}
        initial="hidden"
        animate={isVisible ? "visible" : "hidden"}
      >
        {count}
        {suffix}
      </motion.span>
      <span className="block text-lg text-blue-100 dark:text-gray-300 mt-1">
        {label}
      </span>
    </div>
  );
}

export default function HeroSection({ downloadLink }: HeroSectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  return (
    <section 
      id="hero"
      className="relative w-full h-screen min-h-[750px] bg-gradient-to-br from-[#1E40AF] to-[#4F46E5] dark:from-gray-900 dark:to-gray-800 text-white overflow-hidden flex items-center transition-colors duration-300"
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
            {/* <motion.div
              className="flex justify-center lg:justify-start"
              variants={itemVariants}
            >
              <div className="inline-block bg-white/20 backdrop-blur-sm text-yellow-300 dark:text-blue-300 text-sm font-semibold px-4 py-1.5 rounded-full border border-white/30 shadow-md">
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
            </motion.div> */}

            <motion.h1 
              className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight text-shadow-md"
              variants={itemVariants}
            >
              AI-Powered Subtitles
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-400 dark:from-purple-300 dark:to-blue-400 mt-2">
                for DaVinci Resolve
              </span>
            </motion.h1>
            
            <motion.p className="text-lg md:text-xl text-blue-100 dark:text-gray-300 max-w-xl mx-auto lg:mx-0" variants={itemVariants}>
              Generate and style subtitles directly on your editing timeline to match your brand.
            </motion.p>

            <motion.div 
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start pt-4"
              variants={itemVariants}
            >
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  size="lg" 
                  className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-700 font-bold text-base shadow-lg hover:shadow-xl hover:shadow-blue-500/20 transition-all duration-300 flex items-center gap-2 w-full h-14"
                  onClick={() => window.open(downloadLink, '_blank')}
                >
                  <Download size={20} />
                  Download AutoSubs - It&apos;s free
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="border-white/50 dark:border-white/50 bg-transparent text-white hover:bg-white/10 dark:hover:bg-white/10 font-bold text-base transition-all duration-300 flex items-center gap-2 w-full h-14"
                  onClick={() => window.open('https://github.com/tmoroney/auto-subs', '_blank')}
                >
                  <Github size={20} />
                  View on GitHub
                </Button>
              </motion.div>
            </motion.div>

            <motion.div 
              className="grid grid-cols-3 gap-6 pt-8 max-w-2xl mx-auto lg:mx-0 border-t border-white/10 mt-8"
              variants={itemVariants}
            >
              <AnimatedCounter endValue={50} suffix="+" label="Languages" delay={100} />
              <AnimatedCounter endValue={6} label="AI Models" delay={200} />
              <AnimatedCounter endValue={100} suffix="%" label="Free & Open Source" delay={300} />
            </motion.div>
          </div>

          {/* desktop: interactive interface */}
          <div className="hidden lg:block relative rounded-xl overflow-hidden">
            <AutoSubsInterface/>
          </div>
          
          {/* mobile: img */}
          <div className="lg:hidden relative rounded-xl overflow-hidden">
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