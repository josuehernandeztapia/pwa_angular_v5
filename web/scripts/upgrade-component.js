#!/usr/bin/env node
/**
 * Upgrade Component Script
 * Applies minimal, non-destructive premium class scaffolding hints to target components.
 * This is a scaffold utility; teams can extend per-component transformations.
 */

const fs = require('fs');
const path = require('path');

const componentKey = process.argv[2];
if (!componentKey) {
  console.error('Usage: node scripts/upgrade-component.js <component-key>');
  process.exit(1);
}

const SRC_ROOT = path.resolve(__dirname, '..', 'src', 'app');

// Map friendly keys to substrings expected in component filenames
const COMPONENT_HINTS = {
  'nueva-oportunidad': 'nueva-oportunidad',
  'flow-builder': 'flow-builder',
  'clientes-list': 'clientes-list',
  'onboarding-main': 'onboarding-main',
  'simulador-main': 'simulador-main',
  'cotizador-main': 'cotizador-main',
  'opportunities-pipeline': 'opportunities-pipeline',
  'cliente-form': 'cliente-form',
  'avi-verification-modal': 'avi-verification-modal',
  'document-upload-shell': 'document-upload-shell',
  'usage-reports': 'usage-reports',
  'claims-page': 'claims-page',
  'monitoring-panel': 'monitoring-panel',
  'ops-deliveries': 'ops-deliveries',
  'delivery-detail': 'delivery-detail',
  'ops-import-tracker': 'ops-import-tracker',
  'triggers-monitor': 'triggers-monitor',
  'client-tracking': 'client-tracking',
  'integration-dashboard': 'integration.component'
};

const hint = COMPONENT_HINTS[componentKey];
if (!hint) {
  console.error(`Unknown component key: ${componentKey}`);
  process.exit(1);
}

function findFiles(dir, matcher) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(abs, matcher));
    } else if (matcher(abs)) {
      results.push(abs);
    }
  }
  return results;
}

// Find target component TypeScript files
const candidates = findFiles(SRC_ROOT, (p) => p.endsWith('.component.ts') && p.includes(hint));

if (candidates.length === 0) {
  console.error(`No component found for key: ${componentKey}`);
  process.exit(1);
}

const target = candidates[0];
const original = fs.readFileSync(target, 'utf8');

// Attempt to inject premium container class to top-level wrapper in inline template
let updated = original;

if (original.includes('template: `')) {
  updated = updated.replace(
    /template:\s*`([\s\S]*?)`/,
    (match, tpl) => {
      // Heuristic: wrap first top-level <div ...> with premium-container class if missing
      const injected = tpl.replace(
        /<div(\s+[^>]*)?>/,
        (divMatch) => {
          if (divMatch.includes('premium-container')) return divMatch;
          if (divMatch.includes('class="')) {
            return divMatch.replace('class="', 'class="premium-container ');
          }
          return divMatch.replace('<div', '<div class="premium-container"');
        }
      );
      return `template: ` + '`' + injected + '`';
    }
  );
}

if (updated !== original) {
  fs.writeFileSync(target, updated, 'utf8');
  console.log(`✅ Premium scaffold applied to: ${path.relative(process.cwd(), target)}`);
} else {
  console.log(`ℹ️ No inline template changes applied for: ${path.relative(process.cwd(), target)} (possibly external template)`);
}

process.exit(0);
