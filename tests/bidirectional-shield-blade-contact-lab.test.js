import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('tools/action-studio/bidirectional-shield-blade-contact-lab-r292r111.html','utf8');
const source=fs.readFileSync('tools/action-studio/bidirectional-shield-blade-contact-lab-r292r111.js','utf8');
function section(name,nextName){const start=source.indexOf(`function ${name}`);assert.ok(start>=0,`missing ${name}`);const end=nextName?source.indexOf(`function ${nextName}`,start+1):source.length;return source.slice(start,end>start?end:source.length);}

test('R1.1.1 HTML loads dedicated bidirectional physical-contact lab',()=>{assert.match(html,/G4\.3B\.5R\.2\.9\.2R1\.1\.1/);assert.match(html,/Bidirectional/);assert.match(html,/physics step/);assert.match(html,/bidirectional-shield-blade-contact-lab-r292r111\.js/);});

test('actual shield is servo-driven physical state rather than animation pose authority',()=>{const fixed=section('fixedStep','groupedDelta');assert.match(source,/stepServoDrivenShield\(/);assert.match(source,/syncShieldVisualFromPhysicalState\(/);assert.match(source,/sampleShieldMotorTarget\(/);assert.doesNotMatch(source,/function setShieldPose/);assert.doesNotMatch(fixed,/shield\.position\.set\(/);});

test('initial whole-blade CCD feeds one coupled bidirectional impulse',()=>{const contact=section('solveInitialCcd','solvePersistentContact');const ccd=contact.indexOf('probeSweptBladeShieldPhysicalContact({');const coupled=contact.indexOf('solveBidirectionalShieldBladeImpulse({');assert.ok(ccd>=0);assert.ok(coupled>ccd);assert.match(contact,/bladeFraction:contact\.bladeFraction/);assert.match(contact,/contactPoint:contact\.point/);assert.match(contact,/contactNormal:contact\.normal/);assert.match(contact,/shieldState:impactShield/);});

test('post-contact authority keeps solving persistent shield-blade surface contact',()=>{const persistent=section('solvePersistentContact','fixedStep');assert.match(persistent,/probePersistentBladeShieldContact\(/);assert.match(persistent,/solveBidirectionalShieldBladeImpulse\(/);assert.match(persistent,/persistentGeometricSteps\+=1/);assert.match(persistent,/persistentImpulseSteps\+=1/);assert.match(persistent,/contactAgeSeconds\+=FIXED_DT/);assert.doesNotMatch(source,/hit\s*=\s*true/);});

test('contact inspector exposes orbit camera and camera presets',()=>{assert.match(html,/OrbitControls\.js/);assert.match(html,/Contact close-up/);assert.match(html,/Blade side/);assert.match(html,/Shield face/);assert.match(source,/new THREE\.OrbitControls\(camera, canvas\)/);assert.match(source,/function setCameraView\(mode\)/);assert.match(source,/orbit\.enablePan = true/);});

test('contact inspector makes the actual surface relationship visible',()=>{assert.match(html,/contact patch \+ blade witness \+ gap/i);assert.match(source,/const contactPatch = new THREE\.Mesh/);assert.match(source,/const bladeWitness = makeJoint/);assert.match(source,/const gapLine = new THREE\.Line/);assert.match(source,/function updateContactVisualization\(\)/);assert.match(source,/contactPatch\.quaternion\.copy\(q\)/);assert.match(source,/bladeWitness\.position\.copy\(witness\)/);assert.match(source,/updateGapLine\(point,witness\)/);assert.match(source,/normalArrow/);assert.match(source,/tangentArrow/);assert.match(source,/relativeVelocityArrow/);});

test('contact inspector supports slow motion pause auto-pause and exact 240Hz stepping',()=>{assert.match(html,/Auto pause on first contact/);assert.match(html,/0\.10×/);assert.match(html,/0\.25×/);assert.match(source,/function stepOnePhysicsTick\(\)/);assert.match(source,/fixedStep\(FIXED_DT,true\)/);assert.match(source,/firstContactThisStep&&autoPauseContactInput\.checked/);assert.match(source,/accumulator\+=frameSeconds\*timeScale\(\)/);assert.match(source,/const FIXED_DT = 1 \/ 240/);});

test('inspector API exposes current contact gap and stepping without changing solver authority',()=>{assert.match(source,/get latestContact\(\)\{return currentContactRecord\(\);\}/);assert.match(source,/get contactGapMeters\(\)\{return contactGapMeters\(\);\}/);assert.match(source,/stepOnePhysicsTick/);assert.match(source,/inspectionOnlyChangesPresentation:true/);});

test('lab preserves R1.1 attacker authority and forbids rejected models',()=>{assert.match(source,/forwardAnatomicalSwordArm3D/);assert.match(source,/stepAnatomical3dJointState/);assert.doesNotMatch(source,/solveAnatomical3dContactImpulse/);assert.doesNotMatch(source,/solveKinematicShieldSwordImpulse/);assert.doesNotMatch(source,/physical-grip-wrist-compliance/);assert.doesNotMatch(source,/aimEffectorWithBone|applyRigPose|followRatio|poseTarget|targetPose/);assert.match(source,/const FIXED_DT = 1 \/ 240/);});

test('report exposes bidirectional persistence and inspection invariants',()=>{assert.match(source,/shieldIsServoDrivenPhysicalBody:true/);assert.match(source,/animationProvidesTargetOnly:true/);assert.match(source,/bidirectionalEqualOppositeImpulse:true/);assert.match(source,/persistentContactAfterInitialCcd:true/);assert.match(source,/noOneShotHitAuthority:true/);assert.match(source,/noKinematicSetShieldPoseAuthority:true/);assert.match(source,/inspectionOnlyChangesPresentation:true/);assert.match(source,/orbitCamera:true/);assert.match(source,/contactPatch:true/);assert.match(source,/physicsSingleStep:true/);});
