param(
    [string]$Image = 'public.ecr.aws/supabase/postgres:17.11.0.003'
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
