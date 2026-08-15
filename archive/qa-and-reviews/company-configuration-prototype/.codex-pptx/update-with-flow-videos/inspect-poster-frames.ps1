$deck='C:\Users\josrp\OneDrive\Documents\Atlas\company-configuration-prototype\.codex-pptx\update-with-flow-videos\media-base.pptx'
$slides=11,13,25,33,41
$wps=New-Object -ComObject KWPP.Application
$wps.Visible=-1
$p=$wps.Presentations.Open($deck)
foreach($n in $slides){$s=$p.Slides.Item($n);foreach($sh in $s.Shapes){if($sh.Name -eq 'Image 0'){[pscustomobject]@{Slide=$n;Left=$sh.Left;Top=$sh.Top;Width=$sh.Width;Height=$sh.Height;Ratio=[math]::Round($sh.Width/$sh.Height,3)}}}}
$p.Close();$wps.Quit()
