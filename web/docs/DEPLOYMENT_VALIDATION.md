# Deployment Validation Checklist

Run the following script before promoting a build to staging or production:

```bash
./scripts/deployment-validate.sh             # Default QA validation
RUNTIME_ENV=production ./scripts/deployment-validate.sh --skip-tests
```

The script performs:

1. `npm run validate:runtime-config`
2. `npm run lint`
3. `npm run test:unit` (unless `--skip-tests` is passed)
4. `npm run build:prod`
5. `npm run smoke:pwa`

If any step fails the script exits with a non-zero status. Review the console output and re-run after addressing the issue.

Store the command output together with the release artefacts for auditability.
