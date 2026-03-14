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
        // Simple eyes
        ctx.fillRect(16, 36, 8, 8);
        ctx.fillRect(40, 36, 8, 8);
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

export function getBodyMaterials(role: string, modelName?: string): THREE.Material[] {
    const primaryColor = "#1e293b";

    const frontTex = createTexture(256, 256, (ctx) => {
        // Shirt base
        ctx.fillStyle = primaryColor;
        ctx.fillRect(0, 0, 256, 256);

        if (modelName) {
            const rectWidth = 180;
            const rectHeight = 60;
            const rectY = 98; // Center on chest

            // Text on chest
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            let fontSize = 26;
            ctx.font = `bold ${fontSize}px 'Share Tech Mono', monospace`;

            // Handle long text by wrapping to next line
            if (ctx.measureText(modelName).width > rectWidth - 10) {
                fontSize = 18;
                ctx.font = `bold ${fontSize}px 'Share Tech Mono', monospace`;

                // naive split
                const mid = Math.floor(modelName.length / 2);
                let splitIdx = modelName.lastIndexOf("-", mid);
                if (splitIdx === -1) splitIdx = modelName.indexOf("-", mid);
                if (splitIdx === -1) splitIdx = mid;

                const line1 = modelName.substring(0, splitIdx + 1);
                const line2 = modelName.substring(splitIdx + 1);

                ctx.fillText(line1, 128, rectY + rectHeight / 2 - 8);
                ctx.fillText(line2, 128, rectY + rectHeight / 2 + 10);
            } else {
                ctx.fillText(modelName, 128, rectY + rectHeight / 2 + 2);
            }
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

export function getLimbMaterial(): THREE.Material {
    const color = '#1f2937'; // Dark Pants for everyone to match dark body
    return new THREE.MeshStandardMaterial({ color });
}
