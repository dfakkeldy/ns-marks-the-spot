import { combinedVisibility, pixelPoint, visibilityFromPoint, type TerrainGrid, type VisibilityStatus } from './visibility';
import type { GeoPoint } from '../services/geodesy';
self.onmessage=(event: MessageEvent<{grid:TerrainGrid;turbines:GeoPoint[]}>)=>{
  const {grid,turbines}=event.data;
  try{
    // Each output cell represents four source pixels (~106 m here).
    const stride=4,width=Math.ceil(grid.meta.width/stride),height=Math.ceil(grid.meta.height/stride);
    const rgba=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++){
      if(y%32===0)self.postMessage({progress:Math.round(y/height*100)});
      for(let x=0;x<width;x++){
        const p=pixelPoint(grid.meta,x*stride+(stride-1)/2,y*stride+(stride-1)/2);
        const statuses: VisibilityStatus[]=[];
        for(const turbine of turbines){
          const status=visibilityFromPoint(grid,p,turbine).status;
          statuses.push(status);
          // A known potential view already answers the union question.
          if(status==='potential')break;
        }
        const status=combinedVisibility(statuses);
        const color=status==='potential'?[23,126,112,110]:status==='blocked'?[100,105,113,90]:status==='uncertain'?[205,139,36,140]:[0,0,0,0];
        rgba.set(color,(y*width+x)*4);
      }
    }
    self.postMessage({width,height,rgba}, {transfer:[rgba.buffer]});
  }catch(error){self.postMessage({error:error instanceof Error?error.message:'Visibility calculation failed'});}
};
