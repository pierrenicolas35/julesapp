// --- CONFIGURATION & ETAT ---
const state = {
    apiUrl: localStorage.getItem('jules_api_url') || 'https://jules.googleapis.com/v1alpha',
    apiKey: localStorage.getItem('jules_api_key') || '',
    defaultRepo: localStorage.getItem('jules_default_repo') || '',
    currentSessionId: null,
    pollingIntervalId: null,
    sessions: []
};

// --- DOM ELEMENTS ---
const elements = {
    views: document.querySelectorAll('.view'),
    navItems: document.querySelectorAll('.nav-item'),
    appTitle: document.getElementById('app-title'),

    // Sessions View
    sessionsList: document.getElementById('sessions-list'),
    sessionDetail: document.getElementById('session-detail'),
    btnBackSessions: document.getElementById('btn-back-sessions'),
    detailSessionId: document.getElementById('detail-session-id'),
    detailSessionStatus: document.getElementById('detail-session-status'),
    stepperContainer: document.getElementById('stepper-container'),

    // New Session View
    formNewSession: document.getElementById('form-new-session'),
    inputRepo: document.getElementById('input-repo'),
    inputPrompt: document.getElementById('input-prompt'),
    btnSubmitSession: document.getElementById('btn-submit-session'),
    btnSubmitText: document.querySelector('#btn-submit-session .btn-text'),
    btnSubmitSpinner: document.querySelector('#btn-submit-session .spinner'),

    // Settings View
    formSettings: document.getElementById('form-settings'),
    inputApiUrl: document.getElementById('input-api-url'),
    inputApiKey: document.getElementById('input-api-key'),
    inputDefaultRepo: document.getElementById('input-default-repo'),
    settingsMessage: document.getElementById('settings-message'),
    btnEnableNotifications: document.getElementById('btn-enable-notifications')
};

// --- INIT ---
function init() {
    // Remplir les paramètres avec l'état actuel
    elements.inputApiUrl.value = state.apiUrl;
    elements.inputApiKey.value = state.apiKey;
    elements.inputDefaultRepo.value = state.defaultRepo;
    elements.inputRepo.value = state.defaultRepo;

    // Écouteurs d'événements
    setupNavigation();
    setupForms();
    setupNotifications();
    setupVisibilityChange();

    // Charger la vue par défaut ou demander les paramètres
    if (!state.apiKey) {
        switchView('view-settings', 'Paramètres');
        showSettingsMessage('Veuillez configurer votre clé API pour commencer.', true);
    } else {
        fetchSessions();
    }
}

// --- NAVIGATION ---
function setupNavigation() {
    elements.navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const targetId = item.getAttribute('data-target');
            const title = item.querySelector('span').textContent;

            // Réinitialiser la vue des sessions si on clique sur l'onglet Sessions
            if (targetId === 'view-sessions') {
                showSessionsList();
                fetchSessions();
            }

            switchView(targetId, title);
        });
    });

    elements.btnBackSessions.addEventListener('click', () => {
        stopPolling();
        showSessionsList();
    });
}

function switchView(viewId, title) {
    // Mettre à jour l'UI de la barre d'app et nav
    elements.appTitle.textContent = title;

    elements.navItems.forEach(nav => {
        if (nav.getAttribute('data-target') === viewId) nav.classList.add('active');
        else nav.classList.remove('active');
    });

    // Changer la vue
    elements.views.forEach(view => {
        if (view.id === viewId) view.classList.add('active');
        else view.classList.remove('active');
    });
}

// --- FORMS & SETTINGS ---
function setupForms() {
    elements.formSettings.addEventListener('submit', (e) => {
        e.preventDefault();

        state.apiUrl = elements.inputApiUrl.value.trim();
        state.apiKey = elements.inputApiKey.value.trim();
        state.defaultRepo = elements.inputDefaultRepo.value.trim();

        localStorage.setItem('jules_api_url', state.apiUrl);
        localStorage.setItem('jules_api_key', state.apiKey);
        localStorage.setItem('jules_default_repo', state.defaultRepo);

        elements.inputRepo.value = state.defaultRepo;

        showSettingsMessage('Paramètres sauvegardés avec succès !');
        fetchSessions(); // Rafraîchir les sessions avec la nouvelle clé
    });

    elements.formNewSession.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!state.apiKey) {
            alert("Veuillez configurer votre clé d'API d'abord.");
            switchView('view-settings', 'Paramètres');
            return;
        }

        const repo = elements.inputRepo.value.trim();
        const prompt = elements.inputPrompt.value.trim();

        setLoadingState(true);
        try {
            const session = await createSession(repo, prompt);
            elements.inputPrompt.value = ''; // Reset prompt

            // Switch to sessions view and open detail
            switchView('view-sessions', 'Sessions');
            openSessionDetail(session.name || session.id);
        } catch (error) {
            alert("Erreur lors de la création : " + error.message);
        } finally {
            setLoadingState(false);
        }
    });
}

function showSettingsMessage(msg, isError = false) {
    elements.settingsMessage.textContent = msg;
    elements.settingsMessage.style.backgroundColor = isError ? 'var(--md-sys-color-error)' : 'var(--md-sys-color-primary-container)';
    elements.settingsMessage.style.color = isError ? 'white' : 'var(--md-sys-color-on-primary-container)';
    elements.settingsMessage.classList.remove('hidden');

    if (!isError) {
        setTimeout(() => elements.settingsMessage.classList.add('hidden'), 3000);
    }
}

function setLoadingState(isLoading) {
    elements.btnSubmitSession.disabled = isLoading;
    if (isLoading) {
        elements.btnSubmitText.classList.add('hidden');
        elements.btnSubmitSpinner.classList.remove('hidden');
    } else {
        elements.btnSubmitText.classList.remove('hidden');
        elements.btnSubmitSpinner.classList.add('hidden');
    }
}

// --- API CLIENT ---
async function fetchApi(endpoint, options = {}) {
    if (!state.apiKey) throw new Error("Clé API manquante");

    const url = `${state.apiUrl}${endpoint}`;

    const headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': state.apiKey,
        ...options.headers
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    // Si la réponse est vide (ex: DELETE ou certaines actions), retourner null
    const text = await response.text();
    return text ? JSON.parse(text) : null;
}

async function createSession(repo, prompt) {
    const payload = {
        input: {
            source_repository: repo,
            prompt: prompt
        }
    };

    // Selon la documentation habituelle, POST /sessions
    return fetchApi('/sessions', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

async function fetchSessions() {
    if (!state.apiKey) return;

    try {
        const data = await fetchApi('/sessions');
        state.sessions = data.sessions || [];
        renderSessionsList();
    } catch (error) {
        console.error("Erreur lors du chargement des sessions:", error);
        elements.sessionsList.innerHTML = `<p class="empty-state" style="color:var(--md-sys-color-error)">Erreur de chargement des sessions.</p>`;
    }
}

async function fetchSessionActivities(sessionId) {
    // Remplacer / par %2F si sessionId contient le chemin complet comme 'sessions/123'
    const id = sessionId.startsWith('sessions/') ? sessionId.replace('sessions/', '') : sessionId;
    return fetchApi(`/sessions/${id}/activities`);
}

async function fetchSessionInfo(sessionId) {
    const id = sessionId.startsWith('sessions/') ? sessionId.replace('sessions/', '') : sessionId;
    return fetchApi(`/sessions/${id}`);
}

// --- VIEWS & RENDERING ---
function showSessionsList() {
    elements.sessionDetail.classList.add('hidden');
    elements.sessionsList.classList.remove('hidden');
    state.currentSessionId = null;
}

function getStatusClass(status) {
    const s = (status || '').toLowerCase();
    if (['pending', 'planning', 'in_progress', 'awaiting_input'].includes(s)) return s;
    if (s === 'completed') return 'completed';
    if (['failed', 'cancelled'].includes(s)) return 'failed';
    return 'default';
}

function renderSessionsList() {
    if (!state.sessions.length) {
        elements.sessionsList.innerHTML = '<p class="empty-state">Aucune session trouvée.</p>';
        return;
    }

    elements.sessionsList.innerHTML = state.sessions.map(s => {
        const name = s.name || s.id || 'Session Inconnue';
        const shortName = name.split('/').pop();
        const status = s.state || s.status || 'UNKNOWN';
        const date = s.createTime ? new Date(s.createTime).toLocaleString() : '';

        return `
            <div class="session-card" data-id="${name}">
                <div class="session-card-header">
                    <span class="session-card-title">Session ${shortName}</span>
                    <span class="chip ${getStatusClass(status)}">${status}</span>
                </div>
                ${date ? `<span class="session-card-date">${date}</span>` : ''}
            </div>
        `;
    }).join('');

    // Ajouter les écouteurs de clic
    document.querySelectorAll('.session-card').forEach(card => {
        card.addEventListener('click', () => openSessionDetail(card.getAttribute('data-id')));
    });
}

function openSessionDetail(sessionId) {
    state.currentSessionId = sessionId;
    const shortName = sessionId.split('/').pop();

    elements.sessionsList.classList.add('hidden');
    elements.sessionDetail.classList.remove('hidden');

    elements.detailSessionId.textContent = `Session ${shortName}`;
    elements.detailSessionStatus.textContent = 'CHARGEMENT...';
    elements.detailSessionStatus.className = 'chip default';
    elements.stepperContainer.innerHTML = '<div style="text-align:center; padding: 20px;"><span class="spinner"></span></div>';

    updateSessionDetail();
    startPolling();
}

// EXPORTS to global scope for HTML integration if needed
window.app = {
    init,
    openSessionDetail,
    fetchSessions
};

// Démarrer l'application (le reste des fonctions sera complété à l'étape suivante)
document.addEventListener('DOMContentLoaded', init);

// --- POLLING & PARSING ---
let previousSessionState = null;

function startPolling() {
    stopPolling();
    // 5 seconds interval
    state.pollingIntervalId = setInterval(checkPolling, 5000);
}

function stopPolling() {
    if (state.pollingIntervalId) {
        clearInterval(state.pollingIntervalId);
        state.pollingIntervalId = null;
    }
}

function setupVisibilityChange() {
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === 'visible') {
            if (state.currentSessionId && !state.pollingIntervalId) {
                // Resume polling if on detail view
                updateSessionDetail();
                startPolling();
            }
        } else {
            // Pause polling when app is in background
            stopPolling();
        }
    });
}

function checkPolling() {
    if (document.visibilityState === 'visible' && state.currentSessionId) {
        updateSessionDetail();
    }
}

async function updateSessionDetail() {
    if (!state.currentSessionId) return;

    try {
        const [sessionInfo, activitiesData] = await Promise.all([
            fetchSessionInfo(state.currentSessionId),
            fetchSessionActivities(state.currentSessionId)
        ]);

        renderStepper(sessionInfo, activitiesData);
        checkStateChanges(sessionInfo, activitiesData);

    } catch (error) {
        console.error("Erreur de mise à jour détail session:", error);
        if (elements.stepperContainer.innerHTML.includes('spinner')) {
             elements.stepperContainer.innerHTML = `<p style="color:red">Erreur de chargement. Veuillez vérifier votre clé d'API et l'URL.</p>`;
        }
    }
}

// Extraction sécurisée de texte et de liens (Markdown / JSON strings)
function parseMessageContent(message) {
    if (!message) return '';
    let text = typeof message === 'string' ? message : JSON.stringify(message);

    // Remplacer les liens Markdown [Texte](URL) par des liens HTML
    const mdLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
    text = text.replace(mdLinkRegex, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Détecter des URLs simples si elles ne sont pas déjà en markdown
    const urlRegex = /(?<!href=")(https?:\/\/[^\s]+)(?!")/g;
    text = text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener">$1</a>');

    return text;
}

// Extraction de PR depuis divers formats de l'API
function extractPrUrl(session, activities) {
    if (session && (session.prUrl || session.pullRequestUrl || session.htmlUrl)) {
        return session.prUrl || session.pullRequestUrl || session.htmlUrl;
    }

    if (!activities || !activities.activities) return null;

    for (const act of activities.activities) {
        if (act.type && act.type.includes('PR_CREATED')) {
            if (act.prUrl) return act.prUrl;
        }
        // Chercher profondément dans les propriétés de l'activité
        const actString = JSON.stringify(act);
        const match = actString.match(/"(prUrl|pullRequestUrl|html_url)"\s*:\s*"([^"]+)"/i);
        if (match) return match[2];
    }
    return null;
}

// Vérifier si un plan a été généré
function hasPlan(activities) {
    if (!activities || !activities.activities) return false;

    for (const act of activities.activities) {
        if (act.type && act.type.includes('PLAN')) return true;
        if (act.plan && Array.isArray(act.plan.steps) && act.plan.steps.length > 0) return true;
    }
    return false;
}

function renderStepper(session, activitiesData) {
    const status = session.state || session.status || 'UNKNOWN';
    elements.detailSessionStatus.textContent = status;
    elements.detailSessionStatus.className = `chip ${getStatusClass(status)}`;

    const activities = activitiesData.activities || [];
    let html = '';

    if (activities.length === 0) {
        html = '<div class="step"><div class="step-indicator"><div class="step-icon">1</div></div><div class="step-content"><div class="step-title">Initialisation</div><div class="step-description">En attente des premières activités...</div></div></div>';
    } else {
        html = activities.map((act, index) => {
            const isLast = index === activities.length - 1;
            const actStatus = act.status || act.state || 'COMPLETED';
            let statusClass = 'completed'; // default pour l'historique

            if (isLast && ['PENDING', 'IN_PROGRESS', 'PLANNING'].includes(status)) {
                statusClass = 'active';
            } else if (actStatus === 'FAILED') {
                statusClass = 'failed';
            }

            const title = act.type || act.name || `Étape ${index + 1}`;
            const message = parseMessageContent(act.message || act.description || JSON.stringify(act.payload || act));

            return `
                <div class="step ${statusClass}">
                    <div class="step-indicator">
                        <div class="step-icon">${statusClass === 'completed' ? '✓' : statusClass === 'failed' ? '!' : (index+1)}</div>
                        <div class="step-line"></div>
                    </div>
                    <div class="step-content">
                        <div class="step-title">${title}</div>
                        <div class="step-description">${message}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Si une PR est détectée, ajouter une étape finale distincte
    const prUrl = extractPrUrl(session, activitiesData);
    if (prUrl) {
         html += `
            <div class="step completed" style="margin-top: 16px;">
                <div class="step-indicator">
                    <div class="step-icon" style="background-color: var(--md-sys-color-primary);">🔗</div>
                </div>
                <div class="step-content">
                    <div class="step-title">Pull Request Créée</div>
                    <div class="step-description">
                        <a href="${prUrl}" target="_blank" rel="noopener" class="btn-primary" style="display:inline-flex; border-radius: 8px; padding: 8px 16px; margin-top:8px;">Voir la Pull Request</a>
                    </div>
                </div>
            </div>
        `;
    }

    elements.stepperContainer.innerHTML = html;
}

// Logique pour Notifications et Arrêt Polling
function checkStateChanges(sessionInfo, activitiesData) {
    const currentState = sessionInfo.state || sessionInfo.status || 'UNKNOWN';

    // Initialiser l'état précédent si null
    if (previousSessionState === null) {
        previousSessionState = {
            state: currentState,
            hasPlan: hasPlan(activitiesData),
            prUrl: extractPrUrl(sessionInfo, activitiesData)
        };
        return; // Ne pas notifier au premier chargement
    }

    // Vérifier changements
    const isPlanReady = !previousSessionState.hasPlan && hasPlan(activitiesData);
    const newPrUrl = extractPrUrl(sessionInfo, activitiesData);
    const isPrOpened = !previousSessionState.prUrl && newPrUrl;
    const isFinished = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(currentState);
    const stateChanged = currentState !== previousSessionState.state;

    if (isPlanReady) sendNotification("Plan prêt", "Jules a terminé la planification et commencé l'exécution.");
    if (isPrOpened) sendNotification("Pull Request ouverte !", "La solution est prête à être reviewée.");
    if (stateChanged && isFinished) {
        sendNotification(`Session ${currentState}`, `La tâche s'est terminée avec le statut : ${currentState}`);
    }

    // Mettre à jour état précédent
    previousSessionState = {
        state: currentState,
        hasPlan: hasPlan(activitiesData) || previousSessionState.hasPlan,
        prUrl: newPrUrl || previousSessionState.prUrl
    };

    // Arrêt du polling sur état final
    if (isFinished) {
        stopPolling();
    }
}

// --- NOTIFICATIONS ---
function setupNotifications() {
    // UI Bouton pour forcer l'activation
    if (Notification.permission === 'granted') {
        elements.btnEnableNotifications.textContent = 'Notifications activées';
        elements.btnEnableNotifications.disabled = true;
    } else if (Notification.permission === 'denied') {
        elements.btnEnableNotifications.textContent = 'Notifications bloquées';
        elements.btnEnableNotifications.disabled = true;
    } else {
        elements.btnEnableNotifications.addEventListener('click', requestNotificationPermission);
    }

    // Demander la permission à la première interaction globale si non définie
    const interactHandler = () => {
        if (Notification.permission === 'default') {
            requestNotificationPermission();
        }
        document.removeEventListener('click', interactHandler);
    };
    document.addEventListener('click', interactHandler);
}

async function requestNotificationPermission() {
    if (!('Notification' in window)) return;

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            elements.btnEnableNotifications.textContent = 'Notifications activées';
            elements.btnEnableNotifications.disabled = true;
        } else {
            elements.btnEnableNotifications.textContent = 'Notifications bloquées';
            elements.btnEnableNotifications.disabled = true;
        }
    } catch (error) {
        console.error("Erreur permission notification:", error);
    }
}

function sendNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    // Tenter d'utiliser le Service Worker pour une notification native sur Android
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(registration => {
            registration.showNotification(title, {
                body: body,
                icon: '/icons/icon-192x192.png',
                badge: '/icons/icon-192x192.png',
                vibrate: [200, 100, 200],
                tag: 'jules-update'
            });
        }).catch(err => {
            // Fallback sur l'API Web Notification classique si SW non prêt
            new Notification(title, { body, icon: '/icons/icon-192x192.png' });
        });
    } else {
        new Notification(title, { body, icon: '/icons/icon-192x192.png' });
    }
}

// --- SERVICE WORKER REGISTRATION ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker enregistré', reg.scope))
            .catch(err => console.warn('Erreur SW:', err));
    });
}
