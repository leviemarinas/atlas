$ErrorActionPreference = 'Stop'

$baseDeck = Join-Path $PSScriptRoot 'media-base.pptx'
$finalDeck = 'C:\Users\josrp\OneDrive\Documents\Atlas\ATLAS_Phase2_Computational_Basis_Demo_WPS_Embedded_GIFs.pptx'
$mediaDir = Join-Path $PSScriptRoot 'media'

$items = @(
  @{ Slide = 11; File = '01-company-rules.gif'; Name = 'Company Rules animated walkthrough' },
  @{ Slide = 13; File = '02-take-home-pay.gif'; Name = 'Take-Home Pay animated walkthrough' },
  @{ Slide = 25; File = '03-retirement-pay.gif'; Name = 'Retirement Pay animated walkthrough' },
  @{ Slide = 33; File = '04-final-pay.gif'; Name = 'Final Pay animated walkthrough' },
  @{ Slide = 41; File = '05-gross-up.gif'; Name = 'Gross Up animated walkthrough' }
)

$wps = $null
$presentation = $null
try {
  $wps = New-Object -ComObject KWPP.Application
  $wps.Visible = -1
  $presentation = $wps.Presentations.Open($baseDeck)

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

    $gifPath = Join-Path $mediaDir $item.File
    $gif = $slide.Shapes.AddPicture($gifPath, 0, -1, $left, $top, $width, $height)
    $gif.Name = 'WPS Embedded GIF - ' + $item.Name
    $gif.AlternativeText = $item.Name

    foreach ($shape in $slide.Shapes) {
      if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
        if ($shape.TextFrame.TextRange.Text -like '*EMBEDDED*VIDEO*') {
          $shape.TextFrame.TextRange.Text = '▶ ANIMATED DEMO · START WPS SLIDE SHOW'
        }
      }
    }
  }

  $presentation.SaveAs($finalDeck)
  $presentation.Close()
  $presentation = $null
}
finally {
  if ($null -ne $presentation) { $presentation.Close() }
  if ($null -ne $wps) { $wps.Quit() }
  if ($null -ne $presentation) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) | Out-Null }
  if ($null -ne $wps) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wps) | Out-Null }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

Write-Output $finalDeck
