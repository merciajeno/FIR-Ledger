const BACKEND_URL = 'http://localhost:3000';

const citizenModeBtn = document.getElementById('citizen-mode');
const officerModeBtn = document.getElementById('officer-mode');
const citizenSection = document.getElementById('citizen-section');
const officerSection = document.getElementById('officer-section');

const caseTextEl = document.getElementById('case-text');
const submitCaseBtn = document.getElementById('submit-case-btn');
const submitStatusEl = document.getElementById('submit-status');
const generatedCodeEl = document.getElementById('generated-code');

const progressCodeEl = document.getElementById('progress-code');
const checkProgressBtn = document.getElementById('check-progress-btn');
const progressResultEl = document.getElementById('progress-result');

const officerIdEl = document.getElementById('officer-id');
const officerLoginBtn = document.getElementById('login-officer-btn');
const officerStatusEl = document.getElementById('officer-status');
const officerDashboard = document.getElementById('officer-dashboard');
const officerCasesListEl = document.getElementById('officer-cases-list');

citizenModeBtn.addEventListener('click', () => setMode('citizen'));
officerModeBtn.addEventListener('click', () => setMode('officer'));
submitCaseBtn.addEventListener('click', submitCaseHandler);
checkProgressBtn.addEventListener('click', checkProgressHandler);
officerLoginBtn.addEventListener('click', officerLoginHandler);
officerCasesListEl.addEventListener('click', handleOfficerCaseAction);

setMode('citizen');
registerServiceWorker();

function setMode(mode) {
  const isCitizen = mode === 'citizen';
  citizenSection.classList.toggle('hidden', !isCitizen);
  officerSection.classList.toggle('hidden', isCitizen);
  citizenModeBtn.classList.toggle('active', isCitizen);
  officerModeBtn.classList.toggle('active', !isCitizen);
}

function setStatus(element, message, type = 'none') {
  element.textContent = message;
  element.className = `status ${type}`.trim();
  element.classList.remove('hidden');
}

function getLocalStorageCases() {
  try {
    return JSON.parse(localStorage.getItem('caseTrackerLocal') || '{}');
  } catch {
    return {};
  }
}

function saveLocalCase(code, caseData) {
  const cases = getLocalStorageCases();
  cases[code] = caseData;
  localStorage.setItem('caseTrackerLocal', JSON.stringify(cases));
}

function getLocalCase(code) {
  const cases = getLocalStorageCases();
  return cases[code] || null;
}

async function generateCaseCode(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(digest)).slice(0, 6);
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function submitCaseHandler() {
  const description = caseTextEl.value.trim();
  if (!description) {
    setStatus(submitStatusEl, 'Please enter your case details before submitting.', 'error');
    return;
  }

  submitCaseBtn.disabled = true;
  setStatus(submitStatusEl, 'Submitting case…', 'loading');

  const caseCode = await generateCaseCode(description + Date.now());
  const payload = { description, caseCode };

  try {
    const response = await fetch(`${BACKEND_URL}/cases/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Backend returned an error');
    }

    const result = await response.json();
    const returnedCode = result.caseCode || caseCode;
    saveLocalCase(returnedCode, {
      description,
      status: result.status || 'Submitted',
      createdAt: new Date().toISOString()
    });
    showGeneratedCode(returnedCode);
    setStatus(submitStatusEl, 'Case submitted successfully. Save your case code to check progress later.', 'success');
  } catch (error) {
    saveLocalCase(caseCode, {
      description,
      status: 'Submitted offline',
      createdAt: new Date().toISOString()
    });
    showGeneratedCode(caseCode);
    setStatus(submitStatusEl, 'Backend not reachable. Case saved locally and you can retry when online.', 'error');
    console.error('Submit case failed:', error);
  } finally {
    submitCaseBtn.disabled = false;
  }
}

function showGeneratedCode(code) {
  generatedCodeEl.textContent = `Your case lookup code: ${code}`;
  generatedCodeEl.classList.remove('hidden');
}

async function checkProgressHandler() {
  const code = progressCodeEl.value.trim();
  if (!code) {
    setStatus(progressResultEl, 'Please enter a case code before looking up progress.', 'error');
    return;
  }

  checkProgressBtn.disabled = true;
  setStatus(progressResultEl, 'Checking progress…', 'loading');

  try {
    const response = await fetch(`${BACKEND_URL}/cases/progress?code=${encodeURIComponent(code)}`);
    if (!response.ok) {
      throw new Error('Backend returned an error');
    }

    const result = await response.json();
    const details = result.case || result;
    if (!details) {
      throw new Error('No case found');
    }

    setStatus(progressResultEl, `Case status: ${details.status || 'Unknown'}\nDescription: ${details.description || 'No description available'}`, 'success');
  } catch (error) {
    const localCase = getLocalCase(code);
    if (localCase) {
      setStatus(progressResultEl, `Local case found. Status: ${localCase.status}. Description: ${localCase.description}`, 'success');
    } else {
      setStatus(progressResultEl, 'Could not find case progress. Make sure the code is correct and try again later.', 'error');
    }
    console.error('Lookup failed:', error);
  } finally {
    checkProgressBtn.disabled = false;
  }
}

async function officerLoginHandler() {
  const officerId = officerIdEl.value.trim();
  if (!officerId) {
    setStatus(officerStatusEl, 'Please enter your officer ID.', 'error');
    return;
  }

  officerLoginBtn.disabled = true;
  setStatus(officerStatusEl, 'Signing in…', 'loading');

  try {
    const response = await fetch(`${BACKEND_URL}/officer/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ officerId })
    });

    if (!response.ok) {
      throw new Error('Backend returned an error');
    }

    const result = await response.json();
    if (result.success === false) {
      throw new Error('Invalid officer ID');
    }

    officerDashboard.classList.remove('hidden');
    setStatus(officerStatusEl, `Signed in as officer ${officerId}.`, 'success');
    renderOfficerCases(result.cases || []);
  } catch (error) {
    setStatus(officerStatusEl, 'Unable to load officer cases. Backend may be offline.', 'error');
    officerDashboard.classList.add('hidden');
    console.error('Officer login failed:', error);
  } finally {
    officerLoginBtn.disabled = false;
  }
}

function renderOfficerCases(cases) {
  officerCasesListEl.innerHTML = '';

  if (!Array.isArray(cases) || cases.length === 0) {
    const placeholder = document.createElement('p');
    placeholder.className = 'status none';
    placeholder.textContent = 'No assigned cases were returned. Check your officer ID or refresh when online.';
    officerCasesListEl.appendChild(placeholder);
    return;
  }

  cases.forEach((caseItem) => {
    const caseCard = document.createElement('div');
    caseCard.className = 'case-item';
    caseCard.innerHTML = `
      <header>
        <strong>${caseItem.caseId || 'Case'}</strong>
        <span>Status: ${caseItem.status || 'Pending'}</span>
      </header>
      <p><strong>Code:</strong> ${caseItem.caseCode || 'N/A'}</p>
      <p>${caseItem.description || 'No description available.'}</p>
      <label>Response</label>
      <textarea class="response-input" data-case-id="${caseItem.caseId || ''}" placeholder="Write a response for this case..."></textarea>
      <button class="respond-btn" data-case-id="${caseItem.caseId || ''}">Send response</button>
      <div id="response-status-${caseItem.caseId || ''}" class="status none"></div>
    `;
    officerCasesListEl.appendChild(caseCard);
  });
}

function handleOfficerCaseAction(event) {
  const target = event.target;
  if (!target.matches('.respond-btn')) return;

  const caseId = target.dataset.caseId;
  const textarea = officerCasesListEl.querySelector(`textarea[data-case-id="${caseId}"]`);
  if (!textarea) return;

  const responseText = textarea.value.trim();
  if (!responseText) {
    const statusEl = officerCasesListEl.querySelector(`#response-status-${caseId}`);
    if (statusEl) {
      setStatus(statusEl, 'Please enter a response before sending.', 'error');
    }
    return;
  }

  respondToCase(caseId, responseText, target);
}

async function respondToCase(caseId, responseText, button) {
  const statusEl = officerCasesListEl.querySelector(`#response-status-${caseId}`);
  if (!statusEl) return;

  button.disabled = true;
  setStatus(statusEl, 'Sending response…', 'loading');

  try {
    const response = await fetch(`${BACKEND_URL}/officer/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, response: responseText })
    });

    if (!response.ok) {
      throw new Error('Backend returned an error');
    }

    const result = await response.json();
    setStatus(statusEl, result.message || 'Response submitted successfully.', 'success');
  } catch (error) {
    setStatus(statusEl, 'Unable to send response. Try again when online.', 'error');
    console.error('Response failed:', error);
  } finally {
    button.disabled = false;
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .then(() => console.log('Service worker registered.'))
      .catch((error) => console.warn('Service worker registration failed:', error));
  }
}
