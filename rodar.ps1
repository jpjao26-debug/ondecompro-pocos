# OndeCompro em Pocos de Caldas? - roda a coleta do dia e publica o app (chamado pelo Agendador de Tarefas)
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
$PSDefaultParameterValues["Out-File:Encoding"] = "utf8"
$pastaLogs = Join-Path $PSScriptRoot "logs"
New-Item -ItemType Directory -Force $pastaLogs | Out-Null
$log = Join-Path $pastaLogs ("{0:yyyy-MM-dd}.txt" -f (Get-Date))
function RodarPython { if (Get-Command py.exe -ErrorAction SilentlyContinue) { & py.exe -3 @args } else { & python.exe @args } }

"===== Inicio: $(Get-Date -Format 'dd/MM/yyyy HH:mm') =====" | Out-File $log -Append -Encoding utf8
# prioridade baixa: o PC continua leve enquanto o robo trabalha (o Python e o navegador herdam)
try { (Get-Process -Id $PID).PriorityClass = "BelowNormal" } catch {}

git pull --rebase --autostash *>> $log
RodarPython -m coletor.rodar *>> $log
if ($LASTEXITCODE -eq 0) {
    RodarPython -m coletor.publicar *>> $log
} else {
    "A coleta falhou - o app continua com os precos anteriores." | Out-File $log -Append -Encoding utf8
}
"===== Fim: $(Get-Date -Format 'dd/MM/yyyy HH:mm') =====" | Out-File $log -Append -Encoding utf8

# apaga logs com mais de 30 dias
Get-ChildItem $pastaLogs -Filter *.txt | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -ErrorAction SilentlyContinue
