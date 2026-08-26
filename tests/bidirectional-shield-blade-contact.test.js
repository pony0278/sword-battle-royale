import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANATOMICAL_3D_JOINT_DEFAULTS,
  forwardAnatomicalSwordArm3D,
} from '../src/combat/anatomical-3d-joint-response.js';
import {
  BIDIRECTIONAL_SHIELD_BLADE_CONTACT_STAGE,
  applyImpulseToShieldState,
  createServoDrivenShieldState,
  probePersistentBladeShieldContact,
  solveBidirectionalShieldBladeImpulse,
  stepServoDrivenShield,
} from '../src/combat/bidirectional-shield-blade-contact.js';

const shoulderOrigin = { x: -0.95, y: 1.16, z: -0.70 };
const geometry = { upperArmLengthMeters: 0.38, forearmLengthMeters: 0.31, handLengthMeters: 0.10, guardOffsetMeters: 0.08, swordLengthMeters: 1.05 };
const angles = { shoulderYaw: 0.18, shoulderPitch: -0.08, shoulderRoll: 0.05, elbowFlex: -0.42, forearmRoll: 0.12, wristFlex: 0.28, wristDeviation: -0.06 };
const zeroVelocity = { shoulderYaw: 0, shoulderPitch: 0, shoulderRoll: 0, elbowFlex: 0, forearmRoll: 0, wristFlex: 0, wristDeviation: 0 };
function kinematics(){ return forwardAnatomicalSwordArm3D({ shoulderOrigin, geometry, anglesRad: angles }); }
function bladePoint(k, fraction=0.55){ return { x:k.bladeStart.x+(k.bladeTip.x-k.bladeStart.x)*fraction, y:k.bladeStart.y+(k.bladeTip.y-k.bladeStart.y)*fraction, z:k.bladeStart.z+(k.bladeTip.z-k.bladeStart.z)*fraction }; }
function magnitude(v){ return Math.hypot(v.x,v.y,v.z); }

test('servo-driven shield accelerates toward target without snapping to it', () => {
  const state=createServoDrivenShieldState({ center:{x:0,y:0,z:0}, quaternion:{x:0,y:0,z:0,w:1} });
  const next=stepServoDrivenShield(state,{ center:{x:0.20,y:0,z:0}, quaternion:{x:0,y:0,z:0,w:1}, linearVelocity:{x:0,y:0,z:0}, angularVelocity:{x:0,y:0,z:0} },1/240);
  assert.equal(next.stage,BIDIRECTIONAL_SHIELD_BLADE_CONTACT_STAGE);
  assert.ok(next.center.x>0);
  assert.ok(next.center.x<0.20);
  assert.ok(next.linearVelocity.x>0);
  assert.equal(next.authority,'servo-target-to-physical-shield-state');
});

test('blade impulse applies exact equal-and-opposite reaction impulse to shield', () => {
  const state=createServoDrivenShieldState({ center:{x:0,y:0,z:0}, massKg:5, inertiaKgM2:0.5 });
  const impulse={x:1.2,y:-0.4,z:0.8};
  const next=applyImpulseToShieldState(state,{x:0.2,y:0,z:0.1},impulse);
  assert.deepEqual(next.reactionImpulse,{x:-1.2,y:0.4,z:-0.8});
  assert.ok(magnitude(next.deltaLinearVelocity)>0);
  assert.ok(magnitude(next.deltaAngularVelocity)>0);
});

test('one coupled contact impulse changes attacker joints and shield velocities together', () => {
  const k=kinematics();
  const point=bladePoint(k,0.55);
  const shield=createServoDrivenShieldState({ center:{x:point.x-0.18,y:point.y,z:point.z}, linearVelocity:{x:0,y:0,z:-3.4}, angularVelocity:{x:0,y:0,z:0}, massKg:5.6, inertiaKgM2:0.42 });
  const result=solveBidirectionalShieldBladeImpulse({ kinematics:k, anglesRad:angles, bladeFraction:0.55, contactPoint:point, contactNormal:{x:0,y:0,z:-1}, shieldState:shield, jointVelocityRadPerSecond:zeroVelocity, inertiaKgM2:ANATOMICAL_3D_JOINT_DEFAULTS.inertiaKgM2 });
  assert.equal(result.applied,true);
  assert.equal(result.bidirectional,true);
  assert.ok(result.normalImpulseNs>0);
  assert.ok(Object.values(result.deltaJointVelocityRadPerSecond).some((v)=>Math.abs(v)>1e-5));
  assert.ok(magnitude(result.nextShieldState.deltaLinearVelocity)>0);
  assert.ok(magnitude(result.nextShieldState.deltaAngularVelocity)>0);
  assert.deepEqual(result.shieldReactionImpulse,{x:-result.impulse.x,y:-result.impulse.y,z:-result.impulse.z});
  assert.ok(result.effectiveInverseMassNormal.arm>0);
  assert.ok(result.effectiveInverseMassNormal.shield>0);
});

test('finite shield effective mass reduces impulse compared with an infinite-mass denominator', () => {
  const k=kinematics();
  const point=bladePoint(k,0.55);
  const shield=createServoDrivenShieldState({ center:{x:point.x-0.18,y:point.y,z:point.z}, linearVelocity:{x:0,y:0,z:-3.4}, massKg:5.6, inertiaKgM2:0.42 });
  const result=solveBidirectionalShieldBladeImpulse({ kinematics:k, anglesRad:angles, bladeFraction:0.55, contactPoint:point, contactNormal:{x:0,y:0,z:-1}, shieldState:shield, jointVelocityRadPerSecond:zeroVelocity, restitution:0 });
  const closing=-result.normalRelativeSpeed;
  const infiniteMassShieldImpulse=closing/result.effectiveInverseMassNormal.arm;
  assert.ok(result.normalImpulseNs<infiniteMassShieldImpulse);
});

test('separating contact does not invent a bidirectional impulse', () => {
  const k=kinematics();
  const point=bladePoint(k,0.55);
  const shield=createServoDrivenShieldState({ center:{x:point.x-0.18,y:point.y,z:point.z}, linearVelocity:{x:0,y:0,z:3.4} });
  const result=solveBidirectionalShieldBladeImpulse({ kinematics:k, anglesRad:angles, bladeFraction:0.55, contactPoint:point, contactNormal:{x:0,y:0,z:-1}, shieldState:shield, jointVelocityRadPerSecond:zeroVelocity });
  assert.equal(result.applied,false);
  assert.equal(result.normalImpulseNs,0);
});

test('persistent surface probe keeps a blade point on the shield face without a swept re-entry event', () => {
  const shield=createServoDrivenShieldState({ center:{x:0,y:0,z:0}, quaternion:{x:0,y:0,z:0,w:1} });
  const result=probePersistentBladeShieldContact({ bladeStart:{x:-0.20,y:-0.033,z:0}, bladeTip:{x:0.20,y:-0.033,z:0}, shieldState:shield, shieldRadiusMeters:0.42, shieldThicknessMeters:0.065, localFaceNormal:{x:0,y:-1,z:0}, previousBladeFraction:0.5, contactToleranceMeters:0.018 });
  assert.equal(result.contact,true);
  assert.ok(result.bladeFraction>=0&&result.bladeFraction<=1);
  assert.ok(Math.abs(result.surfaceSignedDistanceMeters)<0.002);
  assert.equal(result.authority,'persistent-current-surface-contact');
});
