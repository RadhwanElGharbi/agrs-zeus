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
}

export function PipelineViewer3D({
  diameter,
  wallThickness,
  length = 20,
  showCutaway = true,
  flowVelocity = 2.5,
  viewMode = 'pipe',
  fluidDensity = 800, // kg/m³ for crude oil
  fluidViscosity = 0.005 // Pa·s for crude oil
}: PipelineViewer3DProps) {
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
          // Transparent pipe shell for context
          const pipeGeometry = new THREE.CylinderGeometry(
            outerRadius,
            outerRadius,
            length,
            32,
            1,
            !showCutaway
          )
          const pipeMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a5568,
            metalness: 0.7,
            roughness: 0.3,
            transparent: true,
            opacity: 0.2,
            side: showCutaway ? THREE.DoubleSide : THREE.FrontSide
          })
          const pipe = new THREE.Mesh(pipeGeometry, pipeMaterial)
          pipelineGroup.add(pipe)

          // Create fluid particle system for CFD visualization
          const particleCount = 1000
          const particleGeometry = new THREE.BufferGeometry()
          const positions = new Float32Array(particleCount * 3)
          const velocities = new Float32Array(particleCount)
          const colors = new Float32Array(particleCount * 3)

          // Initialize particles in a cylindrical volume
          for (let i = 0; i < particleCount; i++) {
            // Random position in cylinder
            const angle = Math.random() * Math.PI * 2
            const radius = Math.sqrt(Math.random()) * innerRadius * 0.95
            const x = (Math.random() - 0.5) * length
            const y = Math.cos(angle) * radius
            const z = Math.sin(angle) * radius

            positions[i * 3] = x
            positions[i * 3 + 1] = y
            positions[i * 3 + 2] = z

            // Velocity based on distance from center (parabolic profile)
            const radialPos = Math.sqrt(y * y + z * z) / innerRadius
            velocities[i] = flowVelocity * (1 - radialPos * radialPos) * 2 // Parabolic velocity profile

            // Color based on velocity (blue = slow, red = fast)
            const velocityNorm = velocities[i] / (flowVelocity * 2)
            colors[i * 3] = velocityNorm * 0.8 + 0.2 // R
            colors[i * 3 + 1] = (1 - velocityNorm) * 0.5 + 0.3 // G
            colors[i * 3 + 2] = (1 - velocityNorm) * 0.8 + 0.5 // B
          }

          particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
          particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

          const particleMaterial = new THREE.PointsMaterial({
            size: 0.08,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
          })

          const particleSystem = new THREE.Points(particleGeometry, particleMaterial)
          pipelineGroup.add(particleSystem)

          // Store for animation
          particles.push({ system: particleSystem, velocities, positions })

          // Add velocity vectors (arrows)
          if (showCutaway) {
            const arrowMaterial = new THREE.MeshStandardMaterial({
              color: 0x60a5fa,
              emissive: 0x3b82f6,
              emissiveIntensity: 0.5,
              transparent: true,
              opacity: 0.7
            })

            const numArrows = 5
            for (let i = 0; i < numArrows; i++) {
              const pos = (i / (numArrows - 1)) * length - length / 2
              const radius = innerRadius * 0.5

              const arrowGeometry = new THREE.ConeGeometry(
                innerRadius * 0.2,
                innerRadius * 0.6,
                8
              )
              const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial)
              arrow.position.x = pos
              arrow.position.y = radius
              arrow.rotation.z = -Math.PI / 2
              pipelineGroup.add(arrow)
            }
          }
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

          // Animate CFD particles
          if (viewMode === 'cfd' && particles.length > 0) {
            particles.forEach(({ system, velocities, positions }) => {
              const posArray = system.geometry.attributes.position.array as Float32Array

              for (let i = 0; i < velocities.length; i++) {
                // Move particle along x-axis based on velocity
                posArray[i * 3] += velocities[i] * 0.016

                // Wrap around when particle exits
                if (posArray[i * 3] > length / 2) {
                  posArray[i * 3] = -length / 2
                }
              }

              system.geometry.attributes.position.needsUpdate = true
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
  }, [diameter, length, wallThickness, showCutaway, flowVelocity, viewMode, fluidDensity, fluidViscosity])

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
