'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Github, MessageCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface AboutDeveloperSectionProps {
  onNavigate?: (sectionId: string) => void
}

export default function AboutDeveloperSection({ onNavigate }: AboutDeveloperSectionProps) {
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => {
    const observerOptions = {
      threshold: 0.2,
      rootMargin: '0px 0px -100px 0px'
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      })
    }, observerOptions)

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <section 
      id="about-developer" 
      ref={sectionRef}
      className="w-full py-20 md:py-32 bg-white scroll-mt-20"
    >
      <div className="container mx-auto px-6 lg:px-10 max-w-6xl">
        <div className="flex flex-col md:flex-row items-center gap-12">
          <div className={`md:w-1/2 transition-all duration-1000 ${isVisible ? 'translate-x-0 opacity-100' : '-translate-x-20 opacity-0'}`}>
            <div className="relative">
              <Image
                src="https://lh3.googleusercontent.com/pw/AP1GczNOyG0XcoO_nJ4gxGFM86Pbg9lM_XPWOCePS99cC9O2O6xifNRK38duHXiFa0s6zQjOHrIBV-IEMzbzK3pS_QJwIsWzxba_oyn81Iy556NYevJO1W4T=w2400"
                alt="Tom - AutoSubs Developer"
                width={400}
                height={400}
                className={`rounded-full shadow-lg object-cover transition-all duration-1000 ${
                  imageLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                }`}
                onLoad={() => setImageLoaded(true)}
              />
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-600/20 blur-3xl -z-10" />
            </div>
          </div>
          
          <div className={`md:w-1/2 space-y-6 transition-all duration-1000 delay-300 ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-20 opacity-0'}`}>
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl text-gray-900">
              Meet the Developer
            </h2>
            
            <p className="text-lg text-gray-600 leading-relaxed transition-colors duration-300">
              Hi, I&apos;m Tom, the creator of AutoSubs. As a passionate coder and video enthusiast, I developed AutoSubs to address a challenge I encountered: the tedious and time-consuming task of manually crafting subtitles with custom designs.
            </p>
            
            <p className="text-lg text-gray-600 leading-relaxed transition-colors duration-300">
              My mission is to eliminate creative roadblocks in the video creation process. That&apos;s why I&apos;ve dedicated myself to building AutoSubs — a powerful, intuitive tool designed to make life easier for content creators around the globe.
            </p>
            
            <div className="flex gap-4 flex-wrap">
              <a href="https://github.com/tmoroney/" target="_blank" rel="noopener noreferrer">
                <Button className="bg-blue-600 border border-blue-600 text-white hover:bg-blue-700 font-semibold px-6 py-6 text-lg transition-all duration-300">
                  <Github className="mr-2 h-5 w-5" />
                  Follow on GitHub
                </Button>
              </a>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold px-6 py-6 text-lg transition-all duration-300"
                  >
                    <MessageCircle className="mr-2 h-5 w-5" />
                    Get in Touch
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Contact me</DialogTitle>
                    <div className="text-sm text-gray-600 mt-2">
                      This contact form is <b>not for support requests.</b> For help with AutoSubs, please join our Discord community or submit an issue on the GitHub repo.
                    </div>
                  </DialogHeader>
                  
                  <form 
                    action="https://docs.google.com/forms/d/e/1FAIpQLSeXoowRR86vR7pQnhGZMCLoubA-JrHHsff8HAquQ3TBC4Rf0A/formResponse" 
                    method="POST" 
                    className="grid gap-4"
                  >
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                      <Label htmlFor="name">Name</Label>
                      <Input 
                        id="name" 
                        name="entry.224025505" 
                        placeholder="Name" 
                        required 
                        className="transition-all duration-300 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                      <Label htmlFor="email">Email</Label>
                      <Input 
                        type="email" 
                        id="email" 
                        name="entry.1949373890" 
                        placeholder="Email" 
                        required 
                        className="transition-all duration-300 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                      <Label htmlFor="message">Message</Label>
                      <Textarea 
                        id="message" 
                        name="entry.1197513361" 
                        placeholder="Type your message here" 
                        required 
                        className="transition-all duration-300 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <DialogFooter className="pt-2">
                      <Button 
                        type="submit" 
                        className="bg-blue-600 hover:bg-blue-700 transition-all duration-300"
                      >
                        Send Message
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
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
      `}</style>
    </section>
  )
}
