const fs = require('fs');
const path = require('path');

const srcDir = '/Users/moroneyt/Documents/AutoSubsV3/AutoSubs-App/src';
const compDir = path.join(srcDir, 'components');

const moves = {
  'action-bar': 'layout/action-bar',
  'custom-sidebar-trigger': 'layout/custom-sidebar-trigger',
  'pixel-overlay': 'layout/pixel-overlay',
  'titlebar': 'layout/titlebar',
  
  'desktop-subtitle-viewer': 'subtitles/desktop-subtitle-viewer',
  'mobile-subtitle-viewer': 'subtitles/mobile-subtitle-viewer',
  'subtitle-list': 'subtitles/subtitle-list',
  'speaker-editor': 'subtitles/speaker-editor',
  'segment-preview': 'subtitles/segment-preview',
  
  'add-to-timeline-dialog': 'dialogs/add-to-timeline-dialog',
  'language-picker-modal': 'dialogs/language-picker-modal',
  'replace-strings-dialog': 'dialogs/replace-strings-dialog',
  'settings-dialog': 'dialogs/settings-dialog',
  'track-conflict-dialog': 'dialogs/track-conflict-dialog',
  
  'completion-step-item': 'processing/completion-step-item',
  'processing-step-item': 'processing/processing-step-item',
  
  'color-picker': 'common/color-picker',
  'color-popover': 'common/color-popover',
  'import-export-popover': 'common/import-export-popover',
  
  'model-manager': 'settings/model-manager',
  
  'theme-provider': 'providers/theme-provider'
};

// Create dirs and move files
for (const [oldName, newName] of Object.entries(moves)) {
  const oldPath = path.join(compDir, oldName + '.tsx');
  const newPath = path.join(compDir, newName + '.tsx');
  
  if (fs.existsSync(oldPath)) {
    const dir = path.dirname(newPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.renameSync(oldPath, newPath);
    console.log(`Moved ${oldName}.tsx to ${newName}.tsx`);
  }
}

// Update imports
function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walk(dirPath, callback);
    } else {
      if (dirPath.endsWith('.ts') || dirPath.endsWith('.tsx')) {
        callback(dirPath);
      }
    }
  });
}

walk(srcDir, (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  
  for (const [oldName, newName] of Object.entries(moves)) {
    // Replace absolute imports: @/components/oldName -> @/components/newName
    const regexAbs = new RegExp(`@/components/${oldName}`, 'g');
    content = content.replace(regexAbs, `@/components/${newName}`);
    
    // We'll also do a generic replacement for relative imports if they exist.
    // It's much safer to just use absolute paths for components if we can.
    // Since the project uses @/components heavily, let's see if we catch everything.
    // Replace "./oldName" with "./newName" ONLY if we are in a parent directory.
    // Actually, to be safe, let's convert all relative component imports to absolute first
    // Or just manually fix them.
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated imports in', filePath);
  }
});
