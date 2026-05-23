'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;

const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, 'build');
const pngDir = path.join(buildDir, 'png');
const sourceFromWeb = path.resolve(root, '..', '1', 'public', 'icons', 'icon-1024.svg');
const localSource = path.join(buildDir, 'icon.svg');
const source = fs.existsSync(sourceFromWeb) ? sourceFromWeb : localSource;

async function main() {
  fs.mkdirSync(pngDir, { recursive: true });

  if (source !== localSource) {
    fs.copyFileSync(source, localSource);
  }

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngFiles = [];

  for (const size of sizes) {
    const file = path.join(pngDir, `icon-${size}.png`);
    await sharp(source).resize(size, size).png().toFile(file);
    pngFiles.push(file);
  }

  await sharp(source).resize(512, 512).png().toFile(path.join(buildDir, 'icon.png'));
  const ico = await pngToIco(pngFiles);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);

  console.log('Generated build/icon.ico and build/icon.png');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
