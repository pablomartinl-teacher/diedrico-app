import React, { useState, useRef, useLayoutEffect, useMemo } from 'react';
import { create } from 'zustand';
import { Stage, Layer, Shape, Circle, Group, Line } from 'react-konva';

// ==========================================
// 1. EL CEREBRO MATEMÁTICO Y GEOMÉTRICO (ZUSTAND)
// ==========================================
export interface ExNode { id: string; t: string; x: number; y: number; pairId?: string; }
export interface ExPlane { id: string; name: string; type: string; vX: number; p1: {x:number, y:number}; p2: {x:number, y:number}; customStyle?: 'solid' | 'dashed'; }
export interface ExSegment { id: string; label: string; p1: {x:number, y:number}; p2: {x:number, y:number}; isDashed?: boolean; customStyle?: 'solid' | 'dashed'; }
export interface Constraint { id: string; type: 'parallel' | 'perp'; el1: string; el2: string; }
export interface Exercise {
  id: string; title: string; type: string; w: string; h: string; dataStr: string;
  state: { ltY: number; originX: number; ppX: number; reqRegla: boolean; reqPP: boolean; reqOrigin: boolean; planes: ExPlane[]; segments: ExSegment[]; pts: {id:string, name:string, nodes:ExNode[]}[]; bounds?: { ltX1: number; ltX2: number; oY1: number; oY2: number; pY1: number; pY2: number; }; constraints: Constraint[]; };
}

export interface Selection { exId: string; type: 'punto'|'recta'|'plano'; id: string; rawId: string; label: string; }

interface CadStore {
  exercises: Exercise[];
  past: Exercise[][];
  future: Exercise[][];
  isPrinting: boolean;
  pageSize: 'A4' | 'A3';
  fontFamily: string;
  fontSize: number;
  zoom: number;
  selection: Selection[];
  
  setSelection: (sel: Selection[]) => void;
  toggleSelection: (item: Selection) => void;
  setPageConfig: (config: Partial<{pageSize: 'A4'|'A3', fontFamily: string, fontSize: number, zoom: number}>) => void;
  setPrinting: (val: boolean) => void;
  
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;

  addExercise: (opts: any) => void;
  removeExercise: (id: string) => void;
  updateBoxSize: (id: string, w: string, h: string) => void;
  
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
  
  addAuxLine: (exId: string, rawId: string, mode: 'parallel' | 'perp') => void;
  addConstraint: (exId: string, type: 'parallel' | 'perp', el1: string, el2: string) => void;
  removeConstraint: (exId: string, constraintId: string) => void;

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

const enforceConstraints = (s: Exercise['state'], triggerId: string) => {
    let changed = true;
    let iterations = 0;
    
    const getSeg = (id: string) => s.segments.find(sg => sg.id === id);
    const getAngle = (seg: ExSegment) => Math.atan2(seg.p2.y - seg.p1.y, seg.p2.x - seg.p1.x);

    while (changed && iterations < 5) {
        changed = false;
        s.constraints.forEach(c => {
            let seg1 = getSeg(c.el1);
            let seg2 = getSeg(c.el2);
            if (!seg1 || !seg2) return;

            let sourceSeg, targetSeg;
            if (c.el1 === triggerId || triggerId === 'all') { sourceSeg = seg1; targetSeg = seg2; }
            else if (c.el2 === triggerId) { sourceSeg = seg2; targetSeg = seg1; }
            else return;

            const angle1 = getAngle(sourceSeg);
            const targetAngle = c.type === 'parallel' ? angle1 : angle1 + Math.PI/2;
            const currentAngle = getAngle(targetSeg);

            if (Math.abs(currentAngle - targetAngle) > 0.001 && Math.abs(currentAngle - targetAngle + Math.PI) > 0.001 && Math.abs(currentAngle - targetAngle - Math.PI) > 0.001) {
                const cx = (targetSeg.p1.x + targetSeg.p2.x) / 2;
                const cy = (targetSeg.p1.y + targetSeg.p2.y) / 2;
                const len = Math.sqrt(Math.pow(targetSeg.p2.x - targetSeg.p1.x, 2) + Math.pow(targetSeg.p2.y - targetSeg.p1.y, 2)) / 2;
                
                targetSeg.p1 = { x: cx - Math.cos(targetAngle)*len, y: cy - Math.sin(targetAngle)*len };
                targetSeg.p2 = { x: cx + Math.cos(targetAngle)*len, y: cy + Math.sin(targetAngle)*len };
                changed = true;
            }
        });
        iterations++;
    }
    return s;
};

export const useStore = create<CadStore>()((set, get) => ({
  exercises: initialExercises,
  past: [],
  future: [],
  isPrinting: false,
  pageSize: 'A4',
  fontFamily: "'Segoe UI', sans-serif",
  fontSize: 13,
  zoom: 1,
  selection: [],

  setSelection: (sel) => set({ selection: sel }),
  toggleSelection: (item) => set((state) => {
      const exists = state.selection.find(s => s.rawId === item.rawId);
      if (exists) return { selection: state.selection.filter(s => s.rawId !== item.rawId) };
      return { selection: [...state.selection, item] };
  }),
  setPageConfig: (config) => set((state) => ({ ...state, ...config })),
  setPrinting: (val) => set({ isPrinting: val }),

  pushHistory: () => set((state) => ({ past: [...state.past, JSON.parse(JSON.stringify(state.exercises))], future: [] })),
  undo: () => set((state) => {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, state.past.length - 1);
      return { past: newPast, future: [JSON.parse(JSON.stringify(state.exercises)), ...state.future], exercises: prev, selection: [] };
  }),
  redo: () => set((state) => {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      return { past: [...state.past, JSON.parse(JSON.stringify(state.exercises))], future: newFuture, exercises: next, selection: [] };
  }),
  
  saveData: () => { 
    localStorage.setItem('diedrico_pro_data', JSON.stringify(get().exercises)); 
    alert("Lámina guardada en la memoria del navegador."); 
  },
  loadData: () => { 
    const d = localStorage.getItem('diedrico_pro_data'); 
    if (d) set({ exercises: JSON.parse(d), past: [], future: [], selection: [] }); 
    else alert("No hay datos guardados."); 
  },
  downloadData: () => { 
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(get().exercises));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `lamina_diedrico_${new Date().getTime()}.json`;
    a.click();
  },

  addExercise: (opts) => set((state) => {
    state.pushHistory();
    const originX = 400; const ltY = 250;
    let planes: ExPlane[] = []; let segments: ExSegment[] = []; let pts: any[] = [];
    let title = "Ejercicio"; let dataStr = ""; let w = "50%"; let h = "136mm";

    const t = opts.type;

    const genPlane = (name: string, pType: string, isA: boolean, fixedOffset = 0): ExPlane => {
      let vx = originX + rand(-40, 40) * SF * (isA ? -1 : 1) + fixedOffset;
      let m1 = (0.7 + rand(0, 0.5)) * (Math.random() > 0.5 ? 1 : -1); let m2 = -(0.7 + rand(0, 0.5));
      let p1 = { x: vx + 200, y: ltY + m1 * 200 }; let p2 = { x: vx + 200, y: ltY + m2 * 200 };
      
      if (pType === 'proy_horiz') { p1.x = vx; p1.y = ltY + 200; }
      if (pType === 'proy_vert') { p2.x = vx; p2.y = ltY - 200; }
      if (pType === 'perfil') { p1.x = vx; p1.y = ltY + 200; p2.x = vx; p2.y = ltY - 200; }
      if (pType === 'horizontal') { p2 = {x: vx+200, y: ltY-100}; p1 = {x: vx, y: ltY}; }
      if (pType === 'frontal') { p1 = {x: vx+200, y: ltY+100}; p2 = {x: vx, y: ltY}; }
      if (pType === 'paralelo_lt') { p1 = {x: vx+200, y: ltY+100}; p2 = {x: vx+200, y: ltY-100}; }
      return { id: uid(), name, type: pType, vX: vx, p1, p2 };
    };

    if (t === 'punto_coord') {
      title = "Dibujar las proyecciones de los puntos. Indicar sus cuadrantes, si están sobre pv o ph, o si están sobre un bisector.";
      let dArr = [];
      for(let i=0; i<opts.ptCount; i++) {
        let n = String.fromCharCode(65+i);
        let cx = Math.floor(rand(-7, 7)) * 10; let cy = Math.floor(rand(1, 8)) * 10 * (Math.random()>0.5?1:-1); let cz = Math.floor(rand(1, 8)) * 10 * (Math.random()>0.5?1:-1);
        dArr.push(`${n}(${cx}, ${cy}, ${cz})`);
      }
      dataStr = dArr.join('  |  ');
    }
    else if (t === 'rectas') {
      let ax = -30, bx = 50;
      let ay = applyQuad(Math.floor(rand(1,8))*10 * (Math.random()>0.5?1:-1), opts.quadA, false); let az = applyQuad(Math.floor(rand(1,8))*10 * (Math.random()>0.5?1:-1), opts.quadA, true);
      let by = applyQuad(Math.floor(rand(1,8))*10 * (Math.random()>0.5?1:-1), opts.quadB, false); let bz = applyQuad(Math.floor(rand(1,8))*10 * (Math.random()>0.5?1:-1), opts.quadB, true);
      
      if(opts.lineType === 'horizontal') bz = az; if(opts.lineType === 'frontal') by = ay;
      if(opts.lineType === 'vertical') { bx = ax; by = ay; } if(opts.lineType === 'punta') { bx = ax; bz = az; }
      if(opts.lineType === 'perfil') { bx = ax; } if(opts.lineType === 'paralela_lt') { by = ay; bz = az; }
      if(opts.lineType === 'incidente_lt') { ay = 0; az = 0; ax = 0; } if(opts.lineType === 'contenida_pv') { ay = 0; by = 0; } if(opts.lineType === 'contenida_ph') { az = 0; bz = 0; }

      title = "Dibujar las proyecciones de la recta. Indicar trazas, cuadrantes y tipo de recta.";
      
      if (opts.lineMethod === 'coord') {
        dataStr = `A(${ax}, ${ay}, ${az})  |  B(${bx}, ${by}, ${bz})`; 
      } else if (opts.lineMethod === 'puntos') {
        dataStr = "";
        pts.push({ id:uid(), name:'A', nodes:[{id:uid(), t:'2', x:originX+ax*SF, y:ltY-az*SF, pairId:'n1A'}, {id:'n1A', t:'1', x:originX+ax*SF, y:ltY+ay*SF}] });
        pts.push({ id:uid(), name:'B', nodes:[{id:uid(), t:'2', x:originX+bx*SF, y:ltY-bz*SF, pairId:'n1B'}, {id:'n1B', t:'1', x:originX+bx*SF, y:ltY+by*SF}] });
      } else {
        dataStr = "";
        segments.push({ id:uid(), label:'r2', p1:{x:originX+ax*SF, y:ltY-az*SF}, p2:{x:originX+bx*SF, y:ltY-bz*SF} }, { id:uid(), label:'r1', p1:{x:originX+ax*SF, y:ltY+ay*SF}, p2:{x:originX+bx*SF, y:ltY+by*SF} });
      }
    }
    else if (t === 'plano_coord') {
      let sx: any = Math.floor(rand(-7, 7)) * 10; 
      let sy: any = applyQuad(Math.floor(rand(1, 8)) * 10 * (Math.random()>0.5?1:-1), opts.quadA, false);
      let sz: any = applyQuad(Math.floor(rand(1, 8)) * 10 * (Math.random()>0.5?1:-1), opts.quadA, true);
      if (opts.planeType === 'proy_vert') sy = '∞'; if (opts.planeType === 'proy_horiz') sz = '∞';
      if (opts.planeType === 'perfil') { sy = '∞'; sz = '∞'; } if (opts.planeType === 'horizontal') { sx = '∞'; sy = '∞'; }
      if (opts.planeType === 'frontal') { sx = '∞'; sz = '∞'; } if (opts.planeType === 'paralelo_lt') { sx = '∞'; }
      
      dataStr = `Plano α(${sx}, ${sy}, ${sz})`; 
      title = "Dibujar proyecciones de las trazas. Indicar cuadrantes del plano y tipo de plano.";
    }
    else if (t === 'intersecciones') {
      dataStr = "";
      title = "Hallar la recta de intersección de los planos.";
      if (opts.intSub === 'todas') {
        planes.push(genPlane('α', opts.intP1, true, -50), genPlane('β', opts.intP2, false, 50));
      } else if (opts.intSub === 'paralelas') {
        let pA = genPlane('α', 'oblicuo', true, -60); let pB = genPlane('β', 'oblicuo', false, 60); 
        pB.p1.y = ltY + ((pA.p1.y - ltY)/(pA.p1.x - pA.vX)) * (pB.p1.x - pB.vX); planes.push(pA, pB);
      } else if (opts.intSub === 'no_existe') {
        planes.push(genPlane('α', 'horizontal', true), genPlane('β', 'oblicuo', false, 40)); 
      } else if (opts.intSub === 'paralelas_lt') {
        planes.push(genPlane('α', 'paralelo_lt', true), genPlane('β', 'paralelo_lt', false, 0));
        opts.reqPP = true;
      }
    } 
    else if (t === 'paralelismo') {
      dataStr = "";
      let pA = genPlane('α', 'oblicuo', true, -60);
      let px = originX + 40*SF; let pz = ltY - 60; let py = ltY + 50;
      let pto = { id: uid(), name: 'A', nodes: [{id:uid(), t:'2', x:px, y:pz, pairId:'n1A'}, {id:'n1A', t:'1', x:px, y:py}] };
      pts.push(pto);
      
      if (opts.paraSub === 'r_r_pto') {
        segments.push({ id:uid(), label:'r2', p1:{x:originX-40*SF, y:ltY-20*SF}, p2:{x:originX+30*SF, y:ltY-60*SF} }, { id:uid(), label:'r1', p1:{x:originX-40*SF, y:ltY+30*SF}, p2:{x:originX+30*SF, y:ltY+70*SF} });
        title = "Trazar por el punto A una recta paralela a la recta r.";
      } else if (opts.paraSub === 'p_p_pto') { planes.push(pA); title = "Trazar por A un plano paralelo a α.";
      } else if (opts.paraSub === 'r_p_pto_corte') {
        planes.push(pA);
        segments.push({ id:uid(), label:'r2', p1:{x:originX-80*SF, y:ltY-30*SF}, p2:{x:originX+60*SF, y:ltY-80*SF} }, { id:uid(), label:'r1', p1:{x:originX-80*SF, y:ltY+40*SF}, p2:{x:originX+60*SF, y:ltY+90*SF} });
        title = "Trazar por A una recta paralela a α que se corte con r.";
      } else if (opts.paraSub === 'p_r_pto') {
        segments.push({ id:uid(), label:'r2', p1:{x:originX-40*SF, y:ltY-20*SF}, p2:{x:originX+30*SF, y:ltY-60*SF} }, { id:uid(), label:'r1', p1:{x:originX-40*SF, y:ltY+30*SF}, p2:{x:originX+30*SF, y:ltY+70*SF} });
        title = "Trazar por A un plano paralelo a la recta r.";
      } else if (opts.paraSub === 'p_r_cont_r') {
        segments.push({ id:uid(), label:'r2', p1:{x:originX-40*SF, y:ltY-20*SF}, p2:{x:originX+30*SF, y:ltY-60*SF} }, { id:uid(), label:'r1', p1:{x:originX-40*SF, y:ltY+30*SF}, p2:{x:originX+30*SF, y:ltY+70*SF} });
        segments.push({ id:uid(), label:'s2', p1:{x:originX-30*SF, y:ltY-70*SF}, p2:{x:originX+40*SF, y:ltY-10*SF} }, { id:uid(), label:'s1', p1:{x:originX-30*SF, y:ltY+60*SF}, p2:{x:originX+40*SF, y:ltY+20*SF} });
        pts = []; title = "Trazar un plano paralelo a r que contenga a s.";
      } else if (opts.paraSub === 'p_2r_cortan') {
        segments.push({ id:uid(), label:'r2', p1:{x:px-100, y:pz}, p2:{x:px, y:pz-50} }, { id:uid(), label:'r1', p1:{x:px-100, y:py}, p2:{x:px, y:py+50} });
        segments.push({ id:uid(), label:'s2', p1:{x:px+100, y:pz}, p2:{x:px, y:pz-50} }, { id:uid(), label:'s1', p1:{x:px+100, y:py}, p2:{x:px, y:py+50} });
        pts = [{ id:uid(), name:'I', nodes:[{id:uid(), t:'2', x:px, y:pz-50, pairId:'n1I'}, {id:'n1I', t:'1', x:px, y:py+50}] }]; 
        title = "Trazar un plano paralelo a r y s (se cortan en el punto I).";
      }
    }
    else if (t === 'perpendicularidad') {
      dataStr = "";
      let pA = genPlane('α', 'oblicuo', true, -40);
      let px = originX + 50*SF; let pz = ltY - 60; let py = ltY + 80;
      let ptP = { id: uid(), name: 'P', nodes: [{id:uid(), t:'2', x:px, y:pz, pairId:'n1P'}, {id:'n1P', t:'1', x:px, y:py}] };
      
      if (opts.perpSub === 'r_p_pto') { planes.push(pA); pts.push(ptP); title = "Trazar por P una recta ⊥ a α."; }
      else if (opts.perpSub === 'p_r_pto' || opts.perpSub === 'r_r_ext' || opts.perpSub === 'r_r') { 
          segments.push({ id:uid(), label:'r2', p1:{x:px-150, y:pz+30}, p2:{x:px-20, y:pz-30} }, { id:uid(), label:'r1', p1:{x:px-150, y:py-30}, p2:{x:px-20, y:py+30} });
          if(opts.perpSub !== 'r_r') pts.push(ptP); 
          title = opts.perpSub === 'p_r_pto' ? "Trazar por P un plano ⊥ a r." : opts.perpSub === 'r_r_ext' ? "Trazar por P (exterior) una recta ⊥ a r." : "Trazar recta ⊥ a r que la corte."; 
      }
      else if (opts.perpSub === 'p_p_pto') { planes.push(pA); pts.push(ptP); title = "Trazar por P plano ⊥ a α."; }
      else if (opts.perpSub === 'p_p_r') { 
          planes.push(pA); title = "Trazar plano ⊥ a α que contenga a r."; 
          segments.push({ id:uid(), label:'r2', p1:{x:px-150, y:pz+30}, p2:{x:px-20, y:pz-30} }, { id:uid(), label:'r1', p1:{x:px-150, y:py-30}, p2:{x:px-20, y:py+30} });
      }
    }
    else if (t === 'pertenencias') {
      dataStr = "";
      if (['max_pend', 'max_inc', 'horiz', 'front'].includes(opts.pertSub)) {
          planes.push(genPlane('α', opts.pertPlaneType, true, 0));
          title = `Trazar una recta de tipo ${opts.pertSub.replace('_',' ')} contenida en el plano α (${opts.pertPlaneType.replace('_', ' ')}).`;
      } else {
          let px = originX; let pz = ltY - 50; let py = ltY + 50;
          if (opts.pertSub === 'def_2r_c') {
              segments.push({ id:uid(), label:'r2', p1:{x:px-80, y:pz+20}, p2:{x:px, y:pz} }, { id:uid(), label:'r1', p1:{x:px-80, y:py-20}, p2:{x:px, y:py} });
              segments.push({ id:uid(), label:'s2', p1:{x:px+80, y:pz+30}, p2:{x:px, y:pz} }, { id:uid(), label:'s1', p1:{x:px+80, y:py-10}, p2:{x:px, y:py} });
              pts.push({ id:uid(), name:'I', nodes:[{id:uid(), t:'2', x:px, y:pz, pairId:'n1I'}, {id:'n1I', t:'1', x:px, y:py}] });
              title = "Hallar trazas del plano definido por r y s (se cortan en I).";
          } else if (opts.pertSub === 'def_2r_p') {
              segments.push({ id:uid(), label:'r2', p1:{x:px-80, y:pz+20}, p2:{x:px+20, y:pz-20} }, { id:uid(), label:'r1', p1:{x:px-80, y:py-20}, p2:{x:px+20, y:py+20} });
              segments.push({ id:uid(), label:'s2', p1:{x:px-50, y:pz+40}, p2:{x:px+50, y:pz} }, { id:uid(), label:'s1', p1:{x:px-50, y:py}, p2:{x:px+50, y:py+40} });
              title = "Hallar trazas del plano definido por las rectas paralelas r y s.";
          } else if (opts.pertSub === 'def_3p') {
              pts.push({ id:uid(), name: 'A', nodes: [{id:uid(), t:'2', x:px-60, y:pz, pairId:'n1A'}, {id:'n1A', t:'1', x:px-60, y:py}] });
              pts.push({ id:uid(), name: 'B', nodes: [{id:uid(), t:'2', x:px, y:pz+30, pairId:'n1B'}, {id:'n1B', t:'1', x:px, y:py-20}] });
              pts.push({ id:uid(), name: 'C', nodes: [{id:uid(), t:'2', x:px+70, y:pz-10, pairId:'n1C'}, {id:'n1C', t:'1', x:px+70, y:py+40}] });
              title = "Hallar trazas del plano definido por los puntos A, B y C no alineados.";
          } else if (opts.pertSub === 'def_r_p') {
              segments.push({ id:uid(), label:'r2', p1:{x:px-80, y:pz+20}, p2:{x:px+40, y:pz-20} }, { id:uid(), label:'r1', p1:{x:px-80, y:py-20}, p2:{x:px+40, y:py+20} });
              pts.push({ id:uid(), name: 'P', nodes: [{id:uid(), t:'2', x:px+60, y:pz+40, pairId:'n1P'}, {id:'n1P', t:'1', x:px+60, y:py-30}] });
              title = "Hallar trazas del plano definido por la recta r y el punto P.";
          }
      }
    }
    else if (t === 'abatimientos') {
      dataStr = "";
      let pA = genPlane('α', 'oblicuo', true, -60); planes.push(pA);
      let px = originX + 60; let pz = ltY - 60; let py = ltY + 70;
      let planoNombre = opts.abatPlano === 'ph' ? 'Horizontal' : 'Vertical';

      if (opts.abatEstado === 'proy') {
          if (opts.abatElem === 'punto') {
              pts.push({ id:uid(), name: 'A', nodes: [{id:uid(), t:'2', x:px, y:pz, pairId:'n1'}, {id:'n1', t:'1', x:px, y:py}] });
              title = `Dadas las proyecciones del punto A, hallar su verdadera magnitud abatiendo sobre el plano ${planoNombre}.`;
          } else if (opts.abatElem === 'recta') {
              segments.push({ id:uid(), label:'r2', p1:{x:px-40, y:pz+20}, p2:{x:px+60, y:pz-30} });
              segments.push({ id:uid(), label:'r1', p1:{x:px-40, y:py-20}, p2:{x:px+60, y:py+40} });
              title = `Dadas las proyecciones de la recta r, hallar su verdadera magnitud abatiendo sobre el plano ${planoNombre}.`;
          } else {
              let pLen = opts.abatLados || 3;
              let figPts: any[] = [];
              for(let i=0; i<pLen; i++) {
                  let nx = originX + (10 + i*30)*SF; let nz = ltY - (30 + rand(0,20))*SF; let ny = ltY + (20 + rand(0,20))*SF;
                  let nn = String.fromCharCode(65+i);
                  figPts.push({ id:uid(), name: nn, nodes: [{id:uid(), t:'2', x:nx, y:nz, pairId:'n1'+i}, {id:'n1'+i, t:'1', x:nx, y:ny}] });
              }
              pts.push(...figPts);
              for(let i=0; i<pLen; i++) {
                  let next = (i+1)%pLen;
                  segments.push({ id:uid(), label:'', p1:{x:figPts[i].nodes[0].x, y:figPts[i].nodes[0].y}, p2:{x:figPts[next].nodes[0].x, y:figPts[next].nodes[0].y} });
                  segments.push({ id:uid(), label:'', p1:{x:figPts[i].nodes[1].x, y:figPts[i].nodes[1].y}, p2:{x:figPts[next].nodes[1].x, y:figPts[next].nodes[1].y} });
              }
              title = `Dadas las proyecciones de la figura contenida en el plano α, hallar su verdadera magnitud abatiendo sobre el plano ${planoNombre}.`;
          }
      } else {
          // Estado: Verdadera Magnitud (Desabatir)
          let abatedTraceLabel = opts.abatPlano === 'ph' ? '(α2)' : '(α1)';
          let abatedY = opts.abatPlano === 'ph' ? ltY + 120 : ltY - 120;
          segments.push({ id:uid(), label: abatedTraceLabel, p1: {x: pA.vX, y: ltY}, p2: {x: pA.vX + 150, y: abatedY} });

          if (opts.abatElem === 'punto') {
              pts.push({ id:uid(), name: '(A)', nodes: [{id:uid(), t:'', x:px, y: opts.abatPlano==='ph'?py:pz}] });
              title = `Dado el punto A abatido sobre el plano ${planoNombre}, hallar sus proyecciones en α.`;
          } else if (opts.abatElem === 'recta') {
              segments.push({ id:uid(), label:'(r)', p1:{x:px-40, y:opts.abatPlano==='ph'?py-20:pz+20}, p2:{x:px+60, y:opts.abatPlano==='ph'?py+40:pz-30} });
              title = `Dada la recta r abatida sobre el plano ${planoNombre}, hallar sus proyecciones en α.`;
          } else {
              let pLen = opts.abatLados || 3;
              let figPts: any[] = [];
              for(let i=0; i<pLen; i++) {
                  let nx = originX + (10 + i*30)*SF; let ny = opts.abatPlano==='ph' ? ltY + (40 + rand(0,20))*SF : ltY - (40 + rand(0,20))*SF;
                  let nn = String.fromCharCode(65+i);
                  figPts.push({ id:uid(), name: `(${nn})`, nodes: [{id:uid(), t:'', x:nx, y:ny}] });
              }
              pts.push(...figPts);
              for(let i=0; i<pLen; i++) {
                  let next = (i+1)%pLen;
                  segments.push({ id:uid(), label:'', p1:{x:figPts[i].nodes[0].x, y:figPts[i].nodes[0].y}, p2:{x:figPts[next].nodes[0].x, y:figPts[next].nodes[0].y} });
              }
              title = `Dada la figura abatida sobre el plano ${planoNombre}, hallar sus proyecciones en α.`;
          }
      }
    }

    if (opts.reqPP) {
      title += " Dibujar tercera proyección.";
    }

    const newEx: Exercise = {
      id: uid(), type: t, title, w, h, dataStr,
      state: { ltY, originX, ppX: 750, reqRegla: opts.reqRegla, reqPP: opts.reqPP, reqOrigin: opts.reqOrigin, planes, segments, pts, bounds: { ltX1: 0, ltX2: 800, oY1: 0, oY2: 400, pY1: 0, pY2: 400 }, constraints: [] }
    };
    return { exercises: [...state.exercises, newEx] };
  }),

  removeExercise: (id) => set((state) => { state.pushHistory(); return { exercises: state.exercises.filter(e => e.id !== id), selection: [] }; }),
  updateBoxSize: (id, w, h) => set((state) => { state.pushHistory(); return { exercises: state.exercises.map(ex => ex.id === id ? { ...ex, w, h } : ex) }; }),

  addFreeElement: (exId, elemType) => set((state) => {
    state.pushHistory();
    return { exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state }; let ox = s.originX; let oy = s.ltY;
      if (elemType === 'punto') {
          const nextL = String.fromCharCode(65 + s.pts.length);
          s.pts = [...s.pts, { id:uid(), name: nextL, nodes:[{id:uid(), t:'2', x:ox+50, y:oy-50, pairId:'nf1'}, {id:'nf1', t:'1', x:ox+50, y:oy+50}] }];
      } else if (elemType === 'recta') {
          const nextL = String.fromCharCode(114 + Math.floor(s.segments.length / 2));
          s.segments = [...s.segments, { id:uid(), label:`${nextL}2`, p1:{x:ox-50, y:oy-20}, p2:{x:ox+50, y:oy-70} }, { id:uid(), label:`${nextL}1`, p1:{x:ox-50, y:oy+30}, p2:{x:ox+50, y:oy+80} }];
      } else if (elemType === 'plano') {
          const greek = ['α','β','γ','δ','ε','ζ','η'];
          const nextL = greek[s.planes.length % greek.length];
          s.planes = [...s.planes, { id:uid(), name: nextL, type:'oblicuo', vX:ox-70, p1:{x:ox+100, y:oy+150}, p2:{x:ox+100, y:oy-150} }];
      }
      return { ...ex, state: s };
    })};
  }),

  removeElement: (exId, elemType, elemId) => set((state) => {
    state.pushHistory();
    return { exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state };
      if (elemType === 'punto') s.pts = s.pts.filter(p => p.id !== elemId && !p.nodes.some(n=>n.id===elemId));
      else if (elemType === 'recta') s.segments = s.segments.filter(sg => sg.id !== elemId);
      else if (elemType === 'plano') s.planes = s.planes.filter(pl => pl.id !== elemId);
      s.constraints = s.constraints.filter(c => c.el1 !== elemId && c.el2 !== elemId);
      return { ...ex, state: s };
    })};
  }),

  updateName: (exId, elemType, elemId, newName) => set((state) => {
    state.pushHistory();
    return { exercises: state.exercises.map(ex => {
      if(ex.id !== exId) return ex;
      let s = {...ex.state};
      if(elemType === 'punto') s.pts = s.pts.map(p => p.id === elemId ? {...p, name: newName} : p);
      else if(elemType === 'recta') s.segments = s.segments.map(seg => seg.id === elemId ? {...seg, label: newName} : seg);
      else if(elemType === 'plano') s.planes = s.planes.map(pl => pl.id === elemId ? {...pl, name: newName} : pl);
      return {...ex, state: s};
    })};
  }),

  updateExerciseText: (exId, field, text) => set((state) => {
    state.pushHistory();
    return { exercises: state.exercises.map(ex => ex.id !== exId ? ex : { ...ex, [field]: text })};
  }),

  togglePlaneType: (exId, planeId) => set((state) => {
    state.pushHistory();
    return { exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      return { ...ex, state: { ...ex.state, planes: ex.state.planes.map(pl => pl.id !== planeId ? pl : { ...pl, type: pl.type === 'paralelo_lt' ? 'oblicuo' : 'paralelo_lt' })}};
    })};
  }),

  toggleLineStyle: (exId, elemType, elemId) => set((state) => {
    state.pushHistory();
    return { exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state };
      const nextStyle = (current?: string) => current === 'solid' ? 'dashed' : current === 'dashed' ? undefined : 'solid';
      if (elemType === 'recta') s.segments = s.segments.map(seg => seg.id === elemId ? { ...seg, customStyle: nextStyle(seg.customStyle) } : seg);
      else if (elemType === 'plano') s.planes = s.planes.map(pl => pl.id === elemId ? { ...pl, customStyle: nextStyle(pl.customStyle) } : pl);
      return { ...ex, state: s };
    })};
  }),

  addAuxLine: (exId, rawId, mode) => set((state) => {
      state.pushHistory();
      return { exercises: state.exercises.map(ex => {
        if (ex.id !== exId) return ex;
        let s = { ...ex.state };
        let p1 = null, p2 = null;
        let id = rawId.includes('_') ? rawId.split('_')[1] : rawId;

        if (rawId.includes('seg') || s.segments.find(x => x.id === id)) {
            let seg = s.segments.find(x => x.id === id);
            if (seg) { p1 = seg.p1; p2 = seg.p2; }
        } else if (rawId.includes('pl') || s.planes.find(x => x.id === id)) {
            let pl = s.planes.find(x => x.id === id);
            if (pl) {
                let isTrace1 = rawId.includes('1');
                if (pl.type === 'paralelo_lt') {
                    p1 = {x: 0, y: isTrace1 ? pl.p1.y : pl.p2.y}; p2 = {x: 800, y: isTrace1 ? pl.p1.y : pl.p2.y};
                } else if (pl.type === 'horizontal') {
                    p1 = {x: 0, y: pl.p2.y}; p2 = {x: 800, y: pl.p2.y};
                } else if (pl.type === 'frontal') {
                    p1 = {x: 0, y: pl.p1.y}; p2 = {x: 800, y: pl.p1.y};
                } else {
                    p1 = {x: pl.vX, y: s.ltY}; p2 = isTrace1 ? pl.p1 : pl.p2;
                }
            }
        }

        if (p1 && p2) {
            let cx = (p1.x + p2.x)/2 + 30; let cy = (p1.y + p2.y)/2 - 30; 
            let dx = p2.x - p1.x; let dy = p2.y - p1.y;
            let len = Math.sqrt(dx*dx + dy*dy) || 1;
            let ux = dx/len; let uy = dy/len;
            
            let nx1, ny1, nx2, ny2;
            let lineLen = 150;
            
            if (mode === 'parallel') {
                nx1 = cx - ux * lineLen/2; ny1 = cy - uy * lineLen/2;
                nx2 = cx + ux * lineLen/2; ny2 = cy + uy * lineLen/2;
            } else {
                nx1 = cx - (-uy) * lineLen/2; ny1 = cy - ux * lineLen/2;
                nx2 = cx + (-uy) * lineLen/2; ny2 = cy + ux * lineLen/2;
            }
            
            s.segments = [...s.segments, { id: uid(), label: '', p1: {x: nx1, y: ny1}, p2: {x: nx2, y: ny2}, customStyle: 'dashed' }];
        }
        return { ...ex, state: s };
      })};
  }),

  addConstraint: (exId, type, el1, el2) => set((state) => {
      state.pushHistory();
      return { exercises: state.exercises.map(ex => {
          if (ex.id !== exId) return ex;
          let s = { ...ex.state };
          s.constraints = s.constraints.filter(c => c.el2 !== el2 && c.el1 !== el2);
          s.constraints.push({ id: uid(), type, el1, el2 });
          s = enforceConstraints(s, 'all');
          return { ...ex, state: s };
      }), selection: [] };
  }),

  removeConstraint: (exId, constraintId) => set((state) => {
      state.pushHistory();
      return { exercises: state.exercises.map(ex => {
          if (ex.id !== exId) return ex;
          return { ...ex, state: { ...ex.state, constraints: ex.state.constraints.filter(c => c.id !== constraintId) } };
      })};
  }),

  updateNode: (exId, ptId, nodeId, newX, newY) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state };
      
      let thePoint = s.pts.find(p => p.id === ptId);
      let theNode = thePoint?.nodes.find(n => n.id === nodeId);
      
      if (theNode) {
         let dx = newX - theNode.x;
         let pairNode = thePoint?.nodes.find(n => n.id === theNode?.pairId);

         s.segments = s.segments.map(seg => {
             let ns = {...seg};
             if (Math.abs(seg.p1.x - theNode!.x) < 1 && Math.abs(seg.p1.y - theNode!.y) < 1) ns.p1 = {x: newX, y: newY};
             if (Math.abs(seg.p2.x - theNode!.x) < 1 && Math.abs(seg.p2.y - theNode!.y) < 1) ns.p2 = {x: newX, y: newY};
             
             if (pairNode) {
                 if (Math.abs(seg.p1.x - pairNode.x) < 1 && Math.abs(seg.p1.y - pairNode.y) < 1) ns.p1 = {x: pairNode.x + dx, y: pairNode.y};
                 if (Math.abs(seg.p2.x - pairNode.x) < 1 && Math.abs(seg.p2.y - pairNode.y) < 1) ns.p2 = {x: pairNode.x + dx, y: pairNode.y};
             }
             return ns;
         });
      }

      s.pts = s.pts.map(p => p.id !== ptId ? p : { ...p, nodes: p.nodes.map(n => n.id === nodeId ? { ...n, x: newX, y: newY } : (n.pairId === nodeId ? { ...n, x: newX } : n)) });
      return { ...ex, state: s };
    })
  })),

  updatePlane: (exId, planeId, newVX) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      return { ...ex, state: { ...ex.state, planes: ex.state.planes.map(pl => pl.id !== planeId ? pl : { ...pl, vX: newVX, p1: {x: pl.p1.x + (newVX - pl.vX), y: pl.p1.y}, p2: {x: pl.p2.x + (newVX - pl.vX), y: pl.p2.y} }) } };
    })
  })),

  updatePlaneEndpoint: (exId, planeId, traceNum, newX, newY) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      return { ...ex, state: { ...ex.state, planes: ex.state.planes.map(pl => pl.id !== planeId ? pl : (traceNum === 1 ? { ...pl, p1: { x: newX, y: newY } } : { ...pl, p2: { x: newX, y: newY } })) } };
    })
  })),

  updateSegment: (exId, segId, pointIndex, newX, newY) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state, segments: ex.state.segments.map(seg => seg.id !== segId ? seg : (pointIndex === 1 ? { ...seg, p1: { x: newX, y: newY } } : { ...seg, p2: { x: newX, y: newY } })) };
      s = enforceConstraints(s, segId);
      return { ...ex, state: s };
    })
  })),

  updateSystem: (exId, target, valX, valY) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state };
      if (!s.bounds) s.bounds = { ltX1: 0, ltX2: 800, oY1: 0, oY2: 400, pY1: 0, pY2: 400 };

      if (target === 'pp') s.ppX = valX;
      else if (target === 'origin') {
        let dx = valX - s.originX; let dy = valY - s.ltY;
        s.originX = valX; s.ltY = valY; s.ppX += dx;
        s.planes = s.planes.map(pl => ({...pl, vX: pl.vX + dx, p1: {x: pl.p1.x + dx, y: pl.p1.y + dy}, p2: {x: pl.p2.x + dx, y: pl.p2.y + dy}}));
        s.segments = s.segments.map(sg => ({...sg, p1:{x:sg.p1.x+dx, y:sg.p1.y+dy}, p2:{x:sg.p2.x+dx, y:sg.p2.y+dy}}));
        s.pts = s.pts.map(p => ({...p, nodes: p.nodes.map(n => ({...n, x: n.x+dx, y: n.y+dy}))}));
      }
      else if (target === 'lt1') s.bounds.ltX1 = valX; else if (target === 'lt2') s.bounds.ltX2 = valX;
      else if (target === 'o1') s.bounds.oY1 = valY; else if (target === 'o2') s.bounds.oY2 = valY;
      else if (target === 'p1') s.bounds.pY1 = valY; else if (target === 'p2') s.bounds.pY2 = valY;

      return { ...ex, state: s };
    })
  }))
}));

useStore.subscribe((state) => { localStorage.setItem('diedrico_autosave', JSON.stringify(state.exercises)); });

// ==========================================
// 2. EL MOTOR DE DIBUJO CAD (KONVA)
// ==========================================
function View2D({ ex }: { ex: Exercise }) {
  const { updateNode, updatePlane, updatePlaneEndpoint, updateSegment, updateSystem, toggleSelection, selection, isPrinting } = useStore();
  const { ltY, originX, ppX, reqRegla, reqPP, reqOrigin, planes, pts, segments } = ex.state;

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
  const getFont = (size: number, weight = "") => `${weight} ${sc(size)}px Arial`.trim();

  const handleHover = (e: any) => { e.target.moveToTop(); e.target.scale({x:1.5, y:1.5}); document.body.style.cursor='pointer'; };
  const handleOut = (e: any) => { e.target.scale({x:1, y:1}); document.body.style.cursor='default'; };
  const handleHoverLine = () => { document.body.style.cursor='pointer'; };
  const handleOutLine = () => { document.body.style.cursor='default'; };

  const onPushHistory = () => useStore.getState().pushHistory();

  const isSelected = (rawId: string) => selection.some(s => s.rawId === rawId);

  const drawHaloText = (ctx: any, text: string, x: number, y: number, font = getFont(15, "bold"), align = "left", color = "black") => {
    if (!text) return;
    ctx.save(); ctx.font = font; ctx.strokeStyle = "white"; ctx.lineWidth = sc(4); ctx.lineJoin = "round"; ctx.textAlign = align;
    ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.restore();
  };

  const drawScene = (ctx: any) => {
    const b = ex.state.bounds || { ltX1: 0, ltX2: 800, oY1: 0, oY2: 400, pY1: 0, pY2: 400 };

    let dynLabels: {text: string, x: number, y: number, font: string, color: string}[] = [];
    const queueLabel = (text: string, x: number, y: number, font = getFont(15, "bold"), color="black") => { dynLabels.push({text, x, y, font, color}); };

    const drawTrueVisibilitySegmentLocal = (seg: ExSegment, stSegments: ExSegment[], ltY: number, isVerticalProj: boolean) => {
      const selected = isSelected(`seg_${seg.id}`);
      const strokeColor = selected ? "#00d2ff" : "black";
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = selected ? sc(3) : sc(2.2);
      
      if (seg.customStyle === 'dashed' || (!seg.customStyle && seg.isDashed)) {
         ctx.beginPath(); ctx.setLineDash([sc(5), sc(5)]); ctx.moveTo(seg.p1.x, seg.p1.y); ctx.lineTo(seg.p2.x, seg.p2.y); ctx.stroke(); ctx.setLineDash([]);
         if (seg.label) queueLabel(seg.label, (seg.p1.x+seg.p2.x)/2, (seg.p1.y+seg.p2.y)/2, getFont(15, "bold"), strokeColor); return;
      }
      if (seg.customStyle === 'solid') {
         ctx.beginPath(); ctx.setLineDash([]); ctx.moveTo(seg.p1.x, seg.p1.y); ctx.lineTo(seg.p2.x, seg.p2.y); ctx.stroke();
         if (seg.label) queueLabel(seg.label, (seg.p1.x+seg.p2.x)/2 + sc(5), (seg.p1.y+seg.p2.y)/2 - sc(5), getFont(15, "bold"), strokeColor); return;
      }

      let tVals = [0, 1];
      let prefix = seg.label.replace(/[12]/g, '');
      let otherSeg = stSegments.find(s => s.label === prefix + (isVerticalProj ? '1' : '2'));

      if (!otherSeg) {
          let segR2 = stSegments.find(s => s.label.includes('2')); let segR1 = stSegments.find(s => s.label.includes('1'));
          otherSeg = isVerticalProj ? segR1 : segR2;
      }

      if(!otherSeg) {
          let in1st = isVerticalProj ? (seg.p1.y < ltY) : (seg.p1.y > ltY);
          ctx.beginPath(); ctx.setLineDash(in1st ? [] : [sc(6), sc(4)]);
          ctx.moveTo(seg.p1.x, seg.p1.y); ctx.lineTo(seg.p2.x, seg.p2.y); ctx.stroke(); ctx.setLineDash([]);
          if (seg.label) queueLabel(seg.label, (seg.p1.x+seg.p2.x)/2 + sc(5), (seg.p1.y+seg.p2.y)/2 - sc(5), getFont(15, "bold"), strokeColor); return;
      }

      let dy = seg.p2.y - seg.p1.y;
      if (Math.abs(dy) > 0.01) { let tThis = (ltY - seg.p1.y) / dy; if (tThis > 0 && tThis < 1) tVals.push(tThis); }

      let dyOther = otherSeg ? (otherSeg.p2.y - otherSeg.p1.y) : 0;
      let dx = seg.p2.x - seg.p1.x; let dxOther = otherSeg ? (otherSeg.p2.x - otherSeg.p1.x) : 0;
      
      if (otherSeg && Math.abs(dyOther) > 0.01 && Math.abs(dx) > 0.01) {
          let xOtherTrace = otherSeg.p1.x + (ltY - otherSeg.p1.y) * dxOther / dyOther;
          let tOtherMap = (xOtherTrace - seg.p1.x) / dx;
          if (tOtherMap > 0 && tOtherMap < 1) tVals.push(tOtherMap);
      }
      tVals.sort((a,b) => a - b);

      for (let i = 0; i < tVals.length - 1; i++) {
          let tA = tVals[i]; let tB = tVals[i+1];
          if (Math.abs(tB - tA) < 0.001) continue;
          let tMid = (tA + tB) / 2;
          let xMid = seg.p1.x + tMid * dx; let yMid = seg.p1.y + tMid * dy;
          let yOtherMid = 0;
          
          if (otherSeg) {
              if (Math.abs(dxOther) > 0.01) { let tOther = (xMid - otherSeg.p1.x) / dxOther; yOtherMid = otherSeg.p1.y + tOther * dyOther; } 
              else { yOtherMid = (otherSeg.p1.y + otherSeg.p2.y) / 2; }
          }

          let y1 = isVerticalProj ? yOtherMid : yMid; let y2 = isVerticalProj ? yMid : yOtherMid;
          let is1stQ = (y2 < ltY) && (y1 > ltY);

          ctx.beginPath(); ctx.setLineDash(is1stQ ? [] : [sc(6), sc(4)]);
          ctx.moveTo(seg.p1.x + tA * dx, seg.p1.y + tA * dy); ctx.lineTo(seg.p1.x + tB * dx, seg.p1.y + tB * dy); ctx.stroke();
      }
      ctx.setLineDash([]);
      if (seg.label) queueLabel(seg.label, (seg.p1.x+seg.p2.x)/2 + sc(5), (seg.p1.y+seg.p2.y)/2 - sc(5), getFont(15, "bold"), strokeColor);
    };

    ctx.strokeStyle = "black"; ctx.lineWidth = sc(2.2);
    ctx.beginPath(); ctx.moveTo(b.ltX1, ltY); ctx.lineTo(b.ltX2, ltY); ctx.stroke();
    ctx.lineWidth = sc(1.2); ctx.beginPath(); 
    ctx.moveTo(b.ltX1 + 10, ltY + 6); ctx.lineTo(b.ltX1 + 25, ltY + 6); 
    ctx.moveTo(b.ltX2 - 25, ltY + 6); ctx.lineTo(b.ltX2 - 10, ltY + 6); ctx.stroke();

    if (reqRegla) {
      ctx.lineWidth = sc(1); ctx.beginPath(); ctx.moveTo(originX, b.oY1); ctx.lineTo(originX, b.oY2);
      for(let v = -70; v <= 70; v += 10) {
        let tick = sc(8); ctx.moveTo(originX + v*SF, ltY - tick); ctx.lineTo(originX + v*SF, ltY + tick);
        if(v !== 0) drawHaloText(ctx, v.toString(), originX + v*SF, ltY + sc(22), getFont(11), "center");
        ctx.moveTo(originX - tick, ltY - v*SF); ctx.lineTo(originX + tick, ltY - v*SF);
        if(v !== 0) drawHaloText(ctx, v.toString(), originX - sc(10), ltY - v*SF + sc(4), getFont(11), "right");
      }
      ctx.stroke(); drawHaloText(ctx, "X", b.ltX2 - sc(20), ltY + sc(4), getFont(14, "bold"));
    }
    
    if (reqOrigin) {
      ctx.lineWidth = sc(2); ctx.beginPath(); ctx.moveTo(originX, ltY - 8); ctx.lineTo(originX, ltY + 8); ctx.stroke();
      if(!reqRegla) drawHaloText(ctx, "0", originX + sc(4), ltY + sc(18), getFont(14, "italic"));
    }

    if (reqPP) {
      ctx.lineWidth = sc(1.8); ctx.setLineDash([sc(10), sc(4), sc(2), sc(4)]);
      ctx.beginPath(); ctx.moveTo(ppX, b.pY1); ctx.lineTo(ppX, b.pY2); ctx.stroke(); ctx.setLineDash([]);
      drawHaloText(ctx, "PP", ppX + sc(6), b.pY1 + sc(30), getFont(16, "bold"));
    }

    planes.forEach((pl: ExPlane) => {
      const applyDashAndColor = (isAutoDashed: boolean, traceRawId: string) => {
          const selected = isSelected(traceRawId);
          ctx.strokeStyle = selected ? "#00d2ff" : "black"; 
          ctx.lineWidth = selected ? sc(3) : sc(2.2);
          
          if (pl.customStyle === 'solid') ctx.setLineDash([]);
          else if (pl.customStyle === 'dashed') ctx.setLineDash([sc(6), sc(4)]);
          else ctx.setLineDash(isAutoDashed ? [sc(6), sc(4)] : []);
          return ctx.strokeStyle;
      };

      if (pl.type === 'horizontal') {
        let col = applyDashAndColor(false, `pl2_${pl.id}`);
        ctx.beginPath(); ctx.moveTo(b.ltX1, pl.p2.y); ctx.lineTo(b.ltX2, pl.p2.y); ctx.stroke(); ctx.setLineDash([]);
        if (pl.name) queueLabel(`${pl.name}2`, pl.p2.x, pl.p2.y - sc(10), getFont(16, "bold"), col);
      } else if (pl.type === 'frontal') {
        let col = applyDashAndColor(false, `pl1_${pl.id}`);
        ctx.beginPath(); ctx.moveTo(b.ltX1, pl.p1.y); ctx.lineTo(b.ltX2, pl.p1.y); ctx.stroke(); ctx.setLineDash([]);
        if (pl.name) queueLabel(`${pl.name}1`, pl.p1.x, pl.p1.y + sc(20), getFont(16, "bold"), col);
      } else if (pl.type === 'paralelo_lt') {
        let col2 = applyDashAndColor(false, `pl2_${pl.id}`);
        ctx.beginPath(); ctx.moveTo(b.ltX1, pl.p2.y); ctx.lineTo(b.ltX2, pl.p2.y); ctx.stroke();
        if (pl.name) queueLabel(`${pl.name}2`, pl.p2.x, pl.p2.y - sc(10), getFont(16, "bold"), col2);

        let col1 = applyDashAndColor(false, `pl1_${pl.id}`);
        ctx.beginPath(); ctx.moveTo(b.ltX1, pl.p1.y); ctx.lineTo(b.ltX2, pl.p1.y); ctx.stroke(); ctx.setLineDash([]);
        if (pl.name) queueLabel(`${pl.name}1`, pl.p1.x, pl.p1.y + sc(20), getFont(16, "bold"), col1);
      } else {
        let col2 = applyDashAndColor(pl.p2.y >= ltY, `pl2_${pl.id}`);
        ctx.beginPath(); ctx.moveTo(pl.vX, ltY); ctx.lineTo(pl.p2.x, pl.p2.y); ctx.stroke();
        if (pl.name) queueLabel(`${pl.name}2`, pl.p2.x, pl.p2.y - sc(10), getFont(16, "bold"), col2);

        let col1 = applyDashAndColor(pl.p1.y <= ltY, `pl1_${pl.id}`);
        ctx.beginPath(); ctx.moveTo(pl.vX, ltY); ctx.lineTo(pl.p1.x, pl.p1.y); ctx.stroke(); 
        if (pl.name) queueLabel(`${pl.name}1`, pl.p1.x, pl.p1.y + sc(20), getFont(16, "bold"), col1);
        ctx.setLineDash([]);
      }
    });

    segments.forEach((seg: ExSegment) => {
        const isV = seg.label.includes('2');
        drawTrueVisibilitySegmentLocal(seg, segments, ltY, isV);
    });

    ctx.strokeStyle = "#888"; ctx.setLineDash([sc(5), sc(5)]); ctx.lineWidth = sc(1);
    pts.forEach((p: any) => { if(p.nodes.length === 2) { ctx.beginPath(); ctx.moveTo(p.nodes[0].x, p.nodes[0].y); ctx.lineTo(p.nodes[1].x, p.nodes[1].y); ctx.stroke(); } });
    ctx.setLineDash([]);
    
    pts.forEach((p: any) => {
      p.nodes.forEach((n: ExNode) => { 
        const selected = isSelected(`pt_${n.id}`);
        ctx.strokeStyle = selected ? "#00d2ff" : "black"; 
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath(); ctx.lineWidth = selected ? sc(2) : sc(1.5);
        let cs = sc(5);
        ctx.moveTo(n.x, n.y - cs); ctx.lineTo(n.x, n.y + cs); 
        ctx.moveTo(n.x - cs, n.y); ctx.lineTo(n.x + cs, n.y); 
        ctx.stroke();
        if (p.name) queueLabel(`${p.name}${n.t}`, n.x + sc(8), n.y - sc(8), getFont(15, "bold"), ctx.fillStyle); 
      });
    });

    // SISTEMA EXPERTO ANTICOLISIONES
    let mergedLabels: any[] = [];
    let skip = new Set();
    for(let i=0; i<dynLabels.length; i++) {
        if(skip.has(i)) continue;
        let group = [dynLabels[i]];
        for(let j=i+1; j<dynLabels.length; j++) {
            if(skip.has(j)) continue;
            let dx = dynLabels[i].x - dynLabels[j].x; let dy = dynLabels[i].y - dynLabels[j].y;
            if(Math.sqrt(dx*dx + dy*dy) < sc(15)) { group.push(dynLabels[j]); skip.add(j); }
        }
        if(group.length > 1) {
            let combinedText = group.map(g => g.text).join(' ≡ ');
            let avgX = group.reduce((sum, g) => sum + g.x, 0) / group.length;
            let avgY = group.reduce((sum, g) => sum + g.y, 0) / group.length;
            let combinedColor = group.some(g => g.color === "#00d2ff") ? "#00d2ff" : "black";
            mergedLabels.push({ text: combinedText, x: avgX, y: avgY, font: group[0].font, color: combinedColor });
        } else {
            mergedLabels.push(dynLabels[i]);
        }
    }

    for(let iter=0; iter<30; iter++) {
        for(let i=0; i<mergedLabels.length; i++) {
            for(let j=i+1; j<mergedLabels.length; j++) {
                let a = mergedLabels[i]; let b = mergedLabels[j];
                ctx.font = a.font; let aW = ctx.measureText(a.text).width;
                ctx.font = b.font; let bW = ctx.measureText(b.text).width;
                let aH = sc(15); let bH = sc(15);
                
                let dx = a.x - b.x; let dy = a.y - b.y;
                let minDistX = (aW + bW)/2 + sc(8); let minDistY = (aH + bH)/2 + sc(8);
                
                if (Math.abs(dx) < minDistX && Math.abs(dy) < minDistY) {
                    if (dx === 0 && dy === 0) { dx = 0.1; dy = 0.1; }
                    let overlapX = minDistX - Math.abs(dx); let overlapY = minDistY - Math.abs(dy);
                    if (overlapX < overlapY) {
                        let pushX = overlapX * (dx > 0 ? 1 : -1) * 0.5;
                        a.x += pushX; b.x -= pushX;
                    } else {
                        let pushY = overlapY * (dy > 0 ? 1 : -1) * 0.5;
                        a.y += pushY; b.y -= pushY;
                    }
                }
            }
        }
    }

    mergedLabels.forEach(lbl => {
        drawHaloText(ctx, lbl.text, lbl.x, lbl.y, lbl.font, "left", lbl.color);
    });
  };

  const b = ex.state.bounds || { ltX1: 0, ltX2: 800, oY1: 0, oY2: 400, pY1: 0, pY2: 400 };

  const handleEntityClick = (e: any, type: 'punto'|'recta'|'plano', rawId: string, label: string) => {
      e.cancelBubble = true;
      let id = rawId.includes('_') ? rawId.split('_')[1] : rawId;
      if (type === 'punto') {
          let thePt = ex.state.pts.find(p => p.nodes.some(n => n.id === id));
          if(thePt) id = thePt.id;
      }
      toggleSelection({ exId: ex.id, type, id, rawId, label });
  };

  return (
    <div style={{width: '100%', height: '100%', position: 'relative', overflow: 'hidden'}}>
      <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
        <Stage width={dim.w} height={dim.h} onClick={(e) => { if (e.target === e.target.getStage()) useStore.getState().setSelection([]); }}>
          <Layer scaleX={scale} scaleY={scale} x={offsetX} y={offsetY}>
            <Shape sceneFunc={drawScene} />
            
            <Group visible={!isPrinting}>
              {/* LÍNEAS INVISIBLES DE HITBOX PARA RECTAS */}
              {segments.map(seg => (
                <Line key={`hit_seg_${seg.id}`} points={[seg.p1.x, seg.p1.y, seg.p2.x, seg.p2.y]} stroke="transparent" strokeWidth={sc(20)} onMouseEnter={handleHoverLine} onMouseLeave={handleOutLine} listening={true} onClick={(e) => handleEntityClick(e, 'recta', `seg_${seg.id}`, `Recta ${seg.label.replace(/[12]/g, '')}`)} />
              ))}

              {/* LÍNEAS INVISIBLES DE HITBOX PARA PLANOS */}
              {planes.map(pl => {
                if (pl.type === 'horizontal') return <Line key={`hit_pl_${pl.id}`} points={[b.ltX1, pl.p2.y, b.ltX2, pl.p2.y]} stroke="transparent" strokeWidth={sc(20)} onMouseEnter={handleHoverLine} onMouseLeave={handleOutLine} listening={true} onClick={(e) => handleEntityClick(e, 'plano', `pl2_${pl.id}`, `Traza ${pl.name}2`)} />;
                if (pl.type === 'frontal') return <Line key={`hit_pl_${pl.id}`} points={[b.ltX1, pl.p1.y, b.ltX2, pl.p1.y]} stroke="transparent" strokeWidth={sc(20)} onMouseEnter={handleHoverLine} onMouseLeave={handleOutLine} listening={true} onClick={(e) => handleEntityClick(e, 'plano', `pl1_${pl.id}`, `Traza ${pl.name}1`)} />;
                if (pl.type === 'paralelo_lt') return <React.Fragment key={`hit_pl_${pl.id}`}><Line points={[b.ltX1, pl.p2.y, b.ltX2, pl.p2.y]} stroke="transparent" strokeWidth={sc(20)} onMouseEnter={handleHoverLine} onMouseLeave={handleOutLine} listening={true} onClick={(e) => handleEntityClick(e, 'plano', `pl2_${pl.id}`, `Traza ${pl.name}2`)} /><Line points={[b.ltX1, pl.p1.y, b.ltX2, pl.p1.y]} stroke="transparent" strokeWidth={sc(20)} onMouseEnter={handleHoverLine} onMouseLeave={handleOutLine} listening={true} onClick={(e) => handleEntityClick(e, 'plano', `pl1_${pl.id}`, `Traza ${pl.name}1`)} /></React.Fragment>;
                return (
                  <React.Fragment key={`hit_pl_${pl.id}`}>
                    <Line points={[pl.vX, ltY, pl.p2.x, pl.p2.y]} stroke="transparent" strokeWidth={sc(20)} onMouseEnter={handleHoverLine} onMouseLeave={handleOutLine} listening={true} onClick={(e) => handleEntityClick(e, 'plano', `pl2_${pl.id}`, `Traza ${pl.name}2`)} />
                    <Line points={[pl.vX, ltY, pl.p1.x, pl.p1.y]} stroke="transparent" strokeWidth={sc(20)} onMouseEnter={handleHoverLine} onMouseLeave={handleOutLine} listening={true} onClick={(e) => handleEntityClick(e, 'plano', `pl1_${pl.id}`, `Traza ${pl.name}1`)} />
                  </React.Fragment>
                );
              })}

              <Circle id="sys_lt1" x={b.ltX1} y={ltY} radius={sc(8)} fill="rgba(0,0,0,0.2)" draggable dragBoundFunc={(p)=>({x:p.x, y:ltY})} onDragStart={onPushHistory} onDragMove={(e) => updateSystem(ex.id, 'lt1', e.target.x(), 0)} onMouseEnter={handleHover} onMouseLeave={handleOut} />
              <Circle id="sys_lt2" x={b.ltX2} y={ltY} radius={sc(8)} fill="rgba(0,0,0,0.2)" draggable dragBoundFunc={(p)=>({x:p.x, y:ltY})} onDragStart={onPushHistory} onDragMove={(e) => updateSystem(ex.id, 'lt2', e.target.x(), 0)} onMouseEnter={handleHover} onMouseLeave={handleOut} />

              {reqOrigin && <Circle id="sys_origin" x={originX} y={ltY} radius={sc(18)} fill="rgba(255,200,0,0.4)" draggable onDragStart={onPushHistory} onDragMove={(e) => updateSystem(ex.id, 'origin', e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} />}
              
              {reqRegla && (
                <React.Fragment>
                  <Circle id="sys_o1" x={originX} y={b.oY1} radius={sc(8)} fill="rgba(0,0,0,0.2)" draggable dragBoundFunc={(p)=>({x:originX, y:p.y})} onDragStart={onPushHistory} onDragMove={(e) => updateSystem(ex.id, 'o1', 0, e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} />
                  <Circle id="sys_o2" x={originX} y={b.oY2} radius={sc(8)} fill="rgba(0,0,0,0.2)" draggable dragBoundFunc={(p)=>({x:originX, y:p.y})} onDragStart={onPushHistory} onDragMove={(e) => updateSystem(ex.id, 'o2', 0, e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} />
                </React.Fragment>
              )}

              {reqPP && (
                <React.Fragment>
                  <Circle id="sys_pp" x={ppX} y={ltY} radius={sc(12)} fill="rgba(200,100,200,0.3)" draggable dragBoundFunc={(p)=>({x:p.x, y:ltY})} onDragStart={onPushHistory} onDragMove={(e) => updateSystem(ex.id, 'pp', e.target.x(), 0)} onMouseEnter={handleHover} onMouseLeave={handleOut} />
                  <Circle id="sys_p1" x={ppX} y={b.pY1} radius={sc(8)} fill="rgba(0,0,0,0.2)" draggable dragBoundFunc={(p)=>({x:ppX, y:p.y})} onDragStart={onPushHistory} onDragMove={(e) => updateSystem(ex.id, 'p1', 0, e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} />
                  <Circle id="sys_p2" x={ppX} y={b.pY2} radius={sc(8)} fill="rgba(0,0,0,0.2)" draggable dragBoundFunc={(p)=>({x:ppX, y:p.y})} onDragStart={onPushHistory} onDragMove={(e) => updateSystem(ex.id, 'p2', 0, e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} />
                </React.Fragment>
              )}

              {planes.map(pl => {
                if (pl.type === 'horizontal') return <Circle key={pl.id} x={pl.p2.x} y={pl.p2.y} radius={sc(12)} fill="rgba(0,150,255,0.4)" draggable onDragStart={onPushHistory} onDragMove={e=>updatePlaneEndpoint(ex.id, pl.id, 2, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={(e) => handleEntityClick(e, 'plano', `pl2_${pl.id}`, `Traza ${pl.name}2`)} />;
                if (pl.type === 'frontal') return <Circle key={pl.id} x={pl.p1.x} y={pl.p1.y} radius={sc(12)} fill="rgba(0,150,255,0.4)" draggable onDragStart={onPushHistory} onDragMove={e=>updatePlaneEndpoint(ex.id, pl.id, 1, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={(e) => handleEntityClick(e, 'plano', `pl1_${pl.id}`, `Traza ${pl.name}1`)} />;
                if (pl.type === 'paralelo_lt') return <React.Fragment key={pl.id}><Circle x={pl.p2.x} y={pl.p2.y} radius={sc(12)} fill="rgba(0,150,255,0.4)" draggable onDragStart={onPushHistory} onDragMove={e=>updatePlaneEndpoint(ex.id, pl.id, 2, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={(e) => handleEntityClick(e, 'plano', `pl2_${pl.id}`, `Traza ${pl.name}2`)} /><Circle x={pl.p1.x} y={pl.p1.y} radius={sc(12)} fill="rgba(0,150,255,0.4)" draggable onDragStart={onPushHistory} onDragMove={e=>updatePlaneEndpoint(ex.id, pl.id, 1, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={(e) => handleEntityClick(e, 'plano', `pl1_${pl.id}`, `Traza ${pl.name}1`)} /></React.Fragment>;
                return (
                  <React.Fragment key={pl.id}>
                    <Circle x={pl.vX} y={ltY} radius={sc(15)} fill="rgba(0, 150, 255, 0.4)" draggable dragBoundFunc={(pos) => ({ x: pos.x, y: ltY })} onDragStart={onPushHistory} onDragMove={(e) => updatePlane(ex.id, pl.id, e.target.x())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={(e) => handleEntityClick(e, 'plano', `pl_${pl.id}`, `Plano ${pl.name}`)} />
                    <Circle x={pl.p2.x} y={pl.p2.y} radius={sc(12)} fill="rgba(0, 150, 255, 0.4)" draggable onDragStart={onPushHistory} onDragMove={e => updatePlaneEndpoint(ex.id, pl.id, 2, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={(e) => handleEntityClick(e, 'plano', `pl2_${pl.id}`, `Traza ${pl.name}2`)} />
                    <Circle x={pl.p1.x} y={pl.p1.y} radius={sc(12)} fill="rgba(0, 150, 255, 0.4)" draggable onDragStart={onPushHistory} onDragMove={e => updatePlaneEndpoint(ex.id, pl.id, 1, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={(e) => handleEntityClick(e, 'plano', `pl1_${pl.id}`, `Traza ${pl.name}1`)} />
                  </React.Fragment>
                );
              })}

              {segments.map(seg => (
                <React.Fragment key={seg.id}>
                  {!seg.isDashed && <><Circle x={seg.p1.x} y={seg.p1.y} radius={sc(10)} fill="rgba(255, 100, 100, 0.4)" draggable onDragStart={onPushHistory} onDragMove={(e) => updateSegment(ex.id, seg.id, 1, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={(e) => handleEntityClick(e, 'recta', `seg_${seg.id}`, `Extremo Recta ${seg.label.replace(/[12]/g, '')}`)} />
                  <Circle x={seg.p2.x} y={seg.p2.y} radius={sc(10)} fill="rgba(255, 100, 100, 0.4)" draggable onDragStart={onPushHistory} onDragMove={(e) => updateSegment(ex.id, seg.id, 2, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={(e) => handleEntityClick(e, 'recta', `seg_${seg.id}`, `Extremo Recta ${seg.label.replace(/[12]/g, '')}`)} /></>}
                </React.Fragment>
              ))}
              {pts.map(p => p.nodes.map(n => (
                <Circle key={n.id} x={n.x} y={n.y} radius={sc(12)} fill="rgba(255, 71, 87, 0.4)" draggable onDragStart={onPushHistory} onDragMove={(e) => updateNode(ex.id, p.id, n.id, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={(e) => handleEntityClick(e, 'punto', `pt_${n.id}`, `Punto ${p.name}`)} />
              )))}
            </Group>
          </Layer>
        </Stage>
      </div>
    </div>
  );
}

// ==========================================
// 3. LA INTERFAZ PRINCIPAL (MENÚS Y PAGINACIÓN)
// ==========================================
export default function App() {
  const { 
    exercises, addExercise, removeExercise, addFreeElement, updateBoxSize, saveData, loadData,
    pageSize, fontFamily, fontSize, zoom, setPageConfig, selection, setSelection, past, future, undo, redo,
    toggleLineStyle, togglePlaneType, updateName, addConstraint, removeConstraint, addAuxLine
  } = useStore();
  
  const [type, setType] = useState('punto_coord');
  
  const [ptCount, setPtCount] = useState(4);
  const [lineMethod, setLineMethod] = useState('coord'); const [lineType, setLineType] = useState('cualquiera');
  const [planeType, setPlaneType] = useState('oblicuo');
  const [quadA, setQuadA] = useState('any'); const [quadB, setQuadB] = useState('any');
  const [reqPP, setReqPP] = useState(false); const [reqRegla, setReqRegla] = useState(false); const [reqOrigin, setReqOrigin] = useState(false);

  const [intSub, setIntSub] = useState('todas'); const [intP1, setIntP1] = useState('oblicuo'); const [intP2, setIntP2] = useState('oblicuo');
  const [paraSub, setParaSub] = useState('r_r_pto');
  const [perpSub, setPerpSub] = useState('r_p_pto');
  const [pertSub, setPertSub] = useState('max_pend'); const [pertPlaneType, setPertPlaneType] = useState('oblicuo');
  const [abatElem, setAbatElem] = useState('punto'); const [abatEstado, setAbatEstado] = useState('proy'); const [abatPlano, setAbatPlano] = useState('ph');
  const [abatLados, setAbatLados] = useState(3);

  const handleAdd = () => { addExercise({ type, ptCount, lineMethod, lineType, planeType, quadA, quadB, reqPP, reqRegla, reqOrigin, intSub, intP1, intP2, paraSub, perpSub, pertSub, pertPlaneType, abatElem, abatEstado, abatPlano, abatLados }); };

  const handlePrint = () => {
    setSelection([]);
    useStore.getState().setPrinting(true);
    setTimeout(() => { window.print(); useStore.getState().setPrinting(false); }, 300);
  };

  const paginatedExercises = useMemo(() => {
    let pages: Exercise[][] = []; 
    let currPage: Exercise[] = [];
    let currY = 0; let rowH = 0; let rowW = 0;
    
    exercises.forEach(ex => {
      let hVal = parseInt(ex.h) || 136;
      let wVal = parseFloat(ex.w) || 50;
      const MAX_H = pages.length === 0 ? 275 : 305; 

      if (rowW + wVal <= 101) { 
        rowW += wVal; rowH = Math.max(rowH, hVal);
      } else {
        currY += rowH; rowW = wVal; rowH = hVal;
      }
      if (currY + rowH > MAX_H && currPage.length > 0) {
        pages.push(currPage); currPage = []; currY = 0; rowW = wVal; rowH = hVal;
      }
      currPage.push(ex);
    });
    if (currPage.length > 0) pages.push(currPage);
    if (pages.length === 0) pages = [[]];
    return pages;
  }, [exercises]);

  const PAGE_W = pageSize === 'A3' ? '420mm' : '210mm';

  return (
    <>
      <style>{`
        body { margin: 0; font-family: 'Segoe UI', system-ui, sans-serif; background-color: #1e1e24; color: #e5e5e5; }
        
        .top-navbar { height: 60px; background: #252530; border-bottom: 1px solid #333; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); z-index: 100; position: relative; }
        .nav-brand { font-size: 1.2rem; font-weight: bold; color: #00d2ff; text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 10px;}
        .nav-tools { display: flex; gap: 10px; align-items: center; }
        .tool-btn { background: #333344; color: white; border: 1px solid #445; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 0.85rem; transition: all 0.2s; display: flex; align-items: center; gap: 5px; }
        .tool-btn:hover { background: #444455; border-color: #00d2ff; }
        .tool-btn.primary { background: #00d2ff; color: #000; border-color: #00d2ff; }
        .tool-btn.primary:hover { background: #00b8e6; }
        .tool-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .app-body { display: flex; height: calc(100vh - 60px); overflow: hidden; width: 100vw; }

        .left-panel { width: 300px; background: #2a2a35; padding: 20px; overflow-y: auto; border-right: 1px solid #1a1a20; flex-shrink: 0; }
        .right-panel { width: 300px; background: #2a2a35; padding: 20px; overflow-y: auto; border-left: 1px solid #1a1a20; flex-shrink: 0; display: flex; flex-direction: column; gap: 15px; }

        .panel-section { background: #333344; padding: 15px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #3e3e50; }
        .panel-title { font-size: 0.75rem; color: #8899aa; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; font-weight: bold; }
        
        .input-group { margin-bottom: 10px; }
        .input-group label { display: block; font-size: 0.85rem; color: #00d2ff; margin-bottom: 4px; font-weight: 600; }
        .cad-select, .cad-input { width: 100%; padding: 8px 10px; background: #1e1e24; color: white; border: 1px solid #445; border-radius: 4px; font-size: 0.9rem; outline: none; }
        .cad-select:focus, .cad-input:focus { border-color: #00d2ff; }

        .cad-checkbox { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: #ddd; cursor: pointer; padding: 6px 0; }
        .cad-checkbox input { accent-color: #00d2ff; width: 16px; height: 16px; cursor: pointer; }

        .action-btn { width: 100%; padding: 10px; background: #2ed573; border: none; color: black; font-weight: bold; cursor: pointer; border-radius: 4px; margin-top: 10px; transition: 0.2s; }
        .action-btn:hover { background: #26b962; }
        .action-btn.danger { background: #ff4757; color: white; }
        .action-btn.danger:hover { background: #e84150; }
        .action-btn.warning { background: #eccc68; color: black; }
        .action-btn.warning:hover { background: #dfc158; }

        .workspace { flex: 1; overflow: auto; background-color: #e5e5e5; background-image: linear-gradient(#d5d5d5 1px, transparent 1px), linear-gradient(90deg, #d5d5d5 1px, transparent 1px); background-size: 20px 20px; display: flex; flex-direction: column; align-items: center; padding: 40px; }
        
        .sheet-container { display: flex; flex-direction: column; align-items: center; transform-origin: top center; }
        .page-sheet { background: white; width: ${PAGE_W}; min-height: 297mm; padding: 3mm; color: black; box-sizing: border-box; break-inside: avoid; margin-bottom: 40px; display: flex; flex-direction: column; overflow: hidden; transition: width 0.3s ease; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
        
        .page-border { border: 2px solid black; flex-grow: 1; display: flex; flex-direction: column; box-sizing: border-box; background: white; position: relative; overflow: hidden; }
        .cajetin { width: ${pageSize === 'A3' ? '204mm' : '100%'}; border-right: ${pageSize === 'A3' ? '2px solid black' : 'none'}; border-bottom: 2px solid black; box-sizing: border-box; flex-shrink: 0; z-index: 10; background: white; transition: width 0.3s ease; }
        .cajetin-top { display: flex; justify-content: space-between; padding: 5px 12px; border-bottom: 1px solid black; font-size: 0.8rem; font-weight: bold; }
        .cajetin-bottom { display: flex; gap: 20px; padding: 10px 12px; font-weight: bold; }
        
        .exercises-grid { flex-grow: 1; display: flex; flex-wrap: wrap; align-content: flex-start; align-items: stretch; width: 100%; }
        .exercise-box { display: flex; flex-direction: column; position: relative; break-inside: avoid; box-sizing: border-box; border-right: 1.5px solid black; border-bottom: 1.5px solid black; background: white; overflow: hidden; }
        
        .exercise-title { padding: 6px 10px; background: #f8f9fa; border-bottom: 1.5px solid black; font-weight: bold; word-wrap: break-word; line-height: 1.3; font-family: ${fontFamily}; font-size: ${fontSize}px; text-align: justify; }
        .exercise-data { font-family: ${fontFamily}; font-size: ${fontSize - 1}px; padding: 4px 10px; text-align: left; border-bottom: 1.5px dashed #ccc; font-weight: bold; outline: none; line-height: 1.3; word-wrap: break-word; text-align: justify; }
        
        .side-handle-r { position: absolute; right: -5px; top: 0; bottom: 0; width: 15px; cursor: ew-resize; z-index: 15; background: rgba(0,0,0,0.01); transition: background 0.2s; touch-action: none; }
        .side-handle-r:hover, .side-handle-r:active { background: rgba(0, 210, 255, 0.4); }
        .side-handle-b { position: absolute; left: 0; right: 0; bottom: -5px; height: 15px; cursor: ns-resize; z-index: 15; background: rgba(0,0,0,0.01); transition: background 0.2s; touch-action: none; }
        .side-handle-b:hover, .side-handle-b:active { background: rgba(0, 210, 255, 0.4); }

        @media print { 
          body, html, .app-container, .app-body { background: white; height: auto !important; overflow: visible !important; display: block !important; width: auto !important; }
          .no-print { display: none !important; } 
          .workspace { padding: 0 !important; gap: 0 !important; height: auto !important; overflow: visible !important; display: block !important; background: none; } 
          .sheet-container { zoom: 1 !important; transform: none !important; }
          
          @page { size: ${pageSize === 'A3' ? 'A3 landscape' : 'A4 portrait'}; margin: 0; }
          .page-sheet { box-shadow: none; margin: 0; padding: 3mm; page-break-after: always; display: flex; flex-direction: column; border: none; width: ${PAGE_W}; height: 297mm; } 
          
          .page-border { border: 2px solid black; flex-grow: 1; display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden; position: relative; }
          .exercises-grid { flex-grow: 1; display: flex; flex-wrap: wrap; align-content: flex-start; align-items: stretch; width: 100%; }
          .exercise-box { resize: none; overflow: hidden; border-right: 1.5px solid black; border-bottom: 1.5px solid black; } 
        }
      `}</style>
      
      <div className="app-container">
        
        {/* BARRA SUPERIOR */}
        <div className="top-navbar no-print">
            <div className="nav-brand">📐 Editor Diédrico PRO</div>
            <div className="nav-tools">
                <button className="tool-btn" onClick={undo} disabled={past.length === 0} title="Deshacer">↩ Deshacer</button>
                <button className="tool-btn" onClick={redo} disabled={future.length === 0} title="Rehacer">↪ Rehacer</button>
                <div style={{width: '1px', height: '24px', background: '#556', margin: '0 10px'}}></div>
                <button className="tool-btn" onClick={loadData}>📂 Cargar</button>
                <button className="tool-btn" onClick={saveData}>💾 Guardar</button>
                <button className="tool-btn" onClick={useStore.getState().downloadData}>⬇️ JSON</button>
                <button className="tool-btn primary" onClick={handlePrint}>🖨️ Imprimir</button>
            </div>
        </div>

        <div className="app-body">
            {/* PANEL IZQUIERDO: CREACIÓN Y AJUSTES */}
            <div className="left-panel no-print">
            
            <div className="panel-section">
                <div className="panel-title">Lámina / Vista</div>
                <div className="input-group">
                    <label>Formato Papel:</label>
                    <select className="cad-select" value={pageSize} onChange={e => setPageConfig({pageSize: e.target.value as 'A4'|'A3'})}>
                        <option value="A4">A4 (Vertical)</option>
                        <option value="A3">A3 (Horizontal)</option>
                    </select>
                </div>
                <div className="input-group">
                    <label>Zoom Hoja: {Math.round(zoom * 100)}%</label>
                    <input className="cad-input" type="range" min="30" max="200" value={zoom * 100} onChange={e => setPageConfig({zoom: Number(e.target.value) / 100})} />
                </div>
                <div className="input-group" style={{marginTop:'10px'}}>
                    <label>Tipografía Textos:</label>
                    <select className="cad-select" value={fontFamily} onChange={e => setPageConfig({fontFamily: e.target.value})}>
                        <option value="'Segoe UI', sans-serif">Segoe UI</option>
                        <option value="Arial, sans-serif">Arial</option>
                        <option value="'Times New Roman', serif">Times New Roman</option>
                        <option value="'Courier New', monospace">Courier New</option>
                    </select>
                </div>
                <div className="input-group">
                    <label>Tamaño Texto: {fontSize}px</label>
                    <input className="cad-input" type="range" min="10" max="24" value={fontSize} onChange={e => setPageConfig({fontSize: Number(e.target.value)})} />
                </div>
            </div>

            <div className="panel-section">
                <div className="panel-title">Añadir Ejercicio</div>
                
                <div className="input-group">
                <label>Tipo de Ejercicio:</label>
                <select className="cad-select" value={type} onChange={e => setType(e.target.value)}>
                    <option value="punto_coord">1. Puntos</option><option value="rectas">2. Rectas</option><option value="plano_coord">3. Planos (Coordenadas)</option>
                    <option value="intersecciones">4. Intersecciones</option><option value="paralelismo">5. Paralelismo</option>
                    <option value="perpendicularidad">6. Perpendicularidad</option><option value="pertenencias">7. Pertenencias / Contenidas</option>
                    <option value="abatimientos">8. Abatimientos</option>
                </select>
                </div>

                {type === 'punto_coord' && (<div className="input-group"><label>Nº Puntos:</label><input className="cad-input" type="number" value={ptCount} onChange={e=>setPtCount(Number(e.target.value))} min="1" max="10" /></div>)}
                {type === 'rectas' && (
                <>
                    <div className="input-group"><label>Método:</label><select className="cad-select" value={lineMethod} onChange={e=>setLineMethod(e.target.value)}><option value="coord">Por Coordenadas</option><option value="puntos">Por Puntos Dibujados</option><option value="proy">Por Proyecciones</option></select></div>
                    <div className="input-group"><label>Tipo de Recta:</label><select className="cad-select" value={lineType} onChange={e=>setLineType(e.target.value)}><option value="cualquiera">Aleatoria</option><option value="horizontal">Horizontal</option><option value="frontal">Frontal</option><option value="vertical">Vertical</option><option value="punta">Punta</option><option value="perfil">Perfil</option><option value="paralela_lt">Paralela LT</option><option value="incidente_lt">Incidente LT</option><option value="contenida_pv">Contenida PV</option><option value="contenida_ph">Contenida PH</option></select></div>
                </>
                )}
                {type === 'plano_coord' && (<div className="input-group"><label>Tipo de Plano:</label><select className="cad-select" value={planeType} onChange={e=>setPlaneType(e.target.value)}><option value="oblicuo">Oblicuo</option><option value="proy_vert">Proy. Vertical</option><option value="proy_horiz">Proy. Horizontal</option><option value="perfil">Perfil</option><option value="horizontal">Horizontal</option><option value="frontal">Frontal</option><option value="paralelo_lt">Paralelo a LT</option></select></div>)}
                {(type === 'rectas' || type === 'plano_coord') && (
                <>
                    <div className="input-group"><label>Cuadrante 1:</label><select className="cad-select" value={quadA} onChange={e=>setQuadA(e.target.value)}><option value="any">Aleatorio</option><option value="1">I Cuadrante</option><option value="2">II Cuadrante</option><option value="3">III Cuadrante</option><option value="4">IV Cuadrante</option></select></div>
                    {type !== 'plano_coord' && <div className="input-group"><label>Cuadrante 2:</label><select className="cad-select" value={quadB} onChange={e=>setQuadB(e.target.value)}><option value="any">Aleatorio</option><option value="1">I Cuadrante</option><option value="2">II Cuadrante</option><option value="3">III Cuadrante</option><option value="4">IV Cuadrante</option></select></div>}
                </>
                )}
                {type === 'intersecciones' && (
                <>
                    <div className="input-group"><label>Caso:</label><select className="cad-select" value={intSub} onChange={e=>setIntSub(e.target.value)}><option value="todas">Todas las trazas cortan</option><option value="paralelas">Trazas paralelas</option><option value="no_existe">Traza no existe</option><option value="paralelas_lt">Todas paralelas a LT</option></select></div>
                    <div className="input-group"><label>Plano 1:</label><select className="cad-select" value={intP1} onChange={e=>setIntP1(e.target.value)}><option value="oblicuo">Oblicuo</option><option value="proy_vert">Proy. Vertical</option><option value="proy_horiz">Proy. Horizontal</option><option value="perfil">Perfil</option><option value="horizontal">Horizontal</option><option value="frontal">Frontal</option><option value="paralelo_lt">Paralelo LT</option></select></div>
                    <div className="input-group"><label>Plano 2:</label><select className="cad-select" value={intP2} onChange={e=>setIntP2(e.target.value)}><option value="oblicuo">Oblicuo</option><option value="proy_vert">Proy. Vertical</option><option value="proy_horiz">Proy. Horizontal</option><option value="perfil">Perfil</option><option value="horizontal">Horizontal</option><option value="frontal">Frontal</option><option value="paralelo_lt">Paralelo LT</option></select></div>
                </>
                )}
                {type === 'paralelismo' && (<div className="input-group"><label>Caso:</label><select className="cad-select" value={paraSub} onChange={e=>setParaSub(e.target.value)}><option value="r_r_pto">Recta // Recta por pto</option><option value="p_p_pto">Plano // Plano por pto</option><option value="r_p_pto_corte">Recta // Plano (corta a r)</option><option value="p_r_pto">Plano // Recta por pto</option><option value="p_r_cont_r">Plano // Recta (contiene s)</option><option value="p_2r_cortan">Plano // a 2 rectas que cortan</option></select></div>)}
                {type === 'perpendicularidad' && (<div className="input-group"><label>Caso:</label><select className="cad-select" value={perpSub} onChange={e=>setPerpSub(e.target.value)}><option value="r_p_pto">Recta ⊥ Plano por pto</option><option value="p_r_pto">Plano ⊥ Recta por pto</option><option value="p_p_pto">Plano ⊥ Plano por pto</option><option value="p_p_r">Plano ⊥ Plano por recta</option><option value="r_r_ext">Recta ⊥ Recta por pto ext</option><option value="r_r">Recta ⊥ Recta</option></select></div>)}
                {type === 'pertenencias' && (
                <>
                    <div className="input-group"><label>Caso:</label><select className="cad-select" value={pertSub} onChange={e=>setPertSub(e.target.value)}><option value="max_pend">Recta Máxima Pendiente</option><option value="max_inc">Recta Máxima Inclinación</option><option value="horiz">Recta Horizontal contenida</option><option value="front">Recta Frontal contenida</option><option value="def_2r_c">Plano: 2 rectas se cortan</option><option value="def_2r_p">Plano: 2 rectas paralelas</option><option value="def_3p">Plano: 3 puntos</option><option value="def_r_p">Plano: recta y punto</option></select></div>
                    <div className="input-group"><label>Plano Contenedor:</label><select className="cad-select" value={pertPlaneType} onChange={e=>setPertPlaneType(e.target.value)}><option value="oblicuo">Oblicuo</option><option value="proy_vert">Proy. Vertical</option><option value="proy_horiz">Proy. Horizontal</option></select></div>
                </>
                )}
                {type === 'abatimientos' && (
                <>
                    <div className="input-group"><label>Elemento:</label><select className="cad-select" value={abatElem} onChange={e=>setAbatElem(e.target.value)}><option value="punto">Punto</option><option value="recta">Recta</option><option value="fig_reg">Figura Regular</option><option value="fig_irreg">Figura Irregular</option></select></div>
                    {(abatElem === 'fig_reg' || abatElem === 'fig_irreg') && <div className="input-group"><label>Nº Lados/Vértices:</label><input className="cad-input" type="number" value={abatLados} onChange={e=>setAbatLados(Number(e.target.value))} min="3" max="10" /></div>}
                    <div className="input-group"><label>Estado Dado:</label><select className="cad-select" value={abatEstado} onChange={e=>setAbatEstado(e.target.value)}><option value="proy">Proyecciones (V.M)</option><option value="vm">Desabatir</option></select></div>
                    <div className="input-group"><label>Sobre Plano:</label><select className="cad-select" value={abatPlano} onChange={e=>setAbatPlano(e.target.value)}><option value="ph">PH</option><option value="pv">PV</option></select></div>
                </>
                )}
                
                <div style={{marginTop: '15px'}}>
                <label className="cad-checkbox"><input type="checkbox" checked={reqOrigin} onChange={e=>setReqOrigin(e.target.checked)} /> Mostrar Origen (0)</label>
                <label className="cad-checkbox"><input type="checkbox" checked={reqPP} onChange={e=>setReqPP(e.target.checked)} /> 3ª Proyección (PP)</label>
                <label className="cad-checkbox"><input type="checkbox" checked={reqRegla} onChange={e=>setReqRegla(e.target.checked)} /> Mostrar Regla Graduada</label>
                </div>
                <button className="action-btn" onClick={handleAdd}>+ Añadir al Papel</button>
            </div>
            </div>

            {/* ZONA DE TRABAJO (CANVAS) */}
            <div className="workspace">
            <div className="sheet-container" style={{ zoom: zoom }}>
                {paginatedExercises.map((pageExs, pageIdx) => (
                <div key={pageIdx} className="page-sheet">
                    <div className="page-border">
                    {pageIdx === 0 && (
                        <div className="cajetin">
                        <div className="cajetin-top">
                            <span contentEditable suppressContentEditableWarning style={{outline:'none', padding:'2px'}}>Colegio Nuestra Señora de los Infantes</span>
                            <span contentEditable suppressContentEditableWarning style={{outline:'none', padding:'2px'}}>1º BACHILLERATO</span>
                        </div>
                        <div className="cajetin-bottom">
                            <span style={{flex: 1, display:'flex', alignItems:'flex-end', whiteSpace:'nowrap'}}>Nombre: <span contentEditable style={{borderBottom:'1px solid #000', flex: 1, outline:'none', marginLeft:'5px', paddingBottom:'2px'}}></span></span>
                            <span style={{width: '30%', display:'flex', alignItems:'flex-end', marginLeft:'20px', whiteSpace:'nowrap'}}>Curso: <span contentEditable style={{borderBottom:'1px solid #000', flex: 1, outline:'none', marginLeft:'5px', paddingBottom:'2px'}}></span></span>
                        </div>
                        </div>
                    )}

                    <div className="exercises-grid">
                        {pageExs.map((ex) => (
                        <div key={ex.id} className="exercise-box" style={{ flexBasis: ex.w, minHeight: ex.h }}>
                            
                            <div className="no-print side-handle-r" onPointerDown={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                const startX = e.clientX; 
                                const startW = parseFloat(ex.w) || 50;
                                const parentNode = (e.target as HTMLElement).closest('.exercises-grid');
                                const parentW = parentNode ? parentNode.clientWidth : 680;
                                
                                const exIndex = pageExs.findIndex(item => item.id === ex.id);
                                const nextEx = pageExs[exIndex + 1];
                                const nextStartW = nextEx ? parseFloat(nextEx.w) : 0;
                                const isSameRow = nextEx && (startW + nextStartW > 80) && (startW + nextStartW <= 105);
                                
                                const onMove = (evt: PointerEvent) => {
                                const dX = evt.clientX - startX;
                                const deltaPct = (dX / parentW) * 100;
                                
                                if (isSameRow) {
                                    const maxW = startW + nextStartW - 10;
                                    const newW = Math.max(10, Math.min(maxW, startW + deltaPct));
                                    const newNextW = startW + nextStartW - newW;
                                    useStore.getState().updateBoxSize(ex.id, newW + '%', ex.h);
                                    useStore.getState().updateBoxSize(nextEx.id, newNextW + '%', nextEx.h);
                                } else {
                                    const newW = Math.min(100, Math.max(10, startW + deltaPct));
                                    useStore.getState().updateBoxSize(ex.id, newW + '%', ex.h);
                                }
                                };
                                const cleanup = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', cleanup); };
                                window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', cleanup);
                            }} />
                            <div className="no-print side-handle-b" onPointerDown={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                const startY = e.clientY; 
                                const startH = parseFloat(ex.h) || 136;
                                
                                let rowItems: Exercise[] = [];
                                let tempW = 0;
                                let tempRow: Exercise[] = [];
                                for (const item of pageExs) {
                                const w = parseFloat(item.w) || 50;
                                if (tempW + w > 101 && tempRow.length > 0) {
                                    if (tempRow.some(i => i.id === ex.id)) rowItems = tempRow;
                                    tempRow = [item]; tempW = w;
                                } else {
                                    tempRow.push(item); tempW += w;
                                }
                                }
                                if (tempRow.some(i => i.id === ex.id)) rowItems = tempRow;

                                const onMove = (evt: PointerEvent) => {
                                const newH = Math.max(50, startH + (evt.clientY - startY) * 0.264583);
                                rowItems.forEach(item => {
                                    useStore.getState().updateBoxSize(item.id, item.w, newH + 'mm');
                                });
                                };
                                const cleanup = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', cleanup); };
                                window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', cleanup);
                            }} />

                            <div className="exercise-title" style={{ paddingRight: '10px', display: 'flex', gap: '4px' }}>
                            <span contentEditable={false}><b>{exercises.findIndex(e => e.id === ex.id) + 1}.</b></span>
                            <span contentEditable suppressContentEditableWarning style={{ flex: 1, outline: 'none' }} onBlur={e => useStore.getState().updateExerciseText(ex.id, 'title', e.currentTarget.innerText)}>{ex.title}</span>
                            </div>
                            
                            {ex.dataStr && <div className="exercise-data" contentEditable suppressContentEditableWarning onBlur={e => useStore.getState().updateExerciseText(ex.id, 'dataStr', e.currentTarget.innerText)}>{ex.dataStr}</div>}
                            
                            <div className="no-print" style={{ display: 'flex', gap: '5px', padding: '4px 10px', background: '#f8f9fa', borderBottom: '1.5px solid #eaeaea' }}>
                            <button className="tool-btn" style={{ padding: '2px 6px', fontSize: '0.65rem' }} onClick={() => addFreeElement(ex.id, 'punto')}>+ Pto</button>
                            <button className="tool-btn" style={{ padding: '2px 6px', fontSize: '0.65rem' }} onClick={() => addFreeElement(ex.id, 'recta')}>+ Recta</button>
                            <button className="tool-btn" style={{ padding: '2px 6px', fontSize: '0.65rem' }} onClick={() => addFreeElement(ex.id, 'plano')}>+ Plano</button>
                            </div>

                            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                            <View2D ex={ex} />
                            </div>
                        </div>
                        ))}
                    </div>
                    </div>
                </div>
                ))}
            </div>
            </div>

            {/* PANEL DERECHO: PROPIEDADES Y RESTRICCIONES */}
            <div className="right-panel no-print">
                <div className="panel-section">
                    <div className="panel-title">Selector / Propiedades</div>
                    {selection.length === 0 ? (
                        <div style={{fontSize: '0.85rem', color: '#8899aa', fontStyle: 'italic', textAlign: 'center', padding: '20px 0'}}>
                            👈 Haz clic en cualquier elemento del dibujo para editarlo aquí.
                        </div>
                    ) : (
                        <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                            {selection.map(sel => (
                                <div key={sel.rawId} style={{background: '#1e1e24', padding: '10px', borderRadius: '4px', borderLeft: '3px solid #00d2ff'}}>
                                    <div style={{fontWeight: 'bold', fontSize: '0.9rem', color: '#00d2ff', marginBottom: '8px'}}>{sel.label}</div>
                                    <div style={{display: 'flex', gap: '5px'}}>
                                        <button className="tool-btn" style={{flex: 1, padding: '4px'}} onClick={() => updateName(sel.exId, sel.type, sel.id, "")} title="Ocultar letra">🆑 Nombre</button>
                                        {(sel.type === 'recta' || sel.type === 'plano') && (
                                            <button className="tool-btn" style={{flex: 1, padding: '4px'}} onClick={() => toggleLineStyle(sel.exId, sel.type, sel.id)} title="Cambiar tipo de línea">🔄 Línea</button>
                                        )}
                                        {sel.type === 'plano' && (
                                            <button className="tool-btn" style={{flex: 1, padding: '4px'}} onClick={() => togglePlaneType(sel.exId, sel.id)} title="Hacer paralelo a LT">⮂ Paralelo LT</button>
                                        )}
                                        <button className="tool-btn" style={{background: '#ff4757', border: 'none', padding: '4px 8px'}} onClick={() => { removeElement(sel.exId, sel.type, sel.id); setSelection(selection.filter(s => s.id !== sel.id)); }}>🗑️</button>
                                    </div>
                                </div>
                            ))}

                            {/* CREACIÓN DE LÍNEAS AUXILIARES LIBRES (Solo 1 elemento seleccionado) */}
                            {selection.length === 1 && (selection[0].type === 'recta' || selection[0].type === 'plano') && (
                                <div style={{marginTop: '10px', background: '#3d3d52', padding: '10px', borderRadius: '4px', border: '1px solid #00d2ff'}}>
                                    <div style={{fontSize: '0.8rem', color: '#00d2ff', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center'}}>AÑADIR AUXILIARES LIBRES</div>
                                    <div style={{display: 'flex', gap: '5px'}}>
                                        <button className="action-btn" style={{margin: 0, padding: '6px'}} onClick={() => addAuxLine(selection[0].exId, selection[0].rawId, 'parallel')}>+ // Paralela</button>
                                        <button className="action-btn" style={{margin: 0, padding: '6px'}} onClick={() => addAuxLine(selection[0].exId, selection[0].rawId, 'perp')}>+ ⟂ Perpend.</button>
                                    </div>
                                </div>
                            )}

                            {/* VÍNCULOS GEOMÉTRICOS (2 elementos seleccionados) */}
                            {selection.length === 2 && (selection[0].type === 'recta' || selection[0].type === 'plano') && (selection[1].type === 'recta' || selection[1].type === 'plano') && selection[0].exId === selection[1].exId && (
                                <div style={{marginTop: '10px', background: '#3d3d52', padding: '10px', borderRadius: '4px', border: '1px solid #eccc68'}}>
                                    <div style={{fontSize: '0.8rem', color: '#eccc68', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center'}}>VINCULAR GEOMETRÍA</div>
                                    <div style={{display: 'flex', gap: '5px'}}>
                                        <button className="action-btn warning" style={{margin: 0, padding: '6px'}} onClick={() => addConstraint(selection[0].exId, 'parallel', selection[0].id, selection[1].id)}>🔗 // Paralelas</button>
                                        <button className="action-btn warning" style={{margin: 0, padding: '6px'}} onClick={() => addConstraint(selection[0].exId, 'perp', selection[0].id, selection[1].id)}>🔗 ⟂ Perpend.</button>
                                    </div>
                                </div>
                            )}

                            {selection.length > 2 && (
                                <div style={{fontSize: '0.8rem', color: '#ff4757', textAlign: 'center', marginTop: '5px'}}>
                                    Selecciona máximo 2 elementos para vincularlos.
                                </div>
                            )}

                            <button className="action-btn warning" style={{marginTop: '10px'}} onClick={() => setSelection([])}>Deseleccionar Todo</button>
                        </div>
                    )}
                </div>

                {/* Lista de restricciones activas para el ejercicio actual si hay elementos seleccionados */}
                {selection.length > 0 && exercises.find(e => e.id === selection[0].exId)?.state.constraints.length! > 0 && (
                     <div className="panel-section">
                         <div className="panel-title">Vínculos Matemáticos Activos</div>
                         {exercises.find(e => e.id === selection[0].exId)?.state.constraints.map(c => {
                             const isParallel = c.type === 'parallel';
                             return (
                                 <div key={c.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e1e24', padding: '8px 10px', borderRadius: '4px', marginBottom: '5px', fontSize: '0.85rem', borderLeft: '3px solid #eccc68'}}>
                                     <span style={{color: '#ddd'}}>{isParallel ? '🔗 Paralelismo' : '🔗 Perpendicularidad'}</span>
                                     <button style={{background: 'transparent', border: 'none', color: '#ff4757', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem'}} onClick={() => removeConstraint(selection[0].exId, c.id)}>✕</button>
                                 </div>
                             );
                         })}
                     </div>
                )}
                
                {/* Borrar Ejercicio (Global para la selección activa) */}
                {selection.length > 0 && (
                    <button className="action-btn danger" style={{marginTop: 'auto'}} onClick={() => {
                        removeExercise(selection[0].exId);
                    }}>Eliminar Ejercicio Completo</button>
                )}
            </div>
        </div>
      </div>
    </>
  );
}
