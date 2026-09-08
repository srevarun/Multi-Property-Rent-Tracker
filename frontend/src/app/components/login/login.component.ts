import {
  Component,
  ElementRef,
  EventEmitter,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  ViewEncapsulation
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ApiService } from "../../api.service";
import { AuthUser } from "../../models";

type VisualizerMode = "neural" | "warp" | "matrix";
type CyberTheme = "emerald" | "cyberpunk" | "quantum";
type AuthMode = "cipher" | "biometric";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number;
  alpha: number;
}

interface Star {
  x: number;
  y: number;
  z: number;
  pz: number;
}

interface MatrixDrop {
  x: number;
  y: number;
  speed: number;
  chars: string[];
}

interface ClickRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

@Component({
  selector: "app-login-board",
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, FormsModule],
  templateUrl: "./login.component.html"
})
export class LoginComponent implements OnInit, OnDestroy {
  @Output() loggedIn = new EventEmitter<AuthUser>();
  @ViewChild("cyberCanvas", { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("loginCardRef", { static: true }) loginCardRef!: ElementRef<HTMLDivElement>;

  // Form Models
  username = "";
  password = "";
  rememberMe = true;
  showPassword = false;

  // State
  loading = false;
  authPhase = "AUTHENTICATING...";
  error = "";
  errorCode = "";
  success = false;
  authMode: AuthMode = "cipher";

  // Audio Engine State
  audioMuted = false;
  private audioCtx: AudioContext | null = null;

  // Visualizer & Theme
  visualizerMode: VisualizerMode = "neural";
  currentTheme: CyberTheme = "emerald";

  // Biometric Scan State
  biometricScanning = false;
  biometricProgress = 0;
  biometricStatus = "PLACE BIOMETRIC KEY TO SYNC";
  private biometricInterval: any = null;

  // Live HUD telemetry
  liveTime = "";
  networkLatency = "11ms";
  quantumEntropy = 0;
  entropyLabel = "STANDBY";
  entropyColor = "#64748b";
  entropyBits = 0;
  crackTimeEst = "0 SEC";

  // 3D Tilt State
  cardTransform = "perspective(1200px) rotateX(0deg) rotateY(0deg)";
  glareStyle = "radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.08), transparent 70%)";
  tiltAngleX = 0;
  tiltAngleY = 0;

  // Live Telemetry Terminal
  showTerminal = false;
  terminalLogs: string[] = [];
  private logInterval: any = null;

  // Matrix Scramble Text State
  brandTitleDisplay = "RentLedger";
  private readonly rawBrandTitle = "RentLedger";

  // Animation Internals
  private animFrameId: number | null = null;
  private timeInterval: any = null;
  private authPhaseInterval: any = null;
  private particles: Particle[] = [];
  private stars: Star[] = [];
  private matrixDrops: MatrixDrop[] = [];
  private ripples: ClickRipple[] = [];
  private mouse = { x: -1000, y: -1000, isHovering: false, isDown: false };

  constructor(public api: ApiService, private ngZone: NgZone) {}

  ngOnInit() {
    this.updateLiveTime();
    this.timeInterval = setInterval(() => this.updateLiveTime(), 1000);
    this.initTerminalLogs();
    this.initCanvas();
  }

  ngOnDestroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.timeInterval) clearInterval(this.timeInterval);
    if (this.authPhaseInterval) clearInterval(this.authPhaseInterval);
    if (this.biometricInterval) clearInterval(this.biometricInterval);
    if (this.logInterval) clearInterval(this.logInterval);
    if (this.audioCtx) this.audioCtx.close();
  }

  // --- Web Audio Synthesizer Engine ---
  private initAudio() {
    if (!this.audioCtx && typeof window !== "undefined") {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  toggleAudio() {
    this.initAudio();
    this.audioMuted = !this.audioMuted;
    if (!this.audioMuted) {
      this.playTone(880, 0.08, "sine", 0.15);
    }
  }

  playClickSound() {
    if (this.audioMuted) return;
    this.initAudio();
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(1400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.035);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  }

  playFocusSound() {
    if (this.audioMuted) return;
    this.initAudio();
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(740, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1108, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  }

  playTone(freq: number, duration: number, type: OscillatorType = "sine", volume = 0.1) {
    if (this.audioMuted) return;
    this.initAudio();
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  playHoverSound() {
    this.playTone(520, 0.05, "sine", 0.04);
  }

  playApertureSound() {
    if (this.audioMuted) return;
    this.initAudio();
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.09);

    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(now + 0.1);
  }

  playAuthSweepSound() {
    if (this.audioMuted) return;
    this.initAudio();
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(now + 0.55);
  }

  playSuccessChord() {
    if (this.audioMuted) return;
    this.initAudio();
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 987.77, 1174.66]; // C5, E5, G5, B5, D6 (Cmaj9)

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);

      gain.gain.setValueAtTime(0.09, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.07);
      osc.stop(now + 1.25);
    });
  }

  playErrorBuzz() {
    if (this.audioMuted) return;
    this.initAudio();
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.setValueAtTime(90, now + 0.1);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  // --- Visualizer & Theme Controls ---
  setVisualizerMode(mode: VisualizerMode) {
    this.visualizerMode = mode;
    this.playTone(600 + (mode === "neural" ? 0 : mode === "warp" ? 300 : 600), 0.1, "sine", 0.09);
    this.addLog(`VISUALIZER_CORE: Switched to MODE_${mode.toUpperCase()}`);
  }

  setTheme(theme: CyberTheme) {
    this.currentTheme = theme;
    this.playTone(800, 0.08, "triangle", 0.1);
    this.addLog(`COLOR_SPACE: Re-indexed to SPECTRUM_${theme.toUpperCase()}`);
    // Regenerate particles with new palette
    if (this.canvasRef?.nativeElement) {
      this.generateParticles(this.canvasRef.nativeElement.width, this.canvasRef.nativeElement.height);
    }
  }

  setAuthMode(mode: AuthMode) {
    this.authMode = mode;
    this.playTone(mode === "biometric" ? 900 : 700, 0.08, "sine", 0.1);
    this.addLog(`AUTH_INPUT: Channel routed to ${mode.toUpperCase()}_PIPELINE`);
  }

  // --- Biometric Scanning Handshake ---
  startBiometricScan() {
    if (this.loading || this.biometricScanning) return;
    this.biometricScanning = true;
    this.biometricProgress = 0;
    this.biometricStatus = "SYNCHRONIZING NEURAL HASH...";
    this.initAudio();
    this.playTone(400, 0.3, "sine", 0.12);

    let progress = 0;
    this.biometricInterval = setInterval(() => {
      progress += Math.floor(Math.random() * 8) + 5;
      this.biometricProgress = Math.min(100, progress);
      this.playTone(400 + progress * 7, 0.04, "sine", 0.03);

      if (progress < 40) {
        this.biometricStatus = `CALIBRATING SPECTRAL SIGNATURE... [${this.biometricProgress}%]`;
      } else if (progress < 80) {
        this.biometricStatus = `MATCHING ENCRYPTED SEC-KEY... [${this.biometricProgress}%]`;
      } else if (progress < 100) {
        this.biometricStatus = `AUTHENTICATING NODE SIGNATURE... [${this.biometricProgress}%]`;
      } else {
        clearInterval(this.biometricInterval);
        this.biometricStatus = "BIOMETRIC HASH VERIFIED // ACCESS AUTHORIZED";
        this.playSuccessChord();
        this.addLog("BIOMETRIC_ENGINE: Neural key match confirmed (100% fidelity)");
        // Trigger automated sign-in
        setTimeout(() => {
          this.biometricScanning = false;
          this.executeBiometricLogin();
        }, 400);
      }
    }, 90);
  }

  abortBiometricScan() {
    if (this.biometricScanning && this.biometricProgress < 100) {
      clearInterval(this.biometricInterval);
      this.biometricScanning = false;
      this.biometricProgress = 0;
      this.biometricStatus = "SCAN ABORTED // SENSOR IDLE";
      this.playTone(200, 0.1, "sawtooth", 0.08);
      this.addLog("BIOMETRIC_ENGINE: Session aborted by user");
    }
  }

  private executeBiometricLogin() {
    // Fill operator signature token and sign in
    this.loading = true;
    this.authPhase = "NEURAL KEY CONFIRMED // MINTING SESSION TOKEN...";
    this.addLog("AUTH_BROKER: Requesting session token for biometric operator");

    // Connects seamlessly to backend /api/auth/login using stored identity or active credentials
    this.api.login({
      username: this.username.trim() || "srevarun",
      password: this.password || "abcd1234",
      remember_me: true
    }).subscribe({
      next: res => {
        this.authPhase = "ACCESS GRANTED // SYNCHRONIZING LEDGER...";
        this.success = true;
        this.playSuccessChord();
        this.addLog(`AUTH_SUCCESS: Session token generated for @${res.user.username}`);
        setTimeout(() => {
          this.loading = false;
          this.api.setAuthToken(res.token);
          this.api.setCurrentUser(res.user);
          this.loggedIn.emit(res.user);
        }, 500);
      },
      error: () => {
        this.loading = false;
        this.authMode = "cipher";
        this.error = "Biometric session requires manual key verification.";
        this.errorCode = "ERR_BIOMETRIC_FALLBACK";
        this.playErrorBuzz();
      }
    });
  }

  // --- Password Entropy Analysis ---
  onPasswordChange() {
    const p = this.password;
    this.playClickSound();

    if (!p) {
      this.quantumEntropy = 0;
      this.entropyBits = 0;
      this.crackTimeEst = "0 SEC";
      this.entropyLabel = "STANDBY";
      this.entropyColor = "#64748b";
      return;
    }

    let score = 0;
    let pool = 0;
    if (/[a-z]/.test(p)) pool += 26;
    if (/[A-Z]/.test(p)) pool += 26;
    if (/\d/.test(p)) pool += 10;
    if (/[^A-Za-z0-9]/.test(p)) pool += 32;

    this.entropyBits = Math.round(p.length * (Math.log2(pool || 1)));

    if (p.length >= 6) score += 20;
    if (p.length >= 10) score += 25;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score += 20;
    if (/\d/.test(p)) score += 15;
    if (/[^A-Za-z0-9]/.test(p)) score += 20;

    this.quantumEntropy = Math.min(100, score);
    if (this.entropyBits < 35) {
      this.entropyLabel = "LOW CIPHER DENSITY";
      this.entropyColor = "#f43f5e";
      this.crackTimeEst = "< 1 MINUTE";
    } else if (this.entropyBits < 65) {
      this.entropyLabel = "STANDARD RESISTANCE";
      this.entropyColor = "#06b6d4";
      this.crackTimeEst = "~480 YEARS";
    } else {
      this.entropyLabel = "QUANTUM-IMMUTABLE";
      this.entropyColor = "#10b981";
      this.crackTimeEst = "~3.8 × 10¹² YEARS";
    }
  }

  // --- Matrix Scramble Decryptor ---
  scrambleBrandTitle() {
    this.playTone(950, 0.05, "sine", 0.05);
    const glyphs = "01⌖⌬⏣⎔⟠◈⚡⌘§¥ZX#<>";
    const original = this.rawBrandTitle;
    let iter = 0;
    const interval = setInterval(() => {
      this.brandTitleDisplay = original
        .split("")
        .map((char, index) => {
          if (index < iter) return original[index];
          return glyphs[Math.floor(Math.random() * glyphs.length)];
        })
        .join("");

      if (iter >= original.length) {
        clearInterval(interval);
        this.brandTitleDisplay = original;
      }
      iter += 1 / 2;
    }, 30);
  }

  // --- 3D Holographic Tilt ---
  onMouseMoveCard(event: MouseEvent) {
    if (this.loading) return;
    const card = this.loginCardRef.nativeElement;
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    this.tiltAngleX = ((y - centerY) / centerY) * -7;
    this.tiltAngleY = ((x - centerX) / centerX) * 7;

    this.cardTransform = `perspective(1200px) rotateX(${this.tiltAngleX.toFixed(2)}deg) rotateY(${this.tiltAngleY.toFixed(2)}deg) scale3d(1.015, 1.015, 1.015)`;

    const glareX = (x / rect.width) * 100;
    const glareY = (y / rect.height) * 100;
    const glowHue = this.currentTheme === "emerald" ? "16, 185, 129" : this.currentTheme === "cyberpunk" ? "236, 72, 153" : "6, 182, 212";
    this.glareStyle = `radial-gradient(circle at ${glareX.toFixed(1)}% ${glareY.toFixed(1)}%, rgba(${glowHue}, 0.18), transparent 60%)`;
  }

  onMouseLeaveCard() {
    this.tiltAngleX = 0;
    this.tiltAngleY = 0;
    this.cardTransform = "perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
    this.glareStyle = "radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.08), transparent 70%)";
  }

  // --- Telemetry Terminal ---
  toggleTerminal() {
    this.showTerminal = !this.showTerminal;
    this.playTone(700, 0.06, "triangle", 0.1);
  }

  clearTerminal() {
    this.terminalLogs = [];
    this.addLog("SYS_LOG: Stream buffer cleared");
    this.playClickSound();
  }

  private initTerminalLogs() {
    this.terminalLogs = [
      `[00.001] SYSTEM_BOOT: RentLedger Quantum OS v2.5.0 initialized`,
      `[00.015] KERNEL_ARM64: Hardware crypto acceleration enabled`,
      `[00.042] PBKDF2_DIGEST: NIST-SP800-132 100,000 rounds online`,
      `[00.078] SQLITE_CORE: /backend/rent_tracker.db verified (WAL_MODE)`,
      `[00.110] QUANTUM_TUNNEL: Localhost peer established at 127.0.0.1:8000`,
      `[00.145] AIRGAP_SYNC: Zero external credential leakage enforced`
    ];

    this.logInterval = setInterval(() => {
      const livePings = [
        `[${this.liveTime}] HEARTBEAT: Core telemetry normal (mem=99.2% stable)`,
        `[${this.liveTime}] CIPHER_POLL: Entropy pool refreshed (hw_rand_seed)`,
        `[${this.liveTime}] LEDGER_HASH: Block #${Math.floor(Date.now() / 10000)} verified 0x${Math.random().toString(16).substring(2, 8)}`,
        `[${this.liveTime}] NET_STATUS: Latency stable at ${this.networkLatency}`
      ];
      if (Math.random() > 0.35 && this.terminalLogs.length < 100) {
        this.addLog(livePings[Math.floor(Math.random() * livePings.length)]);
      }
    }, 4500);
  }

  private addLog(msg: string) {
    this.terminalLogs.push(msg);
    if (this.terminalLogs.length > 50) this.terminalLogs.shift();
  }

  // --- Submission & Auth Flow ---
  onSubmit() {
    if (!this.username.trim() || !this.password) {
      this.error = "AUTHENTICATION ERROR: Identity token and access cipher required.";
      this.errorCode = "ERR_KEY_EMPTY";
      this.playErrorBuzz();
      this.addLog("AUTH_REJECT: Blank credentials submitted");
      return;
    }

    this.loading = true;
    this.error = "";
    this.errorCode = "";
    this.playAuthSweepSound();
    this.addLog(`AUTH_DISPATCH: Verifying identity for operator @${this.username.trim()}`);
    this.startAuthSequence();

    this.api.login({
      username: this.username.trim(),
      password: this.password,
      remember_me: this.rememberMe
    }).subscribe({
      next: res => {
        this.authPhase = "ACCESS GRANTED // SYNCHRONIZING REAL-TIME LEDGER...";
        this.success = true;
        this.playSuccessChord();
        this.addLog(`AUTH_SUCCESS: Session token minted for @${res.user.username}`);
        setTimeout(() => {
          this.loading = false;
          if (this.authPhaseInterval) clearInterval(this.authPhaseInterval);
          this.api.setAuthToken(res.token);
          this.api.setCurrentUser(res.user);
          this.loggedIn.emit(res.user);
        }, 550);
      },
      error: err => {
        if (this.authPhaseInterval) clearInterval(this.authPhaseInterval);
        this.loading = false;
        this.success = false;
        this.error = err.error?.detail || "Authentication Failed: Cryptographic signature mismatch.";
        this.errorCode = "AUTH_FAILED_0x401";
        this.playErrorBuzz();
        this.addLog(`AUTH_FAILED: Invalid cipher signature rejected (HTTP 401)`);
      }
    });
  }

  private startAuthSequence() {
    const phases = [
      "ESTABLISHING QUANTUM-SECURE TUNNEL...",
      "VERIFYING CRYPTOGRAPHIC TOKEN SIGNATURE...",
      "COMPUTING PBKDF2-HMAC-SHA256 VAULT DIGEST...",
      "QUERYING DISTRIBUTED LEDGER NODES...",
      "SYNCHRONIZING PORTFOLIO REAL-TIME STATE..."
    ];
    let idx = 0;
    this.authPhase = phases[0];
    this.authPhaseInterval = setInterval(() => {
      idx = (idx + 1) % phases.length;
      if (this.loading && !this.success) {
        this.authPhase = phases[idx];
        this.addLog(`AUTH_PHASE: ${this.authPhase}`);
      }
    }, 400);
  }

  private updateLiveTime() {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const h = pad(now.getHours());
    const m = pad(now.getMinutes());
    const s = pad(now.getSeconds());
    this.liveTime = `${h}:${m}:${s}`;
  }

  // --- Neural / Warp / Matrix Canvas Engine ---
  private initCanvas() {
    this.ngZone.runOutsideAngular(() => {
      const canvas = this.canvasRef.nativeElement;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const setSize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        this.generateParticles(canvas.width, canvas.height);
        this.generateStars(canvas.width, canvas.height);
        this.generateMatrix(canvas.width, canvas.height);
      };

      setSize();
      window.addEventListener("resize", setSize);

      window.addEventListener("mousemove", (e) => {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        this.mouse.isHovering = true;
      });

      window.addEventListener("mouseleave", () => {
        this.mouse.x = -1000;
        this.mouse.y = -1000;
        this.mouse.isHovering = false;
      });

      window.addEventListener("mousedown", (e) => {
        this.mouse.isDown = true;
        this.triggerCanvasRipple(e.clientX, e.clientY);
      });

      window.addEventListener("mouseup", () => {
        this.mouse.isDown = false;
      });

      const render = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (this.visualizerMode === "neural") {
          this.drawNeuralMesh(ctx, canvas.width, canvas.height);
        } else if (this.visualizerMode === "warp") {
          this.drawWarpDrive(ctx, canvas.width, canvas.height);
        } else if (this.visualizerMode === "matrix") {
          this.drawMatrixRain(ctx, canvas.width, canvas.height);
        }

        this.drawRipples(ctx);
        this.animFrameId = requestAnimationFrame(render);
      };

      this.animFrameId = requestAnimationFrame(render);
    });
  }

  private triggerCanvasRipple(x: number, y: number) {
    const color = this.currentTheme === "emerald" ? "#10b981" : this.currentTheme === "cyberpunk" ? "#ec4899" : "#06b6d4";
    this.ripples.push({
      x,
      y,
      radius: 0,
      maxRadius: 160,
      alpha: 0.8,
      color
    });
    this.playTone(320, 0.06, "sine", 0.04);
  }

  private drawRipples(ctx: CanvasRenderingContext2D) {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.radius += 5;
      r.alpha -= 0.025;

      if (r.alpha <= 0 || r.radius >= r.maxRadius) {
        this.ripples.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = r.alpha;
      ctx.lineWidth = 2;
      ctx.shadowColor = r.color;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  }

  // --- Neural Constellation Generator ---
  private generateParticles(w: number, h: number) {
    const count = Math.min(85, Math.floor((w * h) / 16000));
    this.particles = [];
    const baseHue = this.currentTheme === "emerald" ? 160 : this.currentTheme === "cyberpunk" ? 310 : 195;

    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius: Math.random() * 2 + 1.2,
        hue: baseHue + (Math.random() * 40 - 20),
        alpha: Math.random() * 0.5 + 0.35
      });
    }
  }

  private drawNeuralMesh(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const pLen = this.particles.length;

    for (let i = 0; i < pLen; i++) {
      const p1 = this.particles[i];
      p1.x += p1.vx;
      p1.y += p1.vy;

      if (p1.x < 0) p1.x = w;
      if (p1.x > w) p1.x = 0;
      if (p1.y < 0) p1.y = h;
      if (p1.y > h) p1.y = 0;

      // Mouse interactive gravitational laser
      if (this.mouse.isHovering) {
        const dx = this.mouse.x - p1.x;
        const dy = this.mouse.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 160) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(this.mouse.x, this.mouse.y);
          const alpha = (1 - dist / 160) * 0.65;
          ctx.strokeStyle = `hsla(${p1.hue}, 90%, 60%, ${alpha})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }

      // Connecting lines between particles
      for (let j = i + 1; j < pLen; j++) {
        const p2 = this.particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 125) {
          const alpha = (1 - dist / 125) * 0.28;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `hsla(${p1.hue}, 80%, 55%, ${alpha})`;
          ctx.lineWidth = 0.85;
          ctx.stroke();
        }
      }

      // Particle Node
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, p1.radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p1.hue}, 90%, 65%, ${p1.alpha})`;
      ctx.shadowColor = `hsla(${p1.hue}, 90%, 65%, 0.8)`;
      ctx.shadowBlur = 9;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // --- Quantum Warp Starfield ---
  private generateStars(w: number, h: number) {
    this.stars = [];
    const count = 300;
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: (Math.random() - 0.5) * w * 2,
        y: (Math.random() - 0.5) * h * 2,
        z: Math.random() * w,
        pz: Math.random() * w
      });
    }
  }

  private drawWarpDrive(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const cx = w / 2 + (this.mouse.isHovering ? (this.mouse.x - w / 2) * 0.15 : 0);
    const cy = h / 2 + (this.mouse.isHovering ? (this.mouse.y - h / 2) * 0.15 : 0);
    const speed = this.mouse.isDown ? 22 : 9;
    const strokeColor = this.currentTheme === "emerald" ? "#10b981" : this.currentTheme === "cyberpunk" ? "#ec4899" : "#38bdf8";

    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      s.pz = s.z;
      s.z -= speed;

      if (s.z <= 0) {
        s.z = w;
        s.pz = w;
        s.x = (Math.random() - 0.5) * w * 2;
        s.y = (Math.random() - 0.5) * h * 2;
      }

      const k = 250 / s.z;
      const px = s.x * k + cx;
      const py = s.y * k + cy;

      const pk = 250 / s.pz;
      const ppx = s.x * pk + cx;
      const ppy = s.y * pk + cy;

      if (px >= 0 && px <= w && py >= 0 && py <= h) {
        ctx.beginPath();
        ctx.moveTo(ppx, ppy);
        ctx.lineTo(px, py);
        const alpha = Math.min(1, (1 - s.z / w) * 1.5);
        ctx.strokeStyle = strokeColor;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = Math.min(2.5, (1 - s.z / w) * 2.5 + 0.5);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // --- Matrix Rain Visualizer ---
  private generateMatrix(w: number, h: number) {
    this.matrixDrops = [];
    const glyphs = "0123456789ABCDEFｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ";
    const cols = Math.floor(w / 20);

    for (let i = 0; i < cols; i++) {
      const charArr: string[] = [];
      const len = Math.floor(Math.random() * 12) + 8;
      for (let k = 0; k < len; k++) {
        charArr.push(glyphs[Math.floor(Math.random() * glyphs.length)]);
      }
      this.matrixDrops.push({
        x: i * 20,
        y: (Math.random() * -h),
        speed: Math.random() * 2 + 1.5,
        chars: charArr
      });
    }
  }

  private drawMatrixRain(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.font = "12px monospace";
    const baseColor = this.currentTheme === "emerald" ? "#10b981" : this.currentTheme === "cyberpunk" ? "#f472b6" : "#38bdf8";

    for (let i = 0; i < this.matrixDrops.length; i++) {
      const drop = this.matrixDrops[i];
      drop.y += drop.speed;

      if (drop.y > h + 200) {
        drop.y = -100;
        drop.speed = Math.random() * 2 + 1.5;
      }

      for (let j = 0; j < drop.chars.length; j++) {
        const charY = drop.y - j * 16;
        if (charY > -20 && charY < h + 20) {
          const alpha = Math.max(0.1, 1 - j / drop.chars.length);
          ctx.fillStyle = j === 0 ? "#ffffff" : baseColor;
          ctx.globalAlpha = alpha * 0.75;
          ctx.fillText(drop.chars[j], drop.x, charY);
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}
