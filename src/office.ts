import * as THREE from 'three';

export interface OfficeData {
    padPositions: THREE.Vector3[];
}

export function createOffice(scene: THREE.Scene, agentCount: number = 6): OfficeData {
    const padPositions: THREE.Vector3[] = [];

    // 1. Floor (Cybergrid)
    const floorGeo = new THREE.PlaneGeometry(32, 24);

    // Procedural carpet texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, 512, 512);

    const floorTex = new THREE.CanvasTexture(canvas);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(8, 6);

    const floorMat = new THREE.MeshStandardMaterial({
        map: floorTex,
        roughness: 0.9,
        metalness: 0.1
    });

    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // 2. Walls (White/Beige office walls)
    const wallMat = new THREE.MeshStandardMaterial({
        color: '#e2e8f0', // Match the light grey from the screenshot
        roughness: 0.9,
        metalness: 0.1
    });

    // Back Wall Panels
    const numPanels = 4;
    const panelWidth = 32 / numPanels;
    for (let i = 0; i < numPanels; i++) {
        const xPos = -16 + (panelWidth / 2) + (i * panelWidth);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(panelWidth - 0.1, 12, 0.5), wallMat);
        panel.position.set(xPos, 6, -6);
        scene.add(panel);

        // Add subtle dividers between panels
        if (i < numPanels - 1) {
            const divider = new THREE.Mesh(
                new THREE.BoxGeometry(0.1, 12, 0.51),
                new THREE.MeshStandardMaterial({ color: '#cbd5e1' })
            );
            divider.position.set(xPos + (panelWidth / 2), 6, -6);
            scene.add(divider);
        }
    }

    // 4. Workstations Pads
    const spacing = 4;
    const startX = -((agentCount - 1) * spacing) / 2;

    // Desk materials
    const deskMat = new THREE.MeshStandardMaterial({
        color: '#475569', // Dark gray
        roughness: 0.8,
        metalness: 0.1
    });
    const monitorMat = new THREE.MeshStandardMaterial({
        color: '#1e293b', // Almost black
        roughness: 0.6,
        metalness: 0.3
    });
    const screenMat = new THREE.MeshStandardMaterial({
        color: '#0f172a', // Screen base color
        roughness: 0.2,
        metalness: 0.8,
        emissive: '#1e3a8a',
        emissiveIntensity: 0.2
    });
    const keyboardMat = new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.9,
        metalness: 0.1
    });

    for (let i = 0; i < agentCount; i++) {
        const x = startX + i * spacing;
        const z = 2.8;

        // Visual Pad on floor
        const padGeo = new THREE.CylinderGeometry(1.2, 1.4, 0.1, 32);
        const padMat = new THREE.MeshStandardMaterial({
            color: '#94a3b8',
            metalness: 0.2,
            roughness: 0.8
        });
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.set(x, 0.05, z);
        scene.add(pad);

        // Desk
        const deskZ = z - 0.9;
        const deskY = 1.0;

        // Desk Top
        const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 1.2), deskMat);
        deskTop.position.set(x, deskY, deskZ);
        deskTop.castShadow = true;
        scene.add(deskTop);

        // Desk Legs
        const legGeo = new THREE.BoxGeometry(0.1, deskY, 0.1);
        const leg1 = new THREE.Mesh(legGeo, deskMat);
        leg1.position.set(x - 1.0, deskY / 2, deskZ - 0.5);
        scene.add(leg1);
        const leg2 = new THREE.Mesh(legGeo, deskMat);
        leg2.position.set(x + 1.0, deskY / 2, deskZ - 0.5);
        scene.add(leg2);
        const leg3 = new THREE.Mesh(legGeo, deskMat);
        leg3.position.set(x - 1.0, deskY / 2, deskZ + 0.5);
        scene.add(leg3);
        const leg4 = new THREE.Mesh(legGeo, deskMat);
        leg4.position.set(x + 1.0, deskY / 2, deskZ + 0.5);
        scene.add(leg4);

        // PC Monitor Stand
        const stand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.1), monitorMat);
        stand.position.set(x, deskY + 0.15, deskZ - 0.2);
        scene.add(stand);
        const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.4), monitorMat);
        standBase.position.set(x, deskY + 0.05, deskZ - 0.2);
        scene.add(standBase);

        // PC Monitor Screen
        const monitorGroup = new THREE.Group();
        const monitorBack = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.1), monitorMat);
        monitorGroup.add(monitorBack);
        const monitorScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8), screenMat);
        monitorScreen.position.set(0, 0, 0.051);
        monitorGroup.add(monitorScreen);

        monitorGroup.position.set(x, deskY + 0.3 + 0.45, deskZ - 0.2);
        scene.add(monitorGroup);

        // PC Case
        const pcCase = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.8), monitorMat);
        pcCase.position.set(x + 0.8, deskY + 0.4, deskZ);
        scene.add(pcCase);

        // Keyboard
        const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.3), keyboardMat);
        keyboard.position.set(x, deskY + 0.05, deskZ + 0.3);
        keyboard.rotation.x = -0.05;
        scene.add(keyboard);

        // Store target pad position for the agent
        padPositions.push(new THREE.Vector3(x, 0, z));
    }

    return { padPositions };
}
