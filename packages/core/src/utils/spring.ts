export interface SpringConfig {
  damping?: number;
  mass?: number;
  stiffness?: number;
  overshootClamping?: boolean;
}

export function spring({
  frame,
  fps,
  config,
  from = 0,
  to = 1,
}: {
  frame: number;
  fps: number;
  config?: SpringConfig;
  from?: number;
  to?: number;
}): number {
  const damping = config?.damping ?? 10;
  const mass = config?.mass ?? 1;
  const stiffness = config?.stiffness ?? 100;
  const overshootClamping = config?.overshootClamping ?? false;

  const dt = 1 / fps;
  const target = 1;

  // State: position and velocity
  let x = 0;
  let v = 0;

  const totalFrames = Math.ceil(frame);

  // RK4 integration
  for (let i = 0; i < totalFrames; i++) {
    const acceleration = (t_x: number, t_v: number) =>
      (-stiffness * (t_x - target) - damping * t_v) / mass;

    const k1v = acceleration(x, v);
    const k1x = v;

    const k2v = acceleration(x + k1x * dt * 0.5, v + k1v * dt * 0.5);
    const k2x = v + k1v * dt * 0.5;

    const k3v = acceleration(x + k2x * dt * 0.5, v + k2v * dt * 0.5);
    const k3x = v + k2v * dt * 0.5;

    const k4v = acceleration(x + k3x * dt, v + k3v * dt);
    const k4x = v + k3v * dt;

    x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
  }

  if (overshootClamping) {
    x = Math.max(0, Math.min(1, x));
  }

  return from + x * (to - from);
}
