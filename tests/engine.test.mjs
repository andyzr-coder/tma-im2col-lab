import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS,shape,baseAt,sample,matrixElement,tile,bounds,descriptor} from '../engine.mjs';

test('known 4×4 image produces the four expected TMA columns',()=>{
  const c=PRESETS.first;
  const expected=[[1,2,3,5,6,7,9,10,11],[2,3,4,6,7,8,10,11,12],[5,6,7,9,10,11,13,14,15],[6,7,8,10,11,12,14,15,16]];
  for(let rs=0;rs<4;rs++)assert.deepEqual(tile(c,{count:9,r:rs>>1,s:rs%2}).flatMap(x=>x.lanes.map(v=>v.value)),expected[rs]);
});

test('im2col GEMM matches independently computed direct convolution',()=>{
  const configs=[...Object.values(PRESETS),{...PRESETS.padding,H:6,W:5,C:4,R:2,S:3,stride:2,dilation:2,pad:2,N:2}];
  for(const c of configs){
    const g=shape(c),image=Array.from({length:c.N},(_,n)=>Array.from({length:c.H},(_,h)=>Array.from({length:c.W},(_,w)=>Array.from({length:c.C},(_,ch)=>1+(((n*c.H+h)*c.W+w)*c.C+ch)))));
    for(let n=0;n<c.N;n++)for(let p=0;p<g.P;p++)for(let q=0;q<g.Q;q++)for(let oc=0;oc<3;oc++){
      let direct=0;
      for(let r=0;r<c.R;r++)for(let s=0;s<c.S;s++)for(let ch=0;ch<c.C;ch++){
        const weight=(r+1)*3-(s+1)*2+ch-oc;
        const h=p*c.stride-c.pad+r*c.dilation,w=q*c.stride-c.pad+s*c.dilation;
        direct+=(image[n]?.[h]?.[w]?.[ch]??0)*weight;
      }
      const m=(n*g.P+p)*g.Q+q;
      let gemm=0;
      for(let k=0;k<g.K;k++){
        const ch=k%c.C,s=Math.floor(k/c.C)%c.S,r=Math.floor(k/(c.C*c.S));
        gemm+=matrixElement(c,m,k).value*((r+1)*3-(s+1)*2+ch-oc);
      }
      assert.equal(gemm,direct,JSON.stringify({c,n,p,q,oc}));
    }
  }
});

test('padding and batch exhaustion keep output slots and do not produce source addresses',()=>{
  const p=sample(PRESETS.padding,0,0,0,0);assert.equal(p.valid,false);assert.equal(p.value,0);assert.equal(p.address,null);
  assert.equal(sample(PRESETS.padding,0,1,1,0).value,1);
  const c={...PRESETS.first,N:2};
  assert.deepEqual(tile(c,{start:7,count:6}).map(x=>x.lanes[0].value),[10,11,17,18,19,21]);
  const exhausted=tile(c,{start:17,count:3});
  assert.deepEqual(exhausted.map(x=>x.lanes[0].value),[27,0,0]);
  assert.equal(exhausted[1].lanes[0].address,null);
});

test('channel segments are contiguous, destination is compact, tail lanes zero fill',()=>{
  const c=PRESETS.channels;
  const pixels=tile(c,{start:0,count:3,cpp:8});
  assert.deepEqual(pixels.flatMap(x=>x.lanes.map(v=>v.address)),Array.from({length:24},(_,i)=>i*2));
  assert.deepEqual(pixels.flatMap(x=>x.lanes.map(v=>v.destination)),Array.from({length:24},(_,i)=>i*2));
  const tail=tile(c,{start:0,count:1,c0:7,cpp:4})[0].lanes;
  assert.deepEqual(tail.map(x=>x.value),[8,0,0,0]);
  assert.deepEqual(tail.map(x=>x.destination),[0,2,4,6]);
});

test('bounding-box offsets, dilation offsets, and traversal encode distinct concepts',()=>{
  for(const c of Object.values(PRESETS)){
    const b=bounds(c),g=shape(c);
    assert.equal(Math.floor((c.H-1+b.upperH-b.lowerH)/c.stride)+1,g.P);
    assert.equal(Math.floor((c.W-1+b.upperW-b.lowerW)/c.stride)+1,g.Q);
    const last=baseAt(c,g.M-1);assert.equal(last.n,c.N-1);assert.ok(last.h<=c.H-1+b.upperH);
  }
  const d=descriptor(PRESETS.dilation,{start:0,count:6,r:1,s:1,c0:0,cpp:1});
  assert.deepEqual(d.im2colOffsets_WH,[2,2]);assert.deepEqual(d.traversalStride_WH,[1,1]);
  assert.deepEqual(bounds(PRESETS.first),{lowerH:-0,lowerW:-0,upperH:-1,upperW:-1});
});

test('invalid effective kernel produces an empty output instead of invalid indexing',()=>{
  assert.equal(shape({...PRESETS.first,H:3,W:3,R:3,S:3,dilation:2}).M,0);
});
