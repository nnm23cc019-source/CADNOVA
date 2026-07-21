import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useCadStore } from '../store/cadStore';

const Canvas3D = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { shapes, devices, walls } = useCadStore();
  
  // Store refs to clean up ThreeJS scene
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize Three.js
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f172a');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    camera.position.set(0, 500, 800);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(500, 1000, 500);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Grid Helper
    const gridHelper = new THREE.GridHelper(2000, 50, 0x4f46e5, 0x1e293b);
    scene.add(gridHelper);

    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle Resize
    const handleResize = () => {
      if (containerRef.current) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Update Scene when zustand store changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear dynamic objects (for simplicity in this basic port, we just remove and re-add. In prod, we'd sync them by ID)
    const objectsToRemove = scene.children.filter(child => child.userData.isDynamic);
    objectsToRemove.forEach(obj => scene.remove(obj));

    // Render Shapes
    shapes.forEach(shape => {
      let geometry: THREE.BufferGeometry;
      switch (shape.type) {
        case 'cube': geometry = new THREE.BoxGeometry(shape.size || 50, shape.size || 50, shape.size || 50); break;
        case 'cylinder': geometry = new THREE.CylinderGeometry(shape.radius || 25, shape.radius || 25, shape.height || 100, 32); break;
        default: geometry = new THREE.BoxGeometry(50, 50, 50);
      }
      
      const material = new THREE.MeshStandardMaterial({ 
        color: shape.material === 'Steel' ? 0x94a3b8 : 0xf59f00,
        metalness: shape.material === 'Steel' ? 0.8 : 0.1,
        roughness: 0.2
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(shape.x, shape.z || 25, shape.y); // Mapping 2D Y to 3D Z
      mesh.userData = { id: shape.id, isDynamic: true };
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    });

    // Render Walls
    walls.forEach(wall => {
      const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
      const cx = (wall.x1 + wall.x2) / 2;
      const cy = (wall.y1 + wall.y2) / 2;
      const thickness = wall.thickness || 8;
      const height = 120; // Default wall height

      const geometry = new THREE.BoxGeometry(length, height, thickness);
      const material = new THREE.MeshStandardMaterial({ color: 0xe2e8f0 });
      const mesh = new THREE.Mesh(geometry, material);
      
      mesh.position.set(cx, height / 2, cy);
      mesh.rotation.y = -angle;
      mesh.userData = { id: wall.id, isDynamic: true };
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    });

  }, [shapes, devices, walls]);

  return <div ref={containerRef} className="absolute inset-0 bg-slate-900 overflow-hidden" />;
};

export default Canvas3D;
