param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [string]$ActiveSourcePath,
  [int]$Year = 2026
)

$xml = [xml](Get-Content -Raw -LiteralPath $InputPath)
$ns = New-Object Xml.XmlNamespaceManager($xml.NameTable)
$ns.AddNamespace('ss', 'urn:schemas-microsoft-com:office:spreadsheet')
$rows = $xml.SelectNodes('//ss:Worksheet/ss:Table/ss:Row', $ns)
if ($rows.Count -lt 2) { throw 'PALMS 匯出檔沒有會員資料' }

function Get-RowValues($row) {
  $values = @{}
  $position = 1
  foreach ($cell in $row.SelectNodes('./ss:Cell', $ns)) {
    $indexText = $cell.GetAttribute('Index', 'urn:schemas-microsoft-com:office:spreadsheet')
    if ($indexText) { $position = [int]$indexText }
    $data = $cell.SelectSingleNode('./ss:Data', $ns)
    $values[$position] = if ($data) { [string]$data.InnerText } else { '' }
    $position++
  }
  return $values
}

$headers = Get-RowValues $rows[0]
$records = [System.Collections.Generic.List[object]]::new()
for ($rowIndex = 1; $rowIndex -lt $rows.Count; $rowIndex++) {
  $values = Get-RowValues $rows[$rowIndex]
  $member = (([string]$values[1]) + ([string]$values[2])).Trim()
  if (-not $member) { continue }
  for ($column = 3; $column -le $headers.Count; $column++) {
    $code = ([string]$values[$column]).Trim().ToUpperInvariant()
    if ($code -notin @('P', 'A', 'L', 'M', 'S')) { continue }
    $header = [string]$headers[$column]
    if ($header -notmatch '^(\d+)月\s+(\d+)$') { continue }
    $date = '{0:D4}-{1:D2}-{2:D2}' -f $Year, [int]$Matches[1], [int]$Matches[2]
    $records.Add([pscustomobject]@{ member = $member; date = $date; code = $code })
  }
}

$outputRecords = $records
if ($ActiveSourcePath) {
  $source = Get-Content -Raw -LiteralPath $ActiveSourcePath
  $match = [regex]::Match($source, 'const activeMemberNames=new Set\(\[(.*?)\]\);')
  if (-not $match.Success) { throw '找不到系統在籍會員白名單' }
  $activeNames = [regex]::Matches($match.Groups[1].Value, '"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
  $activeSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$activeNames)
  $outputRecords = @($records | ForEach-Object {
    $record = $_
    $matchedName = if ($activeSet.Contains($record.member)) { $record.member } else { $activeNames | Where-Object { $record.member.StartsWith($_ + ' ') } | Select-Object -First 1 }
    if ($matchedName) { [pscustomobject]@{ member = $matchedName; date = $record.date; code = $record.code } }
  })
}

$outputRecords | ConvertTo-Json -Depth 3 -Compress | Set-Content -LiteralPath $OutputPath -Encoding utf8
$counts = $records | Group-Object code | Sort-Object Name | ForEach-Object { "{0}={1}" -f $_.Name, $_.Count }
$filteredCounts = $outputRecords | Group-Object code | Sort-Object Name | ForEach-Object { "{0}={1}" -f $_.Name, $_.Count }
Write-Output ("source_records={0}; active_records={1}; active_members={2}; {3}" -f $records.Count, $outputRecords.Count, (($outputRecords.member | Sort-Object -Unique).Count), ($filteredCounts -join '; '))
