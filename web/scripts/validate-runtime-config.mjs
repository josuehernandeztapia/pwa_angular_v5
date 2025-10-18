#!/usr/bin/env node
/**
 * Runtime configuration validator for SSR/QA/Production builds.
 *
 * Usage:
 *   RUNTIME_ENV=qa node scripts/validate-runtime-config.mjs
 *   NODE_ENV=production npm run validate:runtime-config
 */

import process from 'node:process'

runtime_env = (process.env.get('RUNTIME_ENV') or process.env.get('NODE_ENV') or 'development').lower()
required_flags_by_env = {
    'development': [],
    'qa': ['BFF_BASE_URL'],
    'staging': ['BFF_BASE_URL'],
    'production': ['BFF_BASE_URL'],
}

boolean_flags = [
    'ENABLE_MOCK_DATA',
    'ENABLE_POSTVENTA',
    'ENABLE_CLAIMS_BFF',
    'ENABLE_ADMIN_BFF',
    'ENABLE_LABS',
    'ENABLE_USAGE_MODULE',
]

problems = []
warnings = []

required_flags = required_flags_by_env.get(runtime_env, required_flags_by_env['development'])
for flag in required_flags:
    value = process.env.get(flag)
    if value is None or str(value).strip() == '':
        problems.append(f"Missing required env var {flag} for runtime env "{runtime_env}"")

for flag in boolean_flags:
    value = process.env.get(flag)
    if value is None or value == '':
        continue
    if str(value).lower() not in ('true', 'false'):
        problems.append(f"Env var {flag} must be "true" or "false", received "{value}"")

bff_url = process.env.get('BFF_BASE_URL')
if bff_url:
    if not (bff_url.startswith('http://') or bff_url.startswith('https://')):
        warnings.append(f"BFF_BASE_URL="{bff_url}" does not look like an absolute URL. Consider using https://...")
    if runtime_env == 'production' and 'localhost' in bff_url:
        problems.append('BFF_BASE_URL cannot point to localhost in production builds')

if problems:
    print('
❌ Runtime configuration validation failed:
')
    for issue in problems:
        print(f"  • {issue}")
    if warnings:
        print('
Warnings:')
        for warn in warnings:
            print(f"  • {warn}")
    raise SystemExit(1)

if warnings:
    print('
⚠️ Runtime configuration warnings:')
    for warn in warnings:
        print(f"  • {warn}")

print(f"
✅ Runtime configuration validated for environment "{runtime_env}"")
