import * as THREE from 'three';

// Provide supabase globals
const supabaseUrl = 'https://bsrgvxqljgwrjtdapxxy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzcmd2eHFsamd3cmp0ZGFweHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MzI5MzIsImV4cCI6MjA4ODAwODkzMn0.jzZ7SjJWyUiqwc5sh-zRYqGY-sNoc-nCiN-SkGb6fyo';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// --- Game State ---
const state = {
    localId: THREE.MathUtils.generateUUID(),
    name: '',
    color: '#6366f1',
    model: 'capsule',
    players: {}, // remote players { id: { mesh, nametag, targetPos, targetRot, chatElem, chatTimeout, audio } }
    channel: null,
    inGame: false,
    joystickVector: { x: 0, y: 0 },
    localChatElem: null,
    localChatTimeout: null,
    localStream: null,
    peers: {}
};
let audioListener = null;

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Colors for UI
const colors = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
const colorPicker = document.getElementById('color-picker');
colors.forEach(c => {
    const s = document.createElement('div');
    s.className = 'color-swatch';
    s.style.backgroundColor = c;
    if (c === state.color) s.classList.add('selected');
    s.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('selected'));
        s.classList.add('selected');
        state.color = c;
    });
    colorPicker.appendChild(s);
});

// Model Picker
const modelOptions = document.querySelectorAll('.model-option');
modelOptions.forEach(opt => {
    opt.addEventListener('click', () => {
        modelOptions.forEach(el => el.classList.remove('selected'));
        opt.classList.add('selected');
        state.model = opt.getAttribute('data-model');
    });
});

// --- Local Storage check ---
const storedName = localStorage.getItem('neonWorlds_name');
const storedColor = localStorage.getItem('neonWorlds_color');
const storedModel = localStorage.getItem('neonWorlds_model');

if (storedName && storedColor) {
    document.getElementById('new-user-flow').classList.add('hidden');
    document.getElementById('returning-user-flow').classList.remove('hidden');

    // Update model visually if stored
    if (storedModel) {
        state.model = storedModel;
        modelOptions.forEach(el => {
            el.classList.remove('selected');
            if (el.getAttribute('data-model') === storedModel) el.classList.add('selected');
        });
    }

    document.getElementById('saved-name-display').innerText = storedName;
    document.getElementById('saved-name-btn').innerText = storedName;
}

// Returning user - Continue
document.getElementById('btn-continue').addEventListener('click', () => {
    state.name = storedName;
    state.color = storedColor;
    joinGame();
});

// Returning user - Change
document.getElementById('btn-change-name').addEventListener('click', () => {
    document.getElementById('returning-user-flow').classList.add('hidden');
    document.getElementById('new-user-flow').classList.remove('hidden');
});

// New user - Submit
document.getElementById('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('player-name').value.trim();
    if (!nameInput) return;
    state.name = nameInput;
    localStorage.setItem('neonWorlds_name', state.name);
    localStorage.setItem('neonWorlds_color', state.color);
    localStorage.setItem('neonWorlds_model', state.model);
    joinGame();
});

async function joinGame() {
    document.getElementById('new-user-flow').classList.add('hidden');
    document.getElementById('returning-user-flow').classList.add('hidden');
    document.getElementById('loading').classList.remove('hidden');

    try {
        state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        setupMicToggle();
    } catch (err) {
        console.warn('Microphone access denied or not available.', err);
    }

    audioListener = new THREE.AudioListener();

    await startMultiplayer();

    // Prepare UI
    document.getElementById('login-screen').classList.remove('active');
    setTimeout(() => document.getElementById('login-screen').classList.add('hidden'), 500);

    document.getElementById('game-ui').classList.remove('hidden');
    document.getElementById('ui-player-name').innerText = state.name;
    document.getElementById('ui-player-name').style.color = state.color;

    initGameScene();
    initControls();
}


function setupMicToggle() {
    const btn = document.getElementById('mic-toggle-btn');
    btn.style.display = 'block';
    btn.addEventListener('click', () => {
        if (state.localStream) {
            const audioTrack = state.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                if (audioTrack.enabled) {
                    btn.innerText = 'Mute Mic';
                    btn.classList.remove('outline-button');
                    btn.classList.add('glow-button');
                } else {
                    btn.innerText = 'Unmute Mic';
                    btn.classList.remove('glow-button');
                    btn.classList.add('outline-button');
                }
            }
        }
    });
}

function createPeerConnection(remoteId) {
    if (state.peers[remoteId]) return state.peers[remoteId];

    const pc = new RTCPeerConnection(rtcConfig);
    state.peers[remoteId] = pc;

    if (state.localStream) {
        state.localStream.getTracks().forEach(track => {
            pc.addTrack(track, state.localStream);
        });
    }

    pc.onicecandidate = (event) => {
        if (event.candidate && state.channel) {
            state.channel.send({
                type: 'broadcast',
                event: 'rtc_ice',
                payload: {
                    senderId: state.localId,
                    targetId: remoteId,
                    candidate: event.candidate
                }
            });
        }
    };

    pc.ontrack = (event) => {
        if (state.players[remoteId] && state.players[remoteId].audio) {
            const posAudio = state.players[remoteId].audio;
            posAudio.setMediaStreamSource(event.streams[0]);
            if (audioListener) { // required before play
                posAudio.play();
            }
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            pc.close();
            delete state.peers[remoteId];
        }
    };

    return pc;
}

async function initiatePeerConnection(remoteId) {
    if (state.localId < remoteId) return;

    const pc = createPeerConnection(remoteId);
    if (!pc) return;

    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        state.channel.send({
            type: 'broadcast',
            event: 'rtc_offer',
            payload: {
                senderId: state.localId,
                targetId: remoteId,
                offer: offer
            }
        });
    } catch (err) {
        console.error('Error creating WebRTC offer:', err);
    }
}


// --- Chat System ---
document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    input.value = ''; // clear
    input.blur(); // unfocus after sending

    showChatBubble(state.localId, msg);
    appendChatHistory(state.name, state.color, msg);

    // Broadcast Chat via separate event type
    if (state.channel) {
        state.channel.send({
            type: 'broadcast',
            event: 'chat',
            payload: { id: state.localId, msg: msg }
        });
    }
});

let chatActivityTimeout;
function appendChatHistory(sender, color, message) {
    const historyBox = document.getElementById('chat-history-content');
    const line = document.createElement('div');
    line.className = 'chat-line';
    line.innerHTML = `<span class="sender" style="color:${color}">[${sender}]:</span> <span class="text">${message}</span>`;

    historyBox.appendChild(line);
    historyBox.scrollTop = historyBox.scrollHeight;

    // Roblox fade effect logic
    historyBox.classList.add('active');
    if (chatActivityTimeout) clearTimeout(chatActivityTimeout);
    chatActivityTimeout = setTimeout(() => {
        historyBox.classList.remove('active');
    }, 4000);
}

document.getElementById('chat-input').addEventListener('focus', () => {
    document.getElementById('chat-history-content').classList.add('active');
    if (chatActivityTimeout) clearTimeout(chatActivityTimeout);
});

document.getElementById('chat-input').addEventListener('blur', () => {
    chatActivityTimeout = setTimeout(() => {
        document.getElementById('chat-history-content').classList.remove('active');
    }, 4000);
});

function showChatBubble(playerId, message) {
    let container = document.getElementById('labels-container');

    // Create element
    const el = document.createElement('div');
    el.className = 'chat-bubble';
    el.innerText = message;

    // Clear old bubble if exists
    if (playerId === state.localId) {
        if (state.localChatElem) state.localChatElem.remove();
        if (state.localChatTimeout) clearTimeout(state.localChatTimeout);
        state.localChatElem = el;
        state.localChatTimeout = setTimeout(() => {
            if (state.localChatElem) state.localChatElem.remove();
            state.localChatElem = null;
        }, 5000);
    } else {
        const p = state.players[playerId];
        if (!p) return;
        if (p.chatElem) p.chatElem.remove();
        if (p.chatTimeout) clearTimeout(p.chatTimeout);
        p.chatElem = el;
        p.chatTimeout = setTimeout(() => {
            if (p.chatElem) p.chatElem.remove();
            p.chatElem = null;
        }, 5000);
    }

    container.appendChild(el);
}


// --- Input / Joystick ---
const keyState = {};

function initControls() {
    window.addEventListener('keydown', e => {
        // Handle '/' key stroke for chat shortcut
        if (e.key === '/' && document.activeElement.id !== 'chat-input') {
            e.preventDefault();
            document.getElementById('chat-input').focus();
            return;
        }

        if (document.activeElement.id === 'chat-input') return; // ignore when typing
        keyState[e.code] = true;
    });
    window.addEventListener('keyup', e => keyState[e.code] = false);

    // Initialize NippleJS (Mobile Joystick)
    // Only shows on touch devices if the zone is interacted with
    const joystickZone = document.getElementById('joystick-zone');
    const manager = nipplejs.create({
        zone: joystickZone,
        mode: 'dynamic',
        color: 'white',
        size: 100
    });

    manager.on('move', (event, data) => {
        // map angle to Vector 2D (y goes down in html, so negate)
        state.joystickVector.x = Math.cos(data.angle.radian);
        state.joystickVector.y = Math.sin(data.angle.radian);
    });

    manager.on('end', () => {
        state.joystickVector.x = 0;
        state.joystickVector.y = 0;
    });
}


// --- Three.js Setup ---
let scene, camera, renderer, localPlayerMesh;

function initGameScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#05050a');
    scene.fog = new THREE.Fog('#05050a', 10, 50);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 8, 12);
    if (audioListener) camera.add(audioListener);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    const d = 30;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const gridTexture = createGridTexture();
    const floorMat = new THREE.MeshStandardMaterial({
        map: gridTexture,
        roughness: 0.8,
        metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Decor/Obstacles
    for (let i = 0; i < 30; i++) {
        const boxGeo = new THREE.BoxGeometry(
            Math.random() * 2 + 1,
            Math.random() * 4 + 1,
            Math.random() * 2 + 1
        );
        const boxMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(Math.random(), 0.5, 0.2),
            roughness: 0.3,
            metalness: 0.8
        });
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.position.set(
            (Math.random() - 0.5) * 80,
            boxGeo.parameters.height / 2,
            (Math.random() - 0.5) * 80
        );
        if (box.position.length() < 8) continue;
        box.castShadow = true;
        box.receiveShadow = true;
        scene.add(box);
    }

    // Local Player Create
    localPlayerMesh = createPlayerMesh(state.model, state.color, state.name);
    localPlayerMesh.position.y = (state.model === 'sphere' ? 0.5 : (state.model === 'box' ? 0.8 : 1));
    scene.add(localPlayerMesh);

    window.addEventListener('resize', onWindowResize);

    state.inGame = true;
    requestAnimationFrame(animate);
}

function createPlayerMesh(modelType, colorHex, nameText) {
    const group = new THREE.Group();

    // Body based on modelType
    let geo;
    let yOffset = 0;

    if (modelType === 'box') {
        geo = new THREE.BoxGeometry(0.8, 1.6, 0.8);
    } else if (modelType === 'sphere') {
        geo = new THREE.SphereGeometry(0.6, 16, 16);
        yOffset = -0.4;
    } else {
        // default capsule
        geo = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
    }

    const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.2,
        metalness: 0.1,
        emissive: colorHex,
        emissiveIntensity: 0.2
    });
    const body = new THREE.Mesh(geo, mat);
    body.position.y = yOffset;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Eyes/Visor
    const visorGeo = new THREE.BoxGeometry(modelType === 'sphere' ? 0.5 : 0.8, 0.2, 0.3);
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1 });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    // position visor based on model
    if (modelType === 'box') visor.position.set(0, 0.4 + yOffset, 0.4);
    else if (modelType === 'sphere') visor.position.set(0, 0.2 + yOffset, 0.5);
    else visor.position.set(0, 0.5 + yOffset, 0.4);

    group.add(visor);

    // Nametag
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.roundRect(0, 0, 512, 128, 64);
    ctx.fill();
    ctx.font = 'bold 50px sans-serif';
    ctx.fillStyle = colorHex;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nameText, 256, 64);

    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 1.6;
    sprite.scale.set(0.12, 0.03, 1); // Size relative to screen with sizeAttenuation=false is tricky, we'll keep it standard 3D size but large
    spriteMat.sizeAttenuation = true;
    sprite.scale.set(3, 0.75, 1);
    group.add(sprite);

    return group;
}

function createGridTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#1e1b4b';
    ctx.lineWidth = 4;
    const step = 64;
    for (let i = 0; i <= 512; i += step) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(20, 20);
    return tex;
}

function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Projection logic for floating HTML tags
function updateFloatingLabels() {
    const halfWidth = window.innerWidth / 2;
    const halfHeight = window.innerHeight / 2;

    // Local Chat
    if (state.localChatElem && localPlayerMesh) {
        const pos = localPlayerMesh.position.clone();
        pos.y += 2.2; // Above nametag
        pos.project(camera);

        // Hide if behind camera
        if (pos.z > 1) {
            state.localChatElem.style.display = 'none';
        } else {
            state.localChatElem.style.display = 'block';
            state.localChatElem.style.left = (pos.x * halfWidth) + halfWidth + 'px';
            state.localChatElem.style.top = -(pos.y * halfHeight) + halfHeight + 'px';
        }
    }

    // Remote Players Chat
    for (const id in state.players) {
        const p = state.players[id];
        if (p.chatElem && p.mesh) {
            const pos = p.mesh.position.clone();
            pos.y += 2.2;
            pos.project(camera);
            if (pos.z > 1) {
                p.chatElem.style.display = 'none';
            } else {
                p.chatElem.style.display = 'block';
                p.chatElem.style.left = (pos.x * halfWidth) + halfWidth + 'px';
                p.chatElem.style.top = -(pos.y * halfHeight) + halfHeight + 'px';
            }
        }
    }
}

// --- Game Loop ---
const clock = new THREE.Clock();
let lastBroadcast = 0;
const BROADCAST_INTERVAL = 1 / 20;

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    if (state.inGame && localPlayerMesh) {
        const speed = 10;
        let moveX = 0;
        let moveZ = 0;

        // Keyboard
        if (keyState['KeyW'] || keyState['ArrowUp']) moveZ -= 1;
        if (keyState['KeyS'] || keyState['ArrowDown']) moveZ += 1;
        if (keyState['KeyA'] || keyState['ArrowLeft']) moveX -= 1;
        if (keyState['KeyD'] || keyState['ArrowRight']) moveX += 1;

        // Joystick (add to move)
        if (state.joystickVector.x !== 0 || state.joystickVector.y !== 0) {
            moveX += state.joystickVector.x;
            moveZ -= state.joystickVector.y; // Y is inverted for Three.js Top-Down forward
        }

        if (moveX !== 0 || moveZ !== 0) {
            // Normalize so people don't run 2x speed diagonally
            const mag = Math.sqrt(moveX * moveX + moveZ * moveZ);
            const clampedMag = mag > 1 ? 1 : mag;
            const finalMoveX = (moveX / mag) * speed * dt * clampedMag;
            const finalMoveZ = (moveZ / mag) * speed * dt * clampedMag;

            localPlayerMesh.position.x += finalMoveX;
            localPlayerMesh.position.z += finalMoveZ;

            localPlayerMesh.rotation.y = Math.atan2(moveX, moveZ);
        }

        const idealOffset = new THREE.Vector3(0, 8, 12);
        const currentPos = localPlayerMesh.position.clone();
        camera.position.lerp(currentPos.add(idealOffset), 5 * dt);
        camera.lookAt(localPlayerMesh.position);

        const now = clock.getElapsedTime();
        if ((moveX !== 0 || moveZ !== 0 || now - lastBroadcast > 1) && (now - lastBroadcast > BROADCAST_INTERVAL)) {
            broadcastPosition();
            lastBroadcast = now;
        }

        // Update floating 2D UI positions
        updateFloatingLabels();
    }

    // Interpolate remote players
    for (const id in state.players) {
        const p = state.players[id];
        if (p.mesh) {
            p.mesh.position.lerp(p.targetPos, 10 * dt);
            const qTarget = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.targetRot, 0));
            p.mesh.quaternion.slerp(qTarget, 10 * dt);
        }
    }

    renderer.render(scene, camera);
}

// --- Supabase Network ---
async function startMultiplayer() {
    state.channel = supabase.channel('game-room', {
        config: { presence: { key: state.localId } }
    });

    state.channel.on('presence', { event: 'sync' }, () => {
        const newState = state.channel.presenceState();
        updatePlayers(newState);
    });

    state.channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        if (state.players[key]) {
            scene.remove(state.players[key].mesh);
            if (state.players[key].chatElem) state.players[key].chatElem.remove();
            
            if (state.peers[key]) {
                state.peers[key].close();
                delete state.peers[key];
            }
            
            delete state.players[key];
            updatePlayerCount();
        }
    });

    state.channel.on('broadcast', { event: 'pos' }, payload => {
        const { id, x, z, r } = payload.payload;
        if (id === state.localId) return;
        if (state.players[id]) {
            state.players[id].targetPos.set(x, state.players[id].model === 'sphere' ? 0.5 : (state.players[id].model === 'box' ? 0.8 : 1), z);
            state.players[id].targetRot = r;
        }
    });

    // Handle chat broadcast
    state.channel.on('broadcast', { event: 'chat' }, payload => {
        const { id, msg } = payload.payload;
        if (id !== state.localId && state.players[id]) {
            showChatBubble(id, msg);
            appendChatHistory(state.players[id].name, state.players[id].color, msg);
        }
    });

    // Handle RTC Offer
    state.channel.on('broadcast', { event: 'rtc_offer' }, async payload => {
        const { senderId, targetId, offer } = payload.payload;
        if (targetId !== state.localId) return;

        const pc = createPeerConnection(senderId);
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            state.channel.send({
                type: 'broadcast',
                event: 'rtc_answer',
                payload: {
                    senderId: state.localId,
                    targetId: senderId,
                    answer: answer
                }
            });
        } catch (err) {
            console.error('RTC offer err:', err);
        }
    });

    // Handle RTC Answer
    state.channel.on('broadcast', { event: 'rtc_answer' }, async payload => {
        const { senderId, targetId, answer } = payload.payload;
        if (targetId !== state.localId) return;

        const pc = state.peers[senderId];
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (err) {}
        }
    });

    // Handle RTC ICE
    state.channel.on('broadcast', { event: 'rtc_ice' }, async payload => {
        const { senderId, targetId, candidate } = payload.payload;
        if (targetId !== state.localId) return;

        const pc = state.peers[senderId];
        if (pc) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {}
        }
    });

    await state.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            await state.channel.track({
                name: state.name,
                color: state.color,
                model: state.model,
                x: 0, z: 0, r: 0
            });
        }
    });
}

function updatePlayers(presenceState) {
    let count = 0;
    for (const id in presenceState) {
        count++;
        if (id === state.localId) continue;
        const pInfo = presenceState[id][0];

        if (!state.players[id]) {
            // New player
            const pMesh = createPlayerMesh(pInfo.model || 'capsule', pInfo.color, pInfo.name);
            pMesh.position.set(pInfo.x, pInfo.model === 'sphere' ? 0.5 : 1, pInfo.z);
            
            let posAudio = null;
            if (audioListener) {
                posAudio = new THREE.PositionalAudio(audioListener);
                posAudio.setRefDistance(5);
                posAudio.setMaxDistance(50);
                posAudio.setRolloffFactor(1);
                pMesh.add(posAudio);
            }
            
            scene.add(pMesh);
            state.players[id] = {
                name: pInfo.name,
                color: pInfo.color,
                model: pInfo.model || 'capsule',
                mesh: pMesh,
                targetPos: new THREE.Vector3(pInfo.x, pInfo.model === 'sphere' ? 0.5 : 1, pInfo.z),
                targetRot: pInfo.r,
                chatElem: null,
                chatTimeout: null,
                audio: posAudio
            };

            if (state.localStream) {
                initiatePeerConnection(id);
            }
        }
    }

    // Cleanup 
    for (const id in state.players) {
        if (!presenceState[id]) {
            scene.remove(state.players[id].mesh);
            if (state.players[id].chatElem) state.players[id].chatElem.remove();
            
            if (state.peers[id]) {
                state.peers[id].close();
                delete state.peers[id];
            }
            
            delete state.players[id];
        }
    }

    updatePlayerCount(count);
}

function updatePlayerCount(c = null) {
    const el = document.getElementById('online-count');
    if (c !== null) {
        el.innerText = c;
    } else {
        el.innerText = Object.keys(state.players).length + 1;
    }
}

function broadcastPosition() {
    if (!state.channel || !localPlayerMesh) return;
    state.channel.send({
        type: 'broadcast',
        event: 'pos',
        payload: {
            id: state.localId,
            x: localPlayerMesh.position.x,
            z: localPlayerMesh.position.z,
            r: localPlayerMesh.rotation.y
        }
    });
}
