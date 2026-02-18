const canvas = document.getElementById('galaxyCanvas');
const video = document.getElementById('handVideo');
const statusEl = document.getElementById('status');

if (!canvas || !video || !window.createGalaxy || !window.Hands) {
  if (statusEl) statusEl.textContent = 'Required modules are missing.';
} else {
  const galaxy = window.createGalaxy(canvas);
  let lastInference = 0;
  const inferenceIntervalMs = 1000 / 24;
  let lastHandSeenAt = 0;
  let processing = false;

  const hands = new window.Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    selfieMode: true,
    minDetectionConfidence: 0.4,
    minTrackingConfidence: 0.4
  });

  hands.onResults((results) => {
    const landmarks = results.multiHandLandmarks;
    if (!landmarks || !landmarks.length) {
      if (statusEl && Date.now() - lastHandSeenAt > 1500) {
        statusEl.textContent = 'Qo`l topilmadi. Kamerani yorug`roq joyga qarating.';
      }
      return;
    }

    // Index finger tip landmark id = 8
    const tip = landmarks[0][8];
    if (!tip) return;

    const x = (1 - tip.x) * window.innerWidth;
    const y = tip.y * window.innerHeight;
    galaxy.setTarget(x, y);
    lastHandSeenAt = Date.now();
    if (statusEl) statusEl.textContent = 'Qo`l topildi. Harakatni davom eting.';
  });

  async function startHandTracking() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser');
      }

      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 360 }
          }
        });
      } catch (_) {
        // Chrome fallback on some laptops where facingMode constraint fails.
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }

      video.srcObject = stream;
      await new Promise((resolve) => {
        video.onloadedmetadata = () => resolve();
      });
      await video.play();
      if (statusEl) statusEl.textContent = 'Kamera ulandi. Qo`lni ko`rsating...';

      const loop = async (ts) => {
        if (video.readyState < 2) {
          requestAnimationFrame(loop);
          return;
        }

        if (!processing && ts - lastInference >= inferenceIntervalMs) {
          lastInference = ts;
          processing = true;
          try {
            await hands.send({ image: video });
          } catch (e) {
            if (statusEl) statusEl.textContent = `Tracking error: ${e.message || e}`;
          } finally {
            processing = false;
          }
        }
        requestAnimationFrame(loop);
      };

      requestAnimationFrame(loop);
    } catch (err) {
      if (statusEl) statusEl.textContent = `Camera error: ${err.message || err}`;
    }
  }

  startHandTracking();
}
