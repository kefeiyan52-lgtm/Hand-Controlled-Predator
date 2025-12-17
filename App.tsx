
import React, { useEffect, useRef, useState } from 'react';
import FishGame from './components/FishGame';
import { GameState } from './types';

const PLAYER_COLORS: { name: string; rgb: [number, number, number]; css: string }[] = [
  { name: 'Cyan', rgb: [0, 255, 255], css: 'bg-cyan-400' },
  { name: 'Magenta', rgb: [255, 0, 255], css: 'bg-fuchsia-500' },
  { name: 'Lime', rgb: [50, 255, 50], css: 'bg-lime-400' },
  { name: 'Gold', rgb: [255, 215, 0], css: 'bg-yellow-400' },
  { name: 'Orange', rgb: [255, 120, 0], css: 'bg-orange-500' },
  { name: 'Violet', rgb: [160, 50, 255], css: 'bg-violet-500' },
  { name: 'Rose', rgb: [255, 0, 100], css: 'bg-rose-500' },
  { name: 'Blue', rgb: [60, 100, 255], css: 'bg-blue-500' },
  { name: 'White', rgb: [255, 255, 255], css: 'bg-white' },
];

interface HighScore {
  score: number;
  date: string;
}

function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.LOADING);
  const [score, setScore] = useState(0);
  const [finalSize, setFinalSize] = useState(0);
  const [playerColor, setPlayerColor] = useState<[number, number, number]>([0, 255, 255]);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // New State for Enhanced Game Over
  const [highScores, setHighScores] = useState<HighScore[]>([]);
  const [causeOfDeath, setCauseOfDeath] = useState<string>('');
  const [survivalTime, setSurvivalTime] = useState<string>('0s');
  const gameStartTime = useRef<number>(0);

  // Load High Scores
  useEffect(() => {
    const saved = localStorage.getItem('fishGameHighScores');
    if (saved) {
      try {
        setHighScores(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse high scores");
      }
    }
  }, []);

  // Handle Game Over Logic (Save Score, Calc Time)
  useEffect(() => {
    if (gameState === GameState.PLAYING) {
        gameStartTime.current = Date.now();
        setCauseOfDeath('');
    } else if (gameState === GameState.GAME_OVER) {
        const duration = Date.now() - gameStartTime.current;
        const seconds = Math.floor(duration / 1000);
        const minutes = Math.floor(seconds / 60);
        const formattedTime = minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
        setSurvivalTime(formattedTime);

        setHighScores(prev => {
            const newScores = [...prev, { score, date: new Date().toLocaleDateString() }];
            newScores.sort((a, b) => b.score - a.score);
            const top5 = newScores.slice(0, 5);
            localStorage.setItem('fishGameHighScores', JSON.stringify(top5));
            return top5;
        });
    }
  }, [gameState, score]);

  useEffect(() => {
    // Initialize Camera
    const startCamera = async () => {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          // Use 'ideal' constraints for broader mobile/desktop compatibility
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: 'user',
              width: { ideal: 640 },
              height: { ideal: 480 }
            }
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play();
            };
          }
        } catch (err) {
          console.error("Error accessing webcam:", err);
          alert("Camera access is required for hand tracking.");
        }
      }
    };
    startCamera();
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-900 text-white font-sans select-none">
      
      {/* Hidden Video Element for MediaPipe */}
      <video
        ref={videoRef}
        className="absolute top-0 left-0 opacity-0 pointer-events-none"
        playsInline
        muted
        autoPlay
      />

      {/* P5 Game Canvas */}
      <FishGame 
        gameState={gameState} 
        setGameState={setGameState} 
        setScore={setScore} 
        setFinalSize={setFinalSize}
        setCauseOfDeath={setCauseOfDeath}
        videoRef={videoRef}
        playerColor={playerColor}
      />

      {/* UI Overlay Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-6">
        
        {/* Top Bar */}
        <div className="flex justify-between items-start">
            <div>
              <h1 className="text-lg md:text-2xl font-bold tracking-widest uppercase opacity-80 text-cyan-500">Deep Flow</h1>
              <p className="text-[10px] md:text-xs text-cyan-300 opacity-70">Hand-Controlled Predator</p>
            </div>
            <div className="text-right">
               <div className="text-3xl md:text-5xl font-mono font-bold text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
                 {score}
               </div>
               <div className="text-[10px] md:text-xs uppercase tracking-wider opacity-60">Biomass Consumed</div>
            </div>
        </div>

        {/* Center UI States */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-auto p-4 overflow-y-auto">
          
          {gameState === GameState.LOADING && (
            <div className="text-center animate-pulse">
              <div className="w-12 h-12 md:w-16 md:h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <h2 className="text-lg md:text-xl font-light">Loading Vision Model...</h2>
              <p className="text-xs md:text-sm text-slate-400 mt-2">Please allow camera access</p>
            </div>
          )}

          {gameState === GameState.MENU && (
            <div className="text-center bg-slate-900/80 backdrop-blur-md p-6 md:p-10 rounded-2xl border border-cyan-900/50 shadow-2xl max-w-xs md:max-w-lg w-full animate-[fadeIn_0.5s_ease-out]">
              <h2 className="text-4xl md:text-6xl font-black mb-2 bg-gradient-to-br from-cyan-400 to-blue-600 bg-clip-text text-transparent drop-shadow-sm">
                PREDATOR
              </h2>
              <p className="mb-6 text-slate-300 text-sm md:text-lg leading-relaxed">
                Use your <span className="text-white font-bold">Hand</span> to control the fish.
              </p>

              {/* Color Picker */}
              <div className="mb-6 md:mb-8">
                <p className="text-[10px] md:text-xs uppercase tracking-widest text-slate-500 mb-3">Select Mutation</p>
                <div className="flex flex-wrap justify-center gap-3 md:gap-4">
                  {PLAYER_COLORS.map((color) => {
                    const isSelected = playerColor === color.rgb;
                    return (
                      <button
                        key={color.name}
                        onClick={() => setPlayerColor(color.rgb)}
                        className={`w-8 h-8 md:w-10 md:h-10 rounded-full transition-all duration-300 ${color.css} ${
                          isSelected 
                            ? 'ring-4 ring-white/30 scale-125 shadow-[0_0_15px_rgba(255,255,255,0.5)]' 
                            : 'opacity-50 hover:opacity-100 hover:scale-110'
                        }`}
                        aria-label={`Select ${color.name} color`}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 mb-6 md:mb-8 text-xs md:text-sm opacity-80">
                <div><span className="inline-block px-2 py-0.5 rounded bg-green-500/20 text-green-400 font-bold mr-2">EAT</span> smaller fish</div>
                <div><span className="inline-block px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">AVOID</span> larger predators</div>
              </div>

              <button 
                onClick={() => setGameState(GameState.PLAYING)}
                className="group relative px-8 py-3 md:px-10 md:py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-lg md:text-xl rounded-full transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(8,145,178,0.5)] overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
                <span className="relative">START HUNTING</span>
              </button>
            </div>
          )}

          {gameState === GameState.GAME_OVER && (
            <div className="relative overflow-hidden text-center bg-red-950/90 backdrop-blur-xl p-6 md:p-10 rounded-3xl border border-red-500/50 shadow-[0_0_50px_rgba(220,38,38,0.5)] max-w-sm md:max-w-2xl w-full animate-[fadeIn_0.5s_ease-out]">
              
              {/* Animated Background Effect */}
              <div className="absolute inset-0 z-0 pointer-events-none">
                  <div className="absolute inset-[-50%] bg-[radial-gradient(circle,rgba(255,0,0,0.2)_0%,transparent_70%)] animate-[spin_10s_linear_infinite] opacity-50"></div>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(150,0,0,0.1),transparent)] animate-pulse"></div>
              </div>

              <div className="relative z-10 flex flex-col items-center">
                <h2 className="text-4xl md:text-6xl font-black mb-1 text-red-500 tracking-tighter drop-shadow-md">FAILURE</h2>
                <div className="text-sm md:text-base mb-6 text-red-300 font-light flex items-center gap-2 bg-red-900/30 px-4 py-1 rounded-full border border-red-800/50">
                   <span className="uppercase text-[10px] tracking-widest opacity-70">Cause:</span>
                   <span className="capitalize text-white">{causeOfDeath || 'Unknown'}</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mb-8">
                    {/* Stats Column */}
                    <div className="space-y-3">
                        <div className="bg-black/40 rounded-xl p-4 border border-red-500/20">
                            <div className="text-[10px] uppercase tracking-widest text-red-400 mb-1">Total Biomass</div>
                            <div className="text-3xl font-mono font-bold text-white">{score}</div>
                        </div>
                         <div className="grid grid-cols-2 gap-3">
                            <div className="bg-black/30 rounded-xl p-3 border border-red-500/10">
                                <div className="text-[10px] uppercase tracking-widest text-red-400 opacity-80">Max Size</div>
                                <div className="text-xl font-mono text-white">{finalSize}</div>
                            </div>
                            <div className="bg-black/30 rounded-xl p-3 border border-red-500/10">
                                <div className="text-[10px] uppercase tracking-widest text-red-400 opacity-80">Survived</div>
                                <div className="text-xl font-mono text-white">{survivalTime}</div>
                            </div>
                         </div>
                    </div>

                    {/* High Scores Column */}
                    <div className="bg-black/20 rounded-xl p-4 border border-white/5 flex flex-col h-full">
                        <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-3 border-b border-white/10 pb-2">Top Predators</div>
                        <div className="flex-1 space-y-2 overflow-y-auto max-h-[140px] scrollbar-hide">
                            {highScores.map((hs, idx) => (
                                <div key={idx} className={`flex justify-between items-center text-sm ${hs.score === score && idx === 0 ? 'text-yellow-400 font-bold' : 'text-slate-300'}`}>
                                    <div className="flex items-center gap-3">
                                        <span className="opacity-50 font-mono w-4">{idx + 1}.</span>
                                        <span className="text-xs opacity-70">{hs.date}</span>
                                    </div>
                                    <span className="font-mono">{hs.score}</span>
                                </div>
                            ))}
                            {highScores.length === 0 && <div className="text-center text-xs text-slate-600 py-4">No records yet</div>}
                        </div>
                    </div>
                </div>

                <button 
                  onClick={() => {
                      setScore(0);
                      setGameState(GameState.PLAYING);
                  }}
                  className="px-8 py-3 md:px-12 md:py-4 bg-white text-red-900 font-black text-base md:text-lg rounded-full hover:bg-red-50 transition-all hover:scale-105 shadow-xl hover:shadow-2xl ring-4 ring-red-900/50 group"
                >
                  <span className="group-hover:tracking-widest transition-all duration-300">REINCARNATE</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Status */}
        <div className="text-center opacity-40 text-[10px] md:text-xs">
          {gameState === GameState.PLAYING && (
            <div className="animate-pulse flex items-center justify-center gap-2">
               <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-green-500"></div>
               Tracking Active • Keep hand visible
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
