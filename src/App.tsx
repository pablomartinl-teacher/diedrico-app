import React, { useState, useRef, useLayoutEffect, useMemo, useEffect } from 'react';
import { create } from 'zustand';
import { Stage, Layer, Shape, Circle, Group, Line } from 'react-konva';

// ==========================================
// 1. EL CEREBRO MATEMÁTICO (ZUSTAND)
// ==========================================
export interface ExNode { id: string; t: string; x: number; y: number; pairId?: string; }
export interface ExPlane { id: string; name: string; type: string; vX: number; p1: {x:number, y:number}; p2: {x:number, y:number}; customStyle?: 'solid' | 'dashed'; }
export interface ExSegment { id: string; label: string; p1: {x:number, y:number}; p2: {x:number, y:number}; isDashed?: boolean; customStyle?: 'solid' | 'dashed'; }
export interface ExRelation { id: string; master: string; slave: string; type: 'para' | 'perp'; }
export interface Exercise {
  id: string; title: string; type: string; w: string; h: string; dataStr: string;
  state: { ltY: number; originX: number; ppX: number; reqRegla: boolean; reqPP: boolean; reqOrigin: boolean; planes: ExPlane[]; segments: ExSegment[]; pts: {id:string, name:string, nodes:ExNode[]}[]; bounds?: { ltX1: number; ltX2: number; oY1: number; oY2: number; pY1: number; pY2: number; }; relations?: ExRelation[]; };
}

export interface SelectedItem { exId: string; id: string; label: string; type: 'recta' | 'plano' | 'punto'; }

interface CadStore {
  exercises: Exercise[];
  past: string[];
  future: string[];
  isPrinting: boolean;
  pageSize: 'A4' | 'A3';
  fontFamily: string;
  fontSize: number;
  zoom: number;
  selectedItems: SelectedItem[];
  setZoom: (z: number) => void;
  setPageConfig: (config: Partial<{pageSize: 'A4'|'A3', fontFamily: string, fontSize: number}>) => void;
  setPrinting: (val: boolean) => void;
  toggleSelection: (item: SelectedItem, multi: boolean) => void;
  clearSelection: () => void;
  addRelation: (exId: string, masterId: string, slaveId: string, type: 'para' | 'perp') => void;
  removeRelation: (exId: string, relId: string) => void;
  undo: () => void;
  redo: () => void;
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

// LÓGICA DE RESTRICCIONES MATEMÁTICAS (Paralelismo/Perpendicularidad)
function getCoords(s: any, fullId: string) {
  if (fullId.startsWith('pl')) {
    const isPl1 = fullId.startsWith('pl1');
    const id = fullId.split('_')[1];
    const pl = s.planes.find((p:any) => p.id === id);
    if (!pl) return null;
    return isPl1 ? { x1: pl.vX, y1: s.ltY, x2: pl.p1.x, y2: pl.p1.y } : { x1: pl.vX, y1: s.ltY, x2: pl.p2.x, y2: pl.p2.y };
  } else if (fullId.startsWith('seg')) {
    const id = fullId.split('_')[1];
    const seg = s.segments.find((sg:any) => sg.id === id);
    if (!seg) return null;
    return { x1: seg.p1.x, y1: seg.p1.y, x2: seg.p2.x, y2: seg.p2.y };
  }
  return null;
}

function applyConstraints(exercises: Exercise[]) {
  return exercises.map(ex => {
    if (!ex.state.relations || ex.state.relations.length === 0) return ex;
    let s = JSON.parse(JSON.stringify(ex.state)); // Deep copy simple
    
    ex.state.relations.forEach(rel => {
      const mC = getCoords(s, rel.master);
      const sC = getCoords(s, rel.slave);
      if (!mC || !sC) return;
      
      let targetAngle = Math.atan2(mC.y2 - mC.y1, mC.x2 - mC.x1);
      if (rel.type === 'perp') targetAngle += Math.PI / 2;

      if (rel.slave.startsWith('pl')) {
        const trNum = rel.slave.startsWith('pl1') ? 1 : 2;
        const id = rel.slave.split('_')[1];
        const plIdx = s.planes.findIndex((p:any) => p.id === id);
        if (plIdx > -1) {
          const dx = sC.x2 - sC.x1; const dy = sC.y2 - sC.y1;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (trNum === 1) s.planes[plIdx].p1 = { x: s.planes[plIdx].vX + dist * Math.cos(targetAngle), y: s.ltY + dist * Math.sin(targetAngle) };
          else s.planes[plIdx].p2 = { x: s.planes[plIdx].vX + dist * Math.cos(targetAngle), y: s.ltY + dist * Math.sin(targetAngle) };
        }
      } else if (rel.slave.startsWith('seg')) {
        const id = rel.slave.split('_')[1];
        const segIdx = s.segments.findIndex((sg:any) => sg.id === id);
        if (segIdx > -1) {
          const mx = (sC.x1 + sC.x2)/2; const my = (sC.y1 + sC.y2)/2;
          const dx = sC.x2 - sC.x1; const dy = sC.y2 - sC.y1;
          const dist = Math.sqrt(dx*dx + dy*dy);
          s.segments[segIdx].p1 = { x: mx - (dist/2) * Math.cos(targetAngle), y: my - (dist/2) * Math.sin(targetAngle) };
          s.segments[segIdx].p2 = { x: mx + (dist/2) * Math.cos(targetAngle), y: my + (dist/2) * Math.sin(targetAngle) };
        }
      }
    });
    return { ...ex, state: s };
  });
}

const savedData = localStorage.getItem('diedrico_autosave');
const initialExercises = savedData ? JSON.parse(savedData) : [];

const pushHistory = (state: CadStore) => {
  const h = [...state.past, JSON.stringify(state.exercises)];
  if (h.length > 25) h.shift();
  return { past: h, future: [] };
};

export const useStore = create<CadStore>()((set, get) => ({
  exercises: initialExercises,
  past: [],
  future: [],
  isPrinting: false,
  pageSize: 'A4',
  fontFamily: "'Segoe UI', sans-serif",
  fontSize: 13,
  zoom: 100,
  selectedItems: [],
  
  setZoom: (z) => set({ zoom: z }),
  setPageConfig: (config) => set((state) => ({ ...state, ...config })),
  setPrinting: (val) => set({ isPrinting: val }),
  
  toggleSelection: (item, multi) => set(state => {
    let sel = [...state.selectedItems];
    const exists = sel.find(i => i.id === item.id);
    if (exists) sel = multi ? sel.filter(i => i.id !== item.id) : [];
    else sel = multi ? [...sel, item] : [item];
    return { selectedItems: sel };
  }),
  clearSelection: () => set({ selectedItems: [] }),

  undo: () => set(state => {
    if (state.past.length === 0) return state;
    const prev = state.past[state.past.length - 1];
    const newPast = state.past.slice(0, -1);
    return { exercises: JSON.parse(prev), past: newPast, future: [JSON.stringify(state.exercises), ...state.future], selectedItems: [] };
  }),
  redo: () => set(state => {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    const newFuture = state.future.slice(1);
    return { exercises: JSON.parse(next), past: [...state.past, JSON.stringify(state.exercises)], future: newFuture, selectedItems: [] };
  }),
  
  saveData: () => { 
    localStorage.setItem('diedrico_pro_data', JSON.stringify(get().exercises)); 
    alert("Lámina guardada en la memoria del navegador."); 
  },
  loadData: () => { 
    const d = localStorage.getItem('diedrico_pro_data'); 
    if (d) set({ exercises: JSON.parse(d), past: [], future: [] }); 
    else alert("No hay datos guardados."); 
  },
  downloadData: () => { 
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(get().exercises));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `lamina_diedrico_${new Date().getTime()}.json`;
    a.click();
  },

  addRelation: (exId, masterId, slaveId, type) => set(state => {
    const newState = { ...state, ...pushHistory(state) };
    newState.exercises = newState.exercises.map(ex => {
      if(ex.id !== exId) return ex;
      const rels = ex.state.relations ? [...ex.state.relations] : [];
      rels.push({ id: uid(), master: masterId, slave: slaveId, type });
      return { ...ex, state: { ...ex.state, relations: rels } };
    });
    newState.exercises = applyConstraints(newState.exercises);
    return newState;
  }),

  removeRelation: (exId, relId) => set(state => {
    const newState = { ...state, ...pushHistory(state) };
    newState.exercises = newState.exercises.map(ex => {
      if(ex.id !== exId) return ex;
      return { ...ex, state: { ...ex.state, relations: (ex.state.relations || []).filter(r => r.id !== relId) } };
    });
    return newState;
  }),

  addExercise: (opts) => set((state) => {
    const newState = { ...state, ...pushHistory(state) };
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
      if (opts.lineMethod === 'coord') { dataStr = `A(${ax}, ${ay}, ${az})  |  B(${bx}, ${by}, ${bz})`; 
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
      dataStr = ""; title = "Hallar la recta de intersección de los planos.";
      if (opts.intSub === 'todas') planes.push(genPlane('α', opts.intP1, true, -50), genPlane('β', opts.intP2, false, 50));
      else if (opts.intSub === 'paralelas') { let pA = genPlane('α', 'oblicuo', true, -60); let pB = genPlane('β', 'oblicuo', false, 60); pB.p1.y = ltY + ((pA.p1.y - ltY)/(pA.p1.x - pA.vX)) * (pB.p1.x - pB.vX); planes.push(pA, pB); }
      else if (opts.intSub === 'no_existe') planes.push(genPlane('α', 'horizontal', true), genPlane('β', 'oblicuo', false, 40)); 
      else if (opts.intSub === 'paralelas_lt') { planes.push(genPlane('α', 'paralelo_lt', true), genPlane('β', 'paralelo_lt', false, 0)); opts.reqPP = true; }
    } 
    else if (t === 'paralelismo') {
      dataStr = ""; let pA = genPlane('α', 'oblicuo', true, -60); let px = originX + 40*SF; let pz = ltY - 60; let py = ltY + 50;
      let pto = { id: uid(), name: 'A', nodes: [{id:uid(), t:'2', x:px, y:pz, pairId:'n1A'}, {id:'n1A', t:'1', x:px, y:py}] }; pts.push(pto);
      if (opts.paraSub === 'r_r_pto') { segments.push({ id:uid(), label:'r2', p1:{x:originX-40*SF, y:ltY-20*SF}, p2:{x:originX+30*SF, y:ltY-60*SF} }, { id:uid(), label:'r1', p1:{x:originX-40*SF, y:ltY+30*SF}, p2:{x:originX+30*SF, y:ltY+70*SF} }); title = "Trazar por el punto A una recta paralela a la recta r."; }
      else if (opts.paraSub === 'p_p_pto') { planes.push(pA); title = "Trazar por A un plano paralelo a α."; }
      else if (opts.paraSub === 'r_p_pto_corte') { planes.push(pA); segments.push({ id:uid(), label:'r2', p1:{x:originX-80*SF, y:ltY-30*SF}, p2:{x:originX+60*SF, y:ltY-80*SF} }, { id:uid(), label:'r1', p1:{x:originX-80*SF, y:ltY+40*SF}, p2:{x:originX+60*SF, y:ltY+90*SF} }); title = "Trazar por A una recta paralela a α que se corte con r."; }
      else if (opts.paraSub === 'p_r_pto') { segments.push({ id:uid(), label:'r2', p1:{x:originX-40*SF, y:ltY-20*SF}, p2:{x:originX+30*SF, y:ltY-60*SF} }, { id:uid(), label:'r1', p1:{x:originX-40*SF, y:ltY+30*SF}, p2:{x:originX+30*SF, y:ltY+70*SF} }); title = "Trazar por A un plano paralelo a la recta r."; }
      else if (opts.paraSub === 'p_r_cont_r') { segments.push({ id:uid(), label:'r2', p1:{x:originX-40*SF, y:ltY-20*SF}, p2:{x:originX+30*SF, y:ltY-60*SF} }, { id:uid(), label:'r1', p1:{x:originX-40*SF, y:ltY+30*SF}, p2:{x:originX+30*SF, y:ltY+70*SF} }); segments.push({ id:uid(), label:'s2', p1:{x:originX-30*SF, y:ltY-70*SF}, p2:{x:originX+40*SF, y:ltY-10*SF} }, { id:uid(), label:'s1', p1:{x:originX-30*SF, y:ltY+60*SF}, p2:{x:originX+40*SF, y:ltY+20*SF} }); pts = []; title = "Trazar un plano paralelo a r que contenga a s."; }
      else if (opts.paraSub === 'p_2r_cortan') { segments.push({ id:uid(), label:'r2', p1:{x:px-100, y:pz}, p2:{x:px, y:pz-50} }, { id:uid(), label:'r1', p1:{x:px-100, y:py}, p2:{x:px, y:py+50} }); segments.push({ id:uid(), label:'s2', p1:{x:px+100, y:pz}, p2:{x:px, y:pz-50} }, { id:uid(), label:'s1', p1:{x:px+100, y:py}, p2:{x:px, y:py+50} }); pts = [{ id:uid(), name:'I', nodes:[{id:uid(), t:'2', x:px, y:pz-50, pairId:'n1I'}, {id:'n1I', t:'1', x:px, y:py+50}] }]; title = "Trazar un plano paralelo a r y s (se cortan en el punto I)."; }
    }
    else if (t === 'perpendicularidad') {
      dataStr = ""; let pA = genPlane('α', 'oblicuo', true, -40); let px = originX + 50*SF; let pz = ltY - 60; let py = ltY + 80;
      let ptP = { id: uid(), name: 'P', nodes: [{id:uid(), t:'2', x:px, y:pz, pairId:'n1P'}, {id:'n1P', t:'1', x:px, y:py}] };
      if (opts.perpSub === 'r_p_pto') { planes.push(pA); pts.push(ptP); title = "Trazar por P una recta ⊥ a α."; }
      else if (opts.perpSub === 'p_r_pto' || opts.perpSub === 'r_r_ext' || opts.perpSub === 'r_r') { segments.push({ id:uid(), label:'r2', p1:{x:px-150, y:pz+30}, p2:{x:px-20, y:pz-30} }, { id:uid(), label:'r1', p1:{x:px-150, y:py-30}, p2:{x:px-20, y:py+30} }); if(opts.perpSub !== 'r_r') pts.push(ptP); title = opts.perpSub === 'p_r_pto' ? "Trazar por P un plano ⊥ a r." : opts.perpSub === 'r_r_ext' ? "Trazar por P (exterior) una recta ⊥ a r." : "Trazar recta ⊥ a r que la corte."; }
      else if (opts.perpSub === 'p_p_pto') { planes.push(pA); pts.push(ptP); title = "Trazar por P plano ⊥ a α."; }
      else if (opts.perpSub === 'p_p_r') { planes.push(pA); title = "Trazar plano ⊥ a α que contenga a r."; segments.push({ id:uid(), label:'r2', p1:{x:px-150, y:pz+30}, p2:{x:px-20, y:pz-30} }, { id:uid(), label:'r1', p1:{x:px-150, y:py-30}, p2:{x:px-20, y:py+30} }); }
    }
    else if (t === 'pertenencias') {
      dataStr = "";
      if (['max_pend', 'max_inc', 'horiz', 'front'].includes(opts.pertSub)) { planes.push(genPlane('α', opts.pertPlaneType, true, 0)); title = `Trazar una recta de tipo ${opts.pertSub.replace('_',' ')} contenida en el plano α (${opts.pertPlaneType.replace('_', ' ')}).`; }
      else {
          let px = originX; let pz = ltY - 50; let py = ltY + 50;
          if (opts.pertSub === 'def_2r_c') { segments.push({ id:uid(), label:'r2', p1:{x:px-80, y:pz+20}, p2:{x:px, y:pz} }, { id:uid(), label:'r1', p1:{x:px-80, y:py-20}, p2:{x:px, y:py} }); segments.push({ id:uid(), label:'s2', p1:{x:px+80, y:pz+30}, p2:{x:px, y:pz} }, { id:uid(), label:'s1', p1:{x:px+80, y:py-10}, p2:{x:px, y:py} }); pts.push({ id:uid(), name:'I', nodes:[{id:uid(), t:'2', x:px, y:pz, pairId:'n1I'}, {id:'n1I', t:'1', x:px, y:py}] }); title = "Hallar trazas del plano definido por r y s (se cortan en I)."; }
          else if (opts.pertSub === 'def_2r_p') { segments.push({ id:uid(), label:'r2', p1:{x:px-80, y:pz+20}, p2:{x:px+20, y:pz-20} }, { id:uid(), label:'r1', p1:{x:px-80, y:py-20}, p2:{x:px+20, y:py+20} }); segments.push({ id:uid(), label:'s2', p1:{x:px-50, y:pz+40}, p2:{x:px+50, y:pz} }, { id:uid(), label:'s1', p1:{x:px-50, y:py}, p2:{x:px+50, y:py+40} }); title = "Hallar trazas del plano definido por las rectas paralelas r y s."; }
          else if (opts.pertSub === 'def_3p') { pts.push({ id:uid(), name: 'A', nodes: [{id:uid(), t:'2', x:px-60, y:pz, pairId:'n1A'}, {id:'n1A', t:'1', x:px-60, y:py}] }); pts.push({ id:uid(), name: 'B', nodes: [{id:uid(), t:'2', x:px, y:pz+30, pairId:'n1B'}, {id:'n1B', t:'1', x:px, y:py-20}] }); pts.push({ id:uid(), name: 'C', nodes: [{id:uid(), t:'2', x:px+70, y:pz-10, pairId:'n1C'}, {id:'n1C', t:'1', x:px+70, y:py+40}] }); title = "Hallar trazas del plano definido por los puntos A, B y C no alineados."; }
          else if (opts.pertSub === 'def_r_p') { segments.push({ id:uid(), label:'r2', p1:{x:px-80, y:pz+20}, p2:{x:px+40, y:pz-20} }, { id:uid(), label:'r1', p1:{x:px-80, y:py-20}, p2:{x:px+40, y:py+20} }); pts.push({ id:uid(), name: 'P', nodes: [{id:uid(), t:'2', x:px+60, y:pz+40, pairId:'n1P'}, {id:'n1P', t:'1', x:px+60, y:py-30}] }); title = "Hallar trazas del plano definido por la recta r y el punto P."; }
      }
    }
    else if (t === 'abatimientos') {
      dataStr = ""; let pA = genPlane('α', 'oblicuo', true, -60); planes.push(pA); let px = originX + 60; let pz = ltY - 60; let py = ltY + 70; let planoNombre = opts.abatPlano === 'ph' ? 'Horizontal' : 'Vertical';
      if (opts.abatEstado === 'proy') {
          if (opts.abatElem === 'punto') { pts.push({ id:uid(), name: 'A', nodes: [{id:uid(), t:'2', x:px, y:pz, pairId:'n1'}, {id:'n1', t:'1', x:px, y:py}] }); title = `Dadas las proyecciones del punto A, hallar su verdadera magnitud abatiendo sobre el plano ${planoNombre}.`; }
          else if (opts.abatElem === 'recta') { segments.push({ id:uid(), label:'r2', p1:{x:px-40, y:pz+20}, p2:{x:px+60, y:pz-30} }); segments.push({ id:uid(), label:'r1', p1:{x:px-40, y:py-20}, p2:{x:px+60, y:py+40} }); title = `Dadas las proyecciones de la recta r, hallar su verdadera magnitud abatiendo sobre el plano ${planoNombre}.`; }
          else { let pLen = opts.abatLados || 3; let figPts: any[] = []; for(let i=0; i<pLen; i++) { let nx = originX + (10 + i*30)*SF; let nz = ltY - (30 + rand(0,20))*SF; let ny = ltY + (20 + rand(0,20))*SF; let nn = String.fromCharCode(65+i); figPts.push({ id:uid(), name: nn, nodes: [{id:uid(), t:'2', x:nx, y:nz, pairId:'n1'+i}, {id:'n1'+i, t:'1', x:nx, y:ny}] }); } pts.push(...figPts); for(let i=0; i<pLen; i++) { let next = (i+1)%pLen; segments.push({ id:uid(), label:'', p1:{x:figPts[i].nodes[0].x, y:figPts[i].nodes[0].y}, p2:{x:figPts[next].nodes[0].x, y:figPts[next].nodes[0].y} }); segments.push({ id:uid(), label:'', p1:{x:figPts[i].nodes[1].x, y:figPts[i].nodes[1].y}, p2:{x:figPts[next].nodes[1].x, y:figPts[next].nodes[1].y} }); } title = `Dadas las proyecciones de la figura contenida en el plano α, hallar su verdadera magnitud abatiendo sobre el plano ${planoNombre}.`; }
      } else {
          let abatedTraceLabel = opts.abatPlano === 'ph' ? '(α2)' : '(α1)'; let abatedY = opts.abatPlano === 'ph' ? ltY + 120 : ltY - 120; segments.push({ id:uid(), label: abatedTraceLabel, p1: {x: pA.vX, y: ltY}, p2: {x: pA.vX + 150, y: abatedY} });
          if (opts.abatElem === 'punto') { pts.push({ id:uid(), name: '(A)', nodes: [{id:uid(), t:'', x:px, y: opts.abatPlano==='ph'?py:pz}] }); title = `Dado el punto A abatido sobre el plano ${planoNombre}, hallar sus proyecciones en α.`; }
          else if (opts.abatElem === 'recta') { segments.push({ id:uid(), label:'(r)', p1:{x:px-40, y:opts.abatPlano==='ph'?py-20:pz+20}, p2:{x:px+60, y:opts.abatPlano==='ph'?py+40:pz-30} }); title = `Dada la recta r abatida sobre el plano ${planoNombre}, hallar sus proyecciones en α.`; }
          else { let pLen = opts.abatLados || 3; let figPts: any[] = []; for(let i=0; i<pLen; i++) { let nx = originX + (10 + i*30)*SF; let ny = opts.abatPlano==='ph' ? ltY + (40 + rand(0,20))*SF : ltY - (40 + rand(0,20))*SF; let nn = String.fromCharCode(65+i); figPts.push({ id:uid(), name: `(${nn})`, nodes: [{id:uid(), t:'', x:nx, y:ny}] }); } pts.push(...figPts); for(let i=0; i<pLen; i++) { let next = (i+1)%pLen; segments.push({ id:uid(), label:'', p1:{x:figPts[i].nodes[0].x, y:figPts[i].nodes[0].y}, p2:{x:figPts[next].nodes[0].x, y:figPts[next].nodes[0].y} }); } title = `Dada la figura abatida sobre el plano ${planoNombre}, hallar sus proyecciones en α.`; }
      }
    }

    if (opts.reqPP) title += " Dibujar tercera proyección.";
    const newEx: Exercise = { id: uid(), type: t, title, w, h, dataStr, state: { ltY, originX, ppX: 750, reqRegla: opts.reqRegla, reqPP: opts.reqPP, reqOrigin: opts.reqOrigin, planes, segments, pts, bounds: { ltX1: 0, ltX2: 800, oY1: 0, oY2: 400, pY1: 0, pY2: 400 }, relations: [] } };
    newState.exercises = [...state.exercises, newEx];
    return newState;
  }),

  removeExercise: (id) => set((state) => {
    const newState = { ...state, ...pushHistory(state) };
    newState.exercises = state.exercises.filter(e => e.id !== id);
    return newState;
  }),

  updateBoxSize: (id, w, h) => set((state) => {
    const newState = { ...state, ...pushHistory(state) };
    newState.exercises = state.exercises.map(ex => ex.id === id ? { ...ex, w, h } : ex);
    return newState;
  }),

  addFreeElement: (exId, elemType) => set((state) => {
    const newState = { ...state, ...pushHistory(state) };
    newState.exercises = state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state }; let ox = s.originX; let oy = s.ltY;
      if (elemType === 'punto') { const nextL = String.fromCharCode(65 + s.pts.length); s.pts = [...s.pts, { id:uid(), name: nextL, nodes:[{id:uid(), t:'2', x:ox+50, y:oy-50, pairId:'nf1'}, {id:'nf1', t:'1', x:ox+50, y:oy+50}] }]; }
      else if (elemType === 'recta') { const nextL = String.fromCharCode(114 + Math.floor(s.segments.length / 2)); s.segments = [...s.segments, { id:uid(), label:`${nextL}2`, p1:{x:ox-50, y:oy-20}, p2:{x:ox+50, y:oy-70} }, { id:uid(), label:`${nextL}1`, p1:{x:ox-50, y:oy+30}, p2:{x:ox+50, y:oy+80} }]; }
      else if (elemType === 'plano') { const greek = ['α','β','γ','δ','ε','ζ','η']; const nextL = greek[s.planes.length % greek.length]; s.planes = [...s.planes, { id:uid(), name: nextL, type:'oblicuo', vX:ox-70, p1:{x:ox+100, y:oy+150}, p2:{x:ox+100, y:oy-150} }]; }
      return { ...ex, state: s };
    });
    return newState;
  }),

  removeElement: (exId, elemType, elemId) => set((state) => {
    const newState = { ...state, ...pushHistory(state) };
    newState.exercises = state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state };
      if (elemType === 'punto') s.pts = s.pts.filter(p => p.id !== elemId && !p.nodes.some(n=>n.id===elemId));
      else if (elemType === 'recta') s.segments = s.segments.filter(sg => sg.id !== elemId);
      else if (elemType === 'plano') s.planes = s.planes.filter(pl => pl.id !== elemId);
      return { ...ex, state: s };
    });
    return newState;
  }),

  updateName: (exId, elemType, elemId, newName) => set((state) => {
    const newState = { ...state, ...pushHistory(state) };
    newState.exercises = state.exercises.map(ex => {
      if(ex.id !== exId) return ex;
      let s = {...ex.state};
      if(elemType === 'punto') s.pts = s.pts.map(p => p.id === elemId ? {...p, name: newName} : p);
      else if(elemType === 'recta') s.segments = s.segments.map(seg => seg.id === elemId ? {...seg, label: newName} : seg);
      else if(elemType === 'plano') s.planes = s.planes.map(pl => pl.id === elemId ? {...pl, name: newName} : pl);
      return {...ex, state: s};
    });
    return newState;
  }),

  updateExerciseText: (exId, field, text) => set((state) => {
    const newState = { ...state, ...pushHistory(state) };
    newState.exercises = state.exercises.map(ex => ex.id === exId ? { ...ex, [field]: text } : ex);
    return newState;
  }),

  togglePlaneType: (exId, planeId) => set((state) => {
    const newState = { ...state, ...pushHistory(state) };
    newState.exercises = state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      return { ...ex, state: { ...ex.state, planes: ex.state.planes.map(pl => pl.id !== planeId ? pl : { ...pl, type: pl.type === 'paralelo_lt' ? 'oblicuo' : 'paralelo_lt' })}};
    });
    newState.exercises = applyConstraints(newState.exercises);
    return newState;
  }),

  toggleLineStyle: (exId, elemType, elemId) => set((state) => {
    const newState = { ...state, ...pushHistory(state) };
    newState.exercises = state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state };
      const nextStyle = (current?: string) => current === 'solid' ? 'dashed' : current === 'dashed' ? undefined : 'solid';
      if (elemType === 'recta') s.segments = s.segments.map(seg => seg.id === elemId ? { ...seg, customStyle: nextStyle(seg.customStyle) } : seg);
      else if (elemType === 'plano') s.planes = s.planes.map(pl => pl.id === elemId ? { ...pl, customStyle: nextStyle(pl.customStyle) } : pl);
      return { ...ex, state: s };
    });
    return newState;
  }),

  updateNode: (exId, ptId, nodeId, newX, newY) => set((state) => {
    const newState = { ...state, ...pushHistory(state) };
    newState.exercises = state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state };
      let thePoint = s.pts.find(p => p.id === ptId);
      let theNode = thePoint?.nodes.find(n => n.id === nodeId);
      if (theNode) {
         let dx = newX - theNode.x; let pairNode = thePoint?.nodes.find(n => n.id === theNode?.pairId);
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
      s.pts = s.pts.map(p => {
            if (p.id !== ptId) return p;
            return { ...p, nodes: p.nodes.map(n => {
                if (n.id === nodeId) return { ...n, x: newX, y: newY };
                if (n.pairId === nodeId) return { ...n, x: newX }; return n;
              }) }
      });
      return { ...ex, state: s };
    });
    newState.exercises = applyConstraints(newState.exercises);
    return newState;
  }),

  updatePlane: (exId, planeId, newVX) => set((state) => {
    const newState = { ...state, ...pushHistory(state) };
    newState.exercises = state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      return { ...ex, state: { ...ex.state, planes: ex.state.planes.map(pl => {
          if (pl.id !== planeId) return pl;
          let dx = newVX - pl.vX; return { ...pl, vX: newVX, p1: {x: pl.p1.x + dx, y: pl.p1.y}, p2: {x: pl.p2.x + dx, y: pl.p2.y} };
      }) } };
    });
    newState.exercises = applyConstraints(newState.exercises);
    return newState;
  }),

  updatePlaneEndpoint: (exId, planeId, traceNum, newX, newY) => set((state) => {
    const newState = { ...state, ...pushHistory(state) };
    newState.exercises = state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      return { ...ex, state: { ...ex.state, planes: ex.state.planes.map(pl => {
            if (pl.id !== planeId) return pl;
            if (traceNum === 1) return { ...pl, p1: { x: newX, y: newY } }; return { ...pl, p2: { x: newX, y: newY } };
      }) } };
    });
    newState.exercises = applyConstraints(newState.exercises);
    return newState;
  }),

  updateSegment: (exId, segId, pointIndex, newX, newY) => set((state) => {
    const newState = { ...state, ...pushHistory(state) };
    newState.exercises = state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      return { ...ex, state: { ...ex.state, segments: ex.state.segments.map(seg => {
            if (seg.id !== segId) return seg;
            if (pointIndex === 1) return { ...seg, p1: { x: newX, y: newY } }; return { ...seg, p2: { x: newX, y: newY } };
          }) } };
    });
    newState.exercises = applyConstraints(newState.exercises);
    return newState;
  }),

  updateSystem: (exId, target, valX, valY) => set((state) => {
    const newState = { ...state, ...pushHistory(state) };
    newState.exercises = state.exercises.map(ex => {
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
    });
    newState.exercises = applyConstraints(newState.exercises);
    return newState;
  })
}));

useStore.subscribe((state) => { localStorage.setItem('diedrico_autosave', JSON.stringify(state.exercises)); });

// ==========================================
// 2. EL MOTOR DE DIBUJO CAD (KONVA)
// ==========================================
function View2D({ ex }: { ex: Exercise }) {
  const { updateNode, updatePlane, updatePlaneEndpoint, updateSegment, updateSystem, isPrinting, selectedItems, toggleSelection } = useStore();
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
  const W = 800; const H = 400;
  const offsetX = (dim.w - W * scale) / 2;
  const offsetY = (dim.h - H * scale) / 2;

  const sc = (val: number) => val / scale;
  const getFont = (size: number, weight = "") => `${weight} ${sc(size)}px Arial`.trim();

  const handleHover = (e: any) => { e.target.moveToTop(); e.target.scale({x:1.5, y:1.5}); document.body.style.cursor='crosshair'; };
  const handleOut = (e: any) => { e.target.scale({x:1, y:1}); document.body.style.cursor='default'; };
  const handleHoverLine = () => { document.body.style.cursor='pointer'; };
  const handleOutLine = () => { document.body.style.cursor='default'; };

  const drawHaloText = (ctx: any, text: string, x: number, y: number, font = getFont(15, "bold"), align = "left") => {
    if (!text) return;
    ctx.save(); ctx.font = font; ctx.strokeStyle = "white"; ctx.lineWidth = sc(4); ctx.lineJoin = "round"; ctx.textAlign = align;
    ctx.strokeText(text, x, y); ctx.fillStyle = "black"; ctx.fillText(text, x, y); ctx.restore();
  };

  const drawScene = (ctx: any) => {
    const b = ex.state.bounds || { ltX1: 0, ltX2: 800, oY1: 0, oY2: 400, pY1: 0, pY2: 400 };
    let dynLabels: {text: string, x: number, y: number, font: string}[] = [];
    const queueLabel = (text: string, x: number, y: number, font = getFont(15, "bold")) => { dynLabels.push({text, x, y, font}); };

    const drawTrueVisibilitySegmentLocal = (seg: ExSegment, stSegments: ExSegment[], ltY: number, isVerticalProj: boolean) => {
      const isSel = selectedItems.some(i => i.id.includes(seg.id));
      if (isSel && !isPrinting) {
        ctx.beginPath(); ctx.strokeStyle = "rgba(0, 210, 255, 0.4)"; ctx.lineWidth = sc(8);
        ctx.moveTo(seg.p1.x, seg.p1.y); ctx.lineTo(seg.p2.x, seg.p2.y); ctx.stroke();
      }
      ctx.strokeStyle = "black"; ctx.lineWidth = sc(2.2);

      if (seg.customStyle === 'dashed' || (!seg.customStyle && seg.isDashed)) {
         ctx.beginPath(); ctx.setLineDash([sc(5), sc(5)]); ctx.moveTo(seg.p1.x, seg.p1.y); ctx.lineTo(seg.p2.x, seg.p2.y); ctx.stroke(); ctx.setLineDash([]);
         if (seg.label) queueLabel(seg.label, (seg.p1.x+seg.p2.x)/2, (seg.p1.y+seg.p2.y)/2); return;
      }
      if (seg.customStyle === 'solid') {
         ctx.beginPath(); ctx.setLineDash([]); ctx.moveTo(seg.p1.x, seg.p1.y); ctx.lineTo(seg.p2.x, seg.p2.y); ctx.stroke();
         if (seg.label) queueLabel(seg.label, (seg.p1.x+seg.p2.x)/2 + sc(5), (seg.p1.y+seg.p2.y)/2 - sc(5)); return;
      }

      let tVals = [0, 1];
      let prefix = seg.label.replace(/[12]/g, '');
      let otherSeg = stSegments.find(s => s.label === prefix + (isVerticalProj ? '1' : '2'));

      if (!otherSeg) { let segR2 = stSegments.find(s => s.label.includes('2')); let segR1 = stSegments.find(s => s.label.includes('1')); otherSeg = isVerticalProj ? segR1 : segR2; }

      if(!otherSeg) {
          let in1st = isVerticalProj ? (seg.p1.y < ltY) : (seg.p1.y > ltY);
          ctx.beginPath(); ctx.setLineDash(in1st ? [] : [sc(6), sc(4)]);
          ctx.moveTo(seg.p1.x, seg.p1.y); ctx.lineTo(seg.p2.x, seg.p2.y); ctx.stroke(); ctx.setLineDash([]);
          if (seg.label) queueLabel(seg.label, (seg.p1.x+seg.p2.x)/2 + sc(5), (seg.p1.y+seg.p2.y)/2 - sc(5)); return;
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
          let tMid = (tA + tB) / 2; let xMid = seg.p1.x + tMid * dx; let yMid = seg.p1.y + tMid * dy;
          let yOtherMid = 0;
          if (otherSeg) { if (Math.abs(dxOther) > 0.01) { let tOther = (xMid - otherSeg.p1.x) / dxOther; yOtherMid = otherSeg.p1.y + tOther * dyOther; } else { yOtherMid = (otherSeg.p1.y + otherSeg.p2.y) / 2; } }

          let y1 = isVerticalProj ? yOtherMid : yMid; let y2 = isVerticalProj ? yMid : yOtherMid;
          let is1stQ = (y2 < ltY) && (y1 > ltY);

          ctx.beginPath(); ctx.setLineDash(is1stQ ? [] : [sc(6), sc(4)]);
          ctx.moveTo(seg.p1.x + tA * dx, seg.p1.y + tA * dy); ctx.lineTo(seg.p1.x + tB * dx, seg.p1.y + tB * dy); ctx.stroke();
      }
      ctx.setLineDash([]);
      if (seg.label) queueLabel(seg.label, (seg.p1.x+seg.p2.x)/2 + sc(5), (seg.p1.y+seg.p2.y)/2 - sc(5));
    };

    ctx.strokeStyle = "black"; ctx.lineWidth = sc(2.2);
    ctx.beginPath(); ctx.moveTo(b.ltX1, ltY); ctx.lineTo(b.ltX2, ltY); ctx.stroke();
    ctx.lineWidth = sc(1.2); ctx.beginPath(); 
    ctx.moveTo(b.ltX1 + sc(10), ltY + sc(6)); ctx.lineTo(b.ltX1 + sc(25), ltY + sc(6)); 
    ctx.moveTo(b.ltX2 - sc(25), ltY + sc(6)); ctx.lineTo(b.ltX2 - sc(10), ltY + sc(6)); ctx.stroke();

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
    if (reqOrigin) { ctx.lineWidth = sc(2); ctx.beginPath(); ctx.moveTo(originX, ltY - sc(8)); ctx.lineTo(originX, ltY + sc(8)); ctx.stroke(); if(!reqRegla) drawHaloText(ctx, "0", originX + sc(4), ltY + sc(18), getFont(14, "italic")); }
    if (reqPP) { ctx.lineWidth = sc(1.8); ctx.setLineDash([sc(10), sc(4), sc(2), sc(4)]); ctx.beginPath(); ctx.moveTo(ppX, b.pY1); ctx.lineTo(ppX, b.pY2); ctx.stroke(); ctx.setLineDash([]); drawHaloText(ctx, "PP", ppX + sc(6), b.pY1 + sc(30), getFont(16, "bold")); }

    planes.forEach((pl: ExPlane) => {
      const isSel = selectedItems.some(i => i.id.includes(pl.id));
      if (isSel && !isPrinting) {
        ctx.beginPath(); ctx.strokeStyle = "rgba(0, 210, 255, 0.4)"; ctx.lineWidth = sc(8);
        if (pl.type === 'horizontal') { ctx.moveTo(b.ltX1, pl.p2.y); ctx.lineTo(b.ltX2, pl.p2.y); }
        else if (pl.type === 'frontal') { ctx.moveTo(b.ltX1, pl.p1.y); ctx.lineTo(b.ltX2, pl.p1.y); }
        else if (pl.type === 'paralelo_lt') { ctx.moveTo(b.ltX1, pl.p2.y); ctx.lineTo(b.ltX2, pl.p2.y); ctx.moveTo(b.ltX1, pl.p1.y); ctx.lineTo(b.ltX2, pl.p1.y); }
        else { ctx.moveTo(pl.vX, ltY); ctx.lineTo(pl.p2.x, pl.p2.y); ctx.moveTo(pl.vX, ltY); ctx.lineTo(pl.p1.x, pl.p1.y); }
        ctx.stroke();
      }

      ctx.strokeStyle = "black"; ctx.lineWidth = sc(2.2);
      const applyDash = (isAutoDashed: boolean) => { if (pl.customStyle === 'solid') ctx.setLineDash([]); else if (pl.customStyle === 'dashed') ctx.setLineDash([sc(6), sc(4)]); else ctx.setLineDash(isAutoDashed ? [sc(6), sc(4)] : []); };

      if (pl.type === 'horizontal') { applyDash(false); ctx.beginPath(); ctx.moveTo(b.ltX1, pl.p2.y); ctx.lineTo(b.ltX2, pl.p2.y); ctx.stroke(); ctx.setLineDash([]); if (pl.name) queueLabel(`${pl.name}2`, pl.p2.x, pl.p2.y - sc(10), getFont(16, "bold")); } 
      else if (pl.type === 'frontal') { applyDash(false); ctx.beginPath(); ctx.moveTo(b.ltX1, pl.p1.y); ctx.lineTo(b.ltX2, pl.p1.y); ctx.stroke(); ctx.setLineDash([]); if (pl.name) queueLabel(`${pl.name}1`, pl.p1.x, pl.p1.y + sc(20), getFont(16, "bold")); } 
      else if (pl.type === 'paralelo_lt') { applyDash(false); ctx.beginPath(); ctx.moveTo(b.ltX1, pl.p2.y); ctx.lineTo(b.ltX2, pl.p2.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(b.ltX1, pl.p1.y); ctx.lineTo(b.ltX2, pl.p1.y); ctx.stroke(); ctx.setLineDash([]); if (pl.name) queueLabel(`${pl.name}2`, pl.p2.x, pl.p2.y - sc(10), getFont(16, "bold")); if (pl.name) queueLabel(`${pl.name}1`, pl.p1.x, pl.p1.y + sc(20), getFont(16, "bold")); } 
      else { applyDash(pl.p2.y >= ltY); ctx.beginPath(); ctx.moveTo(pl.vX, ltY); ctx.lineTo(pl.p2.x, pl.p2.y); ctx.stroke(); applyDash(pl.p1.y <= ltY); ctx.beginPath(); ctx.moveTo(pl.vX, ltY); ctx.lineTo(pl.p1.x, pl.p1.y); ctx.stroke(); ctx.setLineDash([]); if (pl.name) queueLabel(`${pl.name}2`, pl.p2.x, pl.p2.y - sc(10), getFont(16, "bold")); if (pl.name) queueLabel(`${pl.name}1`, pl.p1.x, pl.p1.y + sc(20), getFont(16, "bold")); }
    });

    segments.forEach((seg: ExSegment) => { drawTrueVisibilitySegmentLocal(seg, segments, ltY, seg.label.includes('2')); });

    ctx.strokeStyle = "#888"; ctx.setLineDash([sc(5), sc(5)]); ctx.lineWidth = sc(1);
    pts.forEach((p: any) => { if(p.nodes.length === 2) { ctx.beginPath(); ctx.moveTo(p.nodes[0].x, p.nodes[0].y); ctx.lineTo(p.nodes[1].x, p.nodes[1].y); ctx.stroke(); } });
    ctx.setLineDash([]);
    
    ctx.fillStyle = "black";
    pts.forEach((p: any) => {
      p.nodes.forEach((n: ExNode) => { 
        ctx.beginPath(); ctx.strokeStyle = "black"; ctx.lineWidth = sc(1.5); let cs = sc(5);
        ctx.moveTo(n.x, n.y - cs); ctx.lineTo(n.x, n.y + cs); ctx.moveTo(n.x - cs, n.y); ctx.lineTo(n.x + cs, n.y); ctx.stroke();
        if (p.name) queueLabel(`${p.name}${n.t}`, n.x + sc(8), n.y - sc(8)); 
      });
    });

    let mergedLabels: any[] = []; let skip = new Set();
    for(let i=0; i<dynLabels.length; i++) {
        if(skip.has(i)) continue; let group = [dynLabels[i]];
        for(let j=i+1; j<dynLabels.length; j++) { if(skip.has(j)) continue; let dx = dynLabels[i].x - dynLabels[j].x; let dy = dynLabels[i].y - dynLabels[j].y; if(Math.sqrt(dx*dx + dy*dy) < sc(15)) { group.push(dynLabels[j]); skip.add(j); } }
        if(group.length > 1) { let combinedText = group.map(g => g.text).join(' ≡ '); let avgX = group.reduce((sum, g) => sum + g.x, 0) / group.length; let avgY = group.reduce((sum, g) => sum + g.y, 0) / group.length; mergedLabels.push({ text: combinedText, x: avgX, y: avgY, font: group[0].font }); } else { mergedLabels.push(dynLabels[i]); }
    }
    for(let iter=0; iter<30; iter++) {
        for(let i=0; i<mergedLabels.length; i++) {
            for(let j=i+1; j<mergedLabels.length; j++) {
                let a = mergedLabels[i]; let b = mergedLabels[j];
                ctx.font = a.font; let aW = ctx.measureText(a.text).width; ctx.font = b.font; let bW = ctx.measureText(b.text).width; let aH = sc(15); let bH = sc(15);
                let dx = a.x - b.x; let dy = a.y - b.y; let minDistX = (aW + bW)/2 + sc(8); let minDistY = (aH + bH)/2 + sc(8);
                if (Math.abs(dx) < minDistX && Math.abs(dy) < minDistY) { if (dx === 0 && dy === 0) { dx = 0.1; dy = 0.1; } let overlapX = minDistX - Math.abs(dx); let overlapY = minDistY - Math.abs(dy); if (overlapX < overlapY) { let pushX = overlapX * (dx > 0 ? 1 : -1) * 0.5; a.x += pushX; b.x -= pushX; } else { let pushY = overlapY * (dy > 0 ? 1 : -1) * 0.5; a.y += pushY; b.y -= pushY; } }
            }
        }
    }
    mergedLabels.forEach(lbl => { drawHaloText(ctx, lbl.text, lbl.x, lbl.y, lbl.font); });
  };

  const handleEntityClick = (e: any) => {
    e.cancelBubble = true;
    if (isPrinting) return;
    let rId = e.target.attrs.id;
    if (rId.includes('_')) rId = rId.split('_')[1];
    
    let label = e.target.attrs.name;
    if (label.includes('Extremo') || label.includes('Recta')) label = 'Recta ' + label.replace(/Extremo |Recta | \(.*/g, '').replace(/[12]/g, '');
    else if (label.includes('Traza') || label.includes('Plano')) label = 'Plano ' + label.replace(/Traza |Plano | Horizontal | Frontal | Oblicuo /g, '').replace(/[12]/g, '');
    else if (label.includes('Punto')) label = 'Punto ' + label.replace(/Punto /, '').replace(/[12]/g, '');

    let type: 'recta' | 'plano' | 'punto' = 'punto';
    if (e.target.attrs.id.startsWith('pl')) type = 'plano';
    else if (e.target.attrs.id.startsWith('seg')) type = 'recta';
    
    toggleSelection({ exId: ex.id, id: rId, label: label.trim(), type }, e.evt.shiftKey);
  };

  return (
    <div style={{width: '100%', height: '100%', position: 'relative', overflow: 'hidden'}}>
      <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
        <Stage width={dim.w} height={dim.h} 
               onClick={(e)=>{ if(e.evt.button===0 && e.target === e.target.getStage()) { useStore.getState().clearSelection(); }}}>
          <Layer scaleX={scale} scaleY={scale} x={offsetX} y={offsetY}>
            <Shape sceneFunc={drawScene} />
            
            <Group visible={!isPrinting}>
              {segments.map(seg => (
                <Line key={`hit_seg_${seg.id}`} id={`segHit_${seg.id}`} name={`Recta ${seg.label}`} points={[seg.p1.x, seg.p1.y, seg.p2.x, seg.p2.y]} stroke="transparent" strokeWidth={sc(30)} onMouseEnter={handleHoverLine} onMouseLeave={handleOutLine} onClick={handleEntityClick} listening={true} />
              ))}

              {planes.map(pl => {
                const hitProps = { stroke: "transparent", strokeWidth: sc(30), onMouseEnter: handleHoverLine, onMouseLeave: handleOutLine, onClick: handleEntityClick, listening: true };
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

              <Circle id="sys_lt1" name="Extremo Izq LT" x={b.ltX1} y={ltY} radius={sc(8)} fill="rgba(0,0,0,0.2)" draggable dragBoundFunc={(p)=>({x:p.x, y:ltY})} onDragMove={(e) => updateSystem(ex.id, 'lt1', e.target.x(), 0)} onMouseEnter={handleHover} onMouseLeave={handleOut} />
              <Circle id="sys_lt2" name="Extremo Der LT" x={b.ltX2} y={ltY} radius={sc(8)} fill="rgba(0,0,0,0.2)" draggable dragBoundFunc={(p)=>({x:p.x, y:ltY})} onDragMove={(e) => updateSystem(ex.id, 'lt2', e.target.x(), 0)} onMouseEnter={handleHover} onMouseLeave={handleOut} />
              {reqOrigin && <Circle id="sys_origin" name="Origen (0)" x={originX} y={ltY} radius={sc(18)} fill="rgba(255,200,0,0.4)" draggable onDragMove={(e) => updateSystem(ex.id, 'origin', e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} />}
              
              {reqRegla && (
                <React.Fragment>
                  <Circle id="sys_o1" name="Extremo Sup Eje" x={originX} y={b.oY1} radius={sc(8)} fill="rgba(0,0,0,0.2)" draggable dragBoundFunc={(p)=>({x:originX, y:p.y})} onDragMove={(e) => updateSystem(ex.id, 'o1', 0, e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} />
                  <Circle id="sys_o2" name="Extremo Inf Eje" x={originX} y={b.oY2} radius={sc(8)} fill="rgba(0,0,0,0.2)" draggable dragBoundFunc={(p)=>({x:originX, y:p.y})} onDragMove={(e) => updateSystem(ex.id, 'o2', 0, e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} />
                </React.Fragment>
              )}

              {reqPP && (
                <React.Fragment>
                  <Circle id="sys_pp" name="Plano de Perfil" x={ppX} y={ltY} radius={sc(12)} fill="rgba(200,100,200,0.3)" draggable dragBoundFunc={(p)=>({x:p.x, y:ltY})} onDragMove={(e) => updateSystem(ex.id, 'pp', e.target.x(), 0)} onMouseEnter={handleHover} onMouseLeave={handleOut} />
                  <Circle id="sys_p1" name="Extremo Sup PP" x={ppX} y={b.pY1} radius={sc(8)} fill="rgba(0,0,0,0.2)" draggable dragBoundFunc={(p)=>({x:ppX, y:p.y})} onDragMove={(e) => updateSystem(ex.id, 'p1', 0, e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} />
                  <Circle id="sys_p2" name="Extremo Inf PP" x={ppX} y={b.pY2} radius={sc(8)} fill="rgba(0,0,0,0.2)" draggable dragBoundFunc={(p)=>({x:ppX, y:p.y})} onDragMove={(e) => updateSystem(ex.id, 'p2', 0, e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} />
                </React.Fragment>
              )}

              {planes.map(pl => {
                if (pl.type === 'horizontal') return <Circle key={pl.id} id={`pl2_${pl.id}`} name={`Plano Horizontal ${pl.name}`} x={pl.p2.x} y={pl.p2.y} radius={sc(12)} fill="rgba(0,150,255,0.4)" draggable onDragMove={e=>updatePlaneEndpoint(ex.id, pl.id, 2, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={handleEntityClick} />;
                if (pl.type === 'frontal') return <Circle key={pl.id} id={`pl1_${pl.id}`} name={`Plano Frontal ${pl.name}`} x={pl.p1.x} y={pl.p1.y} radius={sc(12)} fill="rgba(0,150,255,0.4)" draggable onDragMove={e=>updatePlaneEndpoint(ex.id, pl.id, 1, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={handleEntityClick} />;
                if (pl.type === 'paralelo_lt') return <React.Fragment key={pl.id}><Circle id={`pl2_${pl.id}`} name={`Traza ${pl.name}2`} x={pl.p2.x} y={pl.p2.y} radius={sc(12)} fill="rgba(0,150,255,0.4)" draggable onDragMove={e=>updatePlaneEndpoint(ex.id, pl.id, 2, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={handleEntityClick}/><Circle id={`pl1_${pl.id}`} name={`Traza ${pl.name}1`} x={pl.p1.x} y={pl.p1.y} radius={sc(12)} fill="rgba(0,150,255,0.4)" draggable onDragMove={e=>updatePlaneEndpoint(ex.id, pl.id, 1, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={handleEntityClick} /></React.Fragment>;
                return (
                  <React.Fragment key={pl.id}>
                    <Circle id={`pl_${pl.id}`} name={`Plano Oblicuo ${pl.name}`} x={pl.vX} y={ltY} radius={sc(15)} fill="rgba(0, 150, 255, 0.4)" draggable dragBoundFunc={(pos) => ({ x: pos.x, y: ltY })} onDragMove={(e) => updatePlane(ex.id, pl.id, e.target.x())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={handleEntityClick} />
                    <Circle id={`pl2_${pl.id}`} name={`Traza ${pl.name}2`} x={pl.p2.x} y={pl.p2.y} radius={sc(12)} fill="rgba(0, 150, 255, 0.4)" draggable onDragMove={e => updatePlaneEndpoint(ex.id, pl.id, 2, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={handleEntityClick} />
                    <Circle id={`pl1_${pl.id}`} name={`Traza ${pl.name}1`} x={pl.p1.x} y={pl.p1.y} radius={sc(12)} fill="rgba(0, 150, 255, 0.4)" draggable onDragMove={e => updatePlaneEndpoint(ex.id, pl.id, 1, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={handleEntityClick} />
                  </React.Fragment>
                );
              })}

              {segments.map(seg => (
                <React.Fragment key={seg.id}>
                  {!seg.isDashed && <><Circle id={`seg1_${seg.id}`} name={`Extremo ${seg.label} (Inicio)`} x={seg.p1.x} y={seg.p1.y} radius={sc(10)} fill="rgba(255, 100, 100, 0.4)" draggable onDragMove={(e) => updateSegment(ex.id, seg.id, 1, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={handleEntityClick} />
                  <Circle id={`seg2_${seg.id}`} name={`Extremo ${seg.label} (Fin)`} x={seg.p2.x} y={seg.p2.y} radius={sc(10)} fill="rgba(255, 100, 100, 0.4)" draggable onDragMove={(e) => updateSegment(ex.id, seg.id, 2, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={handleEntityClick} /></>}
                </React.Fragment>
              ))}
              {pts.map(p => p.nodes.map(n => (
                <Circle key={n.id} id={`pt_${n.id}`} name={`Punto ${p.name}${n.t}`} x={n.x} y={n.y} radius={sc(12)} fill="rgba(255, 71, 87, 0.4)" draggable onDragMove={(e) => updateNode(ex.id, p.id, n.id, e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} onClick={handleEntityClick} />
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
    pageSize, fontFamily, fontSize, setPageConfig,
    zoom, setZoom, past, future, undo, redo,
    selectedItems, toggleLineStyle, togglePlaneType, updateName, removeElement, clearSelection, addRelation, removeRelation
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
    useStore.getState().setPrinting(true);
    setTimeout(() => { window.print(); useStore.getState().setPrinting(false); }, 300);
  };

  const paginatedExercises = useMemo(() => {
    let pages: Exercise[][] = []; 
    let currPage: Exercise[] = [];
    let currY = 0; let rowH = 0; let rowW = 0;
    
    exercises.forEach(ex => {
      let hVal = parseInt(ex.h) || 136; let wVal = parseFloat(ex.w) || 50;
      const MAX_H = pages.length === 0 ? 275 : 305; 
      if (rowW + wVal <= 101) { rowW += wVal; rowH = Math.max(rowH, hVal); } else { currY += rowH; rowW = wVal; rowH = hVal; }
      if (currY + rowH > MAX_H && currPage.length > 0) { pages.push(currPage); currPage = []; currY = 0; rowW = wVal; rowH = hVal; }
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
        body { margin: 0; font-family: 'Segoe UI', sans-serif; background-color: #121212; color: #e0e0e0; overflow: hidden; }
        
        /* Layout Principal */
        .app-layout { display: flex; flex-direction: row; height: 100vh; overflow: hidden; }
        
        /* Barra Superior Undo/Redo */
        .top-toolbar { position: absolute; top: 0; left: 300px; right: 280px; height: 50px; background: #18181b; border-bottom: 1px solid #333; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; z-index: 50; box-shadow: 0 2px 10px rgba(0,0,0,0.5); }
        .top-btn { background: transparent; border: 1px solid #444; color: #fff; padding: 6px 12px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: bold; transition: all 0.2s; }
        .top-btn:hover:not(:disabled) { background: #333; border-color: #00d2ff; }
        .top-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        
        .zoom-ctrl { display: flex; align-items: center; gap: 10px; color: #aaa; font-weight: bold; }
        .zoom-slider { accent-color: #00d2ff; }

        /* Área central con cuadricula CAD */
        .main-area { flex: 1; margin-top: 50px; background-color: #1a1a1f; background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px); background-size: 20px 20px; overflow: auto; position: relative; }
        .sheet-container { display: flex; flex-direction: column; gap: 40px; padding: 30px; align-items: center; transform-origin: top center; transition: transform 0.2s ease; }
        
        /* Hoja y Ejercicios */
        .page-sheet { background: white; width: ${PAGE_W}; min-height: 297mm; padding: 3mm; color: black; box-sizing: border-box; break-inside: avoid; margin-bottom: 20px; display: flex; flex-direction: column; overflow: hidden; transition: width 0.3s ease; box-shadow: 0 10px 40px rgba(0,0,0,0.6); }
        
        .page-border { border: 2px solid black; flex-grow: 1; display: flex; flex-direction: column; box-sizing: border-box; background: white; position: relative; overflow: hidden; }
        .cajetin { width: ${pageSize === 'A3' ? '204mm' : '100%'}; border-right: ${pageSize === 'A3' ? '2px solid black' : 'none'}; border-bottom: 2px solid black; box-sizing: border-box; flex-shrink: 0; z-index: 10; background: white; transition: width 0.3s ease; }
        .cajetin-top { display: flex; justify-content: space-between; padding: 5px 12px; border-bottom: 1px solid black; font-size: 0.8rem; font-weight: bold; }
        .cajetin-bottom { display: flex; gap: 20px; padding: 10px 12px; font-weight: bold; }
        
        .exercises-grid { flex-grow: 1; display: flex; flex-wrap: wrap; align-content: flex-start; align-items: stretch; width: 100%; }
        .exercise-box { display: flex; flex-direction: column; position: relative; break-inside: avoid; box-sizing: border-box; border-right: 1.5px solid black; border-bottom: 1.5px solid black; background: white; overflow: hidden; }
        
        .exercise-title { padding: 6px 10px; background: #f8f9fa; border-bottom: 1.5px solid black; font-weight: bold; word-wrap: break-word; line-height: 1.3; font-family: ${fontFamily}; font-size: ${fontSize}px; text-align: justify; }
        .exercise-data { font-family: ${fontFamily}; font-size: ${fontSize - 1}px; padding: 4px 10px; border-bottom: 1.5px dashed #ccc; font-weight: bold; outline: none; line-height: 1.3; word-wrap: break-word; text-align: justify; }
        .btn-mini { background: #2ed573; border: none; font-weight: bold; cursor: pointer; border-radius: 4px; }
        
        .side-handle-r { position: absolute; right: -5px; top: 0; bottom: 0; width: 15px; cursor: ew-resize; z-index: 15; background: rgba(0,0,0,0.01); transition: background 0.2s; touch-action: none; }
        .side-handle-r:hover, .side-handle-r:active { background: rgba(0, 210, 255, 0.4); }
        .side-handle-b { position: absolute; left: 0; right: 0; bottom: -5px; height: 15px; cursor: ns-resize; z-index: 15; background: rgba(0,0,0,0.01); transition: background 0.2s; touch-action: none; }
        .side-handle-b:hover, .side-handle-b:active { background: rgba(0, 210, 255, 0.4); }
        
        @media print { 
          body, html { background: white; height: auto !important; overflow: visible !important; } 
          .app-layout, .main-area { height: auto !important; overflow: visible !important; display: block !important; margin: 0; }
          .no-print, .top-toolbar { display: none !important; } 
          .sheet-container { padding: 0 !important; gap: 0 !important; height: auto !important; overflow: visible !important; display: block !important; zoom: 1 !important; transform: none !important; } 
          
          @page { size: ${pageSize === 'A3' ? 'A3 landscape' : 'A4 portrait'}; margin: 0; }
          .page-sheet { box-shadow: none; margin: 0; padding: 3mm; page-break-after: always; display: flex; flex-direction: column; border: none; width: ${PAGE_W}; height: 297mm; } 
          
          .page-border { border: 2px solid black; flex-grow: 1; display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden; position: relative; }
          .exercises-grid { flex-grow: 1; display: flex; flex-wrap: wrap; align-content: flex-start; align-items: stretch; width: 100%; }
          .exercise-box { resize: none; overflow: hidden; border-right: 1.5px solid black; border-bottom: 1.5px solid black; } 
        }
      `}</style>
      
      <div className="app-layout">
        {/* === BARRA IZQUIERDA (CONFIGURACIÓN) === */}
        <div className="sidebar no-print" style={{ width: '300px', background: '#1e1e24', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto', zIndex: 100, borderRight: '1px solid #333', flexShrink: 0 }}>
          <h2 style={{ color: '#00d2ff', margin: 0, textTransform:'uppercase', letterSpacing:'1px', fontSize:'1.2rem' }}>Generador CAD</h2>
          
          <div style={{ background: '#25252b', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
            <label style={{ color: '#00d2ff', fontWeight: 'bold', fontSize:'0.85em', textTransform:'uppercase' }}>Configuración de Página</label>
            <select value={pageSize} onChange={e => setPageConfig({pageSize: e.target.value as 'A4'|'A3'})} style={{ width: '100%', padding: '8px', marginTop: '5px', background: '#1e1e24', color: 'white', border: '1px solid #444', borderRadius: '4px', marginBottom: '10px' }}>
              <option value="A4">A4 (Vertical)</option><option value="A3">A3 (Horizontal)</option>
            </select>

            <label style={{ color: '#00d2ff', fontWeight: 'bold', fontSize:'0.85em', textTransform:'uppercase' }}>Fuente (Letra)</label>
            <select value={fontFamily} onChange={e => setPageConfig({fontFamily: e.target.value})} style={{ width: '100%', padding: '8px', marginTop: '5px', background: '#1e1e24', color: 'white', border: '1px solid #444', borderRadius: '4px', marginBottom: '10px' }}>
              <option value="'Segoe UI', sans-serif">Segoe UI</option><option value="Arial, sans-serif">Arial</option><option value="'Times New Roman', serif">Times New Roman</option><option value="'Courier New', monospace">Courier New</option>
            </select>

            <label style={{ color: '#00d2ff', fontWeight: 'bold', fontSize:'0.85em', textTransform:'uppercase' }}>Tamaño Letra ({fontSize}px)</label>
            <input type="range" min="10" max="24" value={fontSize} onChange={e => setPageConfig({fontSize: Number(e.target.value)})} style={{ width: '100%', marginTop: '5px', marginBottom: '15px' }} />
            
            <hr style={{ border: 'none', borderTop: '1px solid #444', margin: '15px 0' }} />

            <label style={{ color: '#00d2ff', fontWeight: 'bold', fontSize:'0.85em', textTransform:'uppercase' }}>Añadir Ejercicio</label>
            <select value={type} onChange={e => setType(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px', background: '#1e1e24', color: 'white', border: '1px solid #444', fontWeight: 'bold' }}>
              <option value="punto_coord">1. Puntos</option><option value="rectas">2. Rectas</option><option value="plano_coord">3. Planos</option>
              <option value="intersecciones">4. Intersecciones</option><option value="paralelismo">5. Paralelismo</option>
              <option value="perpendicularidad">6. Perpendicularidad</option><option value="pertenencias">7. Pertenencias</option>
              <option value="abatimientos">8. Abatimientos</option>
            </select>

            {/* Opciones Condicionales... */}
            {type === 'punto_coord' && (<div style={{marginTop: '10px'}}><label style={{fontSize:'0.85em'}}>Nº Puntos:</label><input type="number" value={ptCount} onChange={e=>setPtCount(Number(e.target.value))} min="1" max="10" style={{width:'100%', padding:'8px', background: '#1e1e24', color:'white', border:'1px solid #444'}} /></div>)}
            {type === 'rectas' && (
              <div style={{marginTop: '10px'}}>
                <label style={{fontSize:'0.85em'}}>Método:</label><select value={lineMethod} onChange={e=>setLineMethod(e.target.value)} style={{width:'100%', padding:'8px', background: '#1e1e24', color:'white', border:'1px solid #444', marginBottom:'5px'}}><option value="coord">Por Coordenadas</option><option value="puntos">Por Puntos Dibujados</option><option value="proy">Por Proyecciones</option></select>
                <label style={{fontSize:'0.85em'}}>Tipo:</label><select value={lineType} onChange={e=>setLineType(e.target.value)} style={{width:'100%', padding:'8px', background: '#1e1e24', color:'white', border:'1px solid #444'}}><option value="cualquiera">Aleatoria</option><option value="horizontal">Horizontal</option><option value="frontal">Frontal</option><option value="vertical">Vertical</option><option value="punta">Punta</option><option value="perfil">Perfil</option><option value="paralela_lt">Paralela LT</option><option value="incidente_lt">Incidente LT</option><option value="contenida_pv">Contenida PV</option><option value="contenida_ph">Contenida PH</option></select>
              </div>
            )}
            {type === 'plano_coord' && (<div style={{marginTop: '10px'}}><label style={{fontSize:'0.85em'}}>Tipo Plano:</label><select value={planeType} onChange={e=>setPlaneType(e.target.value)} style={{width:'100%', padding:'8px', background: '#1e1e24', color:'white', border:'1px solid #444'}}><option value="oblicuo">Oblicuo</option><option value="proy_vert">Proy. Vertical</option><option value="proy_horiz">Proy. Horizontal</option><option value="perfil">Perfil</option><option value="horizontal">Horizontal</option><option value="frontal">Frontal</option><option value="paralelo_lt">Paralelo a LT</option></select></div>)}
            {(type === 'rectas' || type === 'plano_coord') && (
              <div style={{marginTop: '10px'}}>
                <label style={{fontSize:'0.85em'}}>Cuadrante 1:</label><select value={quadA} onChange={e=>setQuadA(e.target.value)} style={{width:'100%', padding:'8px', background: '#1e1e24', color:'white', border:'1px solid #444', marginBottom:'5px'}}><option value="any">Aleatorio</option><option value="1">I Cuadrante</option><option value="2">II Cuadrante</option><option value="3">III Cuadrante</option><option value="4">IV Cuadrante</option></select>
                {type !== 'plano_coord' && <><label style={{fontSize:'0.85em'}}>Cuadrante 2:</label><select value={quadB} onChange={e=>setQuadB(e.target.value)} style={{width:'100%', padding:'8px', background: '#1e1e24', color:'white', border:'1px solid #444'}}><option value="any">Aleatorio</option><option value="1">I Cuadrante</option><option value="2">II Cuadrante</option><option value="3">III Cuadrante</option><option value="4">IV Cuadrante</option></select></>}
              </div>
            )}
            {type === 'intersecciones' && (
              <div style={{marginTop: '10px'}}>
                <label style={{fontSize:'0.85em'}}>Caso:</label><select value={intSub} onChange={e=>setIntSub(e.target.value)} style={{width:'100%', padding:'8px', background: '#1e1e24', color:'white', border:'1px solid #444', marginBottom:'5px'}}><option value="todas">Todas las trazas cortan</option><option value="paralelas">Trazas paralelas</option><option value="no_existe">Traza no existe</option><option value="paralelas_lt">Todas paralelas a LT</option></select>
                <label style={{fontSize:'0.85em'}}>Plano 1:</label><select value={intP1} onChange={e=>setIntP1(e.target.value)} style={{width:'100%', padding:'8px', background: '#1e1e24', color:'white', border:'1px solid #444', marginBottom:'5px'}}><option value="oblicuo">Oblicuo</option><option value="proy_vert">Proy. Vertical</option><option value="proy_horiz">Proy. Horizontal</option><option value="perfil">Perfil</option><option value="horizontal">Horizontal</option><option value="frontal">Frontal</option><option value="paralelo_lt">Paralelo LT</option></select>
                <label style={{fontSize:'0.85em'}}>Plano 2:</label><select value={intP2} onChange={e=>setIntP2(e.target.value)} style={{width:'100%', padding:'8px', background: '#1e1e24', color:'white', border:'1px solid #444'}}><option value="oblicuo">Oblicuo</option><option value="proy_vert">Proy. Vertical</option><option value="proy_horiz">Proy. Horizontal</option><option value="perfil">Perfil</option><option value="horizontal">Horizontal</option><option value="frontal">Frontal</option><option value="paralelo_lt">Paralelo LT</option></select>
              </div>
            )}
            {type === 'paralelismo' && (<div style={{marginTop: '10px'}}><label style={{fontSize:'0.85em'}}>Caso:</label><select value={paraSub} onChange={e=>setParaSub(e.target.value)} style={{width:'100%', padding:'8px', background: '#1e1e24', color:'white', border:'1px solid #444'}}><option value="r_r_pto">Recta // Recta por pto</option><option value="p_p_pto">Plano // Plano por pto</option><option value="r_p_pto_corte">Recta // Plano (corta a r)</option><option value="p_r_pto">Plano // Recta por pto</option><option value="p_r_cont_r">Plano // Recta (contiene s)</option><option value="p_2r_cortan">Plano // a 2 rectas que cortan</option></select></div>)}
            {type === 'perpendicularidad' && (<div style={{marginTop: '10px'}}><label style={{fontSize:'0.85em'}}>Caso:</label><select value={perpSub} onChange={e=>setPerpSub(e.target.value)} style={{width:'100%', padding:'8px', background: '#1e1e24', color:'white', border:'1px solid #444'}}><option value="r_p_pto">Recta ⊥ Plano por pto</option><option value="p_r_pto">Plano ⊥ Recta por pto</option><option value="p_p_pto">Plano ⊥ Plano por pto</option><option value="p_p_r">Plano ⊥ Plano por recta</option><option value="r_r_ext">Recta ⊥ Recta por pto ext</option><option value="r_r">Recta ⊥ Recta</option></select></div>)}
            {type === 'pertenencias' && (
              <div style={{marginTop: '10px'}}>
                <label style={{fontSize:'0.85em'}}>Caso:</label><select value={pertSub} onChange={e=>setPertSub(e.target.value)} style={{width:'100%', padding:'8px', background: '#1e1e24', color:'white', border:'1px solid #444', marginBottom:'5px'}}><option value="max_pend">Recta Máxima Pendiente</option><option value="max_inc">Recta Máxima Inclinación</option><option value="horiz">Recta Horizontal contenida</option><option value="front">Recta Frontal contenida</option><option value="def_2r_c">Plano: 2 rectas se cortan</option><option value="def_2r_p">Plano: 2 rectas paralelas</option><option value="def_3p">Plano: 3 puntos</option><option value="def_r_p">Plano: recta y punto</option></select>
                <label style={{fontSize:'0.85em'}}>Plano Base:</label><select value={pertPlaneType} onChange={e=>setPertPlaneType(e.target.value)} style={{width:'100%', padding:'8px', background: '#1e1e24', color:'white', border:'1px solid #444'}}><option value="oblicuo">Oblicuo</option><option value="proy_vert">Proyectante Vertical</option><option value="proy_horiz">Proyectante Horizontal</option></select>
              </div>
            )}
            {type === 'abatimientos' && (
              <div style={{marginTop: '10px'}}>
                <label style={{fontSize:'0.85em'}}>Elemento:</label><select value={abatElem} onChange={e=>setAbatElem(e.target.value)} style={{width:'100%', padding:'8px', background: '#1e1e24', color:'white', border:'1px solid #444', marginBottom:'5px'}}><option value="punto">Punto</option><option value="recta">Recta</option><option value="fig_reg">Figura Regular</option><option value="fig_irreg">Figura Irregular</option></select>
                {(abatElem === 'fig_reg' || abatElem === 'fig_irreg') && ( <div style={{marginTop:'5px'}}><label style={{fontSize:'0.85em'}}>Nº Lados:</label><input type="number" value={abatLados} onChange={e=>setAbatLados(Number(e.target.value))} min="3" max="10" style={{width:'100%', padding:'8px', background: '#1e1e24', color:'white', border:'1px solid #444', marginBottom:'5px'}} /></div> )}
                <label style={{fontSize:'0.85em'}}>Estado:</label><select value={abatEstado} onChange={e=>setAbatEstado(e.target.value)} style={{width:'100%', padding:'8px', background: '#1e1e24', color:'white', border:'1px solid #444', marginBottom:'5px'}}><option value="proy">Proyecciones (Encontrar V.M)</option><option value="vm">Verdadera Magnitud (Desabatir)</option></select>
                <label style={{fontSize:'0.85em'}}>Abatir sobre:</label><select value={abatPlano} onChange={e=>setAbatPlano(e.target.value)} style={{width:'100%', padding:'8px', background: '#1e1e24', color:'white', border:'1px solid #444'}}><option value="ph">PH</option><option value="pv">PV</option></select>
              </div>
            )}

            <div style={{marginTop: '15px', display:'flex', flexDirection:'column', gap:'6px'}}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><input type="checkbox" checked={reqOrigin} onChange={e=>setReqOrigin(e.target.checked)} /> <span style={{fontSize:'0.85em', color:'#aaa'}}>Mostrar Origen (0)</span></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><input type="checkbox" checked={reqPP} onChange={e=>setReqPP(e.target.checked)} /> <span style={{fontSize:'0.85em', color:'#aaa'}}>3ª Proyección (PP)</span></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><input type="checkbox" checked={reqRegla} onChange={e=>setReqRegla(e.target.checked)} /> <span style={{fontSize:'0.85em', color:'#aaa'}}>Regla Milimetrada</span></label>
            </div>
            
            <button onClick={handleAdd} style={{ width: '100%', marginTop: '15px', padding: '12px', background: '#00d2ff', color: '#000', border: 'none', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px' }}>+ Generar Ejercicio</button>
          </div>
          
          <div style={{display: 'flex', gap: '5px', marginTop: 'auto'}}>
            <button onClick={saveData} style={{ flex: 1, background: '#25252b', color:'#fff', padding: '8px', border: '1px solid #444', cursor: 'pointer', borderRadius: '4px' }}>💾 Guardar</button>
            <button onClick={loadData} style={{ flex: 1, background: '#25252b', color:'#fff', padding: '8px', border: '1px solid #444', cursor: 'pointer', borderRadius: '4px' }}>📂 Cargar</button>
          </div>
          <div style={{display: 'flex', gap: '5px', marginTop: '5px'}}>
            <button onClick={useStore.getState().downloadData} style={{ flex: 1, background: '#25252b', color:'#fff', padding: '8px', border: '1px solid #444', cursor: 'pointer', borderRadius: '4px' }}>⬇️ Exportar</button>
            <label style={{ flex: 1, background: '#25252b', color:'#fff', padding: '8px', border: '1px solid #444', cursor: 'pointer', borderRadius: '4px', textAlign: 'center' }}>
              <input type="file" accept=".json" style={{display:'none'}} onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => { try { useStore.setState({ exercises: JSON.parse(ev.target?.result as string) }); } catch(err) { alert("Archivo inválido"); } }; r.readAsText(f); e.target.value = ''; }} /> 📁 Importar
            </label>
          </div>
          <button onClick={handlePrint} style={{ background: '#2ed573', color: '#000', padding: '12px', border: 'none', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px', marginTop: '5px' }}>🖨️ Imprimir Lámina</button>
        </div>

        {/* === ÁREA CENTRAL (PIZARRA) === */}
        <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          <div className="top-toolbar">
            <div style={{display:'flex', gap:'10px'}}>
              <button className="top-btn" onClick={undo} disabled={past.length===0} title="Deshacer (Ctrl+Z)">↩️ Deshacer</button>
              <button className="top-btn" onClick={redo} disabled={future.length===0} title="Rehacer (Ctrl+Y)">↪️ Rehacer</button>
            </div>
            <div className="zoom-ctrl">
              🔍 Zoom: 
              <input type="range" className="zoom-slider" min="30" max="150" value={zoom} onChange={e=>setZoom(Number(e.target.value))} />
              <span>{zoom}%</span>
            </div>
          </div>

          <div className="main-area">
            <div className="sheet-container" style={{ transform: `scale(${zoom/100})` }}>
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
                                const dX = (evt.clientX - startX) / (zoom/100);
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
                                const newH = Math.max(50, startH + ((evt.clientY - startY)/(zoom/100)) * 0.264583);
                                rowItems.forEach(item => { useStore.getState().updateBoxSize(item.id, item.w, newH + 'mm'); });
                              };
                              const cleanup = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', cleanup); };
                              window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', cleanup);
                          }} />

                          <div className="exercise-title" style={{ paddingRight: '30px', display: 'flex', gap: '4px' }}>
                            <span contentEditable={false}><b>{exercises.findIndex(e => e.id === ex.id) + 1}.</b></span>
                            <span contentEditable suppressContentEditableWarning style={{ flex: 1, outline: 'none' }} onBlur={e => useStore.getState().updateExerciseText(ex.id, 'title', e.currentTarget.innerText)}>{ex.title}</span>
                          </div>
                          {ex.dataStr && <div className="exercise-data" contentEditable suppressContentEditableWarning onBlur={e => useStore.getState().updateExerciseText(ex.id, 'dataStr', e.currentTarget.innerText)}>{ex.dataStr}</div>}
                          
                          <div className="no-print" style={{ display: 'flex', gap: '5px', padding: '4px 10px', background: '#f8f9fa', borderBottom: '1.5px solid #eaeaea' }}>
                            <button className="btn-mini" style={{ padding: '2px 6px', fontSize: '0.65rem' }} onClick={() => addFreeElement(ex.id, 'punto')}>+ Pto</button>
                            <button className="btn-mini" style={{ padding: '2px 6px', fontSize: '0.65rem' }} onClick={() => addFreeElement(ex.id, 'recta')}>+ Rct</button>
                            <button className="btn-mini" style={{ padding: '2px 6px', fontSize: '0.65rem' }} onClick={() => addFreeElement(ex.id, 'plano')}>+ Pln</button>
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

        {/* === BARRA DERECHA (INSPECTOR DE PROPIEDADES) === */}
        <div className="sidebar no-print" style={{ width: '280px', background: '#1e1e24', borderLeft: '1px solid #333', padding: '20px', display: 'flex', flexDirection: 'column', overflowY: 'auto', zIndex: 100, flexShrink: 0 }}>
          <h3 style={{ color: '#fff', marginTop: 0, fontSize: '1rem', borderBottom: '1px solid #444', paddingBottom: '10px' }}>🖱️ Inspector / Selección</h3>
          
          {selectedItems.length === 0 ? (
            <div style={{ color: '#888', fontSize: '0.9em', textAlign: 'center', marginTop: '30px' }}>
              <p>Haz clic en cualquier recta o plano en el papel para seleccionarlo y editarlo.</p>
              <p><i>Usa <b>Shift + Clic</b> para seleccionar dos elementos y aplicar restricciones.</i></p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {/* LISTA DE ELEMENTOS SELECCIONADOS */}
              <div style={{ background: '#25252b', padding: '10px', borderRadius: '5px', border: '1px solid #444' }}>
                <div style={{ fontSize: '0.75em', color: '#00d2ff', textTransform: 'uppercase', marginBottom: '8px', fontWeight:'bold' }}>Elementos Activos:</div>
                {selectedItems.map((item, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#1e1e24', padding:'6px', marginBottom:'5px', borderRadius:'3px' }}>
                    <span style={{color:'#fff', fontWeight:'bold', fontSize:'0.9em'}}>{item.label}</span>
                    <button onClick={() => toggleSelection(item, true)} style={{background:'transparent', border:'none', color:'#ff4757', cursor:'pointer'}} title="Quitar selección">❌</button>
                  </div>
                ))}
                <button onClick={clearSelection} style={{ width:'100%', background:'transparent', border:'1px dashed #555', color:'#aaa', padding:'5px', marginTop:'5px', cursor:'pointer', borderRadius:'3px' }}>Limpiar Selección</button>
              </div>

              {/* RESTRICCIONES MATEMÁTICAS (Si hay 2 elementos del mismo ejercicio) */}
              {selectedItems.length === 2 && selectedItems[0].exId === selectedItems[1].exId && (
                <div style={{ background: '#25252b', padding: '10px', borderRadius: '5px', border: '1px solid #00d2ff' }}>
                   <div style={{ fontSize: '0.75em', color: '#00d2ff', textTransform: 'uppercase', marginBottom: '8px', fontWeight:'bold' }}>🔗 Restricciones</div>
                   <button onClick={() => { addRelation(selectedItems[0].exId, selectedItems[0].id, selectedItems[1].id, 'para'); clearSelection(); }} style={{ width:'100%', background:'#00d2ff', color:'#000', padding:'8px', border:'none', fontWeight:'bold', borderRadius:'3px', marginBottom:'5px', cursor:'pointer' }}>|| Hacer Paralelos</button>
                   <button onClick={() => { addRelation(selectedItems[0].exId, selectedItems[0].id, selectedItems[1].id, 'perp'); clearSelection(); }} style={{ width:'100%', background:'#ff9ff3', color:'#000', padding:'8px', border:'none', fontWeight:'bold', borderRadius:'3px', cursor:'pointer' }}>⟂ Hacer Perpendiculares</button>
                   <p style={{fontSize:'0.75em', color:'#aaa', margin:'5px 0 0 0'}}>El elemento "{selectedItems[1].label}" rotará para ajustarse al primero.</p>
                </div>
              )}

              {/* HERRAMIENTAS INDIVIDUALES */}
              {selectedItems.length === 1 && (
                <div style={{ background: '#25252b', padding: '10px', borderRadius: '5px', border: '1px solid #444' }}>
                   <div style={{ fontSize: '0.75em', color: '#00d2ff', textTransform: 'uppercase', marginBottom: '8px', fontWeight:'bold' }}>✏️ Herramientas</div>
                   
                   {(selectedItems[0].type === 'recta' || selectedItems[0].type === 'plano') && (
                     <button onClick={() => toggleLineStyle(selectedItems[0].exId, selectedItems[0].type as any, selectedItems[0].id)} style={{ width:'100%', background:'#363654', color:'#fff', padding:'8px', border:'1px solid #555', borderRadius:'3px', marginBottom:'5px', cursor:'pointer' }}>🔄 Alternar Continua/Discontinua</button>
                   )}
                   {selectedItems[0].type === 'plano' && (
                     <button onClick={() => togglePlaneType(selectedItems[0].exId, selectedItems[0].id)} style={{ width:'100%', background:'#363654', color:'#fff', padding:'8px', border:'1px solid #555', borderRadius:'3px', marginBottom:'5px', cursor:'pointer' }}>⮂ Alternar Paralelo LT</button>
                   )}
                   <button onClick={() => updateName(selectedItems[0].exId, selectedItems[0].type, selectedItems[0].id, "")} style={{ width:'100%', background:'#eccc68', color:'#000', padding:'8px', border:'none', fontWeight:'bold', borderRadius:'3px', marginBottom:'5px', cursor:'pointer' }}>🆑 Ocultar Nombre</button>
                   <button onClick={() => { removeElement(selectedItems[0].exId, selectedItems[0].type, selectedItems[0].id); clearSelection(); }} style={{ width:'100%', background:'#ff4757', color:'#fff', padding:'8px', border:'none', fontWeight:'bold', borderRadius:'3px', cursor:'pointer' }}>🗑️ Borrar Elemento</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Manejo de atajos de teclado globales */}
      <KeyboardShortcuts undo={undo} redo={redo} pastLen={past.length} futureLen={future.length} />
    </>
  );
}

// Componente invisible para manejar Ctrl+Z y Ctrl+Y globalmente
function KeyboardShortcuts({ undo, redo, pastLen, futureLen }: any) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); if (pastLen > 0) undo(); }
        if (e.key === 'y' || (e.key === 'Z' && e.shiftKey)) { e.preventDefault(); if (futureLen > 0) redo(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, pastLen, futureLen]);
  return null;
}
