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
    "Performance": "#475569",     // Slate
    "Novas Funcionalidades": "#0284c7", // Blue
    "Testes": "#15803d",          // Dark Green
    "Novas Features": "#0f172a"   // Navy
};

export function getHeadMaterials(role: string): THREE.Material[] {
    const skinColor = '#fce5cd';
    const hairColor = role === 'Product Manager' ? '#e2e8f0' : '#452c1e'; // Gray for PM, Brown for others

    const faceTex = createTexture(64, 64, (ctx) => {
        // Skin base
        ctx.fillStyle = skinColor;
        ctx.fillRect(0, 0, 64, 64);

        // Hair block (top half)
        ctx.fillStyle = hairColor;
        ctx.fillRect(0, 0, 64, 24);
        // Sideburns
        ctx.fillRect(0, 24, 8, 16);
        ctx.fillRect(56, 24, 8, 16);

        // Eyes (Minecraft style - 2x2 pixels equivalent)
        ctx.fillStyle = '#000000';
        if (role === 'Product Manager') {
            // Glasses
            ctx.fillStyle = '#333';
            ctx.fillRect(8, 32, 20, 8);
            ctx.fillRect(36, 32, 20, 8);
            ctx.fillRect(28, 34, 8, 2);
        } else {
            // Simple eyes
            ctx.fillRect(16, 36, 8, 8);
            ctx.fillRect(40, 36, 8, 8);
        }
    });

    const hairMat = new THREE.MeshStandardMaterial({ color: hairColor });
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex });
    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor });

    // For a blocky head, top, sides, and back are usually hair color
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
    const primaryColor = roleColors[role] || "#1e293b";

    const frontTex = createTexture(256, 256, (ctx) => {
        // Shirt base
        ctx.fillStyle = primaryColor;
        ctx.fillRect(0, 0, 256, 256);

        if (modelName && badgeColor) {
            // Simple colored chest rectangle matching screenshot
            ctx.fillStyle = badgeColor;

            const rectWidth = 180;
            const rectHeight = 60;
            const rectX = (256 - rectWidth) / 2;
            const rectY = 98; // Center on chest

            ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

            // Text on chest
            ctx.font = "bold 26px 'Share Tech Mono', monospace";
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(modelName, 128, rectY + rectHeight / 2 + 2);
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
