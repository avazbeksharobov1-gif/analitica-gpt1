(function () {
  function createGalaxy(canvas) {
    const ctx = canvas.getContext('2d');
    const particles = [];
    const particleCount = 2600;
    const state = {
      width: 0,
      height: 0,
      targetX: 0,
      targetY: 0,
      centerX: 0,
      centerY: 0,
      t: 0
    };

    function resize() {
      state.width = window.innerWidth;
      state.height = window.innerHeight;
      canvas.width = state.width;
      canvas.height = state.height;
      if (!state.targetX && !state.targetY) {
        state.targetX = state.width * 0.5;
        state.targetY = state.height * 0.5;
      }
      state.centerX = state.targetX;
      state.centerY = state.targetY;
    }

    function seedParticles() {
      particles.length = 0;
      for (let i = 0; i < particleCount; i += 1) {
        const r = Math.sqrt(Math.random()) * 120;
        const a = Math.random() * Math.PI * 2;
        particles.push({
          baseR: r,
          angle: a,
          spin: (Math.random() * 0.012 + 0.004) * (Math.random() < 0.5 ? -1 : 1),
          noise: Math.random() * 14,
          size: Math.random() * 1.35 + 0.2,
          alpha: Math.random() * 0.75 + 0.15
        });
      }
    }

    function setTarget(x, y) {
      state.targetX = x;
      state.targetY = y;
    }

    function tick() {
      state.t += 0.01;
      state.centerX += (state.targetX - state.centerX) * 0.12;
      state.centerY += (state.targetY - state.centerY) * 0.12;

      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, 0, state.width, state.height);

      const g = ctx.createRadialGradient(
        state.centerX,
        state.centerY,
        8,
        state.centerX,
        state.centerY,
        170
      );
      g.addColorStop(0, 'rgba(215,170,255,0.20)');
      g.addColorStop(0.45, 'rgba(166,104,245,0.12)');
      g.addColorStop(1, 'rgba(30,12,56,0.0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(state.centerX, state.centerY, 170, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        p.angle += p.spin;
        const wave = Math.sin(state.t * 1.8 + p.angle * 3.2) * p.noise;
        const r = p.baseR + wave;
        const x = state.centerX + Math.cos(p.angle) * r;
        const y = state.centerY + Math.sin(p.angle) * r;

        ctx.beginPath();
        ctx.fillStyle = `hsla(${265 + Math.sin(p.angle * 2) * 14}, 95%, 76%, ${p.alpha})`;
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(tick);
    }

    resize();
    seedParticles();
    window.addEventListener('resize', () => {
      resize();
      seedParticles();
    });
    requestAnimationFrame(tick);

    return { setTarget };
  }

  window.createGalaxy = createGalaxy;
})();
