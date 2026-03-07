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
    "Product Manager": "#111111", // Black turtleneck
    "Segurança": "#1e3a8a",       // Navy Blue
    "Performance": "#f97316",     // Orange
    "Novas Funcionalidades": "#3b82f6", // Blue
    "Testes": "#22c55e",          // Green
    "Novas Features": "#00f0ff"         // Cyan
};

export function getHeadMaterials(role: string): THREE.Material[] {
    const skinColor = '#fce5cd';
    const hairColor = role === 'Product Manager' ? '#eeeeee' : '#3f2818'; // Jobs gray, others brown

    const faceTex = createTexture(64, 64, (ctx) => {
        // Skin
        ctx.fillStyle = skinColor;
        ctx.fillRect(0, 0, 64, 64);

        // Eyes
        ctx.fillStyle = '#000000';
        if (role === 'Product Manager') {
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

export function getBodyMaterials(role: string, modelName?: string, badgeColor?: string): THREE.Material[] {
    const primaryColor = roleColors[role] || "#888888";

    const frontTex = createTexture(256, 256, (ctx) => {
        ctx.fillStyle = primaryColor;
        ctx.fillRect(0, 0, 256, 256);

        // Details scaled by 4
        if (role === 'Product Manager') {
             // Turtleneck shading
             ctx.fillStyle = '#222';
             ctx.fillRect(80, 0, 96, 256);
        } else if (role === 'Segurança') {
             // Badge
             ctx.fillStyle = '#fbbf24';
             ctx.fillRect(160, 40, 32, 40);
             // Tie
             ctx.fillStyle = '#000';
             ctx.fillRect(112, 0, 32, 160);
        } else {
             // Generic logo/shirt pocket
             ctx.fillStyle = 'rgba(255,255,255,0.2)';
             ctx.fillRect(40, 40, 64, 56);
        }

        if (modelName && badgeColor) {
            // Convert hex to rgba for transparency
            const r = parseInt(badgeColor.slice(1, 3), 16);
            const g = parseInt(badgeColor.slice(3, 5), 16);
            const b = parseInt(badgeColor.slice(5, 7), 16);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;

            // Draw a badge in the center
            const badgeWidth = 200;
            const badgeHeight = 50;
            const badgeX = (256 - badgeWidth) / 2;
            const badgeY = 100;

            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 10);
            ctx.fill();

            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 4;
            ctx.stroke();

            ctx.font = "bold 28px 'Share Tech Mono', monospace";
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.shadowColor = "rgba(0,0,0,0.8)";
            ctx.shadowBlur = 5;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            ctx.fillText(modelName, 128, badgeY + badgeHeight / 2 + 2);
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
    const color = role === 'Product Manager' ? '#3b82f6' : '#1f2937'; // Jeans vs Dark Pants
    return new THREE.MeshStandardMaterial({ color });
}
