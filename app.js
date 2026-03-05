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
    players: {}, // remote players { id: { mesh, nametag, targetPos, targetRot, chatElem, chatTimeout, alive } }
    channel: null,
    inGame: false,
    joystickVector: { x: 0, y: 0 },
    localChatElem: null,
    localChatTimeout: null,
    health: 100,
    dead: false,
    kills: 0,
    pitch: 0,
    yaw: 0,
    isPointerLocked: false
};

// Synthetic Audio Setup
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playShootSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = 'square';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

function playHurtSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.2);

    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
}

function playDeathSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.8);

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.8);
}


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

// Fullscreen Button Logic
const fullscreenBtn = document.getElementById('btn-fullscreen');
if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
            fullscreenBtn.innerHTML = '🗗';
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                fullscreenBtn.innerHTML = '⛶';
            }
        }
    });
}

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
    // Pointer Lock for Mouse Look
    document.getElementById('canvas-container').addEventListener('click', () => {
        if (!state.isPointerLocked) {
            document.body.requestPointerLock();
        } else if (!state.dead && state.inGame) {
            shoot();
        }
    });

    document.addEventListener('pointerlockchange', () => {
        state.isPointerLocked = (document.pointerLockElement === document.body);
    });

    document.addEventListener('mousemove', (e) => {
        if (state.isPointerLocked && !state.dead) {
            const movementX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
            const movementY = e.movementY || e.mozMovementY || e.webkitMovementY || 0;

            state.yaw -= movementX * 0.002;
            state.pitch -= movementY * 0.002;

            // limit pitch
            state.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, state.pitch));
        }
    });

    window.addEventListener('keydown', e => {
        // Handle '/' key stroke for chat shortcut
        if (e.key === '/' && document.activeElement.id !== 'chat-input') {
            e.preventDefault();
            if (state.isPointerLocked) document.exitPointerLock();
            document.getElementById('chat-input').focus();
            return;
        }

        if (document.activeElement.id === 'chat-input') return; // ignore when typing
        keyState[e.code] = true;
    });
    window.addEventListener('keyup', e => keyState[e.code] = false);

    // Initialize NippleJS (Mobile Joystick)
    const joystickZone = document.getElementById('joystick-zone');
    const manager = nipplejs.create({
        zone: joystickZone,
        mode: 'dynamic',
        color: 'white',
        size: 100
    });

    manager.on('move', (event, data) => {
        state.joystickVector.x = Math.cos(data.angle.radian);
        state.joystickVector.y = Math.sin(data.angle.radian);
    });

    manager.on('end', () => {
        state.joystickVector.x = 0;
        state.joystickVector.y = 0;
    });

    // Mobile specific: shooting button or tap anywhere
    document.addEventListener('touchstart', (e) => {
        if (e.target.id !== 'chat-input' && e.target.id !== 'chat-send' && state.inGame && !state.dead) {
            // we will consider touching right side as shoot if it's not joystick area
            if (e.touches[0].clientX > window.innerWidth / 2) {
                shoot();
            }
        }
    });
}

const raycaster = new THREE.Raycaster();

function shoot() {
    playShootSound();

    // Raycast from camera center
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    const interactables = [];
    for (const id in state.players) {
        if (state.players[id].mesh && state.players[id].alive !== false) {
            interactables.push(state.players[id].mesh);
        }
    }

    const intersects = raycaster.intersectObjects(interactables, true);
    if (intersects.length > 0) {
        // We hit someone! Find which player id it belongs to
        let hitMesh = intersects[0].object;
        // Traverse up to find the group
        while (hitMesh.parent && hitMesh.parent.type !== 'Scene') {
            hitMesh = hitMesh.parent;
        }

        let hitId = null;
        for (const id in state.players) {
            if (state.players[id].mesh === hitMesh) {
                hitId = id; break;
            }
        }

        if (hitId && state.channel) {
            state.channel.send({
                type: 'broadcast',
                event: 'damage',
                payload: { targetId: hitId, shooterName: state.name, amount: 25 }
            });
        }
    }
}



// --- Three.js Setup ---
let scene, camera, renderer, localPlayerMesh;

function initGameScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#05050a');
    scene.fog = new THREE.Fog('#05050a', 10, 50);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 8, 12);

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

    // Set up camera pivot for 3rd person
    camera.position.set(0, 0, 0); // Attach to pivot relative

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

    // Gun
    const gunGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 8);
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.2 });
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.rotation.x = Math.PI / 2;
    // position gun based on model
    if (modelType === 'box') gun.position.set(0.4, 0.2 + yOffset, 0.5);
    else if (modelType === 'sphere') gun.position.set(0.5, 0.1 + yOffset, 0.6);
    else gun.position.set(0.3, 0.2 + yOffset, 0.5);

    group.add(gun);

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
        let forward = 0;
        let right = 0;

        if (!state.dead) {
            const speed = 10;

            // Keyboard
            if (keyState['KeyW'] || keyState['ArrowUp']) forward += 1;
            if (keyState['KeyS'] || keyState['ArrowDown']) forward -= 1;
            if (keyState['KeyA'] || keyState['ArrowLeft']) right -= 1;
            if (keyState['KeyD'] || keyState['ArrowRight']) right += 1;

            // Joystick 
            if (state.joystickVector.x !== 0 || state.joystickVector.y !== 0) {
                right += state.joystickVector.x;
                forward += state.joystickVector.y; // Correctly positive Y is forward for joystick mapped angle
            }

            if (forward !== 0 || right !== 0) {
                const mag = Math.sqrt(forward * forward + right * right);
                const clampedMag = mag > 1 ? 1 : mag;

                // Convert to movement based on yaw direction
                const moveDist = speed * dt * clampedMag;
                const fx = Math.sin(state.yaw);
                const fz = Math.cos(state.yaw);
                const rx = Math.sin(state.yaw - Math.PI / 2);
                const rz = Math.cos(state.yaw - Math.PI / 2);

                const finalX = -(fx * forward + rx * right) * moveDist;
                const finalZ = -(fz * forward + rz * right) * moveDist;

                localPlayerMesh.position.x += finalX;
                localPlayerMesh.position.z += finalZ;
            }

            // Sync Rotation
            localPlayerMesh.rotation.y = state.yaw;
        }

        // Camera Logic - 3rd person over shoulder
        const cameraDistance = 5;
        const cameraHeight = 2;
        const targetPos = localPlayerMesh.position.clone();

        // Apply death visual (fall over) smoothly
        if (state.dead) {
            localPlayerMesh.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, state.yaw, 0)), 5 * dt);
        } else {
            localPlayerMesh.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, state.yaw, 0)), 15 * dt);
        }

        // Calculate camera position relative to player
        const offsetX = Math.sin(state.yaw) * Math.cos(state.pitch);
        const offsetY = Math.sin(state.pitch);
        const offsetZ = Math.cos(state.yaw) * Math.cos(state.pitch);

        const cameraOffset = new THREE.Vector3(offsetX, -offsetY, offsetZ).multiplyScalar(cameraDistance);
        camera.position.copy(targetPos).add(new THREE.Vector3(0, cameraHeight, 0)).add(cameraOffset);

        // Look at player head
        camera.lookAt(targetPos.clone().add(new THREE.Vector3(0, cameraHeight, 0)));

        const now = clock.getElapsedTime();
        if (!state.dead && (forward !== 0 || right !== 0 || now - lastBroadcast > 1) && (now - lastBroadcast > BROADCAST_INTERVAL)) {
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
            if (p.alive === false) {
                // death animation applies smoothly
                p.mesh.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, p.targetRot, 0)), 5 * dt);
            } else {
                p.mesh.position.lerp(p.targetPos, 10 * dt);
                const qTarget = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.targetRot, 0));
                p.mesh.quaternion.slerp(qTarget, 15 * dt);
            }
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
            delete state.players[key];
        }

        // update count manually on leave
        let count = 1; // self
        for (let id in state.players) count++;
        document.getElementById('count').innerText = count;
    });

    state.channel.on('broadcast', { event: 'pos' }, payload => {
        const { id, x, z, r } = payload.payload;
        if (id === state.localId) return;
        if (state.players[id]) {
            state.players[id].targetPos.set(x, state.players[id].model === 'sphere' ? 0.5 : (state.players[id].model === 'box' ? 0.8 : 1), z);
            state.players[id].targetRot = r;
            state.players[id].alive = payload.payload.alive !== false;
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

    // Handle combat events
    state.channel.on('broadcast', { event: 'damage' }, payload => {
        const { targetId, shooterName, amount } = payload.payload;

        if (targetId === state.localId && !state.dead) {
            applyDamage(amount, shooterName);
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
            scene.add(pMesh);
            state.players[id] = {
                name: pInfo.name,
                color: pInfo.color,
                model: pInfo.model || 'capsule',
                mesh: pMesh,
                targetPos: new THREE.Vector3(pInfo.x, pInfo.model === 'sphere' ? 0.5 : 1, pInfo.z),
                targetRot: pInfo.r,
                alive: true,
                chatElem: null,
                chatTimeout: null
            };
        }
    }

    // Cleanup 
    for (const id in state.players) {
        if (!presenceState[id]) {
            scene.remove(state.players[id].mesh);
            if (state.players[id].chatElem) state.players[id].chatElem.remove();
            delete state.players[id];
        }
    }

    document.getElementById('count').innerText = count;
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
            r: state.yaw,
            alive: !state.dead
        }
    });
}

function applyDamage(amount, sourceName) {
    state.health -= amount;
    playHurtSound();

    // Visual Vignette
    const vig = document.getElementById('damage-vignette');
    vig.classList.add('active');
    setTimeout(() => vig.classList.remove('active'), 200);

    // Update UI
    if (state.health < 0) state.health = 0;
    document.getElementById('health-bar').style.width = state.health + '%';
    document.getElementById('health-text').innerText = state.health + ' / 100';

    if (state.health <= 0) {
        die(sourceName);
    }
}

function die(killerName) {
    state.dead = true;
    playDeathSound();

    document.getElementById('health-text').innerText = 'DEAD';

    // Broadcast death visually (immediately so others see fall instantly alongside position updates)
    broadcastPosition();

    // Announce death
    const deathMsg = `was killed by ${killerName}!`;
    appendChatHistory(state.name, state.color, deathMsg);

    if (state.channel) {
        state.channel.send({
            type: 'broadcast',
            event: 'chat',
            payload: { id: state.localId, msg: deathMsg }
        });
    }

    // Respawn logic
    setTimeout(() => {
        state.health = 100;
        state.dead = false;
        document.getElementById('health-bar').style.width = '100%';
        document.getElementById('health-text').innerText = '100 / 100';

        // Return to upright rotation
        localPlayerMesh.rotation.set(0, state.yaw, 0);

        // Random respawn pos
        localPlayerMesh.position.set((Math.random() - 0.5) * 40, localPlayerMesh.position.y, (Math.random() - 0.5) * 40);

        appendChatHistory('System', '#10b981', 'You respawned.');
        broadcastPosition();
    }, 3000);
}
