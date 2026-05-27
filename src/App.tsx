import React, { useState, useRef, useLayoutEffect, useMemo } from 'react';
import { create } from 'zustand';
import { Stage, Layer, Shape, Circle, Group, Line } from 'react-konva';

// ==========================================
// 1. EL CEREBRO MATEMÁTICO AVANZADO (ZUSTAND)
// ==========================================
export interface ExNode { id: string; t: string; x: number; y: number; pairId?: string; }
export interface ExPlane { id: string; name: string; type: string; vX: number; p1: {x:number, y:number}; p2: {x:number, y:number}; customStyle?: 'solid' | 'dashed'; }
export interface ExSegment { id: string; label: string; p1: {x:number, y:number}; p2: {x:number, y:number}; isDashed?: boolean; customStyle?: 'solid' | 'dashed'; }
export interface Constraint { id: string; type: 'parallel' | 'perpendicular'; exId: string; elem1Id: string; elem1Type: 'recta' | 'plano'; elem2Id: string; elem2Type: 'recta' | 'plano'; angleDelta: number; }
export interface Exercise {
  id: string; title: string; type: string; w: string; h: string; dataStr: string;
  state: { ltY: number; originX: number; ppX: number; reqRegla: boolean; reqPP: boolean; reqOrigin: boolean; planes: ExPlane[]; segments: ExSegment[]; pts: {id:string, name:string, nodes:ExNode[]}[]; bounds?: { ltX1: number; ltX2: number; oY1: number; oY2: number; pY1: number; pY2: number; } };
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
  activeTool: 'pointer' | 'pan';
  selectedElements: { exId: string; type: 'punto' | 'recta' | 'plano'; id: string; label: string }[];
  constraints: Constraint[];
  
  setPageConfig: (config: Partial<{pageSize: 'A4'|'A3', fontFamily: string, fontSize: number, sheetZoom: number, activeTool: 'pointer'|'pan', constraints: Constraint[]}>) => void;
  setPrinting: (val: boolean) => void;
  pushHistory: (nextExercises: Exercise[]) => void;
  undo: () => void;
  redo: () => void;
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

function getLineAngle(p1: {x:number, y:number}, p2: {x:number, y:number}) {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

function enforceConstraintPair(ex: Exercise, c: Constraint, structuralChangeOnId: string) {
  let seg1 = ex.state.segments.find(s => s.id === c.elem1Id);
  let pl1 = ex.state.planes.find(p => p.id === c.elem1Id);
  let seg2 = ex.state.segments.find(s => s.id === c.elem2Id);
  let pl2 = ex.state.planes.find(p => p.id === c.elem2Id);

  let targetAngle = 0;
  let driverP1 = {x:0, y:0}, driverP2 = {x:0, y:0};

  if (structuralChangeOnId === c.elem2Id) {
    if (seg2) { driverP1 = seg2.p1; driverP2 = seg2.p2; }
    else if (pl2) { driverP1 = {x: pl2.vX, y: ex.state.ltY}; driverP2 = pl2.p2; }
    let baseAngle = getLineAngle(driverP1, driverP2);
    targetAngle = c.type === 'parallel' ? baseAngle : baseAngle + Math.PI/2;
    
    if (seg1) {
      let len = Math.hypot(seg1.p2.y - seg1.p1.y, seg1.p2.x - seg1.p1.x);
      seg1.p2.x = seg1.p1.x + len * Math.cos(targetAngle);
      seg1.p2.y = seg1.p1.y + len * Math.sin(targetAngle);
    } else if (pl1) {
      let len = Math.hypot(pl1.p2.y - ex.state.ltY, pl1.p2.x - pl1.vX);
      pl1.p2.x = pl1.vX + len * Math.cos(targetAngle);
      pl1.p2.y = ex.state.ltY + len * Math.sin(targetAngle);
    }
  } else {
    if (seg1) { driverP1 = seg1.p1; driverP2 = seg1.p2; }
    else if (pl1) { driverP1 = {x: pl1.vX, y: ex.state.ltY}; driverP2 = pl1.p2; }
    let baseAngle = getLineAngle(driverP1, driverP2);
    targetAngle = c.type === 'parallel' ? baseAngle : baseAngle + Math.PI/2;

    if (seg2) {
      let len = Math.hypot(seg2.p2.y - seg2.p1.y, seg2.p2.x - seg2.p1.x);
      seg2.p2.x = seg2.p1.x + len * Math.cos(targetAngle);
      seg2.p2.y = seg2.p1.y + len * Math.sin(targetAngle);
    } else if (pl2) {
      let len = Math.hypot(pl2.p2.y - ex.state.ltY, pl2.p2.x - pl2.vX);
      pl2.p2.x = pl2.vX + len * Math.cos(targetAngle);
      pl2.p2.y = ex.state.ltY + len * Math.sin(targetAngle);
    }
  }
}

// SISTEMA DEFENSIVO: Si los datos locales están corruptos, inicia de cero para evitar pantalla blanca.
let initialExercises: Exercise[] = [];
try {
  const savedData = localStorage.getItem('diedrico_autosave');
  if (savedData) {
    const parsed = JSON.parse(savedData);
    if (Array.isArray(parsed) && parsed.every(ex => ex && ex.state)) {
      initialExercises = parsed;
    } else {
      localStorage.removeItem('diedrico_autosave');
    }
  }
} catch (e) {
  localStorage.removeItem('diedrico_autosave');
}

export const useStore = create<CadStore>()((set, get) => ({
  exercises: initialExercises,
  history: [initialExercises],
  historyIndex: 0,
  isPrinting: false,
  pageSize: 'A4',
  fontFamily: "'Segoe UI', sans-serif",
  fontSize: 13,
  sheetZoom: 100,
  activeTool: 'pointer',
  selectedElements: [],
  constraints: [],

  pushHistory: (nextExs) => {
    const { history, historyIndex } = get();
    const cleanHistory = history.slice(0, historyIndex + 1);
    set({
      exercises: nextExs,
      history: [...cleanHistory, nextExs],
      historyIndex: cleanHistory.length
    });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      set({ historyIndex: historyIndex - 1, exercises: history[historyIndex - 1] });
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      set({ historyIndex: historyIndex + 1, exercises: history[historyIndex + 1] });
    }
  },

  setPageConfig: (config) => set((state) => ({ ...state, ...config })),
  setPrinting: (val) => set({ isPrinting: val }),

  selectElement: (exId, type, id, label) => set((state) => {
    let list = [...(state.selectedElements || [])];
    const index = list.findIndex(item => item.id === id);
    if (index > -1) {
      list.splice(index, 1);
    } else {
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
      id: uid(), type, exId: e1.exId,
      elem1Id: e1.id, elem1Type: e1.type as any,
      elem2Id: e2.id, elem2Type: e2.type as any,
      angleDelta: type === 'parallel' ? 0 : Math.PI/2
    };

    const nextExercises = (state.exercises || []).map(ex => {
      if (ex.id !== e1.exId) return ex;
      let cloned = JSON.parse(JSON.stringify(ex));
      enforceConstraintPair(cloned, newConstraint, e1.id);
      return cloned;
    });

    set({
      constraints: [...(state.constraints || []), newConstraint],
      selectedElements: []
    });
    get().pushHistory(nextExercises);
  },

  removeConstraintsFor: (id) => set((state) => ({
    constraints: (state.constraints || []).filter(c => c.elem1Id !== id && c.elem2Id !== id)
  })),
  
  saveData: () => { 
    localStorage.setItem('diedrico_pro_data', JSON.stringify(get().exercises)); 
    alert("Estudio CAD guardado con éxito."); 
  },
  loadData: () => { 
    const d = localStorage.getItem('diedrico_pro_data'); 
    if (d) get().pushHistory(JSON.parse(d)); 
    else alert("No hay datos estables."); 
  },
  downloadData: () => { 
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(get().exercises));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `diedrico_cad_${new Date().getTime()}.json`;
    a.click();
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
    get().pushHistory([...(get().exercises || []), newEx]);
  },

  removeExercise: (id) => get().pushHistory((get().exercises || []).filter(e => e.id !== id)),
  updateBoxSize: (id, w, h) => set({ exercises: (get().exercises || []).map(ex => ex.id === id ? { ...ex, w, h } : ex) }),

  addFreeElement: (exId, elemType) => {
    let list = (get().exercises || []).map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state }; let ox = s.originX; let oy = s.ltY;
      if (elemType === 'punto') {
          s.pts = [...(s.pts || []), { id:uid(), name: String.fromCharCode(65 + (s.pts || []).length), nodes:[{id:uid(), t:'2', x:ox+50, y:oy-50, pairId:'nf1'}, {id:'nf1', t:'1', x:ox+50, y:oy+50}] }];
      } else if (elemType === 'recta') {
          const nL = String.fromCharCode(114 + Math.floor((s.segments || []).length / 2));
          s.segments = [...(s.segments || []), { id:uid(), label:`${nL}2`, p1:{x:ox-50, y:oy-20}, p2:{x:ox+50, y:oy-70} }, { id:uid(), label:`${nL}1`, p1:{x:ox-50, y:oy+30}, p2:{x:ox+50, y:oy+80} }];
      } else if (elemType === 'plano') {
          const greek = ['α','β','γ','δ','ε'];
          s.planes = [...(s.planes || []), { id:uid(), name: greek[(s.planes || []).length % 5], type:'oblicuo', vX:ox-70, p1:{x:ox+100, y:oy+150}, p2:{x:ox+100, y:oy-150} }];
      }
      return { ...ex, state: s };
    });
    get().pushHistory(list);
  },

  removeElement: (exId, elemType, elemId) => {
    get().removeConstraintsFor(elemId);
    let list = (get().exercises || []).map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state };
      if (elemType === 'punto') s.pts = (s.pts || []).filter(p => p.id !== elemId && !(p.nodes || []).some(n=>n.id===elemId));
      else if (elemType === 'recta') s.segments = (s.segments || []).filter(sg => sg.id !== elemId);
      else if (elemType === 'plano') s.planes = (s.planes || []).filter(pl => pl.id !== elemId);
      return { ...ex, state: s };
    });
    get().pushHistory(list);
  },

  updateName: (exId, elemType, elemId, newName) => set({
    exercises: (get().exercises || []).map(ex => {
      if(ex.id !== exId) return ex;
      let s = {...ex.state};
      if(elemType === 'punto') s.pts = (s.pts || []).map(p => p.id === elemId ? {...p, name: newName} : p);
      else if(elemType === 'recta') s.segments = (s.segments || []).map(seg => seg.id === elemId ? {...seg, label: newName} : seg);
      else if(elemType === 'plano') s.planes = (s.planes || []).map(pl => pl.id === elemId ? {...pl, name: newName} : pl);
      return {...ex, state: s};
    })
  }),

  updateExerciseText: (exId, field, text) => set({
    exercises: (get().exercises || []).map(ex => ex.id === exId ? { ...ex, [field]: text } : ex)
  }),

  togglePlaneType: (exId, planeId) => set({
    exercises: (get().exercises || []).map(ex => {
      if (ex.id !== exId) return ex;
      return { ...ex, state: { ...ex.state, planes: (ex.state.planes || []).map(pl => pl.id === planeId ? { ...pl, type: pl.type === 'paralelo_lt' ? 'oblicuo' : 'paralelo_lt' } : pl )}};
    })
  }),

  toggleLineStyle: (exId, elemType, elemId) => set({
    exercises: (get().exercises || []).map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state };
      const nSt = (c?: string) => c === 'solid' ? 'dashed' : c === 'dashed' ? undefined : 'solid';
      if (elemType === 'recta') s.segments = (s.segments || []).map(sg => sg.id === elemId ? { ...sg, customStyle: nSt(sg.customStyle) } : sg);
      else if (elemType === 'plano') s.planes = (s.planes || []).map(pl => pl.id === elemId ? { ...pl, customStyle: nSt(pl.customStyle) } : pl);
      return { ...ex, state: s };
    })
  }),

  updateNode: (exId, ptId, nodeId, newX, newY) => {
    let list = (get().exercises || []).map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state };
      let thePoint = (s.pts || []).find(p => p.id === ptId);
      let theNode = (thePoint?.nodes || []).find(n => n.id === nodeId);
      if (theNode) {
         let dx = newX - theNode.x;
         let pairNode = (thePoint?.nodes || []).find(n => n.id === theNode?.pairId);
         s.segments = (s.segments || []).map(seg => {
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
      s.pts = (s.pts || []).map(p => p.id === ptId ? { ...p, nodes: (p.nodes || []).map(n => n.id === nodeId ? { ...n, x: newX, y: newY } : (n.pairId === nodeId ? { ...n, x: newX } : n)) } : p);
      return { ...ex, state: s };
    });
    set({ exercises: list });
  },

  updatePlane: (exId, planeId, newVX) => {
    let list = (get().exercises || []).map(ex => {
      if (ex.id !== exId) return ex;
      let cloned = JSON.parse(JSON.stringify(ex)) as Exercise;
      let pl = (cloned.state.planes || []).find(p => p.id === planeId);
      if (pl) {
        let dx = newVX - pl.vX;
        pl.vX = newVX; pl.p1.x += dx; pl.p2.x += dx;
        (get().constraints || []).filter(c => c.exId === exId && (c.elem1Id === planeId || c.elem2Id === planeId)).forEach(c => {
          enforceConstraintPair(cloned, c, planeId);
        });
      }
      return cloned;
    });
    set({ exercises: list });
  },

  updatePlaneEndpoint: (exId, planeId, traceNum, newX, newY) => {
    let list = (get().exercises || []).map(ex => {
      if (ex.id !== exId) return ex;
      let cloned = JSON.parse(JSON.stringify(ex)) as Exercise;
      let pl = (cloned.state.planes || []).find(p => p.id === planeId);
      if (pl) {
        if (traceNum === 1) pl.p1 = { x: newX, y: newY };
        else pl.p2 = { x: newX, y: newY };
        (get().constraints || []).filter(c => c.exId === exId && (c.elem1Id === planeId || c.elem2Id === planeId)).forEach(c => {
          enforceConstraintPair(cloned, c, planeId);
        });
      }
      return cloned;
    });
    set({ exercises: list });
  },

  updateSegment: (exId, segId, pointIndex, newX, newY) => {
    let list = (get().exercises || []).map(ex => {
      if (ex.id !== exId) return ex;
      let cloned = JSON.parse(JSON.stringify(ex)) as Exercise;
      let seg = (cloned.state.segments || []).find(s => s.id === segId);
      if (seg) {
        if (pointIndex === 1) seg.p1 = { x: newX, y: newY };
        else seg.p2 = { x: newX, y: newY };
        (get().constraints || []).filter(c => c.exId === exId && (c.elem1Id === segId || c.elem2Id === segId)).forEach(c => {
          enforceConstraintPair(cloned, c, segId);
        });
      }
      return cloned;
    });
    set({ exercises: list });
  },

  updateSystem: (exId, target, valX, valY) => set({
    exercises: (get().exercises || []).map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state }; if (!s.bounds) s.bounds = { ltX1: 0, ltX2: 800, oY1: 0, oY2: 400, pY1: 0, pY2: 400 };
      if (target === 'pp') s.ppX = valX;
      else if (target === 'origin') {
        let dx = valX - s.originX; let dy = valY - s.ltY; s.originX = valX; s.ltY = valY; s.ppX += dx;
        s.planes = (s.planes || []).map(pl => ({...pl, vX: pl.vX + dx, p1: {x: pl.p1.x + dx, y: pl.p1.y + dy}, p2: {x: pl.p2.x + dx, y: pl.p2.y + dy}}));
        s.segments = (s.segments || []).map(sg => ({...sg, p1:{x:sg.p1.x+dx, y:sg.p1.y+dy}, p2:{x:sg.p2.x+dx, y:sg.p2.y+dy}}));
        s.pts = (s.pts || []).map(p => ({...p, nodes: (p.nodes || []).map(n => ({...n, x: n.x+dx, y: n.y+dy}))}));
      }
      else if (target === 'lt1') s.bounds.ltX1 = valX;
      else if (target === 'lt2') s.bounds.ltX2 = valX;
      return { ...ex, state: s };
    })
  })
}));

// Autoguardado silencioso
useStore.subscribe((state) => {
  localStorage.setItem('diedrico_autosave', JSON.stringify(state.exercises || []));
});

// ==========================================
// 2. EL MOTOR DE DIBUJO CAD CON RESOLUCIÓN FIJA
// ==========================================
function View2D({ ex }: { ex: Exercise }) {
  const { updateSegment, updatePlane, updatePlaneEndpoint, updateSystem, selectElement, activeTool, selectedElements, isPrinting, updateNode, removeElement, togglePlaneType } = useStore();
  const { ltY, originX, ppX, reqRegla, reqPP, reqOrigin, planes, pts, segments } = ex.state || {};

  const containerRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ w: 800, h: 400 });

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

  const handleHover = (e: any) => { if(activeTool==='pointer') { e.target.moveToTop(); e.target.scale({x:1.3, y:1.3}); document.body.style.cursor='pointer'; } };
  const handleOut = (e: any) => { e.target.scale({x:1, y:1}); document.body.style.cursor='default'; };
  const handleHoverLine = () => { document.body.style.cursor='pointer'; };
  const handleOutLine = () => { document.body.style.cursor='default'; };

  const drawScene = (ctx: any) => {
    const b = ex.state?.bounds || { ltX1: 0, ltX2: 800, oY1: 0, oY2: 400, pY1: 0, pY2: 400 };
    let dynLabels: {text: string, x: number, y: number, font: string}[] = [];
    
    ctx.strokeStyle = "#1e1e24"; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(b.ltX1 || 0, ltY || 0); ctx.lineTo(b.ltX2 || 800, ltY || 0); ctx.stroke();

    (planes || []).forEach((pl: ExPlane) => {
      const isSel = (selectedElements || []).some(s => s.id === pl.id);
      ctx.strokeStyle = isSel ? "#ff9f43" : "#1e1e24"; 
      ctx.lineWidth = isSel ? 3.5 : 2.2;
      ctx.beginPath(); ctx.moveTo(pl.vX || 0, ltY || 0); ctx.lineTo(pl.p2?.x || 0, pl.p2?.y || 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pl.vX || 0, ltY || 0); ctx.lineTo(pl.p1?.x || 0, pl.p1?.y || 0); ctx.stroke();
      if (pl.name) {
        dynLabels.push({ text: `${pl.name}2`, x: pl.p2?.x || 0, y: (pl.p2?.y || 0) - sc(10), font: getFont(15, "bold") });
        dynLabels.push({ text: `${pl.name}1`, x: pl.p1?.x || 0, y: (pl.p1?.y || 0) + sc(20), font: getFont(15, "bold") });
      }
    });

    (segments || []).forEach((seg: ExSegment) => {
      const isSel = (selectedElements || []).some(s => s.id === seg.id);
      ctx.strokeStyle = isSel ? "#ff9f43" : "#00d2ff"; 
      ctx.lineWidth = isSel ? 3.5 : 2.0;
      if (seg.customStyle === 'dashed' || seg.isDashed) ctx.setLineDash([sc(6), sc(4)]);
      ctx.beginPath(); ctx.moveTo(seg.p1?.x || 0, seg.p1?.y || 0); ctx.lineTo(seg.p2?.x || 0, seg.p2?.y || 0); ctx.stroke(); ctx.setLineDash([]);
      if (seg.label) dynLabels.push({ text: seg.label, x: ((seg.p1?.x || 0) + (seg.p2?.x || 0))/2, y: ((seg.p1?.y || 0) + (seg.p2?.y || 0))/2 - sc(8), font: getFont(14, "bold") });
    });

    (pts || []).forEach((p: any) => {
      (p.nodes || []).forEach((n: ExNode) => {
        ctx.beginPath(); ctx.strokeStyle = "#ff4757"; ctx.lineWidth = sc(1.5);
        ctx.moveTo((n.x || 0) - sc(5), n.y || 0); ctx.lineTo((n.x || 0) + sc(5), n.y || 0);
        ctx.moveTo(n.x || 0, (n.y || 0) - sc(5)); ctx.lineTo(n.x || 0, (n.y || 0) + sc(5));
        ctx.stroke();
        if (p.name) dynLabels.push({ text: `${p.name}${n.t}`, x: (n.x || 0) + sc(8), y: (n.y || 0) - sc(8), font: getFont(13, "bold") });
      });
    });

    dynLabels.forEach(lbl => {
      ctx.save(); ctx.font = lbl.font; ctx.strokeStyle = "white"; ctx.lineWidth = sc(4); ctx.strokeText(lbl.text, lbl.x, lbl.y);
      ctx.fillStyle = "black"; ctx.fillText(lbl.text, lbl.x, lbl.y); ctx.restore();
    });
  };

  const b = ex.state?.bounds || { ltX1: 0, ltX2: 800, oY1: 0, oY2: 400, pY1: 0, pY2: 400 };

  return (
    <div style={{width: '100%', height: '100%', position: 'relative'}}>
      <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
        <Stage width={dim.w || 800} height={dim.h || 400}>
          <Layer scaleX={scale} scaleY={scale} x={offsetX} y={offsetY}>
            <Shape sceneFunc={drawScene} />
            
            <Group visible={!isPrinting}>
              {/* HITBOXES Y NODOS DE CONTROL INTERACTIVOS */}
              {(segments || []).map(seg => (
                <Line key={`hit-${seg.id}`} points={[seg.p1?.x || 0, seg.p1?.y || 0, seg.p2?.x || 0, seg.p2?.y || 0]} stroke="transparent" strokeWidth={sc(22)} onClick={() => { if(activeTool==='pointer') selectElement(ex.id, 'recta', seg.id, `Recta ${seg.label || 'r'}`); }} onMouseEnter={handleHoverLine} onMouseLeave={handleOutLine} />
              ))}
              {(planes || []).map(pl => (
                <Group key={`hit-pl-${pl.id}`}>
                   <Line points={[pl.vX || 0, ltY || 0, pl.p2?.x || 0, pl.p2?.y || 0]} stroke="transparent" strokeWidth={sc(22)} onClick={() => { if(activeTool==='pointer') selectElement(ex.id, 'plano', pl.id, `Plano ${pl.name}`); }} onMouseEnter={handleHoverLine} onMouseLeave={handleOutLine} />
                   <Line points={[pl.vX || 0, ltY || 0, pl.p1?.x || 0, pl.p1?.y || 0]} stroke="transparent" strokeWidth={sc(22)} onClick={() => { if(activeTool==='pointer') selectElement(ex.id, 'plano', pl.id, `Plano ${pl.name}`); }} onMouseEnter={handleHoverLine} onMouseLeave={handleOutLine} />
                </Group>
              ))}
              
              {/* TIRADORES DE ARRASTRE CAD */}
              {activeTool === 'pointer' && (segments || []).map(seg => (
                <Group key={`drags-${seg.id}`}>
                  <Circle x={seg.p1?.x || 0} y={seg.p1?.y || 0} radius={sc(8)} fill="#00d2ff" draggable onDragMove={(e) => updateSegment(ex.id, seg.id, 1, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} />
                  <Circle x={seg.p2?.x || 0} y={seg.p2?.y || 0} radius={sc(8)} fill="#00d2ff" draggable onDragMove={(e) => updateSegment(ex.id, seg.id, 2, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} />
                </Group>
              ))}
              {activeTool === 'pointer' && (planes || []).map(pl => (
                <Group key={`drags-pl-${pl.id}`}>
                  <Circle x={pl.vX || 0} y={ltY || 0} radius={sc(10)} fill="#ff9f43" draggable dragBoundFunc={(p)=>({x:p.x, y:ltY || 0})} onDragMove={(e) => updatePlane(ex.id, pl.id, e.target.x())} onMouseEnter={handleHover} onMouseLeave={handleOut} />
                  <Circle x={pl.p2?.x || 0} y={pl.p2?.y || 0} radius={sc(8)} fill="#ff9f43" draggable onDragMove={(e) => updatePlaneEndpoint(ex.id, pl.id, 2, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} />
                  <Circle x={pl.p1?.x || 0} y={pl.p1?.y || 0} radius={sc(8)} fill="#ff9f43" draggable onDragMove={(e) => updatePlaneEndpoint(ex.id, pl.id, 1, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} />
                </Group>
              ))}
            </Group>
          </Layer>
        </Stage>
      </div>
    </div>
  );
}

// ==========================================
// 3. LA INTERFAZ PRINCIPAL COMPLETA (CAD WORKBENCH)
// ==========================================
export default function App() {
  const store = useStore();
  const [type, setType] = useState('punto_coord');
  const [ptCount, setPtCount] = useState(4);
  const [lineType, setLineType] = useState('cualquiera');
  const [lineMethod, setLineMethod] = useState('coord');
  const [abatLados, setAbatLados] = useState(3);
  const [abatElem, setAbatElem] = useState('fig_reg');
  const [abatEstado, setAbatEstado] = useState('proy');
  const [abatPlano, setAbatPlano] = useState('ph');

  const handleAdd = () => { store.addExercise({ type, ptCount, lineType, lineMethod, abatLados, abatElem, abatEstado, abatPlano }); };

  const handlePrint = () => {
    store.setPrinting(true);
    setTimeout(() => {
      window.print();
      store.setPrinting(false);
    }, 300);
  };

  const paginatedExercises = useMemo(() => {
    let pages: Exercise[][] = []; 
    let currPage: Exercise[] = [];
    let currY = 0; 
    let rowH = 0;
    let rowW = 0;
    
    (store.exercises || []).forEach(ex => {
      let hVal = parseInt(ex.h) || 136;
      let wVal = parseFloat(ex.w) || 50;

      const MAX_H = pages.length === 0 ? 275 : 305; 

      if (rowW + wVal <= 101) { 
        rowW += wVal;
        rowH = Math.max(rowH, hVal);
      } else {
        currY += rowH;
        rowW = wVal;
        rowH = hVal;
      }

      if (currY + rowH > MAX_H && currPage.length > 0) {
        pages.push(currPage);
        currPage = [];
        currY = 0;
        rowW = wVal;
        rowH = hVal;
      }
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
        .app-layout { display: grid; grid-template-columns: 310px 1fr 280px; height: 100vh; background-color: #0c0c0e; }
        .sidebar { background: #121216; border-right: 1px solid #1e1e24; padding: 20px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
        .right-toolbar { background: #121216; border-left: 1px solid #1e1e24; padding: 20px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
        .main-workspace { display: flex; flex-direction: column; height: 100vh; background: #18181c; background-image: radial-gradient(#2d2d36 1px, transparent 1px); background-size: 24px 24px; }
        
        .top-navbar { height: 50px; background: #121216; border-bottom: 1px solid #1e1e24; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; z-index: 50; }
        .canvas-viewport { flex: 1; overflow: auto; display: flex; justify-content: center; align-items: flex-start; padding: 40px; }
        
        .sheet-container { transform: scale(${(store.sheetZoom || 100) / 100}); transform-origin: top center; transition: transform 0.2s ease; }
        .page-sheet { background: #ffffff; width: ${PAGE_W}; min-height: 297mm; padding: 4mm; color: #000000; box-sizing: border-box; break-inside: avoid; box-shadow: 0 20px 40px rgba(0,0,0,0.5); display: flex; flex-direction: column; margin-bottom: 30px; transition: width 0.3s ease; }
        .page-border { border: 2px solid #000; flex-grow: 1; display: flex; flex-direction: column; box-sizing: border-box; background: #fff; position: relative; }
        
        .cajetin { width: ${store.pageSize === 'A3' ? '204mm' : '100%'}; border-right: ${store.pageSize === 'A3' ? '2px solid black' : 'none'}; border-bottom: 2px solid black; background: #fff; transition: width 0.3s ease; }
        .cajetin-top { display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid black; font-size: 0.8rem; font-weight: bold; }
        .cajetin-bottom { display: flex; gap: 20px; padding: 12px 12px; font-weight: bold; }
        
        .exercises-grid { flex-grow: 1; display: flex; flex-wrap: wrap; align-content: flex-start; width: 100%; }
        .exercise-box { display: flex; flex-direction: column; position: relative; box-sizing: border-box; border-right: 1.5px solid black; border-bottom: 1.5px solid black; background: #fff; }
        
        .exercise-title { padding: 8px 12px; background: #f8f9fa; border-bottom: 1.5px solid black; font-weight: bold; font-family: ${store.fontFamily || 'Arial'}; font-size: ${store.fontSize || 13}px; text-align: justify; color: #000; }
        .exercise-data { font-family: ${store.fontFamily || 'Arial'}; font-size: ${(store.fontSize || 13) - 1}px; padding: 6px 12px; border-bottom: 1.5px dashed #ccc; font-weight: bold; line-height: 1.3; text-align: justify; color: #333; }
        
        .cad-btn { background: #1e1e24; color: #e2e8f0; border: 1px solid #3a3a44; padding: 10px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .cad-btn:hover { background: #00d2ff; color: #0c0c0e; border-color: #00d2ff; }
        .cad-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .cad-btn.active { background: #00d2ff; color: #0c0c0e; border-color: #00d2ff; }
        
        .tool-icon-btn { width: 44px; height: 44px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: #1c1c24; border: 1px solid #2d2d3a; cursor: pointer; transition: all 0.2s; }
        .tool-icon-btn:hover, .tool-icon-btn.active { background: #ff9f43; border-color: #ff9f43; color: #000; }
        
        select, input { background: #1c1c24; color: #fff; border: 1px solid #2d2d3a; padding: 10px; border-radius: 6px; font-size: 14px; width: 100%; box-sizing: border-box; }
        label { font-size: 12px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        
        @media print {
          .no-print { display: none !important; }
          .main-workspace { background: none; }
          .canvas-viewport { padding: 0; }
          .sheet-container { transform: scale(1) !important; }
          @page { size: ${store.pageSize === 'A3' ? 'A3 landscape' : 'A4 portrait'}; margin: 0; }
          .page-sheet { box-shadow: none; margin: 0; }
        }
      `}</style>

      <div className="app-layout">
        {/* COLUMNA IZQUIERDA: GENERADORES Y CONFIGURACIÓN */}
        <div className="sidebar no-print">
          <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
            <div style={{width:'12px', height:'12px', borderRadius:'50%', background:'#00d2ff'}}></div>
            <h3 style={{margin:0, letterSpacing:'0.5px'}}>CAD DIÉDRICO</h3>
          </div>
          
          <div style={{display:'flex', flexDirection:'column', gap:'12px', background:'#18181f', padding:'14px', borderRadius:'8px', border:'1px solid #222'}}>
            <label>Formato de Lámina</label>
            <select value={store.pageSize} onChange={e => store.setPageConfig({pageSize: e.target.value as any})}>
              <option value="A4">A4 Norma (Vertical)</option>
              <option value="A3">A3 Técnico (Horizontal)</option>
            </select>

            <label>Tipografía Enunciados</label>
            <select value={store.fontFamily} onChange={e => store.setPageConfig({fontFamily: e.target.value})}>
              <option value="'Segoe UI', sans-serif">Segoe UI Clean</option>
              <option value="Arial, sans-serif">Arial Técnico</option>
              <option value="'Times New Roman', serif">Times Roman DIN</option>
              <option value="'Courier New', monospace">Monospace Vector</option>
            </select>

            <label>Tamaño Fuente: {store.fontSize}px</label>
            <input type="range" min="11" max="22" value={store.fontSize} onChange={e => store.setPageConfig({fontSize: Number(e.target.value)})} />
          </div>

          <div style={{display:'flex', flexDirection:'column', gap:'12px', background:'#18181f', padding:'14px', borderRadius:'8px', border:'1px solid #222'}}>
            <label>Bloque Constructivo</label>
            <select value={type} onChange={e => setType(e.target.value)}>
              <option value="punto_coord">1. Sistema de Puntos</option>
              <option value="rectas">2. Sistema de Rectas</option>
              <option value="plano_coord">3. Sistema de Planos</option>
              <option value="intersecciones">4. Intersecciones Algebráicas</option>
              <option value="paralelismo">5. Paralelismo Vectorial</option>
              <option value="abatimientos">6. Abatimientos Estructurales</option>
            </select>

            {type === 'abatimientos' && (
              <>
                <label>Tipo Elemento</label>
                <select value={abatElem} onChange={e => setAbatElem(e.target.value)}>
                  <option value="fig_reg">Figura Regular</option>
                  <option value="fig_irreg">Figura Irregular</option>
                </select>
                <label>Vértices de la Figura</label>
                <input type="number" min="3" max="8" value={abatLados} onChange={e => setAbatLados(Number(e.target.value))} />
              </>
            )}

            <button className="cad-btn" onClick={handleAdd} style={{background:'#00d2ff', color:'#000'}}>+ Insertar en Plantilla</button>
          </div>

          <div style={{marginTop:'auto', display:'flex', flexDirection:'column', gap:'8px'}}>
            <div style={{display:'flex', gap:'6px'}}>
              <button className="cad-btn" style={{flex:1}} onClick={store.saveData}>Guardar</button>
              <button className="cad-btn" style={{flex:1}} onClick={store.loadData}>Cargar</button>
            </div>
            <button className="cad-btn" style={{background:'#2ed573', color:'#000'}} onClick={handlePrint}>🖨️ Imprimir Trabajo</button>
          </div>
        </div>

        {/* ESPACIO DE TRABAJO PRINCIPAL */}
        <div className="main-workspace">
          <div className="top-navbar no-print">
            {/* UNDO / REDO TRADICIONAL */}
            <div style={{display:'flex', gap:'8px'}}>
              <button className="cad-btn" onClick={store.undo} disabled={store.historyIndex <= 0} title="Deshacer Cambio">⮌</button>
              <button className="cad-btn" onClick={store.redo} disabled={store.historyIndex >= (store.history || []).length - 1} title="Rehacer Cambio">⮎</button>
            </div>

            {/* CONTROL DE PORCENTAJE DE VISIBILIDAD */}
            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
              <span style={{fontSize:'12px', fontWeight:600, color:'#94a3b8'}}>VISIBILIDAD:</span>
              <select value={store.sheetZoom} onChange={e => store.setPageConfig({sheetZoom: Number(e.target.value)})} style={{width:'90px', padding:'6px'}}>
                <option value="50">50%</option>
                <option value="75">75%</option>
                <option value="100">100%</option>
                <option value="125">125%</option>
                <option value="150">150%</option>
              </select>
            </div>
          </div>

          <div className="canvas-viewport">
            <div className="sheet-container">
              {paginatedExercises.map((pageExs, pageIdx) => (
                <div key={`page-${pageIdx}`} className="page-sheet">
                  <div className="page-border">
                    {pageIdx === 0 && (
                      <div className="cajetin">
                        <div className="cajetin-top">
                          <span>Colegio Nuestra Señora de los Infantes</span>
                          <span>1º BACHILLERATO - DIBUJO TÉCNICO</span>
                        </div>
                        <div className="cajetin-bottom">
                          <span style={{flex:1}}>Alumno: ______________________________________</span>
                          <span>Fecha: _________</span>
                        </div>
                      </div>
                    )}

                    <div className="exercises-grid">
                      {pageExs.map((ex) => (
                        <div key={`ex-${ex.id}`} className="exercise-box" style={{ flexBasis: ex.w, minHeight: ex.h }}>
                          <div className="exercise-title" onBlur={e => store.updateExerciseText(ex.id, 'title', e.currentTarget.innerText)} contentEditable suppressContentEditableWarning>
                            {ex.title}
                          </div>
                          {ex.dataStr && (
                            <div className="exercise-data" onBlur={e => store.updateExerciseText(ex.id, 'dataStr', e.currentTarget.innerText)} contentEditable suppressContentEditableWarning>
                              {ex.dataStr}
                            </div>
                          )}
                          
                          <div className="no-print" style={{display:'flex', gap:'4px', padding:'4px', background:'#f1f5f9', borderBottom:'1px solid #ddd'}}>
                            <button className="btn-mini" onClick={() => store.addFreeElement(ex.id, 'punto')}>+ Punto</button>
                            <button className="btn-mini" onClick={() => store.addFreeElement(ex.id, 'recta')}>+ Recta</button>
                            <button className="btn-mini" onClick={() => store.addFreeElement(ex.id, 'plano')}>+ Plano</button>
                            <button className="btn-mini" style={{marginLeft:'auto', background:'#ff4757', color:'#fff'}} onClick={() => store.removeExercise(ex.id)}>Eliminar</button>
                          </div>

                          <div style={{flex:1, position:'relative'}}>
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

        {/* COLUMNA DERECHA: BARRA DE HERRAMIENTAS Y RESTRICCIONES */}
        <div className="right-toolbar no-print">
          <label>Herramientas CAD</label>
          <div style={{display:'flex', gap:'8px', marginBottom:'10px'}}>
            <button className={`tool-icon-btn ${store.activeTool === 'pointer' ? 'active' : ''}`} onClick={() => store.setPageConfig({activeTool: 'pointer'})} title="Modo Selección por Flecha">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 2l12 11.2-5.8.8 3.6 6.6-2.4 1.3-3.6-6.6-3.8 3.7z"/></svg>
            </button>
            <button className={`tool-icon-btn ${store.activeTool === 'pan' ? 'active' : ''}`} onClick={() => { store.setPageConfig({activeTool: 'pan'}); store.clearSelection(); }} title="Modo Navegación Libre">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M13 1v5h-2v-5h2zM6 11h-5v2h5v-2zM23 11h-5v2h5v-2zM13 18v5h-2v-5h2z"/></svg>
            </button>
          </div>

          <hr style={{border:'none', borderTop:'1px solid #2d2d3a', margin:'10px 0'}} />

          <label>Inspector de Relaciones</label>
          <div style={{background:'#18181f', padding:'12px', borderRadius:'6px', border:'1px solid #2d2d3a', minHeight:'120px', fontSize:'13px'}}>
            {(store.selectedElements || []).length === 0 && <span style={{color:'#64748b', fontStyle:'italic'}}>Usa la flecha para tocar elementos de la hoja y enlazarlos...</span>}
            
            {(store.selectedElements || []).map((item, idx) => (
              <div key={item.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'#242432', padding:'6px 10px', borderRadius:'4px', marginBottom:'6px', borderLeft:'3px solid #ff9f43'}}>
                <span>{item.label}</span>
              </div>
            ))}

            {(store.selectedElements || []).length === 2 && (
              <div style={{marginTop:'14px', display:'flex', flexDirection:'column', gap:'6px'}}>
                <label style={{color:'#ff9f43'}}>Vincular Elementos:</label>
                <button className="cad-btn" style={{background:'#242432', borderColor:'#ff9f43'}} onClick={() => store.applyConstraint('parallel')}>平行 Hacer Paralelos</button>
                <button className="cad-btn" style={{background:'#242432', borderColor:'#ff9f43'}} onClick={() => store.applyConstraint('perpendicular')}>⟂ Hacer Perpendiculares</button>
              </div>
            )}
          </div>

          {(store.constraints || []).length > 0 && (
            <>
              <label style={{marginTop:'10px'}}>Vínculos Activos</label>
              <div style={{maxHeight:'150px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'4px'}}>
                {store.constraints.map(c => (
                  <div key={c.id} style={{fontSize:'12px', background:'#1e293b', padding:'6px', borderRadius:'4px', display:'flex', justifyContent:'space-between'}}>
                    <span>{c.type === 'parallel' ? 'Paralelismo' : 'Perpendicularidad'}</span>
                    <button style={{background:'none', border:'none', color:'#ff4757', cursor:'pointer'}} onClick={() => store.setPageConfig({ constraints: store.constraints.filter(x => x.id !== c.id) })}>✕</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
