import assert from 'node:assert/strict';
import {build} from 'rolldown';
import fs from 'node:fs';
fs.mkdirSync('work',{recursive:true});
await build({input:'src/data/brand-preview.ts',external:id=>id==='three',output:{file:'work/brand-preview-test.mjs',format:'esm'}});
const {previewBrand}=await import('../work/brand-preview-test.mjs');
const state={demo:false,brands:{},seats:[],naming:{brandId:null,valueCents:10000,takeovers:0},screen:{brandId:null,dayPriceCents:2900},banners:[{brandId:null,valueCents:2500,takeovers:0}],murals:[{brandId:null,valueCents:5000,takeovers:0}],totalSalesCents:null};
const original=JSON.stringify(state),brand={id:'local-business-preview',name:'Harlem Coffee',tagline:'Home court.',color:'#d15332',accent:'#fff5df',url:''};
for(const count of [1,4,12]) {
 const result=previewBrand(state,{kind:'seat',section:0,row:5,col:39},brand,count);
 assert.equal(result.seats.length,count);assert(result.seats.every(s=>s.section===0 && s.row<=5));
 assert.equal(new Set(result.seats.map(s=>`${s.row}/${s.col}`)).size,count);
 assert(result.seats.some(s=>s.row===5 && s.col===39));
 const twice=previewBrand(result,{kind:'seat',section:0,row:5,col:39},brand,count);
 assert.equal(twice.seats.length,count,'Editing a design duplicated seats');
}
for(const kind of ['naming','screen','banner','mural']) {
 const ref=['banner','mural'].includes(kind)?{kind,index:0}:{kind};
 const result=previewBrand(state,ref,brand);
 assert.equal((kind==='banner'?result.banners[0]:kind==='mural'?result.murals[0]:result[kind]).brandId,brand.id);
 assert.equal(result.totalSalesCents,null);assert.equal(result.demo,true);
}
assert.equal(JSON.stringify(state),original,'Preview mutated the original court');
console.log('PASS: 1/4/12-seat blocks, section boundaries, repeated edits, all sponsor surfaces, original state and sales unchanged.');
