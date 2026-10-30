param(
    [Parameter(Mandatory = $true)][string]$SupabaseCli,
    [string]$ProjectRef = 'cilfuieycxgmufiuymxa'
)
# Explicit production setup, never executed by migrations or CI. No credentials
# enter Git, command-line arguments, console output, or cron.job.command.
$ErrorActionPreference = 'Stop'
if ($ProjectRef -ne 'cilfuieycxgmufiuymxa') { throw 'Unexpected production project.' }
$pushRepo = Split-Path -Parent $PSScriptRoot
$pushTemp = Join-Path $pushRepo ('test-results/push-setup-' + [guid]::NewGuid().ToString('N') + '.sql')
try {
    $materialRaw = & node -e "const w=require('web-push'),c=require('node:crypto');process.stdout.write(JSON.stringify({...w.generateVAPIDKeys(),token:c.randomBytes(32).toString('hex')}));"
    if ($LASTEXITCODE -ne 0) { throw 'Unable to generate push keys.' }
    $material = $materialRaw | ConvertFrom-Json
    if ($material.publicKey -notmatch '^[A-Za-z0-9_-]{87}$' -or $material.privateKey -notmatch '^[A-Za-z0-9_-]{43}$' -or $material.token -notmatch '^[a-f0-9]{64}$') { throw 'Invalid generated keys.' }
    $sql = @"
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
insert into planora_push.configuration(id,public_key,private_key,dispatch_token,dispatch_url)
values(true,'$($material.publicKey)','$($material.privateKey)','$($material.token)','https://planora-lake-one.vercel.app/api/push/dispatch')
on conflict(id) do nothing;
create or replace function planora_push.wake_dispatcher() returns void
language plpgsql security definer set search_path = '' as `$wake`$
declare c planora_push.configuration;
begin
  select * into c from planora_push.configuration where id;
  if not found then return; end if;
  perform net.http_post(url:=c.dispatch_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||c.dispatch_token),body:='{}'::jsonb,timeout_milliseconds:=55000);
end;
`$wake`$;
revoke all on function planora_push.wake_dispatcher() from public, anon, authenticated, service_role;
select cron.schedule('planora-web-push','* * * * *','select planora_push.wake_dispatcher();');
commit;
select jsonb_build_object('configured',exists(select 1 from planora_push.configuration),'cronActive',exists(select 1 from cron.job where jobname='planora-web-push' and active)) as result;
"@
    [IO.File]::WriteAllText($pushTemp, '', [Text.UTF8Encoding]::new($false))
    $acl = New-Object Security.AccessControl.FileSecurity
    $acl.SetAccessRuleProtection($true, $false)
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow')))
    Set-Acl -LiteralPath $pushTemp -AclObject $acl
    [IO.File]::WriteAllText($pushTemp, $sql, [Text.UTF8Encoding]::new($false))
    try {
        $ErrorActionPreference = 'Continue'
        $raw = & $SupabaseCli db query --linked --project-ref $ProjectRef --file $pushTemp --output-format json 2>$null
        $pushExit = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = 'Stop' }
    if ($pushExit -ne 0) { throw 'Push setup failed; sensitive SQL output withheld.' }
    $result = ($raw -join "`n") | ConvertFrom-Json
    if (-not $result.rows[0].result.configured -or -not $result.rows[0].result.cronActive) { throw 'Push setup could not be verified.' }
    Write-Output 'Web Push configured; minute scheduler active; existing keys preserved.'
}
finally {
    if (Test-Path -LiteralPath $pushTemp) { Remove-Item -LiteralPath $pushTemp -Force }
    $material = $null; $materialRaw = $null; $sql = $null
}
