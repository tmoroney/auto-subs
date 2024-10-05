'use client'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Github, Download, Zap, Type, Globe, Sparkles, Heart, MessageCircle, Paintbrush } from 'lucide-react'

export default function Component() {

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 font-sans">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
        .btn-hover-effect {
          transition: all 0.3s ease;
        }
        .btn-hover-effect:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        .btn-hover-effect:active {
          transform: translateY(-1px);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
      `}</style>
      <header className="px-6 lg:px-10 h-20 flex items-center bg-white shadow-sm">
        <a className="flex items-center justify-center" href="#">
          <Sparkles className="h-8 w-8 text-blue-600" />
          <span className="ml-2 text-2xl font-bold text-gray-900">AutoSubs</span>
        </a>
        <nav className="ml-auto flex gap-6 sm:gap-8">
          <a className="text-sm font-medium hover:text-blue-600 text-gray-700" href="#features">
            Features
          </a>
          <a className="text-sm font-medium hover:text-blue-600 text-gray-700" href="#how-it-works">
            How It Works
          </a>
          <a className="text-sm font-medium hover:text-blue-600 text-gray-700" href="#support">
            Support Us
          </a>
          <a
            className="text-sm font-medium hover:text-blue-600 text-gray-700"
            href="https://github.com/yourusername/autosubs"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <a
            className="text-sm font-medium hover:text-blue-600 text-gray-700 flex items-center"
            href="https://discord.gg/yourdiscordinvite"
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle className="h-4 w-4 mr-1" />
            Get Help
          </a>
        </nav>
      </header>
      <main className="flex-1">
        <section className="w-full py-20 md:py-32 lg:py-40 xl:py-48 bg-white">
          <div className="container mx-auto px-6 lg:px-10 max-w-6xl">
            <div className="flex flex-col items-center space-y-6 text-center">
              <div className="space-y-4">
                <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl/none text-gray-900">
                  AI-Powered Subtitle Generation
                  <br />
                  <span className="text-blue-600">for DaVinci Resolve</span>
                </h1>
                <p className="mx-auto max-w-[800px] text-gray-600 text-lg md:text-lg lg:text-xl">
                  Generate accurate subtitles with a single click, saving you time and effort.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 mt-6">
                <a href="https://github.com/tmoroney/auto-subs/releases" target="_blank" rel="noopener noreferrer">
                  <Button className="bg-blue-600 border border-blue-600 text-white hover:bg-blue-700 font-semibold px-8 py-6 text-lg btn-hover-effect">
                    <Download className="mr-3 h-5 w-5" />
                    Free Download
                  </Button>
                </a>
                <a href="https://github.com/tmoroney/auto-subs" target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="bg-white text-blue-600 border-blue-600 hover:bg-blue-50 font-semibold px-8 py-6 text-lg btn-hover-effect">
                    <Github className="mr-2 h-5 w-5" />
                    View on GitHub
                  </Button>
                </a>
              </div>
              <p className="text-sm text-gray-500 mt-4">
                Free and open-source software. Compatible with Free & Studio versions of DaVinci Resolve.
              </p>
            </div>
          </div>
        </section>
        <section id="features" className="w-full py-20 md:py-32 bg-gray-100">
          <div className="container mx-auto px-6 lg:px-10 max-w-6xl">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl text-center mb-16 text-gray-900">
              Key Features
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">

              <div className="flex flex-col items-center text-center bg-white rounded-lg p-10 shadow-sm">
                <Zap className="h-16 w-16 text-blue-600 mb-6" />
                <h3 className="text-2xl font-semibold mb-4 text-gray-900">AI-Powered Speed</h3>
                <p className="text-gray-600">Generate precise subtitles in minutes, saving valuable time in your video production workflow.</p>
              </div>
              <div className="flex flex-col items-center text-center bg-white rounded-lg p-10 shadow-sm">
                <Paintbrush className="h-16 w-16 text-blue-600 mb-6" />
                <h3 className="text-2xl font-semibold mb-4 text-gray-900">Customisable</h3>
                <p className="text-gray-600">Design unique subtitles with customisable colours, animations, and styling effects.</p>
              </div>
              <div className="flex flex-col items-center text-center bg-white rounded-lg p-10 shadow-sm">
                <Globe className="h-16 w-16 text-blue-600 mb-6" />
                <h3 className="text-2xl font-semibold mb-4 text-gray-900">Multilingual</h3>
                <p className="text-gray-600">Supports transcription in 50+ languages, with optional subtitle translation into English.</p>
              </div>
            </div>
          </div>
        </section>
        <section id="how-it-works" className="w-full py-20 md:py-32 bg-white">
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
                <p className="text-gray-600">Choose from a variety of AI transcription models, balancing speed and accuracy.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-3xl mb-6">
                  2
                </div>
                <h3 className="text-2xl font-semibold mb-4 text-gray-900">AI Processing</h3>
                <p className="text-gray-600">AutoSubs leverages lightning-fast AI to analyze audio and generate accurate subtitles in just minutes (depending on specs).</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-3xl mb-6">
                  3
                </div>
                <h3 className="text-2xl font-semibold mb-4 text-gray-900">Edit and Export</h3>
                <p className="text-gray-600">Once your subtitles are on the timeline, easily make edits and export your video with professional-quality subtitles.</p>
              </div>
            </div>
          </div>
        </section>
        <section id="support" className="w-full py-20 md:py-32 bg-gray-100">
          <div className="container mx-auto px-6 lg:px-10 max-w-6xl">
            <div className="flex flex-col items-center space-y-9 text-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl text-gray-900">
                  Support the Project
                </h2>
                <p className="mx-auto max-w-[700px] text-gray-600 text-lg md:text-xl">
                  Help us keep AutoSubs free and open-source. Your support goes a long way.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-10 mt-8">
                <div className="flex flex-col items-center bg-white rounded-lg px-10 py-14 shadow-sm">
                  <Heart className="h-16 w-16 text-red-500 mb-6" />
                  <h3 className="text-2xl font-semibold mb-4 text-gray-900">Make a Donation</h3>
                  <p className="text-gray-600 mb-6">Your donation helps us improve AutoSubs and develop new features.</p>
                  <Button className="bg-red-500 text-white hover:bg-red-600 font-semibold px-8 py-6 text-lg btn-hover-effect">
                    Donate Now
                  </Button>
                </div>
                <div className="flex flex-col items-center bg-white rounded-lg px-10 py-14 shadow-sm">
                  <Type className="h-16 w-16 text-purple-600 mb-6" />
                  <h3 className="text-2xl font-semibold mb-4 text-gray-900">Get Subtitle Templates</h3>
                  <p className="text-gray-600 mb-6">Purchase our premium subtitle template pack with 50+ professional designs.</p>
                  <Button className="bg-purple-600 text-white hover:bg-purple-700 font-semibold px-8 py-6 text-lg btn-hover-effect">
                    Buy Templates ($20)
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="w-full py-20 md:py-32 bg-white">
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
      <footer className="py-8 w-full bg-white border-t border-gray-200">
        <div className="container mx-auto px-6 lg:px-10 max-w-6xl">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-sm text-gray-600 mb-4 md:mb-0">© 2024 Tom Moroney. All rights reserved.</p>
            <nav className="flex flex-wrap justify-center md:justify-end gap-6">
              <a className="text-sm hover:underline underline-offset-4 text-gray-600" href="#">
                Terms of Service
              </a>
              <a className="text-sm hover:underline underline-offset-4 text-gray-600" href="#">
                Privacy Policy
              </a>
              <a
                className="text-sm hover:underline underline-offset-4 text-gray-600 flex items-center"
                href="https://discord.gg/yourdiscordinvite"
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