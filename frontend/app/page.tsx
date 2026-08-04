"use client";

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import RadarGrid from '@/components/RadarGrid';
const VisualizerWorkspace = dynamic(() => import('@/components/VisualizerWorkspace'), { ssr: false });

export default function Home() {
  const [activeTab, setActiveTab] = useState<'generator' | 'visualizer'>('generator');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-[#0f172a] text-slate-50 font-sans selection:bg-sky-500/30">

      {/* Sidebar */}
      <aside
        className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-slate-950/50 backdrop-blur-xl border-r border-white/5 flex flex-col fixed h-full z-20 transition-all duration-300 ease-in-out`}
      >
        <div className={`p-6 border-b border-white/5 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isSidebarCollapsed && (
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></div>
                PDW <span className="text-sky-500">Simulator</span>
              </h1>
            </div>
          )}
          {isSidebarCollapsed && (
            <div className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></div>
          )}

          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="text-slate-500 hover:text-white transition-colors p-1"
          >
            {isSidebarCollapsed ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg>
            )}
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {/* Generator Tab */}
          <button
            onClick={() => setActiveTab('generator')}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold transition-all flex items-center gap-3 uppercase tracking-wider ${activeTab === 'generator' ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30 shadow-[0_0_15px_rgba(14,165,233,0.1)]' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'} ${isSidebarCollapsed ? 'justify-center' : ''}`}
            title="Data Generator"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            {!isSidebarCollapsed && <span>Generator</span>}
          </button>

          {/* Visualizer Tab */}
          <button
            onClick={() => setActiveTab('visualizer')}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold transition-all flex items-center gap-3 uppercase tracking-wider ${activeTab === 'visualizer' ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30 shadow-[0_0_15px_rgba(14,165,233,0.1)]' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'} ${isSidebarCollapsed ? 'justify-center' : ''}`}
            title="Data Visualizer"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
            {!isSidebarCollapsed && <span>Visualizer</span>}
          </button>
        </nav>

        <div className="p-4 border-t border-white/5">
          {!isSidebarCollapsed && <p className="text-[10px] text-slate-600 text-center font-mono">© 2025 PDW Simulator</p>}
        </div>
      </aside>

      {/* Main Content Area */}
      <main
        className={`flex-1 overflow-y-auto w-full h-full transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'ml-20' : 'ml-64'} ${activeTab === 'visualizer' ? 'p-0' : 'p-8 md:p-12'}`}
      >
        {activeTab === 'generator' && (
          <div className="w-full max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="mb-10 text-center space-y-4">
              <h2 className="text-4xl font-extrabold text-white tracking-tight drop-shadow-md">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-blue-100">
                  Data Generator
                </span>
              </h2>
              <p className="text-lg text-blue-100/90 font-light max-w-2xl mx-auto">
                Configure parameters below to export high-precision datasets.
              </p>
            </header>
            <RadarGrid />
          </div>
        )}

        {activeTab === 'visualizer' && (
          <div className="w-full h-full animate-in fade-in zoom-in duration-300">
            <VisualizerWorkspace />
          </div>
        )}
      </main>
    </div>
  );
}
