import Matter, { Body } from "matter-js";

export type ShakeSample = {
  axisX: number;
  axisY: number;
  z: number;
};

export type ShakeImpulse = {
  deltaX: number;
  deltaY: number;
  intensity: number;
};

const SHAKE_DELTA_THRESHOLD = 0.95;
const SHAKE_INTENSITY_RANGE = 1.25;
const SHAKE_IMPULSE_MIN = 2.2;
const SHAKE_IMPULSE_MAX = 6.1;
const SHAKE_COOLDOWN_MS = 520;
const SHAKE_PLANAR_DEADZONE = 0.16;
const MAX_SHAKE_SPEED = 10.5;
const MAX_SHAKE_ANGULAR_SPEED = 0.2;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(min, Math.min(max, value));
}

export function detectShakeImpulse(
  previous: ShakeSample | null,
  next: ShakeSample,
  now: number,
  lastShakeAt: number,
): ShakeImpulse | null {
  if (!previous || now - lastShakeAt < SHAKE_COOLDOWN_MS) {
    return null;
  }

  const deltaX = next.axisX - previous.axisX;
  const deltaY = next.axisY - previous.axisY;
  const deltaZ = next.z - previous.z;
  const movement = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);

  if (movement < SHAKE_DELTA_THRESHOLD) {
    return null;
  }

  return {
    deltaX,
    deltaY,
    intensity: clamp((movement - SHAKE_DELTA_THRESHOLD) / SHAKE_INTENSITY_RANGE, 0, 1),
  };
}

export function applyShakeImpulseToBodies(bodies: Matter.Body[], impulse: ShakeImpulse) {
  const planarMagnitude = Math.hypot(impulse.deltaX, impulse.deltaY);
  const strength =
    SHAKE_IMPULSE_MIN + impulse.intensity * (SHAKE_IMPULSE_MAX - SHAKE_IMPULSE_MIN);

  bodies.forEach((body) => {
    if (body.label !== "photo" || body.isStatic) {
      return;
    }

    const fallbackDirection = body.id % 2 === 0 ? 1 : -1;
    const directionX =
      planarMagnitude > SHAKE_PLANAR_DEADZONE
        ? impulse.deltaX / planarMagnitude
        : fallbackDirection * 0.65;
    const directionY =
      planarMagnitude > SHAKE_PLANAR_DEADZONE ? impulse.deltaY / planarMagnitude : -0.7;
    const bodyVariance = 0.86 + (body.id % 4) * 0.07;

    Body.setVelocity(body, {
      x: clamp(body.velocity.x + directionX * strength * bodyVariance, -MAX_SHAKE_SPEED, MAX_SHAKE_SPEED),
      y: clamp(body.velocity.y + directionY * strength * bodyVariance, -MAX_SHAKE_SPEED, MAX_SHAKE_SPEED),
    });
    Body.setAngularVelocity(
      body,
      clamp(
        body.angularVelocity + fallbackDirection * (0.06 + impulse.intensity * 0.09),
        -MAX_SHAKE_ANGULAR_SPEED,
        MAX_SHAKE_ANGULAR_SPEED,
      ),
    );
  });
}
