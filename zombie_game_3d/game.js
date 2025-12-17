import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// Configuration
const KILLS_TO_ADVANCE = 15;
const MAX_LEVELS = 15;

// State
let camera, scene, renderer, controls;
let raycaster;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;

let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// Game Entities
const zombies = [];
const bullets = [];
const trees = [];
let lastShot = 0;
let level = 1;
let kills = 0;
let playerHealth = 100;
let isGameOver = false;
let boss = null;

// UI Elements
const uiStart = document.getElementById('start-screen');
const uiGameOver = document.getElementById('game-over');
const uiVictory = document.getElementById('victory');
const hudLevel = document.getElementById('level');
const hudKills = document.getElementById('kills');
const hudHealth = document.getElementById('health');

init();
animate();

function init() {
    // Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111); // Dark night
    scene.fog = new THREE.Fog(0x111111, 0, 60); // Thick fog for atmosphere

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0x444444, 0x000000, 1.5); // Moon ambient
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5); // Moonlight
    dirLight.position.set(50, 200, 100);
    scene.add(dirLight);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 2; // Eye height

    // Controls
    controls = new PointerLockControls(camera, document.body);

    const startBtn = document.getElementById('start-btn');
    startBtn.addEventListener('click', () => {
        controls.lock();
    });

    const restartBtn = document.getElementById('restart-btn');
    restartBtn.addEventListener('click', resetGame);

    const againBtn = document.getElementById('again-btn');
    againBtn.addEventListener('click', resetGame);

    controls.addEventListener('lock', () => {
        uiStart.classList.add('hidden');
        uiGameOver.classList.add('hidden');
        uiVictory.classList.add('hidden');
        // If game over state, reset? No, relying on buttons.
    });

    controls.addEventListener('unlock', () => {
        if (!isGameOver) {
            // Pause menu could go here
            uiStart.classList.remove('hidden');
        }
    });

    scene.add(controls.getObject());

    // Input Handling
    const onKeyDown = function (event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                moveForward = true;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                moveLeft = true;
                break;
            case 'ArrowDown':
            case 'KeyS':
                moveBackward = true;
                break;
            case 'ArrowRight':
            case 'KeyD':
                moveRight = true;
                break;
            case 'Space':
                if (canJump === true) velocity.y += 350;
                canJump = false;
                break;
        }
    };

    const onKeyUp = function (event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                moveForward = false;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                moveLeft = false;
                break;
            case 'ArrowDown':
            case 'KeyS':
                moveBackward = false;
                break;
            case 'ArrowRight':
            case 'KeyD':
                moveRight = false;
                break;
        }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', shoot);

    // Raycaster for shooting
    raycaster = new THREE.Raycaster();

    // Environment Generation
    generateEnvironment();

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    window.addEventListener('resize', onWindowResize);
}

function generateEnvironment() {
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(2000, 2000, 100, 100);
    floorGeometry.rotateX(-Math.PI / 2);

    // Vertex displacement for terrain
    const positionAttribute = floorGeometry.attributes.position;
    for (let i = 0; i < positionAttribute.count; i++) {
        const x = positionAttribute.getX(i);
        const y = positionAttribute.getY(i); // actually Z before rotation, effectively Y now? No, vertex shader mess.
        // It's a plane, so Y is up/down. Let's just randomize Z (which is Y in world space) slightly for bumps
        // Actually simplest is just a flat floor for gameplay stability
        // positionAttribute.setY( i, Math.random() * 2 ); 
    }

    const floorMaterial = new THREE.MeshLambertMaterial({ color: 0x052205 }); // Dark Grass
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    scene.add(floor);

    // Trees
    const treeGeo = new THREE.CylinderGeometry(0.5, 1.5, 5, 8);
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x3d2817 }); // Brown Trunk
    const leavesGeo = new THREE.ConeGeometry(3, 8, 8);
    const leavesMat = new THREE.MeshLambertMaterial({ color: 0x0a400a }); // Dark Green Leaves

    for (let i = 0; i < 300; i++) {
        const x = (Math.random() - 0.5) * 400;
        const z = (Math.random() - 0.5) * 400;

        // Don't spawn trees too close to center (spawn area)
        if (Math.abs(x) < 20 && Math.abs(z) < 20) continue;

        const trunk = new THREE.Mesh(treeGeo, treeMat);
        trunk.position.set(x, 2.5, z);

        const leaves = new THREE.Mesh(leavesGeo, leavesMat);
        leaves.position.set(0, 5, 0);
        trunk.add(leaves);

        scene.add(trunk);
        trees.push(trunk);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function resetGame() {
    // Reset Stats
    level = 1;
    kills = 0;
    playerHealth = 100;
    isGameOver = false;
    updateHUD();

    // Clear Entities
    zombies.forEach(z => scene.remove(z.mesh));
    zombies.length = 0;
    bullets.forEach(b => scene.remove(b.mesh));
    bullets.length = 0;
    boss = null;

    // Reset Player Pos
    controls.getObject().position.set(0, 2, 0);
    velocity.set(0, 0, 0);

    controls.lock();
}

function shoot() {
    if (!controls.isLocked || isGameOver) return;

    // Muzzle flash / Sound could go here

    // Create Bullet (Visual only essentially, simplified physics)
    const bulletGeo = new THREE.SphereGeometry(0.1, 4, 4);
    const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const bullet = new THREE.Mesh(bulletGeo, bulletMat);

    // Start at camera position
    bullet.position.copy(controls.getObject().position);

    // Get direction
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);

    // Offset slightly forward
    bullet.position.add(direction.clone().multiplyScalar(1));

    bullet.userData = { velocity: direction.multiplyScalar(40) }; // Fast bullet
    scene.add(bullet);
    bullets.push(bullet);
}

function spawnZombie() {
    // Don't spawn if boss exists
    if (boss) return;

    // Boss Spawn Logic
    if (level === MAX_LEVELS && zombies.length === 0) {
        spawnBoss();
        return;
    }

    // Limit max zombies
    if (zombies.length >= 10 + level) return;

    const angle = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 20; // Spawn outside immediate view
    const x = Math.cos(angle) * dist + controls.getObject().position.x;
    const z = Math.sin(angle) * dist + controls.getObject().position.z;

    // Geometry
    const geometry = new THREE.BoxGeometry(1, 2.5, 1);
    const material = new THREE.MeshLambertMaterial({ color: 0x556b2f }); // Olive green
    const zombieMesh = new THREE.Mesh(geometry, material);
    zombieMesh.position.set(x, 1.25, z);

    // Glowing eyes
    const eyeGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const eye1 = new THREE.Mesh(eyeGeo, eyeMat);
    const eye2 = new THREE.Mesh(eyeGeo, eyeMat);
    eye1.position.set(0.2, 0.8, 0.4);
    eye2.position.set(-0.2, 0.8, 0.4);
    zombieMesh.add(eye1);
    zombieMesh.add(eye2);

    scene.add(zombieMesh);

    const zombie = {
        mesh: zombieMesh,
        health: 2 + Math.floor(level / 2),
        speed: 3 + (level * 0.2),
        isBoss: false
    };
    zombies.push(zombie);
}

function spawnBoss() {
    const angle = Math.random() * Math.PI * 2;
    const dist = 40;
    const x = Math.cos(angle) * dist + controls.getObject().position.x;
    const z = Math.sin(angle) * dist + controls.getObject().position.z;

    const geometry = new THREE.BoxGeometry(3, 6, 3);
    const material = new THREE.MeshPhongMaterial({ color: 0x8b0000 }); // Dark Red
    const bossMesh = new THREE.Mesh(geometry, material);
    bossMesh.position.set(x, 3, z);

    scene.add(bossMesh);

    boss = {
        mesh: bossMesh,
        health: 100,
        speed: 4,
        isBoss: true
    };
    zombies.push(boss);
}

function updateHUD() {
    hudLevel.innerText = level;
    hudKills.innerText = boss ? 'BOSS' : kills;
    hudHealth.innerText = Math.max(0, Math.ceil(playerHealth));
}

function animate() {
    requestAnimationFrame(animate);

    if (isGameOver && !controls.isLocked) {
        // Just render scene, no inputs
        renderer.render(scene, camera);
        return;
    }

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    // Physics / Controls Update
    if (controls.isLocked) {
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 9.8 * 100.0 * delta; // Gravity

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize(); // this ensures consistent movements in all directions

        if (moveForward || moveBackward) velocity.z -= direction.z * 400.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 400.0 * delta;

        // Apply movement
        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        controls.getObject().position.y += (velocity.y * delta); // New behavior

        if (controls.getObject().position.y < 2) { // Hit ground
            velocity.y = 0;
            controls.getObject().position.y = 2;
            canJump = true;
        }

        // --- Game Logic ---

        // Spawn Zombies
        if (Math.random() < 0.02) { // 1 in 50 frames
            spawnZombie();
        }

        // Update Bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.position.add(b.userData.velocity.clone().multiplyScalar(delta));

            // Remove if too far
            if (b.position.distanceTo(controls.getObject().position) > 100) {
                scene.remove(b);
                bullets.splice(i, 1);
                continue;
            }

            // Bullet Collision
            for (let j = zombies.length - 1; j >= 0; j--) {
                const z = zombies[j];
                // Simple box distance check (AABB roughly)
                const dist = b.position.distanceTo(z.mesh.position);
                // Hitbox size depending on boss or normal
                const hitRadius = z.isBoss ? 4 : 1.5;

                if (dist < hitRadius) {
                    // Hit!
                    z.health--;
                    // Knockback
                    const pushDir = b.userData.velocity.clone().normalize();
                    z.mesh.position.add(pushDir.multiplyScalar(0.5));

                    // Remove bullet
                    scene.remove(b);
                    bullets.splice(i, 1);

                    // Flash red
                    z.mesh.material.color.setHex(0xff0000);
                    setTimeout(() => {
                        if (z && z.mesh) z.mesh.material.color.setHex(z.isBoss ? 0x8b0000 : 0x556b2f);
                    }, 100);

                    // Death
                    if (z.health <= 0) {
                        scene.remove(z.mesh);
                        zombies.splice(j, 1);

                        if (z.isBoss) {
                            boss = null;
                            isGameOver = true;
                            controls.unlock();
                            uiVictory.classList.remove('hidden');
                        } else {
                            kills++;
                            if (kills >= KILLS_TO_ADVANCE && level < MAX_LEVELS) {
                                level++;
                                kills = 0;
                                playerHealth = Math.min(playerHealth + 20, 100);
                            }
                        }
                        updateHUD();
                    }
                    break; // Bullet hit one zombie, stop checking others
                }
            }
        }

        // Update Zombies
        const playerPos = controls.getObject().position;
        for (const z of zombies) {
            z.mesh.lookAt(playerPos.x, playerPos.y, playerPos.z); // Look at player

            const dirToPlayer = new THREE.Vector3().subVectors(playerPos, z.mesh.position).normalize();
            // Move towards player
            // Flatten Y so they don't fly up/down too much (though looking at player does tilt them)
            // Just move X/Z
            z.mesh.position.x += dirToPlayer.x * z.speed * delta;
            z.mesh.position.z += dirToPlayer.z * z.speed * delta;

            // Player Collision Check
            const dist = z.mesh.position.distanceTo(playerPos);
            if (dist < 2) {
                playerHealth -= (z.isBoss ? 1 : 0.2); // Boss hits hard
                updateHUD();

                // Red tint overlay?
                if (playerHealth <= 0) {
                    isGameOver = true;
                    controls.unlock();
                    uiGameOver.classList.remove('hidden');
                }
            }
        }
    }

    prevTime = time;

    renderer.render(scene, camera);
}
