param(
  [Parameter(Mandatory = $true)][string]$ReferencePptx,
  [Parameter(Mandatory = $true)][string]$TargetPptx
)

Add-Type -AssemblyName System.IO.Compression.FileSystem

$reference = [System.IO.Compression.ZipFile]::OpenRead($ReferencePptx)
$target = [System.IO.Compression.ZipFile]::Open($TargetPptx, [System.IO.Compression.ZipArchiveMode]::Update)
try {
  $themeEntries = @($reference.Entries | Where-Object { $_.FullName -match '^ppt/theme/theme\d+\.xml$' })
  foreach ($sourceEntry in $themeEntries) {
    $existing = $target.GetEntry($sourceEntry.FullName)
    if ($null -ne $existing) { $existing.Delete() }
    $newEntry = $target.CreateEntry($sourceEntry.FullName, [System.IO.Compression.CompressionLevel]::Optimal)
    $input = $sourceEntry.Open()
    $output = $newEntry.Open()
    try { $input.CopyTo($output) }
    finally { $output.Dispose(); $input.Dispose() }
  }
}
finally {
  $target.Dispose()
  $reference.Dispose()
}
