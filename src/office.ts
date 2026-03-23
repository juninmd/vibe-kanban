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

  // Carpet tiles lines
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  const floorTex = new THREE.CanvasTexture(canvas);
  floorTex.wrapS = THREE.RepeatWrapping;
  floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(8, 6);

  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.9,
    metalness: 0.1,
  });

  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // 2. Walls (White/Beige office walls)
  const wallMat = new THREE.MeshStandardMaterial({
    color: '#f8fafc',
    roughness: 0.9,
    metalness: 0.1,
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

  // 3. Trim / Skirting Boards
  function createTrim(x: number, y: number, z: number, isVertical: boolean) {
    const geo = isVertical
      ? new THREE.BoxGeometry(0.2, 8, 0.2)
      : new THREE.BoxGeometry(10, 0.2, 0.2);
    const mat = new THREE.MeshStandardMaterial({ color: '#cbd5e1' });
    const strip = new THREE.Mesh(geo, mat);
    strip.position.set(x, y, z);
    scene.add(strip);
  }

  createTrim(-10, 0.1, -5.7, false);
  createTrim(10, 0.1, -5.7, false);
  createTrim(-15.7, 0.1, 0, false);
  createTrim(15.7, 0.1, 0, false);

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
      roughness: 0.8,
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(x, 0.05, z);
    scene.add(pad);

    // Store target pad position for the agent
    padPositions.push(new THREE.Vector3(x, 0, z));
  }

  return { padPositions };
}
