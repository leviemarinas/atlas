$ErrorActionPreference = 'Stop'

$ffmpeg = 'C:\Users\josrp\OneDrive\Documents\Atlas\company-configuration-prototype\node_modules\.pnpm\ffmpeg-static@5.3.0\node_modules\ffmpeg-static\ffmpeg.exe'
$captureDir = Join-Path $PSScriptRoot 'captures'
$outputDir = Join-Path $PSScriptRoot 'media-sharp'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$sets = [ordered]@{
  '01-company-rules' = @(
    'rules-01-overview.png',
    'rules-02-step1.png',
    'rules-03-step1-filled.png',
    'rules-04-step2.png',
    'rules-05-step2-selected.png',
    'rules-06-review.png'
  )
  '02-take-home-pay' = @('engines-01-library.png', 'thp-01-top.png', 'thp-02-details.png')
  '03-retirement-pay' = @('engines-01-library.png', 'ret-01-top.png', 'ret-02-details.png')
  '04-final-pay' = @('engines-01-library.png', 'fin-01-top.png', 'fin-02-details.png')
  '05-gross-up' = @('engines-01-library.png', 'gup-01-top.png', 'gup-02-details.png')
}

$render = @{
  '01-company-rules' = @{ Crop = 'crop=iw:trunc(iw/1.257/2)*2:0:(ih-oh)/2'; Scale = '1920:1528' }
  '02-take-home-pay' = @{ Crop = 'crop=iw:trunc(iw/2.014/2)*2:0:(ih-oh)/2'; Scale = '1920:954' }
  '03-retirement-pay' = @{ Crop = 'crop=trunc(ih*0.651/2)*2:ih:(iw-ow)/2:0'; Scale = '1250:1920' }
  '04-final-pay' = @{ Crop = 'crop=trunc(ih*0.515/2)*2:ih:(iw-ow)/2:0'; Scale = '990:1920' }
  '05-gross-up' = @{ Crop = 'crop=trunc(ih*0.817/2)*2:ih:(iw-ow):0'; Scale = '1568:1920' }
}

foreach ($name in $sets.Keys) {
  $listPath = Join-Path $outputDir ($name + '.txt')
  $lines = New-Object System.Collections.Generic.List[string]
  foreach ($file in $sets[$name]) {
    $full = (Join-Path $captureDir $file).Replace("'", "'\''")
    $lines.Add("file '$full'")
    $lines.Add('duration 2.4')
  }
  $last = (Join-Path $captureDir $sets[$name][-1]).Replace("'", "'\''")
  $lines.Add("file '$last'")
  Set-Content -LiteralPath $listPath -Value $lines -Encoding ascii

  $gif = Join-Path $outputDir ($name + '.gif')
  $crop = $render[$name].Crop
  $scale = $render[$name].Scale
  $gifFilter = "[0:v]$crop,scale=$scale`:flags=lanczos,fps=2,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=full[p];[s1][p]paletteuse=dither=none:diff_mode=rectangle"
  & $ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i $listPath -filter_complex $gifFilter -loop 0 $gif
  if ($LASTEXITCODE -ne 0) { throw "Failed to create $gif" }
}

Get-ChildItem -LiteralPath $outputDir -Filter '*.gif' | Select-Object Name, Length
