import React, { useState, useRef, useLayoutEffect, useMemo } from 'react';
import { create } from 'zustand';
import { Stage, Layer, Shape, Circle, Group, Line } from 'react-konva';

// ==========================================
// 1. EL CEREBRO MATEMÁTICO (ZUSTAND)
// ==========================================
export interface ExNode { id: string; t: string; x: number; y: number; pairId?: string; }
export interface ExPlane { id: string; name: string; type: string; vX: number; p1: {x:number, y:number}; p2: {x:number, y:number}; customStyle?: 'solid' | 'dashed'; color?: string; }
export interface ExSegment { id: string; label: string; p1: {x:number, y:number}; p2: {x:number, y:number}; isDashed?: boolean; customStyle?: 'solid' | 'dashed'; color?: string; }
export interface Constraint { id: string; type: 'parallel' | 'perpendicular'; exId: string; elem1Id: string; elem1Type: 'recta' | 'plano'; elem2Id: string; elem2Type: 'recta' | 'plano'; angleDelta: number; }
export interface Exercise {
  id: string; title: string; type: string; w: string; h: string; dataStr: string;
  state: { ltY: number; originX: number; ppX: number; reqRegla: boolean; reqPP: boolean; reqOrigin: boolean; planes: ExPlane[]; segments: ExSegment[]; pts: {id:string, name:string, nodes:ExNode[], color?: string}[]; bounds?: { ltX1: number; ltX2: number; oY1: number; oY2: number; pY1: number; pY2: number; } };
}

interface CadStore {
  exercises: Exercise[];
  history: Exercise[][];
  historyIndex: number;
  isPrinting: boolean;
  pageSize: 'A4' | 'A3';
  fontFamily: string;
  fontSize: number;
  sheetZoom: number;
  selectedElements: { exId: string; type: 'punto' | 'recta' | 'plano'; id: string; label: string }[];
  constraints: Constraint[];
  
  commitHistory: () => void;
  undo: () => void;
  redo: () => void;
  setPageConfig: (config: Partial<{pageSize: 'A4'|'A3', fontFamily: string, fontSize: number, sheetZoom: number}>) => void;
  setPrinting: (val: boolean) => void;
  addExercise: (opts: any) => void;
  removeExercise: (id: string) => void;
  updateBoxSize: (id: string, w: string, h: string) => void;
  selectElement: (exId: string, type: 'punto' | 'recta' | 'plano', id: string, label: string) => void;
  clearSelection: () => void;
  applyConstraint: (type: 'parallel' | 'perpendicular') => void;
  removeConstraintsFor: (id: string) => void;
  updateNode: (exId: string, ptId: string, nodeId: string, newX: number, newY: number) => void;
  updatePlane: (exId: string, planeId: string, newVX: number) => void;
  updatePlaneEndpoint: (exId: string, planeId: string, traceNum: 1|2, newX: number, newY: number) => void;
  togglePlaneType: (exId: string, planeId: string) => void;
  toggleLineStyle: (exId: string, elemType: 'recta' | 'plano', elemId: string) => void;
  updateColor: (exId: string, elemType: 'punto' | 'recta' | 'plano', elemId: string, color: string) => void;
  updateSegment: (exId: string, segId: string, pointIndex: 1|2, newX: number, newY: number) => void;
  updateSystem: (exId: string, target: string, valX: number, valY: number) => void;
  addFreeElement: (exId: string, elemType: 'punto' | 'recta' | 'plano') => void;
  removeElement: (exId: string, elemType: 'punto' | 'recta' | 'plano', elemId: string) => void;
  updateName: (exId: string, elemType: 'punto' | 'recta' | 'plano', elemId: string, newName: string) => void;
  updateExerciseText: (exId: string, field: 'title' | 'dataStr', text: string) => void;
  saveData: () => void;
  loadData: () => void;
  importData: (newExs: Exercise[]) => void;
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

function getLineAngle(p1: {x:number, y:number}, p2: {x:number, y:number}) {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

function enforceConstraintPair(ex: Exercise, c: Constraint, structuralChangeOnId: string) {
  let seg1 = ex.state.segments.find(s => s.id === c.elem1Id);
  let pl1 = ex.state.planes.find(p => p.id === c.elem1Id);
  let seg2 = ex.state.segments.find(s => s.id === c.elem2Id);
  let pl2 = ex.state.planes.find(p => p.id === c.elem2Id);

  if (!seg1 && !pl1) return;
  if (!seg2 && !pl2) return;

  let targetAngle = 0;
  let driverP1 = {x:0, y:0}, driverP2 = {x:0, y:0};
  let driverIs2 = (structuralChangeOnId === c.elem2Id);
  
  let driverSeg = driverIs2 ? seg2 : seg1;
  let driverPl = driverIs2 ? pl2 : pl1;
  let drivenSeg = driverIs2 ? seg1 : seg2;
  let drivenPl = driverIs2 ? pl1 : pl2;

  if (driverSeg) { driverP1 = driverSeg.p1; driverP2 = driverSeg.p2; }
  else if (driverPl) { driverP1 = {x: driverPl.vX, y: ex.state.ltY}; driverP2 = driverPl.p2; } 
  
  let baseAngle = getLineAngle(driverP1, driverP2);
  targetAngle = c.type === 'parallel' ? baseAngle : baseAngle + Math.PI/2;

  if (drivenSeg) {
      let len = Math.hypot(drivenSeg.p2.y - drivenSeg.p1.y, drivenSeg.p2.x - drivenSeg.p1.x);
      drivenSeg.p2.x = drivenSeg.p1.x + len * Math.cos(targetAngle);
      drivenSeg.p2.y = drivenSeg.p1.y + len * Math.sin(targetAngle);
  } else if (drivenPl) {
      let len2 = Math.hypot(drivenPl.p2.y - ex.state.ltY, drivenPl.p2.x - drivenPl.vX);
      drivenPl.p2.x = drivenPl.vX + len2 * Math.cos(targetAngle);
      drivenPl.p2.y = ex.state.ltY + len2 * Math.sin(targetAngle);
  }
}

let initialExercises: Exercise[] = [];
try {
  const savedData = localStorage.getItem('diedrico_autosave');
  if (savedData) {
    const parsed = JSON.parse(savedData);
    if (Array.isArray(parsed) && parsed.every(ex => ex && ex.state)) initialExercises = parsed;
    else localStorage.removeItem('diedrico_autosave');
  }
} catch (e) { localStorage.removeItem('diedrico_autosave'); }

export const useStore = create<CadStore>()((set, get) => ({
  exercises: initialExercises,
  history: [initialExercises],
  historyIndex: 0,
  isPrinting: false,
  pageSize: 'A4',
  fontFamily: "'Segoe UI', sans-serif",
  fontSize: 13,
  sheetZoom: 100,
  selectedElements: [],
  constraints: [],

  commitHistory: () => set(state => {
    const currentJSON = JSON.stringify(state.exercises);
    const lastHistoryJSON = JSON.stringify(state.history[state.historyIndex]);
    if (currentJSON === lastHistoryJSON) return state; 
    const cleanHistory = state.history.slice(0, state.historyIndex + 1);
    return { history: [...cleanHistory, JSON.parse(currentJSON)], historyIndex: cleanHistory.length };
  }),

  undo: () => set(state => {
    if (state.historyIndex > 0) return { historyIndex: state.historyIndex - 1, exercises: JSON.parse(JSON.stringify(state.history[state.historyIndex - 1])) };
    return state;
  }),

  redo: () => set(state => {
    if (state.historyIndex < state.history.length - 1) return { historyIndex: state.historyIndex + 1, exercises: JSON.parse(JSON.stringify(state.history[state.historyIndex + 1])) };
    return state;
  }),

  setPageConfig: (config) => set((state) => ({ ...state, ...config })),
  setPrinting: (val) => set({ isPrinting: val }),

  selectElement: (exId, type, id, label) => set((state) => {
    let list = [...(state.selectedElements || [])];
    const index = list.findIndex(item => item.id === id);
    if (index > -1) list.splice(index, 1);
    else {
      if (list.length >= 2) list.shift();
      list.push({ exId, type, id, label });
    }
    return { selectedElements: list };
  }),

  clearSelection: () => set({ selectedElements: [] }),

  applyConstraint: (type) => {
    const state = get();
    if (state.selectedElements.length !== 2) return;
    const [e1, e2] = state.selectedElements;
    if (e1.exId !== e2.exId) return;

    const newConstraint: Constraint = {
      id: uid(), type, exId: e1.exId, elem1Id: e1.id, elem1Type: e1.type as any, elem2Id: e2.id, elem2Type: e2.type as any, angleDelta: type === 'parallel' ? 0 : Math.PI/2
    };

    set(st => ({
      exercises: st.exercises.map(ex => {
        if (ex.id !== e1.exId) return ex;
        let cloned = JSON.parse(JSON.stringify(ex));
        enforceConstraintPair(cloned, newConstraint, e1.id);
        return cloned;
      }),
      constraints: [...st.constraints, newConstraint],
      selectedElements: []
    }));
    get().commitHistory();
  },

  removeConstraintsFor: (id) => {
    set(st => ({ constraints: st.constraints.filter(c => c.elem1Id !== id && c.elem2Id !== id) }));
    get().commitHistory();
  },

  saveData: () => { localStorage.setItem('diedrico_pro_data', JSON.stringify(get().exercises)); alert("Lámina guardada."); },
  loadData: () => { 
    const d = localStorage.getItem('diedrico_pro_data'); 
    if (d) { set({ exercises: JSON.parse(d) }); get().commitHistory(); } else alert("No hay datos guardados."); 
  },
  importData: (newExs) => {
    set({ exercises: newExs, history: [newExs], historyIndex: 0, selectedElements: [], constraints: [] });
    localStorage.setItem('diedrico_autosave', JSON.stringify(newExs));
  },
  downloadData: () => { 
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(get().exercises));
    const a = document.createElement('a'); a.href = dataStr; a.download = `lamina_diedrico_${new Date().getTime()}.json`; a.click();
  },

  addExercise: (opts) => {
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
        pts.push({ id:uid(), name:'A', nodes:[{id:uid(), t:'2', x:originX+ax*SF, y:ltY-az*SF, pairId:'n1A'}, {id:'n1A', t:'1', x:originX+ax*SF, y:ltY+ay*SF}] });
        pts.push({ id:uid(), name:'B', nodes:[{id:uid(), t:'2', x:originX+bx*SF, y:ltY-bz*SF, pairId:'n1B'}, {id:'n1B', t:'1', x:originX+bx*SF, y:ltY+by*SF}] });
      } else {
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
      let pA = genPlane('α', 'oblicuo', true, -60);
      let px = originX + 40*SF; let pz = ltY - 60; let py = ltY + 50;
      pts.push({ id: uid(), name: 'A', nodes: [{id:uid(), t:'2', x:px, y:pz, pairId:'n1A'}, {id:'n1A', t:'1', x:px, y:py}] });
      
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
                  figPts.push({ id:uid(), name: String.fromCharCode(65+i), nodes: [{id:uid(), t:'2', x:nx, y:nz, pairId:'n1'+i}, {id:'n1'+i, t:'1', x:nx, y:ny}] });
              }
              pts.push(...figPts);
              for(let i=0; i<pLen; i++) {
                  let next = (i+1)%pLen;
                  segments.push({ id:uid(), label:'', p1:{x:figPts[i].nodes[0].x, y:figPts[i].nodes[0].y}, p2:{x:figPts[next].nodes[0].x, y:figPts[next].nodes[0].y} }, { id:uid(), label:'', p1:{x:figPts[i].nodes[1].x, y:figPts[i].nodes[1].y}, p2:{x:figPts[next].nodes[1].x, y:figPts[next].nodes[1].y} });
              }
              title = `Dadas las proyecciones de la figura contenida en el plano α, hallar su verdadera magnitud abatiendo sobre el plano ${planoNombre}.`;
          }
      }
    }

    if (opts.reqPP) title += " Dibujar tercera proyección.";

    const newEx: Exercise = {
      id: uid(), type: t, title, w, h, dataStr,
      state: { ltY, originX, ppX: 750, reqRegla: opts.reqRegla, reqPP: opts.reqPP, reqOrigin: opts.reqOrigin, planes, segments, pts, bounds: { ltX1: 0, ltX2: 800, oY1: 0, oY2: 400, pY1: 0, pY2: 400 } }
    };
    
    set(state => {
        let newList = [...state.exercises, newEx];
        return { exercises: newList };
    });
    get().commitHistory();
  },

  removeExercise: (id) => { set(st => ({ exercises: st.exercises.filter(e => e.id !== id) })); get().commitHistory(); },
  updateBoxSize: (id, w, h) => set(st => ({ exercises: st.exercises.map(ex => ex.id === id ? { ...ex, w, h } : ex) })),

  addFreeElement: (exId, elemType) => {
    set(st => ({ exercises: st.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state }; let ox = s.originX; let oy = s.ltY;
      if (elemType === 'punto') {
          s.pts = [...s.pts, { id:uid(), name: String.fromCharCode(65 + s.pts.length), nodes:[{id:uid(), t:'2', x:ox+50, y:oy-50, pairId:'nf1'}, {id:'nf1', t:'1', x:ox+50, y:oy+50}] }];
      } else if (elemType === 'recta') {
          const nL = String.fromCharCode(114 + Math.floor(s.segments.length / 2));
          s.segments = [...s.segments, { id:uid(), label:`${nL}2`, p1:{x:ox-50, y:oy-20}, p2:{x:ox+50, y:oy-70} }, { id:uid(), label:`${nL}1`, p1:{x:ox-50, y:oy+30}, p2:{x:ox+50, y:oy+80} }];
      } else if (elemType === 'plano') {
          const greek = ['α','β','γ','δ','ε'];
          s.planes = [...s.planes, { id:uid(), name: greek[s.planes.length % 5], type:'oblicuo', vX:ox-70, p1:{x:ox+100, y:oy+150}, p2:{x:ox+100, y:oy-150} }];
      }
      return { ...ex, state: s };
    })}));
    get().commitHistory();
  },

  removeElement: (exId, elemType, elemId) => {
    set(st => ({ 
      constraints: st.constraints.filter(c => c.elem1Id !== elemId && c.elem2Id !== elemId),
      exercises: st.exercises.map(ex => {
        if (ex.id !== exId) return ex;
        let s = { ...ex.state };
        if (elemType === 'punto') s.pts = s.pts.filter(p => p.id !== elemId && !p.nodes.some(n=>n.id===elemId));
        else if (elemType === 'recta') s.segments = s.segments.filter(sg => sg.id !== elemId);
        else if (elemType === 'plano') s.planes = s.planes.filter(pl => pl.id !== elemId);
        return { ...ex, state: s };
      })
    }));
    get().commitHistory();
  },

  updateName: (exId, elemType, elemId, newName) => {
    set(st => ({ exercises: st.exercises.map(ex => {
      if(ex.id !== exId) return ex;
      let s = {...ex.state};
      if(elemType === 'punto') s.pts = s.pts.map(p => p.id === elemId ? {...p, name: newName} : p);
      else if(elemType === 'recta') s.segments = s.segments.map(seg => seg.id === elemId ? {...seg, label: newName} : seg);
      else if(elemType === 'plano') s.planes = s.planes.map(pl => pl.id === elemId ? {...pl, name: newName} : pl);
      return {...ex, state: s};
    })}));
    get().commitHistory();
  },
  
  updateColor: (exId, elemType, elemId, color) => {
    set(st => ({ exercises: st.exercises.map(ex => {
      if(ex.id !== exId) return ex;
      let s = {...ex.state};
      if(elemType === 'punto') s.pts = s.pts.map(p => p.id === elemId ? {...p, color} : p);
      else if(elemType === 'recta') s.segments = s.segments.map(seg => seg.id === elemId ? {...seg, color} : seg);
      else if(elemType === 'plano') s.planes = s.planes.map(pl => pl.id === elemId ? {...pl, color} : pl);
      return {...ex, state: s};
    })}));
    get().commitHistory();
  },

  updateExerciseText: (exId, field, text) => {
    set(st => ({ exercises: st.exercises.map(ex => ex.id === exId ? { ...ex, [field]: text } : ex) }));
    get().commitHistory();
  },

  togglePlaneType: (exId, planeId) => {
    set(st => ({ exercises: st.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      return { ...ex, state: { ...ex.state, planes: ex.state.planes.map(pl => pl.id === planeId ? { ...pl, type: pl.type === 'paralelo_lt' ? 'oblicuo' : 'paralelo_lt' } : pl )}};
    })}));
    get().commitHistory();
  },

  toggleLineStyle: (exId, elemType, elemId) => {
    set(st => ({ exercises: st.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state };
      const nSt = (c?: string) => c === 'solid' ? 'dashed' : c === 'dashed' ? undefined : 'solid';
      if (elemType === 'recta') s.segments = s.segments.map(sg => sg.id === elemId ? { ...sg, customStyle: nSt(sg.customStyle) } : sg);
      else if (elemType === 'plano') s.planes = s.planes.map(pl => pl.id === elemId ? { ...pl, customStyle: nSt(pl.customStyle) } : pl);
      return { ...ex, state: s };
    })}));
    get().commitHistory();
  },

  updateNode: (exId, ptId, nodeId, newX, newY) => set(st => ({
    exercises: st.exercises.map(ex => {
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
      s.pts = s.pts.map(p => p.id === ptId ? { ...p, nodes: p.nodes.map(n => n.id === nodeId ? { ...n, x: newX, y: newY } : (n.pairId === nodeId ? { ...n, x: newX } : n)) } : p);
      return { ...ex, state: s };
    })
  })),

  updatePlane: (exId, planeId, newVX) => set(st => ({
    exercises: st.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let cloned = JSON.parse(JSON.stringify(ex)) as Exercise;
      let pl = cloned.state.planes.find(p => p.id === planeId);
      if (pl) {
        let dx = newVX - pl.vX; pl.vX = newVX; pl.p1.x += dx; pl.p2.x += dx;
        st.constraints.filter(c => c.exId === exId && (c.elem1Id === planeId || c.elem2Id === planeId)).forEach(c => enforceConstraintPair(cloned, c, planeId));
      }
      return cloned;
    })
  })),

  updatePlaneEndpoint: (exId, planeId, traceNum, newX, newY) => set(st => ({
    exercises: st.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let cloned = JSON.parse(JSON.stringify(ex)) as Exercise;
      let pl = cloned.state.planes.find(p => p.id === planeId);
      if (pl) {
        if (traceNum === 1) pl.p1 = { x: newX, y: newY }; else pl.p2 = { x: newX, y: newY };
        st.constraints.filter(c => c.exId === exId && (c.elem1Id === planeId || c.elem2Id === planeId)).forEach(c => enforceConstraintPair(cloned, c, planeId));
      }
      return cloned;
    })
  })),

  updateSegment: (exId, segId, pointIndex, newX, newY) => set(st => ({
    exercises: st.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let cloned = JSON.parse(JSON.stringify(ex)) as Exercise;
      let seg = cloned.state.segments.find(s => s.id === segId);
      if (seg) {
        if (pointIndex === 1) seg.p1 = { x: newX, y: newY }; else seg.p2 = { x: newX, y: newY };
        st.constraints.filter(c => c.exId === exId && (c.elem1Id === segId || c.elem2Id === segId)).forEach(c => enforceConstraintPair(cloned, c, segId));
      }
      return cloned;
    })
  })),

  updateSystem: (exId, target, valX, valY) => set(st => ({
    exercises: st.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state }; if (!s.bounds) s.bounds = { ltX1: 0, ltX2: 800, oY1: 0, oY2: 400, pY1: 0, pY2: 400 };
      if (target === 'pp') s.ppX = valX;
      else if (target === 'origin') {
        let dx = valX - s.originX; let dy = valY - s.ltY; s.originX = valX; s.ltY = valY; s.ppX += dx;
        s.planes = s.planes.map(pl => ({...pl, vX: pl.vX + dx, p1: {x: pl.p1.x + dx, y: pl.p1.y + dy}, p2: {x: pl.p2.x + dx, y: pl.p2.y + dy}}));
        s.segments = s.segments.map(sg => ({...sg, p1:{x:sg.p1.x+dx, y:sg.p1.y+dy}, p2:{x:sg.p2.x+dx, y:sg.p2.y+dy}}));
        s.pts = s.pts.map(p => ({...p, nodes: p.nodes.map(n => ({...n, x: n.x+dx, y: n.y+dy}))}));
      }
      else if (target === 'lt1') s.bounds.ltX1 = valX;
      else if (target === 'lt2') s.bounds.ltX2 = valX;
      return { ...ex, state: s };
    })
  }))
}));

// ==========================================
// 2. EL MOTOR DE DIBUJO CAD (KONVA)
// ==========================================
function View2D({ ex }: { ex: Exercise }) {
  const store = useStore();
  const { ltY, originX, ppX, reqRegla, reqPP, reqOrigin, planes, pts, segments } = ex.state || {};

  const containerRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ w: 800, h: 400 });
  const [contextMenu, setContextMenu] = useState<{x:number, y:number, items: any[]} | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => { setDim({ w: entries[0].contentRect.width, h: entries[0].contentRect.height }); });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const scale = Math.min((dim.w || 800) / 800, (dim.h || 400) / 400) || 1;
  const offsetX = ((dim.w || 800) - 800 * scale) / 2;
  const offsetY = ((dim.h || 400) - 400 * scale) / 2;
  const sc = (val: number) => val / scale;
  const getFont = (size: number, weight = "") => `${weight} ${sc(size)}px Arial`.trim();

  const handleHover = (e: any) => { e.target.moveToTop(); e.target.scale({x:1.5, y:1.5}); document.body.style.cursor='pointer'; };
  const handleOut = (e: any) => { e.target.scale({x:1, y:1}); document.body.style.cursor='default'; };
  const handleHoverLine = () => { document.body.style.cursor='pointer'; };
  const handleOutLine = () => { document.body.style.cursor='default'; };

  const drawHaloText = (ctx: any, text: string, x: number, y: number, font = getFont(15, "bold"), align = "left", color = "black") => {
    if (!text) return;
    ctx.save(); ctx.font = font; ctx.strokeStyle = "white"; ctx.lineWidth = sc(4); ctx.lineJoin = "round"; ctx.textAlign = align;
    ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.restore();
  };

  const drawScene = (ctx: any) => {
    const b = ex.state?.bounds || { ltX1: 0, ltX2: 800, oY1: 0, oY2: 400, pY1: 0, pY2: 400 };
    let dynLabels: {text: string, x: number, y: number, font: string, color: string}[] = [];
    const queueLabel = (text: string, x: number, y: number, font = getFont(15, "bold"), color = "black") => { dynLabels.push({text, x, y, font, color}); };

    const drawTrueVisibilitySegmentLocal = (seg: ExSegment, stSegments: ExSegment[], isVerticalProj: boolean) => {
      const c = seg.color || "black";
      if (seg.customStyle === 'dashed' || (!seg.customStyle && seg.isDashed)) {
         ctx.beginPath(); ctx.setLineDash([sc(5), sc(5)]); ctx.moveTo(seg.p1.x, seg.p1.y); ctx.lineTo(seg.p2.x, seg.p2.y); ctx.stroke(); ctx.setLineDash([]);
         if (seg.label) queueLabel(seg.label, (seg.p1.x+seg.p2.x)/2, (seg.p1.y+seg.p2.y)/2, undefined, c); return;
      }
      if (seg.customStyle === 'solid') {
         ctx.beginPath(); ctx.setLineDash([]); ctx.moveTo(seg.p1.x, seg.p1.y); ctx.lineTo(seg.p2.x, seg.p2.y); ctx.stroke();
         if (seg.label) queueLabel(seg.label, (seg.p1.x+seg.p2.x)/2 + sc(5), (seg.p1.y+seg.p2.y)/2 - sc(5), undefined, c); return;
      }

      let tVals = [0, 1];
      let prefix = seg.label.replace(/[12]/g, '');
      let otherSeg = stSegments.find(s => s.label === prefix + (isVerticalProj ? '1' : '2')) || (isVerticalProj ? stSegments.find(s => s.label.includes('1')) : stSegments.find(s => s.label.includes('2')));

      if(!otherSeg) {
          let in1st = isVerticalProj ? (seg.p1.y < ltY) : (seg.p1.y > ltY);
          ctx.beginPath(); ctx.setLineDash(in1st ? [] : [sc(6), sc(4)]);
          ctx.moveTo(seg.p1.x, seg.p1.y); ctx.lineTo(seg.p2.x, seg.p2.y); ctx.stroke(); ctx.setLineDash([]);
          if (seg.label) queueLabel(seg.label, (seg.p1.x+seg.p2.x)/2 + sc(5), (seg.p1.y+seg.p2.y)/2 - sc(5), undefined, c); return;
      }

      let dy = seg.p2.y - seg.p1.y;
      if (Math.abs(dy) > 0.01) { let tThis = (ltY - seg.p1.y) / dy; if (tThis > 0 && tThis < 1) tVals.push(tThis); }

      let dyOther = (otherSeg.p2.y - otherSeg.p1.y); let dx = seg.p2.x - seg.p1.x; let dxOther = (otherSeg.p2.x - otherSeg.p1.x);
      if (Math.abs(dyOther) > 0.01 && Math.abs(dx) > 0.01) {
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
          if (Math.abs(dxOther) > 0.01) { let tOther = (xMid - otherSeg.p1.x) / dxOther; yOtherMid = otherSeg.p1.y + tOther * dyOther; } else { yOtherMid = (otherSeg.p1.y + otherSeg.p2.y) / 2; }
          let y1 = isVerticalProj ? yOtherMid : yMid; let y2 = isVerticalProj ? yMid : yOtherMid;
          let is1stQ = (y2 < ltY) && (y1 > ltY);

          ctx.beginPath(); ctx.setLineDash(is1stQ ? [] : [sc(6), sc(4)]);
          ctx.moveTo(seg.p1.x + tA * dx, seg.p1.y + tA * dy); ctx.lineTo(seg.p1.x + tB * dx, seg.p1.y + tB * dy); ctx.stroke();
      }
      ctx.setLineDash([]);
      if (seg.label) queueLabel(seg.label, (seg.p1.x+seg.p2.x)/2 + sc(5), (seg.p1.y+seg.p2.y)/2 - sc(5), undefined, c);
    };

    ctx.strokeStyle = "black"; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(b.ltX1, ltY); ctx.lineTo(b.ltX2, ltY); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(b.ltX1 + 10, ltY + 6); ctx.lineTo(b.ltX1 + 25, ltY + 6); ctx.moveTo(b.ltX2 - 25, ltY + 6); ctx.lineTo(b.ltX2 - 10, ltY + 6); ctx.stroke();

    if (reqRegla) {
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(originX, b.oY1); ctx.lineTo(originX, b.oY2);
      for(let v = -70; v <= 70; v += 10) {
        let tick = sc(8); ctx.moveTo(originX + v*SF, ltY - tick); ctx.lineTo(originX + v*SF, ltY + tick);
        if(v !== 0) drawHaloText(ctx, v.toString(), originX + v*SF, ltY + sc(22), getFont(11), "center");
        ctx.moveTo(originX - tick, ltY - v*SF); ctx.lineTo(originX + tick, ltY - v*SF);
        if(v !== 0) drawHaloText(ctx, v.toString(), originX - sc(10), ltY - v*SF + sc(4), getFont(11), "right");
      }
      ctx.stroke(); drawHaloText(ctx, "X", b.ltX2 - sc(20), ltY + sc(4), getFont(14, "bold"));
    }
    
    if (reqOrigin) {
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(originX, ltY - 8); ctx.lineTo(originX, ltY + 8); ctx.stroke();
      if(!reqRegla) drawHaloText(ctx, "0", originX + sc(4), ltY + sc(18), getFont(14, "italic"));
    }

    if (reqPP) {
      ctx.lineWidth = 1.8; ctx.setLineDash([sc(10), sc(4), sc(2), sc(4)]);
      ctx.beginPath(); ctx.moveTo(ppX, b.pY1); ctx.lineTo(ppX, b.pY2); ctx.stroke(); ctx.setLineDash([]);
      drawHaloText(ctx, "PP", ppX + sc(6), b.pY1 + sc(30), getFont(16, "bold"));
    }

    (planes || []).forEach((pl: ExPlane) => {
      const isSel = store.selectedElements.some(s => s.id === pl.id);
      const c = pl.color || "black";
      ctx.strokeStyle = isSel ? "#ff9f43" : c; 
      ctx.lineWidth = isSel ? 3.5 : 2.2;
      
      const applyDash = (isAutoDashed: boolean) => {
          if (pl.customStyle === 'solid') ctx.setLineDash([]);
          else if (pl.customStyle === 'dashed') ctx.setLineDash([sc(6), sc(4)]);
          else ctx.setLineDash(isAutoDashed ? [sc(6), sc(4)] : []);
      };

      if (pl.type === 'horizontal') {
        applyDash(false); ctx.beginPath(); ctx.moveTo(b.ltX1, pl.p2.y); ctx.lineTo(b.ltX2, pl.p2.y); ctx.stroke(); ctx.setLineDash([]);
        if (pl.name) queueLabel(`${pl.name}2`, pl.p2.x, pl.p2.y - sc(10), undefined, c);
      } else if (pl.type === 'frontal') {
        applyDash(false); ctx.beginPath(); ctx.moveTo(b.ltX1, pl.p1.y); ctx.lineTo(b.ltX2, pl.p1.y); ctx.stroke(); ctx.setLineDash([]);
        if (pl.name) queueLabel(`${pl.name}1`, pl.p1.x, pl.p1.y + sc(20), undefined, c);
      } else if (pl.type === 'paralelo_lt') {
        applyDash(false); ctx.beginPath(); ctx.moveTo(b.ltX1, pl.p2.y); ctx.lineTo(b.ltX2, pl.p2.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(b.ltX1, pl.p1.y); ctx.lineTo(b.ltX2, pl.p1.y); ctx.stroke(); ctx.setLineDash([]);
        if (pl.name) queueLabel(`${pl.name}2`, pl.p2.x, pl.p2.y - sc(10), undefined, c);
        if (pl.name) queueLabel(`${pl.name}1`, pl.p1.x, pl.p1.y + sc(20), undefined, c);
      } else {
        applyDash(pl.p2.y >= ltY); ctx.beginPath(); ctx.moveTo(pl.vX, ltY); ctx.lineTo(pl.p2.x, pl.p2.y); ctx.stroke();
        applyDash(pl.p1.y <= ltY); ctx.beginPath(); ctx.moveTo(pl.vX, ltY); ctx.lineTo(pl.p1.x, pl.p1.y); ctx.stroke(); ctx.setLineDash([]);
        if (pl.name) queueLabel(`${pl.name}2`, pl.p2.x, pl.p2.y - sc(10), undefined, c);
        if (pl.name) queueLabel(`${pl.name}1`, pl.p1.x, pl.p1.y + sc(20), undefined, c);
      }
    });

    (segments || []).forEach((seg: ExSegment) => {
        const isSel = store.selectedElements.some(s => s.id === seg.id);
        ctx.strokeStyle = isSel ? "#ff9f43" : (seg.color || "black"); 
        ctx.lineWidth = isSel ? 3.5 : 2.2;
        const isV = seg.label.includes('2');
        drawTrueVisibilitySegmentLocal(seg, segments, isV);
    });

    ctx.strokeStyle = "#888"; ctx.setLineDash([sc(5), sc(5)]); ctx.lineWidth = sc(1);
    (pts || []).forEach((p: any) => { if(p.nodes.length === 2) { ctx.beginPath(); ctx.moveTo(p.nodes[0].x, p.nodes[0].y); ctx.lineTo(p.nodes[1].x, p.nodes[1].y); ctx.stroke(); } });
    ctx.setLineDash([]);
    
    (pts || []).forEach((p: any) => {
      const c = p.color || "black";
      p.nodes.forEach((n: ExNode) => { 
        ctx.beginPath(); ctx.strokeStyle = c; ctx.lineWidth = sc(1.5);
        let cs = sc(5); ctx.moveTo(n.x, n.y - cs); ctx.lineTo(n.x, n.y + cs); ctx.moveTo(n.x - cs, n.y); ctx.lineTo(n.x + cs, n.y); ctx.stroke();
        if (p.name) queueLabel(`${p.name}${n.t}`, n.x + sc(8), n.y - sc(8), undefined, c); 
      });
    });

    // ANTI-COLISIONES DE TEXTOS
    let mergedLabels: any[] = []; let skip = new Set();
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
            let avgX = group.reduce((sum, g) => sum + g.x, 0) / group.length; let avgY = group.reduce((sum, g) => sum + g.y, 0) / group.length;
            mergedLabels.push({ text: combinedText, x: avgX, y: avgY, font: group[0].font, color: group[0].color });
        } else mergedLabels.push(dynLabels[i]);
    }

    for(let iter=0; iter<30; iter++) {
        for(let i=0; i<mergedLabels.length; i++) {
            for(let j=i+1; j<mergedLabels.length; j++) {
                let a = mergedLabels[i]; let b = mergedLabels[j];
                ctx.font = a.font; let aW = ctx.measureText(a.text).width; ctx.font = b.font; let bW = ctx.measureText(b.text).width;
                let dx = a.x - b.x; let dy = a.y - b.y; let minDistX = (aW + bW)/2 + sc(8); let minDistY = sc(15) + sc(8);
                if (Math.abs(dx) < minDistX && Math.abs(dy) < minDistY) {
                    if (dx === 0 && dy === 0) { dx = 0.1; dy = 0.1; }
                    let overlapX = minDistX - Math.abs(dx); let overlapY = minDistY - Math.abs(dy);
                    if (overlapX < overlapY) { let pushX = overlapX * (dx > 0 ? 1 : -1) * 0.5; a.x += pushX; b.x -= pushX; } 
                    else { let pushY = overlapY * (dy > 0 ? 1 : -1) * 0.5; a.y += pushY; b.y -= pushY; }
                }
            }
        }
    }
    mergedLabels.forEach(lbl => drawHaloText(ctx, lbl.text, lbl.x, lbl.y, lbl.font, "left", lbl.color));
  };

  const b = ex.state?.bounds || { ltX1: 0, ltX2: 800, oY1: 0, oY2: 400, pY1: 0, pY2: 400 };

  return (
    <div style={{width: '100%', height: '100%', position: 'relative', overflow: 'hidden'}}>
      <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
        <Stage width={dim.w || 800} height={dim.h || 400} 
               onDragEnd={() => { setSelectedId(null); store.commitHistory(); }}
               onClick={(e)=>{
                 if(e.evt.button===0) { 
                   setContextMenu(null); 
                   if (e.target === e.target.getStage()) { setSelectedId(null); store.clearSelection(); }
                 }
               }}
               onContextMenu={(e)=>{
                 e.evt.preventDefault();
                 const stage = e.target.getStage(); const pos = stage?.getPointerPosition();
                 if (!stage || !pos) return;
                 const shapes = stage.getAllIntersections(pos);
                 const handleShapes = shapes.filter((s:any) => (s.getClassName() === 'Circle' || s.getClassName() === 'Line') && s.attrs.name && s.attrs.id);
                 if (handleShapes.length > 0) {
                   const uniqueMap = new Map();
                   handleShapes.forEach((s:any) => {
                     let rId = s.attrs.id; if (rId.includes('_')) rId = rId.split('_')[1];
                     let label = s.attrs.name;
                     if (label.includes('Extremo') || label.includes('Recta')) label = 'Recta ' + label.replace(/Extremo |Recta | \(.*/g, '').replace(/[12]/g, '');
                     else if (label.includes('Traza') || label.includes('Plano')) label = 'Plano ' + label.replace(/Traza |Plano | Horizontal | Frontal | Oblicuo /g, '').replace(/[12]/g, '');
                     else if (label.includes('Punto')) label = 'Punto ' + label.replace(/Punto /, '').replace(/[12]/g, '');
                     if (!uniqueMap.has(rId)) uniqueMap.set(rId, { label: label.trim(), id: s.attrs.id, type: s.attrs.name.includes('Punto') ? 'punto' : s.attrs.name.includes('Plano') || s.attrs.name.includes('Traza') ? 'plano' : 'recta' });
                   });
                   setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, items: Array.from(uniqueMap.values()) });
                 } else setContextMenu(null);
               }}>
          <Layer scaleX={scale} scaleY={scale} x={offsetX} y={offsetY}>
            <Shape sceneFunc={drawScene} />
            
            <Group visible={!store.isPrinting}>
              {/* LÍNEAS INVISIBLES DE HITBOX PARA RECTAS Y PLANOS */}
              {(segments || []).map(seg => (
                <Line key={`hit_seg_${seg.id}`} id={`segHit_${seg.id}`} name={`Recta ${seg.label}`} points={[seg.p1.x, seg.p1.y, seg.p2.x, seg.p2.y]} stroke="transparent" strokeWidth={sc(20)} onMouseEnter={handleHoverLine} onMouseLeave={handleOutLine} 
                      onClick={(e)=>{ if(e.evt.button === 0) { e.cancelBubble = true; store.selectElement(ex.id, 'recta', seg.id, `Recta ${seg.label || ''}`); setContextMenu(null); } }} />
              ))}
              {(planes || []).map(pl => {
                const hitProps = { stroke: "transparent", strokeWidth: sc(20), onMouseEnter: handleHoverLine, onMouseLeave: handleOutLine, onClick: (e:any) => { if(e.evt.button===0) { e.cancelBubble=true; store.selectElement(ex.id, 'plano', pl.id, `Plano ${pl.name}`); setContextMenu(null); } } };
                if (pl.type === 'horizontal') return <Line key={`hit_pl_${pl.id}`} id={`plHit_${pl.id}`} name={`Plano ${pl.name}`} points={[b.ltX1, pl.p2.y, b.ltX2, pl.p2.y]} {...hitProps} />;
                if (pl.type === 'frontal') return <Line key={`hit_pl_${pl.id}`} id={`plHit_${pl.id}`} name={`Plano ${pl.name}`} points={[b.ltX1, pl.p1.y, b.ltX2, pl.p1.y]} {...hitProps} />;
                if (pl.type === 'paralelo_lt') return <React.Fragment key={`hit_pl_${pl.id}`}><Line id={`plHit2_${pl.id}`} name={`Plano ${pl.name}`} points={[b.ltX1, pl.p2.y, b.ltX2, pl.p2.y]} {...hitProps} /><Line id={`plHit1_${pl.id}`} name={`Plano ${pl.name}`} points={[b.ltX1, pl.p1.y, b.ltX2, pl.p1.y]} {...hitProps} /></React.Fragment>;
                return (
                  <React.Fragment key={`hit_pl_${pl.id}`}>
                    <Line id={`plHit2_${pl.id}`} name={`Plano ${pl.name}`} points={[pl.vX, ltY, pl.p2.x, pl.p2.y]} {...hitProps} />
                    <Line id={`plHit1_${pl.id}`} name={`Plano ${pl.name}`} points={[pl.vX, ltY, pl.p1.x, pl.p1.y]} {...hitProps} />
                  </React.Fragment>
                );
              })}

              <Circle id="sys_lt1" name="Extremo Izq LT" x={b.ltX1} y={ltY} radius={sc(8)} fill="rgba(0,0,0,0.2)" draggable dragBoundFunc={(p)=>({x:p.x, y:ltY})} onDragMove={(e) => store.updateSystem(ex.id, 'lt1', e.target.x(), 0)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === "sys_lt1"} stroke={selectedId === "sys_lt1" ? "#fff" : "transparent"} strokeWidth={selectedId === "sys_lt1" ? sc(3) : sc(25)} />
              <Circle id="sys_lt2" name="Extremo Der LT" x={b.ltX2} y={ltY} radius={sc(8)} fill="rgba(0,0,0,0.2)" draggable dragBoundFunc={(p)=>({x:p.x, y:ltY})} onDragMove={(e) => store.updateSystem(ex.id, 'lt2', e.target.x(), 0)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === "sys_lt2"} stroke={selectedId === "sys_lt2" ? "#fff" : "transparent"} strokeWidth={selectedId === "sys_lt2" ? sc(3) : sc(25)} />

              {reqOrigin && <Circle id="sys_origin" name="Origen (0)" x={originX} y={ltY} radius={sc(18)} fill="rgba(255,200,0,0.4)" draggable onDragMove={(e) => store.updateSystem(ex.id, 'origin', e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === "sys_origin"} stroke={selectedId === "sys_origin" ? "#fff" : "transparent"} strokeWidth={selectedId === "sys_origin" ? sc(3) : sc(25)} />}
              
              {reqRegla && (
                <React.Fragment>
                  <Circle id="sys_o1" name="Extremo Sup Eje" x={originX} y={b.oY1} radius={sc(8)} fill="rgba(0,0,0,0.2)" draggable dragBoundFunc={(p)=>({x:originX, y:p.y})} onDragMove={(e) => store.updateSystem(ex.id, 'o1', 0, e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === "sys_o1"} stroke={selectedId === "sys_o1" ? "#fff" : "transparent"} strokeWidth={selectedId === "sys_o1" ? sc(3) : sc(25)} />
                  <Circle id="sys_o2" name="Extremo Inf Eje" x={originX} y={b.oY2} radius={sc(8)} fill="rgba(0,0,0,0.2)" draggable dragBoundFunc={(p)=>({x:originX, y:p.y})} onDragMove={(e) => store.updateSystem(ex.id, 'o2', 0, e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === "sys_o2"} stroke={selectedId === "sys_o2" ? "#fff" : "transparent"} strokeWidth={selectedId === "sys_o2" ? sc(3) : sc(25)} />
                </React.Fragment>
              )}

              {reqPP && (
                <React.Fragment>
                  <Circle id="sys_pp" name="Plano de Perfil" x={ppX} y={ltY} radius={sc(12)} fill="rgba(200,100,200,0.3)" draggable dragBoundFunc={(p)=>({x:p.x, y:ltY})} onDragMove={(e) => store.updateSystem(ex.id, 'pp', e.target.x(), 0)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === "sys_pp"} stroke={selectedId === "sys_pp" ? "#fff" : "transparent"} strokeWidth={selectedId === "sys_pp" ? sc(3) : sc(25)} />
                  <Circle id="sys_p1" name="Extremo Sup PP" x={ppX} y={b.pY1} radius={sc(8)} fill="rgba(0,0,0,0.2)" draggable dragBoundFunc={(p)=>({x:ppX, y:p.y})} onDragMove={(e) => store.updateSystem(ex.id, 'p1', 0, e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === "sys_p1"} stroke={selectedId === "sys_p1" ? "#fff" : "transparent"} strokeWidth={selectedId === "sys_p1" ? sc(3) : sc(25)} />
                  <Circle id="sys_p2" name="Extremo Inf PP" x={ppX} y={b.pY2} radius={sc(8)} fill="rgba(0,0,0,0.2)" draggable dragBoundFunc={(p)=>({x:ppX, y:p.y})} onDragMove={(e) => store.updateSystem(ex.id, 'p2', 0, e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === "sys_p2"} stroke={selectedId === "sys_p2" ? "#fff" : "transparent"} strokeWidth={selectedId === "sys_p2" ? sc(3) : sc(25)} />
                </React.Fragment>
              )}

              {planes.map(pl => {
                if (pl.type === 'horizontal') return <Circle key={pl.id} id={`pl2_${pl.id}`} name={`Plano Horizontal ${pl.name}`} x={pl.p2.x} y={pl.p2.y} radius={sc(12)} fill="rgba(0,150,255,0.4)" draggable onDragMove={e=>store.updatePlaneEndpoint(ex.id, pl.id, 2, e.target.x(), e.target.y())} onDblClick={()=>store.removeElement(ex.id, 'plano', pl.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `pl2_${pl.id}`} stroke={selectedId === `pl2_${pl.id}` ? "#fff" : "transparent"} strokeWidth={selectedId === `pl2_${pl.id}` ? sc(3) : sc(25)} />;
                if (pl.type === 'frontal') return <Circle key={pl.id} id={`pl1_${pl.id}`} name={`Plano Frontal ${pl.name}`} x={pl.p1.x} y={pl.p1.y} radius={sc(12)} fill="rgba(0,150,255,0.4)" draggable onDragMove={e=>store.updatePlaneEndpoint(ex.id, pl.id, 1, e.target.x(), e.target.y())} onDblClick={()=>store.removeElement(ex.id, 'plano', pl.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `pl1_${pl.id}`} stroke={selectedId === `pl1_${pl.id}` ? "#fff" : "transparent"} strokeWidth={selectedId === `pl1_${pl.id}` ? sc(3) : sc(25)} />;
                if (pl.type === 'paralelo_lt') return <React.Fragment key={pl.id}><Circle id={`pl2_${pl.id}`} name={`Traza ${pl.name}2`} x={pl.p2.x} y={pl.p2.y} radius={sc(12)} fill="rgba(0,150,255,0.4)" draggable onDragMove={e=>store.updatePlaneEndpoint(ex.id, pl.id, 2, e.target.x(), e.target.y())} onDblClick={()=>store.removeElement(ex.id, 'plano', pl.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `pl2_${pl.id}`} stroke={selectedId === `pl2_${pl.id}` ? "#fff" : "transparent"} strokeWidth={selectedId === `pl2_${pl.id}` ? sc(3) : sc(25)} /><Circle id={`pl1_${pl.id}`} name={`Traza ${pl.name}1`} x={pl.p1.x} y={pl.p1.y} radius={sc(12)} fill="rgba(0,150,255,0.4)" draggable onDragMove={e=>store.updatePlaneEndpoint(ex.id, pl.id, 1, e.target.x(), e.target.y())} onDblClick={()=>store.removeElement(ex.id, 'plano', pl.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `pl1_${pl.id}`} stroke={selectedId === `pl1_${pl.id}` ? "#fff" : "transparent"} strokeWidth={selectedId === `pl1_${pl.id}` ? sc(3) : sc(25)} /></React.Fragment>;
                return (
                  <React.Fragment key={pl.id}>
                    <Circle id={`pl_${pl.id}`} name={`Plano Oblicuo ${pl.name}`} x={pl.vX} y={ltY} radius={sc(15)} fill="rgba(0, 150, 255, 0.4)" draggable dragBoundFunc={(pos) => ({ x: pos.x, y: ltY })} onDragMove={(e) => store.updatePlane(ex.id, pl.id, e.target.x())} onDblClick={()=>store.removeElement(ex.id, 'plano', pl.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `pl_${pl.id}`} stroke={selectedId === `pl_${pl.id}` ? "#fff" : "transparent"} strokeWidth={selectedId === `pl_${pl.id}` ? sc(3) : sc(25)} />
                    <Circle id={`pl2_${pl.id}`} name={`Traza ${pl.name}2`} x={pl.p2.x} y={pl.p2.y} radius={sc(12)} fill="rgba(0, 150, 255, 0.4)" draggable onDragMove={e => store.updatePlaneEndpoint(ex.id, pl.id, 2, e.target.x(), e.target.y())} onDblClick={()=>store.removeElement(ex.id, 'plano', pl.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `pl2_${pl.id}`} stroke={selectedId === `pl2_${pl.id}` ? "#fff" : "transparent"} strokeWidth={selectedId === `pl2_${pl.id}` ? sc(3) : sc(25)} />
                    <Circle id={`pl1_${pl.id}`} name={`Traza ${pl.name}1`} x={pl.p1.x} y={pl.p1.y} radius={sc(12)} fill="rgba(0, 150, 255, 0.4)" draggable onDragMove={e => store.updatePlaneEndpoint(ex.id, pl.id, 1, e.target.x(), e.target.y())} onDblClick={()=>store.removeElement(ex.id, 'plano', pl.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `pl1_${pl.id}`} stroke={selectedId === `pl1_${pl.id}` ? "#fff" : "transparent"} strokeWidth={selectedId === `pl1_${pl.id}` ? sc(3) : sc(25)} />
                  </React.Fragment>
                );
              })}

              {segments.map(seg => (
                <React.Fragment key={seg.id}>
                  <Circle id={`seg1_${seg.id}`} name={`Extremo ${seg.label} (Inicio)`} x={seg.p1.x} y={seg.p1.y} radius={sc(10)} fill="rgba(255, 100, 100, 0.4)" draggable onDragMove={(e) => store.updateSegment(ex.id, seg.id, 1, e.target.x(), e.target.y())} onDblClick={()=>store.removeElement(ex.id, 'recta', seg.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `seg1_${seg.id}`} stroke={selectedId === `seg1_${seg.id}` ? "#fff" : "transparent"} strokeWidth={selectedId === `seg1_${seg.id}` ? sc(3) : sc(25)} />
                  <Circle id={`seg2_${seg.id}`} name={`Extremo ${seg.label} (Fin)`} x={seg.p2.x} y={seg.p2.y} radius={sc(10)} fill="rgba(255, 100, 100, 0.4)" draggable onDragMove={(e) => store.updateSegment(ex.id, seg.id, 2, e.target.x(), e.target.y())} onDblClick={()=>store.removeElement(ex.id, 'recta', seg.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `seg2_${seg.id}`} stroke={selectedId === `seg2_${seg.id}` ? "#fff" : "transparent"} strokeWidth={selectedId === `seg2_${seg.id}` ? sc(3) : sc(25)} />
                </React.Fragment>
              ))}
              {pts.map(p => p.nodes.map(n => (
                <Circle key={n.id} id={`pt_${n.id}`} name={`Punto ${p.name}${n.t}`} x={n.x} y={n.y} radius={sc(12)} fill="rgba(255, 71, 87, 0.4)" draggable onDragMove={(e) => store.updateNode(ex.id, p.id, n.id, e.target.x(), e.target.y())} onDblClick={()=>store.removeElement(ex.id, 'punto', p.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `pt_${n.id}`} stroke={selectedId === `pt_${n.id}` ? "#fff" : "transparent"} strokeWidth={selectedId === `pt_${n.id}` ? sc(3) : sc(25)} 
                        onClick={(e) => { if(e.evt.button === 0) { e.cancelBubble = true; store.selectElement(ex.id, 'punto', p.id, `Punto ${p.name}`); setContextMenu(null); } }} />
              )))}
            </Group>
          </Layer>
        </Stage>
      </div>

      {contextMenu && (
        <div style={{position: 'fixed', top: contextMenu.y, left: contextMenu.x, background: '#1c1c24', border: '1px solid #00d2ff', borderRadius: '8px', padding: '12px', zIndex: 9999, boxShadow: '0 8px 16px rgba(0,0,0,0.6)', width: 'max-content'}}>
          
          {store.selectedElements.length === 2 && store.selectedElements[0].exId === ex.id && (
            <div style={{ marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px dashed #444' }}>
              <div style={{fontSize: '0.85em', color: '#ff9f43', fontWeight: 'bold', marginBottom: '8px', textTransform:'uppercase'}}>Vincular Selección:</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button style={{flex: 1, padding: '8px', cursor: 'pointer', color: '#000', background: '#ff9f43', border: 'none', borderRadius: '4px', fontWeight: 'bold'}} onClick={() => { store.applyConstraint('parallel'); setContextMenu(null); }}>║ Paralelos</button>
                <button style={{flex: 1, padding: '8px', cursor: 'pointer', color: '#000', background: '#ff9f43', border: 'none', borderRadius: '4px', fontWeight: 'bold'}} onClick={() => { store.applyConstraint('perpendicular'); setContextMenu(null); }}>⟂ Perpendiculares</button>
              </div>
            </div>
          )}

          <div style={{fontSize: '0.75em', color: '#00d2ff', paddingBottom: '6px', borderBottom: '1px solid #3a3a44', marginBottom: '10px', textTransform:'uppercase', letterSpacing:'1px', fontWeight:'bold'}}>Editar Elemento:</div>
          
          {contextMenu.items.map((it, i) => {
            const isSys = it.id.startsWith('sys_');
            const isLineOrPlane = it.id.startsWith('seg') || it.id.startsWith('pl');
            
            let rId = it.id; if (rId.includes('_')) rId = rId.split('_')[1];
            if (it.id.startsWith('pt_')) {
                let thePt = ex.state.pts.find((p:any) => p.nodes.some((n:any) => n.id === rId));
                if(thePt) rId = thePt.id;
            }
            const hasConstraint = store.constraints.some(c => c.elem1Id === rId || c.elem2Id === rId);

            return (
            <div key={i} style={{ marginBottom: i < contextMenu.items.length-1 ? '15px' : '0' }}>
              <div style={{fontSize: '0.9em', color: '#fff', fontWeight: 'bold', marginBottom: '8px', textShadow:'0 1px 2px rgba(0,0,0,0.5)'}}>{it.label}</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap:'wrap' }}>
                <div style={{padding: '8px 12px', cursor: 'pointer', color: '#e2e8f0', background: '#2d2d3a', borderRadius: '4px', fontSize: '0.85em', textAlign:'center', transition:'all 0.2s'}}
                     onMouseEnter={e => { e.currentTarget.style.background = '#00d2ff'; e.currentTarget.style.color = '#000'; }} onMouseLeave={e => { e.currentTarget.style.background = '#2d2d3a'; e.currentTarget.style.color = '#e2e8f0'; }}
                     onClick={() => { setSelectedId(it.id); setContextMenu(null); }}>✎ Aislar</div>
                
                {!isSys && (
                  <div style={{padding: '8px 12px', cursor: 'pointer', color: '#000', background: '#f59e0b', borderRadius: '4px', fontSize: '0.85em', fontWeight: 'bold', textAlign:'center', transition:'all 0.2s'}}
                       onMouseEnter={e => e.currentTarget.style.background = '#fbbf24'} onMouseLeave={e => e.currentTarget.style.background = '#f59e0b'}
                       onClick={() => {
                          let type: 'punto' | 'recta' | 'plano' = it.type;
                          let oldName = it.label.replace(/(Punto |Recta |Plano )/g, '');
                          let newName = prompt("Introduce el nuevo nombre (déjalo en blanco para ocultarlo):", oldName);
                          if (newName !== null) store.updateName(ex.id, type, rId, newName);
                          setContextMenu(null);
                       }}>✏️ Nombre</div>
                )}

                {!isSys && isLineOrPlane && (
                   <div style={{padding: '8px 12px', cursor: 'pointer', color: '#e2e8f0', background: '#2d2d3a', borderRadius: '4px', fontSize: '0.85em', textAlign:'center', transition:'all 0.2s'}}
                        onMouseEnter={e => { e.currentTarget.style.background = '#00d2ff'; e.currentTarget.style.color = '#000'; }} onMouseLeave={e => { e.currentTarget.style.background = '#2d2d3a'; e.currentTarget.style.color = '#e2e8f0'; }}
                        onClick={() => {
                           let type: 'recta' | 'plano' = it.id.startsWith('pl') ? 'plano' : 'recta';
                           store.toggleLineStyle(ex.id, type, rId);
                           setContextMenu(null);
                        }}>🔄 Línea</div>
                )}

                {!isSys && (
                   <label style={{padding: '8px 12px', cursor: 'pointer', color: '#000', background: '#10b981', borderRadius: '4px', fontSize: '0.85em', fontWeight: 'bold', textAlign:'center', transition:'all 0.2s', position:'relative', overflow:'hidden'}}
                        onMouseEnter={e => e.currentTarget.style.background = '#34d399'} onMouseLeave={e => e.currentTarget.style.background = '#10b981'} title="Cambiar Color">
                      🎨 Color
                      <input type="color" defaultValue="#000000" style={{position:'absolute', opacity:0, top:0, left:0, width:'100%', height:'100%', cursor:'pointer'}}
                             onChange={(e) => { let type: 'punto' | 'recta' | 'plano' = it.type; store.updateColor(ex.id, type, rId, e.target.value); }} />
                   </label>
                )}
                
                {!isSys && (
                  <div style={{padding: '8px 12px', cursor: 'pointer', color: '#e2e8f0', background: '#2d2d3a', borderRadius: '4px', fontSize: '0.85em', textAlign:'center', transition:'all 0.2s'}}
                       onMouseEnter={e => { e.currentTarget.style.background = '#475569'; }} onMouseLeave={e => { e.currentTarget.style.background = '#2d2d3a'; }}
                       onClick={() => {
                          let type: 'punto' | 'recta' | 'plano' = it.type;
                          store.updateName(ex.id, type, rId, "");
                          setContextMenu(null);
                       }}>🆑 Ocultar</div>
                )}

                {!isSys && (
                  <div style={{padding: '8px 12px', cursor: 'pointer', color: 'white', background: '#ef4444', borderRadius: '4px', fontSize: '0.85em', textAlign:'center', transition:'all 0.2s'}}
                       onMouseEnter={e => e.currentTarget.style.background = '#f87171'} onMouseLeave={e => e.currentTarget.style.background = '#ef4444'}
                       onClick={() => {
                          let type: 'punto' | 'recta' | 'plano' = it.type;
                          store.removeElement(ex.id, type, rId);
                          setContextMenu(null);
                       }}>🗑️ Eliminar</div>
                )}

                {!isSys && hasConstraint && (
                  <div style={{padding: '8px 12px', cursor: 'pointer', color: 'white', background: '#8b5cf6', borderRadius: '4px', fontSize: '0.85em', textAlign:'center', transition:'all 0.2s'}}
                       onMouseEnter={e => e.currentTarget.style.background = '#a78bfa'} onMouseLeave={e => e.currentTarget.style.background = '#8b5cf6'}
                       onClick={() => {
                          store.removeConstraintsFor(rId);
                          setContextMenu(null);
                       }}>🔗 Desvincular</div>
                )}
              </div>
              {it.id?.startsWith('pl') && (
                 <div style={{padding: '8px 12px', cursor: 'pointer', color: '#000', background: '#f59e0b', marginTop: '6px', borderRadius: '4px', fontSize: '0.85em', fontWeight: 'bold', textAlign: 'center', transition:'all 0.2s'}}
                      onMouseEnter={e => e.currentTarget.style.background = '#fbbf24'} onMouseLeave={e => e.currentTarget.style.background = '#f59e0b'}
                      onClick={() => { store.togglePlaneType(ex.id, rId); setContextMenu(null); }}>
                     ⮂ Alternar Plano Paralelo a LT
                 </div>
              )}
            </div>
          )})}
        </div>
      )}
    </div>
  );
}

// ==========================================
// 3. LA INTERFAZ PRINCIPAL COMPLETA 
// ==========================================
export default function App() {
  const store = useStore();
  const [type, setType] = useState('punto_coord');
  const [ptCount, setPtCount] = useState(4);
  const [lineType, setLineType] = useState('cualquiera');
  const [lineMethod, setLineMethod] = useState('coord');
  const [planeType, setPlaneType] = useState('oblicuo');
  const [quadA, setQuadA] = useState('any'); const [quadB, setQuadB] = useState('any');
  const [reqPP, setReqPP] = useState(false); const [reqRegla, setReqRegla] = useState(false); const [reqOrigin, setReqOrigin] = useState(false);
  const [intSub, setIntSub] = useState('todas'); const [intP1, setIntP1] = useState('oblicuo'); const [intP2, setIntP2] = useState('oblicuo');
  const [paraSub, setParaSub] = useState('r_r_pto'); const [perpSub, setPerpSub] = useState('r_p_pto');
  const [pertSub, setPertSub] = useState('max_pend'); const [pertPlaneType, setPertPlaneType] = useState('oblicuo');
  const [abatLados, setAbatLados] = useState(3); const [abatElem, setAbatElem] = useState('fig_reg');
  const [abatEstado, setAbatEstado] = useState('proy'); const [abatPlano, setAbatPlano] = useState('ph');

  const handleAdd = () => { store.addExercise({ type, ptCount, lineMethod, lineType, planeType, quadA, quadB, reqPP, reqRegla, reqOrigin, intSub, intP1, intP2, paraSub, perpSub, pertSub, pertPlaneType, abatElem, abatEstado, abatPlano, abatLados }); };

  const handlePrint = () => {
    store.setPrinting(true);
    setTimeout(() => { window.print(); store.setPrinting(false); }, 300);
  };

  const paginatedExercises = useMemo(() => {
    let pages: Exercise[][] = []; let currPage: Exercise[] = []; let currY = 0; let rowH = 0; let rowW = 0;
    (store.exercises || []).forEach(ex => {
      let hVal = parseInt(ex.h) || 136; let wVal = parseFloat(ex.w) || 50;
      const MAX_H = pages.length === 0 ? 275 : 305; 
      if (rowW + wVal <= 101) { rowW += wVal; rowH = Math.max(rowH, hVal); } 
      else { currY += rowH; rowW = wVal; rowH = hVal; }
      if (currY + rowH > MAX_H && currPage.length > 0) { pages.push(currPage); currPage = []; currY = 0; rowW = wVal; rowH = hVal; }
      currPage.push(ex);
    });
    if (currPage.length > 0) pages.push(currPage);
    if (pages.length === 0) pages = [[]];
    return pages;
  }, [store.exercises]);

  const PAGE_W = store.pageSize === 'A3' ? '420mm' : '210mm';

  return (
    <>
      <style>{`
        body { margin: 0; font-family: 'Segoe UI', sans-serif; background-color: #0c0c0e; color: #e2e8f0; overflow: hidden; }
        .app-layout { display: flex; height: 100vh; overflow: hidden; background-color: #0c0c0e; }
        
        .sidebar { width: 300px; background: #121216; border-right: 1px solid #1e1e24; padding: 20px; display: flex; flex-direction: column; gap: 15px; overflow-y: auto; flex-shrink: 0; z-index: 100; box-shadow: 2px 0 15px rgba(0,0,0,0.6); }
        
        .main-area { flex: 1; display: flex; flex-direction: column; height: 100vh; background: #18181c; background-image: radial-gradient(#2d2d36 1px, transparent 1px); background-size: 24px 24px; position: relative; }
        .top-navbar { position: absolute; top: 15px; left: 30px; display: flex; align-items: center; gap: 15px; z-index: 50; background: #121216; padding: 8px 15px; border-radius: 8px; border: 1px solid #1e1e24; box-shadow: 0 4px 10px rgba(0,0,0,0.4); }
        .canvas-viewport { flex: 1; overflow: auto; display: flex; justify-content: center; align-items: flex-start; padding: 80px 40px 40px 40px; }
        
        .sheet-container { transform: scale(${(store.sheetZoom || 100) / 100}); transform-origin: top center; transition: transform 0.2s ease; margin-bottom: 40px; }
        .page-sheet { background: white; width: ${PAGE_W}; min-height: 297mm; padding: 3mm; color: black; box-sizing: border-box; break-inside: avoid; display: flex; flex-direction: column; overflow: hidden; transition: width 0.3s ease; box-shadow: 0 10px 30px rgba(0,0,0,0.5); margin-bottom: 40px; }
        .page-border { border: 2px solid black; flex-grow: 1; display: flex; flex-direction: column; box-sizing: border-box; background: white; position: relative; overflow: hidden; }
        
        .cajetin { width: ${store.pageSize === 'A3' ? '204mm' : '100%'}; border-right: ${store.pageSize === 'A3' ? '2px solid black' : 'none'}; border-bottom: 2px solid black; box-sizing: border-box; flex-shrink: 0; z-index: 10; background: white; transition: width 0.3s ease; }
        .cajetin-top { display: flex; justify-content: space-between; padding: 5px 12px; border-bottom: 1px solid black; font-size: 0.8rem; font-weight: bold; color: black; }
        .cajetin-bottom { display: flex; gap: 20px; padding: 10px 12px; font-weight: bold; color: black; }
        
        .exercises-grid { flex-grow: 1; display: flex; flex-wrap: wrap; align-content: flex-start; align-items: stretch; width: 100%; }
        .exercise-box { display: flex; flex-direction: column; position: relative; break-inside: avoid; box-sizing: border-box; border-right: 1.5px solid black; border-bottom: 1.5px solid black; background: white; overflow: hidden; }
        
        .exercise-title { padding: 8px 12px; background: #f8f9fa; border-bottom: 1.5px solid black; font-weight: bold; word-wrap: break-word; line-height: 1.3; font-family: ${store.fontFamily}; font-size: ${store.fontSize}px; text-align: justify; outline: none; color: #000; }
        .exercise-data { font-family: ${store.fontFamily}; font-size: ${store.fontSize - 1}px; padding: 6px 12px; text-align: justify; border-bottom: 1.5px dashed #ccc; font-weight: bold; outline: none; line-height: 1.3; word-wrap: break-word; color: #333; }
        .btn-mini { background: #00d2ff; color: #000; border: none; font-weight: bold; cursor: pointer; border-radius: 4px; padding: 4px 8px; font-size: 0.75rem; transition: background 0.2s; }
        .btn-mini:hover { background: #ff9f43; }
        
        .side-handle-r { position: absolute; right: -5px; top: 0; bottom: 0; width: 15px; cursor: ew-resize; z-index: 15; background: rgba(0,0,0,0.01); transition: background 0.2s; touch-action: none; }
        .side-handle-r:hover, .side-handle-r:active { background: rgba(0, 210, 255, 0.4); }
        .side-handle-b { position: absolute; left: 0; right: 0; bottom: -5px; height: 15px; cursor: ns-resize; z-index: 15; background: rgba(0,0,0,0.01); transition: background 0.2s; touch-action: none; }
        .side-handle-b:hover, .side-handle-b:active { background: rgba(0, 210, 255, 0.4); }
        
        .btn-panel { background: #1e1e24; color: #e2e8f0; border: 1px solid #3a3a44; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s; display: flex; justify-content: center; align-items: center; }
        .btn-panel:hover { background: #00d2ff; color: #000; border-color: #00d2ff; }
        .btn-panel:disabled { opacity: 0.3; cursor: not-allowed; }
        
        select, input[type="text"], input[type="number"] { background: #1c1c24; color: #fff; border: 1px solid #2d2d3a; padding: 10px; border-radius: 6px; font-size: 14px; width: 100%; box-sizing: border-box; }
        .sidebar label { font-size: 12px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px; }
        
        @media print { 
          body, html { background: white; height: auto !important; overflow: visible !important; } 
          .app-layout, .main-area, .canvas-viewport { height: auto !important; overflow: visible !important; display: block !important; padding: 0 !important; background: white !important; }
          .no-print { display: none !important; } 
          .sheet-container { padding: 0 !important; margin: 0 !important; transform: scale(1) !important; } 
          @page { size: ${store.pageSize === 'A3' ? 'A3 landscape' : 'A4 portrait'}; margin: 0; }
          .page-sheet { box-shadow: none; margin: 0; padding: 3mm; page-break-after: always; display: flex; flex-direction: column; border: none; width: ${PAGE_W}; height: 297mm; } 
          .page-border { border: 2px solid black; flex-grow: 1; display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden; position: relative; }
          .exercises-grid { flex-grow: 1; display: flex; flex-wrap: wrap; align-content: flex-start; align-items: stretch; width: 100%; }
          .exercise-box { resize: none; overflow: hidden; border-right: 1.5px solid black; border-bottom: 1.5px solid black; } 
        }
      `}</style>
      
      <div className="app-layout">
        
        {/* COLUMNA IZQUIERDA (CONFIGURACIÓN Y GENERACIÓN) */}
        <div className="sidebar no-print">
          <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'5px'}}>
            <div style={{width:'12px', height:'12px', borderRadius:'50%', background:'#00d2ff'}}></div>
            <h3 style={{margin:0, letterSpacing:'0.5px', color:'#00d2ff'}}>CAD DIÉDRICO</h3>
          </div>
          
          <div style={{display:'flex', flexDirection:'column', gap:'10px', background:'#18181f', padding:'14px', borderRadius:'8px', border:'1px solid #222'}}>
            <div>
              <label>Configuración de Página:</label>
              <select value={store.pageSize} onChange={e => store.setPageConfig({pageSize: e.target.value as any})}>
                <option value="A4">A4 Norma (Vertical)</option>
                <option value="A3">A3 Técnico (Horizontal)</option>
              </select>
            </div>
            <div>
              <label>Fuente (Letra):</label>
              <select value={store.fontFamily} onChange={e => store.setPageConfig({fontFamily: e.target.value})}>
                <option value="'Segoe UI', sans-serif">Segoe UI Clean</option>
                <option value="Arial, sans-serif">Arial Técnico</option>
                <option value="'Times New Roman', serif">Times Roman DIN</option>
                <option value="'Courier New', monospace">Monospace Vector</option>
              </select>
            </div>
            <div>
              <label>Tamaño Letra ({store.fontSize}px):</label>
              <input type="range" min="10" max="24" value={store.fontSize} onChange={e => store.setPageConfig({fontSize: Number(e.target.value)})} style={{ width: '100%' }} />
            </div>
          </div>

          <div style={{display:'flex', flexDirection:'column', gap:'10px', background:'#18181f', padding:'14px', borderRadius:'8px', border:'1px solid #222'}}>
            <div>
              <label>Tipo de Ejercicio:</label>
              <select value={type} onChange={e => setType(e.target.value)}>
                <option value="punto_coord">1. Sistema de Puntos</option><option value="rectas">2. Sistema de Rectas</option><option value="plano_coord">3. Sistema de Planos</option>
                <option value="intersecciones">4. Intersecciones</option><option value="paralelismo">5. Paralelismo</option>
                <option value="perpendicularidad">6. Perpendicularidad</option><option value="pertenencias">7. Pertenencias / Contenidas</option>
                <option value="abatimientos">8. Abatimientos</option>
              </select>
            </div>

            {type === 'punto_coord' && (<div><label>Nº Puntos:</label><input type="number" value={ptCount} onChange={e=>setPtCount(Number(e.target.value))} min="1" max="10" /></div>)}
            {type === 'rectas' && (
              <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                <div><label>Método de la Recta:</label><select value={lineMethod} onChange={e=>setLineMethod(e.target.value)}><option value="coord">Por Coordenadas</option><option value="puntos">Por Puntos Dibujados</option><option value="proy">Por Proyecciones</option></select></div>
                <div><label>Tipo de Recta:</label><select value={lineType} onChange={e=>setLineType(e.target.value)}><option value="cualquiera">Aleatoria</option><option value="horizontal">Horizontal</option><option value="frontal">Frontal</option><option value="vertical">Vertical</option><option value="punta">Punta</option><option value="perfil">Perfil</option><option value="paralela_lt">Paralela LT</option><option value="incidente_lt">Incidente LT</option><option value="contenida_pv">Contenida PV</option><option value="contenida_ph">Contenida PH</option></select></div>
              </div>
            )}
            {type === 'plano_coord' && (<div><label>Tipo de Plano:</label><select value={planeType} onChange={e=>setPlaneType(e.target.value)}><option value="oblicuo">Oblicuo</option><option value="proy_vert">Proy. Vertical</option><option value="proy_horiz">Proy. Horizontal</option><option value="perfil">Perfil</option><option value="horizontal">Horizontal</option><option value="frontal">Frontal</option><option value="paralelo_lt">Paralelo a LT</option></select></div>)}
            {(type === 'rectas' || type === 'plano_coord') && (
              <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                <div><label>Cuadrante 1:</label><select value={quadA} onChange={e=>setQuadA(e.target.value)}><option value="any">Aleatorio</option><option value="1">I Cuadrante</option><option value="2">II Cuadrante</option><option value="3">III Cuadrante</option><option value="4">IV Cuadrante</option></select></div>
                {type !== 'plano_coord' && <div><label>Cuadrante 2:</label><select value={quadB} onChange={e=>setQuadB(e.target.value)}><option value="any">Aleatorio</option><option value="1">I Cuadrante</option><option value="2">II Cuadrante</option><option value="3">III Cuadrante</option><option value="4">IV Cuadrante</option></select></div>}
              </div>
            )}
            {type === 'intersecciones' && (
              <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                <div><label>Caso:</label><select value={intSub} onChange={e=>setIntSub(e.target.value)}><option value="todas">Todas las trazas cortan</option><option value="paralelas">Trazas paralelas</option><option value="no_existe">Traza no existe</option><option value="paralelas_lt">Todas paralelas a LT</option></select></div>
                <div><label>Plano 1:</label><select value={intP1} onChange={e=>setIntP1(e.target.value)}><option value="oblicuo">Oblicuo</option><option value="proy_vert">Proy. Vertical</option><option value="proy_horiz">Proy. Horizontal</option><option value="perfil">Perfil</option><option value="horizontal">Horizontal</option><option value="frontal">Frontal</option><option value="paralelo_lt">Paralelo LT</option></select></div>
                <div><label>Plano 2:</label><select value={intP2} onChange={e=>setIntP2(e.target.value)}><option value="oblicuo">Oblicuo</option><option value="proy_vert">Proy. Vertical</option><option value="proy_horiz">Proy. Horizontal</option><option value="perfil">Perfil</option><option value="horizontal">Horizontal</option><option value="frontal">Frontal</option><option value="paralelo_lt">Paralelo LT</option></select></div>
              </div>
            )}
            {type === 'paralelismo' && (<div><label>Caso:</label><select value={paraSub} onChange={e=>setParaSub(e.target.value)}><option value="r_r_pto">Recta // Recta por pto</option><option value="p_p_pto">Plano // Plano por pto</option><option value="r_p_pto_corte">Recta // Plano (corta a r)</option><option value="p_r_pto">Plano // Recta por pto</option><option value="p_r_cont_r">Plano // Recta (contiene s)</option><option value="p_2r_cortan">Plano // a 2 rectas que cortan</option></select></div>)}
            {type === 'perpendicularidad' && (<div><label>Caso:</label><select value={perpSub} onChange={e=>setPerpSub(e.target.value)}><option value="r_p_pto">Recta ⊥ Plano por pto</option><option value="p_r_pto">Plano ⊥ Recta por pto</option><option value="p_p_pto">Plano ⊥ Plano por pto</option><option value="p_p_r">Plano ⊥ Plano por recta</option><option value="r_r_ext">Recta ⊥ Recta por pto ext</option><option value="r_r">Recta ⊥ Recta</option></select></div>)}
            {type === 'pertenencias' && (
              <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                <div><label>Caso:</label><select value={pertSub} onChange={e=>setPertSub(e.target.value)}><option value="max_pend">Recta Máxima Pendiente</option><option value="max_inc">Recta Máxima Inclinación</option><option value="horiz">Recta Horizontal contenida</option><option value="front">Recta Frontal contenida</option><option value="def_2r_c">Plano: 2 rectas se cortan</option><option value="def_2r_p">Plano: 2 rectas paralelas</option><option value="def_3p">Plano: 3 puntos</option><option value="def_r_p">Plano: recta y punto</option></select></div>
                <div><label>Tipo de Plano (Contenedor):</label><select value={pertPlaneType} onChange={e=>setPertPlaneType(e.target.value)}><option value="oblicuo">Oblicuo</option><option value="proy_vert">Proyectante Vertical</option><option value="proy_horiz">Proyectante Horizontal</option></select></div>
              </div>
            )}
            {type === 'abatimientos' && (
              <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                <div><label>Elemento:</label><select value={abatElem} onChange={e=>setAbatElem(e.target.value)}><option value="punto">Punto</option><option value="recta">Recta</option><option value="fig_reg">Figura Regular</option><option value="fig_irreg">Figura Irregular</option></select></div>
                {(abatElem === 'fig_reg' || abatElem === 'fig_irreg') && (
                  <div><label>Nº Lados/Vértices:</label><input type="number" value={abatLados} onChange={e=>setAbatLados(Number(e.target.value))} min="3" max="10" style={{boxSizing:'border-box'}} /></div>
                )}
                <div><label>Estado Dado:</label><select value={abatEstado} onChange={e=>setAbatEstado(e.target.value)}><option value="proy">Proyecciones (Encontrar V.M)</option><option value="vm">Verdadera Magnitud (Desabatir)</option></select></div>
                <div><label>Sobre Plano:</label><select value={abatPlano} onChange={e=>setAbatPlano(e.target.value)}><option value="ph">PH</option><option value="pv">PV</option></select></div>
              </div>
            )}
            
            <div style={{marginTop: '5px', display:'flex', flexDirection:'column', gap:'6px'}}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#242432', padding: '10px', borderRadius: '5px', cursor: 'pointer', margin:0, textTransform:'none', color:'#fff' }}><input type="checkbox" checked={reqOrigin} onChange={e=>setReqOrigin(e.target.checked)} style={{width:'auto'}} /> <span>Mostrar Origen (0)</span></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#242432', padding: '10px', borderRadius: '5px', cursor: 'pointer', margin:0, textTransform:'none', color:'#fff' }}><input type="checkbox" checked={reqPP} onChange={e=>setReqPP(e.target.checked)} style={{width:'auto'}} /> <span>3ª Proyección (PP)</span></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#242432', padding: '10px', borderRadius: '5px', cursor: 'pointer', margin:0, textTransform:'none', color:'#fff' }}><input type="checkbox" checked={reqRegla} onChange={e=>setReqRegla(e.target.checked)} style={{width:'auto'}} /> <span>Mostrar Regla</span></label>
            </div>
            <button className="btn-panel" onClick={handleAdd} style={{ background: '#00d2ff', color: '#000', marginTop:'5px' }}>+ Añadir a Plantilla</button>
          </div>
          
          <div style={{display: 'flex', gap: '8px', marginTop: 'auto'}}>
            <button className="btn-panel" onClick={store.saveData} style={{ flex: 1, background: '#f59e0b', color:'#000' }}>💾 Guardar</button>
            <label className="btn-panel" style={{ flex: 1, background: '#3b82f6', color: '#fff', margin: 0, cursor:'pointer', textAlign:'center', display:'flex', justifyContent:'center', alignItems:'center' }}>
              <input type="file" accept=".json" style={{display:'none'}} onChange={(e) => {
                const file = e.target.files?.[0]; if (!file) return;
                const r = new FileReader();
                r.onload = (ev) => {
                  try { const parsed = JSON.parse(ev.target?.result as string); if(Array.isArray(parsed)) store.importData(parsed); } catch(err) { alert("Archivo inválido"); }
                }; r.readAsText(file); e.target.value = '';
              }} />
              📂 Cargar
            </label>
          </div>
          <button className="btn-panel" onClick={store.downloadData} style={{ background: '#10b981', color:'#000' }}>⬇️ Descargar (.json)</button>
          <button className="btn-panel" onClick={handlePrint} style={{ background: '#8b5cf6', color: '#fff', padding:'15px' }}>🖨️ Imprimir Lámina</button>
        </div>

        {/* ESPACIO DE TRABAJO PRINCIPAL */}
        <div className="main-area">
          
          {/* BARRA SUPERIOR FLOTANTE CON DESHACER/REHACER Y ZOOM */}
          <div className="top-navbar no-print">
            <button className="btn-panel" onClick={store.undo} disabled={store.historyIndex <= 0} title="Deshacer Cambio" style={{padding:'6px 12px'}}>⮌ Deshacer</button>
            <button className="btn-panel" onClick={store.redo} disabled={store.historyIndex >= (store.history || []).length - 1} title="Rehacer Cambio" style={{padding:'6px 12px'}}>⮎ Rehacer</button>
            
            <div style={{width:'1px', height:'20px', background:'#444', margin:'0 5px'}}></div>
            
            <span style={{fontSize:'12px', fontWeight:'bold', color:'#94a3b8', letterSpacing:'1px'}}>VISIBILIDAD:</span>
            <select value={store.sheetZoom} onChange={e => store.setPageConfig({sheetZoom: Number(e.target.value)})} style={{background:'#1e1e2f', color:'white', border:'1px solid #444', padding:'6px', borderRadius:'4px', outline:'none', fontWeight:'bold', width:'80px'}}>
              <option value="50">50%</option>
              <option value="75">75%</option>
              <option value="100">100%</option>
              <option value="125">125%</option>
              <option value="150">150%</option>
            </select>
            
            <span style={{fontSize:'12px', color:'#94a3b8', fontStyle:'italic', marginLeft:'auto'}}>Izquierdo: Selección Múltiple • Derecho: Opciones de Edición</span>
          </div>

          <div className="canvas-viewport">
            <div className="sheet-container">
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
                                const deltaPct = ((evt.clientX - startX) / parentW) * 100;
                                if (isSameRow) {
                                  const newW = Math.max(10, Math.min(startW + nextStartW - 10, startW + deltaPct));
                                  store.updateBoxSize(ex.id, newW + '%', ex.h);
                                  store.updateBoxSize(nextEx.id, (startW + nextStartW - newW) + '%', nextEx.h);
                                } else {
                                  store.updateBoxSize(ex.id, Math.min(100, Math.max(10, startW + deltaPct)) + '%', ex.h);
                                }
                              };
                              const cleanup = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', cleanup); store.commitHistory(); };
                              window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', cleanup);
                          }} />
                          <div className="no-print side-handle-b" onPointerDown={(e) => {
                              e.preventDefault(); e.stopPropagation();
                              const startY = e.clientY; 
                              const startH = parseFloat(ex.h) || 136;
                              let rowItems: Exercise[] = []; let tempW = 0; let tempRow: Exercise[] = [];
                              for (const item of pageExs) {
                                const w = parseFloat(item.w) || 50;
                                if (tempW + w > 101 && tempRow.length > 0) {
                                  if (tempRow.some(i => i.id === ex.id)) rowItems = tempRow;
                                  tempRow = [item]; tempW = w;
                                } else { tempRow.push(item); tempW += w; }
                              }
                              if (tempRow.some(i => i.id === ex.id)) rowItems = tempRow;

                              const onMove = (evt: PointerEvent) => {
                                const newH = Math.max(50, startH + (evt.clientY - startY) * 0.264583);
                                rowItems.forEach(item => store.updateBoxSize(item.id, item.w, newH + 'mm'));
                              };
                              const cleanup = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', cleanup); store.commitHistory(); };
                              window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', cleanup);
                          }} />

                          <button className="no-print" onClick={() => store.removeExercise(ex.id)} style={{ position:'absolute', top: 5, right: 5, zIndex: 10, background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', cursor: 'pointer', width:'22px', height:'22px', fontWeight:'bold', display:'flex', justifyContent:'center', alignItems:'center', fontSize:'12px', padding: 0 }} title="Borrar Ejercicio">✕</button>
                          
                          <div className="exercise-title" style={{ paddingRight: '30px', display: 'flex', gap: '6px' }}>
                            <span contentEditable={false}><b>{store.exercises.findIndex(e => e.id === ex.id) + 1}.</b></span>
                            <span contentEditable suppressContentEditableWarning style={{ flex: 1, outline: 'none' }} onBlur={e => store.updateExerciseText(ex.id, 'title', e.currentTarget.innerText)}>{ex.title}</span>
                          </div>
                          
                          {ex.dataStr && <div className="exercise-data" contentEditable suppressContentEditableWarning onBlur={e => store.updateExerciseText(ex.id, 'dataStr', e.currentTarget.innerText)}>{ex.dataStr}</div>}
                          
                          <div className="no-print" style={{ display: 'flex', gap: '6px', padding: '6px 12px', background: '#f8f9fa', borderBottom: '1.5px solid #eaeaea' }}>
                            <button className="btn-mini" onClick={() => store.addFreeElement(ex.id, 'punto')}>+ Pto</button>
                            <button className="btn-mini" onClick={() => store.addFreeElement(ex.id, 'recta')}>+ Rct</button>
                            <button className="btn-mini" onClick={() => store.addFreeElement(ex.id, 'plano')}>+ Pln</button>
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
        </div>

      </div>
    </>
  );
}
