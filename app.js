const BACKEND_URL = 'http://localhost:8000';

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

let currentOfficerId = null;
const FIR_STATUS_OPTIONS = ['PENDING', 'INVESTIGATING', 'CLOSED'];

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
  const stationId = document.getElementById('station-id').value.trim();
  const phoneNumber = document.getElementById('phone-number').value.trim();
  submitCaseBtn.disabled = true;
  setStatus(submitStatusEl, 'Submitting case', 'loading');

  const caseCode = await generateCaseCode(description + Date.now());
  const payload = { phone_number: phoneNumber, text: description, station_id: stationId };

  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/citizen/submit-fir`, {
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
  setStatus(progressResultEl, 'Checking progress', 'loading');

  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/citizen/progress?code=${encodeURIComponent(code)}`);
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
  const password = document.getElementById('officer-password').value.trim();
  if (!officerId) {
    setStatus(officerStatusEl, 'Please enter your station ID.', 'error');
    return;
  }

  officerLoginBtn.disabled = true;
  setStatus(officerStatusEl, 'Signing in�', 'loading');
  console.log('Attempting officer login with ID:', officerId);
  console.log('Password provided:', password);

  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/officer/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ officer_id: officerId, password: password })
    });

    if (!response.ok) {
      throw new Error('Backend returned an error');
    }

    const result = await response.json();
    if (result.success === false) {
      throw new Error('Invalid officer ID or password');
    }

    currentOfficerId = result.officer_id;
    console.log('Officer login successful:', result);
    officerDashboard.classList.remove('hidden');
    setStatus(officerStatusEl, `Signed in as officer ${result.full_name || officerId}.`, 'success');
    fetchOfficerCases(currentOfficerId);
  } catch (error) {
    setStatus(officerStatusEl, 'Unable to load officer cases. Backend may be offline.', 'error');
    officerDashboard.classList.add('hidden');
    console.error('Officer login failed:', error);
  } finally {
    officerLoginBtn.disabled = false;
  }
}

async function fetchOfficerCases(officerId) {
  const listEl = document.getElementById('officer-cases-list');
  listEl.innerHTML = '<p class="status loading">Loading your cases...</p>';

  try {
    // Call the specific endpoint we made to get the officer's cases
    const response = await fetch(`${BACKEND_URL}/api/v1/officer/my-cases?officer_id=${officerId}`);

    if (response.ok) {
      const data = await response.json();
      // Pass the real array of cases to your render function
      renderOfficerCases(data.cases);
    } else {
      listEl.innerHTML = '<p class="status error">Failed to load cases from database.</p>';
    }
  } catch (error) {
    listEl.innerHTML = '<p class="status error">Server error while loading cases.</p>';
  }
}

function renderOfficerCases(cases) {
  const officerCasesListEl = document.getElementById('officer-cases-list');
  officerCasesListEl.innerHTML = '';

  if (!Array.isArray(cases) || cases.length === 0) {
    const placeholder = document.createElement('p');
    placeholder.className = 'status none';
    placeholder.textContent = 'No active cases in your queue. You are all caught up!';
    officerCasesListEl.appendChild(placeholder);
    return;
  }

  cases.forEach((caseItem) => {
    const caseCard = document.createElement('div');
    caseCard.className = 'case-item';

    const statusOptionsHtml = FIR_STATUS_OPTIONS.map((status) => {
      const selected = status === caseItem.current_status ? 'selected' : '';
      return `<option value="${status}" ${selected}>${status}</option>`;
    }).join('');

    caseCard.innerHTML = `
      <header>
        <strong>FIR ID: ${caseItem.fir_id}</strong>
        <span>Status: ${caseItem.current_status}</span>
      </header>
      
      <p style="font-size: 0.85em; color: #94a3b8; word-break: break-all; margin-bottom: 8px;">
        <strong>Secure Hash:</strong> ${caseItem.fir_hash}
      </p>
      
      <p style="margin-bottom: 12px;">
        <strong>Citizen Phone:</strong> ${caseItem.citizen_phone}
      </p>
      
      <div style="background: rgba(15, 23, 42, 0.5); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid rgba(148, 163, 184, 0.1);">
        ${caseItem.original_text}
      </div>
      
      <button class="respond-btn" data-fir-id="${caseItem.fir_id}">
        Action This Case
      </button>

      <div id="action-form-${caseItem.fir_id}" class="action-form hidden" style="margin-top: 18px;">
        <label for="target-status-${caseItem.fir_id}">Update status</label>
        <select id="target-status-${caseItem.fir_id}" class="target-status-select" data-fir-id="${caseItem.fir_id}" style="width:100%;border-radius:14px;border:1px solid rgba(148,163,184,.2);background:rgba(15,23,42,.6);color:#f8fafc;padding:14px 16px;margin-bottom:12px;">
          ${statusOptionsHtml}
        </select>

        <label for="action-details-${caseItem.fir_id}">Officer notes</label>
        <textarea id="action-details-${caseItem.fir_id}" data-case-id="${caseItem.fir_id}" placeholder="Describe action taken or next steps..." style="width:100%;min-height:100px;border-radius:14px;border:1px solid rgba(148,163,184,.2);background:rgba(15,23,42,.6);color:#f8fafc;padding:14px 16px;margin-bottom:12px;"></textarea>

        <button class="send-update-btn" data-fir-id="${caseItem.fir_id}">Send update</button>
        <div id="response-status-${caseItem.fir_id}" class="status none"></div>
      </div>
    `;

    officerCasesListEl.appendChild(caseCard);
  });
}

function handleOfficerCaseAction(event) {
  const target = event.target;

  if (target.matches('.respond-btn')) {
    const caseId = target.dataset.firId;
    const form = officerCasesListEl.querySelector(`#action-form-${caseId}`);
    if (form) form.classList.toggle('hidden');
    return;
  }

  if (target.matches('.send-update-btn')) {
    const caseId = target.dataset.firId;
    const actionForm = officerCasesListEl.querySelector(`#action-form-${caseId}`);
    if (!actionForm) return;

    const statusSelect = actionForm.querySelector('.target-status-select');
    const textarea = actionForm.querySelector(`textarea[data-case-id="${caseId}"]`);
    const targetStatus = statusSelect?.value;
    const responseText = textarea?.value.trim();

    if (!responseText) {
      const statusEl = officerCasesListEl.querySelector(`#response-status-${caseId}`);
      if (statusEl) {
        setStatus(statusEl, 'Please enter a response before sending.', 'error');
      }
      return;
    }

    respondToCase(caseId, targetStatus, responseText, target);
    return;
  }
}

async function respondToCase(caseId, targetStatus, actionDetails, button) {
  const statusEl = officerCasesListEl.querySelector(`#response-status-${caseId}`);
  if (!statusEl) return;

  if (!currentOfficerId) {
    setStatus(statusEl, 'Officer is not signed in. Please log in again.', 'error');
    return;
  }

  button.disabled = true;
  setStatus(statusEl, 'Sending response...', 'loading');

  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/officer/update-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fir_id: parseInt(caseId, 10),
        officer_id: currentOfficerId,
        target_status: targetStatus,
        action_details: actionDetails
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage = errorData?.detail || 'Backend returned an error';
      throw new Error(errorMessage);
    }

    const result = await response.json();
    setStatus(statusEl, result.message || 'Response submitted successfully.', 'success');
  } catch (error) {
    setStatus(statusEl, `Unable to send response: ${error.message}`, 'error');
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