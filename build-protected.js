const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');

const APP_DIR = __dirname;
const DIST_DIR = path.join(APP_DIR, 'dist');
const BACKUP_DIR = path.join(APP_DIR, 'source_backup');

async function build() {
    console.log('--- Starting In-Place Protected Build ---');

    try {
        // 1. Create backups of files we will obfuscate
        if (await fs.exists(BACKUP_DIR)) await fs.remove(BACKUP_DIR);
        await fs.ensureDir(BACKUP_DIR);

        const filesToProtect = [
            'main.js',
            'src/js/conversion.js',
            'src/js/utils.js',
            'src/js/app.js'
        ];

        console.log('Backing up core files...');
        for (const relPath of filesToProtect) {
            const src = path.join(APP_DIR, relPath);
            const dest = path.join(BACKUP_DIR, relPath);
            if (await fs.exists(src)) {
                await fs.ensureDir(path.dirname(dest));
                await fs.copy(src, dest);
                console.log(`  Backed up: ${relPath}`);
            }
        }

        // 2. Obfuscate files in-place
        console.log('Obfuscating files in-place...');
        for (const relPath of filesToProtect) {
            const src = path.join(APP_DIR, relPath);
            if (await fs.exists(src)) {
                const code = await fs.readFile(src, 'utf8');
                const result = JavaScriptObfuscator.obfuscate(code, { compact: true });
                await fs.writeFile(src, result.getObfuscatedCode());
                console.log(`  Protected: ${relPath}`);
            }
        }

        // 3. Run electron-packager
        console.log('Running electron-packager...');
        const packager = path.join(APP_DIR, 'node_modules', '.bin', 'electron-packager.cmd');
        
        // Using electron-packager to avoid symlink issues on Windows
        execSync(`"${packager}" . CoordinateConverter --platform=win32 --arch=x64 --out="${DIST_DIR}" --overwrite --asar`, { 
            stdio: 'inherit', 
            shell: true 
        });

        console.log('--- Build Finished Successfully ---');

    } catch (err) {
        console.error('Build Error:', err.message);
    } finally {
        // 4. Restore original files
        console.log('Restoring original source files...');
        const filesToProtect = [
            'main.js',
            'src/js/conversion.js',
            'src/js/utils.js',
            'src/js/app.js'
        ];
        for (const relPath of filesToProtect) {
            const src = path.join(BACKUP_DIR, relPath);
            const dest = path.join(APP_DIR, relPath);
            if (await fs.exists(src)) {
                await fs.copy(src, dest);
                console.log(`  Restored: ${relPath}`);
            }
        }
        await fs.remove(BACKUP_DIR);
    }
}

build();
