import { probeSweptSwordBucklerContact } from './swept-sword-buckler-contact.js';
import { evaluateSweptContactTemporalEligibility } from './swept-contact-temporal-eligibility.js';
import { probeHiltClangContact, buildHiltPolyline } from './hilt-clang-contact.js';
import { decideContactDepthOrder } from './contact-depth-order.js';
import { LONGSWORD_ATTACK_PHASES } from './longsword-directional-attack-runtime.js';
import { GUARD_STATES } from './guard-state-machine.js';
import {
  TWO_ACTOR_PARRY_REACTION_CHANNELS,
  TWO_ACTOR_PARRY_REACTION_PHASE_LATCHES,
} from './two-actor-combat-integration.js';
import { COMMITTED_PARRY_CONTACT_GATE_STAGE } from './committed-parry-contact-gate.js';
import { LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE } from './live-shield-sword-grip-contact-constraint.js';
import {
  buildLiveParryOldB3Handoff,
  sampleLiveParryOldB3ReleaseBlend,
} from './live-parry-old-b3-handoff.js';
import { publishPostCouplingRecoilStaggerHandoff } from './post-coupling-recoil-stagger-handoff.js';
import { captureRigPose } from './guard-recovery-bridge.js';
import { getProductionParryDeflectProfile } from '../animation/parry-contact-deflect-runtime-clip.js';
import { sanitizeIncomingVelocity } from './contact-reaction-director.js';
import { probeBodyHurtboxContact } from './body-hurtbox.js';

export const CONTACT_LIFECYCLE_DIRECTOR_STAGE = 'R18S.4';

// R18S.4: The contact lifecycle is the causal chain the other three directors hang off, and it was
// the last orchestration still living in the lab. What this owns is the state machine:
//
//   detect  - the swept probe fires, temporal eligibility filters it, and the first real contact
//             is latched. The probe is the success authority; everything after it is staging.
//             A sweep that misses the shield is then offered to the body: shield first, always,
//             because a blade the guard caught never reaches what is behind it.
//   resolve - the parry gate confirms (or does not), the combat integration resolves the outcome,
//             and the attacker's rig is frozen at the instant of impact - that snapshot is the
//             base every later pose blends from.
//   commit  - a confirmed parry starts the live grip constraint: the shield owns the weapon arm,
//             the OLD B3 body clock starts at impact, and the reach ladder lets go of the shield
//             arm it was driving. A block arms the whole reaction at impact instead, because a
//             held shield never takes the blade hostage and there is no release marker to wait
//             for. A failed parry falls through to nothing - the outcome is already a block.
//   hold    - while the constraint owns the arm, the body runs on the live-contact channels with
//             the impulse peak latched and the attacker's interruption held; the excitation the
//             eventual release impulse is built from is tracked here, at its peak.
//   release - gated twice: the constraint must be holding, and the *defender's* deflect marker
//             must have been reached - the attacker cannot be thrown by a parry the defender has
//             not visibly finished. Release rebuilds the weapon arm's blend from the frozen
//             contact base, publishes the recoil handoff, and only then arms the reaction:
//             while the swept probe was live, moving either root would have moved the geometry
//             it measures.
//   join    - the running OLD B3 consumes the handoff, and the weapon arm crosses the 28ms
//             continuity bridge into the body that has been reacting since impact.
//
// Presentation stays with the caller: rig captures the lab wants for itself, sword refreshes,
// repaints, markers, and every word of status text. The director returns what happened; the lab
// decides what it looks and reads like.

// How stale the defender's guard intent may be and still count, per outcome. Parry is the tighter
// window because it is a timed action; block is a held posture and tolerates more.
export const GUARD_INTENT_AGE_MS = Object.freeze({ block: 260, parry: 120 });

export const PARRY_ATTACKER_RELEASE_SOURCE_SECONDS =
  getProductionParryDeflectProfile('parry').presentationMarkers.attackerReleaseEligibleSeconds;

const WEAPON_ARM_RELEASE_BONES = Object.freeze(['upperarm.r', 'lowerarm.r', 'wrist.r', 'hand.r', 'handslot.r']);

// The closest the blade came to the body across the whole exchange, not the last frame's reading:
// the last frame is the follow-through, and the question worth answering is how near it got when
// it mattered. A strike always wins over any near miss, however near.
function nearerBodyReading(standing, candidate) {
  if (!standing) return candidate;
  if (standing.contact === true) return standing;
  if (candidate.contact === true) return candidate;
  const standingGap = Number(standing.gapMeters);
  const candidateGap = Number(candidate.gapMeters);
  if (!Number.isFinite(candidateGap)) return standing;
  if (!Number.isFinite(standingGap)) return candidate;
  return candidateGap < standingGap ? candidate : standing;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function createContactLifecycleDirector({
  attackerRig,
  reactionDirector,
  gripConstraint,
  confirmParry,
  resolveCombat,
  updateCombat,
  readCombatSnapshot,
  readShieldSurface,
  readGuardReport,
  takePredictiveHandoff,
  readCanonicalContactPose,
  readDefenderHurtbox,
  readAttackerHiltPoint,
  readAttackerRootPoint,
  readDefenderBodyPoint,
  readCloseRangePosture,
  fallbackIncomingVelocity,
  releaseReachOwnership,
  observe = {},
} = {}) {
  let firstContact = null;
  let bodyHit = null;
  let confirmation = null;
  let combatResult = null;
  let transfer = null;
  let leadHandoff = null;
  let releaseBlend = null;
  let blockReaction = null;
  let latchedDefenderGate = null;
  let frozenContactPose = null;
  // The handoff builder wants the shield surface as it stood at contact, not as it stands at
  // release time, so the impact read is kept.
  let surfaceAtContactForRelease = null;
  // R18W.2: where the shield was on the previous resolve. The parry path gets a shield translation
  // handed to it by the lead-motion sampler, but Guard has no such sampler, so the moving-shield
  // solve below was silently inert in BLOCK mode - the one mode where the shield does most of its
  // travelling. The director measures its own now.
  let previousShieldCenter = null;
  let previousHiltPoint = null;
  let lastDeltaMs = 0;

  function ownsLiveContact() {
    return Boolean(
      transfer?.accepted
      && confirmation?.accepted
      && transfer.releasedToOldB3 !== true,
    );
  }

  function backwardDirection() {
    return reactionDirector.backwardDirection({
      fallbackDirection: combatResult?.attackerReaction?.plan?.body?.direction || null,
    });
  }

  function armReaction({ outcome, contactPoint, surfaceNormal, incomingVelocity, incomingSource }) {
    return reactionDirector.arm({
      outcome,
      backwardDirection: backwardDirection(),
      contactPoint,
      surfaceNormal,
      incomingVelocity,
      incomingSource,
    });
  }

  function currentDefenderGate() {
    const report = readGuardReport();
    const sourceTimeSeconds = Math.max(0, Number(report?.sourceTimeSeconds) || 0);
    const passed = report?.state === GUARD_STATES.PARRY
      && sourceTimeSeconds + 1e-4 >= PARRY_ATTACKER_RELEASE_SOURCE_SECONDS;
    return Object.freeze({
      passed,
      state: report?.state || null,
      sourceTimeSeconds,
      requiredSourceTimeSeconds: PARRY_ATTACKER_RELEASE_SOURCE_SECONDS,
      marker: 'deflect-impulse',
      latched: false,
      authority: 'defender-reaction-marker-gates-attacker-release',
    });
  }

  function defenderReleaseGate() {
    return latchedDefenderGate || currentDefenderGate();
  }

  // The defender's half of the frame: its guard presentation has just rebuilt its pose, so the
  // reaction is re-applied now, and the gate that frees the attacker is read - and latched - on
  // the same rebuilt pose the marker was measured on.
  function advanceDefender() {
    const reaction = reactionDirector.advanceDefender(lastDeltaMs, {
      torsoWeight: readCombatSnapshot().attackerRecoil?.sample?.weights?.torsoWeight ?? 1,
    });
    let gate = latchedDefenderGate;
    if (!gate) {
      const current = currentDefenderGate();
      if (current.passed) {
        latchedDefenderGate = Object.freeze({
          ...current,
          latched: true,
          authority: 'latched-defender-deflect-marker-gates-attacker-release',
        });
        gate = latchedDefenderGate;
      } else {
        gate = current;
      }
    }
    return Object.freeze({ reaction, gate });
  }

  function release({ selectedDirection, gripReport, surfaceAtContact }) {
    if (!ownsLiveContact()) {
      return Object.freeze({ accepted: false, reason: 'live-contact-no-longer-owns-presentation' });
    }
    const gate = defenderReleaseGate();
    if (!gate.passed) {
      return Object.freeze({
        accepted: false,
        reason: 'defender-deflect-marker-not-reached',
        defenderReleaseGate: gate,
      });
    }
    const handoff = buildLiveParryOldB3Handoff({
      attackDirection: selectedDirection,
      contactReport: gripReport,
      surfaceAtContact,
      confirmedParry: confirmation?.accepted === true && firstContact?.eligible === true,
      allowConfirmedParryFallback: true,
    });
    if (!handoff.accepted) return handoff;

    const visibleReleasePose = captureRigPose(attackerRig);
    const recoilPoseAtRelease = readCombatSnapshot().attackerRecoil?.sample?.pose || null;
    const appliedBodyChainPitchAtReleaseDegrees = recoilPoseAtRelease
      ? (Number(recoilPoseAtRelease.chestPitchDegrees) || 0)
        + (Number(recoilPoseAtRelease.spinePitchDegrees) || 0)
        + (Number(recoilPoseAtRelease.hipsPitchDegrees) || 0)
      : null;

    const handoffPublished = publishPostCouplingRecoilStaggerHandoff(attackerRig, {
      couplingReport: handoff.couplingReport,
      surfaceAtContact: handoff.surfaceAtContact,
    });
    if (!handoffPublished) {
      return Object.freeze({ ...handoff, accepted: false, reason: 'old-b3-handoff-publish-failed' });
    }

    // The weapon arm alone fades from where the constraint left it back onto the frozen contact
    // base; the rest of the body is already the running OLD B3's.
    const contactBasePose = frozenContactPose || readCanonicalContactPose();
    const releaseSourcePose = { ...contactBasePose };
    for (const armBone of WEAPON_ARM_RELEASE_BONES) {
      if (visibleReleasePose[armBone]) releaseSourcePose[armBone] = visibleReleasePose[armBone];
    }
    releaseBlend = {
      elapsedMs: 0,
      durationMs: handoff.releaseBlendMs,
      sample: sampleLiveParryOldB3ReleaseBlend(0, handoff.releaseBlendMs),
      sourcePose: Object.freeze(releaseSourcePose),
      targetPose: contactBasePose,
      authority: 'weapon-arm-contact-pose-fades-into-contact-base-while-old-b3-body-keeps-running',
    };
    // Armed here, never earlier: while the swept probe is live it owns parry success, and moving
    // either root would move the geometry it measures.
    const measuredIncoming = sanitizeIncomingVelocity(firstContact?.incomingVelocity);
    const armed = armReaction({
      outcome: combatResult?.resolution?.outcome,
      contactPoint: firstContact?.point,
      surfaceNormal: handoff.surfaceAtContact?.normal || readShieldSurface()?.normal,
      incomingVelocity: measuredIncoming || fallbackIncomingVelocity(selectedDirection),
      incomingSource: measuredIncoming ? 'measured-contact-point' : 'authored-direction-fallback',
    });

    transfer = Object.freeze({
      ...transfer,
      releasedToOldB3: true,
      rootDisplacementArmedAtDeflectImpulse: armed.attackerDisplacement?.accepted === true,
      releaseHandoff: handoff,
      defenderReleaseGate: gate,
      handoffPublished: true,
      handoffConsumedByOldB3: false,
      b3BodyClockStartedAtImpact: true,
      oldB3ReleaseStartPresentationMs:
        readCombatSnapshot().attackerRecoil?.phaseClock?.latchPointMs ?? null,
      continuityBridgeMs: handoff.releaseBlendMs,
      visibleOldB3BodyStartedAtImpact: true,
      weaponArmJoinsOldB3AtDeflectImpulse: true,
      oldB3AppliedBodyChainPitchAtReleaseDegrees: appliedBodyChainPitchAtReleaseDegrees,
      continuationStartedAtPresentationMs: null,
      continuationStartedAtImpactClockMs: null,
      bodyRestartedAtRelease: false,
      continuationPlanIdentityPreserved: null,
      continuationElapsedPreserved: null,
      weaponArmContactConstrained: false,
    });
    return Object.freeze({ ...handoff, handoffPublished: true, armedReports: armed.reports });
  }

  function resolveContact({
    previousBlade,
    currentBlade,
    deltaSeconds,
    attackSnapshot,
    selectedMode,
    selectedDirection,
    shieldLeadMotion,
  } = {}) {
    if (!previousBlade || !attackSnapshot?.action || firstContact) return null;
    const currentShieldSurface = readShieldSurface();
    const geometricContact = probeSweptSwordBucklerContact({
      previousBlade,
      currentBlade,
      bucklerSurface: currentShieldSurface,
      deltaSeconds,
      active: true,
    });
    // Observer-only moving-shield classification. Production contact authority remains the probe
    // above; this second solve only removes the measured shield translation from the sword sweep
    // so a hitch miss can be classified without injecting or accepting a synthetic contact.
    const measuredShieldTranslation = previousShieldCenter && currentShieldSurface?.center
      ? {
          x: currentShieldSurface.center.x - previousShieldCenter.x,
          y: currentShieldSurface.center.y - previousShieldCenter.y,
          z: currentShieldSurface.center.z - previousShieldCenter.z,
        }
      : null;
    if (currentShieldSurface?.center) {
      previousShieldCenter = {
        x: Number(currentShieldSurface.center.x) || 0,
        y: Number(currentShieldSurface.center.y) || 0,
        z: Number(currentShieldSurface.center.z) || 0,
      };
    }
    const shieldTranslation = shieldLeadMotion?.translation || measuredShieldTranslation;
    const relativePreviousBlade = shieldTranslation
      ? previousBlade.map((point) => ({
          x: point.x + (Number(shieldTranslation.x) || 0),
          y: point.y + (Number(shieldTranslation.y) || 0),
          z: point.z + (Number(shieldTranslation.z) || 0),
        }))
      : null;
    const relativeMovingShieldContact = relativePreviousBlade
      ? probeSweptSwordBucklerContact({
          previousBlade: relativePreviousBlade,
          currentBlade,
          bucklerSurface: currentShieldSurface,
          deltaSeconds,
          active: true,
        })
      : null;
    const relativeMovingShieldDiagnostic = relativeMovingShieldContact
      ? Object.freeze({
          contact: relativeMovingShieldContact.contact === true,
          geometricContact: relativeMovingShieldContact.geometricContact === true,
          reason: relativeMovingShieldContact.reason || null,
          sweepAlpha: relativeMovingShieldContact.sweepAlpha ?? null,
          closestApproach: relativeMovingShieldContact.diagnostics?.closestApproach || null,
          shieldTranslation: Object.freeze({
            x: Number(shieldTranslation.x) || 0,
            y: Number(shieldTranslation.y) || 0,
            z: Number(shieldTranslation.z) || 0,
          }),
          shieldTranslationMeters: Math.hypot(
            Number(shieldTranslation.x) || 0,
            Number(shieldTranslation.y) || 0,
            Number(shieldTranslation.z) || 0,
          ),
          shieldAngularRadians: shieldLeadMotion?.angularRadians ?? null,
          translationSource: shieldLeadMotion?.translation ? 'parry-lead-sampler' : 'director-measured',
          authority: 'observer-only-relative-translation-sweep',
        })
      : null;
    let contactEvaluation = evaluateSweptContactTemporalEligibility({
      contactReport: Object.freeze({
        ...geometricContact,
        diagnostics: Object.freeze({
          ...(geometricContact.diagnostics || {}),
          relativeMovingShieldTranslation: relativeMovingShieldDiagnostic,
        }),
      }),
      attackSnapshot,
      deltaSeconds,
      fallbackEligible: attackSnapshot.phase === LONGSWORD_ATTACK_PHASES.ACTIVE,
    });
    // R19P.1: when the blade misses a shield that is deliberately holding in front (the close
    // posture), the hilt gets its turn before the body does. Same swept solver, same temporal
    // eligibility, authored zone - and only in block mode, because a parry is a committed action
    // with its own contract. On a clang the evaluation is replaced wholesale, so everything
    // downstream - the whiff observer, the combat resolution, the block reaction, the recoil and
    // the ground transfer - runs the ordinary shield-contact path without knowing the difference.
    const currentHiltPoint = readAttackerHiltPoint?.() || null;
    const hiltPointBefore = previousHiltPoint;
    previousHiltPoint = currentHiltPoint;
    if (!contactEvaluation.contact
      && selectedMode !== 'parry'
      && readCloseRangePosture?.()?.posture === 'hold-at-neutral') {
      const clangReport = probeHiltClangContact({
        previousHilt: buildHiltPolyline(hiltPointBefore, previousBlade[0]),
        currentHilt: buildHiltPolyline(currentHiltPoint, currentBlade?.[0]),
        bucklerSurface: currentShieldSurface,
        deltaSeconds,
      });
      observe.hiltClangProbed?.(clangReport, attackSnapshot);
      if (clangReport?.hiltClang) {
        const clangEvaluation = evaluateSweptContactTemporalEligibility({
          contactReport: clangReport,
          attackSnapshot,
          deltaSeconds,
          fallbackEligible: attackSnapshot.phase === LONGSWORD_ATTACK_PHASES.ACTIVE,
        });
        if (clangEvaluation.contact) contactEvaluation = clangEvaluation;
      }
    }
    // R19Y.1: a shield behind the body guards nothing. "Asked first" always carried the premise
    // that the shield is between the blade and the body; when the attacker and the body stand on
    // the same side of the shield plane, that premise is false and any shield contact - blade or
    // clang alike - is the back-turned artifact the B3 investigation measured (4/4 phantom
    // blocks through the defender's own torso). The evaluation is flipped to a non-contact with
    // its reason stated, and the ordinary no-contact path then asks the body, so a backstab
    // lands through the very code that always handled a missed shield.
    if (contactEvaluation.contact) {
      const depthOrder = decideContactDepthOrder({
        attackerPoint: readAttackerRootPoint?.(),
        bodyPoint: readDefenderBodyPoint?.(),
        shieldSurface: currentShieldSurface,
      });
      if (depthOrder.order === 'body-first') {
        contactEvaluation = Object.freeze({
          ...contactEvaluation,
          contact: false,
          eligible: contactEvaluation.eligible,
          reason: 'shield-behind-the-body-guards-nothing',
          depthOrder,
        });
      }
    }
    // Announced before the contact branch, because the caller's whiff diagnostics read the parry
    // gate's armed state and the confirmation below is what consumes it.
    observe.contactEvaluated?.(contactEvaluation, attackSnapshot);
    if (!contactEvaluation.contact) {
      // The shield was not there. Whatever is behind it now gets its turn - and only now, because
      // a blade the guard caught never reaches the body at all.
      const hurtbox = readDefenderHurtbox?.() || null;
      const bodyContact = hurtbox
        ? probeBodyHurtboxContact({
            previousBlade,
            currentBlade,
            hurtbox,
            deltaSeconds,
            active: contactEvaluation.eligible !== false,
          })
        : null;
      if (bodyContact) bodyHit = nearerBodyReading(bodyHit, bodyContact);
      if (bodyContact?.contact !== true) {
        return Object.freeze({ contactEvaluation, contacted: false, bodyContact, event: null });
      }
      firstContact = contactEvaluation;
      observe.bodyStruck?.(bodyContact);
      return Object.freeze({
        contactEvaluation,
        contacted: false,
        bodyContact,
        event: Object.freeze({
          type: 'body-struck',
          band: bodyContact.band,
          point: bodyContact.point,
        }),
      });
    }

    firstContact = contactEvaluation;
    const surfaceAtContact = readShieldSurface();
    surfaceAtContactForRelease = surfaceAtContact;
    const predictiveHandoff = takePredictiveHandoff();
    confirmation = selectedMode === 'parry'
      ? confirmParry({ attackSnapshot, contact: contactEvaluation })
      : null;
    const parryConfirmed = confirmation?.accepted === true;

    // The impact snapshot is the base every later pose blends from - captured before the combat
    // resolution can move anything.
    frozenContactPose = captureRigPose(attackerRig);
    combatResult = resolveCombat({
      contact: contactEvaluation,
      guardIntentAgeMs: parryConfirmed ? GUARD_INTENT_AGE_MS.parry : GUARD_INTENT_AGE_MS.block,
      defenderPresentationOffsetSeconds: predictiveHandoff?.accepted
        ? predictiveHandoff.defenderPresentationOffsetSeconds
        : undefined,
    });
    if (!combatResult.accepted) {
      frozenContactPose = null;
      return Object.freeze({
        contactEvaluation,
        contacted: true,
        surfaceAtContact,
        predictiveHandoff,
        confirmation,
        combatResult,
        frozenContactPose: null,
        event: Object.freeze({ type: 'contact-rejected', reason: combatResult.reason || null }),
      });
    }
    observe.impactResolved?.();
    const outcome = combatResult.resolution.outcome;

    let event = null;
    let combatUpdate = null;
    let gripReport = null;

    if (outcome === 'parry' && parryConfirmed) {
      combatUpdate = updateCombat(0);
      observe.attackerPresentationRefreshed?.();
      gripReport = gripConstraint.start({
        contact: contactEvaluation,
        surfaceAtContact,
        shieldLeadMotion,
        attackDirection: selectedDirection,
        reactionIntentActiveAtImpact: true,
      });
      leadHandoff = Object.freeze({
        stage: COMMITTED_PARRY_CONTACT_GATE_STAGE,
        accepted: gripReport.accepted === true,
        shieldMovingAtContact: shieldLeadMotion?.moving === true,
        postContactHoldMs: 0,
        realSweptContact: true,
        shieldSwordGripStage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
        modifiedBone: 'wrist.r',
        proximalAssistBone: 'upperarm.r',
        assistBone: 'lowerarm.r',
        propagatedBones: Object.freeze(['hand.r', 'handslot.r']),
        elbowPropagationActive: true,
        shoulderPropagationActive: false,
        b3BodyClockStartedAtImpact: true,
        oldB3ReleaseStartPresentationMs: null,
        attackerReactionDefinitionId: combatResult.attackerReaction?.id || null,
        oldB3PlanBackwardPitchDegrees:
          combatResult.attackerReaction?.silhouette?.backwardPitchDegrees ?? null,
        oldB3ImpulsePeakMs: combatResult.attackerReaction?.timeline?.impulsePeakMs ?? null,
        oldB3InitialElapsedMs: combatResult.attackerReaction?.initialElapsedMs ?? null,
        reactionDefinitionSelectedAtImpact: true,
        fullOldB3ReactionIntentActiveAtImpact: false,
        contactConstraintOwnsUntilDeflectImpulse: true,
        handoffConsumedByOldB3: false,
        continuationStartedAtPresentationMs: null,
        continuationStartedAtImpactClockMs: null,
        bodyRestartedAtRelease: false,
        continuationPlanIdentityPreserved: null,
        continuationElapsedPreserved: null,
        weaponArmContactConstrained: true,
        contactBasePoseAuthority: 'authoritative-impact-rig-snapshot',
        noPresetMotionCurve: true,
        authority: 'confirmed-impact-starts-old-b3-body-while-contact-owns-weapon-arm-until-deflect-impulse',
      });
      transfer = Object.freeze({
        accepted: gripReport.accepted === true,
        reason: gripReport.reason || null,
        stage: gripReport.stage || LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
        tangentAuthority: gripReport.plan?.tangentAuthority || null,
        initialDeflectionDirection: gripReport.plan?.initialDeflectionDirection || null,
        modifiedBone: gripReport.modifiedBone || null,
        proximalAssistBone: gripReport.proximalAssistBone || null,
        propagatedBones: gripReport.propagatedBones || null,
        b3BodyClockStartedAtImpact: true,
        attackerReactionDefinitionId: combatResult.attackerReaction?.id || null,
        oldB3PlanBackwardPitchDegrees:
          combatResult.attackerReaction?.silhouette?.backwardPitchDegrees ?? null,
        oldB3ImpulsePeakMs: combatResult.attackerReaction?.timeline?.impulsePeakMs ?? null,
        oldB3InitialElapsedMs: combatResult.attackerReaction?.initialElapsedMs ?? null,
        reactionDefinitionSelectedAtImpact: true,
        fullOldB3ReactionIntentActiveAtImpact: false,
        contactConstraintOwnsUntilDeflectImpulse: true,
        weaponArmContactConstrained: true,
        contactBasePoseAuthority: 'authoritative-impact-rig-snapshot',
        noPresetMotionCurve: true,
        authority: leadHandoff.authority,
      });
      // The constraint owns the shield arm now; the reach ladder holding a pose nothing is
      // driving would fight it.
      releaseReachOwnership();
      event = Object.freeze({
        type: transfer.accepted ? 'parry-live-started' : 'parry-live-rejected',
        reason: transfer.reason,
      });
    } else if (outcome === 'block') {
      combatUpdate = updateCombat(0);
      observe.attackerPresentationRefreshed?.();
      const armed = armReaction({
        outcome: 'block',
        contactPoint: firstContact?.point,
        surfaceNormal: surfaceAtContact?.normal,
        incomingVelocity: fallbackIncomingVelocity(selectedDirection),
      });
      blockReaction = Object.freeze({
        outcome: 'block',
        startedAtImpact: true,
        liveGripConstraint: false,
        armFlingArmed: armed.reports.armFling?.accepted !== false,
        attackerRootMeters: finiteOrNull(armed.reports.rootDisplacement?.attacker?.peakMeters),
        defenderRootMeters: finiteOrNull(armed.reports.rootDisplacement?.defender?.peakMeters),
        authority: 'blocked-rebound-runs-from-impact-with-no-contact-constraint',
      });
      event = Object.freeze({ type: 'block-reacted', armedReports: armed.reports });
    } else if (selectedMode === 'parry') {
      event = Object.freeze({
        type: 'parry-failed-to-block',
        reason: confirmation?.reason || 'parry gate was not confirmed',
      });
    }

    return Object.freeze({
      contactEvaluation,
      contacted: true,
      surfaceAtContact,
      predictiveHandoff,
      confirmation,
      combatResult,
      combatUpdate,
      gripReport,
      frozenContactPose,
      event,
    });
  }

  // The attacker's half of the frame. While the constraint owns the weapon arm, the body runs on
  // the live-contact channels with the impulse peak latched and the attacker's interruption held,
  // and the excitation the release impulse will be built from is tracked at its peak. After
  // release, the plain update runs, the handoff consumption is watched for, the release blend
  // clock advances, and the reaction writers land in the director's order.
  function advanceCombat({ deltaSeconds, deltaMs } = {}) {
    lastDeltaMs = deltaMs;
    if (ownsLiveContact()) {
      reactionDirector.trackExcitation({ bucklerSurface: readShieldSurface(), deltaSeconds });
      const combatUpdate = updateCombat(deltaSeconds, {
        attackerRecoilChannels: TWO_ACTOR_PARRY_REACTION_CHANNELS.LIVE_CONTACT_BODY,
        attackerRecoilPhaseLatch: TWO_ACTOR_PARRY_REACTION_PHASE_LATCHES.LIVE_CONTACT_IMPULSE_PEAK,
        holdAttackerInterruption: true,
      });
      return Object.freeze({
        combatUpdate,
        liveConstraintNeedsUpdate: gripConstraint.active,
        armJoined: null,
        attackerReaction: null,
        justCompleted: false,
      });
    }

    const combatUpdate = updateCombat(deltaSeconds);
    let armJoined = null;
    const handoffConsumed = combatUpdate?.recoilUpdate?.postCouplingHandoffApplied === true;
    if (handoffConsumed && transfer?.releasedToOldB3 === true && transfer.handoffConsumedByOldB3 !== true) {
      const phaseClock = combatUpdate.recoilUpdate.phaseClock
        || combatUpdate.recoilUpdate.snapshot?.phaseClock
        || null;
      const appliedHandoff = combatUpdate.recoilUpdate.postCouplingHandoff
        || combatUpdate.recoilUpdate.snapshot?.postCouplingHandoff
        || null;
      transfer = Object.freeze({
        ...transfer,
        handoffConsumedByOldB3: true,
        continuationStartedAtPresentationMs: phaseClock?.previousElapsedMs ?? null,
        continuationStartedAtImpactClockMs: combatUpdate.parryReactionClock?.elapsedMs ?? null,
        bodyRestartedAtRelease: false,
        continuationPlanIdentityPreserved: appliedHandoff?.planIdentityPreserved === true,
        continuationElapsedPreserved: appliedHandoff?.presentationElapsedPreserved === true,
        weaponArmJoinedOldB3AtDeflectImpulse: true,
        authority: 'deflect-impulse-continuity-bridge-weapon-arm-joins-running-old-b3',
      });
      armJoined = Object.freeze({
        continuedFromPresentationMs: phaseClock?.previousElapsedMs ?? null,
        bridgeMs: releaseBlend?.durationMs ?? null,
      });
    }
    if (releaseBlend) releaseBlend.elapsedMs += deltaMs;
    const attackerReaction = reactionDirector.advanceAttacker(deltaMs, {
      torsoWeight: readCombatSnapshot().attackerRecoil?.sample?.weights?.torsoWeight ?? 1,
    });
    const justCompleted = combatUpdate?.justCompleted === true;
    if (justCompleted) reactionDirector.reset();
    return Object.freeze({
      combatUpdate,
      liveConstraintNeedsUpdate: false,
      armJoined,
      attackerReaction,
      justCompleted,
    });
  }

  // The constraint runs after the defender's guard rebuild - it corrects against the shield as it
  // now stands. If it is holding, release is attempted every frame; the gates decide.
  function advanceConstraint({ deltaSeconds, selectedDirection, previousGripHolding } = {}) {
    const gripReport = gripConstraint.update(deltaSeconds, {
      surfaceAtFrame: readShieldSurface(),
      reactionIntentAppliedBeforeConstraint: true,
    });
    if (!gripReport?.holding) return Object.freeze({ gripReport, holding: false, release: null, passed: null });
    const passed = gripReport.inspectionPassed === true;
    const releaseResult = ownsLiveContact()
      ? release({
          selectedDirection,
          gripReport,
          // The handoff builder wants the surface as it stood at contact, not as it stands now.
          surfaceAtContact: surfaceAtContactForRelease,
        })
      : null;
    return Object.freeze({
      gripReport,
      holding: true,
      wasHolding: previousGripHolding === true,
      passed,
      release: releaseResult,
    });
  }

  function reset() {
    previousShieldCenter = null;
    reactionDirector.reset();
    firstContact = null;
    bodyHit = null;
    confirmation = null;
    combatResult = null;
    transfer = null;
    leadHandoff = null;
    releaseBlend = null;
    blockReaction = null;
    latchedDefenderGate = null;
    frozenContactPose = null;
    surfaceAtContactForRelease = null;
  }

  // The same release path advanceConstraint drives every frame, exposed for a caller that wants
  // to attempt it directly; the gates inside decide either way.
  function releaseToOldB3({ selectedDirection, gripReport } = {}) {
    return release({ selectedDirection, gripReport, surfaceAtContact: surfaceAtContactForRelease });
  }

  return Object.freeze({
    stage: CONTACT_LIFECYCLE_DIRECTOR_STAGE,
    resolveContact,
    advanceCombat,
    releaseToOldB3,
    advanceDefender,
    advanceConstraint,
    defenderReleaseGate,
    ownsLiveContact,
    reset,
    get transfer() { return transfer; },
    get leadHandoff() { return leadHandoff; },
    get releaseBlend() { return releaseBlend; },
    get blockReaction() { return blockReaction; },
    get latchedDefenderGate() { return latchedDefenderGate; },
    get firstContact() { return firstContact; },
    get bodyHit() { return bodyHit; },
    get confirmation() { return confirmation; },
    get combatResult() { return combatResult; },
    get frozenContactPose() { return frozenContactPose; },
    authority: 'stages-the-lifecycle-the-swept-probe-already-decided',
  });
}
