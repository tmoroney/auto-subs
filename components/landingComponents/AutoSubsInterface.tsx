'use client';

import React, { useState } from 'react';
import { Search, Heart, Shield, Type, Check, X, Layers2 } from 'lucide-react';

interface Subtitle {
  id: string;
  text: string;
  timestamp: string;
  speaker?: string;
}

interface AutoSubsProps {
  className?: string;
}

const AutoSubsInterface: React.FC<AutoSubsProps> = ({ className = '' }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [textCase, setTextCase] = useState<'none' | 'abc' | 'ABC'>('none');
  const [removePunctuation, setRemovePunctuation] = useState(false);
  const [censorSensitiveWords, setCensorSensitiveWords] = useState(false);
  const [censorWords, setCensorWords] = useState(['kill', 'bomb', 'death']);
  const [newCensorWord, setNewCensorWord] = useState('');
  const [wordCount, setWordCount] = useState(5);

  const [editingSubtitle, setEditingSubtitle] = useState<Subtitle | null>(null);
  const [editedText, setEditedText] = useState('');

  const originalSubtitles = [
    { id: '1', text: 'Welcome to our amazing video content platform', timestamp: '00:00', speaker: 'Speaker 1' },
    { id: '2', text: 'We provide high-quality subtitles for all your videos', timestamp: '00:05', speaker: 'Speaker 1' },
    { id: '3', text: 'This is a test subtitle. Be careful, this may contain sensitive words like kill or death.', timestamp: '00:10', speaker: 'Speaker 2' },
  ];

  const [subtitles, setSubtitles] = useState(originalSubtitles);

  const addCensorWord = () => {
    if (newCensorWord.trim() && !censorWords.includes(newCensorWord.trim())) {
      setCensorWords([...censorWords, newCensorWord.trim()]);
      setNewCensorWord('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCensorWord();
    }
  };

  const handleOpenEditModal = (subtitle: Subtitle) => {
    setEditingSubtitle(subtitle);
    setEditedText(subtitle.text);
  };

  const handleCloseEditModal = () => {
    setEditingSubtitle(null);
    setEditedText('');
  };

  const handleSaveChanges = () => {
    if (!editingSubtitle) return;
    const updatedSubtitles = subtitles.map(sub =>
      sub.id === editingSubtitle.id ? { ...sub, text: editedText } : sub
    );
    setSubtitles(updatedSubtitles);
    handleCloseEditModal();
  };
  
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveChanges();
    }
  };


  const filteredSubtitles = subtitles.filter(subtitle =>
    subtitle.text.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={className}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden transition-colors duration-200 max-w-5xl mx-auto">
        <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="flex space-x-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            </div>
            <span className="text-gray-700 dark:text-gray-300 font-semibold">AutoSubs</span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row h-[480px]">
          <div className="w-full lg:w-72 bg-gray-50 dark:bg-gray-800 p-4 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex bg-white dark:bg-gray-700 rounded-lg p-1">
                <button className="px-3 py-1 text-sm font-medium bg-gray-900 dark:bg-gray-600 text-white rounded-md">
                  Resolve
                </button>
                <button className="px-3 py-1 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors">
                  Standalone
                </button>
              </div>
              <a href="#support">
              <button className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                <Heart className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button></a>
            </div>

            <div className="mb-4">
              <h3 className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-3 flex items-center gap-2">
                TEXT FORMATTING
              </h3>

              <div className="mb-3 p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-cyan-100 dark:bg-cyan-800 rounded-lg flex items-center justify-center">
                    <span className="text-cyan-600 dark:text-cyan-400 text-xs font-bold">ab</span>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">Word Count</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Max words per line</div>
                  </div>
                </div>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={wordCount}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    if (!isNaN(value) && value >= 1 && value <= 10) {
                      setWordCount(value);
                    }
                  }}
                  className="w-14 px-2 py-1 text-black dark:text-white bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="mb-3 p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-cyan-100 dark:bg-cyan-800 rounded-lg flex items-center justify-center">
                    <span className="text-cyan-600 dark:text-cyan-400 text-xs font-bold">A+</span>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">Text Case</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Modify subtitle text case</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    onClick={() => setTextCase(textCase === 'abc' ? 'none' : 'abc')}
                    className={`px-3 py-1 text-xs rounded flex items-center justify-center ${
                      textCase === 'abc'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    abc
                  </button>
                  <button
                    onClick={() => setTextCase(textCase === 'ABC' ? 'none' : 'ABC')}
                    className={`px-3 py-1 text-xs rounded flex items-center justify-center ${
                      textCase === 'ABC'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    ABC
                  </button>
                </div>
              </div>

              <div className="mb-3 p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-cyan-100 dark:bg-cyan-900 rounded-lg flex items-center justify-center">
                    <Type className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">Remove Punctuation</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Removes all commas, periods, etc.</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={removePunctuation}
                    onChange={(e) => setRemovePunctuation(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600">
                    {removePunctuation ? (
                      <Check className="absolute w-3.5 h-3.5 text-blue-600 dark:text-blue-400 top-1/2 right-1 -translate-y-1/2" />
                    ) : (
                      <X className="absolute w-3.5 h-3.5 text-gray-500 dark:text-gray-400 top-1/2 left-1 -translate-y-1/2" />
                    )}
                  </div>
                </label>
              </div>

              <div className="p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-cyan-100 dark:bg-cyan-900 rounded-lg flex items-center justify-center">
                    <Shield className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">Censor Sensitive Words</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Example: <span className="font-mono">kill</span> → <span className="font-mono">k*ll</span></div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Enable</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={censorSensitiveWords}
                      onChange={(e) => setCensorSensitiveWords(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600">
                      {censorSensitiveWords ? (
                        <Check className="absolute w-3.5 h-3.5 text-blue-600 dark:text-blue-400 top-1/2 right-1 -translate-y-1/2" />
                      ) : (
                        <X className="absolute w-3.5 h-3.5 text-gray-500 dark:text-gray-400 top-1/2 left-1 -translate-y-1/2" />
                      )}
                    </div>
                  </label>
                </div>
                {censorSensitiveWords && (
                  <div className="mt-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCensorWord}
                        onChange={(e) => setNewCensorWord(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Add sensitive word"
                        className="flex-1 px-2 py-1 text-xs text-black dark:text-white bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <button
                        onClick={addCensorWord}
                        className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {censorWords.map((word) => (
                        <span key={word} className="flex items-center bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
                          <span className="font-mono mr-1">{word}</span>
                          <button
                            onClick={() => setCensorWords(censorWords.filter(w => w !== word))}
                            className="ml-1 text-blue-500 hover:text-red-500"
                            aria-label={`Remove ${word}`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M6.293 6.293a1 1 0 011.414 0L10 8.586l2.293-2.293a1 1 0 111.414 1.414L11.414 10l2.293 2.293a1 1 0 01-1.414 1.414L10 11.414l-2.293 2.293a1 1 0 01-1.414-1.414L8.586 10 6.293 7.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div> 
          </div>

          <div className="flex-1 bg-white dark:bg-gray-900 p-4 overflow-y-auto">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search subtitles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-gray-900 dark:text-gray-100 text-sm"
              />
            </div>

            <div className="space-y-2">
              {filteredSubtitles.map((subtitle) => {
                let processedText = subtitle.text;

                if (textCase === 'abc') {
                  processedText = processedText.toLowerCase();
                } else if (textCase === 'ABC') {
                  processedText = processedText.toUpperCase();
                }

                if (removePunctuation) {
                  processedText = processedText.replace(/[.,!?;:'"]/g, '');
                }

                if (censorSensitiveWords) {
                  censorWords.forEach(word => {
                    const regex = new RegExp(`\\b${word}\\b`, 'gi');
                    processedText = processedText.replace(regex, (match) => {
                      if (match.length <= 2) return '*'.repeat(match.length);
                      const censored = match[0] + '*'.repeat(match.length - 2) + match[match.length - 1];
                      return censored;
                    });
                  });
                }

                return (
                  <div
                    key={subtitle.id}
                    onClick={() => handleOpenEditModal(subtitle)}
                    className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-blue-600 dark:text-blue-400">
                            {subtitle.timestamp}
                          </span>
                          {subtitle.speaker && (
                            <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full">
                              {subtitle.speaker}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-900 dark:text-gray-100 text-sm leading-relaxed">
                          {processedText}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredSubtitles.length === 0 && (
              <div className="text-center py-8">
                <div className="text-gray-400 dark:text-gray-600 mb-2 text-sm">
                  {subtitles.length === 0 ? "No subtitles found" : "No results found"}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-500">
                  {subtitles.length === 0
                      ? "No subtitles available. Try importing some first."
                      : `Your search for "${searchTerm}" did not match any subtitles.`}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full gap-3 mt-4 px-2 pb-4">
          <button
            className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-blue-100 text-blue-500 font-medium text-sm shadow-none border-none cursor-not-allowed opacity-70"
            disabled
          >
            Start Transcription
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm shadow-none border-none transition-colors"
          >
            <Layers2 className="w-3.5 h-3.5" />
            Add to Timeline
          </button>
        </div>
      </div>
      
      {editingSubtitle && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 transition-opacity"
          onClick={handleCloseEditModal}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Subtitle</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Edit the subtitle text by modifying the words below.</p>
              </div>
              <button 
                onClick={handleCloseEditModal}
                className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <input
              type="text"
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              onKeyDown={handleEditorKeyDown}
              autoFocus
              className="w-full px-3 py-2 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={handleCloseEditModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveChanges}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutoSubsInterface;