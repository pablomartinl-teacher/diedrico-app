import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Text } from '@react-three/drei';
import { useCadStore } from '../store/useCadStore';

export default function View3D() {
  const { points } = useCadStore();

  return (
    <Canvas camera={{ position: [150, 150, 150], fov: 50 }} style={{ background: '#121218' }}>
      <ambientLight intensity={0.8} />
      <pointLight position={[100, 100, 100]} />
      <OrbitControls />
      <Grid args={[300, 300]} position={[0, 0, 0]} cellColor="#2ed573" sectionColor="#2ed573" />
      <Grid args={[300, 300]} position={[0, 150, -150]} rotation={[Math.PI / 2, 0, 0]} cellColor="#1e90ff" />
      {points.map(p => (
        <mesh key={p.id} position={[p.x, p.z, -p.y]}>
          <sphereGeometry args={[4, 16, 16]} />
          <meshStandardMaterial color="yellow" />
          <Text position={[0, 10, 0]} fontSize={10} color="white">{p.name}</Text>
        </mesh>
      ))}
    </Canvas>
  );
}