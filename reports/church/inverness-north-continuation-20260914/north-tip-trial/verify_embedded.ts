import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseGeoTiff} from '../../../../web/src/userMaps/parsers/geoTiffSource';
import {buildLatLngMesh} from '../../../../web/src/userMaps/transform/projection';
import {toMercator} from '../../../../web/src/userMaps/transform/webMercator';
const path='/Users/dfakkeldy/Downloads/church-north-continuation-20260914/tps5-rendered/inverness-north-tps5-review-20m.tif';
const bytes=readFileSync(path);
const sha=createHash('sha256').update(bytes).digest('hex');
assert.equal(sha,'8856e0fdd99f3ce01774f4ee22d182755728369961de9113f76af4cc047b62e8');
let previewEvidence: unknown;
const parsed=await parseGeoTiff(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),{
  makePreview:async (rgba,width,height)=>{
    assert.equal(rgba.length,width*height*4);
    let transparent=0,opaque=0;
    for(let i=3;i<rgba.length;i+=4){if(rgba[i]===0)transparent++;if(rgba[i]===255)opaque++;}
    assert.ok(transparent>0&&opaque>0);
    previewEvidence={width,height,channels:4,transparentPixels:transparent,opaquePixels:opaque};
    return new Blob();
  },
});
assert.deepEqual(parsed.pixelSize,{width:3310,height:5438});
assert.ok(parsed.georef);
assert.equal(parsed.georef.crs,'EPSG:3857');
const expected=[-6806380,20,0,5950480,0,-20];
assert.deepEqual(parsed.georef.geotransform,expected);
const mesh=buildLatLngMesh(parsed.georef,parsed.pixelSize,8);
let worst=0;
for(let row=0;row<=8;row++)for(let col=0;col<=8;col++){
  const x=parsed.pixelSize.width*col/8,y=parsed.pixelSize.height*row/8;
  const actual=toMercator(mesh[row][col]);
  const ex=expected[0]+x*expected[1]+y*expected[2],ey=expected[3]+x*expected[4]+y*expected[5];
  worst=Math.max(worst,Math.hypot(actual.x-ex,actual.y-ey));
}
assert.ok(worst<.001);
console.log(JSON.stringify({source:path,sha256:sha,sourceCodeBaseCommit:'ba887a98fad15d4a0764956056943ac57512a686',pixelSize:parsed.pixelSize,georef:parsed.georef,preview:previewEvidence,embeddedMeshNodes:81,maxMeshDifferenceProjectedMetres:worst,scope:'Real production GeoTIFF decode, alpha extraction and embedded projection lattice. PNG writer stubbed in this Node probe; actual browser import, persistence, 2D overview/regional view and 10x terrain were checked separately through CUA. No raw-scan GCP mesh or geographic acceptance.'},null,2));
