import * as THREE from 'three';

function createTexture(width: number, height: number, drawFn: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    drawFn(ctx);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
}

const roleColors: Record<string, string> = {
    "product_manager": "#111111", // Black turtleneck
    "seguranca": "#1e3a8a",       // Navy Blue
    "performance": "#f97316",     // Orange
    "funcionalidades": "#3b82f6", // Blue
    "testes": "#22c55e",          // Green
    "features": "#06b6d4"         // Cyan
};

export function getHeadMaterials(role: string): THREE.Material[] {
    const skinColor = '#fce5cd';
    const hairColor = role === 'product_manager' ? '#eeeeee' : '#3f2818'; // Jobs gray, others brown

    const faceTex = createTexture(64, 64, (ctx) => {
        // Skin
        ctx.fillStyle = skinColor;
        ctx.fillRect(0, 0, 64, 64);

        // Eyes
        ctx.fillStyle = '#000000';
        if (role === 'product_manager') {
            // Glasses
            ctx.fillStyle = '#333';
            ctx.fillRect(10, 24, 18, 8);
            ctx.fillRect(36, 24, 18, 8);
            ctx.fillRect(28, 26, 8, 2);
        } else {
            ctx.fillRect(14, 26, 8, 8);
            ctx.fillRect(42, 26, 8, 8);
        }

        // Mouth
        ctx.fillStyle = '#cc8888';
        ctx.fillRect(24, 46, 16, 4);

        // Hair Fringe
        ctx.fillStyle = hairColor;
        ctx.fillRect(0, 0, 64, 16);
        ctx.fillRect(0, 0, 12, 24);
        ctx.fillRect(52, 0, 12, 24);
    });

    const hairMat = new THREE.MeshStandardMaterial({ color: hairColor });
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex });
    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor });

    // Order: Right, Left, Top, Bottom, Front, Back
    return [
        hairMat, // Right
        hairMat, // Left
        hairMat, // Top
        skinMat, // Bottom
        faceMat, // Front
        hairMat  // Back
    ];
}

export function getBodyMaterials(role: string): THREE.Material[] {
    const primaryColor = roleColors[role] || "#888888";

    const frontTex = createTexture(64, 64, (ctx) => {
        ctx.fillStyle = primaryColor;
        ctx.fillRect(0, 0, 64, 64);

        // Details
        if (role === 'product_manager') {
             // Turtleneck shading
             ctx.fillStyle = '#222';
             ctx.fillRect(20, 0, 24, 64);
        } else if (role === 'seguranca') {
             // Badge
             ctx.fillStyle = '#fbbf24';
             ctx.fillRect(40, 10, 8, 10);
             // Tie
             ctx.fillStyle = '#000';
             ctx.fillRect(28, 0, 8, 40);
        } else {
             // Generic logo/shirt pocket
             ctx.fillStyle = 'rgba(255,255,255,0.2)';
             ctx.fillRect(10, 10, 16, 14);
        }
    });

    const mat = new THREE.MeshStandardMaterial({ color: primaryColor });
    const frontMat = new THREE.MeshStandardMaterial({ map: frontTex });

    return [
        mat, // Right
        mat, // Left
        mat, // Top
        mat, // Bottom
        frontMat, // Front
        mat  // Back
    ];
}

export function getLimbMaterial(role: string): THREE.Material {
    const color = role === 'product_manager' ? '#3b82f6' : '#1f2937'; // Jeans vs Dark Pants
    return new THREE.MeshStandardMaterial({ color });
}
