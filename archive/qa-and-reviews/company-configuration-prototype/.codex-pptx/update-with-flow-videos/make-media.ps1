$ErrorActionPreference = 'Stop'

$ffmpeg = 'C:\Users\josrp\OneDrive\Documents\Atlas\company-configuration-prototype\node_modules\.pnpm\ffmpeg-static@5.3.0\node_modules\ffmpeg-static\ffmpeg.exe'
$captureDir = Join-Path $PSScriptRoot 'captures'
$outputDir = Join-Path $PSScriptRoot 'media'
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

foreach ($name in $sets.Keys) {
  $listPath = Join-Path $outputDir ($name + '.txt')
  $lines = New-Object System.Collections.Generic.List[string]
  foreach ($file in $sets[$name]) {
    $full = (Join-Path $captureDir $file).Replace("'", "'\\''")
    $lines.Add("file '$full'")
    $lines.Add('duration 2.4')
  }
  $last = (Join-Path $captureDir $sets[$name][-1]).Replace("'", "'\\''")
  $lines.Add("file '$last'")
  Set-Content -LiteralPath $listPath -Value $lines -Encoding ascii

  $mp4 = Join-Path $outputDir ($name + '.mp4')
  $gif = Join-Path $outputDir ($name + '.gif')
  $videoFilter = 'crop=iw:trunc(iw*9/16/2)*2:0:(ih-oh)/2,scale=1280:720:flags=lanczos,setsar=1,fps=30,format=yuv420p'
  & $ffmpeg -y -f concat -safe 0 -i $listPath -f lavfi -i 'anullsrc=r=48000:cl=stereo' -vf $videoFilter -c:v libx264 -profile:v main -level 3.1 -preset medium -crf 20 -c:a aac -b:a 96k -shortest -movflags +faststart $mp4
  if ($LASTEXITCODE -ne 0) { throw "Failed to create $mp4" }

  $gifFilter = '[0:v]crop=iw:trunc(iw*9/16/2)*2:0:(ih-oh)/2,scale=960:540:flags=lanczos,fps=4,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3'
  & $ffmpeg -y -f concat -safe 0 -i $listPath -filter_complex $gifFilter -loop 0 $gif
  if ($LASTEXITCODE -ne 0) { throw "Failed to create $gif" }
}
