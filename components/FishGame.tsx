
import React, { useEffect, useRef } from 'react';
import p5 from 'p5';
import { HandLandmarker } from '@mediapipe/tasks-vision';
import { initializeHandLandmarker } from '../services/visionService';
import { GameState, FishEntity, Particle, FishVariant } from '../types';

interface FishGameProps {
  gameState: GameState;
  setGameState: (state: GameState) => void;
  setScore: (score: number) => void;
  setFinalSize: (size: number) => void;
  setCauseOfDeath: (cause: string) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  playerColor: [number, number, number];
}

interface Shockwave {
    x: number;
    y: number;
    maxRadius: number;
    currentRadius: number;
    alpha: number;
    color: [number, number, number];
    lineWidth: number;
}

const FishGame: React.FC<FishGameProps> = ({ gameState, setGameState, setScore, setFinalSize, setCauseOfDeath, videoRef, playerColor }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5Instance = useRef<p5 | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  
  // Audio Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioNodesRef = useRef<{
      droneOsc: OscillatorNode;
      droneGain: GainNode;
      noiseSrc: AudioBufferSourceNode;
      noiseGain: GainNode;
      noiseFilter: BiquadFilterNode;
  } | null>(null);

  // Responsive Scale Factor
  const scaleFactor = useRef(1);

  // Game Logic Refs
  const player = useRef<FishEntity>({
    id: 'player',
    x: 0,
    y: 0,
    size: 20,
    vx: 0,
    vy: 0,
    color: playerColor,
    speed: 0,
    noiseOffset: 0,
    variant: 'player'
  });
  
  const enemies = useRef<FishEntity[]>([]);
  const particles = useRef<Particle[]>([]);
  const shockwaves = useRef<Shockwave[]>([]);
  const plankton = useRef<Particle[]>([]); 
  const bubbles = useRef<Particle[]>([]); 
  const scoreRef = useRef(0);
  const lastSpawnTime = useRef(0);
  const dangerIntensity = useRef(0);
  
  // Health System Refs
  const playerHealth = useRef(100);
  const maxHealth = 100;
  const invulnTimer = useRef(0); 
  const screenShake = useRef(0);
  const damageEffectVal = useRef(0); // 1.0 to 0.0
  const lastVideoTime = useRef(-1);
  
  // Update player color when prop changes
  useEffect(() => {
    player.current.color = playerColor;
  }, [playerColor]);

  // Audio Management
  useEffect(() => {
    if (gameState === GameState.PLAYING) {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new AudioContext();
            audioCtxRef.current = ctx;

            // 1. Deep Ocean Drone (Ambience)
            const droneOsc = ctx.createOscillator();
            const droneGain = ctx.createGain();
            const droneFilter = ctx.createBiquadFilter();

            droneOsc.type = 'triangle';
            droneOsc.frequency.value = 45; // Deep bass
            
            droneFilter.type = 'lowpass';
            droneFilter.frequency.value = 180; 
            droneFilter.Q.value = 1;

            droneGain.gain.value = 0.15; // Base volume

            // LFO to modulate drone texture slightly
            const lfo = ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 0.08; // Slow breathing
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 40; 
            lfo.connect(lfoGain);
            lfoGain.connect(droneFilter.frequency);
            lfo.start();

            droneOsc.connect(droneFilter);
            droneFilter.connect(droneGain);
            droneGain.connect(ctx.destination);
            droneOsc.start();

            // 2. Dynamic Water Noise (Movement texture)
            // Generate Pink/Brown noise buffer
            const bufferSize = ctx.sampleRate * 2;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            let lastOut = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                data[i] = (lastOut + (0.02 * white)) / 1.02; // Brown noise filter
                lastOut = data[i];
                data[i] *= 3.5; // Gain compensation
            }

            const noiseSrc = ctx.createBufferSource();
            noiseSrc.buffer = buffer;
            noiseSrc.loop = true;

            const noiseFilter = ctx.createBiquadFilter();
            noiseFilter.type = 'lowpass';
            noiseFilter.frequency.value = 200; // Starts muffled
            
            const noiseGain = ctx.createGain();
            noiseGain.gain.value = 0.05; // Starts quiet

            noiseSrc.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(ctx.destination);
            noiseSrc.start();

            audioNodesRef.current = { 
                droneOsc, 
                droneGain,
                noiseSrc, 
                noiseGain, 
                noiseFilter 
            };

        } catch (e) {
            console.error("Audio init failed", e);
        }
    } else {
        // Cleanup Audio
        if (audioCtxRef.current) {
             const nodes = audioNodesRef.current;
             if (nodes) {
                 try {
                    nodes.droneOsc.stop();
                    nodes.noiseSrc.stop();
                 } catch (e) {}
             }
             audioNodesRef.current = null;
             audioCtxRef.current.close().catch(e => console.error(e));
             audioCtxRef.current = null;
        }
    }

    return () => {
         if (audioCtxRef.current && gameState !== GameState.PLAYING) {
             audioCtxRef.current.close().catch(e => {});
         }
    };
  }, [gameState]);

  const playSound = (type: 'eat' | 'hurt') => {
      const ctx = audioCtxRef.current;
      if (!ctx || ctx.state !== 'running') return;

      const t = ctx.currentTime;

      if (type === 'eat') {
          // "Bloop" / Watery Gulp
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          
          osc.type = 'sine';
          osc.frequency.setValueAtTime(300, t);
          osc.frequency.linearRampToValueAtTime(600, t + 0.1); // Pitch bend up
          
          gain.gain.setValueAtTime(0.2, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.start(t);
          osc.stop(t + 0.2);

          // Subtle bubble pop layer
          const popOsc = ctx.createOscillator();
          const popGain = ctx.createGain();
          popOsc.type = 'triangle';
          popOsc.frequency.setValueAtTime(200, t);
          popOsc.frequency.exponentialRampToValueAtTime(50, t + 0.05);
          
          popGain.gain.setValueAtTime(0.1, t);
          popGain.gain.linearRampToValueAtTime(0, t + 0.05);
          
          popOsc.connect(popGain);
          popGain.connect(ctx.destination);
          popOsc.start(t);
          popOsc.stop(t + 0.1);

      } else if (type === 'hurt') {
          // Deep Impact & Crunch
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          // Low thud
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(90, t);
          osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
          
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(800, t);
          filter.frequency.exponentialRampToValueAtTime(100, t + 0.2);

          gain.gain.setValueAtTime(0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
          
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.5);

          // Noise burst
          const bSize = ctx.sampleRate * 0.2;
          const b = ctx.createBuffer(1, bSize, ctx.sampleRate);
          const d = b.getChannelData(0);
          for(let i=0; i<bSize; i++) d[i] = Math.random() * 2 - 1;
          const noise = ctx.createBufferSource();
          noise.buffer = b;
          const nGain = ctx.createGain();
          nGain.gain.setValueAtTime(0.25, t);
          nGain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
          
          noise.connect(nGain);
          nGain.connect(ctx.destination);
          noise.start(t);
      }
  };

  const updateAudioDynamics = (p: p5) => {
      if (audioNodesRef.current && audioCtxRef.current && player.current) {
          const nodes = audioNodesRef.current;
          const t = audioCtxRef.current.currentTime;
          const sf = scaleFactor.current;
          
          // Modulate water noise based on speed
          const rawSpeed = player.current.speed / sf;
          const speed = p.constrain(rawSpeed, 0, 25);
          
          // Faster = Louder and Brighter sound
          const targetFreq = p.map(speed, 0, 25, 200, 1200);
          const targetGain = p.map(speed, 0, 25, 0.05, 0.25);
          
          nodes.noiseFilter.frequency.setTargetAtTime(targetFreq, t, 0.1);
          nodes.noiseGain.gain.setTargetAtTime(targetGain, t, 0.1);
      }
  };

  useEffect(() => {
    const initAI = async () => {
      try {
        const landmarker = await initializeHandLandmarker();
        handLandmarkerRef.current = landmarker;
        if(gameState === GameState.LOADING) {
             setGameState(GameState.MENU);
        }
      } catch (e) {
        console.error("Failed to load MediaPipe", e);
      }
    };
    initAI();
  }, [setGameState, gameState]);

  useEffect(() => {
    if (!containerRef.current) return;

    const sketch = (p: p5) => {
      let canvas: p5.Renderer;
      
      p.setup = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas = p.createCanvas(w, h);
        canvas.parent(containerRef.current!);
        p.frameRate(60);
        p.noCursor();
        
        updateScaleFactor(p);
        resetGame(p);
      };

      p.windowResized = () => {
        p.resizeCanvas(window.innerWidth, window.innerHeight);
        updateScaleFactor(p);
        if (plankton.current.length === 0) resetGame(p);
      };

      const updateScaleFactor = (p: p5) => {
          scaleFactor.current = Math.min(p.width, p.height) / 800;
      };

      p.draw = () => {
        p.push();
        p.resetMatrix();
        const ctx = p.drawingContext as CanvasRenderingContext2D;
        const bgGrad = ctx.createLinearGradient(0, 0, 0, p.height);
        bgGrad.addColorStop(0, '#1a3b5c'); 
        bgGrad.addColorStop(1, '#0a1525'); 
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, p.width, p.height);
        p.pop();
        
        if (screenShake.current > 0) {
            const shakeX = p.random(-screenShake.current, screenShake.current);
            const shakeY = p.random(-screenShake.current, screenShake.current);
            p.translate(shakeX, shakeY);
            screenShake.current *= 0.9; 
            if(screenShake.current < 0.5) screenShake.current = 0;
        }

        drawWaterAtmosphere(p);
        handleHandInput(p);

        if (gameState === GameState.PLAYING) {
          updateGameLogic(p);
          updateAudioDynamics(p);
        }

        drawParticles(p);
        drawShockwaves(p); 
        drawEnemies(p);
        drawPlayer(p);
        // drawThreatIndicators(p); // Disabled as requested
        drawDangerOverlay(p);
        
        if (gameState === GameState.PLAYING) {
            drawHUD(p);
        }
      };

      const handleHandInput = (p: p5) => {
        if (!handLandmarkerRef.current || !videoRef.current) return;
        
        const video = videoRef.current;

        // CRITICAL FIX: Ensure video has dimensions and data before detection
        if (video.readyState < 2 || video.videoWidth < 1 || video.videoHeight < 1) return;

        // Optimization: Only process when the video frame has actually changed
        if (video.currentTime !== lastVideoTime.current) {
            lastVideoTime.current = video.currentTime;
            
            try {
                let startTimeMs = performance.now();
                const results = handLandmarkerRef.current.detectForVideo(video, startTimeMs);
                
                if (results.landmarks && results.landmarks.length > 0) {
                  const landmarks = results.landmarks[0];
                  const point = landmarks[9]; // Middle finger MCP is a very stable center point
                  
                  // Improved Mapping: Add a margin so user doesn't have to reach extreme edges of camera
                  // We map a sub-rectangle of the camera view (0.1 to 0.9) to the full screen size
                  const margin = 0.1;
                  
                  // Mirror X (1 - x) because webcam is mirrored
                  const rawX = 1 - point.x;
                  const rawY = point.y;
                  
                  // Map input range [margin, 1-margin] to output [0, width/height]
                  // true argument constrains the output to the bounds
                  const targetX = p.map(rawX, margin, 1 - margin, 0, p.width, true);
                  const targetY = p.map(rawY, margin, 1 - margin, 0, p.height, true);
                  
                  const prevX = player.current.x;
                  const prevY = player.current.y;

                  // Lerp for smoothing (0.2 is snappy but smooth enough to hide jitters)
                  player.current.x = p.lerp(player.current.x, targetX, 0.2);
                  player.current.y = p.lerp(player.current.y, targetY, 0.2);

                  player.current.vx = player.current.x - prevX;
                  player.current.vy = player.current.y - prevY;
                  player.current.speed = p.dist(0, 0, player.current.vx, player.current.vy);
                }
            } catch (err) {
                // Silently fail if detection errors occur to avoid crashing the loop
            }
        }
      };

      const updateGameLogic = (p: p5) => {
        const currentTime = p.millis();
        const deltaTime = p.deltaTime;
        const sf = scaleFactor.current;

        if (invulnTimer.current > 0) {
            invulnTimer.current -= deltaTime;
        }

        if (playerHealth.current < maxHealth && invulnTimer.current <= 0) {
            playerHealth.current += 0.05; 
            playerHealth.current = Math.min(playerHealth.current, maxHealth);
        }

        // --- Dynamic Spawn Rate Logic ---
        let activeSpawnInterval = Math.max(600, 1500 - (scoreRef.current * 5));
        
        if (enemies.current.length < 8) {
            activeSpawnInterval = 300; // Fast spawn (0.3s)
        } else if (enemies.current.length < 15) {
            activeSpawnInterval = Math.min(activeSpawnInterval, 800); // Moderate cap
        }

        if (currentTime - lastSpawnTime.current > activeSpawnInterval) {
          spawnEnemy(p);
          lastSpawnTime.current = currentTime;
        }
        // --------------------------------

        let maxDanger = 0;

        for (let i = enemies.current.length - 1; i >= 0; i--) {
          const e = enemies.current[i];
          const distToPlayer = p.dist(player.current.x, player.current.y, e.x, e.y);
          
          let detectionRange = 400 * sf;
          let chaseSpeedMultiplier = 1.3;
          let steerStrength = 0.08;

          if (e.variant === 'dasher') {
              detectionRange = 600 * sf;
              chaseSpeedMultiplier = 2.2; 
              steerStrength = 0.04; 
          } else if (e.variant === 'titan') {
              detectionRange = 500 * sf;
              chaseSpeedMultiplier = 0.8;
              steerStrength = 0.05; 
          } else if (e.variant === 'viper') {
              detectionRange = 450 * sf;
              chaseSpeedMultiplier = 1.6; 
              steerStrength = 0.12; 
          }

          const actuallyPredator = e.size > player.current.size;
          
          if (actuallyPredator && distToPlayer < detectionRange) { 
            if (e.variant === 'titan') {
                const pullStrength = 0.4 * sf; 
                const angleToTitan = p.atan2(e.y - player.current.y, e.x - player.current.x);
                player.current.x += p.cos(angleToTitan) * pullStrength;
                player.current.y += p.sin(angleToTitan) * pullStrength;
                if (distToPlayer < 200 * sf) screenShake.current += 0.2;
            }

            const danger = p.constrain(p.map(distToPlayer, detectionRange, 100 * sf, 0, 1), 0, 1);
            if (danger > maxDanger) maxDanger = danger;

            const angle = p.atan2(player.current.y - e.y, player.current.x - e.x);
            const chaseSpeed = e.speed * chaseSpeedMultiplier;
            const playerIsDashing = player.current.speed > (15 * sf);
            let trackingStrength = playerIsDashing ? 0.015 : steerStrength; 
            
            let targetVx = p.cos(angle) * chaseSpeed;
            let targetVy = p.sin(angle) * chaseSpeed;

            if (e.variant === 'viper') {
                const oscillation = p.sin(currentTime * 0.01) * (4 * sf);
                targetVx += -p.sin(angle) * oscillation;
                targetVy += p.cos(angle) * oscillation;
            }

            e.vx = p.lerp(e.vx, targetVx, trackingStrength);
            e.vy = p.lerp(e.vy, targetVy, trackingStrength);

          } else {
            const yNoise = p.noise(e.noiseOffset + currentTime * 0.0005); 
            const speedNoise = p.noise(e.noiseOffset + 1000 + currentTime * 0.001);
            const driftY = p.map(yNoise, 0, 1, -1.5 * sf, 1.5 * sf);
            const speedMult = p.map(speedNoise, 0, 1, 0.8, 1.2);
            const intendedDir = e.vx > 0 ? 1 : -1;
            
            let wanderSpeed = e.speed;
            if (e.variant === 'titan') wanderSpeed *= 0.5;

            e.vx = p.lerp(e.vx, intendedDir * wanderSpeed * speedMult, 0.05);
            e.vy = p.lerp(e.vy, driftY, 0.05);
          }

          e.x += e.vx;
          e.y += e.vy;

          if (distToPlayer < (player.current.size * 0.6) + (e.size * 0.6)) {
            if (player.current.size >= e.size) {
              player.current.size += e.size * 0.1; 
              scoreRef.current += Math.floor(e.size / sf); 
              playerHealth.current += 10;
              playerHealth.current = Math.min(playerHealth.current, maxHealth);
              setScore(scoreRef.current);
              enemies.current.splice(i, 1);
              spawnParticles(p, e.x, e.y, e.color, 15);
              spawnShockwave(p, e.x, e.y, e.color); // TRIGGER SHOCKWAVE
              playSound('eat'); // SOUND TRIGGER
            } else {
              if (invulnTimer.current <= 0) {
                  const damage = e.variant === 'titan' ? 60 : 35; 
                  playerHealth.current -= damage;
                  damageEffectVal.current = 1.0; // Trigger visual damage effect
                  
                  // Dynamic screen shake based on predator size and speed
                  const baseImpact = (e.size / sf) * 0.8 + (e.speed / sf) * 2.0;
                  screenShake.current = Math.min(baseImpact * sf, 50 * sf);
                  
                  invulnTimer.current = 1500; 
                  spawnParticles(p, player.current.x, player.current.y, [255, 0, 0], 20);
                  playSound('hurt'); // SOUND TRIGGER

                  if (playerHealth.current <= 0) {
                      setFinalSize(Math.floor(player.current.size / sf)); 
                      setCauseOfDeath(e.variant);
                      setGameState(GameState.GAME_OVER);
                  }
              }
            }
          }

          if (e.x < -300 * sf || e.x > p.width + 300 * sf) {
             enemies.current.splice(i, 1);
          }
        }

        dangerIntensity.current = p.lerp(dangerIntensity.current, maxDanger, 0.1);

        if (p.random() < 0.1) {
          particles.current.push({
            x: p.random(p.width),
            y: p.height + 20,
            size: p.random(1, 4) * sf,
            vy: p.random(1, 3) * sf,
            alpha: 100
          });
        }
      };

      const spawnEnemy = (p: p5) => {
        const sf = scaleFactor.current;
        const isPrey = p.random() > 0.4; 
        
        let size, color, speed;
        let variant: FishVariant = 'prey';
        
        const pSize = player.current.size;

        if (isPrey) {
             size = p.random(pSize * 0.3, pSize * 0.8);
             size = p.constrain(size, 10 * sf, 300 * sf); 
             variant = 'prey';
             const colors: [number, number, number][] = [
                 [0, 255, 100], [0, 200, 255], [255, 100, 200], [255, 255, 0], [200, 200, 255]
             ];
             color = p.random(colors);
             speed = p.random(3, 6) * sf;
        } else {
             const rand = p.random();
             
             if (rand < 0.35) {
                 variant = 'hunter';
                 size = p.random(pSize * 1.1, pSize * 2.0);
                 const colors: [number, number, number][] = [[255, 50, 50], [255, 120, 0]];
                 color = p.random(colors);
                 speed = p.random(2, 4) * sf;
             } else if (rand < 0.65) {
                 variant = 'dasher';
                 size = p.random(pSize * 1.0, pSize * 1.4); 
                 const colors: [number, number, number][] = [[0, 255, 255], [200, 255, 255], [255, 255, 0]];
                 color = p.random(colors);
                 speed = p.random(5, 7) * sf; 
             } else if (rand < 0.85) {
                 variant = 'viper';
                 size = p.random(pSize * 1.1, pSize * 1.6);
                 const colors: [number, number, number][] = [[150, 255, 0], [180, 200, 50], [100, 200, 100]];
                 color = p.random(colors);
                 speed = p.random(3, 5) * sf;
             } else {
                 variant = 'titan';
                 size = p.random(pSize * 1.8, pSize * 3.0); 
                 const colors: [number, number, number][] = [[50, 70, 90], [80, 50, 50], [30, 30, 40]];
                 color = p.random(colors);
                 speed = p.random(0.5, 1.5) * sf; 
             }
        }

        const y = p.random(50 * sf, p.height - 50 * sf);
        const fromLeft = p.random() > 0.5;
        
        enemies.current.push({
          id: Math.random().toString(),
          x: fromLeft ? -size * 2 : p.width + size * 2,
          y: y,
          size: size,
          vx: fromLeft ? speed : -speed, 
          vy: 0,
          color: color,
          speed: speed,
          noiseOffset: p.random(1000),
          variant: variant
        });
      };
      
      const spawnShockwave = (p: p5, x: number, y: number, color: [number, number, number]) => {
          const sf = scaleFactor.current;
          shockwaves.current.push({
              x,
              y,
              maxRadius: p.random(80, 120) * sf,
              currentRadius: 10 * sf,
              alpha: 200,
              color: color,
              lineWidth: 8 * sf
          });
      };

      const drawShockwaves = (p: p5) => {
          const sf = scaleFactor.current;
          p.push();
          p.blendMode(p.ADD);
          p.noFill();
          
          for (let i = shockwaves.current.length - 1; i >= 0; i--) {
              const sw = shockwaves.current[i];
              
              // Expansion with ease-out
              sw.currentRadius += (sw.maxRadius - sw.currentRadius) * 0.15 + (1 * sf);
              
              // Fade out
              sw.alpha -= 10;
              sw.lineWidth *= 0.9;
              
              if (sw.alpha <= 0 || sw.lineWidth < 0.5) {
                  shockwaves.current.splice(i, 1);
                  continue;
              }
              
              p.stroke(sw.color[0], sw.color[1], sw.color[2], sw.alpha);
              p.strokeWeight(sw.lineWidth);
              p.circle(sw.x, sw.y, sw.currentRadius * 2);
          }
          p.pop();
      };

      const spawnParticles = (p: p5, x: number, y: number, color: [number, number, number], count: number) => {
          const sf = scaleFactor.current;
          for(let i=0; i<count; i++) {
              particles.current.push({
                  x: x,
                  y: y,
                  size: p.random(3, 8) * sf,
                  vy: p.random(-3, 3) * sf, 
                  alpha: 255,
                  color: color
              });
          }
      };

      const drawParticles = (p: p5) => {
          const sf = scaleFactor.current;
          for(let i = particles.current.length - 1; i>=0; i--) {
              const part = particles.current[i];
              part.y -= part.vy;
              part.alpha -= 1;
              part.x += p.sin(p.millis() * 0.01 + part.y * 0.1) * 0.5 * sf; 

              p.noStroke();
              if (part.color) {
                  p.fill(part.color[0], part.color[1], part.color[2], part.alpha);
              } else {
                  p.fill(200, 230, 255, part.alpha);
              }
              p.circle(part.x, part.y, part.size);

              if (part.alpha <= 0 || part.y < -10) {
                  particles.current.splice(i, 1);
              }
          }
      };

      const drawEnemies = (p: p5) => {
          const sf = scaleFactor.current;
          for (const e of enemies.current) {
              p.push();
              p.translate(e.x, e.y);
              
              const speed = p.dist(0, 0, e.vx, e.vy);
              
              if (speed > 0.1) {
                  const angle = p.atan2(e.vy, Math.abs(e.vx));
                  const constrainedAngle = p.constrain(angle, -p.PI / 4, p.PI / 4);
                  
                  if (e.vx < 0) {
                      p.scale(-1, 1);
                      p.rotate(constrainedAngle);
                  } else {
                      p.rotate(constrainedAngle);
                  }
              }
              
              const normalizedSpeed = e.speed / sf;
              const animIntensity = p.map(p.constrain(normalizedSpeed, 0, 15), 0, 15, 0.5, 1.5);
              
              drawFishShape(p, e.size, e.color, e.variant, animIntensity);
              p.pop();
          }
      };

      const drawHUD = (p: p5) => {
          p.push();
          p.resetMatrix();
          const sf = scaleFactor.current;

          const barWidth = 200 * sf;
          const barHeight = 10 * sf;
          const x = p.width / 2 - barWidth / 2;
          const y = p.height - (40 * sf);

          p.noStroke();
          p.fill(20, 40, 60, 200);
          p.rect(x - 2 * sf, y - 2 * sf, barWidth + 4 * sf, barHeight + 4 * sf, 10 * sf);

          const hpRatio = playerHealth.current / maxHealth;
          p.fill(p.lerpColor(p.color(255, 50, 50), p.color(0, 255, 200), hpRatio));
          p.rect(x, y, barWidth * hpRatio, barHeight, 8 * sf);

          p.textAlign(p.CENTER);
          p.fill(200);
          p.textSize(10 * sf);
          p.text("INTEGRITY", p.width / 2, y + 22 * sf);
          
          p.pop();
      };

      const drawPlayer = (p: p5) => {
        const pl = player.current;
        const sf = scaleFactor.current;
        p.push();
        p.translate(pl.x, pl.y);
        
        // Damage Ripple/Flash Visuals
        if (damageEffectVal.current > 0.01) {
            damageEffectVal.current -= 0.05; // Decay rate
            const progress = 1.0 - damageEffectVal.current;
            
            // 1. Red Flash glow on body
            p.noStroke();
            p.fill(255, 0, 0, damageEffectVal.current * 150);
            p.circle(0, 0, pl.size * 3.5);

            // 2. Sharp expanding ripple
            const rippleRadius = pl.size * 2 + (progress * 150 * sf);
            p.noFill();
            p.stroke(255, 50, 50, damageEffectVal.current * 255);
            p.strokeWeight(4 * sf * damageEffectVal.current);
            p.circle(0, 0, rippleRadius);
        }

        if (invulnTimer.current > 0) {
            if (Math.floor(p.millis() / 100) % 2 === 0) {
                p.tint(255, 100, 100); 
            } else {
                p.noTint();
                (p.drawingContext as CanvasRenderingContext2D).globalAlpha = 0.5; 
            }
        }

        const speed = p.dist(0, 0, pl.vx, pl.vy);
        if (speed > 0.5 * sf) {
             const angle = p.atan2(pl.vy, Math.abs(pl.vx));
             const constrainedAngle = p.constrain(angle, -p.PI / 4, p.PI / 4);
             
             if (pl.vx < 0) {
                 p.scale(-1, 1);
                 p.rotate(constrainedAngle);
             } else {
                 p.rotate(constrainedAngle);
             }
        } else {
             if (pl.vx < -0.1) p.scale(-1, 1);
        }

        p.noStroke();
        p.fill(pl.color[0], pl.color[1], pl.color[2], 30);
        p.circle(0, 0, pl.size * 2.8);
        
        if (pl.speed > 15 * sf) {
             p.stroke(255, 255, 255, 100);
             p.noFill();
             p.circle(0, 0, pl.size * 3.0 + p.sin(p.millis() * 0.1) * (10 * sf));
        }

        p.fill(pl.color[0], pl.color[1], pl.color[2], 60);
        p.circle(0, 0, pl.size * 2.0);

        const normalizedSpeed = pl.speed / sf;
        const animIntensity = p.map(p.constrain(normalizedSpeed, 0, 20), 0, 20, 0.5, 2.0);
        drawFishShape(p, pl.size, pl.color, pl.variant, animIntensity);
        
        p.pop();
      };
      
      const drawDangerOverlay = (p: p5) => {
          if (dangerIntensity.current > 0.01) {
              p.push();
              p.resetMatrix(); 
              
              const ctx = p.drawingContext as CanvasRenderingContext2D;
              const w = p.width;
              const h = p.height;
              
              const intensity = dangerIntensity.current;
              const pulse = (p.sin(p.millis() * 0.008) + 1) * 0.5; 
              
              const maxDim = Math.max(w, h);
              const cx = w / 2;
              const cy = h / 2;
              
              const innerRadius = maxDim * p.map(intensity, 0, 1, 0.7, 0.25) + (pulse * 20);
              const outerRadius = maxDim * 0.9;
              
              const grad = ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, outerRadius);
              
              const maxAlpha = p.map(intensity, 0, 1, 0.2, 0.9);
              
              grad.addColorStop(0, 'rgba(80, 0, 0, 0)');
              grad.addColorStop(0.5, `rgba(180, 0, 0, ${maxAlpha * 0.5})`);
              grad.addColorStop(1, `rgba(255, 0, 0, ${maxAlpha})`);
              
              ctx.fillStyle = grad;
              ctx.fillRect(0, 0, w, h);
              
              p.pop();
          }

          if (invulnTimer.current > 1300) { 
               p.push();
               p.resetMatrix();
               p.fill(255, 0, 0, 100);
               p.noStroke();
               p.rect(0, 0, p.width, p.height);
               p.pop();
          }
      };

      const drawFishShape = (p: p5, size: number, color: [number, number, number], variant: FishVariant, animIntensity: number = 1) => {
        const r = size;
        const time = p.millis();
        const sf = scaleFactor.current;
        const ctx = p.drawingContext as CanvasRenderingContext2D;

        // Visual parameters based on variant
        let bodyWidthMult = 1.0;
        let waveLength = 4.0;
        let wiggleMag = 0.15;
        let tailSize = 1.0;

        if (variant === 'dasher') {
            bodyWidthMult = 0.65;
            waveLength = 3.0;
            tailSize = 1.3;
        } else if (variant === 'titan') {
            bodyWidthMult = 1.4;
            wiggleMag = 0.08;
            tailSize = 0.8;
        } else if (variant === 'viper') {
            bodyWidthMult = 0.5;
            waveLength = 6.0;
            wiggleMag = 0.25;
            tailSize = 1.1;
        } else if (variant === 'hunter') {
            bodyWidthMult = 1.0;
            tailSize = 1.1;
        }

        const wiggleAmp = r * wiggleMag * Math.pow(animIntensity, 1.2); 
        const baseFreq = 0.003; 

        // Gradient Setup
        const grad = ctx.createLinearGradient(0, -r/2, 0, r/2);
        const c = p.color(color);
        const darkC = p.lerpColor(c, p.color(0), 0.4); 
        const lightC = p.lerpColor(c, p.color(255), 0.4); 
        
        grad.addColorStop(0, darkC.toString()); // Top is dark (counter shading)
        grad.addColorStop(0.5, c.toString());
        grad.addColorStop(1, lightC.toString()); // Bottom is light

        ctx.fillStyle = grad;
        p.noStroke();
        
        // Calculate spine and body
        const spinePoints: {x: number, y: number, nx: number, width: number}[] = [];
        const step = r / 15; // More resolution

        // Generate points first to use for body and features
        for (let x = -r; x <= r; x += step) {
            const nx = x / r; // -1 (tail) to 1 (head)
            
            // Calculate Width
            let w = Math.sqrt(1 - nx * nx); // Base Circle
            if (isNaN(w)) w = 0;

            if (variant === 'viper') {
                w = 0.7 * Math.pow(1 - Math.abs(nx * 0.8), 0.3); // Cylinder
            } else if (variant === 'dasher') {
                w = w * 0.7; // Thin
                if (nx > 0) w *= (1 - nx * 0.5); // Pointy head
            } else if (variant === 'titan') {
                w = w * 1.3;
                if (nx < 0) w *= (1 + nx * 0.2); // thick tail
            } else {
                 // Standard/Hunter: Tear drop
                 if (nx < 0) w *= (1 + nx * 0.3);
            }

            const width = w * r * 0.6 * bodyWidthMult;
            
            // Animation
            const phase = time * baseFreq * 10 + (nx * waveLength);
            // Less movement at head (nx=1), more at tail (nx=-1)
            const dampener = Math.pow((1 - nx) / 2, 2.0); 
            // Vipers move head too
            const headMovement = variant === 'viper' ? 0.2 : 0.05; 
            const finalDamp = Math.max(dampener, headMovement);
            
            const offsetY = p.sin(phase) * wiggleAmp * finalDamp;

            spinePoints.push({x, y: offsetY, nx, width});
        }

        // DRAW BODY
        p.beginShape();
        // Top edge
        for (let i = 0; i < spinePoints.length; i++) {
            const pt = spinePoints[i];
            // Add spikes for Titan
            let hMod = 0;
            if (variant === 'titan' && i % 4 === 0 && pt.nx > -0.5 && pt.nx < 0.5) {
                 hMod = -r * 0.15;
            }
            p.vertex(pt.x, pt.y - pt.width + hMod);
        }
        // Bottom edge
        for (let i = spinePoints.length - 1; i >= 0; i--) {
            const pt = spinePoints[i];
            p.vertex(pt.x, pt.y + pt.width);
        }
        p.endShape(p.CLOSE);

        // DRAW PATTERNS (Stripes/Spots)
        p.push();
        p.noFill();
        p.stroke(0, 0, 0, 50);
        p.strokeWeight(r * 0.02);
        
        spinePoints.forEach((pt, i) => {
            if (Math.abs(pt.nx) > 0.8) return; // Skip nose and tail tip

            if (variant === 'hunter' && i % 3 === 0) {
                // Tiger stripes
                p.line(pt.x, pt.y - pt.width * 0.8, pt.x - r*0.1, pt.y + pt.width * 0.5);
            } else if (variant === 'titan' && i % 3 === 0) {
                // Spots
                p.fill(0,0,0,30);
                p.noStroke();
                p.circle(pt.x, pt.y - pt.width * 0.4, r * 0.15);
                p.noFill();
            }
        });

        // Dasher Stripe
        if (variant === 'dasher') {
             p.stroke(255, 255, 255, 80);
             p.strokeWeight(r * 0.05);
             p.beginShape();
             spinePoints.forEach(pt => {
                 if(pt.nx > -0.8 && pt.nx < 0.8) p.vertex(pt.x, pt.y);
             });
             p.endShape();
        }
        p.pop();

        // FINS
        // Dorsal Fin (Top)
        if (variant !== 'viper') {
            const dorsalIndex = Math.floor(spinePoints.length * 0.45);
            if (spinePoints[dorsalIndex]) {
                const pt = spinePoints[dorsalIndex];
                p.fill(color[0], color[1], color[2], 200);
                p.beginShape();
                p.vertex(pt.x - r*0.1, pt.y - pt.width * 0.9);
                p.vertex(pt.x + r*0.2, pt.y - pt.width * 0.9);
                // Tip of fin
                const finH = variant === 'hunter' ? 0.5 : 0.3;
                p.vertex(pt.x - r*0.05, pt.y - pt.width - r*finH); 
                p.endShape(p.CLOSE);
            }
        }

        // Pectoral Fin (Side) - Animated
        if (variant !== 'viper') {
             const pecIndex = Math.floor(spinePoints.length * 0.7); // Near head
             if (spinePoints[pecIndex]) {
                 const pt = spinePoints[pecIndex];
                 const finPhase = time * 0.015;
                 const finAngle = p.sin(finPhase) * 0.3 + 0.3;
                 
                 p.push();
                 p.translate(pt.x, pt.y + pt.width * 0.3);
                 p.rotate(finAngle);
                 p.fill(lightC);
                 p.beginShape();
                 p.vertex(0, 0);
                 p.vertex(-r * 0.3, r * 0.15);
                 p.vertex(-r * 0.05, r * 0.05);
                 p.endShape(p.CLOSE);
                 p.pop();
             }
        }

        // TAIL
        const tailPt = spinePoints[0]; // Tail end of body
        if (tailPt) {
            p.push();
            p.translate(tailPt.x, tailPt.y);
            // Calculate angle based on last few spine points
            const prevPt = spinePoints[1];
            const tailAngle = p.atan2(tailPt.y - prevPt.y, tailPt.x - prevPt.x);
            p.rotate(tailAngle);

            p.fill(color);
            p.beginShape();
            
            // Corrected: using positive X to extend outwards from the body
            if (variant === 'viper') {
                // Pointy tail
                p.vertex(0, -tailPt.width);
                p.vertex(r * 0.5, 0); // Positive
                p.vertex(0, tailPt.width);
            } else if (variant === 'hunter' || variant === 'dasher') {
                // Forked tail
                const tLen = r * tailSize * 0.8; // Positive
                const tW = r * 0.8;
                p.vertex(0, -tailPt.width * 0.5);
                p.vertex(tLen, -tW); 
                p.vertex(tLen * 0.5, 0);
                p.vertex(tLen, tW); 
                p.vertex(0, tailPt.width * 0.5);
            } else {
                // Fan tail (Prey / Titan / Player)
                const tLen = r * tailSize * 0.8; // Positive
                const tW = r * 0.6;
                p.vertex(0, -tailPt.width * 0.5);
                (p as any).quadraticVertex(tLen, -tW, tLen, 0); 
                (p as any).quadraticVertex(tLen, tW, 0, tailPt.width * 0.5); 
            }
            p.endShape(p.CLOSE);
            p.pop();
        }

        // EYES
        const eyeIndex = Math.floor(spinePoints.length * 0.85);
        if (spinePoints[eyeIndex]) {
            const pt = spinePoints[eyeIndex];
            const eyeSize = r * 0.25;
            
            p.fill(255);
            p.noStroke();
            p.circle(pt.x, pt.y - pt.width * 0.3, eyeSize); 
            
            // Pupil
            p.fill(0);
            p.circle(pt.x + eyeSize*0.2, pt.y - pt.width * 0.3, eyeSize * 0.4);
            
            // Highlight
            p.fill(255, 255, 255, 200);
            p.circle(pt.x + eyeSize*0.3, pt.y - pt.width * 0.3 - eyeSize*0.1, eyeSize * 0.15);
            
            // Blink
             if (time % 4000 > 3800) {
                 p.fill(darkC);
                 p.circle(pt.x, pt.y - pt.width * 0.3, eyeSize); // Eyelid
             }
        }
      };

      const drawWaterAtmosphere = (p: p5) => {
         const t = p.millis() * 0.0005;
         const sf = scaleFactor.current;

         p.push();
         p.blendMode(p.ADD); 
         p.noStroke();
         
         for (let i = 0; i < 6; i++) {
             const x = (p.noise(i, t * 0.5) * p.width * 1.5) - p.width * 0.25;
             const w = p.noise(i + 10, t) * (p.width * 0.3) + (p.width * 0.1);
             const alpha = p.noise(i + 20, t * 0.5) * 30;
             
             const ctx = p.drawingContext as CanvasRenderingContext2D;
             const grad = ctx.createLinearGradient(x, 0, x + w*0.5, p.height);
             grad.addColorStop(0, `rgba(200, 240, 255, ${alpha * 0.002})`);
             grad.addColorStop(1, "rgba(0, 0, 0, 0)");
             
             ctx.fillStyle = grad;
             p.rect(x - w/2, 0, w, p.height);
         }
         p.pop();

         p.push();
         p.noStroke();
         p.fill(180, 255, 200, 100);
         plankton.current.forEach(pt => {
             pt.x += p.cos(t + pt.y * 0.01) * 0.2 * sf;
             pt.y += p.sin(t + pt.x * 0.01) * 0.2 * sf;
             if(pt.x < 0) pt.x = p.width;
             if(pt.x > p.width) pt.x = 0;
             if(pt.y < 0) pt.y = p.height;
             if(pt.y > p.height) pt.y = 0;
             p.circle(pt.x, pt.y, pt.size);
         });
         p.pop();

         p.push();
         p.stroke(255, 255, 255, 80);
         p.strokeWeight(1 * sf);
         p.noFill();
         bubbles.current.forEach(b => {
             b.y -= b.vy;
             b.x += p.sin(t * 3 + b.y * 0.02) * 1 * sf;
             if(b.y < -50) {
                 b.y = p.height + 50;
                 b.x = p.random(p.width);
             }
             p.circle(b.x, b.y, b.size);
             p.push();
             p.noStroke();
             p.fill(255, 255, 255, 120);
             p.circle(b.x + b.size * 0.25, b.y - b.size * 0.25, b.size * 0.25);
             p.pop();
         });
         p.pop();
      };

      const resetGame = (p: p5) => {
          const sf = scaleFactor.current;
          player.current.x = p.width / 2;
          player.current.y = p.height / 2;
          player.current.size = 20 * sf;
          player.current.vx = 0;
          player.current.vy = 0;
          player.current.speed = 0;
          
          scoreRef.current = 0;
          setScore(0);
          playerHealth.current = maxHealth;
          invulnTimer.current = 0;
          screenShake.current = 0;
          damageEffectVal.current = 0;
          
          enemies.current = [];
          
          lastSpawnTime.current = p.millis(); // Reset spawn timer
          
          particles.current = [];
          shockwaves.current = []; // Clear shockwaves
          
          plankton.current = [];
          for(let i=0; i<60; i++) {
              plankton.current.push({
                  x: p.random(p.width),
                  y: p.random(p.height),
                  size: p.random(1, 3) * sf,
                  vy: 0,
                  alpha: 255 
              });
          }
          
          bubbles.current = [];
          for(let i=0; i<15; i++) {
              bubbles.current.push({
                  x: p.random(p.width),
                  y: p.random(p.height),
                  size: p.random(4, 12) * sf,
                  vy: p.random(1, 3) * sf,
                  alpha: 255
              });
          }
      };
    };

    const p5Obj = new p5(sketch);
    p5Instance.current = p5Obj;

    return () => {
      p5Obj.remove();
    };
  }, [gameState, setScore, setGameState, setFinalSize, setCauseOfDeath, videoRef]);

  return (
    <div ref={containerRef} className="absolute inset-0 z-0" />
  );
};

export default FishGame;
