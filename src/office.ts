import * as THREE from 'three';

export interface OfficeData {
    padPositions: THREE.Vector3[];
}

export function createOffice(scene: THREE.Scene, agentCount: number = 6): OfficeData {
    const padPositions: THREE.Vector3[] = [];

    // 1. Floor (Cybergrid)
    const floorGeo = new THREE.PlaneGeometry(32, 24);

    // Procedural neon grid texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#050B14';
    ctx.fillRect(0, 0, 512, 512);

    // Grid lines
    ctx.strokeStyle = '#00F0FF';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
    }
    // Glow spots
    for (let i = 0; i < 20; i++) {
        const grd = ctx.createRadialGradient(Math.random() * 512, Math.random() * 512, 0, Math.random() * 512, Math.random() * 512, 50);
        grd.addColorStop(0, 'rgba(0, 240, 255, 0.1)');
        grd.addColorStop(1, 'transparent');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, 512, 512);
    }

    const floorTex = new THREE.CanvasTexture(canvas);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(8, 6);

    const floorMat = new THREE.MeshStandardMaterial({
        map: floorTex,
        roughness: 0.2,
        metalness: 0.8,
        emissive: new THREE.Color('#002233'),
        emissiveIntensity: 0.5
    });

    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // 2. Walls (Dark metallic)
    const wallMat = new THREE.MeshStandardMaterial({
        color: '#0a0f18',
        roughness: 0.4,
        metalness: 0.6
    });

    // Back Wall
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(32, 12, 0.5), wallMat);
    backWall.position.set(0, 6, -6);
    scene.add(backWall);

    // Side Walls
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 12, 18), wallMat);
    leftWall.position.set(-16, 6, 3);
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 12, 18), wallMat);
    rightWall.position.set(16, 6, 3);
    scene.add(rightWall);

    // 3. Neon Strips / Windows
    function createNeonStrip(x: number, y: number, z: number, isVertical: boolean) {
        const geo = isVertical ? new THREE.BoxGeometry(0.2, 8, 0.2) : new THREE.BoxGeometry(10, 0.2, 0.2);
        const mat = new THREE.MeshBasicMaterial({ color: '#FF0055' });
        const strip = new THREE.Mesh(geo, mat);
        strip.position.set(x, y, z);
        scene.add(strip);
    }

    createNeonStrip(-10, 5, -5.7, false);
    createNeonStrip(10, 5, -5.7, false);
    createNeonStrip(-15.7, 5, 0, false);
    createNeonStrip(15.7, 5, 0, false);

    // 4. Holographic Pads (Workstations)
    const spacing = 4;
    const startX = -((agentCount - 1) * spacing) / 2;

    for (let i = 0; i < agentCount; i++) {
        const x = startX + i * spacing;
        const z = 2.8;

        // Visual Pad on floor
        const padGeo = new THREE.CylinderGeometry(1.2, 1.4, 0.2, 32);
        const padMat = new THREE.MeshStandardMaterial({
            color: '#112233',
            emissive: '#00F0FF',
            emissiveIntensity: 0.3,
            metalness: 0.9,
            roughness: 0.1
        });
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.set(x, 0.1, z);
        scene.add(pad);

        // Holographic Ring
        const ringGeo = new THREE.TorusGeometry(1.2, 0.05, 16, 64);
        const ringMat = new THREE.MeshBasicMaterial({ color: '#FF0055', transparent: true, opacity: 0.6 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(x, 0.2, z);
        ring.rotation.x = Math.PI / 2;
        scene.add(ring);

        // Store target pad position for the agent
        padPositions.push(new THREE.Vector3(x, 0, z));
    }

    return { padPositions };
}
