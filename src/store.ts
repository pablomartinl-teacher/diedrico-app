import { create } from 'zustand';

export interface ExNode { id: string; t: string; x: number; y: number; pairId?: string; }
export interface ExPlane { id: string; name: string; vX: number; m1: number; m2: number; type: string; }
export interface ExSegment { id: string; label: string; p1: {x:number, y:number}; p2: {x:number, y:number}; }
export interface Exercise {
  id: string; title: string; type: string; w: string;
  state: { ltY: number; originX: number; planes: ExPlane[]; segments: ExSegment[]; pts: {id:string, name:string, nodes:ExNode[]}[] };
}

interface CadStore {
  exercises: Exercise[];
  addExercise: (type: string, subType: string, p1Type: string, p2Type: string) => void;
  removeExercise: (id: string) => void;
  updateNode: (exId: string, nodeId: string, newX: number, newY: number) => void;
  updatePlane: (exId: string, planeId: string, newVX: number) => void;
}

const SF = 3.5;
const rand = (min: number, max: number) => Math.random() * (max - min) + min;

// LA SOLUCIÓN ESTÁ AQUÍ: create<CadStore>()((set) => ...)
export const useStore = create<CadStore>()((set) => ({
  exercises: [],
  
  addExercise: (type, subType, p1Type, p2Type) => set((state) => {
    const originX = 400; const ltY = 250;
    let planes: ExPlane[] = []; let segments: ExSegment[] = []; let pts: any[] = [];
    let title = "Ejercicio de Sistema Diédrico";
    let w = "50%";

    if (type === 'intersecciones') {
      w = "100%";
      const genPlane = (name: string, pType: string, isA: boolean): ExPlane => {
        let vx = rand(-40, 40) * SF * (isA ? -1 : 1);
        let m1 = (0.7 + rand(0, 0.5)) * (Math.random() > 0.5 ? 1 : -1);
        let m2 = -(0.7 + rand(0, 0.5));
        if (pType === 'proy_horiz') m1 = 1000; if (pType === 'proy_vert') m2 = -1000;
        if (pType === 'perfil') { m1 = 1000; m2 = -1000; }
        if (pType === 'horizontal') { m1 = 0; m2 = 0; }
        if (pType === 'frontal') { m1 = 0; m2 = 0; }
        return { id: Math.random().toString(), name, vX: originX + vx, m1, m2, type: pType };
      };

      if (subType === 'todas') {
        planes.push(genPlane('α', p1Type, true), genPlane('β', p2Type, false));
        title = `Hallar la recta de intersección de los planos α (${p1Type}) y β (${p2Type}).`;
      } else if (subType === 'paralelas') {
        let pA = genPlane('α', 'oblicuo', true); let pB = genPlane('β', 'oblicuo', false);
        pB.m1 = pA.m1; planes.push(pA, pB);
        title = "Hallar la recta de intersección de los planos sabiendo que sus trazas horizontales son paralelas.";
      } else if (subType === 'no_existe') {
        let pA = genPlane('α', 'horizontal', true); let pB = genPlane('β', 'oblicuo', false);
        planes.push(pA, pB); title = "Intersección con un plano paralelo al de proyección (Una traza no existe).";
      } else if (subType === 'paralelas_lt') {
        planes.push({ id: '1', name: 'α', vX: originX, m1: 0, m2: 0, type: 'paralelo_lt' });
        planes.push({ id: '2', name: 'β', vX: originX, m1: 0, m2: 0, type: 'paralelo_lt' });
        title = "Intersección de dos planos paralelos a la Línea de Tierra (Usar plano de perfil).";
      }
    } 
    else if (type === 'paralelismo') {
      w = "100%";
      let pA = { id: 'p1', name: 'α', vX: originX - 60*SF, m1: 0.8, m2: -0.9, type: 'oblicuo' };
      let px = originX + 40*SF; let pz = ltY - 60; let py = ltY + 50;
      pts.push({ id: 'pt1', name: 'A', nodes: [{id:'n2', t:'2', x:px, y:pz, pairId:'n1'}, {id:'n1', t:'1', x:px, y:py, pairId:'n2'}] });
      
      if (subType === 'r_r_pto') {
        segments.push({ id:'s1', label:'r2', p1:{x:originX-40*SF, y:ltY-20*SF}, p2:{x:originX+30*SF, y:ltY-60*SF} });
        segments.push({ id:'s2', label:'r1', p1:{x:originX-40*SF, y:ltY+30*SF}, p2:{x:originX+30*SF, y:ltY+70*SF} });
        title = "Trazar por el punto A una recta paralela a la recta r.";
      } else if (subType === 'p_p_pto') {
        planes.push(pA); title = "Trazar por el punto A un plano paralelo al plano α.";
      } else if (subType === 'r_p_pto_corte') {
        planes.push(pA);
        segments.push({ id:'s1', label:'r2', p1:{x:originX-80*SF, y:ltY-30*SF}, p2:{x:originX+60*SF, y:ltY-80*SF} });
        segments.push({ id:'s2', label:'r1', p1:{x:originX-80*SF, y:ltY+40*SF}, p2:{x:originX+60*SF, y:ltY+90*SF} });
        title = "Trazar por el punto A una recta paralela al plano α que se corte con la recta r.";
      } else if (subType === 'p_r_pto') {
        segments.push({ id:'s1', label:'r2', p1:{x:originX-40*SF, y:ltY-20*SF}, p2:{x:originX+30*SF, y:ltY-60*SF} });
        segments.push({ id:'s2', label:'r1', p1:{x:originX-40*SF, y:ltY+30*SF}, p2:{x:originX+30*SF, y:ltY+70*SF} });
        title = "Trazar por el punto A un plano paralelo a la recta r.";
      } else if (subType === 'p_r_cont_r') {
        segments.push({ id:'s1', label:'r2', p1:{x:originX-40*SF, y:ltY-20*SF}, p2:{x:originX+30*SF, y:ltY-60*SF} });
        segments.push({ id:'s2', label:'r1', p1:{x:originX-40*SF, y:ltY+30*SF}, p2:{x:originX+30*SF, y:ltY+70*SF} });
        segments.push({ id:'s3', label:'s2', p1:{x:originX-30*SF, y:ltY-70*SF}, p2:{x:originX+40*SF, y:ltY-10*SF} });
        segments.push({ id:'s4', label:'s1', p1:{x:originX-30*SF, y:ltY+60*SF}, p2:{x:originX+40*SF, y:ltY+20*SF} });
        pts = []; title = "Trazar un plano paralelo a la recta r que contenga a la recta s.";
      } else if (subType === 'p_2r_cortan') {
        segments.push({ id:'s1', label:'r2', p1:{x:px-100, y:pz}, p2:{x:px, y:pz-50} });
        segments.push({ id:'s2', label:'r1', p1:{x:px-100, y:py}, p2:{x:px, y:py+50} });
        segments.push({ id:'s3', label:'s2', p1:{x:px+100, y:pz}, p2:{x:px, y:pz-50} });
        segments.push({ id:'s4', label:'s1', p1:{x:px+100, y:py}, p2:{x:px, y:py+50} });
        pts = []; title = "Trazar un plano paralelo a las rectas r y s que se cortan en un punto.";
      }
    }
    else if (type === 'perpendicularidad') {
        w = "100%";
        let pA = { id: 'p1', name: 'α', vX: originX - 30*SF, m1: 1.1, m2: -0.8, type: 'oblicuo' };
        let px = originX + 50*SF; let pz = ltY - 60; let py = ltY + 80;
        let ptP = { id: 'pt1', name: 'P', nodes: [{id:'n2', t:'2', x:px, y:pz, pairId:'n1'}, {id:'n1', t:'1', x:px, y:py, pairId:'n2'}] };
        
        if (subType === 'r_p_pto') { planes.push(pA); pts.push(ptP); title = "Trazar por P una recta ⊥ al plano α."; }
        if (subType === 'p_r_pto') { 
            segments.push({ id:'s1', label:'r2', p1:{x:px-150, y:pz+30}, p2:{x:px-20, y:pz-30} });
            segments.push({ id:'s2', label:'r1', p1:{x:px-150, y:py-30}, p2:{x:px-20, y:py+30} });
            pts.push(ptP); title = "Trazar por P un plano ⊥ a la recta r."; 
        }
        if (subType === 'p_p_pto') { planes.push(pA); pts.push(ptP); title = "Trazar por P un plano ⊥ al plano α."; }
        if (subType === 'p_p_r') { 
            planes.push(pA); title = "Trazar un plano ⊥ al plano α que contenga a la recta r."; 
            segments.push({ id:'s1', label:'r2', p1:{x:px-150, y:pz+30}, p2:{x:px-20, y:pz-30} });
            segments.push({ id:'s2', label:'r1', p1:{x:px-150, y:py-30}, p2:{x:px-20, y:py+30} });
        }
        if (subType === 'r_r_ext') { 
            segments.push({ id:'s1', label:'r2', p1:{x:px-150, y:pz+30}, p2:{x:px-20, y:pz-30} });
            segments.push({ id:'s2', label:'r1', p1:{x:px-150, y:py-30}, p2:{x:px-20, y:py+30} });
            pts.push(ptP); title = "Trazar por P (exterior) una recta ⊥ a la recta r."; 
        }
        if (subType === 'r_r') { 
            segments.push({ id:'s1', label:'r2', p1:{x:px-150, y:pz+30}, p2:{x:px-20, y:pz-30} });
            segments.push({ id:'s2', label:'r1', p1:{x:px-150, y:py-30}, p2:{x:px-20, y:py+30} });
            title = "Trazar una recta ⊥ a la recta r que la corte."; 
        }
    }
    else if (type === 'pertenencias') {
        if (['max_pend', 'max_inc', 'horiz', 'front'].includes(subType)) {
            planes.push({ id: 'p1', name: 'α', vX: originX, m1: 0.8, m2: -1.2, type: 'oblicuo' });
            title = `Trazar una recta de tipo ${subType.replace('_',' ')} contenida en el plano α.`;
        } else {
            let px = originX; let pz = ltY - 50; let py = ltY + 50;
            if (subType === 'def_2r_c') {
                segments.push({ id:'s1', label:'r2', p1:{x:px-80, y:pz+20}, p2:{x:px, y:pz} });
                segments.push({ id:'s2', label:'r1', p1:{x:px-80, y:py-20}, p2:{x:px, y:py} });
                segments.push({ id:'s3', label:'s2', p1:{x:px+80, y:pz+30}, p2:{x:px, y:pz} });
                segments.push({ id:'s4', label:'s1', p1:{x:px+80, y:py-10}, p2:{x:px, y:py} });
                title = "Hallar las trazas del plano definido por las rectas r y s que se cortan.";
            } else if (subType === 'def_2r_p') {
                segments.push({ id:'s1', label:'r2', p1:{x:px-80, y:pz+20}, p2:{x:px+20, y:pz-20} });
                segments.push({ id:'s2', label:'r1', p1:{x:px-80, y:py-20}, p2:{x:px+20, y:py+20} });
                segments.push({ id:'s3', label:'s2', p1:{x:px-50, y:pz+40}, p2:{x:px+50, y:pz} });
                segments.push({ id:'s4', label:'s1', p1:{x:px-50, y:py}, p2:{x:px+50, y:py+40} });
                title = "Hallar las trazas del plano definido por las rectas paralelas r y s.";
            } else if (subType === 'def_3p') {
                pts.push({ id:'pt1', name: 'A', nodes: [{id:'n2', t:'2', x:px-60, y:pz}, {id:'n1', t:'1', x:px-60, y:py}] });
                pts.push({ id:'pt2', name: 'B', nodes: [{id:'n22', t:'2', x:px, y:pz+30}, {id:'n11', t:'1', x:px, y:py-20}] });
                pts.push({ id:'pt3', name: 'C', nodes: [{id:'n32', t:'2', x:px+70, y:pz-10}, {id:'n31', t:'1', x:px+70, y:py+40}] });
                title = "Hallar las trazas del plano definido por los puntos A, B y C no alineados.";
            } else if (subType === 'def_r_p') {
                segments.push({ id:'s1', label:'r2', p1:{x:px-80, y:pz+20}, p2:{x:px+40, y:pz-20} });
                segments.push({ id:'s2', label:'r1', p1:{x:px-80, y:py-20}, p2:{x:px+40, y:py+20} });
                pts.push({ id:'pt1', name: 'P', nodes: [{id:'n2', t:'2', x:px+60, y:pz+40}, {id:'n1', t:'1', x:px+60, y:py-30}] });
                title = "Hallar las trazas del plano definido por la recta r y el punto P.";
            }
        }
    }
    else if (type === 'abatimientos') {
        planes.push({ id: 'p1', name: 'α', vX: originX - 80, m1: 0.9, m2: -1.1, type: 'oblicuo' });
        let px = originX + 60; let pz = ltY - 60; let py = ltY + 70;

        if (subType === 'punto') {
            pts.push({ id:'pt1', name: 'A', nodes: [{id:'n2', t:'2', x:px, y:pz, pairId:'n1'}, {id:'n1', t:'1', x:px, y:py, pairId:'n2'}] });
            title = `Abatir el punto A contenido en el plano α.`;
        } else if (subType === 'recta') {
            segments.push({ id:'s1', label:'r2', p1:{x:px-40, y:pz+20}, p2:{x:px+60, y:pz-30} });
            segments.push({ id:'s2', label:'r1', p1:{x:px-40, y:py-20}, p2:{x:px+60, y:py+40} });
            title = `Abatir la recta r contenida en α.`;
        } else {
            pts.push({ id:'pt1', name: 'A', nodes: [{id:'n2', t:'2', x:px, y:pz, pairId:'n1'}, {id:'n1', t:'1', x:px, y:py, pairId:'n2'}] });
            pts.push({ id:'pt2', name: 'B', nodes: [{id:'n22', t:'2', x:px+40, y:pz+30, pairId:'n11'}, {id:'n11', t:'1', x:px+40, y:py-10, pairId:'n22'}] });
            pts.push({ id:'pt3', name: 'C', nodes: [{id:'n32', t:'2', x:px+80, y:pz-10, pairId:'n31'}, {id:'n31', t:'1', x:px+80, y:py+30, pairId:'n32'}] });
            title = `Abatir la figura plana contenida en α para hallar su Verdadera Magnitud.`;
        }
    }

    const newEx: Exercise = {
      id: Date.now().toString(), type, title, w,
      state: { ltY, originX, planes, segments, pts }
    };
    return { exercises: [...state.exercises, newEx] };
  }),

  removeExercise: (id) => set((state) => ({ exercises: state.exercises.filter(e => e.id !== id) })),

  updateNode: (exId, nodeId, newX, newY) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      return {
        ...ex, state: {
          ...ex.state,
          pts: ex.state.pts.map(p => ({
            ...p, nodes: p.nodes.map(n => {
              if (n.id === nodeId) return { ...n, x: newX, y: newY };
              if (n.pairId === nodeId) return { ...n, x: newX }; 
              return n;
            })
          }))
        }
      };
    })
  })),

  updatePlane: (exId, planeId, newVX) => set((state) => ({
    exercises: state.exercises.map(ex => {
      if (ex.id !== exId) return ex;
      return { ...ex, state: { ...ex.state, planes: ex.state.planes.map(pl => pl.id === planeId ? { ...pl, vX: newVX } : pl) } };
    })
  }))
}));