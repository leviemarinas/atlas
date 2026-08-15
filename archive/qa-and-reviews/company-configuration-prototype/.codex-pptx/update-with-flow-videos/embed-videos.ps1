$ErrorActionPreference = 'Stop'

$baseDeck = Join-Path $PSScriptRoot 'media-base.pptx'
$finalDeck = 'C:\Users\josrp\OneDrive\Documents\Atlas\ATLAS_Phase2_Computational_Basis_Demo_Embedded_Videos.pptx'
$mediaDir = Join-Path $PSScriptRoot 'media'

$items = @(
  @{ Slide = 11; File = '01-company-rules.mp4'; Name = 'Company Rules walkthrough' },
  @{ Slide = 13; File = '02-take-home-pay.mp4'; Name = 'Take-Home Pay walkthrough' },
  @{ Slide = 25; File = '03-retirement-pay.mp4'; Name = 'Retirement Pay walkthrough' },
  @{ Slide = 33; File = '04-final-pay.mp4'; Name = 'Final Pay walkthrough' },
  @{ Slide = 41; File = '05-gross-up.mp4'; Name = 'Gross Up walkthrough' }
)

$powerPoint = $null
$presentation = $null
try {
  $powerPoint = New-Object -ComObject PowerPoint.Application
  $powerPoint.Visible = -1
  $presentation = $powerPoint.Presentations.Open($baseDeck, 0, 0, -1)

  foreach ($item in $items) {
    $slide = $presentation.Slides.Item($item.Slide)
    $poster = $null
    foreach ($shape in $slide.Shapes) {
      if ($shape.Name -eq 'Image 0') { $poster = $shape; break }
    }
    if ($null -eq $poster) { throw "Image 0 was not found on slide $($item.Slide)." }

    $left = $poster.Left
    $top = $poster.Top
    $width = $poster.Width
    $height = $poster.Height
    $poster.Delete()

    $videoPath = Join-Path $mediaDir $item.File
    $video = $slide.Shapes.AddMediaObject2($videoPath, 0, -1, $left, $top, $width, $height)
    $video.Name = 'Embedded Video - ' + $item.Name
    $video.AlternativeText = $item.Name
    $video.AnimationSettings.PlaySettings.PlayOnEntry = $false
    $video.AnimationSettings.PlaySettings.HideWhileNotPlaying = $false
    $video.AnimationSettings.PlaySettings.LoopUntilStopped = $false
  }

  $presentation.SaveAs($finalDeck, 24)
  $presentation.Close()
  $presentation = $null
}
finally {
  if ($null -ne $presentation) { $presentation.Close() }
  if ($null -ne $powerPoint) { $powerPoint.Quit() }
  if ($null -ne $presentation) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) | Out-Null }
  if ($null -ne $powerPoint) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint) | Out-Null }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

Write-Output $finalDeck
