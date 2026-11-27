# OndeCompro? - instalacao no Windows
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
Write-Host ""
Write-Host "=== Instalacao do OndeCompro em Pocos de Caldas? ===" -ForegroundColor Green
Write-Host ""

function RodarPython { if (Get-Command py.exe -ErrorAction SilentlyContinue) { & py.exe -3 @args } else { & python.exe @args } }

# 1) Python e Git
if (-not (Get-Command py -ErrorAction SilentlyContinue) -and -not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Nao achei o Python. Instale em https://www.python.org/downloads/ (marque 'Add to PATH') e rode de novo." -ForegroundColor Red
    exit 1
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Nao achei o Git. Instale com:  winget install Git.Git   (ou https://git-scm.com) e rode de novo." -ForegroundColor Red
    exit 1
}

# 2) Bibliotecas
Write-Host "Instalando bibliotecas do Python..." -ForegroundColor Cyan
RodarPython -m pip install --upgrade pip | Out-Null
RodarPython -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { Write-Host "Falha ao instalar as bibliotecas." -ForegroundColor Red; exit 1 }

# 3) Dias: o mesmo PC do OndeCompro de Ubatuba, de segunda a sabado, junto com a coleta de Ubatuba (12:00)
$dias = @("Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"); $nomeDias = "segunda a sabado"

# 4) Ligacao com o GitHub
if (-not (Test-Path ".git")) { git init -q; git checkout -q -b main }
git config user.name "robo-ondecompro"
git config user.email "robo@ondecompro.local"
$remoto = git remote get-url origin 2>$null
if (-not $remoto) {
    Write-Host ""
    Write-Host "Cole o endereco do seu repositorio no GitHub (ex.: https://github.com/SEU-USUARIO/ondecompro-pocos.git)"
    $url = (Read-Host "Endereco").Trim()
    git remote add origin $url
}
git rev-parse --verify -q HEAD | Out-Null
if ($LASTEXITCODE -ne 0) {
    git checkout -q -B main
    git add -A
    git commit -q -m "OndeCompro em Pocos de Caldas? - primeira versao"
    Write-Host "Enviando ao GitHub (se abrir uma janela de login do GitHub, entre com sua conta)..." -ForegroundColor Cyan
    git push -u origin main
    if ($LASTEXITCODE -ne 0) {
        git pull --rebase --allow-unrelated-histories origin main
        git push -u origin main
    }
    if ($LASTEXITCODE -ne 0) { Write-Host "Nao consegui enviar ao GitHub. Confira o endereco e o login." -ForegroundColor Red; exit 1 }
} else {
    git pull --rebase --autostash
}

# 6) Agendamento
$acao = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSScriptRoot\rodar.ps1`"" -WorkingDirectory $PSScriptRoot
$gatilho = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $dias -At "12:00"
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 4) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "OndeCompro Pocos" -Action $acao -Trigger $gatilho -Settings $config -Description "Coleta os precos dos mercados de Pocos de Caldas e atualiza o app OndeCompro em Pocos?" -Force | Out-Null
Write-Host ""
Write-Host "Pronto! O robo de Pocos de Caldas vai rodar de $nomeDias as 12:00, junto com o de Ubatuba. Se o PC estiver desligado, roda quando ligar." -ForegroundColor Green
Write-Host ""
$agora = Read-Host "Quer rodar a primeira coleta agora? (s/n)"
if ($agora -eq "s") { & "$PSScriptRoot\rodar.ps1"; Write-Host "Terminou. Veja o resumo na pasta logs." -ForegroundColor Green }
