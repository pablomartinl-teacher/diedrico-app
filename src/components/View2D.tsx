import { Stage, Layer, Shape, Circle } from 'react-konva';
import { useStore, Exercise } from '../store';

export default function View2D({ ex }: { ex: Exercise }) {
  // LA SOLUCIÓN ESTÁ AQUÍ: Extraer funciones explícitamente con selectores
  const updateNode = useStore((state) => state.updateNode);
  const updatePlane = useStore((state) => state.updatePlane);

  const ltY = useStore((state) => state.exercises.find(e => e.id === ex.id)?.state.ltY);
  const planes = useStore((state) => state.exercises.find(e => e.id === ex.id)?.state.planes);
  const pts = useStore((state) => state.exercises.find(e => e.id === ex.id)?.state.pts);
  const segments = useStore((state) => state.exercises.find(e => e.id === ex.id)?.state.segments);

  const drawScene = (ctx: any, shape: any) => {
    const W = shape.getStage().width();
    
    // Línea de Tierra
    ctx.strokeStyle = "black"; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(0, ltY); ctx.lineTo(W, ltY); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.beginPath(); 
    ctx.moveTo(20, ltY + 6); ctx.lineTo(35, ltY + 6); 
    ctx.moveTo(W - 35, ltY + 6); ctx.lineTo(W - 20, ltY + 6); ctx.stroke();

    // Dibujo de Planos
    planes.forEach(pl => {
      ctx.strokeStyle = "black"; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(pl.vX, ltY); ctx.lineTo(pl.vX + 600, ltY + pl.m2 * 600); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pl.vX, ltY); ctx.lineTo(pl.vX + 600, ltY + pl.m1 * 600); ctx.stroke();
      
      ctx.font = "bold 16px Arial"; ctx.fillStyle = "black";
      ctx.fillText(`${pl.name}2`, pl.vX + 150, ltY + pl.m2 * 150 - 15);
      ctx.fillText(`${pl.name}1`, pl.vX + 150, ltY + pl.m1 * 150 + 20);
    });

    // Dibujo de Segmentos
    segments.forEach(seg => {
        ctx.beginPath(); ctx.moveTo(seg.p1.x, seg.p1.y); ctx.lineTo(seg.p2.x, seg.p2.y); ctx.stroke();
        ctx.font = "bold 16px Arial"; ctx.fillText(seg.label, (seg.p1.x+seg.p2.x)/2 + 5, (seg.p1.y+seg.p2.y)/2 - 5);
    });

    // Líneas de referencia de puntos
    ctx.strokeStyle = "#888"; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
    pts.forEach(p => {
      if(p.nodes.length === 2) {
        ctx.beginPath(); ctx.moveTo(p.nodes[0].x, p.nodes[0].y); ctx.lineTo(p.nodes[1].x, p.nodes[1].y); ctx.stroke();
      }
    });
    ctx.setLineDash([]);
    
    // Nombres de Puntos
    ctx.fillStyle = "black"; ctx.font = "bold 15px Arial";
    pts.forEach(p => {
      p.nodes.forEach(n => { ctx.fillText(`${p.name}${n.t}`, n.x + 10, n.y - 10); });
    });
  };

  return (
    <Stage width={800} height={400} style={{ width: '100%', height: '100%' }}>
      <Layer>
        <Shape sceneFunc={drawScene} />

        {planes.map(pl => (
          <Circle key={pl.id} x={pl.vX} y={ltY} radius={8} fill="rgba(0, 210, 255, 0.5)" draggable
            onDragMove={(e) => updatePlane(ex.id, pl.id, e.target.x())}
          />
        ))}

        {pts.map(p => p.nodes.map(n => (
          <Circle key={n.id} x={n.x} y={n.y} radius={7} fill="#ff4757" draggable
            onDragMove={(e) => updateNode(ex.id, n.id, e.target.x(), e.target.y())}
          />
        )))}
      </Layer>
    </Stage>
  );
}