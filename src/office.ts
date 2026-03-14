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

        // Store target pad position for the agent
        padPositions.push(new THREE.Vector3(x, 0, z));
    }

    return { padPositions };
}
