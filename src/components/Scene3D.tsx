import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text3D, Float } from "@react-three/drei";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh } from "three";

function RotatingCube() {
  const meshRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.5;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.3;
    }
  });

  return (
    <mesh ref={meshRef} position={[2, 0, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial 
        color="cyan" 
        transparent 
        opacity={0.8}
        roughness={0.3}
        metalness={0.7}
      />
    </mesh>
  );
}

function FloatingTorus() {
  return (
    <Float speed={2} rotationIntensity={1} floatIntensity={0.5}>
      <mesh position={[-2, 0, 0]}>
        <torusGeometry args={[1, 0.3, 16, 100]} />
        <meshStandardMaterial 
          color="cyan"
          transparent
          opacity={0.6}
          wireframe
        />
      </mesh>
    </Float>
  );
}

export function Scene3D() {
  return (
    <div className="h-[400px] w-full">
      <Canvas camera={{ position: [0, 0, 8], fov: 75 }}>
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={0.8} color="cyan" />
        <pointLight position={[-10, -10, -10]} intensity={0.4} color="blue" />
        
        <RotatingCube />
        <FloatingTorus />
        
        <Float speed={1} rotationIntensity={0.5} floatIntensity={0.3}>
          <Text3D
            font="/fonts/helvetiker_regular.typeface.json"
            size={0.5}
            height={0.1}
            curveSegments={12}
            position={[0, 1.5, 0]}
          >
            Evolution
            <meshStandardMaterial color="cyan" />
          </Text3D>
        </Float>
        
        <OrbitControls 
          enablePan={false} 
          enableZoom={false} 
          maxPolarAngle={Math.PI / 2}
          minPolarAngle={Math.PI / 2}
        />
      </Canvas>
    </div>
  );
}