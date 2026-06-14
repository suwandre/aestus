#Requires -Version 7
# Aestus agentic build loop.
# Spawns one headless Claude Code worker per phase (P00-P30), verifies each phase
# with an independent reviewer, records metrics, and stops on blockers/budget/.stop.
#
# Usage:
#   .\scripts\loop.ps1                       # run from first incomplete phase to P30
#   .\scripts\loop.ps1 -Budget 50            # halt when cumulative cost reaches $50
#   .\scripts\loop.ps1 -StartPhase 3 -EndPhase 5
#   .\scripts\loop.ps1 -DryRun               # print the plan, spawn nothing
#
# Graceful stop while running:  New-Item .stop  (worker finishes current task, then exits)
#
# Runs non-interactively to the end. The only between-phase pause is the 5h rate-limit
# gate: when an agent emits a 'warned'/'limited' rate_limit_event for the five_hour
# window, the loop stops after the current phase and asks before continuing — so it
# won't keep burning the window once it's nearly exhausted.

param(
    [int]$StartPhase = -1,
    [int]$EndPhase = 30,
    [double]$Budget = 0,
    [switch]$DryRun,
    [switch]$SkipCI
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path $PSScriptRoot -Parent
$MetricsCsv = Join-Path $RepoRoot 'metrics.csv'
$StopFile = Join-Path $RepoRoot '.stop'

# Format a number with a fixed decimal count using a period separator regardless
# of the machine's locale — German locale otherwise writes "1,333", and the comma
# splits the cost_usd column into two in the CSV.
function Fmt([double]$n, [int]$dp) {
    return $n.ToString("F$dp", [System.Globalization.CultureInfo]::InvariantCulture)
}

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
        '--output-format', 'stream-json', '--verbose',
        '--dangerously-skip-permissions'
    )
    if ($Effort) { $argList += @('--effort', $Effort) }

    $label = "P{0:D2}" -f $Phase
    Write-Host ("[{0}] spawning {1} ({2}{3})..." -f $label, $Role, $Model, $(if ($Effort) { " / effort=$Effort" } else { '' })) -ForegroundColor Cyan

    # stream-json emits newline-delimited events live. Print assistant text + tool
    # calls as they arrive (so the terminal shows continuous progress), and capture
    # the final 'result' event for metrics.
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $script:r = $null
    Push-Location $RepoRoot
    try {
        $Prompt | & claude @argList 2>$null | ForEach-Object {
            $line = $_
            if ([string]::IsNullOrWhiteSpace($line)) { return }
            $evt = $null
            try { $evt = $line | ConvertFrom-Json } catch { return }
            switch ($evt.type) {
                'assistant' {
                    foreach ($block in $evt.message.content) {
                        if ($block.type -eq 'text' -and $block.text.Trim()) {
                            Write-Host ("  {0}" -f $block.text.Trim()) -ForegroundColor Gray
                        } elseif ($block.type -eq 'tool_use') {
                            $detail = if ($block.input.command) { $block.input.command }
                                      elseif ($block.input.file_path) { $block.input.file_path }
                                      elseif ($block.input.path) { $block.input.path }
                                      elseif ($block.input.pattern) { $block.input.pattern }
                                      else { '' }
                            $detail = ($detail -replace '\s+', ' ').Trim()
                            if ($detail.Length -gt 100) { $detail = $detail.Substring(0, 100) + '…' }
                            Write-Host ("  → {0}{1}" -f $block.name, $(if ($detail) { " $detail" } else { '' })) -ForegroundColor DarkGray
                        }
                    }
                }
                'result' { $script:r = $evt }
                'system' {
                    # stream-json emits a rate_limit_event only when crossing a warning
                    # threshold; 'utilization' is absent in normal operation. We track the
                    # five_hour window status so the loop can pause before exhausting it.
                    if ($evt.subtype -eq 'rate_limit_event') {
                        $rl = $evt.event
                        if (-not $rl.rateLimitType -or $rl.rateLimitType -eq 'five_hour') {
                            $script:RateLimitStatus = $rl.status
                            $script:RateLimitResetsAt = $rl.resetsAt
                            if ($rl.status -ne 'allowed') {
                                Write-Host ("  ! 5h rate limit: {0} (resets {1})" -f `
                                    $rl.status,
                                    $(if ($rl.resetsAt) { [DateTimeOffset]::FromUnixTimeSeconds([long]$rl.resetsAt).LocalDateTime.ToString('HH:mm') } else { '?' })
                                ) -ForegroundColor Yellow
                            }
                        }
                    }
                }
            }
        }
    } finally {
        Pop-Location
        $sw.Stop()
    }

    $r = $script:r
    if (-not $r) {
        Write-Host ("[{0}] {1} ended with no result event (crash or auth failure)." -f $label, $Role) -ForegroundColor Red
        throw "Agent stream produced no result event."
    }

    $cost = [double]($r.total_cost_usd ?? 0)
    $script:TotalCost += $cost
    $u = $r.usage
    $inTok = [long](($u.input_tokens ?? 0) + ($u.cache_read_input_tokens ?? 0) + ($u.cache_creation_input_tokens ?? 0))
    $cachePct = if ($inTok -gt 0) { [math]::Round(100 * ($u.cache_read_input_tokens ?? 0) / $inTok) } else { 0 }
    $durS = [math]::Round(($r.duration_ms ?? $sw.ElapsedMilliseconds) / 1000)

    Write-Host ("[{0}] {1} done | {2} turns | {3}k in ({4}% cached) / {5}k out | `$$(Fmt $cost 3) | {6}m {7}s | total `$$(Fmt $script:TotalCost 3)" -f `
        $label, $Role, $r.num_turns,
        [math]::Round($inTok / 1000), $cachePct, [math]::Round(($u.output_tokens ?? 0) / 1000),
        [math]::Floor($durS / 60), ($durS % 60)) -ForegroundColor Green

    if (-not (Test-Path $MetricsCsv)) {
        'timestamp,phase,role,model,effort,duration_s,turns,input_tokens,cache_read_tokens,output_tokens,cost_usd,is_error' |
            Set-Content $MetricsCsv -Encoding UTF8
    }
    ('{0},{1},{2},{3},{4},{5},{6},{7},{8},{9},{10},{11}' -f `
        (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'), $label, $Role, $Model, ($Effort ?? ''), $durS,
        $r.num_turns, $inTok, ($u.cache_read_input_tokens ?? 0), ($u.output_tokens ?? 0),
        (Fmt $cost 3), [bool]$r.is_error) | Add-Content $MetricsCsv -Encoding UTF8

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
        Write-Host ("`nBudget cap `$$(Fmt $Budget 2) reached (spent `$$(Fmt $script:TotalCost 2)) — halting.") -ForegroundColor Yellow
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

# --- Phase review checkpoint ---------------------------------------------------
# The reviewer commits a "### PXX REVIEW — PASS" line to progress.md. Treat that as a
# durable checkpoint: a phase whose tasks are done but whose review was interrupted
# (Ctrl+C during the reviewer) is re-reviewed on the next launch instead of skipped.
function Test-PhaseReviewed([int]$Phase) {
    $progress = Join-Path $RepoRoot 'progress.md'
    if (-not (Test-Path $progress)) { return $false }
    $label = 'P{0:D2}' -f $Phase
    return [bool](Select-String -Path $progress -Pattern "^### $label REVIEW.*PASS" -Quiet)
}

# --- CI gate -------------------------------------------------------------------
# After a phase, verify the pushed commits pass CI on GitHub. On failure, feed the
# failed log to an escalating repair worker (Sonnet -> Opus) and re-check. Non-blocking
# when CI can't be determined (no gh CLI, no workflow, or poll timeout).
function Get-LatestCIRun {
    $json = gh run list --branch main --limit 1 --json databaseId,status,conclusion 2>$null
    if (-not $json) { return $null }
    try { return @($json | ConvertFrom-Json)[0] } catch { return $null }
}
function Wait-CI([int]$TimeoutSec = 600) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $run = Get-LatestCIRun
        if (-not $run) { return $null }
        if ($run.status -eq 'completed') { return $run }
        Start-Sleep -Seconds 15
    }
    return $null
}
function Invoke-CIGate([int]$Phase) {
    $label = 'P{0:D2}' -f $Phase
    if ($SkipCI) { return $true }
    if (-not (Test-Path (Join-Path $RepoRoot '.github\workflows'))) { return $true }
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Host "[$label] CI check skipped — gh CLI not found." -ForegroundColor DarkYellow
        return $true
    }

    $escalation = @(
        @{ Model = 'claude-sonnet-4-6'; Effort = $null },
        @{ Model = 'claude-opus-4-8';   Effort = 'high' }
    )
    for ($attempt = 0; $attempt -le $escalation.Count; $attempt++) {
        Write-Host "[$label] checking CI on main..." -ForegroundColor Cyan
        $run = Wait-CI
        if (-not $run) { Write-Host "[$label] CI status indeterminate — skipping gate." -ForegroundColor DarkYellow; return $true }
        if ($run.conclusion -eq 'success') { Write-Host "[$label] CI green." -ForegroundColor Green; return $true }
        if ($attempt -eq $escalation.Count) { break }

        $log = (gh run view $run.databaseId --log-failed 2>$null | Out-String)
        if ($log.Length -gt 6000) { $log = $log.Substring($log.Length - 6000) }
        $fixer = $escalation[$attempt]
        Write-Host ("[{0}] CI FAILED ({1}) — repair attempt {2} ({3})" -f $label, $run.conclusion, ($attempt + 1), $fixer.Model) -ForegroundColor Yellow
        $prompt = @"
CI on the ``main`` branch is failing. Fix the root cause with minimal, targeted changes — no scope expansion. A common cause early on: a test command that exits non-zero when a package has no test files yet. Project guardrails in CLAUDE.md are absolute.

After each fix: commit (conventional message, e.g. ``fix(ci): ...``) and ``git push`` immediately. Never edit metrics.csv.

Most recent failed CI log (tail):
``````
$log
``````
"@
        Invoke-Agent -Role 'ci-repair' -Phase $Phase -Model $fixer.Model -Effort $fixer.Effort -Prompt $prompt | Out-Null
        if (Test-Halt) { return $false }
        Start-Sleep -Seconds 10  # let the push trigger a fresh CI run before re-polling
    }
    Write-Host "[$label] CI still failing after repairs — halting for human input." -ForegroundColor Red
    return $false
}

# --- Main ----------------------------------------------------------------------
$script:TotalCost = 0.0
$script:RateLimitStatus = 'allowed'
$script:RateLimitResetsAt = $null
$script:McpConfig = if (-not $DryRun) { New-McpConfig } else { '' }
$loopStart = Get-Date

# Always scan from P00 (or the requested StartPhase). Completed+reviewed phases are
# fast-skipped per-iteration; a completed-but-unreviewed phase gets its review re-run.
if ($StartPhase -lt 0) { $StartPhase = 0 }

Write-Host ("Aestus build loop | phases P{0:D2}-P{1:D2} | budget: {2}" -f $StartPhase, $EndPhase, $(if ($Budget -gt 0) { "`$$Budget" } else { 'unlimited' })) -ForegroundColor Magenta

# Verify current CI state up front — catches a red main left by an earlier run.
if (-not $DryRun) { if (-not (Invoke-CIGate $StartPhase)) { return } }

for ($phase = $StartPhase; $phase -le $EndPhase; $phase++) {
    $state = Get-PhaseState $phase
    $label = 'P{0:D2}' -f $phase
    if ($state.Total -eq 0) { Write-Host "[$label] no tasks found — skipping." -ForegroundColor DarkGray; continue }
    if ($state.Blocked -gt 0) {
        Write-Host "[$label] has $($state.Blocked) blocked [!] task(s) — resolve in todo/progress.md, then rerun." -ForegroundColor Red
        break
    }
    if ($state.Open -eq 0) {
        if (Test-PhaseReviewed $phase) {
            Write-Host "[$label] already complete & reviewed ($($state.Done)/$($state.Total)) — skipping." -ForegroundColor DarkGray
            continue
        }
        # Tasks done but the review never passed (e.g. Ctrl+C during the reviewer). Re-run it.
        if ($DryRun) { Write-Host "[$label] plan: complete but unreviewed — would run review." ; continue }
        Write-Host "[$label] tasks complete but review missing — running review now." -ForegroundColor Yellow
        if (Test-Halt) { break }
        if (-not (Invoke-ReviewCycle $phase (Get-Routing $phase))) { break }
        if (-not (Invoke-CIGate $phase)) { break }
        continue
    }

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
    if (-not (Invoke-CIGate $phase)) { break }

    Write-Host ("[{0}] PHASE COMPLETE | cumulative: `$$(Fmt $script:TotalCost 2) | elapsed: {1:hh\:mm\:ss}" -f $label, ((Get-Date) - $loopStart)) -ForegroundColor Magenta

    # 5h rate-limit gate: only pause if an agent reported the five_hour window as
    # near/at its cap. Otherwise run straight through to the next phase.
    if ($script:RateLimitStatus -ne 'allowed' -and $phase -lt $EndPhase) {
        $reset = if ($script:RateLimitResetsAt) {
            [DateTimeOffset]::FromUnixTimeSeconds([long]$script:RateLimitResetsAt).LocalDateTime.ToString('HH:mm')
        } else { 'unknown' }
        Write-Host ("`n5h usage near limit (status=$script:RateLimitStatus, resets $reset). Continue to next phase and keep spending? [y/N]") -ForegroundColor Yellow
        $ans = Read-Host
        if ($ans -notmatch '^(y|yes)$') {
            Write-Host 'Stopping to preserve the 5h window. Rerun later to continue.' -ForegroundColor Yellow
            break
        }
        $script:RateLimitStatus = 'allowed'  # ask once per warning crossing
    }
}

Write-Host ("`nLoop finished | total cost: `$$(Fmt $script:TotalCost 2) | wall time: {0:hh\:mm\:ss} | metrics: metrics.csv" -f ((Get-Date) - $loopStart)) -ForegroundColor Magenta
