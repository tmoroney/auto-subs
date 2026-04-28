import fs from 'fs-extra';
import path from 'path';

const src = path.resolve('dist/cep');
const dest = path.resolve('../AutoSubs-App/src-tauri/resources/com.autosubs.premiere');

async function main() {
  try {
    await fs.remove(dest);
    await fs.copy(src, dest);
    console.log('Successfully copied extension to Tauri resources!');
  } catch (err) {
    console.error('Error copying extension:', err);
    process.exit(1);
  }
}

main();
