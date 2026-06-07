#Requires -Version 7
# Aestus agentic build loop.
# Spawns one headless Claude Code worker per phase (P00-P30), verifies each phase
# with an independent reviewer, records metrics, and stops on blockers/budget/.stop.
#
# Usage:
#   .\scripts\loop.ps1                       # run from first incomplete phase to P30
#   .\scripts\loop.ps1 -Interactive          # pause for keypress between phases
#   .\scripts\loop.ps1 -Budget 50            # halt when cumulative cost reaches $50
#   .\scripts\loop.ps1 -StartPhase 3 -EndPhase 5
#   .\scripts\loop.ps1 -DryRun               # print the plan, spawn nothing
#
# Graceful stop while running:  New-Item .stop  (worker finishes current task, then exits)

param(
    [int]$StartPhase = -1,
    [int]$EndPhase = 30,
    [switch]$Interactive,
    [double]$Budget = 0,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path $PSScriptRoot -Parent
$MetricsCsv = Join-Path $RepoRoot 'metrics.csv'
$StopFile = Join-Path $RepoRoot '.stop'

# --- Locate the todo file (P00-T001 moves it under docs/specs/) ---------------
function Get-TodoPath {
    foreach ($p in @('docs\specs\cockpit_agentic_build_todo.md', 'cockpit_agentic_build_todo.md')) {
        $full = Join-Path $RepoRoot $p
        if (Test-Path $full) { return $full }
    }
    throw 'cockpit_agentic_build_todo.md not found at repo root or docs/specs/.'
}

# --- Model/effort routing (mirrors the table in the todo) ---------------------
function Get-Routing([int]$Phase) {
    if ($Phase -in 3..5)    { return @{ Model = 'claude-opus-4-8';   Effort = 'high' } }
    if ($Phase -in 10, 11)  { return @{ Model = 'claude-opus-4-8';   Effort = 'high' } }
    if ($Phase -in 12, 13)  { return @{ Model = 'claude-opus-4-8';   Effort = 'max'  } }
    if ($Phase -eq 29)      { return @{ Model = 'claude-opus-4-8';   Effort = 'high' } }
    if ($Phase -eq 30)      { return @{ Model = 'claude-opus-4-8';   Effort = 'max'  } }
    return @{ Model = 'claude-sonnet-4-6'; Effort = $null }
}

# --- Scan phase task states from the todo --------------------------------------
function Get-PhaseState([int]$Phase) {
    $tag = 'P{0:D2}' -f $Phase
    $content = Get-Content (Get-TodoPath) -Raw
    $tasks = [regex]::Matches($content, "### \[(.)\] $tag-T\d+")
    $state = @{ Total = $tasks.Count; Open = 0; Blocked = 0; Done = 0 }
    foreach ($m in $tasks) {
        switch ($m.Groups[1].Value) {
            ' ' { $state.Open++ }
            '~' { $state.Open++ }
            '!' { $state.Blocked++ }
            'x' { $state.Done++ }
        }
    }
    return $state
}

# --- Generate MCP config (context7 only) from the user's global config --------
# Written outside the repo so the API key never lands in git.
function New-McpConfig {
    $global = Get-Content (Join-Path $env:USERPROFILE '.claude.json') -Raw | ConvertFrom-Json
    $out = Join-Path $env:TEMP 'aestus-loop-mcp.json'
    $servers = @{}
    if ($global.mcpServers.context7) { $servers.context7 = $global.mcpServers.context7 }
    @{ mcpServers = $servers } | ConvertTo-Json -Depth 10 | Set-Content $out -Encoding UTF8
    return $out
}

# --- Spawn a headless agent, return parsed result + record metrics ------------
function Invoke-Agent {
    param(
        [string]$Role,           # worker | reviewer | repair
        [int]$Phase,
        [string]$Model,
        [string]$Effort,
        [string]$Prompt
    )
    $argList = @(
        '-p', '--model', $Model,
        '--settings', (Join-Path $PSScriptRoot 'loop-settings.json'),
        '--mcp-config', $script:McpConfig, '--strict-mcp-config',
        '--output-format', 'json',
        '--dangerously-skip-permissions'
    )
    if ($Effort) { $argList += @('--effort', $Effort) }

    $label = "P{0:D2}" -f $Phase
    Write-Host ("[{0}] spawning {1} ({2}{3})..." -f $label, $Role, $Model, $(if ($Effort) { " / effort=$Effort" } else { '' })) -ForegroundColor Cyan

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    Push-Location $RepoRoot
    try {
        $raw = $Prompt | & claude @argList 2>$null | Out-String
    } finally {
        Pop-Location
        $sw.Stop()
    }

    $r = $null
    try { $r = $raw | ConvertFrom-Json } catch { }
    if (-not $r) {
        Write-Host ("[{0}] {1} produced unparseable output:" -f $label, $Role) -ForegroundColor Red
        Write-Host ($raw.Substring(0, [Math]::Min(2000, $raw.Length)))
        throw "Agent output was not valid JSON."
    }

    $cost = [double]($r.total_cost_usd ?? 0)
    $script:TotalCost += $cost
    $u = $r.usage
    $inTok = [long](($u.input_tokens ?? 0) + ($u.cache_read_input_tokens ?? 0) + ($u.cache_creation_input_tokens ?? 0))
    $cachePct = if ($inTok -gt 0) { [math]::Round(100 * ($u.cache_read_input_tokens ?? 0) / $inTok) } else { 0 }
    $durS = [math]::Round(($r.duration_ms ?? $sw.ElapsedMilliseconds) / 1000)

    Write-Host ("[{0}] {1} done | {2} turns | {3}k in ({4}% cached) / {5}k out | `${6} | {7}m {8}s | total `${9}" -f `
        $label, $Role, $r.num_turns,
        [math]::Round($inTok / 1000), $cachePct, [math]::Round(($u.output_tokens ?? 0) / 1000),
        [math]::Round($cost, 2), [math]::Floor($durS / 60), ($durS % 60),
        [math]::Round($script:TotalCost, 2)) -ForegroundColor Green

    if (-not (Test-Path $MetricsCsv)) {
        'timestamp,phase,role,model,effort,duration_s,turns,input_tokens,cache_read_tokens,output_tokens,cost_usd,is_error' |
            Set-Content $MetricsCsv -Encoding UTF8
    }
    ('{0},{1},{2},{3},{4},{5},{6},{7},{8},{9},{10},{11}' -f `
        (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'), $label, $Role, $Model, ($Effort ?? ''), $durS,
        $r.num_turns, $inTok, ($u.cache_read_input_tokens ?? 0), ($u.output_tokens ?? 0),
        [math]::Round($cost, 4), [bool]$r.is_error) | Add-Content $MetricsCsv -Encoding UTF8

    return $r
}

# --- Prompt builders -----------------------------------------------------------
function Get-Template([string]$Name) {
    Get-Content (Join-Path $PSScriptRoot $Name) -Raw
}
function Build-Prompt([string]$Template, [int]$Phase, [string]$Extra = '', [string]$Findings = '') {
    $todoRel = (Get-TodoPath).Substring($RepoRoot.Length + 1).Replace('\', '/')
    $Template.
        Replace('{PHASE}', ('P{0:D2}' -f $Phase)).
        Replace('{TODO_PATH}', $todoRel).
        Replace('{EXTRA}', $Extra).
        Replace('{FINDINGS}', $Findings)
}

# --- Budget / stop helpers -----------------------------------------------------
function Test-Halt {
    if (Test-Path $StopFile) {
        Write-Host "`n.stop file found — halting loop. Delete .stop and rerun to continue." -ForegroundColor Yellow
        return $true
    }
    if ($Budget -gt 0 -and $script:TotalCost -ge $Budget) {
        Write-Host ("`nBudget cap `${0} reached (spent `${1}) — halting." -f $Budget, [math]::Round($script:TotalCost, 2)) -ForegroundColor Yellow
        return $true
    }
    return $false
}

# --- Review/repair cycle: review -> repair(phase model) -> review -> repair(opus high) -> review
function Invoke-ReviewCycle([int]$Phase, [hashtable]$Routing) {
    $escalation = @(
        @{ Model = $Routing.Model;     Effort = $Routing.Effort },
        @{ Model = 'claude-opus-4-8';  Effort = 'high' }
    )
    for ($attempt = 0; $attempt -le $escalation.Count; $attempt++) {
        $review = Invoke-Agent -Role 'reviewer' -Phase $Phase -Model 'claude-sonnet-4-6' -Effort $null `
            -Prompt (Build-Prompt (Get-Template 'reviewer-prompt.md') $Phase)
        $verdict = ($review.result -split "`n")[0].Trim()
        if ($verdict -match 'PHASE_REVIEW:\s*PASS') { return $true }
        if ($attempt -eq $escalation.Count) { break }
        if (Test-Halt) { return $false }
        $fixer = $escalation[$attempt]
        Write-Host ("[P{0:D2}] review FAILED — repair attempt {1} ({2})" -f $Phase, ($attempt + 1), $fixer.Model) -ForegroundColor Yellow
        Invoke-Agent -Role 'repair' -Phase $Phase -Model $fixer.Model -Effort $fixer.Effort `
            -Prompt (Build-Prompt (Get-Template 'repair-prompt.md') $Phase -Findings $review.result) | Out-Null
        if (Test-Halt) { return $false }
    }
    Write-Host ("[P{0:D2}] review still failing after repairs — halting for human input. See progress.md." -f $Phase) -ForegroundColor Red
    return $false
}

# --- Main ----------------------------------------------------------------------
$script:TotalCost = 0.0
$script:McpConfig = if (-not $DryRun) { New-McpConfig } else { '' }
$loopStart = Get-Date

if ($StartPhase -lt 0) {
    $StartPhase = 0
    for ($p = 0; $p -le 30; $p++) {
        $s = Get-PhaseState $p
        if ($s.Open -gt 0 -or $s.Blocked -gt 0) { $StartPhase = $p; break }
        if ($p -eq 30 -and $s.Open -eq 0) { Write-Host 'All phases complete.' -ForegroundColor Green; return }
    }
}

Write-Host ("Aestus build loop | phases P{0:D2}-P{1:D2} | budget: {2}" -f $StartPhase, $EndPhase, $(if ($Budget -gt 0) { "`$$Budget" } else { 'unlimited' })) -ForegroundColor Magenta

for ($phase = $StartPhase; $phase -le $EndPhase; $phase++) {
    $state = Get-PhaseState $phase
    $label = 'P{0:D2}' -f $phase
    if ($state.Total -eq 0) { Write-Host "[$label] no tasks found — skipping." -ForegroundColor DarkGray; continue }
    if ($state.Blocked -gt 0) {
        Write-Host "[$label] has $($state.Blocked) blocked [!] task(s) — resolve in todo/progress.md, then rerun." -ForegroundColor Red
        break
    }
    if ($state.Open -eq 0) { Write-Host "[$label] already complete ($($state.Done)/$($state.Total)) — skipping." -ForegroundColor DarkGray; continue }

    $routing = Get-Routing $phase
    if ($DryRun) {
        Write-Host ("[{0}] plan: {1} open task(s) | {2}{3}" -f $label, $state.Open, $routing.Model, $(if ($routing.Effort) { " / $($routing.Effort)" } else { '' }))
        continue
    }
    if (Test-Halt) { break }

    # P17 special case: T005/T006 are pixel-parity-critical -> Opus high, rest on Sonnet.
    $extra = ''
    if ($phase -eq 17) {
        $extra = 'Special routing: SKIP tasks P17-T005 and P17-T006 entirely (leave their checkboxes unchecked, do not mark them blocked). They will be completed by a separate stronger-model worker right after you.'
    }

    Invoke-Agent -Role 'worker' -Phase $phase -Model $routing.Model -Effort $routing.Effort `
        -Prompt (Build-Prompt (Get-Template 'worker-prompt.md') $phase -Extra $extra) | Out-Null

    if ($phase -eq 17) {
        if (Test-Halt) { break }
        Invoke-Agent -Role 'worker' -Phase 17 -Model 'claude-opus-4-8' -Effort 'high' `
            -Prompt (Build-Prompt (Get-Template 'worker-prompt.md') 17 -Extra 'Special routing: ONLY complete tasks P17-T005 and P17-T006. Ignore every other task in the phase.') | Out-Null
    }

    # Post-worker state check
    $state = Get-PhaseState $phase
    if ($state.Blocked -gt 0) {
        Write-Host "[$label] worker hit a blocker [!] — see progress.md. Halting." -ForegroundColor Red
        break
    }
    if ($state.Open -gt 0) {
        if (Test-Halt) { break }
        Write-Host "[$label] $($state.Open) task(s) still open — respawning worker once to continue." -ForegroundColor Yellow
        Invoke-Agent -Role 'worker' -Phase $phase -Model $routing.Model -Effort $routing.Effort `
            -Prompt (Build-Prompt (Get-Template 'worker-prompt.md') $phase -Extra $extra) | Out-Null
        $state = Get-PhaseState $phase
        if ($state.Open -gt 0 -or $state.Blocked -gt 0) {
            Write-Host "[$label] still incomplete after respawn — halting for human input." -ForegroundColor Red
            break
        }
    }

    if (Test-Halt) { break }
    if (-not (Invoke-ReviewCycle $phase $routing)) { break }

    Write-Host ("[{0}] PHASE COMPLETE | cumulative: `${1} | elapsed: {2:hh\:mm\:ss}" -f $label, [math]::Round($script:TotalCost, 2), ((Get-Date) - $loopStart)) -ForegroundColor Magenta

    if ($Interactive -and $phase -lt $EndPhase) {
        Write-Host 'Interactive mode — press Enter to start next phase (or Ctrl+C to stop)...' -ForegroundColor Yellow
        Read-Host | Out-Null
    }
}

Write-Host ("`nLoop finished | total cost: `${0} | wall time: {1:hh\:mm\:ss} | metrics: metrics.csv" -f [math]::Round($script:TotalCost, 2), ((Get-Date) - $loopStart)) -ForegroundColor Magenta
