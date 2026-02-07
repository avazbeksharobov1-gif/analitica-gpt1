async function postJson(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'REQUEST_FAILED');
  return data;
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const err = document.getElementById('loginError');
    err.innerText = '';
    try {
      await postJson('/api/auth/login', { email, password });
      window.location.href = '/dashboard';
    } catch (e2) {
      err.innerText = 'Login xato: ' + e2.message;
    }
  });
}

const registerForm = document.getElementById('registerForm');
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('regEmail').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value;
    const err = document.getElementById('registerError');
    err.innerText = '';
    try {
      await postJson('/api/auth/register', { email, phone, password });
      window.location.href = '/dashboard';
    } catch (e2) {
      err.innerText = 'Registratsiya xato: ' + e2.message;
    }
  });
}
