'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export const WireframeBackground = () => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Scene Setup
    const scene = new THREE.Scene()
    // Reduced fog density to see further down the pipeline
    scene.fog = new THREE.FogExp2(0x000000, 0.015)

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
    
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    containerRef.current.appendChild(renderer.domElement)

    // --- Math & Generation Constants ---
    const chunkLength = 200
    // Base frequency for periodicity: 2 * PI / chunkLength
    const k = (2 * Math.PI) / chunkLength

    // Periodic Path Function
    // Ensures f(x) == f(x + chunkLength) and f'(x) == f'(x + chunkLength)
    const getPipelinePathY = (x: number) => {
        // Using integer multiples of k for frequency ensures periodicity
        // Original: sin(0.05x)*15 + cos(0.01x)*5
        // 0.05 is approx 1.6 * k. Let's align to closest integers.
        // k ~ 0.0314. 
        // 2k ~ 0.06. 1k ~ 0.03.
        return Math.sin(x * k * 2) * 12 + Math.cos(x * k * 1) * 6
    }

    // Periodic Elevation Function
    const getElevation = (x: number, y: number) => {
        const pathY = getPipelinePathY(x)
        const distToPath = Math.abs(y - pathY)
        
        // Valley width
        const valleyWidth = 15
        const valleyFactor = 1 - Math.exp(-(distToPath * distToPath) / (valleyWidth * valleyWidth))
        
        // Periodic Noise
        // x-components must be periodic (multiples of k)
        // y-components don't strictly need to be periodic for looping along X, but good for consistency
        const noise = 
            Math.sin(x * k * 3) * Math.cos(y * 0.08) * 8 +    
            Math.sin(x * k * 8 + 10) * Math.cos(y * 0.2 + 20) * 3
            
        // Removed random noise to ensure perfect tiling seaming
            
        const grading = Math.sin(x * k * 4) * 3 

        return (noise * valleyFactor) + (grading * (1 - valleyFactor))
    }

    // --- Mesh Generation Helper ---
    const createChunk = () => {
        const chunkGroup = new THREE.Group()
        
        // 1. Terrain
        const segments = 120
        const geometry = new THREE.PlaneGeometry(chunkLength, chunkLength, segments, segments)
        const positionAttribute = geometry.attributes.position
        const vertex = new THREE.Vector3()

        for (let i = 0; i < positionAttribute.count; i++) {
            vertex.fromBufferAttribute(positionAttribute, i)
            // PlaneGeometry creates centered at 0. So x range [-100, 100]
            const z = getElevation(vertex.x, vertex.y)
            positionAttribute.setXYZ(i, vertex.x, vertex.y, z)
        }
        geometry.computeVertexNormals()
        
        const terrainMat = new THREE.MeshBasicMaterial({ 
            color: 0xffffff, wireframe: true, transparent: true, opacity: 0.12, side: THREE.DoubleSide
        })
        const terrain = new THREE.Mesh(geometry, terrainMat)
        terrain.rotation.x = -Math.PI / 2
        chunkGroup.add(terrain)

        // 2. Pipeline
        const curvePoints: THREE.Vector3[] = []
        const steps = 100
        for (let i = 0; i <= steps; i++) {
            const x = (i / steps) * chunkLength - (chunkLength / 2)
            const y = getPipelinePathY(x)
            const z = getElevation(x, y) + 1.2
            curvePoints.push(new THREE.Vector3(x, y, z))
        }
        
        // CatmullRomCurve3 is fine, but we need to ensure start/end tangents align for tiling.
        // With periodic points, the shape aligns. The tangents will be close enough for wireframe.
        const curve = new THREE.CatmullRomCurve3(curvePoints)
        const tubeGeom = new THREE.TubeGeometry(curve, 150, 0.4, 8, false)
        const tubeMat = new THREE.MeshBasicMaterial({ 
            color: 0xef4444, wireframe: true, transparent: true, opacity: 0.8 
        })
        const pipeline = new THREE.Mesh(tubeGeom, tubeMat)
        // Pipeline needs to be rotated to match terrain's space (-90 X)
        // OR add it to terrain? No, terrain is mesh. Add to group.
        // But terrain is rotated -PI/2.
        // If we add pipeline to chunkGroup directly, we need to match that coordinate system.
        // Our curve points (x, y, z) correspond to (x, y, elevation).
        // Terrain (plane) local coords: x=x, y=y, z=elevation.
        // Terrain mesh rotation -90 X transforms:
        // Local (x, y, z) -> World (x, z, -y) ?? 
        // No. Plane (x,y) is flat. Z is bump.
        // Rot -90 X: Plane X -> World X. Plane Y -> World Z (depth). Plane Z -> World Y (height).
        // Wait, standard PlaneGeometry lies on XY plane. Z is normal.
        // If we map x->x, y->y (depth), z->height (elevation).
        // Then we constructed the plane where Y is "depth" and Z is "height".
        // Rot -90 on X aligns Plane +Y to World -Z? No.
        // Let's stick to adding pipeline as child of terrain to inherit its space.
        terrain.add(pipeline)

        // 3. Supports
        const supportsGroup = new THREE.Group()
        terrain.add(supportsGroup)
        
        const numSupports = 8
        const pipeRadius = 0.4
        for (let i = 0; i < numSupports; i++) {
            const t = i / (numSupports - 1)
            const pos = curve.getPointAt(t)
            const groundZ = getElevation(pos.x, pos.y)
            const pipeBottomZ = pos.z - pipeRadius
            const totalHeight = pipeBottomZ - groundZ
            
            if (totalHeight > 0.1) {
                const supportNode = new THREE.Group()
                supportNode.position.set(pos.x, pos.y, groundZ)
                
                // 1. Vertical Pillar (Box Column)
                // Height is totalHeight, width/depth is fixed
                const pillarHeight = totalHeight
                const pillarGeom = new THREE.BoxGeometry(0.3, 0.3, pillarHeight)
                // Box is created centered at 0,0,0. Move it up by half height so its base is at 0
                pillarGeom.translate(0, 0, pillarHeight / 2)
                
                const supportMat = new THREE.MeshBasicMaterial({ 
                    color: 0xef4444, wireframe: true, transparent: true, opacity: 0.6 
                })
                const pillar = new THREE.Mesh(pillarGeom, supportMat)
                supportNode.add(pillar)
                supportsGroup.add(supportNode)
            }
        }
        
        return chunkGroup
    }

    // Create two identical chunks for looping
    const chunk1 = createChunk()
    const chunk2 = createChunk() // Clone wouldn't clone geometry unique needs easily, safer to recreate with deterministic math
    
    // Position Chunks
    // Chunk 1 at 0. Chunk 2 at +chunkLength.
    // However, mesh center is 0. So Chunk 1 covers [-100, 100]. Chunk 2 covers [100, 300].
    chunk1.position.x = 0
    chunk2.position.x = chunkLength
    
    scene.add(chunk1)
    scene.add(chunk2)


    // --- Interaction & Animation ---
    let boost = 0
    let lastScrollY = window.scrollY
    let virtualCameraX = 0 // Track where the camera "is" along the infinite path
    let lastTime = performance.now() // Track time for delta calculation
    
    // Speeds in units per SECOND (independent of frame rate)
    const baseSpeedPerSecond = 1.2  // Adjusted for delta time: 0.02 * 60fps ~= 1.2
    
    let frameId: number
    const animate = (time: number) => {
      frameId = requestAnimationFrame(animate)

      // Calculate Delta Time (seconds)
      const deltaTime = Math.min((time - lastTime) / 1000, 0.1) // Cap delta to prevent huge jumps on lag
      lastTime = time

      // Scroll Boost Logic
      const currentScrollY = window.scrollY
      const scrollDelta = Math.abs(currentScrollY - lastScrollY)
      lastScrollY = currentScrollY
      
      // Sensitivity: Independent of frame rate (pixel delta is frame dependent inherently, 
      // but we apply impulse to velocity which is handled per frame).
      // Ideally, scrollDelta relates to distance moved.
      if (scrollDelta > 0 && currentScrollY < window.innerHeight) {
        // Boost impulse. Since scroll events happen per frame/input tick, 
        // we add impulse directly.
        boost += scrollDelta * 0.0005 
      }
      
      // Cap boost
      boost = Math.min(boost, 0.05) 
      
      // Decay boost: Time-based decay
      // decay factor per second = 0.05 (very fast decay) -> 0.95^60 ~= 0.04 remainder after 1s
      // We want ~0.95 per frame at 60fps.
      // formula: value *= Math.pow(decayRate, deltaTime * 60)
      boost *= Math.pow(0.95, deltaTime * 60)

      // Current Speed (Units per Second)
      // Boost is essentially a velocity modifier, treat it as units/frame approx or scale it.
      // Let's treat boost as additive units per frame for simplicity (scroll is input event),
      // then scale by 60 to get per-second equivalent if we want consistency?
      // Actually, simplest is: currentSpeedPerFrame = baseSpeed * deltaTime + boost * correction?
      // Boost logic above is frame-based accumulation. Let's keep boost as "units per frame" addition
      // but ensure its application to movement is consistent.
      
      // Base movement is time based
      const movement = (baseSpeedPerSecond * deltaTime) + (boost * (deltaTime * 60)) // approximate normalization

      // Move Chunks (World moves -X)
      chunk1.position.x -= movement
      chunk2.position.x -= movement
      
      // Loop Chunks
      if (chunk1.position.x < -chunkLength) chunk1.position.x += chunkLength * 2
      if (chunk2.position.x < -chunkLength) chunk2.position.x += chunkLength * 2
      
      // Update Virtual Camera Position
      virtualCameraX += movement
      
      // Calculate Camera Y/Z based on path at virtual X
      const pipeY = getPipelinePathY(virtualCameraX)
      const pipeZ = getElevation(virtualCameraX, pipeY) + 1.2
      
      // Calculate Tangent for LookAt
      const delta = 0.1
      const nextY = getPipelinePathY(virtualCameraX + delta)
      const nextZ = getElevation(virtualCameraX + delta, nextY) + 1.2
      
      const currentPos = new THREE.Vector3(virtualCameraX, pipeY, pipeZ)
      const nextPos = new THREE.Vector3(virtualCameraX + delta, nextY, nextZ)
      const tangent = nextPos.clone().sub(currentPos).normalize()
      
      // Camera Position in "Pipe Space" (Terrain Space)
      const offsetBack = tangent.clone().multiplyScalar(-8)
      const offsetUp = new THREE.Vector3(0, 0, 4)
      const targetLocal = new THREE.Vector3(virtualCameraX, pipeY, pipeZ)
      const camLocal = targetLocal.clone().add(offsetBack).add(offsetUp)
      const lookLocal = targetLocal.clone().add(tangent.clone().multiplyScalar(10))
      
      // Transform Local -> World
      const worldCamX = camLocal.x - virtualCameraX
      const worldCamY = camLocal.z     // Height
      const worldCamZ = -camLocal.y    // Depth (Y becomes -Z after rot)
      
      const worldLookX = lookLocal.x - virtualCameraX
      const worldLookY = lookLocal.z
      const worldLookZ = -lookLocal.y
      
      camera.position.set(worldCamX, worldCamY, worldCamZ)
      camera.lookAt(worldLookX, worldLookY, worldLookZ)

      renderer.render(scene, camera)
    }

    animate(performance.now())

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(frameId)
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement)
      }
      // cleanup meshes/materials...
    }
  }, [])

  return (
    <div 
      ref={containerRef} 
      className="absolute inset-0 z-0 pointer-events-none opacity-60"
    />
  )
}
