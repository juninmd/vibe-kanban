import * as THREE from 'three';

export interface OfficeData {
    deskPositions: THREE.Vector3[];
    screenGlows: THREE.Mesh[];
}

export function createOffice(scene: THREE.Scene): OfficeData {
    const deskPositions: THREE.Vector3[] = [];
    const screenGlows: THREE.Mesh[] = [];

    // 1. Floor
    const floorGeo = new THREE.PlaneGeometry(24, 24);
    // Procedural carpet texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(0,0,512,512);
    // Add noise
    for(let i=0; i<5000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#34495e' : '#253545';
        ctx.fillRect(Math.random()*512, Math.random()*512, 2, 2);
    }
    const floorTex = new THREE.CanvasTexture(canvas);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(4, 4);

    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // 2. Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.5 });

    // Back Wall
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(24, 8, 0.5), wallMat);
    backWall.position.set(0, 4, -6);
    scene.add(backWall);

    // Side Walls
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 12), wallMat);
    leftWall.position.set(-12, 4, 0);
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 12), wallMat);
    rightWall.position.set(12, 4, 0);
    scene.add(rightWall);

    // 3. Windows
    const windowGeo = new THREE.PlaneGeometry(4, 3);
    const windowMat = new THREE.MeshBasicMaterial({ color: '#88ccff' });
    for(let i=-1; i<=1; i+=2) {
        const win = new THREE.Mesh(windowGeo, windowMat);
        win.position.set(i*6, 5, -5.7);
        scene.add(win); // Back windows
    }

    // 4. Plants
    addPlant(scene, -10, -4);
    addPlant(scene, 10, -4);
    addPlant(scene, -10, 4);

    // 5. Desks & Chairs
    for (let i = 0; i < 4; i++) {
        const x = -6 + i * 4;
        const z = 2.8;

        // Desk
        const desk = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, 0.6, 1.2),
            new THREE.MeshStandardMaterial({ color: "#1e293b" }) // Darker desk
        );
        desk.position.set(x, 0.3, z);
        scene.add(desk);
        deskPositions.push(desk.position.clone());

        // Screen
        const screenBase = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), new THREE.MeshStandardMaterial({ color: '#111' }));
        screenBase.position.set(x, 0.8, z - 0.3);
        scene.add(screenBase);

        const screen = new THREE.Mesh(
            new THREE.PlaneGeometry(1.2, 0.7),
            new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.1, side: THREE.DoubleSide })
        );
        screen.position.set(x, 0.9, z);
        screen.rotation.x = -0.1;
        scene.add(screen);
        screenGlows.push(screen);

        // Chair
        const chair = createChair();
        chair.position.set(x, 0, z + 1);
        chair.rotation.y = Math.PI; // Face desk
        scene.add(chair);
    }

    return { deskPositions, screenGlows };
}

function addPlant(scene: THREE.Scene, x: number, z: number) {
    const group = new THREE.Group();

    // Pot
    const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.3, 0.6, 16),
        new THREE.MeshStandardMaterial({ color: '#5d4037' })
    );
    pot.position.y = 0.3;
    group.add(pot);

    // Plant
    const leavesMat = new THREE.MeshStandardMaterial({ color: '#2e7d32' });
    const geo = new THREE.DodecahedronGeometry(0.3);

    for(let i=0; i<5; i++) {
        const leaf = new THREE.Mesh(geo, leavesMat);
        leaf.position.set(
            (Math.random()-0.5)*0.5,
            0.6 + Math.random()*0.5,
            (Math.random()-0.5)*0.5
        );
        leaf.scale.setScalar(0.8 + Math.random() * 0.4);
        group.add(leaf);
    }

    group.position.set(x, 0, z);
    scene.add(group);
}

function createChair(): THREE.Group {
    const group = new THREE.Group();
    const seatMat = new THREE.MeshStandardMaterial({ color: '#334155' });
    const metalMat = new THREE.MeshStandardMaterial({ color: '#94a3b8' });

    // Seat
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.7), seatMat);
    seat.position.y = 0.5;
    group.add(seat);

    // Back
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.1), seatMat);
    back.position.set(0, 0.9, -0.3);
    group.add(back);

    // Base
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5), metalMat);
    stem.position.y = 0.25;
    group.add(stem);

    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05), metalMat);
    foot.position.y = 0.025;
    group.add(foot);

    return group;
}
