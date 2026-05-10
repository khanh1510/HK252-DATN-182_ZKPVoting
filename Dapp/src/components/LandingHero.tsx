import { useRef, useMemo, useEffect, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import gsap from 'gsap'
import { useWalletCtx } from '@/context/WalletContext'

// ─── Config ───────────────────────────────────────────────────────────────────
const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth < 768
const COUNT     = IS_MOBILE ? 180 : 420
const SPREAD_X  = 22.0
const SPREAD_Y  = 13.0
const DAMP      = 0.88
const SPRING    = 0.015   // return to origin
const RING_R    = 2.0     // orbit radius around cursor
const ATTRACT   = 0.055   // spring toward orbit ring
const ATTRACT_ZONE = 3.5  // distance within which particles orbit
const FLOAT_SPD = 0.00090 // idle drift amplitude

const PALETTE = [
  [0.259, 0.522, 0.957],
  [0.486, 0.231, 0.929],
  [0.031, 0.569, 0.698],
  [0.925, 0.286, 0.600],
  [0.204, 0.659, 0.322],
  [0.918, 0.263, 0.208],
]

// ─── Shaders — smooth circle ──────────────────────────────────────────────────
const VERT = /* glsl */`
  attribute float aSize;
  attribute vec3  aColor;
  varying   vec3  vColor;

  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (3.8 / -mv.z);
    gl_Position  = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */`
  varying vec3 vColor;

  void main() {
    vec2  uv = gl_PointCoord - 0.5;
    float d  = length(uv);
    if (d > 0.5) discard;
    // soft edge glow
    float a = smoothstep(0.5, 0.18, d) * 0.82;
    gl_FragColor = vec4(vColor, a);
  }
`

// ─── Particle System ──────────────────────────────────────────────────────────
function Particles({ scroll }: { scroll: number }) {
  const { camera } = useThree()
  const ref   = useRef<THREE.Points>(null!)
  const mouse = useRef({ x: 1e4, y: 1e4, active: false })
  const vel   = useRef(new Float32Array(COUNT * 2))
  const phase = useRef(new Float32Array(COUNT)) // unique float phase per particle

  const { geometry, material, origins } = useMemo(() => {
    const pos  = new Float32Array(COUNT * 3)
    const orig = new Float32Array(COUNT * 3)
    const col  = new Float32Array(COUNT * 3)
    const sz   = new Float32Array(COUNT)
    const ph   = phase.current

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3
      const x  = (Math.random() - 0.5) * SPREAD_X
      const y  = (Math.random() - 0.5) * SPREAD_Y
      const z  = (Math.random() - 0.5) * 1.2

      pos[i3]     = orig[i3]     = x
      pos[i3 + 1] = orig[i3 + 1] = y
      pos[i3 + 2] = orig[i3 + 2] = z

      const p = PALETTE[Math.floor(Math.random() * PALETTE.length)]
      const b = 0.72 + Math.random() * 0.28
      col[i3]     = p[0] * b
      col[i3 + 1] = p[1] * b
      col[i3 + 2] = p[2] * b

      sz[i]  = IS_MOBILE ? (4 + Math.random() * 6) : (5 + Math.random() * 9)
      ph[i]  = Math.random() * Math.PI * 2
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos,  3))
    geo.setAttribute('aColor',   new THREE.BufferAttribute(col,  3))
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sz,   1))

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
      blending: THREE.NormalBlending,
    })

    return { geometry: geo, material: mat, origins: orig }
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const nx =  (e.clientX / window.innerWidth)  * 2 - 1
      const ny = -(e.clientY / window.innerHeight) * 2 + 1
      const cam = camera as THREE.PerspectiveCamera
      const v   = new THREE.Vector3(nx, ny, 0.5).unproject(cam)
      const dir = v.sub(cam.position).normalize()
      const t   = -cam.position.z / dir.z
      mouse.current.x = cam.position.x + dir.x * t
      mouse.current.y = cam.position.y + dir.y * t
      mouse.current.active = true
    }
    const onLeave = () => { mouse.current = { x: 1e4, y: 1e4, active: false } }
    window.addEventListener('mousemove', onMove,  { passive: true })
    window.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseleave', onLeave)
    }
  }, [camera])

  useFrame((state) => {
    if (!ref.current) return
    const posAttr = ref.current.geometry.attributes.position
    const pos = posAttr.array as Float32Array
    const v   = vel.current
    const o   = origins
    const ph  = phase.current
    const t   = state.clock.elapsedTime
    const mx  = mouse.current.x
    const my  = mouse.current.y

    for (let i = 0; i < COUNT; i++) {
      const i3  = i * 3
      const iv  = i * 2
      const px  = pos[i3]
      const py  = pos[i3 + 1]

      // ── Idle organic float (always on, unique per particle) ────────────
      const floatX = Math.sin(t * 0.31 + ph[i])       * FLOAT_SPD
      const floatY = Math.cos(t * 0.23 + ph[i] * 1.7) * FLOAT_SPD
      v[iv]     += floatX
      v[iv + 1] += floatY

      // ── Mouse orbit ring ───────────────────────────────────────────────
      const dx   = px - mx
      const dy   = py - my
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < ATTRACT_ZONE && dist > 0.001) {
        // Target = point on ring in direction of particle from mouse
        const tx = mx + (dx / dist) * RING_R
        const ty = my + (dy / dist) * RING_R

        // Spring toward that target point
        const blend = Math.max(0, 1 - dist / ATTRACT_ZONE) // 0→1 as dist→0
        v[iv]     += (tx - px) * ATTRACT * blend
        v[iv + 1] += (ty - py) * ATTRACT * blend
      } else {
        // Outside orbit zone: spring gently back to origin
        v[iv]     += (o[i3]     - px) * SPRING
        v[iv + 1] += (o[i3 + 1] - py) * SPRING
      }

      // ── Integrate ─────────────────────────────────────────────────────
      v[iv]     *= DAMP
      v[iv + 1] *= DAMP
      pos[i3]     += v[iv]
      pos[i3 + 1] += v[iv + 1]
    }

    posAttr.needsUpdate = true

    const tz = 5.5 + scroll * 2.5
    camera.position.z += (tz - camera.position.z) * 0.04
  })

  return <points ref={ref} geometry={geometry} material={material} />
}

// ─── Content ──────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    color: '#4285F4',
    title: 'Voter Privacy by Design',
    desc: 'Each ballot is shielded behind a Poseidon commitment. No admin, no auditor, no one can trace a vote back to its sender — the math won\'t allow it.',
  },
  {
    color: '#7C3AED',
    title: 'Proof Generated in Your Browser',
    desc: 'Zero-knowledge proofs are computed locally using WebAssembly. Your candidateIndex never leaves your device — not even to our servers.',
  },
  {
    color: '#0891B2',
    title: 'On-Chain Tally, Publicly Auditable',
    desc: 'Every vote count happens inside a smart contract. Anyone can verify the final result independently — no external auditor, no trust required.',
  },
  {
    color: '#34A853',
    title: 'Flexible Eligibility Models',
    desc: 'Run open DAO-style elections or restrict participation with EIP-712 admin approvals. One platform, two governance models.',
  },
]

const STEPS = [
  {
    n: '01', accent: '#4285F4',
    title: 'Create an Election',
    desc: 'Define your proposal, add candidates, set registration and voting deadlines, choose open or whitelisted access — then deploy in one transaction.',
  },
  {
    n: '02', accent: '#7C3AED',
    title: 'Voters Register',
    desc: 'Each eligible participant generates a cryptographic keypair in their browser and submits a Merkle commitment to the on-chain voter registry.',
  },
  {
    n: '03', accent: '#0891B2',
    title: 'Anonymous Ballots Cast',
    desc: 'Voters select a candidate, generate a Groth16 ZK proof locally (~10 s), and submit an anonymous, verifiable ballot to the smart contract.',
  },
  {
    n: '04', accent: '#34A853',
    title: 'Reveal & Certify Results',
    desc: 'After the voting window closes, ballots are revealed and tallied on-chain. Results are immutable, transparent, and instantly verifiable by anyone.',
  },
]

const CLIENTS = ['DAO Governance', 'Corporate Boards', 'University Councils', 'NGO Elections', 'Community Polls']

// ─── Animated inbox (Antigravity-style) ──────────────────────────────────────
const INBOX_H  = 560   // fixed container height
const INBOX_G  = 8     // gap between cards
const N_STEPS  = 4

// Card height shrinks as more cards fill the container
const cardH = (n: number) => Math.floor((INBOX_H - (n - 1) * INBOX_G) / n)
const cardY = (i: number, n: number) => i * (cardH(n) + INBOX_G)

// Font sizes scale down as cards shrink
const titleSize = (n: number) => n === 1 ? 22 : n === 2 ? 17 : 14
const descSize  = (n: number) => n === 1 ? 15 : n === 2 ? 13 : 12
const badgeSize = (n: number) => n === 1 ? 48 : n === 2 ? 40 : 34

function AnimatedInbox() {
  const [visible,   setVisible]   = useState(0)
  const [entering,  setEntering]  = useState(-1)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    let cancelled = false
    const ids: ReturnType<typeof setTimeout>[] = []

    const after = (fn: () => void, ms: number) => {
      const id = setTimeout(() => { if (!cancelled) fn() }, ms)
      ids.push(id)
    }

    const runCycle = () => {
      setResetting(false)
      setVisible(0)
      setEntering(-1)

      STEPS.forEach((_, i) => {
        after(() => {
          setEntering(i)
          setVisible(i + 1)
          after(() => setEntering(-1), 60)
        }, 300 + i * 900)
      })

      const doneAt = 300 + (N_STEPS - 1) * 900 + 700 + 5000
      after(() => {
        setResetting(true)
        after(runCycle, 650)
      }, doneAt)
    }

    runCycle()
    return () => { cancelled = true; ids.forEach(clearTimeout) }
  }, [])

  return (
    <div style={{
      borderRadius: 22,
      background: 'linear-gradient(135deg,#f5f0ff 0%,#fdf0ff 35%,#e8f4ff 70%,#f0fdf4 100%)',
      padding: 14,
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, paddingLeft:4 }}>
        <span style={{ fontSize:14, fontWeight:700, color:'#64748b', letterSpacing:'-.01em' }}>Steps</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="#94a3b8" strokeWidth="2"/>
          <path d="M21 21l-4-4" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Cards area — fixed height */}
      <div style={{ position:'relative', height: INBOX_H, overflow:'hidden' }}>
        {STEPS.slice(0, visible).map((step, i) => {
          const h   = cardH(visible)
          const top = cardY(i, visible)
          const isIn = entering === i
          return (
            <div key={i} style={{
              position:  'absolute',
              left: 0, right: 0,
              top,
              height:    h,
              transform: `translateX(${isIn ? '115%' : '0%'})`,
              opacity:   resetting ? 0 : 1,
              transition: [
                'transform 0.52s cubic-bezier(0.34,1.08,0.64,1)',
                'top 0.50s cubic-bezier(0.4,0,0.2,1)',
                'height 0.50s cubic-bezier(0.4,0,0.2,1)',
                'opacity 0.45s ease',
              ].join(', '),
            }}>
              {/* Card */}
              <div style={{
                height: '100%', boxSizing: 'border-box',
                background: '#fff',
                borderRadius: 14,
                padding: visible === 1 ? '24px 24px' : visible === 2 ? '16px 20px' : '12px 16px',
                display: 'flex', alignItems: 'center', gap: 16,
                boxShadow: '0 1px 4px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
                overflow: 'hidden',
              }}>
                {/* Badge */}
                <div style={{
                  flexShrink: 0,
                  width:  badgeSize(visible),
                  height: badgeSize(visible),
                  borderRadius: visible === 1 ? 14 : 10,
                  background: `${step.accent}18`,
                  border: `1.5px solid ${step.accent}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: step.accent,
                  fontSize: visible === 1 ? 15 : 11,
                  fontWeight: 900,
                  transition: 'all 0.5s cubic-bezier(0.4,0,0.2,1)',
                }}>{step.n}</div>

                {/* Text */}
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <p style={{
                    fontSize:      titleSize(visible),
                    fontWeight:    800,
                    color:         '#0f172a',
                    margin:        '0 0 5px',
                    letterSpacing: '-.02em',
                    lineHeight:    1.25,
                    transition:    'font-size 0.5s ease',
                  }}>{step.title}</p>
                  <p style={{
                    fontSize:   descSize(visible),
                    lineHeight: 1.6,
                    color:      '#64748b',
                    margin:     0,
                    transition: 'font-size 0.5s ease',
                  }}>{step.desc}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ─── Generic typewriter ───────────────────────────────────────────────────────
function Typewriter({ text, delay = 0, interval = 50, cursor = true }: {
  text: string; delay?: number; interval?: number; cursor?: boolean
}) {
  const [count, setCount] = useState(0)
  const [started, setStarted] = useState(delay === 0)

  useEffect(() => {
    if (delay === 0) return
    const t = setTimeout(() => setStarted(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  useEffect(() => {
    if (!started || count >= text.length) return
    const t = setTimeout(() => setCount(c => c + 1), interval)
    return () => clearTimeout(t)
  }, [started, count, text, interval])

  return (
    <span>
      {text.slice(0, count)}
      {cursor && <span className="zk-cursor">|</span>}
    </span>
  )
}

// ─── Typewriter headline ──────────────────────────────────────────────────────
const HEADLINE      = "The Ballot Box Can't Lie."
const BLUE_AT       = 15   // chars before "Can't Lie."
const TYPE_INTERVAL = 55   // ms per character

function TypewriterHeadline() {
  const [count, setCount]   = useState(0)
  const [typing, setTyping] = useState(true)

  useEffect(() => {
    if (!typing) return
    if (count >= HEADLINE.length) { setTyping(false); return }
    const id = setTimeout(() => setCount(c => c + 1), TYPE_INTERVAL)
    return () => clearTimeout(id)
  }, [count, typing])

  const dark = HEADLINE.slice(0, Math.min(count, BLUE_AT))
  const blue = count > BLUE_AT ? HEADLINE.slice(BLUE_AT, count) : ''

  return (
    <span>
      {dark}
      <span style={{ color: '#4285F4' }}>{blue}</span>
      <span className="zk-cursor">|</span>
    </span>
  )
}

// ─── CTA Ring Particles ───────────────────────────────────────────────────────
const RING_VERT = /* glsl */`
  attribute float aSize;
  attribute vec3  aColor;
  attribute float aAngle;
  varying   vec3  vColor;
  varying   float vAngle;
  varying   float vSize;
  void main() {
    vColor = aColor;
    vAngle = aAngle;
    vSize  = aSize;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (3.6 / -mv.z);
    gl_Position  = projectionMatrix * mv;
  }
`
// Pill/capsule shape — elongates based on size (bigger = more pill-like)
const RING_FRAG = /* glsl */`
  varying vec3  vColor;
  varying float vAngle;
  varying float vSize;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vAngle), s = sin(vAngle);
    vec2  r = vec2(c*uv.x - s*uv.y, s*uv.x + c*uv.y);
    // Elongation: 0 (circle) for small, 0.62 (pill) for large
    float elong = clamp((vSize - 3.0) / 9.0, 0.0, 0.62);
    vec2  e = vec2(r.x / (0.50 - elong * 0.28), r.y / 0.50);
    float d = length(e);
    if (d > 1.0) discard;
    float a = smoothstep(1.0, 0.25, d) * 0.90;
    gl_FragColor = vec4(vColor, a);
  }
`

const WAVE_BASE_R  = 2.2
const WAVE_SIGMA   = 0.9
const SIZE_MIN     = 0.8
const SIZE_MAX     = 12.0
const GRID_SPACING = 0.38
const ORB_BASE     = 0.06   // base orbital amplitude
const ORB_SCALE    = 0.28   // extra amplitude for large particles
const ORB_SPD      = 1.4    // orbital angular speed (rad/s)

// Size based on signed distance from wave ring boundary
// d < 0 = inside ring, d = 0 = on ring, d > 0 = outside
function sizeFromDist(d: number, ringR: number): number {
  if (d <= 0) {
    const t = Math.max(0, 1 + d / ringR)   // 0 at center → 1 at ring
    return SIZE_MIN + (SIZE_MAX - SIZE_MIN) * t
  }
  return SIZE_MAX * Math.exp(-(d * d) / (2 * WAVE_SIGMA * WAVE_SIGMA))
}

// Uniform grid with slight jitter
function buildUniformGrid() {
  const pts: Array<{ x: number; y: number; phase: number }> = []
  const X0 = -6.0, X1 = 6.0, Y0 = -3.6, Y1 = 3.6
  for (let gx = X0; gx <= X1; gx += GRID_SPACING) {
    for (let gy = Y0; gy <= Y1; gy += GRID_SPACING) {
      pts.push({
        x:     gx + (Math.random() - 0.5) * GRID_SPACING * 0.45,
        y:     gy + (Math.random() - 0.5) * GRID_SPACING * 0.45,
        phase: Math.random() * Math.PI * 2,
      })
    }
  }
  return pts
}

function RingParticles({ mouseState }: {
  mouseState: React.MutableRefObject<{ cx: number; cy: number; active: boolean }>
}) {
  const { camera }  = useThree()
  const ref         = useRef<THREE.Points>(null!)
  const wavePos     = useRef({ x: 0.5, y: 0.3 })   // ring center (starts off-center)
  const waveVel     = useRef({ x: 0.025, y: 0.018 }) // ring velocity
  const wanderDir   = useRef(Math.random() * Math.PI * 2)
  const mouseWorld  = useRef({ x: 0, y: 0 })
  const pOrig       = useRef<Float32Array | null>(null)
  const pPhase      = useRef<Float32Array | null>(null)
  const totalP      = useRef(0)

  const { geometry, material } = useMemo(() => {
    const pts = buildUniformGrid()
    totalP.current = pts.length
    const N = pts.length

    pOrig.current  = new Float32Array(N * 2)
    pPhase.current = new Float32Array(N)

    const pos = new Float32Array(N * 3)
    const col = new Float32Array(N * 3)
    const sz  = new Float32Array(N)

    pts.forEach(({ x, y, phase }, k) => {
      pOrig.current![k * 2]     = x
      pOrig.current![k * 2 + 1] = y
      pPhase.current![k]        = phase
      pos[k*3] = x; pos[k*3+1] = y; pos[k*3+2] = 0
      // Uniform blue-white color, slight variation
      const b = 0.55 + Math.random() * 0.45
      col[k*3]   = 0.10 + b * 0.18
      col[k*3+1] = 0.25 + b * 0.25
      col[k*3+2] = 0.72 + b * 0.28
      sz[k] = SIZE_MIN
    })

    const ang = new Float32Array(pts.length)  // velocity angle for pill shape
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aColor',   new THREE.BufferAttribute(col, 3))
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sz,  1))
    geo.setAttribute('aAngle',   new THREE.BufferAttribute(ang, 1))
    const mat = new THREE.ShaderMaterial({
      vertexShader: RING_VERT, fragmentShader: RING_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    return { geometry: geo, material: mat }
  }, [])

  useFrame((state) => {
    if (!ref.current || !pOrig.current || !pPhase.current) return
    const posAttr  = ref.current.geometry.attributes.position
    const sizeAttr = ref.current.geometry.attributes.aSize
    const pos   = posAttr.array   as Float32Array
    const szArr = sizeAttr.array  as Float32Array
    const orig  = pOrig.current
    const phase = pPhase.current
    const t     = state.clock.elapsedTime
    const N     = totalP.current

    // ── Convert mouse → world space ───────────────────────────────────
    if (mouseState.current.active) {
      const nx =  mouseState.current.cx * 2 - 1
      const ny = -mouseState.current.cy * 2 + 1
      const cam = camera as THREE.PerspectiveCamera
      const vv  = new THREE.Vector3(nx, ny, 0.5).unproject(cam)
      const dir = vv.sub(cam.position).normalize()
      const tt  = -cam.position.z / dir.z
      const rawX = cam.position.x + dir.x * tt
      const rawY = cam.position.y + dir.y * tt
      // Extra smoothing on raw mouse → remove jitter
      mouseWorld.current.x += (rawX - mouseWorld.current.x) * 0.12
      mouseWorld.current.y += (rawY - mouseWorld.current.y) * 0.12
    }

    // ── Ring movement: mouse chases OR autonomous wander ─────────────
    if (mouseState.current.active) {
      // Smooth mouse target — extra lerp so raw mouse jitter doesn't transfer
      const tx = mouseWorld.current.x * 0.60
      const ty = mouseWorld.current.y * 0.60
      waveVel.current.x += (tx - wavePos.current.x) * 0.030
      waveVel.current.y += (ty - wavePos.current.y) * 0.030
      waveVel.current.x *= 0.91
      waveVel.current.y *= 0.91
    } else {
      // Autonomous wander — very gentle rotation change
      wanderDir.current += 0.004 + 0.002 * Math.sin(t * 0.25)
      waveVel.current.x += 0.0012 * Math.cos(wanderDir.current)
      waveVel.current.y += 0.0012 * Math.sin(wanderDir.current)
      if (Math.abs(wavePos.current.x) > 4.0)
        waveVel.current.x -= Math.sign(wavePos.current.x) * 0.003
      if (Math.abs(wavePos.current.y) > 2.4)
        waveVel.current.y -= Math.sign(wavePos.current.y) * 0.003
      const spd = Math.sqrt(waveVel.current.x**2 + waveVel.current.y**2)
      if (spd > 0.032) {
        waveVel.current.x = (waveVel.current.x / spd) * 0.032
        waveVel.current.y = (waveVel.current.y / spd) * 0.032
      }
      waveVel.current.x *= 0.975
      waveVel.current.y *= 0.975
    }
    wavePos.current.x += waveVel.current.x
    wavePos.current.y += waveVel.current.y
    const wcx = wavePos.current.x, wcy = wavePos.current.y

    const angArr = ref.current.geometry.attributes.aAngle.array as Float32Array

    for (let k = 0; k < N; k++) {
      const k3 = k * 3
      const ox  = orig[k * 2], oy = orig[k * 2 + 1]
      const ph  = phase[k]

      // ── Angle & distance from wave center ─────────────────────────
      const dx0   = ox - wcx, dy0 = oy - wcy
      const dist0 = Math.sqrt(dx0 * dx0 + dy0 * dy0)
      const ang0  = Math.atan2(dy0, dx0)

      // ── Wobbly ring radius ─────────────────────────────────────────
      const ringR = WAVE_BASE_R
        + 0.36 * Math.sin(2 * ang0 - 0.75 * t)
        + 0.18 * Math.sin(3 * ang0 - 1.30 * t + 0.9)
        + 0.12 * Math.sin(t  * 0.30 + ang0 * 0.7)
        + 0.07 * Math.sin(4 * ang0 - 1.80 * t + 2.1)

      // ── Size from ring distance ────────────────────────────────────
      const signedD = dist0 - ringR
      const sz = sizeFromDist(signedD, ringR)
      szArr[k]  = sz

      // ── Orbital motion: particle traces circle A→B→A ──────────────
      // Amplitude proportional to particle size (large = more movement)
      const orbAmp = ORB_BASE + (sz / SIZE_MAX) * ORB_SCALE

      // Traveling wave phase: radial + angular + time
      // Spatial frequency along angle creates swirling appearance
      const wavePhase = ang0 * 1.5 + dist0 * 0.7 + ph - ORB_SPD * t

      // Circular orbital offset
      const orbX = orbAmp * Math.cos(wavePhase)
      const orbY = orbAmp * Math.sin(wavePhase)

      pos[k3]     = ox + orbX
      pos[k3 + 1] = oy + orbY
      pos[k3 + 2] = 0

      // Velocity direction = tangent of orbit = angle of velocity vector
      // d/dt(cos φ) = -sin φ, d/dt(sin φ) = cos φ
      angArr[k] = Math.atan2(Math.cos(wavePhase), -Math.sin(wavePhase))
    }
    ref.current.geometry.attributes.aAngle.needsUpdate = true

    posAttr.needsUpdate  = true
    sizeAttr.needsUpdate = true
  })

  return <points ref={ref} geometry={geometry} material={material} />
}

function CTASection({ connect, connecting }: { connect: () => void; connecting: boolean }) {
  const mouseState = useRef({ cx: 0, cy: 0, active: false })
  const sectionRef = useRef<HTMLElement>(null)

  const handleMove = useCallback((e: React.MouseEvent) => {
    const rect = sectionRef.current?.getBoundingClientRect()
    if (!rect) return
    mouseState.current = {
      cx: (e.clientX - rect.left) / rect.width,
      cy: (e.clientY - rect.top)  / rect.height,
      active: true,
    }
  }, [])

  return (
    <div style={{ padding: '0 40px 80px', background: '#ffffff' }}>
    <section
      ref={sectionRef}
      onMouseMove={handleMove}
      onMouseLeave={() => { mouseState.current.active = false }}
      style={{
        position: 'relative', height: '72vh', minHeight: 480,
        background: '#040d1e', overflow: 'hidden',
        borderRadius: 28,
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 5.5], fov: 58 }}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
        style={{ position: 'absolute', inset: 0, borderRadius: 28 }}
      >
        <color attach="background" args={['#040d1e']} />
        <RingParticles mouseState={mouseState} />
      </Canvas>

      {/* Content */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 8% 0 7%',
        maxWidth: 620,
      }}>
        <p style={{
          color: '#4285F4', fontSize: 12, fontWeight: 700,
          letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 20,
        }}>Ready to Deploy</p>
        <h2 style={{
          fontSize: 'clamp(2.4rem, 5vw, 3.6rem)', fontWeight: 900,
          letterSpacing: '-.03em', color: '#f0f4ff', marginBottom: 32, lineHeight: 1.08,
        }}>
          <Typewriter text="Run your first verifiable election today." interval={38} cursor={true} />
        </h2>
        <div>
          <button
            className="zk-btn-primary"
            onClick={connect}
            disabled={connecting}
            style={{ fontSize: 15, padding: '15px 36px' }}
          >
            {connecting ? 'Connecting…' : 'Connect Wallet →'}
          </button>
        </div>
      </div>
    </section>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function LandingHero() {
  const { connect, connecting } = useWalletCtx()
  const [scroll, setScroll]     = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const badgeRef     = useRef<HTMLDivElement>(null)
  const h1Ref        = useRef<HTMLHeadingElement>(null)
  const subRef       = useRef<HTMLParagraphElement>(null)
  const ctasRef      = useRef<HTMLDivElement>(null)

  // GSAP entrance (h1 excluded — handled by typewriter)
  useEffect(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
    tl.fromTo(badgeRef.current, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.6 }, 0.3)
    tl.fromTo(subRef.current,   { opacity: 0, y: 24  }, { opacity: 1, y: 0, duration: 0.9 }, 1.4)
    tl.fromTo(ctasRef.current,  { opacity: 0, y: 18  }, { opacity: 1, y: 0, duration: 0.8 }, 1.7)
  }, [])

  // Scroll tracking inside fixed overlay
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const fn = () => setScroll(el.scrollTop / window.innerHeight)
    el.addEventListener('scroll', fn, { passive: true })
    return () => el.removeEventListener('scroll', fn)
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: '#ffffff',
        overflowY: 'auto',
        fontFamily: '"DM Sans", system-ui, -apple-system, sans-serif',
        WebkitFontSmoothing: 'antialiased',
        color: '#0f172a',
      }}
    >
      {/* Google Fonts — DM Sans */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;0,9..40,900&display=swap');

        @keyframes zkBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .zk-cursor {
          display: inline;
          color: #4285F4;
          font-weight: 300;
          font-size: 0.85em;
          line-height: 1;
          vertical-align: baseline;
          animation: zkBlink 1s step-end infinite;
          margin-left: 1px;
        }
        @keyframes zkScrollUp {
          0%   { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        .zk-marquee-inner {
          animation: zkScrollUp 12s linear infinite;
        }
        .zk-marquee-inner:hover {
          animation-play-state: paused;
        }
        @keyframes zkBounce {
          0%,100% { transform:translateX(-50%) translateY(0);   opacity:.45; }
          50%      { transform:translateX(-50%) translateY(8px); opacity:.85; }
        }
        @keyframes zkFadeSlide {
          from { opacity:0; transform:translateX(-50%) translateY(12px); }
          to   { opacity:1; transform:translateX(-50%) translateY(0);    }
        }
        .zk-btn-primary {
          display:inline-flex; align-items:center; gap:8px;
          padding:14px 32px; border-radius:100px;
          background:#0f172a; color:#fff;
          font-size:15px; font-weight:700; letter-spacing:-.01em;
          border:none; cursor:pointer;
          transition:background .2s, transform .2s, box-shadow .2s;
          box-shadow: 0 1px 3px rgba(0,0,0,.12), 0 4px 16px rgba(0,0,0,.08);
        }
        .zk-btn-primary:hover {
          background:#1e3a8a;
          transform:translateY(-2px);
          box-shadow: 0 4px 20px rgba(15,23,42,.18);
        }
        .zk-btn-primary:disabled { opacity:.5; cursor:wait; }
        .zk-btn-secondary {
          display:inline-flex; align-items:center; gap:8px;
          padding:14px 28px; border-radius:100px;
          background:transparent; color:#0f172a;
          font-size:15px; font-weight:600; letter-spacing:-.01em;
          border:1.5px solid #cbd5e1; cursor:pointer;
          transition:border-color .2s, background .2s, transform .2s;
        }
        .zk-btn-secondary:hover {
          border-color:#94a3b8; background:#f8fafc;
          transform:translateY(-2px);
        }
        .zk-card {
          padding:28px 26px; border-radius:20px;
          background:#f8fafc; border:1px solid #e2e8f0;
          transition:border-color .22s, background .22s, transform .22s, box-shadow .22s;
          cursor:default;
        }
        .zk-card:hover {
          border-color:#bfdbfe; background:#eff6ff;
          transform:translateY(-5px);
          box-shadow: 0 12px 32px rgba(66,133,244,.10);
        }
        .zk-step {
          display:flex; align-items:flex-start; gap:20px;
          padding:20px 24px; border-radius:16px;
          background:#f8fafc; border:1px solid #e2e8f0;
          transition:border-color .2s, background .2s;
        }
      `}</style>

      {/* ════ HERO ══════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', height: '100vh', overflow: 'clip' }}>

        {/* R3F Canvas — transparent bg so white page shows through */}
        <Canvas
          camera={{ position: [0, 0, 5.5], fov: 58 }}
          gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
          dpr={[1, IS_MOBILE ? 1 : 1.5]}
          style={{ position: 'absolute', inset: 0 }}
        >
          <Particles scroll={scroll} />
        </Canvas>

        {/* Navbar */}
        <nav style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 40px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: '#0f172a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', letterSpacing: '-.02em' }}>
              ZK Vote
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
              Powered by Groth16 · Sepolia
            </span>
            <button
              className="zk-btn-primary"
              onClick={connect}
              disabled={connecting}
              style={{ padding: '9px 20px', fontSize: 13 }}
            >
              {connecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
          </div>
        </nav>

        {/* Hero text — pointer-events:none so mouse hits canvas */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: '0 24px',
          pointerEvents: 'none',
        }}>

          {/* Badge — no border, logo icon + plain text */}
          <div ref={badgeRef} style={{
            opacity: 0,
            display: 'inline-flex', alignItems: 'center', gap: 10,
            color: '#0f172a', fontSize: 15, fontWeight: 700,
            letterSpacing: '.06em', textTransform: 'uppercase',
            marginBottom: 28,
          }}>
            {/* ZK Vote logo icon */}
            <div style={{
              width: 22, height: 22, borderRadius: 6,
              background: '#0f172a',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            Enterprise-Grade Anonymous Voting
          </div>

          {/* Headline — typewriter */}
          <h1 ref={h1Ref} style={{
            fontSize: 'clamp(2.8rem, 7vw, 5.6rem)',
            fontWeight: 900, lineHeight: 1.04,
            letterSpacing: '-.04em', color: '#0f172a',
            marginBottom: 24, maxWidth: 880,
            whiteSpace: 'nowrap',
          }}>
            <TypewriterHeadline />
          </h1>

          {/* Sub */}
          <p ref={subRef} style={{
            opacity: 0,
            maxWidth: 560, fontSize: 'clamp(1rem, 2vw, 1.2rem)',
            lineHeight: 1.75, color: '#475569',
            marginBottom: 44, fontWeight: 400,
          }}>
            ZK Vote is a trustless election platform for DAOs, companies, and communities.
            Zero-knowledge proofs enforce voter anonymity. Ethereum enforces the result.
            No intermediaries. No manipulation.
          </p>

          {/* CTAs */}
          <div ref={ctasRef} style={{
            opacity: 0, pointerEvents: 'auto',
            display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center',
          }}>
            <button className="zk-btn-primary" onClick={connect} disabled={connecting}>
              {connecting ? 'Connecting…' : (
                <>Launch Your First Election <span style={{ fontSize: 18 }}>→</span></>
              )}
            </button>
            <button className="zk-btn-secondary" onClick={() => {
              containerRef.current?.scrollTo({ top: window.innerHeight, behavior: 'smooth' })
            }}>
              How it works
            </button>
          </div>

        </div>

        {/* Built for */}
        <div style={{
          position: 'absolute', bottom: 44, left: 60, right: 60,
          display: 'grid', gridTemplateColumns: '1fr 2fr',
          gap: '0 40px', alignItems: 'center',
          pointerEvents: 'none',
        }}>
          {/* Left: BUILT FOR — same size as items */}
          <p style={{
            fontSize: 'clamp(1.1rem, 2vw, 1.6rem)', fontWeight: 800,
            color: '#0f172a', letterSpacing: '.06em',
            textTransform: 'uppercase', lineHeight: 1.35, margin: 0,
          }}>
            Built for
          </p>
          {/* Right: 3 cols × 2 rows */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gridTemplateRows: 'repeat(2, auto)',
            gap: '4px 0',
          }}>
            {CLIENTS.map(c => (
              <span key={c} style={{
                fontSize: 'clamp(1.1rem, 2vw, 1.6rem)', color: '#0f172a',
                fontWeight: 500, letterSpacing: '.01em', lineHeight: 1.35,
              }}>{c}</span>
            ))}
          </div>
        </div>

        {/* Scroll cue */}
        <div style={{
          position: 'absolute', bottom: 28, left: '50%',
          animation: 'zkBounce 2.2s ease-in-out infinite',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          color: '#94a3b8', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </section>

      {/* ════ FEATURES ══════════════════════════════════════════════════════ */}
      <section style={{
        padding: '96px 80px',
        background: '#ffffff',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '5fr 6fr',
          gap: '0 100px',
          alignItems: 'center',
        }}>
          {/* ── LEFT: title ── */}
          <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <div>
              <p style={{
                color: '#4285F4', fontSize: 12, fontWeight: 700,
                letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 22,
              }}>What We Provide</p>
              <h2 style={{
                fontSize: 'clamp(2.6rem, 4vw, 3.8rem)', fontWeight: 900,
                letterSpacing: '-.03em', color: '#0f172a', lineHeight: 1.10,
                marginBottom: 0,
              }}>
                <Typewriter text="Privacy and integrity" interval={45} cursor={true} />
                <br />
                <span style={{ color: '#94a3b8', fontWeight: 500 }}>not a trade-off.</span>
              </h2>
            </div>
          </div>

          {/* ── RIGHT: feature cards in aurora container ── */}
          <div style={{
            background: 'linear-gradient(135deg, #f0f4ff 0%, #fdf0ff 30%, #fff7ed 60%, #f0fdf4 100%)',
            borderRadius: 24,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            {FEATURES.map((f) => (
              <div key={f.title} style={{
                background: '#ffffff',
                borderRadius: 14,
                padding: '18px 20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
                transition: 'transform .2s, box-shadow .2s',
                cursor: 'default',
              }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'
                  ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
                  ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: f.color, flexShrink: 0,
                  }} />
                  <h3 style={{
                    fontSize: 14, fontWeight: 700,
                    letterSpacing: '-.01em', color: '#0f172a', margin: 0,
                  }}>{f.title}</h3>
                </div>
                <p style={{
                  fontSize: 13, lineHeight: 1.7, color: '#64748b',
                  margin: 0, paddingLeft: 15,
                }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #f1f5f9', maxWidth: 1100, margin: '0 auto' }} />

      {/* ════ HOW IT WORKS ══════════════════════════════════════════════════ */}
      <section style={{ padding: '80px 80px', background: '#ffffff' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '5fr 6fr',
          gap: '0 100px', alignItems: 'center',
        }}>

          {/* LEFT: title */}
          <div>
            <p style={{
              color: '#7C3AED', fontSize: 12, fontWeight: 700,
              letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 22,
            }}>The Process</p>
            <h2 style={{
              fontSize: 'clamp(2.6rem, 4vw, 3.8rem)', fontWeight: 900,
              letterSpacing: '-.03em', color: '#0f172a', lineHeight: 1.10, marginBottom: 0,
            }}>
              <Typewriter text="From zero to certified result" interval={42} delay={200} cursor={true} />
              <br />
              <span style={{ color: '#94a3b8', fontWeight: 500 }}>in four steps.</span>
            </h2>
          </div>

          {/* RIGHT: animated inbox */}
          <AnimatedInbox />

        </div>
      </section>

      {/* ════ CTA — full-height dark + ring particles ══════════════════════ */}
      <CTASection connect={connect} connecting={connecting} />

      {/* ════ FOOTER ════════════════════════════════════════════════════════ */}
      <footer style={{
        padding: '24px 40px',
        borderTop: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7, background: '#0f172a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>ZK Vote</span>
        </div>
        <div style={{
          display: 'flex', gap: 20, flexWrap: 'wrap',
          fontSize: 12, color: '#94a3b8',
        }}>
          <span>Groth16 ZK-SNARK</span>
          <span>·</span>
          <span>Ethereum Sepolia</span>
          <span>·</span>
          <span>HCMUT · DATN 2025</span>
        </div>
      </footer>
    </div>
  )
}
