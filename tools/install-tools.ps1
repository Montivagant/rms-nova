$ErrorActionPreference = "Stop"

param(
  [string]$HelmVersion = "v3.14.4",
  [string]$TerraformVersion = "1.7.5"
)

function Ensure-Directory {
  param([string]$Path)
  if (-not (Test-Path -Path $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Download-And-ExtractZip {
  param(
    [string]$Uri,
    [string]$DestinationDirectory,
    [string]$ExecutableName
  )

  Ensure-Directory -Path $DestinationDirectory

  $tempZip = Join-Path $env:TEMP ([System.IO.Path]::GetRandomFileName() + ".zip")
  Write-Host "Downloading $Uri..."
  Invoke-WebRequest -Uri $Uri -OutFile $tempZip -UseBasicParsing

  $tempExtract = Join-Path $env:TEMP ([System.IO.Path]::GetRandomFileName())
  Ensure-Directory -Path $tempExtract
  Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force

  $exePath = Get-ChildItem -Path $tempExtract -Recurse -Filter $ExecutableName | Select-Object -First 1
  if (-not $exePath) {
    throw "Unable to locate $ExecutableName in downloaded archive."
  }

  Copy-Item -Path $exePath.FullName -Destination (Join-Path $DestinationDirectory $ExecutableName) -Force

  Remove-Item $tempZip -Force
  Remove-Item $tempExtract -Force -Recurse
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$helmZip = "https://get.helm.sh/helm-$HelmVersion-windows-amd64.zip"
$helmDestination = Join-Path $scriptRoot "helm/windows-amd64"
Download-And-ExtractZip -Uri $helmZip -DestinationDirectory $helmDestination -ExecutableName "helm.exe"

$terraformZip = "https://releases.hashicorp.com/terraform/$TerraformVersion/terraform_${TerraformVersion}_windows_amd64.zip"
$terraformDestination = Join-Path $scriptRoot "terraform"
Download-And-ExtractZip -Uri $terraformZip -DestinationDirectory $terraformDestination -ExecutableName "terraform.exe"

Write-Host "Helm and Terraform binaries installed under the tools directory."
