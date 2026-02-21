const fs = require('fs');
const path = require('path');

const srcDir = '/Users/moroneyt/Documents/AutoSubsV3/AutoSubs-App/src/components';

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
  
  // Replace "./ui/..." with "@/components/ui/..."
  content = content.replace(/from\s+["']\.\/ui\/([^"']+)["']/g, 'from "@/components/ui/$1"');
  // Replace "../ui/..." with "@/components/ui/..." just in case
  content = content.replace(/from\s+["']\.\.\/ui\/([^"']+)["']/g, 'from "@/components/ui/$1"');
  
  // Also fix relative imports between components that were moved
  // e.g. from "./add-to-timeline-dialog" to "@/components/dialogs/add-to-timeline-dialog"
  // Let's just catch specific ones from the build error:
  content = content.replace(/from\s+["']\.\/add-to-timeline-dialog["']/g, 'from "@/components/dialogs/add-to-timeline-dialog"');
  content = content.replace(/from\s+["']\.\/segment-preview["']/g, 'from "@/components/subtitles/segment-preview"');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed relative imports in', filePath);
  }
});
