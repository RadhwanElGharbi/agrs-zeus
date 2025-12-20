'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

export type ViewMode = 'pipe' | 'cfd'

interface PipelineViewer3DProps {
  diameter: number // Outer diameter in meters
  wallThickness: number // Wall thickness in meters
  length?: number
  showCutaway?: boolean
  flowVelocity?: number
  viewMode?: ViewMode
  fluidDensity?: number
  fluidViscosity?: number
  // Hydraulics parameters
  inletPressure?: number // Bar
  outletPressure?: number // Bar
  flowRate?: number // m³/s
  temperature?: number // Kelvin
}

// Calculate Reynolds number
function calculateReynolds(velocity: number, diameter: number, density: number, viscosity: number): number {
  return (density * velocity * diameter) / viscosity
}

// Determine flow regime
function getFlowRegime(reynolds: number): 'laminar' | 'transitional' | 'turbulent' {
  if (reynolds < 2300) return 'laminar'
  if (reynolds < 4000) return 'transitional'
  return 'turbulent'
}

// Calculate velocity from flow rate and diameter
function calculateVelocity(flowRate: number, innerDiameter: number): number {
  const area = Math.PI * Math.pow(innerDiameter / 2, 2)
  return flowRate / area
}

export function PipelineViewer3D({
  diameter,
  wallThickness,
  length = 20,
  showCutaway = true,
  flowVelocity: propFlowVelocity,
  viewMode = 'pipe',
  fluidDensity = 0.7, // kg/m³ for natural gas at standard conditions
  fluidViscosity = 0.000011, // Pa·s for natural gas
  inletPressure = 75,
  outletPressure = 45,
  flowRate = 1.0,
  temperature = 288
}: PipelineViewer3DProps) {
  const innerDiameter = diameter - 2 * wallThickness

  // Calculate actual flow velocity from flow rate if not directly provided
  const flowVelocity = propFlowVelocity ?? calculateVelocity(flowRate, innerDiameter)

  // Calculate Reynolds number and flow regime
  const reynolds = calculateReynolds(flowVelocity, innerDiameter, fluidDensity, fluidViscosity)
  const flowRegime = getFlowRegime(reynolds)
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    let mounted = true
    let animationId: number
    let scene: any, camera: any, renderer: any, controls: any
    let particles: any[] = []

    const initScene = async () => {
      try {
        // Dynamic import to avoid SSR issues
        const THREE = await import('three')
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')

        if (!mounted || !containerRef.current) return

        const container = containerRef.current
        const width = container.clientWidth
        const height = container.clientHeight

        // Scene setup
        scene = new THREE.Scene()
        scene.background = new THREE.Color(0x0a0a0a)
        scene.fog = new THREE.Fog(0x0a0a0a, 30, 60)

        // Camera
        camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000)
        camera.position.set(15, 8, 15)
        camera.lookAt(0, 0, 0)

        // Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setSize(width, height)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        container.appendChild(renderer.domElement)

        // Controls
        controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.05
        controls.minDistance = 5
        controls.maxDistance = 50
        controls.target.set(0, 0, 0)

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
        scene.add(ambientLight)

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
        directionalLight.position.set(10, 10, 5)
        directionalLight.castShadow = true
        directionalLight.shadow.mapSize.width = 2048
        directionalLight.shadow.mapSize.height = 2048
        scene.add(directionalLight)

        const pointLight = new THREE.PointLight(0x60a5fa, 0.5)
        pointLight.position.set(-10, 10, -5)
        scene.add(pointLight)

        const spotLight = new THREE.SpotLight(0xffffff, 0.5)
        spotLight.position.set(0, 15, 0)
        spotLight.angle = 0.3
        spotLight.penumbra = 0.5
        spotLight.castShadow = true
        scene.add(spotLight)

        // Pipeline group
        const pipelineGroup = new THREE.Group()
        pipelineGroup.rotation.z = Math.PI / 2

        const outerRadius = diameter / 2
        const innerRadius = outerRadius - wallThickness

        // === PIPE MODE GEOMETRY ===
        if (viewMode === 'pipe') {
          // Materials
          const outerPipeMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a5568,
            metalness: 0.7,
            roughness: 0.3,
            side: THREE.DoubleSide
          })
          const innerPipeMaterial = new THREE.MeshStandardMaterial({
            color: 0x6b7280, // Slightly lighter for inner surface
            metalness: 0.5,
            roughness: 0.4,
            side: THREE.DoubleSide
          })
          const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x5a6478,
            metalness: 0.6,
            roughness: 0.35,
            side: THREE.DoubleSide
          })

          if (showCutaway) {
            const segments = 48
            // Cutaway shows a quarter section removed to reveal inside
            const cutawayStartAngle = Math.PI * 0.5  // Start at 90 degrees
            const cutawayArcAngle = Math.PI * 0.5    // Remove 90 degrees (quarter)

            // Create FULL outer shell (complete cylinder)
            const outerGeometry = new THREE.CylinderGeometry(
              outerRadius,
              outerRadius,
              length,
              segments,
              1,
              false  // closed ends = false, we'll add custom caps
            )
            const outerPipe = new THREE.Mesh(outerGeometry, outerPipeMaterial)
            outerPipe.castShadow = true
            outerPipe.receiveShadow = true
            pipelineGroup.add(outerPipe)

            // Create inner shell ONLY for the cutaway section (to show pipe interior)
            // This is the visible inner surface through the cutaway window
            const innerGeometry = new THREE.CylinderGeometry(
              innerRadius,
              innerRadius,
              length * 1.01, // Slightly longer to avoid z-fighting
              segments,
              1,
              true,  // open ended
              cutawayStartAngle,
              cutawayArcAngle
            )
            const innerPipe = new THREE.Mesh(innerGeometry, innerPipeMaterial)
            pipelineGroup.add(innerPipe)

            // Create a "window" in the outer pipe by adding a cutaway overlay
            // Use a box to cut through and reveal the inside
            const cutawayDepth = outerRadius * 2
            const cutawayWidth = outerRadius * 2
            const cutawayBoxGeometry = new THREE.BoxGeometry(cutawayWidth, length * 1.02, cutawayDepth)

            // Position the cutaway box to remove a quarter section
            // We'll use CSG-like approach: cover the cutaway area with the outer material
            // but leave a window. Since Three.js doesn't have CSG built-in,
            // we'll create the cutaway differently:

            // Remove the full outer cylinder and create a partial one instead
            pipelineGroup.remove(outerPipe)
            outerGeometry.dispose()

            // Create outer shell with the main visible portion (270 degrees)
            const mainOuterGeometry = new THREE.CylinderGeometry(
              outerRadius,
              outerRadius,
              length,
              segments,
              1,
              true,  // open ended for partial cylinder
              cutawayStartAngle + cutawayArcAngle, // Start after cutaway
              Math.PI * 2 - cutawayArcAngle // The remaining 270 degrees
            )
            const mainOuterPipe = new THREE.Mesh(mainOuterGeometry, outerPipeMaterial)
            mainOuterPipe.castShadow = true
            mainOuterPipe.receiveShadow = true
            pipelineGroup.add(mainOuterPipe)

            // Add end caps (ring-shaped) - full 360 degrees
            const fullRingCapGeometry = new THREE.RingGeometry(innerRadius, outerRadius, segments)

            // Top cap
            const topCap = new THREE.Mesh(fullRingCapGeometry, wallMaterial)
            topCap.position.y = length / 2
            topCap.rotation.x = -Math.PI / 2
            pipelineGroup.add(topCap)

            // Bottom cap
            const bottomCap = new THREE.Mesh(fullRingCapGeometry.clone(), wallMaterial)
            bottomCap.position.y = -length / 2
            bottomCap.rotation.x = Math.PI / 2
            pipelineGroup.add(bottomCap)

            // Create the two flat wall surfaces at the cutaway edges
            // These connect the inner and outer shells at the cut edges
            const wallWidth = outerRadius - innerRadius
            const wallGeometry = new THREE.PlaneGeometry(wallWidth, length)

            // First cut edge (at cutaway start angle)
            const wall1 = new THREE.Mesh(wallGeometry, wallMaterial)
            const midRadius = (innerRadius + outerRadius) / 2
            wall1.position.set(
              Math.cos(cutawayStartAngle) * midRadius,
              0,
              Math.sin(cutawayStartAngle) * midRadius
            )
            wall1.rotation.y = cutawayStartAngle + Math.PI / 2
            pipelineGroup.add(wall1)

            // Second cut edge (at cutaway end angle)
            const wall2 = new THREE.Mesh(wallGeometry.clone(), wallMaterial)
            const endAngle = cutawayStartAngle + cutawayArcAngle
            wall2.position.set(
              Math.cos(endAngle) * midRadius,
              0,
              Math.sin(endAngle) * midRadius
            )
            wall2.rotation.y = endAngle + Math.PI / 2
            pipelineGroup.add(wall2)

          } else {
            // Full pipe without cutaway - use tube geometry
            const shape = new THREE.Shape()
            shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false)
            const holePath = new THREE.Path()
            holePath.absarc(0, 0, innerRadius, 0, Math.PI * 2, true)
            shape.holes.push(holePath)

            const extrudeSettings = {
              steps: 1,
              depth: length,
              bevelEnabled: false
            }

            const tubeGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings)
            tubeGeometry.center()
            tubeGeometry.rotateX(Math.PI / 2)

            const pipe = new THREE.Mesh(tubeGeometry, outerPipeMaterial)
            pipe.castShadow = true
            pipe.receiveShadow = true
            pipelineGroup.add(pipe)
          }

          // Pipe flanges at both ends
          const flangeMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d3748,
            metalness: 0.8,
            roughness: 0.2
          })

          const flangeThickness = outerRadius * 0.25
          ;[-length / 2 - flangeThickness / 2, length / 2 + flangeThickness / 2].forEach((pos) => {
            // Create flange as a ring (hollow cylinder)
            const flangeOuter = outerRadius * 1.2
            const flangeInner = innerRadius * 0.95

            const flangeShape = new THREE.Shape()
            flangeShape.absarc(0, 0, flangeOuter, 0, Math.PI * 2, false)
            const flangeHole = new THREE.Path()
            flangeHole.absarc(0, 0, flangeInner, 0, Math.PI * 2, true)
            flangeShape.holes.push(flangeHole)

            const flangeGeometry = new THREE.ExtrudeGeometry(flangeShape, {
              steps: 1,
              depth: flangeThickness,
              bevelEnabled: false
            })
            flangeGeometry.center()
            flangeGeometry.rotateX(Math.PI / 2)

            const flange = new THREE.Mesh(flangeGeometry, flangeMaterial)
            flange.position.y = pos
            flange.castShadow = true
            pipelineGroup.add(flange)

            // Add bolt holes to flanges
            const boltCount = 8
            const boltRadius = outerRadius * 0.06
            const boltCircleRadius = (flangeOuter + outerRadius) / 2
            const boltMaterial = new THREE.MeshStandardMaterial({
              color: 0x1a1a2e,
              metalness: 0.9,
              roughness: 0.1
            })

            for (let i = 0; i < boltCount; i++) {
              const boltAngle = (i / boltCount) * Math.PI * 2
              const boltGeometry = new THREE.CylinderGeometry(boltRadius, boltRadius, flangeThickness * 1.5, 8)
              const bolt = new THREE.Mesh(boltGeometry, boltMaterial)
              bolt.position.set(
                Math.cos(boltAngle) * boltCircleRadius,
                pos,
                Math.sin(boltAngle) * boltCircleRadius
              )
              pipelineGroup.add(bolt)
            }
          })
        }

        // === CFD MODE GEOMETRY ===
        if (viewMode === 'cfd') {
          // Semi-transparent pipe shell
          const pipeGeometry = new THREE.CylinderGeometry(
            innerRadius,
            innerRadius,
            length,
            48,
            1,
            true
          )
          const pipeMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x88aacc,
            metalness: 0.1,
            roughness: 0.1,
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide,
            depthWrite: false
          })
          const pipe = new THREE.Mesh(pipeGeometry, pipeMaterial)
          pipelineGroup.add(pipe)

          // === FLUID VOLUME PARTICLES ===
          // These represent discrete fluid elements, not glowing tracers
          const particleCount = 3000
          const fluidGeometry = new THREE.BufferGeometry()
          const positions = new Float32Array(particleCount * 3)
          const velocities = new Float32Array(particleCount)
          const radialPositions = new Float32Array(particleCount)
          const phases = new Float32Array(particleCount) // For turbulence
          const sizes = new Float32Array(particleCount)

          for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2
            const r = Math.pow(Math.random(), 0.7) * innerRadius * 0.92 // More particles near center

            positions[i * 3] = Math.cos(angle) * r
            positions[i * 3 + 1] = (Math.random() - 0.5) * length
            positions[i * 3 + 2] = Math.sin(angle) * r

            // Store radial position for velocity calculation
            radialPositions[i] = r / innerRadius

            // Parabolic velocity profile (Hagen-Poiseuille)
            const rNorm = r / innerRadius
            velocities[i] = flowVelocity * 2 * (1 - rNorm * rNorm)

            // Random phase for turbulent motion
            phases[i] = Math.random() * Math.PI * 2

            // Varying sizes - smaller near walls (boundary layer)
            sizes[i] = 0.04 + (1 - rNorm) * 0.06
          }

          fluidGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
          fluidGeometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 1))
          fluidGeometry.setAttribute('aRadial', new THREE.BufferAttribute(radialPositions, 1))
          fluidGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
          fluidGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))

          // Realistic fluid particle shader
          const fluidMaterial = new THREE.ShaderMaterial({
            uniforms: {
              time: { value: 0 },
              uMinVel: { value: 0.0 },
              uMaxVel: { value: flowVelocity * 2 }
            },
            vertexShader: `
              attribute float aVelocity;
              attribute float aRadial;
              attribute float aPhase;
              attribute float aSize;

              varying float vVelocity;
              varying float vRadial;

              void main() {
                vVelocity = aVelocity;
                vRadial = aRadial;

                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = aSize * (250.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
              }
            `,
            fragmentShader: `
              uniform float uMinVel;
              uniform float uMaxVel;

              varying float vVelocity;
              varying float vRadial;

              void main() {
                // Soft circular particle
                vec2 center = gl_PointCoord - vec2(0.5);
                float dist = length(center);
                if (dist > 0.5) discard;

                // Normalize velocity for color mapping
                float velNorm = clamp((vVelocity - uMinVel) / (uMaxVel - uMinVel), 0.0, 1.0);

                // Blue (slow/walls) to red (fast/center) - classic CFD colormap
                vec3 slowColor = vec3(0.0, 0.2, 0.8);   // Blue
                vec3 midColor1 = vec3(0.0, 0.8, 0.8);   // Cyan
                vec3 midColor2 = vec3(0.0, 0.9, 0.2);   // Green
                vec3 midColor3 = vec3(0.95, 0.9, 0.0);  // Yellow
                vec3 fastColor = vec3(0.9, 0.1, 0.0);   // Red

                vec3 color;
                if (velNorm < 0.25) {
                  color = mix(slowColor, midColor1, velNorm * 4.0);
                } else if (velNorm < 0.5) {
                  color = mix(midColor1, midColor2, (velNorm - 0.25) * 4.0);
                } else if (velNorm < 0.75) {
                  color = mix(midColor2, midColor3, (velNorm - 0.5) * 4.0);
                } else {
                  color = mix(midColor3, fastColor, (velNorm - 0.75) * 4.0);
                }

                // Soft edge falloff
                float alpha = smoothstep(0.5, 0.2, dist) * 0.85;

                // Slightly darker at edges for depth
                color *= (1.0 - dist * 0.3);

                gl_FragColor = vec4(color, alpha);
              }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending
          })

          const fluidParticles = new THREE.Points(fluidGeometry, fluidMaterial)
          pipelineGroup.add(fluidParticles)

          particles.push({
            type: 'fluid',
            system: fluidParticles,
            velocities: velocities,
            radialPositions: radialPositions,
            phases: phases,
            material: fluidMaterial,
            innerRadius: innerRadius
          })

          // === VELOCITY PROFILE CROSS-SECTIONS ===
          const crossSections = [-length * 0.4, 0, length * 0.4]
          crossSections.forEach(yPos => {
            const rings = 16
            const segments = 48
            const csGeometry = new THREE.BufferGeometry()
            const csPositions: number[] = []
            const csColors: number[] = []

            for (let ring = 0; ring < rings; ring++) {
              const r1 = (ring / rings) * innerRadius * 0.95
              const r2 = ((ring + 1) / rings) * innerRadius * 0.95
              const rAvg = (r1 + r2) / 2 / innerRadius
              const vel = 1 - rAvg * rAvg

              // Color based on velocity
              const color = new THREE.Color()
              if (vel < 0.25) {
                color.lerpColors(new THREE.Color(0x0033cc), new THREE.Color(0x00cccc), vel * 4)
              } else if (vel < 0.5) {
                color.lerpColors(new THREE.Color(0x00cccc), new THREE.Color(0x00e633), (vel - 0.25) * 4)
              } else if (vel < 0.75) {
                color.lerpColors(new THREE.Color(0x00e633), new THREE.Color(0xf2e600), (vel - 0.5) * 4)
              } else {
                color.lerpColors(new THREE.Color(0xf2e600), new THREE.Color(0xe61a00), (vel - 0.75) * 4)
              }

              for (let seg = 0; seg < segments; seg++) {
                const a1 = (seg / segments) * Math.PI * 2
                const a2 = ((seg + 1) / segments) * Math.PI * 2

                // Two triangles per segment
                csPositions.push(
                  Math.cos(a1) * r1, yPos, Math.sin(a1) * r1,
                  Math.cos(a2) * r1, yPos, Math.sin(a2) * r1,
                  Math.cos(a1) * r2, yPos, Math.sin(a1) * r2,

                  Math.cos(a2) * r1, yPos, Math.sin(a2) * r1,
                  Math.cos(a2) * r2, yPos, Math.sin(a2) * r2,
                  Math.cos(a1) * r2, yPos, Math.sin(a1) * r2
                )

                for (let v = 0; v < 6; v++) {
                  csColors.push(color.r, color.g, color.b)
                }
              }
            }

            csGeometry.setAttribute('position', new THREE.Float32BufferAttribute(csPositions, 3))
            csGeometry.setAttribute('color', new THREE.Float32BufferAttribute(csColors, 3))

            const csMaterial = new THREE.MeshBasicMaterial({
              vertexColors: true,
              transparent: true,
              opacity: 0.5,
              side: THREE.DoubleSide,
              depthWrite: false
            })

            const crossSection = new THREE.Mesh(csGeometry, csMaterial)
            pipelineGroup.add(crossSection)
          })

          // === COLOR SCALE LEGEND ===
          const legendGroup = new THREE.Group()
          const legendHeight = length * 0.5
          const legendWidth = outerRadius * 0.12
          const legendSegs = 40

          for (let i = 0; i < legendSegs; i++) {
            const t = i / (legendSegs - 1)
            const segH = legendHeight / legendSegs

            const color = new THREE.Color()
            if (t < 0.25) {
              color.lerpColors(new THREE.Color(0x0033cc), new THREE.Color(0x00cccc), t * 4)
            } else if (t < 0.5) {
              color.lerpColors(new THREE.Color(0x00cccc), new THREE.Color(0x00e633), (t - 0.25) * 4)
            } else if (t < 0.75) {
              color.lerpColors(new THREE.Color(0x00e633), new THREE.Color(0xf2e600), (t - 0.5) * 4)
            } else {
              color.lerpColors(new THREE.Color(0xf2e600), new THREE.Color(0xe61a00), (t - 0.75) * 4)
            }

            const segGeo = new THREE.PlaneGeometry(legendWidth, segH * 1.1)
            const segMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
            const seg = new THREE.Mesh(segGeo, segMat)
            seg.position.set(outerRadius * 1.8, (t - 0.5) * legendHeight, 0)
            legendGroup.add(seg)
          }

          pipelineGroup.add(legendGroup)

          // === WALL BOUNDARY INDICATOR ===
          // Thin ring at pipe wall to show boundary
          const wallRingGeo = new THREE.TorusGeometry(innerRadius, outerRadius * 0.015, 8, 64)
          const wallRingMat = new THREE.MeshBasicMaterial({
            color: 0x4488aa,
            transparent: true,
            opacity: 0.4
          })

          const wallRing1 = new THREE.Mesh(wallRingGeo, wallRingMat)
          wallRing1.position.y = -length / 2
          wallRing1.rotation.x = Math.PI / 2
          pipelineGroup.add(wallRing1)

          const wallRing2 = new THREE.Mesh(wallRingGeo.clone(), wallRingMat)
          wallRing2.position.y = length / 2
          wallRing2.rotation.x = Math.PI / 2
          pipelineGroup.add(wallRing2)
        }

        scene.add(pipelineGroup)

        // Ground plane
        const groundGeometry = new THREE.PlaneGeometry(30, 30, 20, 20)
        const groundMaterial = new THREE.MeshStandardMaterial({
          color: 0x2d5016,
          roughness: 0.9
        })
        const ground = new THREE.Mesh(groundGeometry, groundMaterial)
        ground.rotation.x = -Math.PI / 2
        ground.position.y = -outerRadius - 0.5
        ground.receiveShadow = true
        scene.add(ground)

        // Grid helper
        const gridHelper = new THREE.GridHelper(30, 30, 0x60a5fa, 0x4a5568)
        gridHelper.position.y = -outerRadius - 0.49
        scene.add(gridHelper)

        // Animation loop
        let time = 0
        const animate = () => {
          if (!mounted) return
          animationId = requestAnimationFrame(animate)

          time += 0.016 // ~60fps

          // Animate CFD fluid particles
          if (viewMode === 'cfd' && particles.length > 0) {
            particles.forEach((particle: any) => {
              if (particle.type === 'fluid') {
                const posArray = particle.system.geometry.attributes.position.array as Float32Array
                const velocities = particle.velocities as Float32Array
                const radials = particle.radialPositions as Float32Array
                const phases = particle.phases as Float32Array
                const iRadius = particle.innerRadius as number

                // Turbulence intensity based on flow regime
                // Laminar: minimal turbulence, Transitional: moderate, Turbulent: high
                const baseTurbulence = flowRegime === 'laminar' ? 0.0005
                  : flowRegime === 'transitional' ? 0.002
                  : 0.005

                // Turbulence frequency increases with Reynolds number
                const turbulenceFreq = flowRegime === 'laminar' ? 1.0
                  : flowRegime === 'transitional' ? 2.5
                  : 4.0

                // Flow speed multiplier based on actual velocity
                const speedMultiplier = Math.min(flowVelocity / 10, 2.0) * 0.012

                for (let i = 0; i < velocities.length; i++) {
                  // Main flow along Y-axis - speed based on actual flow velocity
                  posArray[i * 3 + 1] += velocities[i] * speedMultiplier

                  // Turbulent motion - intensity varies by flow regime and radial position
                  // More turbulence near walls for turbulent flow, less for laminar
                  const wallProximity = radials[i] // 0 at center, 1 at wall
                  const turbulenceScale = baseTurbulence * (flowRegime === 'laminar'
                    ? (1 - wallProximity * 0.5) // Laminar: slightly less at walls
                    : (0.3 + wallProximity * 0.7)) // Turbulent: more at walls

                  const phase = phases[i]
                  posArray[i * 3] += Math.sin(time * turbulenceFreq + phase) * turbulenceScale
                  posArray[i * 3 + 2] += Math.cos(time * turbulenceFreq * 0.8 + phase * 1.3) * turbulenceScale

                  // Keep particles inside pipe
                  const x = posArray[i * 3]
                  const z = posArray[i * 3 + 2]
                  const currentR = Math.sqrt(x * x + z * z)
                  if (currentR > iRadius * 0.92) {
                    const scale = (iRadius * 0.9) / currentR
                    posArray[i * 3] *= scale
                    posArray[i * 3 + 2] *= scale
                  }

                  // Wrap around when particle exits
                  if (posArray[i * 3 + 1] > length / 2) {
                    posArray[i * 3 + 1] = -length / 2
                    // Randomize position slightly on wrap
                    const newAngle = Math.random() * Math.PI * 2
                    const newR = Math.pow(Math.random(), 0.7) * iRadius * 0.92
                    posArray[i * 3] = Math.cos(newAngle) * newR
                    posArray[i * 3 + 2] = Math.sin(newAngle) * newR
                  }
                }

                particle.system.geometry.attributes.position.needsUpdate = true

                // Update time uniform
                if (particle.material.uniforms && particle.material.uniforms.time) {
                  particle.material.uniforms.time.value = time
                }
              }
            })
          }

          controls.update()
          renderer.render(scene, camera)
        }

        animate()
        setLoading(false)

        // Handle resize
        const handleResize = () => {
          if (!container) return
          const width = container.clientWidth
          const height = container.clientHeight
          camera.aspect = width / height
          camera.updateProjectionMatrix()
          renderer.setSize(width, height)
        }
        window.addEventListener('resize', handleResize)

        return () => {
          window.removeEventListener('resize', handleResize)
        }
      } catch (err: any) {
        console.error('Failed to initialize 3D scene:', err)
        setError(err.message || 'Failed to load 3D viewer')
        setLoading(false)
      }
    }

    initScene()

    return () => {
      mounted = false
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
      if (renderer && containerRef.current) {
        containerRef.current.removeChild(renderer.domElement)
        renderer.dispose()
      }
      particles = []
    }
  }, [diameter, length, wallThickness, showCutaway, flowVelocity, viewMode, fluidDensity, fluidViscosity, flowRegime, reynolds])

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/5">
        <div className="text-center p-6">
          <p className="text-sm text-destructive mb-2">Failed to load 3D viewer</p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/5 z-10">
          <div className="flex flex-col items-center gap-2 text-white">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-sm font-mono">Loading 3D Scene...</span>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}
