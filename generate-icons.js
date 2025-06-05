const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const assetsDir = path.join(__dirname, '..', 'assets');
const sourceIcon = path.join(assetsDir, 'icon.png');
const iconsetDir = path.join(assetsDir, 'app.iconset');
const iconsDir = path.join(assetsDir, 'icons');

console.log('🎨 P6 Backup Tool Icon Generator');
console.log('================================');

// Check if source icon exists
if (!fs.existsSync(sourceIcon)) {
    console.error('❌ Error: Source icon not found at:', sourceIcon);
    console.log('📝 Please place your new icon as "icon.png" in the assets directory.');
    process.exit(1);
}

// Create directories
if (!fs.existsSync(iconsetDir)) {
    fs.mkdirSync(iconsetDir, { recursive: true });
}
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

// Icon sizes to generate
const iconSizes = [
    { name: 'icon_16x16.png', size: 16, dir: iconsetDir },
    { name: 'icon_16x16@2x.png', size: 32, dir: iconsetDir },
    { name: 'icon_32x32.png', size: 32, dir: iconsetDir },
    { name: 'icon_32x32@2x.png', size: 64, dir: iconsetDir },
    { name: 'icon_128x128.png', size: 128, dir: iconsetDir },
    { name: 'icon_128x128@2x.png', size: 256, dir: iconsetDir },
    { name: 'icon_256x256.png', size: 256, dir: iconsetDir },
    { name: 'icon_256x256@2x.png', size: 512, dir: iconsetDir },
    { name: 'icon_512x512.png', size: 512, dir: iconsetDir },
    { name: 'icon_512x512@2x.png', size: 1024, dir: iconsetDir },
    // Small icons for Windows/Linux
    { name: 'icon_24x24.png', size: 24, dir: iconsDir },
    { name: 'icon_48x48.png', size: 48, dir: iconsDir },
    { name: 'icon_64x64.png', size: 64, dir: iconsDir },
    { name: 'icon_96x96.png', size: 96, dir: iconsDir }
];

// Function to resize using sips (macOS built-in)
function resizeIcon(inputPath, outputPath, size) {
    return new Promise((resolve, reject) => {
        const sips = spawn('sips', ['-z', size.toString(), size.toString(), inputPath, '--out', outputPath]);
        
        sips.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ Created ${path.basename(outputPath)} (${size}x${size})`);
                resolve();
            } else {
                console.log(`❌ Failed to create ${path.basename(outputPath)}`);
                reject(new Error(`sips failed with code ${code}`));
            }
        });
        
        sips.on('error', (err) => {
            reject(err);
        });
    });
}

// Generate all icons
async function generateIcons() {
    console.log(`📂 Generating icons from: ${path.basename(sourceIcon)}`);
    console.log('');
    
    try {
        for (const icon of iconSizes) {
            const outputPath = path.join(icon.dir, icon.name);
            await resizeIcon(sourceIcon, outputPath, icon.size);
        }
        
        console.log('');
        console.log('🚀 Icon generation complete!');
        console.log('');
        console.log('Generated files:');
        console.log('- app.iconset/ - Individual PNG files for macOS');
        console.log('- icons/ - Additional small icons for Windows/Linux');
        console.log('');
        console.log('💡 To generate app.icns for macOS, run: iconutil -c icns app.iconset -o app.icns');
        console.log('');
        
    } catch (error) {
        console.error('❌ Error generating icons:', error.message);
        console.log('');
        console.log('💡 Make sure you have a valid PNG file as icon.png');
        console.log('💡 On macOS, sips should be available by default');
        process.exit(1);
    }
}

// Run the generator
generateIcons();
