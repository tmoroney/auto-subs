'use client'

import { useState, useEffect } from 'react'
import Header from './landingComponents/Header'
import HeroSection from './landingComponents/HeroSection'
import HowItWorksSection from './landingComponents/HowItWorksSection'
import FeaturesSection from './landingComponents/FeaturesSection'
import SupportSection from './landingComponents/SupportSection'
import AboutDeveloperSection from './landingComponents/AboutDeveloperSection'
import NewsletterSection from './landingComponents/NewsletterSection'
import Footer from './landingComponents/Footer'

export default function LandingPage() {
  const [downloadLink, setDownloadLink] = useState('');

  useEffect(() => {
    const userAgent = window.navigator.userAgent;
    if (userAgent.indexOf('Win') !== -1) {
      setDownloadLink('https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-windows-x86_64.exe');
    } else if (userAgent.indexOf('Mac') !== -1) {
      setDownloadLink('https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-macOS-arm64.pkg');
    } else {
      setDownloadLink('https://github.com/tmoroney/auto-subs/releases');
    }
  }, []);

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
        
        html {
          scroll-behavior: smooth;
        }
        
        .scroll-mt-20 {
          scroll-margin-top: 5rem;
        }
      `}</style>
      <Header />
      <HeroSection downloadLink={downloadLink} />
      <main className="flex-1">
        <HowItWorksSection />
        <FeaturesSection />
        <SupportSection />
        <AboutDeveloperSection />
        <NewsletterSection />
      </main>
      <Footer />
    </div>
  )
}