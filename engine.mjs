// Pure educational model. Dense NHWC, symmetric padding, cross-correlation.
export const PRESETS = {
  first: { name: '01 · 最小例子', N:1,H:4,W:4,C:1,R:2,S:2,stride:1,dilation:1,pad:0,bytes:2 },
  padding: { name: '02 · 边界补零', N:1,H:4,W:4,C:1,R:3,S:3,stride:1,dilation:1,pad:1,bytes:2 },
  stride: { name: '03 · stride = 2', N:1,H:5,W:5,C:1,R:3,S:3,stride:2,dilation:1,pad:1,bytes:2 },
  dilation: { name: '04 · dilation = 2', N:1,H:5,W:5,C:1,R:2,S:2,stride:1,dilation:2,pad:0,bytes:2 },
  channels: { name: '05 · 8 通道', N:1,H:4,W:4,C:8,R:2,S:2,stride:1,dilation:1,pad:0,bytes:2 },
  batch: { name: '06 · 跨图像', N:2,H:4,W:4,C:2,R:2,S:2,stride:1,dilation:1,pad:0,bytes:2 }
};
export function shape(c) {
  const P=Math.max(0,Math.floor((c.H+2*c.pad-c.dilation*(c.R-1)-1)/c.stride)+1);
  const Q=Math.max(0,Math.floor((c.W+2*c.pad-c.dilation*(c.S-1)-1)/c.stride)+1);
  return {P,Q,M:c.N*P*Q,K:c.R*c.S*c.C,effectiveH:(c.R-1)*c.dilation+1,effectiveW:(c.S-1)*c.dilation+1};
}
export function baseAt(c,m) {
  const {P,Q}=shape(c);
  if (!P || !Q) throw new RangeError('当前参数没有有效输出位置');
  const n=Math.floor(m/(P*Q)),p=Math.floor((m%(P*Q))/Q),q=m%Q;
  return {n,p,q,h:p*c.stride-c.pad,w:q*c.stride-c.pad};
}
export function inputValue(c,n,h,w,ch) { return 1+(((n*c.H+h)*c.W+w)*c.C+ch); }
export function sample(c,m,r,s,ch) {
  const b=baseAt(c,m),h=b.h+r*c.dilation,w=b.w+s*c.dilation;
  const valid=b.n>=0 && b.n<c.N && h>=0 && h<c.H && w>=0 && w<c.W && ch>=0 && ch<c.C;
  const value=valid?inputValue(c,b.n,h,w,ch):0;
  const address=valid?(((b.n*c.H+h)*c.W+w)*c.C+ch)*c.bytes:null;
  return {m,r,s,ch,base:b,n:b.n,h,w,valid,value,address};
}
export function matrixElement(c,m,k) {
  const ch=k%c.C,rs=Math.floor(k/c.C),s=rs%c.S,r=Math.floor(rs/c.S);
  return sample(c,m,r,s,ch);
}
export function tile(c,{start=0,count=6,r=0,s=0,c0=0,cpp=1}={}) {
  return Array.from({length:count},(_,i)=>{
    const lanes=Array.from({length:cpp},(_,j)=>({...sample(c,start+i,r,s,c0+j),destination:(i*cpp+j)*c.bytes}));
    return {i,m:start+i,base:baseAt(c,start+i),lanes};
  });
}
export function bounds(c) {
  return {lowerH:-c.pad,lowerW:-c.pad,upperH:c.pad-(c.R-1)*c.dilation,upperW:c.pad-(c.S-1)*c.dilation};
}
export function descriptor(c,opts) {
  const b=baseAt(c,opts.start),bb=bounds(c);
  return {
    layout:'dense NHWC',globalDim_CWHN:[c.C,c.W,c.H,c.N],
    globalStrides_bytes:[c.C*c.bytes,c.W*c.C*c.bytes,c.H*c.W*c.C*c.bytes],
    pixelBoxLowerCorner_WH:[bb.lowerW,bb.lowerH],pixelBoxUpperCorner_WH:[bb.upperW,bb.upperH],
    channelsPerPixel:opts.cpp,pixelsPerColumn:opts.count,
    traversalStride_WH:[c.stride,c.stride],
    tensorCoordinates_CWHN:[opts.c0,b.w,b.h,b.n],
    im2colOffsets_WH:[opts.s*c.dilation,opts.r*c.dilation],fill:'zero',swizzle:'none'
  };
}
export function physicalBytes(c,opts) {
  const lanes=tile(c,opts).flatMap(p=>p.lanes);
  return {payload:lanes.length*c.bytes,validElements:lanes.filter(x=>x.valid).length,zeroElements:lanes.filter(x=>!x.valid).length};
}
