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

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number;
  alpha: number;
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

  username = "";
  password = "";
  rememberMe = true;
  showPassword = false;

  loading = false;
  authPhase = "AUTHENTICATING...";
  error = "";
  errorCode = "";
  success = false;

  // Live HUD telemetry
  liveTime = "";
  networkLatency = "12ms";
  quantumEntropy = 0;
  entropyLabel = "STANDBY";
  entropyColor = "#64748b";

  // 3D Card tilt state
  cardTransform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
  glareStyle = "radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.08), transparent 70%)";

  private animFrameId: number | null = null;
  private timeInterval: any = null;
  private resizeObserver: any = null;
  private particles: Particle[] = [];
  private mouse = { x: -1000, y: -1000, isHovering: false };
  private authPhaseInterval: any = null;

  constructor(public api: ApiService, private ngZone: NgZone) {}

  ngOnInit() {
    this.updateLiveTime();
    this.timeInterval = setInterval(() => this.updateLiveTime(), 1000);
    this.initCanvas();
  }

  ngOnDestroy() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
    }
    if (this.authPhaseInterval) {
      clearInterval(this.authPhaseInterval);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  updateLiveTime() {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const h = pad(now.getHours());
    const m = pad(now.getMinutes());
    const s = pad(now.getSeconds());
    this.liveTime = `${h}:${m}:${s}`;
  }

  onPasswordChange() {
    const p = this.password;
    if (!p) {
      this.quantumEntropy = 0;
      this.entropyLabel = "STANDBY";
      this.entropyColor = "#64748b";
      return;
    }

    let score = 0;
    if (p.length >= 6) score += 25;
    if (p.length >= 10) score += 25;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score += 20;
    if (/\d/.test(p)) score += 15;
    if (/[^A-Za-z0-9]/.test(p)) score += 15;

    this.quantumEntropy = Math.min(100, score);
    if (score < 40) {
      this.entropyLabel = "LOW ENTROPY";
      this.entropyColor = "#f43f5e";
    } else if (score < 70) {
      this.entropyLabel = "STANDARD CIPHER";
      this.entropyColor = "#06b6d4";
    } else {
      this.entropyLabel = "QUANTUM-RESISTANT";
      this.entropyColor = "#10b981";
    }
  }

  onMouseMoveCard(event: MouseEvent) {
    if (this.loading) return;
    const card = this.loginCardRef.nativeElement;
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -6;
    const rotateY = ((x - centerX) / centerX) * 6;

    this.cardTransform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.01, 1.01, 1.01)`;
    const glareX = (x / rect.width) * 100;
    const glareY = (y / rect.height) * 100;
    this.glareStyle = `radial-gradient(circle at ${glareX.toFixed(1)}% ${glareY.toFixed(1)}%, rgba(16, 185, 129, 0.15), transparent 60%)`;
  }

  onMouseLeaveCard() {
    this.cardTransform = "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
    this.glareStyle = "radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.08), transparent 70%)";
  }

  onSubmit() {
    if (!this.username.trim() || !this.password) {
      this.error = "ACCESS KEY REQUIRED: Identity & credential tokens missing.";
      this.errorCode = "ERR_AUTH_EMPTY";
      return;
    }

    this.loading = true;
    this.error = "";
    this.errorCode = "";
    this.startAuthSequence();

    this.api.login({
      username: this.username.trim(),
      password: this.password,
      remember_me: this.rememberMe
    }).subscribe({
      next: res => {
        this.authPhase = "ACCESS GRANTED // SYNCHRONIZING LEDGER...";
        this.success = true;
        setTimeout(() => {
          this.loading = false;
          if (this.authPhaseInterval) clearInterval(this.authPhaseInterval);
          this.api.setAuthToken(res.token);
          this.api.setCurrentUser(res.user);
          this.loggedIn.emit(res.user);
        }, 500);
      },
      error: err => {
        if (this.authPhaseInterval) clearInterval(this.authPhaseInterval);
        this.loading = false;
        this.success = false;
        this.error = err.error?.detail || "Access Denied: Quantum signature mismatch.";
        this.errorCode = "AUTH_FAILED_0x401";
      }
    });
  }

  private startAuthSequence() {
    const phases = [
      "ESTABLISHING QUANTUM-SECURE TUNNEL...",
      "VERIFYING CRYPTOGRAPHIC TOKEN SIGNATURE...",
      "COMPUTING PBKDF2-HMAC-SHA256 DIGEST...",
      "QUERYING DISTRIBUTED LEDGER NODES...",
      "INITIALIZING REAL-TIME TELEMETRY..."
    ];
    let idx = 0;
    this.authPhase = phases[0];
    this.authPhaseInterval = setInterval(() => {
      idx = (idx + 1) % phases.length;
      if (this.loading && !this.success) {
        this.authPhase = phases[idx];
      }
    }, 400);
  }

  // --- Neural Cyber Particle Canvas ---
  private initCanvas() {
    this.ngZone.runOutsideAngular(() => {
      const canvas = this.canvasRef.nativeElement;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const setSize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        this.generateParticles(canvas.width, canvas.height);
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

      const render = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.drawCanvas(ctx, canvas.width, canvas.height);
        this.animFrameId = requestAnimationFrame(render);
      };

      this.animFrameId = requestAnimationFrame(render);
    });
  }

  private generateParticles(w: number, h: number) {
    const count = Math.min(80, Math.floor((w * h) / 18000));
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius: Math.random() * 2 + 1,
        hue: Math.random() > 0.6 ? 160 : Math.random() > 0.3 ? 190 : 270,
        alpha: Math.random() * 0.5 + 0.3
      });
    }
  }

  private drawCanvas(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const pLen = this.particles.length;

    // Draw connecting laser vectors
    for (let i = 0; i < pLen; i++) {
      const p1 = this.particles[i];

      p1.x += p1.vx;
      p1.y += p1.vy;

      if (p1.x < 0) p1.x = w;
      if (p1.x > w) p1.x = 0;
      if (p1.y < 0) p1.y = h;
      if (p1.y > h) p1.y = 0;

      // Mouse interactive gravitational beam
      if (this.mouse.isHovering) {
        const dx = this.mouse.x - p1.x;
        const dy = this.mouse.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(this.mouse.x, this.mouse.y);
          ctx.strokeStyle = `rgba(16, 185, 129, ${(1 - dist / 150) * 0.6})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      for (let j = i + 1; j < pLen; j++) {
        const p2 = this.particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 120) {
          const alpha = (1 - dist / 120) * 0.25;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(6, 182, 212, ${alpha})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }

      // Draw particle node
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, p1.radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p1.hue}, 90%, 65%, ${p1.alpha})`;
      ctx.shadowColor = `hsla(${p1.hue}, 90%, 65%, 0.8)`;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}
