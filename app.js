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
    players: {}, // remote players { id: { mesh, nametag, targetPos, targetRot } }
    channel: null,
    inGame: false
};

// Colors for UI
const colors = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
const colorPicker = document.getElementById('color-picker');
colors.forEach(c => {
    const s = document.createElement('div');
    s.className = 'color-swatch';
    s.style.backgroundColor = c;
    if(c === state.color) s.classList.add('selected');
    s.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('selected'));
        s.classList.add('selected');
        state.color = c;
    });
    colorPicker.appendChild(s);
});

// --- UI Logic ---
document.getElementById('join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('player-name').value.trim();
    if(!nameInput) return;
    
    state.name = nameInput;
    document.getElementById('join-form').classList.add('hidden');
    document.getElementById('loading').classList.remove('hidden');

    await startMultiplayer();

    // Prepare UI
    document.getElementById('login-screen').classList.remove('active');
    setTimeout(() => document.getElementById('login-screen').classList.add('hidden'), 500);
    
    document.getElementById('game-ui').classList.remove('hidden');
    document.getElementById('ui-player-name').innerText = state.name;
    document.getElementById('ui-player-name').style.color = state.color;
    
    initGameScene();
});

// --- Three.js Setup ---
let scene, camera, renderer, localPlayerMesh;
const keyState = {};

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
    for(let i=0; i<30; i++) {
        const boxGeo = new THREE.BoxGeometry(
            Math.random()*2 + 1,
            Math.random()*4 + 1,
            Math.random()*2 + 1
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
        // keep center clear
        if(box.position.length() < 8) continue; 
        box.castShadow = true;
        box.receiveShadow = true;
        scene.add(box);
    }

    // Local Player Create
    localPlayerMesh = createPlayerMesh(state.color, state.name);
    localPlayerMesh.position.y = 1; // half height
    scene.add(localPlayerMesh);

    // Input
    window.addEventListener('keydown', e => keyState[e.code] = true);
    window.addEventListener('keyup', e => keyState[e.code] = false);
    window.addEventListener('resize', onWindowResize);

    state.inGame = true;
    requestAnimationFrame(animate);
}

function createPlayerMesh(colorHex, nameText) {
    const group = new THREE.Group();
    
    // Body
    const geo = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
    const mat = new THREE.MeshStandardMaterial({ 
        color: colorHex,
        roughness: 0.2,
        metalness: 0.1,
        emissive: colorHex,
        emissiveIntensity: 0.2
    });
    const body = new THREE.Mesh(geo, mat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Eyes/Visor
    const visorGeo = new THREE.BoxGeometry(0.8, 0.2, 0.3);
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1 });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.5, 0.4);
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
    const spriteMat = new THREE.SpriteMaterial({ map: tex });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 1.6;
    sprite.scale.set(3, 0.75, 1);
    group.add(sprite);

    return group;
}

function createGridTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0a0f'; // Dark base
    ctx.fillRect(0,0,512,512);
    ctx.strokeStyle = '#1e1b4b'; // subtle purple grid
    ctx.lineWidth = 4;
    const step = 64;
    for(let i=0; i<=512; i+=step) {
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
    if(!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Game Loop ---
const clock = new THREE.Clock();
let lastBroadcast = 0;
const BROADCAST_INTERVAL = 1/20; // 20 times per second

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    // Movement Logic for Local
    if(state.inGame && localPlayerMesh) {
        const speed = 10;
        let moveX = 0;
        let moveZ = 0;
        if(keyState['KeyW'] || keyState['ArrowUp']) moveZ -= 1;
        if(keyState['KeyS'] || keyState['ArrowDown']) moveZ += 1;
        if(keyState['KeyA'] || keyState['ArrowLeft']) moveX -= 1;
        if(keyState['KeyD'] || keyState['ArrowRight']) moveX += 1;

        if (moveX !== 0 || moveZ !== 0) {
            const mag = Math.sqrt(moveX*moveX + moveZ*moveZ);
            moveX /= mag; moveZ /= mag;
            localPlayerMesh.position.x += moveX * speed * dt;
            localPlayerMesh.position.z += moveZ * speed * dt;
            
            // Rotation facing direction
            localPlayerMesh.rotation.y = Math.atan2(moveX, moveZ);
        }

        // Camera follow
        const idealOffset = new THREE.Vector3(0, 8, 12);
        const currentPos = localPlayerMesh.position.clone();
        camera.position.lerp(currentPos.add(idealOffset), 5 * dt);
        camera.lookAt(localPlayerMesh.position);

        // Broadcast to remote
        const now = clock.getElapsedTime();
        if((moveX !== 0 || moveZ !== 0 || now - lastBroadcast > 1) && (now - lastBroadcast > BROADCAST_INTERVAL)) {
            broadcastPosition();
            lastBroadcast = now;
        }
    }

    // Interpolate remote players
    for(const id in state.players) {
        const p = state.players[id];
        if(p.mesh) {
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
        if(state.players[key]) {
            scene.remove(state.players[key].mesh);
            delete state.players[key];
            updatePlayerCount();
        }
    });

    state.channel.on('broadcast', { event: 'pos' }, payload => {
        const { id, x, z, r } = payload.payload;
        if(id === state.localId) return;
        if(state.players[id]) {
            state.players[id].targetPos.set(x, 1, z);
            state.players[id].targetRot = r;
        }
    });

    await state.channel.subscribe(async (status) => {
        if(status === 'SUBSCRIBED') {
            await state.channel.track({
                name: state.name,
                color: state.color,
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
        const pInfo = presenceState[id][0]; // latest presence info
        
        if (!state.players[id]) {
            // New player joined
            const pMesh = createPlayerMesh(pInfo.color, pInfo.name);
            pMesh.position.set(pInfo.x, 1, pInfo.z);
            scene.add(pMesh);
            state.players[id] = {
                mesh: pMesh,
                targetPos: new THREE.Vector3(pInfo.x, 1, pInfo.z),
                targetRot: pInfo.r
            };
        }
    }
    
    // Check for players that left
    for (const id in state.players) {
        if(!presenceState[id]) {
            scene.remove(state.players[id].mesh);
            delete state.players[id];
        }
    }
    
    updatePlayerCount(count);
}

function updatePlayerCount(c = null) {
    const el = document.getElementById('online-count');
    if(c !== null) {
        el.innerText = c;
    } else {
        el.innerText = Object.keys(state.players).length + 1;
    }
}

function broadcastPosition() {
    if(!state.channel || !localPlayerMesh) return;
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
