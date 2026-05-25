import React, { useState, useRef, useLayoutEffect, useMemo } from 'react';
import { create } from 'zustand';
import { Stage, Layer, Shape, Circle, Group, Line } from 'react-konva';

// ==========================================
// 1. EL CEREBRO MATEMÁTICO (ZUSTAND)
// ==========================================
export interface ExNode { id: string; t: string; x: number; y: number; pairId?: string; }
export interface ExPlane { id: string; name: string; type: string; vX: number; p1: {x:number, y:number}; p2: {x:number, y:number}; customStyle?: 'solid' | 'dashed'; }
export interface ExSegment { id: string; label: string; p1: {x:number, y:number}; p2: {x:number, y:number}; isDashed?: boolean; customStyle?: 'solid' | 'dashed'; }
export interface Exercise {
  id: string; title: string; type: string; w: string; h: string; dataStr: string;
  state: { ltY: number; originX: number; ppX: number; reqRegla: boolean; reqPP: boolean; reqOrigin: boolean; planes: ExPlane[]; segments: ExSegment[]; pts: {id:string, name:string, nodes:ExNode[]}[]; bounds?: { ltX1: number; ltX2: number; oY1: number; oY2: number; pY1: number; pY2: number; } };
}

interface CadStore {
  exercises: Exercise[];
  isPrinting: boolean;
  pageSize: 'A4' | 'A3';
  fontFamily: string;
  fontSize: number;
  setPageConfig: (config: Partial<{pageSize: 'A4'|'A3', fontFamily: string, fontSize: number}>) => void;
  setPrinting: (val: boolean) => void;
  addExercise: (opts: any) => void;
  removeExercise: (id: string) => void;
  updateBoxSize: (id: string, w: string, h: string) => void;
  applyGeometricConstraint: (exId: string, id1: string, id2: string, type: 'parallel' | 'perp') => void;
  updateNode: (exId: string, ptId: string, nodeId: string, newX: number, newY: number) => void;
  updatePlane: (exId: string, planeId: string, newVX: number) => void;
  updatePlaneEndpoint: (exId: string, planeId: string, traceNum: 1|2, newX: number, newY: number) => void;
  togglePlaneType: (exId: string, planeId: string) => void;
  toggleLineStyle: (exId: string, elemType: 'recta' | 'plano', elemId: string) => void;
  updateSegment: (exId: string, segId: string, pointIndex: 1|2, newX: number, newY: number) => void;
  updateSystem: (exId: string, target: string, valX: number, valY: number) => void;
  addFreeElement: (exId: string, elemType: 'punto' | 'recta' | 'plano') => void;
  removeElement: (exId: string, elemType: 'punto' | 'recta' | 'plano', elemId: string) => void;
  updateName: (exId: string, elemType: 'punto' | 'recta' | 'plano', elemId: string, newName: string) => void;
  updateExerciseText: (exId: string, field: 'title' | 'dataStr', text: string) => void;
  saveData: () => void;
  loadData: () => void;
  downloadData: () => void;
}

const SF = 3.5;
const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const uid = () => Date.now().toString() + Math.random().toString().slice(2, 6);

function applyQuad(val: number, quad: string, isZ: boolean) {
  let a = Math.abs(val);
  if (!quad || quad === 'any') return val;
  if (quad === '1') return isZ ? a : a;       
  if (quad === '2') return isZ ? a : -a;      
  if (quad === '3') return isZ ? -a : -a;     
  if (quad === '4') return isZ ? -a : a;      
  return val;
}

const savedData = localStorage.getItem('diedrico_autosave');
const initialExercises = savedData ? JSON.parse(savedData) : [];

export const useStore = create<CadStore>()((set, get) => ({
  exercises: initialExercises,
  isPrinting: false,
  pageSize: 'A4',
  fontFamily: "'Segoe UI', sans-serif",
  fontSize: 13,
  
  setPageConfig: (config) => set((state) => ({ ...state, ...config })),
  setPrinting: (val) => set({ isPrinting: val }),
  
  saveData: () => { 
    localStorage.setItem('diedrico_pro_data', JSON.stringify(get().exercises)); 
    alert("Lámina guardada."); 
  },
  loadData: () => { 
    const d = localStorage.getItem('diedrico_pro_data'); 
    if (d) set({ exercises: JSON.parse(d) }); 
  },
  downloadData: () => { 
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(get().exercises));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `lamina_diedrico_${new Date().getTime()}.json`;
    a.click();
  },

  addExercise: (opts) => set((state) => {
    const originX = 400; const ltY = 250;
    const newEx: Exercise = {
      id: uid(), type: opts.type, title: "Nuevo Ejercicio", w: "50%", h: "136mm", dataStr: "",
      state: { ltY, originX, ppX: 750, reqRegla: opts.reqRegla, reqPP: opts.reqPP, reqOrigin: opts.reqOrigin, planes: [], segments: [], pts: [], bounds: { ltX1: 0, ltX2: 800, oY1: 0, oY2: 400, pY1: 0, pY2: 400 } }
    };
    return { exercises: [...state.exercises, newEx] };
  }),

  applyGeometricConstraint: (exId, id1, id2, type) => set((state) => ({
      exercises: state.exercises.map(ex => {
          if (ex.id !== exId) return ex;
          let s = {...ex.state};
          const getCoords = (id: string) => {
              let seg = s.segments.find(s => s.id === id.split('_')[1]);
              return seg ? {x1: seg.p1.x, y1: seg.p1.y, x2: seg.p2.x, y2: seg.p2.y} : null;
          };
          const c1 = getCoords(id1); const c2 = getCoords(id2);
          if (!c1 || !c2) return ex;
          
          const angle1 = Math.atan2(c1.y2 - c1.y1, c1.x2 - c1.x1);
          const targetAngle = type === 'parallel' ? angle1 : angle1 + Math.PI/2;
          const len = Math.sqrt(Math.pow(c2.x2 - c2.x1, 2) + Math.pow(c2.y2 - c2.y1, 2));
          
          s.segments = s.segments.map(seg => {
              if (seg.id === id2.split('_')[1]) {
                  return {...seg, p2: {x: seg.p1.x + Math.cos(targetAngle)*len, y: seg.p1.y + Math.sin(targetAngle)*len}};
              }
              return seg;
          });
          return {...ex, state: s};
      })
  })),

  removeExercise: (id) => set((state) => ({ exercises: state.exercises.filter(e => e.id !== id) })),
  updateBoxSize: (id, w, h) => set((state) => ({ exercises: state.exercises.map(ex => ex.id === id ? { ...ex, w, h } : ex) })),
  updateNode: (exId, ptId, nodeId, newX, newY) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state };
      s.pts = s.pts.map(p => p.id !== ptId ? p : { ...p, nodes: p.nodes.map(n => n.id === nodeId ? { ...n, x: newX, y: newY } : n) });
      return { ...ex, state: s };
    })
  })),
  updatePlane: (exId, planeId, newVX) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = {...ex.state, planes: ex.state.planes.map(pl => {
          if (pl.id !== planeId) return pl;
          let dx = newVX - pl.vX;
          return { ...pl, vX: newVX, p1: {x: pl.p1.x + dx, y: pl.p1.y}, p2: {x: pl.p2.x + dx, y: pl.p2.y} };
      })};
      return {...ex, state: s};
    })
  })),
  updatePlaneEndpoint: (exId, planeId, traceNum, newX, newY) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = {...ex.state, planes: ex.state.planes.map(pl => {
            if (pl.id !== planeId) return pl;
            return traceNum === 1 ? { ...pl, p1: { x: newX, y: newY } } : { ...pl, p2: { x: newX, y: newY } };
      })};
      return {...ex, state: s};
    })
  })),
  togglePlaneType: (exId, planeId) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      return { ...ex, state: { ...ex.state, planes: ex.state.planes.map(pl => pl.id !== planeId ? pl : { ...pl, type: pl.type === 'paralelo_lt' ? 'oblicuo' : 'paralelo_lt' })}};
    })
  })),
  toggleLineStyle: (exId, elemType, elemId) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state };
      const nextStyle = (current?: string) => current === 'solid' ? 'dashed' : current === 'dashed' ? undefined : 'solid';
      if (elemType === 'recta') s.segments = s.segments.map(seg => seg.id === elemId ? { ...seg, customStyle: nextStyle(seg.customStyle) } : seg);
      else if (elemType === 'plano') s.planes = s.planes.map(pl => pl.id === elemId ? { ...pl, customStyle: nextStyle(pl.customStyle) } : pl);
      return { ...ex, state: s };
    })
  })),
  updateSegment: (exId, segId, pointIndex, newX, newY) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = {...ex.state, segments: ex.state.segments.map(seg => {
            if (seg.id !== segId) return seg;
            return pointIndex === 1 ? { ...seg, p1: { x: newX, y: newY } } : { ...seg, p2: { x: newX, y: newY } };
          })};
      return {...ex, state: s};
    })
  })),
  updateSystem: (exId, target, valX, valY) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state };
      if (target === 'pp') s.ppX = valX;
      return { ...ex, state: s };
    })
  })),
  addFreeElement: (exId, elemType) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state };
      if (elemType === 'recta') {
          const nextL = String.fromCharCode(114 + Math.floor(s.segments.length / 2));
          s.segments = [...s.segments, { id:uid(), label:`${nextL}2`, p1:{x:s.originX-50, y:s.ltY-20}, p2:{x:s.originX+50, y:s.ltY-70} }, { id:uid(), label:`${nextL}1`, p1:{x:s.originX-50, y:s.ltY+30}, p2:{x:s.originX+50, y:s.ltY+80} }];
      }
      return { ...ex, state: s };
    })
  })),
  removeElement: (exId, elemType, elemId) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state };
      if (elemType === 'recta') s.segments = s.segments.filter(sg => sg.id !== elemId);
      return { ...ex, state: s };
    })
  })),
  updateName: (exId, elemType, elemId, newName) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if(ex.id !== exId) return ex;
      let s = {...ex.state};
      if(elemType === 'recta') s.segments = s.segments.map(seg => seg.id === elemId ? {...seg, label: newName} : seg);
      return {...ex, state: s};
    })
  })),
  updateExerciseText: (exId, field, text) => set((state) => ({
    exercises: state.exercises.map(ex => ex.id !== exId ? ex : { ...ex, [field]: text })
  }))
}));

// ==========================================
// 2. EL MOTOR DE DIBUJO (COMPONENTE View2D)
// ==========================================
function View2D({ ex }: { ex: Exercise, selectedId: string | null, setSelectedId: (id: string|null) => void }) {
  const { ltY, originX, planes, segments } = ex.state;
  const containerRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ w: 800, h: 400 });

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => { setDim({ w: entries[0].contentRect.width, h: entries[0].contentRect.height }); });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const scale = Math.min(dim.w / 800, dim.h / 400) || 1;
  const sc = (val: number) => val / scale;

  return (
    <div ref={containerRef} style={{width: '100%', height: '100%'}}>
      <Stage width={dim.w} height={dim.h}>
        <Layer scaleX={scale} scaleY={scale}>
            {segments.map(seg => (
                <Line key={seg.id} points={[seg.p1.x, seg.p1.y, seg.p2.x, seg.p2.y]} stroke="black" strokeWidth={sc(2.2)} 
                      onContextMenu={(e)=>{ e.evt.preventDefault(); setSelectedId(`seg_${seg.id}`); }} />
            ))}
        </Layer>
      </Stage>
    </div>
  );
}

// ==========================================
// 3. INTERFAZ Y LÓGICA PRINCIPAL
// ==========================================
export default function App() {
  const { exercises, addExercise, removeExercise, applyGeometricConstraint, toggleLineStyle, pageSize, fontFamily, fontSize, setPageConfig } = useStore();
  const [selection, setSelection] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{x:number, y:number, id:string} | null>(null);

  const handleSelection = (id: string) => {
      if (selection.includes(id)) setSelection(selection.filter(i => i !== id));
      else setSelection([...selection, id]);
  };

  return (
    <div className="app-container">
        {/* ... (resto del JSX de App incluyendo el menú y la lógica de renderizado) ... */}
        {/* NOTA: He simplificado la estructura para que te centres en la lógica */}
        <div className="main-area">
            {exercises.map(ex => (
                <div key={ex.id} className="exercise-box" 
                     onContextMenu={(e) => { e.preventDefault(); setContextMenu({x: e.clientX, y: e.clientY, id: ex.id}); }}>
                    <View2D ex={ex} selectedId={selection[0]} setSelectedId={handleSelection} />
                </div>
            ))}
        </div>
        {contextMenu && (
            <div style={{position: 'fixed', top: contextMenu.y, left: contextMenu.x, background: '#1e1e2f', padding: '10px', borderRadius: '5px'}}>
                {selection.length === 2 && (
                    <>
                        <button onClick={() => { applyGeometricConstraint(contextMenu.id, selection[0], selection[1], 'parallel'); setSelection([]); setContextMenu(null); }}>// Paralela</button>
                        <button onClick={() => { applyGeometricConstraint(contextMenu.id, selection[0], selection[1], 'perp'); setSelection([]); setContextMenu(null); }}>⟂ Perpend.</button>
                    </>
                )}
                <button onClick={() => setSelection([])}>Limpiar selección</button>
            </div>
        )}
    </div>
  );
}
