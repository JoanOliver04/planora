param(
    [string]$Image = 'public.ecr.aws/supabase/postgres:17.11.0.003',
    [string]$EncryptedBackupPath
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$containerName = 'planora-security-test-' + [guid]::NewGuid().ToString('N')
$containerCreated = $false

function Invoke-TestDocker {
    param([string[]]$DockerArguments)
    & docker @DockerArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker command failed with exit code $LASTEXITCODE."
    }
}

try {
    # Never pull/install dependencies or connect to an existing database.
    try {
        & docker image inspect $Image --format '{{.Id}}' *> $null
        if ($LASTEXITCODE -ne 0) { throw 'Image inspection failed.' }
    }
    catch {
        throw "The local image $Image is unavailable. Load the image before running this test."
    }
    Write-Host 'Starting an isolated PostgreSQL security test (no network or published ports).'
    Invoke-TestDocker -DockerArguments @(
        'run', '--detach', '--pull', 'never', '--name', $containerName,
        '--network', 'none', '--tmpfs', '/var/lib/postgresql/data:rw',
        '--env', ('POSTGRES_PASSWORD=' + [guid]::NewGuid().ToString('N')), $Image
    ) | Out-Null
    $containerCreated = $true

    $ready = $false
    $deadline = [datetime]::UtcNow.AddSeconds(45)
    do {
        # The image uses a temporary socket-only server during initialization.
        # TCP loopback becomes ready only after its extension setup is complete.
        & docker exec $containerName pg_isready -h 127.0.0.1 -U postgres -d postgres *> $null
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            break
        }
        Start-Sleep -Milliseconds 500
    } while ([datetime]::UtcNow -lt $deadline)
    if (-not $ready) { throw 'The isolated PostgreSQL instance did not become ready.' }

    Invoke-TestDocker -DockerArguments @(
        'cp', (Join-Path $repositoryRoot 'supabase/migrations'), "${containerName}:/tmp/planora-migrations"
    )
    Invoke-TestDocker -DockerArguments @(
        'cp', (Join-Path $repositoryRoot 'supabase/tests/security_hardening.sql'), "${containerName}:/tmp/security_hardening.sql"
    )
    Write-Host 'Applying every repository migration in filename order.'
    Invoke-TestDocker -DockerArguments @(
        'exec', $containerName, 'sh', '-c',
        'for migration in /tmp/planora-migrations/*.sql; do psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f "$migration" || exit 1; done'
    )
    Write-Host 'Running restore, ownership, JSON bounds and quota integration tests.'
    Invoke-TestDocker -DockerArguments @(
        'exec', $containerName, 'psql', '-X', '-U', 'postgres', '-d', 'postgres',
        '-v', 'ON_ERROR_STOP=1', '-q', '-f', '/tmp/security_hardening.sql'
    )
    if ($EncryptedBackupPath) {
        if ($env:OS -ne 'Windows_NT') { throw 'DPAPI recovery requires Windows.' }
        Add-Type -AssemblyName System.Security
        $recoveryCipher = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $EncryptedBackupPath))
        $recoveryBytes = [Security.Cryptography.ProtectedData]::Unprotect(
            $recoveryCipher, [Text.Encoding]::UTF8.GetBytes('Planora account backup v1'),
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        $recoveryBundle = [Text.Encoding]::UTF8.GetString($recoveryBytes) | ConvertFrom-Json
        if ($recoveryBundle.format -ne 'planora-account-backup-bundle' -or $recoveryBundle.version -ne 1) {
            throw 'Unrecognized encrypted backup bundle.'
        }
        $recoveryTables = [ordered]@{
            schedules='schedules'; categories='categories'; tasks='tasks'; events='events'
            completions='task_completions'; templates='schedule_templates'; reminders='reminders'
            focus_presets='focus_presets'; focus_sessions='focus_sessions'
            focus_intervals='focus_intervals'; focus_goals='focus_goals'
        }
        $recoveryPreviousEncoding = $OutputEncoding
        try {
            $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
            foreach ($recoveryAccount in $recoveryBundle.accounts) {
                $recoveryPayload = ConvertTo-Json -InputObject $recoveryAccount.backup.data -Depth 100 -Compress
                do { $recoveryDataTag = '$planora_data_' + [guid]::NewGuid().ToString('N') + '$' } while ($recoveryPayload.Contains($recoveryDataTag))
                do { $recoveryDoTag = '$planora_check_' + [guid]::NewGuid().ToString('N') + '$' } while ($recoveryPayload.Contains($recoveryDoTag))
                $recoveryUser = [guid]::NewGuid().ToString()
                $recoveryAssertions = foreach ($recoveryTable in $recoveryTables.GetEnumerator()) {
                    $recoveryExpected = @($recoveryAccount.backup.data.($recoveryTable.Key)).Count
                    "if (select count(*) from public.$($recoveryTable.Value) where user_id=auth.uid()) <> $recoveryExpected then raise exception using errcode='PZ002', message='Recovered row count mismatch'; end if;"
                }
                $recoverySql = @"
begin;
insert into auth.users(id,raw_user_meta_data) values ('$recoveryUser','{}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub','$recoveryUser',true);
do $recoveryDoTag
declare outcome jsonb;
begin
  if auth.uid() is distinct from '$recoveryUser'::uuid then raise exception using errcode='PZ003', message='Wrong local recovery identity'; end if;
  outcome:=public.restore_planora_backup(${recoveryDataTag}${recoveryPayload}${recoveryDataTag}::jsonb);
  if outcome->>'ok' is distinct from 'true' then raise exception using errcode='PZ001', message='Local recovery rejected'; end if;
  $($recoveryAssertions -join [Environment]::NewLine)
end
$recoveryDoTag;
rollback;
"@
                try {
                    $ErrorActionPreference = 'Continue'
                    # No plaintext files or query output: send data only to the
                    # newly created network-isolated local container's stdin.
                    $recoveryDiagnostics = $recoverySql | & docker exec -i $containerName psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -q 2>&1
                    $recoveryExit = $LASTEXITCODE
                }
                finally { $ErrorActionPreference = 'Stop' }
                if ($recoveryExit -ne 0) {
                    $recoverySqlState = [regex]::Match(($recoveryDiagnostics -join ' '), 'ERROR:\s+([A-Z0-9]{5})\b').Groups[1].Value
                    throw "Encrypted backup recovery failed (SQLSTATE $recoverySqlState); private diagnostics omitted."
                }
            }
            Write-Host ("Encrypted backup recovery passed for {0} accounts." -f @($recoveryBundle.accounts).Count)
        }
        finally { $OutputEncoding = $recoveryPreviousEncoding }
    }
    Write-Host 'Database security integration tests passed.'
}
finally {
    # This unpredictable name belongs exclusively to this invocation. Existing
    # user containers/databases are never enumerated, reused, stopped or removed.
    if ($containerCreated) {
        & docker rm --force $containerName *> $null
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Could not remove the isolated test container $containerName."
        }
    }
}
