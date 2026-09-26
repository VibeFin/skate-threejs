import { spawnSync } from "node:child_process";
const SR=22050, file=process.argv[2], BAR=60/84*4, OV=0.3;
const d=spawnSync("ffmpeg",["-v","error","-i",file,"-ac","1","-ar",String(SR),"-f","f32le","-"],{maxBuffer:1<<30});
const b=d.stdout, x=new Float32Array(b.buffer,b.byteOffset,Math.floor(b.length/4));
const db=v=>20*Math.log10(Math.max(v,1e-9));
// 20 ms RMS envelope of an arbitrary signal
function env(sig){const w=Math.round(0.02*SR),out=[];
  for(let i=0;i+w<sig.length;i+=w){let s=0;for(let j=0;j<w;j++)s+=sig[i+j]*sig[i+j];out.push(db(Math.sqrt(s/w)));}
  return out;}
// Build 1.2 s centred on the join: leader running out, follower crossfading in.
function joined(start,end){
  const n=Math.round(1.2*SR), pre=Math.round(0.45*SR);
  const out=new Float32Array(n);
  const a0=Math.round((end-OV-0.45)*SR);      // leader, 450 ms before overlap
  const f0=Math.round((start-0.45)*SR);        // follower, aligned so it lands at `start`
  const ov=Math.round(OV*SR), ovStart=pre;
  for(let i=0;i<n;i++){
    const lead=x[a0+i]??0;
    if(i<ovStart){out[i]=lead;continue;}
    const k=i-ovStart;
    if(k<ov){const t=k/ov,g=Math.cos(t*Math.PI/2),h=Math.sin(t*Math.PI/2); // equal power
      out[i]=lead*g+(x[f0+pre+k]??0)*h;}
    else out[i]=x[f0+pre+k]??0;
  }
  return out;
}
// Control: the same 1.2 s of music played straight through, one loop earlier.
function straight(end,L){const n=Math.round(1.2*SR),o=new Float32Array(n);
  const a0=Math.round((end-OV-0.45-L)*SR);
  for(let i=0;i<n;i++)o[i]=x[a0+i]??0;return o;}
console.log("bars  loop L     worst 20 ms deviation in the splice vs the straight-through control");
for(const nb of [23,24,26]){
  const L=nb*BAR, start=2.917, end=start+L+OV;
  const j=env(joined(start,end)), s=env(straight(end,L));
  // compare only the frames covering the overlap itself
  const i0=Math.round(0.45/0.02), i1=Math.round((0.45+OV)/0.02);
  let worst=0,sum=0,cnt=0;
  for(let i=i0;i<=i1&&i<j.length&&i<s.length;i++){
    const dv=Math.abs(j[i]-s[i]); if(dv>worst)worst=dv; sum+=dv; cnt++;}
  // how much the track's own level moves across any 20 ms inside a bar — the
  // yardstick a deviation has to be judged against
  let nat=0;for(let i=i0;i<i1;i++)nat=Math.max(nat,Math.abs(s[i+1]-s[i]));
  console.log(`${String(nb).padStart(3)}   ${L.toFixed(3)}s   worst ${worst.toFixed(2)} dB   mean ${(sum/cnt).toFixed(2)} dB   (the groove's own 20 ms swing here: ${nat.toFixed(2)} dB)`);
}
