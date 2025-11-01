#!/usr/bin/env node
/**
 * Runtime configuration validator for SSR/QA/Production builds.
 *
 * Usage:
 *   RUNTIME_ENV=qa node scripts/validate-runtime-config.mjs
 *   NODE_ENV=production npm run validate:runtime-config
 */

import process from 'node:process'

const runtime_env = (process.env.RUNTIME_ENV || process.env.NODE_ENV || 'development').toLowerCase();
const required_flags_by_env = {
    'development': [],
    'qa': ['BFF_BASE_URL'],
    'staging': ['BFF_BASE_URL'],
    'production': ['BFF_BASE_URL'],
};

const boolean_flags = [
    'ENABLE_MOCK_DATA',
    'ENABLE_POSTVENTA',
    'ENABLE_CLAIMS_BFF',
    'ENABLE_ADMIN_BFF',
    'ENABLE_LABS',
    'ENABLE_USAGE_MODULE',
];

const problems = [];
const warnings = [];

const required_flags = required_flags_by_env[runtime_env] || required_flags_by_env['development'];
for (const flag of required_flags) {
    const value = process.env[flag];
    if (!value || value.trim() === '') {
        problems.push(`Missing required env var ${flag} for runtime env "${runtime_env}"`);
    }
}

for (const flag of boolean_flags) {
    const value = process.env[flag];
    if (!value || value === '') {
        continue;
    }
    if (!['true', 'false'].includes(value.toLowerCase())) {
        problems.push(`Env var ${flag} must be "true" or "false", received "${value}"`);
    }
}

const bff_url = process.env.BFF_BASE_URL;
if (bff_url) {
    if (!(bff_url.startsWith('http://') || bff_url.startsWith('https://'))) {
        warnings.push(`BFF_BASE_URL="${bff_url}" does not look like an absolute URL. Consider using https://...`);
    }
    if (runtime_env === 'production' && bff_url.includes('localhost')) {
        problems.push('BFF_BASE_URL cannot point to localhost in production builds');
    }
}

if (problems.length > 0) {
    console.log(`
❌ Runtime configuration validation failed:
`);
    for (const issue of problems) {
        console.log(`  • ${issue}`);
    }
    if (warnings.length > 0) {
        console.log(`
Warnings:`);
        for (const warn of warnings) {
            console.log(`  • ${warn}`);
        }
    }
    process.exit(1);
}

if (warnings.length > 0) {
    console.log(`
⚠️ Runtime configuration warnings:`);
    for (const warn of warnings) {
        console.log(`  • ${warn}`);
    }
}

console.log(`
✅ Runtime configuration validated for environment "${runtime_env}"`);