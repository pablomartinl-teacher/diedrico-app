import React, { useState, useRef, useLayoutEffect, useMemo } from 'react';
import { create } from 'zustand';
import { Stage, Layer, Shape, Circle } from 'react-konva';

// ==========================================
// 1. EL CEREBRO MATEMÁTICO (ZUSTAND)
// ==========================================
export interface ExNode { id: string; t: string; x: number; y: number; pairId?: string; }
export interface ExPlane { id: string; name: string; type: string; vX: number; p1: {x:number, y:number}; p2: {x:number, y:number}; }
export interface ExSegment { id: string; label: string; p1: {x:number, y:number}; p2: {x:number, y:number}; isDashed?: boolean; }
export interface Exercise {
  id: string; title: string; type: string; w: string; h: string; dataStr: string;
  state: { ltY: number; originX: number; ppX: number; reqRegla: boolean; reqPP: boolean; reqOrigin: boolean; planes: ExPlane[]; segments: ExSegment[]; pts: {id:string, name:string, nodes:ExNode[]}[] };
}

interface CadStore {
  exercises: Exercise[];
  addExercise: (opts: any) => void;
  removeExercise: (id: string) => void;
  updateBoxSize: (id: string, w: string, h: string) => void;
  updateNode: (exId: string, ptId: string, nodeId: string, newX: number, newY: number) => void;
  updatePlane: (exId: string, planeId: string, newVX: number) => void;
  updatePlaneEndpoint: (exId: string, planeId: string, traceNum: 1|2, newX: number, newY: number) => void;
  togglePlaneType: (exId: string, planeId: string) => void;
  updateSegment: (exId: string, segId: string, pointIndex: 1|2, newX: number, newY: number) => void;
  updateSystem: (exId: string, target: string, valX: number, valY: number) => void;
  addFreeElement: (exId: string, elemType: 'punto' | 'recta' | 'plano') => void;
  removeElement: (exId: string, elemType: 'punto' | 'recta' | 'plano', elemId: string) => void;
  saveData: () => void;
  loadData: () => void;
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

export const useStore = create<CadStore>()((set, get) => ({
  exercises: [],
  
  saveData: () => { localStorage.setItem('diedrico_pro_data', JSON.stringify(get().exercises)); alert("Lámina guardada."); },
  loadData: () => { const d = localStorage.getItem('diedrico_pro_data'); if (d) set({ exercises: JSON.parse(d) }); else alert("No hay datos guardados."); },

  addExercise: (opts) => set((state) => {
    const originX = 400; const ltY = 250;
    let planes: ExPlane[] = []; let segments: ExSegment[] = []; let pts: any[] = [];
    let title = "Ejercicio"; let dataStr = ""; let w = "50%"; let h = "115mm";

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
      w = "100%"; title = "Dibujar las proyecciones de los puntos dados. Indicar cuadrantes.";
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

      if (opts.lineMethod === 'coord') {
        dataStr = `A(${ax}, ${ay}, ${az})  |  B(${bx}, ${by}, ${bz})`; title = `Representar proyecciones de la recta ${opts.lineType !== 'cualquiera' ? opts.lineType : ''} definida por A y B.`;
      } else if (opts.lineMethod === 'puntos') {
        title = `Dada la recta por sus puntos A y B, hallar sus trazas.`; dataStr = "Puntos dibujados.";
        pts.push({ id:uid(), name:'A', nodes:[{id:uid(), t:'2', x:originX+ax*SF, y:ltY-az*SF, pairId:'n1A'}, {id:'n1A', t:'1', x:originX+ax*SF, y:ltY+ay*SF}] });
        pts.push({ id:uid(), name:'B', nodes:[{id:uid(), t:'2', x:originX+bx*SF, y:ltY-bz*SF, pairId:'n1B'}, {id:'n1B', t:'1', x:originX+bx*SF, y:ltY+by*SF}] });
      } else {
        title = `Dadas las proyecciones de la recta r, hallar sus trazas.`; dataStr = "Proyecciones dibujadas.";
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
      dataStr = `Plano α(${sx}, ${sy}, ${sz})`; title = `Representar trazas del plano ${opts.planeType !== 'cualquiera' ? opts.planeType : ''}.`;
    }
    else if (t === 'intersecciones') {
      w = "100%"; dataStr = "Elementos editables.";
      if (opts.intSub === 'todas') {
        planes.push(genPlane('α', opts.intP1, true, -50), genPlane('β', opts.intP2, false, 50));
        title = `Hallar la recta de intersección de los planos α (${opts.intP1.replace('_',' ')}) y β (${opts.intP2.replace('_',' ')}).`;
      } else if (opts.intSub === 'paralelas') {
        let pA = genPlane('α', 'oblicuo', true, -60); let pB = genPlane('β', 'oblicuo', false, 60); 
        pB.p1.y = ltY + ((pA.p1.y - ltY)/(pA.p1.x - pA.vX)) * (pB.p1.x - pB.vX); planes.push(pA, pB);
        title = "Hallar intersección de los planos sabiendo que sus trazas horizontales son paralelas.";
      } else if (opts.intSub === 'no_existe') {
        planes.push(genPlane('α', 'horizontal', true), genPlane('β', 'oblicuo', false, 40)); 
        title = "Intersección con un plano donde una traza no existe.";
      } else if (opts.intSub === 'paralelas_lt') {
        planes.push(genPlane('α', 'paralelo_lt', true), genPlane('β', 'paralelo_lt', false, 0));
        opts.reqPP = true; title = "Intersección de dos planos paralelos a LT (Usar perfil).";
      }
    } 
    else if (t === 'paralelismo') {
      w = "100%"; dataStr = "Trazas, rectas y puntos editables.";
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
      w = "100%"; dataStr = "Elementos editables.";
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
      w = "100%"; dataStr = "Elementos editables.";
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
      w = "100%"; dataStr = "Elementos editables.";
      let pA = genPlane('α', 'oblicuo', true, -60); planes.push(pA);
      let px = originX + 60; let pz = ltY - 60; let py = ltY + 70;

      if (opts.abatElem === 'punto') {
          pts.push({ id:uid(), name: opts.abatEstado==='proy'?'A':'(A)', nodes: [{id:uid(), t:'2', x:px, y:pz, pairId:'n1'}, {id:'n1', t:'1', x:px, y:py}] });
          title = opts.abatEstado==='proy' ? `Abatir el punto A (en α) sobre ${opts.abatPlano.toUpperCase()}.` : `Dado (A) abatido en ${opts.abatPlano.toUpperCase()}, hallar proyecciones en α.`;
      } else if (opts.abatElem === 'recta') {
          segments.push({ id:uid(), label:opts.abatEstado==='proy'?'r2':'(r)2', p1:{x:px-40, y:pz+20}, p2:{x:px+60, y:pz-30} });
          segments.push({ id:uid(), label:opts.abatEstado==='proy'?'r1':'(r)1', p1:{x:px-40, y:py-20}, p2:{x:px+60, y:py+40} });
          title = opts.abatEstado==='proy' ? `Abatir la recta r (en α) sobre ${opts.abatPlano.toUpperCase()}.` : `Dada (r) abatida, hallar proyecciones en α.`;
      } else {
          for(let i=0; i<(opts.abatElem==='fig_reg'?3:4); i++) {
              let nx = originX + (10 + i*30)*SF; let nz = ltY - (30 + rand(0,20))*SF; let ny = ltY + (20 + rand(0,20))*SF;
              let nn = String.fromCharCode(65+i); let nLabel = opts.abatEstado==='proy' ? nn : `(${nn})`;
              pts.push({ id:uid(), name: nLabel, nodes: [{id:uid(), t:'2', x:nx, y:nz, pairId:'n1'+i}, {id:'n1'+i, t:'1', x:nx, y:ny}] });
          }
          title = opts.abatEstado==='proy' ? `Abatir figura en α para hallar V.M. sobre ${opts.abatPlano.toUpperCase()}` : `Dada figura abatida en ${opts.abatPlano.toUpperCase()}, hallar proyecciones en α.`;
      }

      if (opts.abatEstado === 'vm') {
         let m = opts.abatPlano === 'ph' ? (pA.p1.y - ltY)/(pA.p1.x - pA.vX) : (pA.p2.y - ltY)/(pA.p2.x - pA.vX);
         let mPerp = m !== 0 ? -1/m : 1000;
         segments.push({ id: uid(), label: '', p1: {x: px, y: (opts.abatPlano==='ph'?py:pz)}, p2: {x: px - 80, y: (opts.abatPlano==='ph'?py:pz) - 80*mPerp}, isDashed: true });
      }
    }

    const newEx: Exercise = {
      id: uid(), type: t, title, w, h, dataStr,
      state: { ltY, originX, ppX: 750, reqRegla: opts.reqRegla, reqPP: opts.reqPP, reqOrigin: opts.reqOrigin, planes, segments, pts }
    };
    return { exercises: [...state.exercises, newEx] };
  }),

  removeExercise: (id) => set((state) => ({ exercises: state.exercises.filter(e => e.id !== id) })),
  updateBoxSize: (id, w, h) => set((state) => ({ exercises: state.exercises.map(ex => ex.id === id ? { ...ex, w, h } : ex) })),

  addFreeElement: (exId, elemType) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state }; let ox = s.originX; let oy = s.ltY;
      if (elemType === 'punto') {
          s.pts = [...s.pts, { id:uid(), name:'P', nodes:[{id:uid(), t:'2', x:ox+50, y:oy-50, pairId:'nf1'}, {id:'nf1', t:'1', x:ox+50, y:oy+50}] }];
      } else if (elemType === 'recta') {
          s.segments = [...s.segments, { id:uid(), label:'r2', p1:{x:ox-50, y:oy-20}, p2:{x:ox+50, y:oy-70} }, { id:uid(), label:'r1', p1:{x:ox-50, y:oy+30}, p2:{x:ox+50, y:oy+80} }];
      } else if (elemType === 'plano') {
          s.planes = [...s.planes, { id:uid(), name:'α', type:'oblicuo', vX:ox-70, p1:{x:ox+100, y:oy+150}, p2:{x:ox+100, y:oy-150} }];
      }
      return { ...ex, state: s };
    })
  })),

  removeElement: (exId, elemType, elemId) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state };
      if (elemType === 'punto') s.pts = s.pts.filter(p => p.id !== elemId && !p.nodes.some(n=>n.id===elemId));
      else if (elemType === 'recta') s.segments = s.segments.filter(sg => sg.id !== elemId);
      else if (elemType === 'plano') s.planes = s.planes.filter(pl => pl.id !== elemId);
      return { ...ex, state: s };
    })
  })),

  togglePlaneType: (exId, planeId) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      return { ...ex, state: { ...ex.state, planes: ex.state.planes.map(pl => {
        if (pl.id !== planeId) return pl;
        return { ...pl, type: pl.type === 'paralelo_lt' ? 'oblicuo' : 'paralelo_lt' };
      })}};
    })
  })),

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

      s.pts = s.pts.map(p => {
            if (p.id !== ptId) return p;
            return { ...p, nodes: p.nodes.map(n => {
                if (n.id === nodeId) return { ...n, x: newX, y: newY };
                if (n.pairId === nodeId) return { ...n, x: newX }; 
                return n;
              }) }
      });
      return { ...ex, state: s };
    })
  })),

  updatePlane: (exId, planeId, newVX) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      return { ...ex, state: { ...ex.state, planes: ex.state.planes.map(pl => {
          if (pl.id !== planeId) return pl;
          let dx = newVX - pl.vX;
          return { ...pl, vX: newVX, p1: {x: pl.p1.x + dx, y: pl.p1.y}, p2: {x: pl.p2.x + dx, y: pl.p2.y} };
      }) } };
    })
  })),

  updatePlaneEndpoint: (exId, planeId, traceNum, newX, newY) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      return { ...ex, state: { ...ex.state, planes: ex.state.planes.map(pl => {
            if (pl.id !== planeId) return pl;
            if (traceNum === 1) return { ...pl, p1: { x: newX, y: newY } };
            return { ...pl, p2: { x: newX, y: newY } };
      }) } };
    })
  })),

  updateSegment: (exId, segId, pointIndex, newX, newY) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      return { ...ex, state: { ...ex.state, segments: ex.state.segments.map(seg => {
            if (seg.id !== segId) return seg;
            if (pointIndex === 1) return { ...seg, p1: { x: newX, y: newY } };
            return { ...seg, p2: { x: newX, y: newY } };
          }) } };
    })
  })),

  updateSystem: (exId, target, valX, valY) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      let s = { ...ex.state };
      if (target === 'pp') s.ppX = valX;
      else if (target === 'origin') {
        let dx = valX - s.originX; let dy = valY - s.ltY;
        s.originX = valX; s.ltY = valY; s.ppX += dx;
        s.planes = s.planes.map(pl => ({...pl, vX: pl.vX + dx, p1: {x: pl.p1.x + dx, y: pl.p1.y + dy}, p2: {x: pl.p2.x + dx, y: pl.p2.y + dy}}));
        s.segments = s.segments.map(sg => ({...sg, p1:{x:sg.p1.x+dx, y:sg.p1.y+dy}, p2:{x:sg.p2.x+dx, y:sg.p2.y+dy}}));
        s.pts = s.pts.map(p => ({...p, nodes: p.nodes.map(n => ({...n, x: n.x+dx, y: n.y+dy}))}));
      }
      return { ...ex, state: s };
    })
  }))
}));

// ==========================================
// 2. EL MOTOR DE DIBUJO CAD (KONVA)
// ==========================================
function View2D({ ex }: { ex: Exercise }) {
  const updateNode = useStore((state) => state.updateNode);
  const updatePlane = useStore((state) => state.updatePlane);
  const updatePlaneEndpoint = useStore((state) => state.updatePlaneEndpoint);
  const updateSegment = useStore((state) => state.updateSegment);
  const updateSystem = useStore((state) => state.updateSystem);
  const removeElement = useStore((state) => state.removeElement);
  const togglePlaneType = useStore((state) => state.togglePlaneType);
  
  const { ltY, originX, ppX, reqRegla, reqPP, reqOrigin, planes, pts, segments } = ex.state;

  const containerRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ w: 800, h: 400 });
  const [contextMenu, setContextMenu] = useState<{x:number, y:number, items: {label:string, id:string}[]} | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const handleHover = (e: any) => { e.target.moveToTop(); e.target.scale({x:1.5, y:1.5}); document.body.style.cursor='pointer'; };
  const handleOut = (e: any) => { e.target.scale({x:1, y:1}); document.body.style.cursor='default'; };

  const drawHaloText = (ctx: any, text: string, x: number, y: number, font = "bold 15px Arial", align = "left") => {
    ctx.save(); ctx.font = font; ctx.strokeStyle = "white"; ctx.lineWidth = 4; ctx.lineJoin = "round"; ctx.textAlign = align;
    ctx.strokeText(text, x, y); ctx.fillStyle = "black"; ctx.fillText(text, x, y); ctx.restore();
  };

  const drawScene = (ctx: any) => {
    let dynLabels: {text: string, x: number, y: number, font: string}[] = [];
    const queueLabel = (text: string, x: number, y: number, font = "bold 15px Arial") => { dynLabels.push({text, x, y, font}); };

    const drawTrueVisibilitySegmentLocal = (seg: ExSegment, stSegments: ExSegment[], ltY: number, isVerticalProj: boolean) => {
      if (seg.isDashed) {
         ctx.beginPath(); ctx.setLineDash([5,5]); ctx.moveTo(seg.p1.x, seg.p1.y); ctx.lineTo(seg.p2.x, seg.p2.y); ctx.stroke(); ctx.setLineDash([]);
         if (seg.label) queueLabel(seg.label, (seg.p1.x+seg.p2.x)/2, (seg.p1.y+seg.p2.y)/2); return;
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
          ctx.beginPath(); ctx.setLineDash(in1st ? [] : [6, 4]);
          ctx.moveTo(seg.p1.x, seg.p1.y); ctx.lineTo(seg.p2.x, seg.p2.y); ctx.stroke(); ctx.setLineDash([]);
          queueLabel(seg.label, (seg.p1.x+seg.p2.x)/2 + 5, (seg.p1.y+seg.p2.y)/2 - 5); return;
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

          ctx.beginPath(); ctx.setLineDash(is1stQ ? [] : [6, 4]);
          ctx.moveTo(seg.p1.x + tA * dx, seg.p1.y + tA * dy); ctx.lineTo(seg.p1.x + tB * dx, seg.p1.y + tB * dy); ctx.stroke();
      }
      ctx.setLineDash([]);
      queueLabel(seg.label, (seg.p1.x+seg.p2.x)/2 + 5, (seg.p1.y+seg.p2.y)/2 - 5);
    };

    ctx.strokeStyle = "black"; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(0, ltY); ctx.lineTo(W, ltY); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.beginPath(); 
    ctx.moveTo(10, ltY + 6); ctx.lineTo(25, ltY + 6); 
    ctx.moveTo(W - 25, ltY + 6); ctx.lineTo(W - 10, ltY + 6); ctx.stroke();

    if (reqRegla) {
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(originX, 0); ctx.lineTo(originX, H);
      for(let v = -70; v <= 70; v += 10) {
        let tick = 8; ctx.moveTo(originX + v*SF, ltY - tick); ctx.lineTo(originX + v*SF, ltY + tick);
        if(v !== 0) drawHaloText(ctx, v.toString(), originX + v*SF, ltY + 22, "11px Arial", "center");
        ctx.moveTo(originX - tick, ltY - v*SF); ctx.lineTo(originX + tick, ltY - v*SF);
        if(v !== 0) drawHaloText(ctx, v.toString(), originX - 10, ltY - v*SF + 4, "11px Arial", "right");
      }
      ctx.stroke(); drawHaloText(ctx, "X", W - 20, ltY + 4, "bold 14px Arial");
    }
    
    if (reqOrigin) {
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(originX, ltY - 8); ctx.lineTo(originX, ltY + 8); ctx.stroke();
      if(!reqRegla) drawHaloText(ctx, "0", originX + 4, ltY + 18, "italic 14px Arial");
    }

    if (reqPP) {
      ctx.lineWidth = 1.8; ctx.setLineDash([10, 4, 2, 4]);
      ctx.beginPath(); ctx.moveTo(ppX, 0); ctx.lineTo(ppX, H); ctx.stroke(); ctx.setLineDash([]);
      drawHaloText(ctx, "PP", ppX + 6, 30, "bold 16px Arial");
    }

    planes.forEach((pl: ExPlane) => {
      ctx.strokeStyle = "black"; ctx.lineWidth = 2.2;
      if (pl.type === 'horizontal') {
        ctx.beginPath(); ctx.moveTo(0, pl.p2.y); ctx.lineTo(W, pl.p2.y); ctx.stroke();
        queueLabel(`${pl.name}2`, pl.p2.x, pl.p2.y - 10, "bold 16px Arial");
      } else if (pl.type === 'frontal') {
        ctx.beginPath(); ctx.moveTo(0, pl.p1.y); ctx.lineTo(W, pl.p1.y); ctx.stroke();
        queueLabel(`${pl.name}1`, pl.p1.x, pl.p1.y + 20, "bold 16px Arial");
      } else if (pl.type === 'paralelo_lt') {
        ctx.beginPath(); ctx.moveTo(0, pl.p2.y); ctx.lineTo(W, pl.p2.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, pl.p1.y); ctx.lineTo(W, pl.p1.y); ctx.stroke();
        queueLabel(`${pl.name}2`, pl.p2.x, pl.p2.y - 10, "bold 16px Arial");
        queueLabel(`${pl.name}1`, pl.p1.x, pl.p1.y + 20, "bold 16px Arial");
      } else {
        ctx.beginPath(); ctx.setLineDash(pl.p2.y < ltY ? [] : [6,4]); ctx.moveTo(pl.vX, ltY); ctx.lineTo(pl.p2.x, pl.p2.y); ctx.stroke();
        ctx.beginPath(); ctx.setLineDash(pl.p1.y > ltY ? [] : [6,4]); ctx.moveTo(pl.vX, ltY); ctx.lineTo(pl.p1.x, pl.p1.y); ctx.stroke(); ctx.setLineDash([]);
        queueLabel(`${pl.name}2`, pl.p2.x, pl.p2.y - 10, "bold 16px Arial");
        queueLabel(`${pl.name}1`, pl.p1.x, pl.p1.y + 20, "bold 16px Arial");
      }
    });

    segments.forEach((seg: ExSegment) => {
        const isV = seg.label.includes('2');
        drawTrueVisibilitySegmentLocal(seg, segments, ltY, isV);
    });

    ctx.strokeStyle = "#888"; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
    pts.forEach((p: any) => { if(p.nodes.length === 2) { ctx.beginPath(); ctx.moveTo(p.nodes[0].x, p.nodes[0].y); ctx.lineTo(p.nodes[1].x, p.nodes[1].y); ctx.stroke(); } });
    ctx.setLineDash([]);
    
    ctx.fillStyle = "black";
    pts.forEach((p: any) => {
      p.nodes.forEach((n: ExNode) => { 
        ctx.beginPath(); ctx.strokeStyle = "black"; ctx.lineWidth = 1.5;
        ctx.moveTo(n.x - 5, n.y - 5); ctx.lineTo(n.x + 5, n.y + 5); ctx.moveTo(n.x - 5, n.y + 5); ctx.lineTo(n.x + 5, n.y - 5); ctx.stroke();
        queueLabel(`${p.name}${n.t}`, n.x + 8, n.y - 8); 
      });
    });

    // SISTEMA EXPERTO ANTICOLISIONES Y COINCIDENCIAS (SÍMBOLO ≡)
    let mergedLabels: any[] = [];
    let skip = new Set();
    for(let i=0; i<dynLabels.length; i++) {
        if(skip.has(i)) continue;
        let group = [dynLabels[i]];
        for(let j=i+1; j<dynLabels.length; j++) {
            if(skip.has(j)) continue;
            let dx = dynLabels[i].x - dynLabels[j].x; let dy = dynLabels[i].y - dynLabels[j].y;
            if(Math.sqrt(dx*dx + dy*dy) < 15) { group.push(dynLabels[j]); skip.add(j); }
        }
        if(group.length > 1) {
            let combinedText = group.map(g => g.text).join(' ≡ ');
            let avgX = group.reduce((sum, g) => sum + g.x, 0) / group.length;
            let avgY = group.reduce((sum, g) => sum + g.y, 0) / group.length;
            mergedLabels.push({ text: combinedText, x: avgX, y: avgY, font: group[0].font });
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
                let aH = 15; let bH = 15;
                
                let dx = a.x - b.x; let dy = a.y - b.y;
                let minDistX = (aW + bW)/2 + 8; let minDistY = (aH + bH)/2 + 8;
                
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
        drawHaloText(ctx, lbl.text, lbl.x, lbl.y, lbl.font);
    });
  };

  return (
    <div ref={containerRef} style={{width: '100%', height: '100%', overflow: 'hidden'}}>
      <Stage width={dim.w} height={dim.h} 
             onDragEnd={() => setSelectedId(null)}
             onClick={(e)=>{if(e.evt.button===0) { setContextMenu(null); if (e.target === e.target.getStage()) setSelectedId(null); }}}
             onContextMenu={(e)=>{
               e.evt.preventDefault();
               const stage = e.target.getStage(); const pos = stage?.getPointerPosition();
               if (!stage || !pos) return;
               const shapes = stage.getAllIntersections(pos);
               const handleShapes = shapes.filter((s:any) => s.getClassName() === 'Circle' && s.attrs.name && s.attrs.id);
               if (handleShapes.length > 0) {
                 const unique = Array.from(new Set(handleShapes));
                 setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, items: unique.map((s:any) => ({label: s.attrs.name, id: s.attrs.id})) });
               } else { setContextMenu(null); }
             }}>
        <Layer scaleX={scale} scaleY={scale} x={offsetX} y={offsetY}>
          <Shape sceneFunc={drawScene} />
          
          {reqOrigin && <Circle id="sys_origin" name="Origen (0)" x={originX} y={ltY} radius={18} fill="rgba(255,200,0,0.4)" draggable onDragMove={(e) => updateSystem(ex.id, 'origin', e.target.x(), e.target.y())} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === "sys_origin"} stroke={selectedId === "sys_origin" ? "#fff" : undefined} strokeWidth={selectedId === "sys_origin" ? 3 : 0} />}
          {reqPP && <Circle id="sys_pp" name="Plano de Perfil" x={ppX} y={ltY} radius={12} fill="rgba(200,100,200,0.3)" draggable dragBoundFunc={(p)=>({x:p.x, y:ltY})} onDragMove={(e) => updateSystem(ex.id, 'pp', e.target.x(), 0)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === "sys_pp"} stroke={selectedId === "sys_pp" ? "#fff" : undefined} strokeWidth={selectedId === "sys_pp" ? 3 : 0} />}

          {planes.map(pl => {
            if (pl.type === 'horizontal') return <Circle key={pl.id} id={`pl2_${pl.id}`} name={`Plano Horizontal ${pl.name}`} x={pl.p2.x} y={pl.p2.y} radius={12} fill="rgba(0,150,255,0.4)" draggable onDragMove={e=>updatePlaneEndpoint(ex.id, pl.id, 2, e.target.x(), e.target.y())} onDblClick={()=>removeElement(ex.id, 'plano', pl.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `pl2_${pl.id}`} stroke={selectedId === `pl2_${pl.id}` ? "#fff" : undefined} strokeWidth={selectedId === `pl2_${pl.id}` ? 3 : 0} />;
            if (pl.type === 'frontal') return <Circle key={pl.id} id={`pl1_${pl.id}`} name={`Plano Frontal ${pl.name}`} x={pl.p1.x} y={pl.p1.y} radius={12} fill="rgba(0,150,255,0.4)" draggable onDragMove={e=>updatePlaneEndpoint(ex.id, pl.id, 1, e.target.x(), e.target.y())} onDblClick={()=>removeElement(ex.id, 'plano', pl.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `pl1_${pl.id}`} stroke={selectedId === `pl1_${pl.id}` ? "#fff" : undefined} strokeWidth={selectedId === `pl1_${pl.id}` ? 3 : 0} />;
            if (pl.type === 'paralelo_lt') return <React.Fragment key={pl.id}><Circle id={`pl2_${pl.id}`} name={`Traza ${pl.name}2`} x={pl.p2.x} y={pl.p2.y} radius={12} fill="rgba(0,150,255,0.4)" draggable onDragMove={e=>updatePlaneEndpoint(ex.id, pl.id, 2, e.target.x(), e.target.y())} onDblClick={()=>removeElement(ex.id, 'plano', pl.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `pl2_${pl.id}`} stroke={selectedId === `pl2_${pl.id}` ? "#fff" : undefined} strokeWidth={selectedId === `pl2_${pl.id}` ? 3 : 0} /><Circle id={`pl1_${pl.id}`} name={`Traza ${pl.name}1`} x={pl.p1.x} y={pl.p1.y} radius={12} fill="rgba(0,150,255,0.4)" draggable onDragMove={e=>updatePlaneEndpoint(ex.id, pl.id, 1, e.target.x(), e.target.y())} onDblClick={()=>removeElement(ex.id, 'plano', pl.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `pl1_${pl.id}`} stroke={selectedId === `pl1_${pl.id}` ? "#fff" : undefined} strokeWidth={selectedId === `pl1_${pl.id}` ? 3 : 0} /></React.Fragment>;
            return (
              <React.Fragment key={pl.id}>
                <Circle id={`pl_${pl.id}`} name={`Plano Oblicuo ${pl.name}`} x={pl.vX} y={ltY} radius={15} fill="rgba(0, 150, 255, 0.4)" draggable dragBoundFunc={(pos) => ({ x: pos.x, y: ltY })} onDragMove={(e) => updatePlane(ex.id, pl.id, e.target.x())} onDblClick={()=>removeElement(ex.id, 'plano', pl.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `pl_${pl.id}`} stroke={selectedId === `pl_${pl.id}` ? "#fff" : undefined} strokeWidth={selectedId === `pl_${pl.id}` ? 3 : 0} />
                <Circle id={`pl2_${pl.id}`} name={`Traza ${pl.name}2`} x={pl.p2.x} y={pl.p2.y} radius={12} fill="rgba(0, 150, 255, 0.4)" draggable onDragMove={e => updatePlaneEndpoint(ex.id, pl.id, 2, e.target.x(), e.target.y())} onDblClick={()=>removeElement(ex.id, 'plano', pl.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `pl2_${pl.id}`} stroke={selectedId === `pl2_${pl.id}` ? "#fff" : undefined} strokeWidth={selectedId === `pl2_${pl.id}` ? 3 : 0} />
                <Circle id={`pl1_${pl.id}`} name={`Traza ${pl.name}1`} x={pl.p1.x} y={pl.p1.y} radius={12} fill="rgba(0, 150, 255, 0.4)" draggable onDragMove={e => updatePlaneEndpoint(ex.id, pl.id, 1, e.target.x(), e.target.y())} onDblClick={()=>removeElement(ex.id, 'plano', pl.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `pl1_${pl.id}`} stroke={selectedId === `pl1_${pl.id}` ? "#fff" : undefined} strokeWidth={selectedId === `pl1_${pl.id}` ? 3 : 0} />
              </React.Fragment>
            );
          })}

          {segments.map(seg => (
            <React.Fragment key={seg.id}>
              {!seg.isDashed && <><Circle id={`seg1_${seg.id}`} name={`Extremo ${seg.label} (Inicio)`} x={seg.p1.x} y={seg.p1.y} radius={10} fill="rgba(255, 100, 100, 0.4)" draggable onDragMove={(e) => updateSegment(ex.id, seg.id, 1, e.target.x(), e.target.y())} onDblClick={()=>removeElement(ex.id, 'recta', seg.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `seg1_${seg.id}`} stroke={selectedId === `seg1_${seg.id}` ? "#fff" : undefined} strokeWidth={selectedId === `seg1_${seg.id}` ? 3 : 0} />
              <Circle id={`seg2_${seg.id}`} name={`Extremo ${seg.label} (Fin)`} x={seg.p2.x} y={seg.p2.y} radius={10} fill="rgba(255, 100, 100, 0.4)" draggable onDragMove={(e) => updateSegment(ex.id, seg.id, 2, e.target.x(), e.target.y())} onDblClick={()=>removeElement(ex.id, 'recta', seg.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `seg2_${seg.id}`} stroke={selectedId === `seg2_${seg.id}` ? "#fff" : undefined} strokeWidth={selectedId === `seg2_${seg.id}` ? 3 : 0} /></>}
            </React.Fragment>
          ))}
          {pts.map(p => p.nodes.map(n => (
            <Circle key={n.id} id={`pt_${n.id}`} name={`Punto ${p.name}${n.t}`} x={n.x} y={n.y} radius={12} fill="rgba(255, 71, 87, 0.4)" draggable onDragMove={(e) => updateNode(ex.id, p.id, n.id, e.target.x(), e.target.y())} onDblClick={()=>removeElement(ex.id, 'punto', p.id)} onMouseEnter={handleHover} onMouseLeave={handleOut} listening={!selectedId || selectedId === `pt_${n.id}`} stroke={selectedId === `pt_${n.id}` ? "#fff" : undefined} strokeWidth={selectedId === `pt_${n.id}` ? 3 : 0} />
          )))}
        </Layer>
      </Stage>

      {contextMenu && (
        <div style={{position: 'fixed', top: contextMenu.y, left: contextMenu.x, background: '#1e1e2f', border: '1px solid #00d2ff', borderRadius: '5px', padding: '5px', zIndex: 9999, boxShadow: '0 4px 6px rgba(0,0,0,0.3)', width: 'max-content'}}>
          <div style={{fontSize: '0.75em', color: '#00d2ff', padding: '2px 5px', borderBottom: '1px solid #444', marginBottom: '5px'}}>Editar (Aislar Nodo):</div>
          {contextMenu.items.map((it, i) => {
            const isSys = it.id === 'sys_origin' || it.id === 'sys_pp';
            return (
            <div key={i} style={{ display: 'flex', gap: '4px', marginBottom: '2px' }}>
              <div style={{flex: 1, padding: '5px 8px', cursor: 'pointer', color: 'white', background: '#363654', borderRadius: '3px', fontSize: '0.85em'}}
                   onMouseEnter={e => e.currentTarget.style.background = '#00d2ff'}
                   onMouseLeave={e => e.currentTarget.style.background = '#363654'}
                   onClick={() => { setSelectedId(it.id); setContextMenu(null); }}>
                  ✎ {it.label}
              </div>
              {!isSys && (
                <div style={{padding: '5px 8px', cursor: 'pointer', color: 'white', background: '#ff4757', borderRadius: '3px', fontSize: '0.85em'}}
                     onMouseEnter={e => e.currentTarget.style.background = '#ff6b81'}
                     onMouseLeave={e => e.currentTarget.style.background = '#ff4757'}
                     onClick={() => {
                        let type: 'punto' | 'recta' | 'plano' = 'punto';
                        let rId = it.id;
                        if (it.id.startsWith('pl')) { type = 'plano'; rId = it.id.split('_')[1]; }
                        else if (it.id.startsWith('seg')) { type = 'recta'; rId = it.id.split('_')[1]; }
                        else if (it.id.startsWith('pt_')) { type = 'punto'; rId = it.id.split('_')[1]; }
                        removeElement(ex.id, type, rId);
                        setContextMenu(null);
                     }} title="Borrar elemento">
                    🗑️
                </div>
              )}
            </div>
          )})}
          
          {contextMenu.items.some(it => it.id?.startsWith('pl')) && (
             <div style={{padding: '5px 8px', cursor: 'pointer', color: 'black', background: '#eccc68', marginTop: '5px', borderRadius: '3px', fontSize: '0.8em', fontWeight: 'bold'}}
                  onClick={() => {
                      const planeIdStr = contextMenu.items.find(it => it.id?.startsWith('pl'))!.id;
                      const planeId = planeIdStr.split('_')[1];
                      togglePlaneType(ex.id, planeId); setContextMenu(null);
                  }}>
                 ⮂ Alternar Paralelo LT
             </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// 3. LA INTERFAZ PRINCIPAL (MENÚS Y PAGINACIÓN)
// ==========================================
export default function App() {
  const exercises = useStore((state) => state.exercises);
  const addExercise = useStore((state) => state.addExercise);
  const removeExercise = useStore((state) => state.removeExercise);
  const addFreeElement = useStore((state) => state.addFreeElement);
  const updateBoxSize = useStore((state) => state.updateBoxSize);
  const saveData = useStore((state) => state.saveData);
  const loadData = useStore((state) => state.loadData);
  
  const [type, setType] = useState('punto_coord');
  
  const [ptCount, setPtCount] = useState(4);
  const [lineMethod, setLineMethod] = useState('coord'); const [lineType, setLineType] = useState('cualquiera');
  const [planeType, setPlaneType] = useState('oblicuo');
  const [quadA, setQuadA] = useState('any'); const [quadB, setQuadB] = useState('any');
  const [reqPP, setReqPP] = useState(false); const [reqRegla, setReqRegla] = useState(false); const [reqOrigin, setReqOrigin] = useState(true);

  const [intSub, setIntSub] = useState('todas'); const [intP1, setIntP1] = useState('oblicuo'); const [intP2, setIntP2] = useState('oblicuo');
  const [paraSub, setParaSub] = useState('r_r_pto');
  const [perpSub, setPerpSub] = useState('r_p_pto');
  const [pertSub, setPertSub] = useState('max_pend'); const [pertPlaneType, setPertPlaneType] = useState('oblicuo');
  const [abatElem, setAbatElem] = useState('punto'); const [abatEstado, setAbatEstado] = useState('proy'); const [abatPlano, setAbatPlano] = useState('ph');

  const handleAdd = () => { addExercise({ type, ptCount, lineMethod, lineType, planeType, quadA, quadB, reqPP, reqRegla, reqOrigin, intSub, intP1, intP2, paraSub, perpSub, pertSub, pertPlaneType, abatElem, abatEstado, abatPlano }); };

  const paginatedExercises = useMemo(() => {
    let pages: Exercise[][] = []; let currPage: Exercise[] = [];
    let currH = 0; const MAX_H = 297; 
    exercises.forEach(ex => {
      let hVal = parseInt(ex.h.replace('mm','')) || 115;
      if (currH + hVal > MAX_H && currPage.length > 0) { pages.push(currPage); currPage = []; currH = 0; }
      currPage.push(ex); currH += hVal;
    });
    if (currPage.length > 0) pages.push(currPage);
    if (pages.length === 0) pages = [[]];
    return pages;
  }, [exercises]);

  return (
    <>
      <style>{`
        body { margin: 0; font-family: 'Segoe UI', sans-serif; background-color: #1e1e2f; color: #fff; }
        .sheet-container { display: flex; flex-direction: column; gap: 40px; padding: 30px; align-items: center; }
        .a4-sheet { background: white; width: 210mm; min-height: 297mm; padding: 15mm; box-shadow: 0 0 20px rgba(0,0,0,0.5); color: black; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 0; box-sizing: border-box; break-inside: avoid; }
        .cajetin { width: 100%; border: 1.5px solid black; margin-bottom: 0; }
        .cajetin-top { display: flex; justify-content: space-between; padding: 5px 12px; border-bottom: 1px solid black; font-size: 0.8rem; font-weight: bold; }
        .cajetin-bottom { display: flex; gap: 20px; padding: 10px 12px; font-weight: bold; }
        .exercise-box { border: 1.5px solid black; display: flex; flex-direction: column; position: relative; min-height: 115mm; margin-left: -1.5px; margin-top: -1.5px; resize: both; overflow: hidden; break-inside: avoid; }
        .exercise-title { padding: 10px; background: #f8f9fa; border-bottom: 1.5px solid black; font-size: 0.9rem; font-weight: bold; outline: none; }
        .exercise-data { font-family: monospace; font-size: 0.85em; padding: 5px; text-align: center; border-bottom: 1.5px dashed #ccc; font-weight: bold; outline: none; }
        .btn-mini { background: #2ed573; border: none; padding: 3px 6px; font-size: 0.75rem; font-weight: bold; cursor: pointer; border-radius: 4px; }
        @media print { body { background: white; } .no-print { display: none !important; } .sheet-container { padding: 0; gap: 0; } .a4-sheet { box-shadow: none; margin: 0; padding: 10mm; page-break-after: always; } .exercise-box { resize: none; overflow: hidden; border: 1.5px solid black; } }
      `}</style>
      
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <div className="no-print" style={{ width: '360px', background: '#2a2a40', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto', zIndex: 100, boxShadow: '2px 0 10px rgba(0,0,0,0.5)' }}>
          <h2 style={{ color: '#00d2ff', margin: 0 }}>Editor Diédrico CAD</h2>
          
          <div style={{ background: '#1e1e2f', padding: '15px', borderRadius: '8px' }}>
            <label style={{ color: '#00d2ff', fontWeight: 'bold' }}>Tipo de Ejercicio:</label>
            <select value={type} onChange={e => setType(e.target.value)} style={{ width: '100%', padding: '8px', marginTop: '5px', background: '#363654', color: 'white', border: 'none', fontWeight: 'bold' }}>
              <option value="punto_coord">1. Puntos</option><option value="rectas">2. Rectas</option><option value="plano_coord">3. Planos (Coordenadas)</option>
              <option value="intersecciones">4. Intersecciones</option><option value="paralelismo">5. Paralelismo</option>
              <option value="perpendicularidad">6. Perpendicularidad</option><option value="pertenencias">7. Pertenencias / Contenidas</option>
              <option value="abatimientos">8. Abatimientos</option>
            </select>

            {type === 'punto_coord' && (<div style={{marginTop: '10px'}}><label>Nº Puntos:</label><input type="number" value={ptCount} onChange={e=>setPtCount(Number(e.target.value))} min="1" max="10" style={{width:'100%', padding:'8px'}} /></div>)}
            {type === 'rectas' && (
              <div style={{marginTop: '10px'}}>
                <label>Método de la Recta:</label><select value={lineMethod} onChange={e=>setLineMethod(e.target.value)} style={{width:'100%', padding:'8px'}}><option value="coord">Por Coordenadas</option><option value="puntos">Por Puntos Dibujados</option><option value="proy">Por Proyecciones</option></select>
                <label>Tipo de Recta:</label><select value={lineType} onChange={e=>setLineType(e.target.value)} style={{width:'100%', padding:'8px'}}><option value="cualquiera">Aleatoria</option><option value="horizontal">Horizontal</option><option value="frontal">Frontal</option><option value="vertical">Vertical</option><option value="punta">Punta</option><option value="perfil">Perfil</option><option value="paralela_lt">Paralela LT</option><option value="incidente_lt">Incidente LT</option><option value="contenida_pv">Contenida PV</option><option value="contenida_ph">Contenida PH</option></select>
              </div>
            )}
            {type === 'plano_coord' && (<div style={{marginTop: '10px'}}><label>Tipo de Plano:</label><select value={planeType} onChange={e=>setPlaneType(e.target.value)} style={{width:'100%', padding:'8px'}}><option value="oblicuo">Oblicuo</option><option value="proy_vert">Proy. Vertical</option><option value="proy_horiz">Proy. Horizontal</option><option value="perfil">Perfil</option><option value="horizontal">Horizontal</option><option value="frontal">Frontal</option><option value="paralelo_lt">Paralelo a LT</option></select></div>)}
            {(type === 'rectas' || type === 'plano_coord') && (
              <div style={{marginTop: '10px'}}>
                <label>Cuadrante 1:</label><select value={quadA} onChange={e=>setQuadA(e.target.value)} style={{width:'100%', padding:'8px'}}><option value="any">Aleatorio</option><option value="1">I Cuadrante</option><option value="2">II Cuadrante</option><option value="3">III Cuadrante</option><option value="4">IV Cuadrante</option></select>
                {type !== 'plano_coord' && <><label>Cuadrante 2:</label><select value={quadB} onChange={e=>setQuadB(e.target.value)} style={{width:'100%', padding:'8px'}}><option value="any">Aleatorio</option><option value="1">I Cuadrante</option><option value="2">II Cuadrante</option><option value="3">III Cuadrante</option><option value="4">IV Cuadrante</option></select></>}
              </div>
            )}
            {type === 'intersecciones' && (
              <div style={{marginTop: '10px'}}>
                <label>Caso:</label><select value={intSub} onChange={e=>setIntSub(e.target.value)} style={{width:'100%', padding:'8px'}}><option value="todas">Todas las trazas cortan</option><option value="paralelas">Trazas paralelas</option><option value="no_existe">Traza no existe</option><option value="paralelas_lt">Todas paralelas a LT</option></select>
                <label>Plano 1:</label><select value={intP1} onChange={e=>setIntP1(e.target.value)} style={{width:'100%', padding:'8px'}}><option value="oblicuo">Oblicuo</option><option value="proy_vert">Proy. Vertical</option><option value="proy_horiz">Proy. Horizontal</option><option value="perfil">Perfil</option><option value="horizontal">Horizontal</option><option value="frontal">Frontal</option><option value="paralelo_lt">Paralelo LT</option></select>
                <label>Plano 2:</label><select value={intP2} onChange={e=>setIntP2(e.target.value)} style={{width:'100%', padding:'8px'}}><option value="oblicuo">Oblicuo</option><option value="proy_vert">Proy. Vertical</option><option value="proy_horiz">Proy. Horizontal</option><option value="perfil">Perfil</option><option value="horizontal">Horizontal</option><option value="frontal">Frontal</option><option value="paralelo_lt">Paralelo LT</option></select>
              </div>
            )}
            {type === 'paralelismo' && (<div style={{marginTop: '10px'}}><label>Caso:</label><select value={paraSub} onChange={e=>setParaSub(e.target.value)} style={{width:'100%', padding:'8px'}}><option value="r_r_pto">Recta // Recta por pto</option><option value="p_p_pto">Plano // Plano por pto</option><option value="r_p_pto_corte">Recta // Plano (corta a r)</option><option value="p_r_pto">Plano // Recta por pto</option><option value="p_r_cont_r">Plano // Recta (contiene s)</option><option value="p_2r_cortan">Plano // a 2 rectas que cortan</option></select></div>)}
            {type === 'perpendicularidad' && (<div style={{marginTop: '10px'}}><label>Caso:</label><select value={perpSub} onChange={e=>setPerpSub(e.target.value)} style={{width:'100%', padding:'8px'}}><option value="r_p_pto">Recta ⊥ Plano por pto</option><option value="p_r_pto">Plano ⊥ Recta por pto</option><option value="p_p_pto">Plano ⊥ Plano por pto</option><option value="p_p_r">Plano ⊥ Plano por recta</option><option value="r_r_ext">Recta ⊥ Recta por pto ext</option><option value="r_r">Recta ⊥ Recta</option></select></div>)}
            {type === 'pertenencias' && (
              <div style={{marginTop: '10px'}}>
                <label>Caso:</label><select value={pertSub} onChange={e=>setPertSub(e.target.value)} style={{width:'100%', padding:'8px'}}><option value="max_pend">Recta Máxima Pendiente</option><option value="max_inc">Recta Máxima Inclinación</option><option value="horiz">Recta Horizontal contenida</option><option value="front">Recta Frontal contenida</option><option value="def_2r_c">Plano: 2 rectas se cortan</option><option value="def_2r_p">Plano: 2 rectas paralelas</option><option value="def_3p">Plano: 3 puntos</option><option value="def_r_p">Plano: recta y punto</option></select>
                <label>Tipo de Plano (Contenedor):</label><select value={pertPlaneType} onChange={e=>setPertPlaneType(e.target.value)} style={{width:'100%', padding:'8px'}}><option value="oblicuo">Oblicuo</option><option value="proy_vert">Proyectante Vertical</option><option value="proy_horiz">Proyectante Horizontal</option></select>
              </div>
            )}
            {type === 'abatimientos' && (
              <div style={{marginTop: '10px'}}>
                <label>Elemento:</label><select value={abatElem} onChange={e=>setAbatElem(e.target.value)} style={{width:'100%', padding:'8px'}}><option value="punto">Punto</option><option value="recta">Recta</option><option value="fig_reg">Figura Regular</option><option value="fig_irreg">Figura Irregular</option></select>
                <label>Estado Dado:</label><select value={abatEstado} onChange={e=>setAbatEstado(e.target.value)} style={{width:'100%', padding:'8px'}}><option value="proy">Proyecciones (Encontrar V.M)</option><option value="vm">Verdadera Magnitud (Desabatir)</option></select>
                <label>Sobre Plano:</label><select value={abatPlano} onChange={e=>setAbatPlano(e.target.value)} style={{width:'100%', padding:'8px'}}><option value="ph">PH</option><option value="pv">PV</option></select>
              </div>
            )}
            <div style={{marginTop: '15px'}}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#363654', padding: '8px', borderRadius: '5px', cursor: 'pointer', marginBottom: '5px' }}><input type="checkbox" checked={reqOrigin} onChange={e=>setReqOrigin(e.target.checked)} /> <span style={{fontSize:'0.8em', color:'#eccc68'}}>Mostrar Origen (0)</span></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#363654', padding: '8px', borderRadius: '5px', cursor: 'pointer', marginBottom: '5px' }}><input type="checkbox" checked={reqPP} onChange={e=>setReqPP(e.target.checked)} /> <span style={{fontSize:'0.8em', color:'#eccc68'}}>3ª Proyección (PP)</span></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#363654', padding: '8px', borderRadius: '5px', cursor: 'pointer' }}><input type="checkbox" checked={reqRegla} onChange={e=>setReqRegla(e.target.checked)} /> <span style={{fontSize:'0.8em', color:'#eccc68'}}>Mostrar Regla</span></label>
            </div>
            <button onClick={handleAdd} style={{ width: '100%', marginTop: '15px', padding: '10px', background: '#2ed573', border: 'none', fontWeight: 'bold', cursor: 'pointer', borderRadius: '5px' }}>+ Añadir Ejercicio</button>
          </div>
          
          <div style={{display: 'flex', gap: '5px', marginTop: 'auto'}}>
            <button onClick={saveData} style={{ flex: 1, background: '#ffa502', padding: '12px', border: 'none', fontWeight: 'bold', cursor: 'pointer', borderRadius: '5px' }}>💾 Guardar</button>
            <button onClick={loadData} style={{ flex: 1, background: '#1e90ff', padding: '12px', color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer', borderRadius: '5px' }}>📂 Cargar</button>
          </div>
          <button onClick={() => window.print()} style={{ background: '#00d2ff', padding: '12px', border: 'none', fontWeight: 'bold', cursor: 'pointer', borderRadius: '5px' }}>🖨️ Imprimir Lámina</button>
          <div style={{fontSize:'0.75rem', color:'#aaa', textAlign:'center', marginTop: '5px'}}><b>Click derecho</b> en zona de conflicto para aislar qué editar.<br/><b>Doble clic</b> o icono 🗑️ para borrar.</div>
        </div>

        <div style={{ flex: 1, background: '#151520', overflowY: 'auto' }}>
          <div className="sheet-container">
            {paginatedExercises.map((pageExs, pageIdx) => (
              <div key={pageIdx} className="a4-sheet">
                {pageIdx === 0 && (
                  <div className="cajetin">
                    <div className="cajetin-top"><span>Colegio Nuestra Señora de los Infantes</span><span>1º BACHILLERATO</span></div>
                    <div className="cajetin-bottom">
                      <span style={{flex: 1, display:'flex', alignItems:'flex-end', whiteSpace:'nowrap'}}>Nombre: <span contentEditable style={{borderBottom:'1px solid #000', flex: 1, outline:'none', marginLeft:'5px', paddingBottom:'2px'}}></span></span>
                      <span style={{width: '30%', display:'flex', alignItems:'flex-end', marginLeft:'20px', whiteSpace:'nowrap'}}>Curso: <span contentEditable style={{borderBottom:'1px solid #000', flex: 1, outline:'none', marginLeft:'5px', paddingBottom:'2px'}}></span></span>
                    </div>
                  </div>
                )}

                {pageExs.map((ex, index) => (
                  <div key={ex.id} className="exercise-box" style={{ width: ex.w, height: ex.h }} onMouseUp={(e) => { const tgt = e.target as HTMLElement; if (tgt.classList.contains('exercise-box')) updateBoxSize(ex.id, tgt.style.width, tgt.style.height); }}>
                    <div style={{ position:'absolute', top: 5, right: 35, zIndex: 10, display: 'flex', gap: '5px' }}>
                      <button className="no-print btn-mini" onClick={() => addFreeElement(ex.id, 'punto')}>+ Pto</button>
                      <button className="no-print btn-mini" onClick={() => addFreeElement(ex.id, 'recta')}>+ Rct</button>
                      <button className="no-print btn-mini" onClick={() => addFreeElement(ex.id, 'plano')}>+ Pln</button>
                    </div>
                    <button className="no-print" onClick={() => removeExercise(ex.id)} style={{ position:'absolute', top: 5, right: 5, zIndex: 10, background: '#ff4757', color: 'white', border: 'none', borderRadius: '50%', cursor: 'pointer', width:'25px', height:'25px', fontWeight:'bold', display:'flex', justifyContent:'center', alignItems:'center' }}>X</button>
                    <div className="exercise-title" contentEditable><b>{index + 1}.</b> {ex.title}</div>
                    {ex.dataStr && <div className="exercise-data" contentEditable>{ex.dataStr}</div>}
                    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                      <View2D ex={ex} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}