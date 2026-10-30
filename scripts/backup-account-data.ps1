param(
    [Parameter(Mandatory = $true)][string]$SupabaseCli,
    [Parameter(Mandatory = $true)][string[]]$AccountIds,
    [string]$ProjectRef = 'cilfuieycxgmufiuymxa',
    [string]$OutputDirectory = (Join-Path $env:LOCALAPPDATA 'Planora/EncryptedBackups')
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This backup uses Windows CurrentUser DPAPI.' }
if ($ProjectRef -notmatch '^[a-z]{20}$') { throw 'Invalid project reference.' }
$safeIds = @($AccountIds | ForEach-Object { ([guid]::Parse($_)).ToString() } | Select-Object -Unique)
if ($safeIds.Count -eq 0) { throw 'At least one account is required.' }
$backupRepoRoot = Split-Path -Parent $PSScriptRoot
$backupTemporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ('planora-backup-' + [guid]::NewGuid().ToString('N'))
$backupPreviousEncoding = $OutputEncoding
$backupPreviousConsoleEncoding = [Console]::OutputEncoding

try {
    $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    [Console]::OutputEncoding = $OutputEncoding
    New-Item -ItemType Directory -Path $backupTemporaryDirectory | Out-Null
    $quotedIds = ($safeIds | ForEach-Object { "'$_'::uuid" }) -join ','
    $dataParts = @("'profile',to_jsonb(p)")
    $backupTables = [ordered]@{
        schedules = 'schedules'; categories = 'categories'; tasks = 'tasks'; events = 'events'
        completions = 'task_completions'; templates = 'schedule_templates'; reminders = 'reminders'
        focus_presets = 'focus_presets'; focus_sessions = 'focus_sessions'
        focus_intervals = 'focus_intervals'; focus_goals = 'focus_goals'
    }
    foreach ($backupEntry in $backupTables.GetEnumerator()) {
        $dataParts += "'$($backupEntry.Key)',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.$($backupEntry.Value) t where t.user_id=p.id),'[]'::jsonb)"
    }
    $backupQuery = 'begin read only; select jsonb_agg(jsonb_build_object(''accountId'',p.id,''data'',jsonb_build_object(' + ($dataParts -join ',') + ')) order by p.id) as accounts from public.profiles p where p.id in (' + $quotedIds + '); commit;'
    $backupQueryPath = Join-Path $backupTemporaryDirectory 'query.sql'
    Set-Content -LiteralPath $backupQueryPath -Value $backupQuery -Encoding UTF8
    # Capture data in memory only; never print rows or write plaintext exports.
    # Windows PowerShell treats native progress on stderr as ErrorRecords.
    # Suppress that progress without allowing it to terminate a valid query.
    try {
        $ErrorActionPreference = 'Continue'
        $backupRawResponse = & $SupabaseCli db query --linked --project-ref $ProjectRef --file $backupQueryPath --output-format json 2>$null
        $backupCliExit = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = 'Stop' }
    if ($backupCliExit -ne 0) { throw 'Unable to read account data for backup.' }
    try {
        $backupResponse = ($backupRawResponse -join "`n") | ConvertFrom-Json
        $backupAccounts = @($backupResponse.rows[0].accounts)
        if ($backupAccounts.Count -ne $safeIds.Count) { throw 'Account count mismatch.' }
        $backupInput = ConvertTo-Json -InputObject @{accounts = $backupAccounts} -Depth 100 -Compress
    }
    catch { throw 'Backup query validation failed; account data was not logged.' }

    $backupValidator = @'
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const repo = process.argv[2];
const localRequire = Module.createRequire(path.join(repo, 'package.json'));
const ts = localRequire('typescript');
const source = fs.readFileSync(path.join(repo, 'src/features/backup/format.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const runtimePath = path.join(repo, 'src/features/backup/__backup_runtime__.js');
const runtime = new Module(runtimePath, module);
runtime.filename = runtimePath;
runtime.paths = Module._nodeModulePaths(path.dirname(runtimePath));
runtime._compile(compiled, runtimePath);
try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
  const accounts = input.accounts.map(account => {
    const backup = runtime.exports.createBackup(account.data);
    if (!runtime.exports.parseBackup(backup).success) throw new Error('Invalid backup');
    return { accountId: account.accountId, backup };
  });
  const bundle = { format: 'planora-account-backup-bundle', version: 1, accounts };
  process.stdout.write(JSON.stringify(bundle).replace(/[^\x00-\x7f]/g, c => String.fromCharCode(92) + 'u' + c.charCodeAt(0).toString(16).padStart(4, '0')));
} catch {
  console.error('Account backup schema validation failed; private data omitted.');
  process.exitCode = 1;
}
'@
    $backupValidatorPath = Join-Path $backupTemporaryDirectory 'validate.cjs'
    Set-Content -LiteralPath $backupValidatorPath -Value $backupValidator -Encoding UTF8
    $backupValidated = $backupInput | & node $backupValidatorPath $backupRepoRoot
    if ($LASTEXITCODE -ne 0) { throw 'Portable backup validation failed.' }

    Add-Type -AssemblyName System.Security
    $backupBytes = [Text.Encoding]::UTF8.GetBytes(($backupValidated -join "`n"))
    $backupEntropy = [Text.Encoding]::UTF8.GetBytes('Planora account backup v1')
    $backupCipher = [Security.Cryptography.ProtectedData]::Protect($backupBytes, $backupEntropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
    $backupPath = Join-Path $OutputDirectory ('planora-' + [datetime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.dpapi')
    [IO.File]::WriteAllBytes($backupPath, $backupCipher)
    $backupReadback = [IO.File]::ReadAllBytes($backupPath)
    $backupDecoded = [Security.Cryptography.ProtectedData]::Unprotect($backupReadback, $backupEntropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    $backupHash = [Security.Cryptography.SHA256]::Create()
    if ([Convert]::ToBase64String($backupHash.ComputeHash($backupBytes)) -ne [Convert]::ToBase64String($backupHash.ComputeHash($backupDecoded))) {
        throw 'Encrypted backup readback verification failed.'
    }
    Write-Output (ConvertTo-Json -InputObject @{path = $backupPath; accounts = $safeIds.Count; schema = 5; encryption = 'Windows DPAPI CurrentUser'; verified = $true} -Compress)
}
finally {
    $OutputEncoding = $backupPreviousEncoding
    [Console]::OutputEncoding = $backupPreviousConsoleEncoding
    if (Test-Path -LiteralPath $backupTemporaryDirectory) {
        $backupResolvedTemporary = [IO.Path]::GetFullPath($backupTemporaryDirectory)
        $backupTemporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        if ($backupResolvedTemporary.StartsWith($backupTemporaryRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $backupResolvedTemporary) -like 'planora-backup-*') {
            Remove-Item -LiteralPath $backupResolvedTemporary -Recurse -Force
        }
    }
}
