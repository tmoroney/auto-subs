'use client'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"


import { Github, Download, Zap, Type, Globe, Sparkles, Heart, MessageCircle, Paintbrush, Star } from 'lucide-react'
import Image from 'next/image'


export default function Component() {

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-blue-50 to-white font-sans">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
        .btn-hover-effect {
          transition: all 0.3s ease;
        }
        .btn-hover-effect:hover {
          transform: translateY(-3px);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        .btn-hover-effect:active {
          transform: translateY(-1px);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
      `}</style>
      <div className="relative">
        <header className="absolute top-0 left-0 right-0 z-10 px-6 lg:px-10 py-8">
          <div className="container mx-auto max-w-6xl">
            <div className="bg-white bg-opacity-90 backdrop-blur-md rounded-full shadow-lg py-3 px-6 flex items-center">
              <a className="flex items-center justify-center" href="#">
                <Sparkles className="h-7 w-7 text-blue-600" strokeWidth={2} />
                <span className="ml-2 text-2xl font-semibold text-gray-900 font-['Poppins']">AutoSubs</span>
              </a>
              <nav className="ml-auto flex gap-6 sm:gap-8">
                <a className="hidden sm:block text-sm font-medium hover:text-blue-600 text-gray-700" href="#features">
                  Features
                </a>
                <a className="hidden md:block text-sm font-medium hover:text-blue-600 text-gray-700" href="#how-it-works">
                  How It Works
                </a>
                <a className="text-sm font-medium hover:text-blue-600 text-gray-700" href="#support">
                  Support Us
                </a>
                <a className="hidden sm:block text-sm font-medium hover:text-blue-600 text-gray-700" href="#about-developer">
                  About
                </a>
                <a
                  className="hidden md:block text-sm font-medium hover:text-blue-600 text-gray-700"
                  href="https://github.com/tmoroney/auto-subs"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
                <a
                  className="text-sm font-medium hover:text-blue-600 text-gray-700 flex items-center"
                  href="https://discord.com/invite/TBFUfGWegm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="h-4 w-4 mr-1" />
                  Get Help
                </a>
              </nav>
            </div>
          </div>
        </header>
        <section className="w-full pt-32 pb-20 md:pt-40 md:pb-32 lg:pt-48 lg:pb-40 xl:pt-56 xl:pb-48 bg-gradient-to-r from-blue-500 to-purple-600 text-white">
          <div className="container mx-auto px-6 lg:px-10 max-w-6xl">
            <div className="flex flex-col lg:flex-row items-center space-y-6 lg:space-y-0 lg:space-x-12">
              <div className="flex-1 space-y-6 text-center lg:text-left">
                <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl/none">
                  AI-Powered Subtitle Generation
                  <br />
                  <span className="text-yellow-300">for DaVinci Resolve</span>
                </h1>
                <p className="mx-auto lg:mx-0 max-w-[800px] text-lg md:text-xl lg:text-2xl text-blue-100">
                  Automatically generate accurate subtitles for your videos, saving you hours.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                  <a href="https://github.com/tmoroney/auto-subs/releases" target="_blank" rel="noopener noreferrer">
                    <Button className="bg-white text-blue-600 hover:bg-blue-50 border border-white hover:border-bg-blue-50 font-semibold px-8 py-6 text-lg btn-hover-effect">
                      <Download className="mr-2 h-5 w-5" />
                      Download AutoSubs
                    </Button>
                  </a>
                  <a href="https://github.com/tmoroney/auto-subs" target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="bg-transparent text-white border-white hover:bg-white hover:text-blue-600 font-semibold px-8 py-6 text-lg btn-hover-effect">
                      <Github className="mr-2 h-5 w-5" />
                      View on GitHub
                    </Button>
                  </a>
                </div>
              </div>
              <div className="flex-1 relative w-full max-w-2xl aspect-video rounded-lg overflow-hidden shadow-2xl">
                <iframe
                  width="100%"
                  height="100%"
                  src="https://www.youtube.com/embed/Q-Ud4ZAWH6o?si=25mwU7JJE71EU4Av"
                  title="YouTube video player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  className="w-full h-full"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
      <main className="flex-1">
        <section id="features" className="w-full py-20 md:py-32 bg-white">
          <div className="container mx-auto px-6 lg:px-10 max-w-6xl">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl text-center mb-16 text-gray-900">
              Key Features
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              <div className="flex flex-col items-center text-center bg-gradient-to-b from-blue-50 to-white rounded-lg p-8 shadow-sm">
                <Zap className="h-16 w-16 text-blue-600 mb-6" />
                <h3 className="text-2xl font-semibold mb-4 text-gray-900">AI-Powered Speed</h3>
                <p className="text-gray-600">Generate precise subtitles in minutes, saving valuable time in your video production workflow.</p>
              </div>
              <div className="flex flex-col items-center text-center bg-gradient-to-b from-purple-50 to-white rounded-lg p-8 shadow-sm">
                <Paintbrush className="h-16 w-16 text-purple-600 mb-6" />
                <h3 className="text-2xl font-semibold mb-4 text-gray-900">Customise</h3>
                <p className="text-gray-600">Design unique subtitles with customisable colours, animations, and styling effects.</p>
              </div>
              <div className="flex flex-col items-center text-center bg-gradient-to-b from-green-50 to-white rounded-lg p-8 shadow-sm">
                <Globe className="h-16 w-16 text-green-600 mb-6" />
                <h3 className="text-2xl font-semibold mb-4 text-gray-900">Multilingual</h3>
                <p className="text-gray-600">Support for transcription in 50+ languages, with optional subtitle translation into English.</p>
              </div>
            </div>
          </div>
        </section>
        <section id="how-it-works" className="w-full py-20 md:py-32 bg-gray-50">
          <div className="container mx-auto px-6 lg:px-10 max-w-6xl">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl text-center mb-16 text-gray-900">
              How It Works
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-3xl mb-6">
                  1
                </div>
                <h3 className="text-2xl font-semibold mb-4 text-gray-900">Select a Model</h3>
                <p className="text-gray-600 mb-6">Choose from a variety of AI transcription models, balancing speed and accuracy.</p>
                <Image
                  src="https://developers.elementor.com/docs/assets/img/elementor-placeholder-image.png"
                  alt="Import Video"
                  width={300}
                  height={200}
                  className="rounded-lg shadow-md"
                />
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-3xl mb-6">
                  2
                </div>
                <h3 className="text-2xl font-semibold mb-4 text-gray-900">AI Processing</h3>
                <p className="text-gray-600 mb-6">Generates accurate subtitles in just minutes and adds them to the editing timeline.</p>
                <Image
                  src="https://developers.elementor.com/docs/assets/img/elementor-placeholder-image.png"
                  alt="AI Processing"
                  width={300}
                  height={200}
                  className="rounded-lg shadow-md"
                />
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-3xl mb-6">
                  3
                </div>
                <h3 className="text-2xl font-semibold mb-4 text-gray-900">Edit and Export</h3>
                <p className="text-gray-600 mb-6">Easily make edits and export your video with professional-quality subtitles.</p>
                <Image
                  src="https://developers.elementor.com/docs/assets/img/elementor-placeholder-image.png"
                  alt="Edit and Export"
                  width={300}
                  height={200}
                  className="rounded-lg shadow-md"
                />
              </div>
            </div>
          </div>
        </section>
        <section id="support" className="w-full py-20 md:py-32 bg-gradient-to-r from-blue-500 to-purple-600 text-white">
          <div className="container mx-auto px-6 lg:px-10 max-w-6xl">
            <div className="flex flex-col items-center space-y-8 text-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">
                  Support the Project
                </h2>
                <p className="mx-auto max-w-[700px] text-lg md:text-xl text-blue-100">
                  Help us keep AutoSubs free and open-source. Your support goes a long way.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-6 mt-8">
                <div className="flex flex-col items-center bg-white rounded-lg px-10 py-10 shadow-sm text-gray-900">
                  <Heart className="h-16 w-16 text-red-500 mb-6" />
                  <h3 className="text-2xl font-semibold mb-4 text-gray-900">Make a Donation</h3>
                  <p className="text-gray-600 mb-6">Help us improve AutoSubs and develop new features.</p>
                  <a href="https://www.buymeacoffee.com/tmoroney">
                    <Button className="bg-red-500 text-white hover:bg-red-600 font-semibold px-8 py-6 text-lg btn-hover-effect">
                      Donate Now
                    </Button>
                  </a>
                </div>
                <div className="flex flex-col items-center bg-white rounded-lg px-10 py-10 shadow-sm text-gray-900">
                  <Type className="h-16 w-16 text-purple-600 mb-6" />
                  <h3 className="text-2xl font-semibold mb-4 text-gray-900">Get Subtitle Templates</h3>
                  <p className="text-gray-600 mb-6">Purchase our subtitle template pack with 20+ designs.</p>
                  <Button className="bg-purple-600 text-white hover:bg-purple-700 font-semibold px-8 py-6 text-lg btn-hover-effect">
                    Buy Templates ($20)
                  </Button>
                </div>
                <div className="flex flex-col items-center bg-white rounded-lg px-10 py-10 shadow-sm text-gray-900">
                  <Star className="h-16 w-16 text-yellow-400 mb-6" />
                  <h3 className="text-2xl font-semibold mb-4 text-gray-900">Star on GitHub</h3>
                  <p className="text-gray-600 mb-6">Support AutoSubs by giving the repository a star on GitHub.</p>
                  <a href="https://www.buymeacoffee.com/tmoroney">
                    <Button className="bg-yellow-500 text-white hover:bg-yellow-600 font-semibold px-8 py-6 text-lg btn-hover-effect">
                      Give a Star
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section id="about-developer" className="w-full py-20 md:py-32 bg-white">
          <div className="container mx-auto px-6 lg:px-10 max-w-6xl">
            <div className="flex flex-col md:flex-row items-center gap-12">
              <div className="md:w-1/2">
                <Image
                  src="https://lh3.googleusercontent.com/pw/AP1GczNOyG0XcoO_nJ4gxGFM86Pbg9lM_XPWOCePS99cC9O2O6xifNRK38duHXiFa0s6zQjOHrIBV-IEMzbzK3pS_QJwIsWzxba_oyn81Iy556NYevJO1W4T=w2400"
                  alt="Tom - AutoSubs Developer"
                  width={400}
                  height={400}
                  className="rounded-full shadow-lg object-cover"
                />
              </div>
              <div className="md:w-1/2 space-y-6">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl text-gray-900">
                  Meet the Developer
                </h2>
                <p className="text-lg text-gray-600">
                  Hi, I&apos;m Tom, the solo developer behind AutoSubs. As a passionate coder and video enthusiast, I created AutoSubs to solve a problem I faced in my own projects: the time-consuming task of generating accurate subtitles.
                </p>
                <p className="text-lg text-gray-600">
                  My goal is to remove as many creative blockers in video creation process as possible, so I&apos;ve dedicated my time to making AutoSubs a powerful, user-friendly tool that can benefit content creators worldwide.
                </p>
                <div className="flex gap-4">
                  <a href="https://github.com/tmoroney/">
                    <Button className="bg-blue-600 border border-bg-blue-600 text-white hover:bg-blue-700 font-semibold px-6 py-6 text-lg btn-hover-effect">
                      <Github className="mr-2 h-5 w-5" />
                      Follow on GitHub
                    </Button>
                  </a>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold px-6 py-6 text-lg btn-hover-effect">
                        <MessageCircle className="mr-2 h-5 w-5" />
                        Get in Touch
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Contact me</DialogTitle>
                        <DialogDescription>
                          This contact form is <b>not for support requests.</b> For help with AutoSubs, please join our Discord community or submit an issue on the GitHub repo.
                        </DialogDescription>
                      </DialogHeader>
                      <form action="https://docs.google.com/forms/d/e/1FAIpQLSeXoowRR86vR7pQnhGZMCLoubA-JrHHsff8HAquQ3TBC4Rf0A/formResponse" method="POST" className="grid gap-4">
                        <div className="grid w-full max-w-sm items-center gap-1.5">
                          <Label htmlFor="name">Name</Label>
                          <Input id="name" name="entry.224025505" placeholder="Name" required />
                        </div>
                        <div className="grid w-full max-w-sm items-center gap-1.5">
                          <Label htmlFor="email">Email</Label>
                          <Input type="email" id="email" name="entry.1949373890" placeholder="Email" required />
                        </div>
                        <div className="grid w-full max-w-sm items-center gap-1.5">
                          <Label htmlFor="message">Message</Label>
                          <Textarea id="message" name="entry.1197513361" placeholder="Type your message here" required />
                        </div>
                        <DialogFooter className="pt-2">
                          <Button type="submit">Send Message</Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="w-full py-24 md:py-40 bg-gray-50">
          <div className="container mx-auto px-6 lg:px-10 max-w-6xl">
            <div className="flex flex-col items-center space-y-6 text-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl text-gray-900">
                  Stay Updated
                </h2>
                <p className="mx-auto max-w-[600px] text-gray-600 text-lg md:text-xl">
                  Join our mailing list for the latest AutoSubs updates and releases.
                </p>
              </div>
              <div className="w-full max-w-md space-y-2">
                <form action="https://docs.google.com/forms/d/e/1FAIpQLSdw8M8f4KrEiloXorB0ob6J0ywiutdPSaGASN49a2sGmLYsGw/formResponse" method="POST" className="flex space-x-2" rel="noopener noreferrer">
                  <Input
                    className="flex-1 bg-white text-gray-900 placeholder-gray-500 border-gray-300 py-5"
                    placeholder="Enter your email"
                    type="email"
                    id="email"
                    name="entry.1512513490"
                    required
                  />
                  <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-700 font-semibold px-6 py-5 border text-md btn-hover-effect">
                    Subscribe
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="py-8 w-full bg-gray-900 text-white">
        <div className="container mx-auto px-6 lg:px-10 max-w-6xl">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-sm mb-4 md:mb-0">© 2024 Tom Moroney. All rights reserved.</p>
            <nav className="flex flex-wrap justify-center md:justify-end gap-6">
              <a className="text-sm hover:underline underline-offset-4" href="https://github.com/tmoroney/auto-subs/blob/main/LICENSE">
                MIT License
              </a>
              <a
                className="text-sm hover:underline underline-offset-4 flex items-center"
                href="https://discord.com/invite/TBFUfGWegm"
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-4 w-4 mr-1" />
                Join our Discord for Support
              </a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  )
}