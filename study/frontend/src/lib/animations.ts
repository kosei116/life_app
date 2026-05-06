// 旧 combi の playCelebrateAnimation / triggerButtonRipple を TS 化

export function playCelebrate(x?: number, y?: number, palette?: string[]) {
  const container = document.createElement('div');
  container.className = 'celebrate';
  const vx = typeof x === 'number' ? x : window.innerWidth / 2;
  const vy = typeof y === 'number' ? y : window.innerHeight * 0.22;
  container.style.left = `${vx}px`;
  container.style.top = `${vy}px`;
  container.style.transform = 'translate(-50%, -50%)';
  const burst = document.createElement('div');
  burst.className = 'burst';
  container.appendChild(burst);
  const colors = palette ?? ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  const count = 18;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const angle = (Math.PI * 2 * i) / count;
    const dist = 56 + Math.random() * 36;
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    p.style.background = colors[i % colors.length]!;
    p.style.animationDelay = `${Math.random() * 140}ms`;
    burst.appendChild(p);
  }
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 950);
}

export function triggerRipple(btn: HTMLElement, clientX?: number, clientY?: number) {
  const rect = btn.getBoundingClientRect();
  const x = clientX ?? rect.left + rect.width / 2;
  const y = clientY ?? rect.top + rect.height / 2;
  const span = document.createElement('span');
  span.className = 'ripple';
  span.style.left = `${x - rect.left}px`;
  span.style.top = `${y - rect.top}px`;
  btn.appendChild(span);
  setTimeout(() => span.remove(), 700);
}

export const PALETTE_GREEN = ['#10b981', '#34d399', '#6ee7b7', '#22c55e'];
export const PALETTE_BLUE = ['#3b82f6', '#60a5fa', '#0ea5e9', '#38bdf8'];
