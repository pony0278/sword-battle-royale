import {
  ANATOMICAL_3D_DOF_NAMES,
  ANATOMICAL_3D_JOINT_DEFAULTS,
  computeAnatomical3dContactJacobian,
  computeAnatomical3dPointVelocity,
} from './anatomical-3d-joint-response.js';

export const BIDIRECTIONAL_SHIELD_BLADE_CONTACT_STAGE = 'G4.3B.5R.2.9.2R1.1.1';

export const BIDIRECTIONAL_SHIELD_BLADE_DEFAULTS = Object.freeze({
  shieldMassKg: 5.6,
  shieldInertiaKgM2: 0.42,
  servoPositionStiffnessNPerM: 1500,
  servoPositionDampingNsPerM: 125,
  servoAngularStiffnessNmPerRad: 92,
  servoAngularDampingNmsPerRad: 9.5,
  maxServoForceN: 680,
  maxServoTorqueNm: 78,
  restitution: 0.05,
  friction: 0.72,
  maximumImpulseNs: 16,
  contactToleranceMeters: 0.018,
  persistentContactMaxSeconds: 0.030,
});

function finite(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, finite(v, a))); }
function vec(v = {}) { return { x: finite(v.x), y: finite(v.y), z: finite(v.z) }; }
function add(a,b){ return {x:a.x+b.x,y:a.y+b.y,z:a.z+b.z}; }
function sub(a,b){ return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}; }
function mul(a,s){ return {x:a.x*s,y:a.y*s,z:a.z*s}; }
function dot(a,b){ return a.x*b.x+a.y*b.y+a.z*b.z; }
function cross(a,b){ return {x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x}; }
function length(v){ return Math.hypot(v.x,v.y,v.z); }
function normalize(v,f={x:0,y:0,z:-1}){ const m=length(v); return m>1e-10?mul(v,1/m):{...f}; }
function freezeVector(v){ return Object.freeze({x:v.x,y:v.y,z:v.z}); }
function resolveDofMap(input={}, fallback={}){ const out={}; for(const n of ANATOMICAL_3D_DOF_NAMES) out[n]=finite(input[n],fallback[n]); return out; }
function freezeDofMap(v){ return Object.freeze(resolveDofMap(v)); }
function qNormalize(q){ const m=Math.hypot(q.x,q.y,q.z,q.w); return m>1e-12?{x:q.x/m,y:q.y/m,z:q.z/m,w:q.w/m}:{x:0,y:0,z:0,w:1}; }
function qConjugate(q){ return {x:-q.x,y:-q.y,z:-q.z,w:q.w}; }
function qMultiply(a,b){ return qNormalize({x:a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,y:a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,z:a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,w:a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z}); }
function qRotate(q,v){ const p={x:v.x,y:v.y,z:v.z,w:0}; const r=qMultiplyRaw(qMultiplyRaw(q,p),qConjugate(q)); return {x:r.x,y:r.y,z:r.z}; }
function qMultiplyRaw(a,b){ return {x:a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,y:a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,z:a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,w:a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z}; }
function qFromAngularVelocity(omega,dt){ const speed=length(omega); if(speed<1e-10||dt<=0)return {x:0,y:0,z:0,w:1}; const half=speed*dt*0.5,s=Math.sin(half)/speed; return qNormalize({x:omega.x*s,y:omega.y*s,z:omega.z*s,w:Math.cos(half)}); }
function qErrorVector(target,current){ let d=qMultiply(target,qConjugate(current)); if(d.w<0)d={x:-d.x,y:-d.y,z:-d.z,w:-d.w}; const w=clamp(d.w,-1,1),angle=2*Math.acos(w),s=Math.sqrt(Math.max(0,1-w*w)); return angle<1e-8||s<1e-8?{x:0,y:0,z:0}:mul({x:d.x/s,y:d.y/s,z:d.z/s},angle); }
function clampVectorMagnitude(v,max){ const m=length(v); return m>max&&m>1e-10?mul(v,max/m):v; }
function shieldPointVelocity(state,point){ return add(vec(state.linearVelocity),cross(vec(state.angularVelocity),sub(vec(point),vec(state.center)))); }
function shieldInvMassAlong(state,point,direction){ const invM=1/Math.max(0.05,finite(state.massKg,BIDIRECTIONAL_SHIELD_BLADE_DEFAULTS.shieldMassKg)); const invI=1/Math.max(1e-4,finite(state.inertiaKgM2,BIDIRECTIONAL_SHIELD_BLADE_DEFAULTS.shieldInertiaKgM2)); const rx=cross(sub(vec(point),vec(state.center)),direction); return invM+dot(rx,rx)*invI; }
function articulatedInvMassAlong(jacobian,direction,inverseInertia){ let s=0; for(const n of ANATOMICAL_3D_DOF_NAMES){ const j=dot(jacobian[n],direction); s+=j*j*inverseInertia[n]; } return s; }
function applyArticulatedImpulse(velocity,jacobian,impulse,inverseInertia){ const next={...velocity},delta={}; for(const n of ANATOMICAL_3D_DOF_NAMES){ delta[n]=dot(jacobian[n],impulse)*inverseInertia[n]; next[n]+=delta[n]; } return {next,delta}; }

export function createServoDrivenShieldState(input={}){
  const d=BIDIRECTIONAL_SHIELD_BLADE_DEFAULTS;
  return Object.freeze({
    center: freezeVector(vec(input.center)),
    quaternion: Object.freeze(qNormalize(input.quaternion||{x:0,y:0,z:0,w:1})),
    linearVelocity: freezeVector(vec(input.linearVelocity)),
    angularVelocity: freezeVector(vec(input.angularVelocity)),
    massKg: Math.max(0.05,finite(input.massKg,d.shieldMassKg)),
    inertiaKgM2: Math.max(1e-4,finite(input.inertiaKgM2,d.shieldInertiaKgM2)),
  });
}

export function stepServoDrivenShield(state={}, target={}, deltaSeconds=1/240, profile={}){
  const d={...BIDIRECTIONAL_SHIELD_BLADE_DEFAULTS,...profile};
  const dt=Math.max(0,finite(deltaSeconds,1/240));
  const current=createServoDrivenShieldState(state);
  const targetCenter=vec(target.center), targetQ=qNormalize(target.quaternion||current.quaternion);
  const targetLinear=vec(target.linearVelocity), targetAngular=vec(target.angularVelocity);
  let force=add(mul(sub(targetCenter,current.center),finite(d.servoPositionStiffnessNPerM,1500)),mul(sub(targetLinear,current.linearVelocity),finite(d.servoPositionDampingNsPerM,125)));
  force=clampVectorMagnitude(force,Math.max(0,finite(d.maxServoForceN,680)));
  let torque=add(mul(qErrorVector(targetQ,current.quaternion),finite(d.servoAngularStiffnessNmPerRad,92)),mul(sub(targetAngular,current.angularVelocity),finite(d.servoAngularDampingNmsPerRad,9.5)));
  torque=clampVectorMagnitude(torque,Math.max(0,finite(d.maxServoTorqueNm,78)));
  const linearVelocity=add(current.linearVelocity,mul(force,dt/current.massKg));
  const angularVelocity=add(current.angularVelocity,mul(torque,dt/current.inertiaKgM2));
  const center=add(current.center,mul(linearVelocity,dt));
  const quaternion=qNormalize(qMultiply(qFromAngularVelocity(angularVelocity,dt),current.quaternion));
  return Object.freeze({
    stage:BIDIRECTIONAL_SHIELD_BLADE_CONTACT_STAGE,
    center:freezeVector(center),quaternion:Object.freeze(quaternion),
    linearVelocity:freezeVector(linearVelocity),angularVelocity:freezeVector(angularVelocity),
    massKg:current.massKg,inertiaKgM2:current.inertiaKgM2,
    servoForce:freezeVector(force),servoTorque:freezeVector(torque),
    positionErrorMeters:length(sub(targetCenter,current.center)),
    angularErrorRadians:length(qErrorVector(targetQ,current.quaternion)),
    authority:'servo-target-to-physical-shield-state',
  });
}

export function applyImpulseToShieldState(state={}, contactPoint={}, impulseOnBlade={}){
  const current=createServoDrivenShieldState(state);
  const reaction=mul(vec(impulseOnBlade),-1);
  const invM=1/current.massKg, invI=1/current.inertiaKgM2;
  const r=sub(vec(contactPoint),current.center);
  const deltaLinear=mul(reaction,invM);
  const deltaAngular=mul(cross(r,reaction),invI);
  return Object.freeze({
    ...current,
    linearVelocity:freezeVector(add(current.linearVelocity,deltaLinear)),
    angularVelocity:freezeVector(add(current.angularVelocity,deltaAngular)),
    reactionImpulse:freezeVector(reaction),
    deltaLinearVelocity:freezeVector(deltaLinear),
    deltaAngularVelocity:freezeVector(deltaAngular),
  });
}

export function solveBidirectionalShieldBladeImpulse(input={}){
  const d=BIDIRECTIONAL_SHIELD_BLADE_DEFAULTS;
  const shield=createServoDrivenShieldState(input.shieldState);
  const inertia=resolveDofMap(input.inertiaKgM2,ANATOMICAL_3D_JOINT_DEFAULTS.inertiaKgM2);
  const inverseInertia={}; for(const n of ANATOMICAL_3D_DOF_NAMES) inverseInertia[n]=1/Math.max(1e-4,inertia[n]);
  const velocity=resolveDofMap(input.jointVelocityRadPerSecond);
  const normal=normalize(vec(input.contactNormal));
  const bladeFraction=clamp(finite(input.bladeFraction,0.5),0,1);
  const jacReport=computeAnatomical3dContactJacobian({kinematics:input.kinematics,anglesRad:input.anglesRad||input.kinematics?.anglesRad,bladeFraction});
  const point=vec(input.contactPoint||jacReport.point);
  const jacobian=jacReport.jacobian;
  const bladeVelocity=computeAnatomical3dPointVelocity({jacobian,jointVelocityRadPerSecond:velocity});
  const sVelocity=shieldPointVelocity(shield,point);
  const relative=sub(bladeVelocity,sVelocity);
  const vn=dot(relative,normal);
  if(vn>=0){ return Object.freeze({stage:BIDIRECTIONAL_SHIELD_BLADE_CONTACT_STAGE,applied:false,reason:'separating-or-not-closing',normalRelativeSpeed:vn,nextJointVelocityRadPerSecond:freezeDofMap(velocity),nextShieldState:shield,normalImpulseNs:0,frictionImpulseNs:0,impulse:freezeVector({x:0,y:0,z:0})}); }
  const restitution=clamp(finite(input.restitution,d.restitution),0,0.5), friction=clamp(finite(input.friction,d.friction),0,1.5), maxJ=Math.max(0.1,finite(input.maximumImpulseNs,d.maximumImpulseNs));
  const armKn=articulatedInvMassAlong(jacobian,normal,inverseInertia), shieldKn=shieldInvMassAlong(shield,point,normal);
  const normalImpulseNs=clamp(-(1+restitution)*vn/Math.max(1e-6,armKn+shieldKn),0,maxJ);
  const normalImpulse=mul(normal,normalImpulseNs);
  const afterNormalArm=applyArticulatedImpulse(velocity,jacobian,normalImpulse,inverseInertia);
  const afterNormalShield=applyImpulseToShieldState(shield,point,normalImpulse);
  const postBlade=computeAnatomical3dPointVelocity({jacobian,jointVelocityRadPerSecond:afterNormalArm.next});
  const postShield=shieldPointVelocity(afterNormalShield,point);
  const postRelative=sub(postBlade,postShield);
  const tangentRaw=sub(postRelative,mul(normal,dot(postRelative,normal)));
  const tangentSpeed=length(tangentRaw);
  let frictionImpulseNs=0, frictionImpulse={x:0,y:0,z:0};
  if(tangentSpeed>1e-6&&friction>0){ const tangent=mul(tangentRaw,1/tangentSpeed); const kt=articulatedInvMassAlong(jacobian,tangent,inverseInertia)+shieldInvMassAlong(afterNormalShield,point,tangent); frictionImpulseNs=Math.min(tangentSpeed/Math.max(1e-6,kt),friction*normalImpulseNs); frictionImpulse=mul(tangent,-frictionImpulseNs); }
  const totalImpulse=add(normalImpulse,frictionImpulse);
  const armApplied=applyArticulatedImpulse(velocity,jacobian,totalImpulse,inverseInertia);
  const shieldApplied=applyImpulseToShieldState(shield,point,totalImpulse);
  return Object.freeze({
    stage:BIDIRECTIONAL_SHIELD_BLADE_CONTACT_STAGE,applied:true,reason:'coupled-shield-blade-impulse-applied',bladeFraction,
    contactPoint:freezeVector(point),contactNormal:freezeVector(normal),bladePointVelocity:bladeVelocity,shieldPointVelocity:freezeVector(sVelocity),relativeVelocity:freezeVector(relative),normalRelativeSpeed:vn,
    normalImpulseNs,frictionImpulseNs,impulse:freezeVector(totalImpulse),
    deltaJointVelocityRadPerSecond:freezeDofMap(armApplied.delta),nextJointVelocityRadPerSecond:freezeDofMap(armApplied.next),
    nextShieldState:shieldApplied,shieldReactionImpulse:shieldApplied.reactionImpulse,
    effectiveInverseMassNormal:Object.freeze({arm:armKn,shield:shieldKn,total:armKn+shieldKn}),
    bidirectional:true,authority:'single-contact-impulse-to-attacker-joints-and-opposite-shield-reaction',
  });
}

export function probePersistentBladeShieldContact(input={}){
  const d=BIDIRECTIONAL_SHIELD_BLADE_DEFAULTS;
  const shield=createServoDrivenShieldState(input.shieldState);
  const start=vec(input.bladeStart),tip=vec(input.bladeTip),segment=sub(tip,start);
  const localNormal=normalize(vec(input.localFaceNormal||{x:0,y:-1,z:0}),{x:0,y:-1,z:0});
  const invQ=qConjugate(shield.quaternion);
  const localStart=qRotate(invQ,sub(start,shield.center)), localTip=qRotate(invQ,sub(tip,shield.center));
  const localSegment=sub(localTip,localStart), faceOffset=Math.max(0,finite(input.shieldThicknessMeters,0.065))*0.5;
  const denominator=dot(localSegment,localNormal);
  const fallbackFraction=clamp(finite(input.previousBladeFraction,0.5),0,1);
  const fraction=Math.abs(denominator)>1e-7?clamp((faceOffset-dot(localStart,localNormal))/denominator,0,1):fallbackFraction;
  const localPoint=add(localStart,mul(localSegment,fraction));
  const signedDistance=dot(localPoint,localNormal)-faceOffset;
  const planeProjection=sub(localPoint,mul(localNormal,dot(localPoint,localNormal)));
  const radialDistance=length(planeProjection);
  const tolerance=Math.max(0.001,finite(input.contactToleranceMeters,d.contactToleranceMeters));
  const radius=Math.max(0.01,finite(input.shieldRadiusMeters,0.42));
  const contact=Math.abs(signedDistance)<=tolerance&&radialDistance<=radius+tolerance;
  const worldPoint=add(shield.center,qRotate(shield.quaternion,localPoint));
  const worldNormal=normalize(qRotate(shield.quaternion,localNormal));
  return Object.freeze({stage:BIDIRECTIONAL_SHIELD_BLADE_CONTACT_STAGE,contact,bladeFraction:fraction,point:freezeVector(worldPoint),normal:freezeVector(worldNormal),surfaceSignedDistanceMeters:signedDistance,radialDistanceMeters:radialDistance,contactToleranceMeters:tolerance,authority:'persistent-current-surface-contact'});
}
