$ErrorActionPreference = "Stop"

$sourcePath = Join-Path $PSScriptRoot "puzzle.js"
$outputPath = Join-Path $PSScriptRoot "answer-key.svg"
$content = Get-Content -Raw -Encoding UTF8 $sourcePath
$jsonMatch = [regex]::Match($content, 'window\.BIRTHDAY_STRANDS_PUZZLE\s*=\s*(\{[\s\S]*\});\s*$')

if (-not $jsonMatch.Success) {
  throw "Could not parse puzzle.js"
}

$data = $jsonMatch.Groups[1].Value | ConvertFrom-Json
$puzzles = if ($data.puzzles) { @($data.puzzles) } else { @($data) }
$colors = @(
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#6366f1",
  "#a855f7", "#ec4899", "#84cc16", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6",
  "#8b5cf6", "#d946ef", "#f43f5e", "#65a30d", "#0891b2", "#7c3aed", "#db2777"
)

function Escape-Xml([string]$value) {
  return [System.Security.SecurityElement]::Escape($value)
}

function Normalize-Word([string]$value) {
  return ($value -replace '[^A-Za-z]', '').ToUpper()
}

function Get-ContrastColor([string]$hex) {
  $r = [convert]::ToInt32($hex.Substring(1, 2), 16)
  $g = [convert]::ToInt32($hex.Substring(3, 2), 16)
  $b = [convert]::ToInt32($hex.Substring(5, 2), 16)
  $luminance = (0.299 * $r + 0.587 * $g + 0.114 * $b) / 255

  if ($luminance -gt 0.58) {
    return "#102629"
  }

  return "#ffffff"
}

function Get-AnswerColor($answer, [int]$index) {
  if (($answer.PSObject.Properties.Name -contains "color") -and $answer.color) {
    return [string]$answer.color
  }

  return $colors[$index % $colors.Count]
}

function Get-PuzzleInfo($puzzle) {
  $grid = @($puzzle.grid)
  $answers = @($puzzle.answers)
  $rows = $grid.Count
  $cols = $grid[0].Length
  $cellAnswers = @{}
  $usedCells = @{}

  foreach ($row in $grid) {
    if ($row.Length -ne $cols) {
      throw "Every grid row must be the same length in $($puzzle.label)"
    }
  }

  for ($answerIndex = 0; $answerIndex -lt $answers.Count; $answerIndex++) {
    $answer = $answers[$answerIndex]
    $letters = ""
    $previous = $null

    foreach ($point in @($answer.path)) {
      $row = [int]$point[0]
      $col = [int]$point[1]

      if ($previous -ne $null) {
        $dr = [math]::Abs($row - $previous[0])
        $dc = [math]::Abs($col - $previous[1])
        if ($dr + $dc -ne 1) {
          throw "$($answer.word) has a non-adjacent step in $($puzzle.label)"
        }
      }

      $previous = @($row, $col)
      $key = "$row,$col"
      if ($cellAnswers.ContainsKey($key)) {
        throw "Cell $key is used by more than one answer in $($puzzle.label)"
      }

      $cellAnswers[$key] = $answerIndex
      $usedCells[$key] = $true
      $letters += $grid[$row][$col]
    }

    $expected = Normalize-Word $answer.word
    if ($letters -ne $expected) {
      throw "$($answer.word) maps to $letters, expected $expected"
    }
  }

  return [pscustomobject]@{
    Label = $puzzle.label
    Theme = $puzzle.theme
    Grid = $grid
    Answers = $answers
    Rows = $rows
    Cols = $cols
    CellAnswers = $cellAnswers
    Clip = $puzzle.clip
    ClipCellCount = if ($puzzle.clip -and $puzzle.clip.cells) { @($puzzle.clip.cells).Count } elseif ($puzzle.clip) { 1 } else { 0 }
    FillerCellCount = ($rows * $cols) - $usedCells.Count
  }
}

$infos = @($puzzles | ForEach-Object { Get-PuzzleInfo $_ })
$cell = 38
$gap = 4
$left = 58
$blockTop = 86
$blockGap = 58
$legendWidth = 390
$blocks = @()
$width = 0
$height = 34

foreach ($info in $infos) {
  $gridWidth = ($info.Cols * $cell) + (($info.Cols - 1) * $gap)
  $gridHeight = ($info.Rows * $cell) + (($info.Rows - 1) * $gap)
  $legendX = $left + $gridWidth + 58
  $legendHeight = ($info.Answers.Count * 31) + 42
  $blockHeight = $blockTop + [math]::Max($gridHeight, $legendHeight) + 36
  $width = [math]::Max($width, $legendX + $legendWidth + 44)
  $blocks += [pscustomobject]@{
    Info = $info
    Y = $height
    GridWidth = $gridWidth
    GridHeight = $gridHeight
    LegendX = $legendX
    BlockHeight = $blockHeight
  }
  $height += $blockHeight + $blockGap
}

$height -= $blockGap
$svg = New-Object System.Collections.Generic.List[string]
$svg.Add('<?xml version="1.0" encoding="UTF-8"?>')
$svg.Add("<svg xmlns=""http://www.w3.org/2000/svg"" width=""$width"" height=""$height"" viewBox=""0 0 $width $height"">")
$svg.Add('<rect width="100%" height="100%" fill="#f7f4ee"/>')

foreach ($block in $blocks) {
  $info = $block.Info
  $top = $block.Y + $blockTop
  $legendX = $block.LegendX
  $legendY = $top + 2
  $safeLabel = Escape-Xml $info.Label
  $safeTheme = Escape-Xml $info.Theme
  $note = if ($info.ClipCellCount -gt 1 -and $info.ClipCellCount -eq $info.FillerCellCount) { "Flower tiles are popup triggers." } elseif ($info.ClipCellCount -gt 0 -and $info.FillerCellCount -gt $info.ClipCellCount) { "Grey tiles include popup triggers and disabled filler." } elseif ($info.ClipCellCount -eq 1) { "Flower tile is the popup trigger." } elseif ($info.FillerCellCount -gt 1) { "Grey tiles are disabled filler." } elseif ($info.FillerCellCount -eq 1) { "Grey tile is disabled filler." } else { "Every tile belongs to an answer." }

  $svg.Add("<text x=""34"" y=""$($block.Y + 34)"" font-family=""Inter, Segoe UI, Arial, sans-serif"" font-size=""24"" font-weight=""900"" fill=""#102629"">$safeLabel</text>")
  $svg.Add("<text x=""34"" y=""$($block.Y + 58)"" font-family=""Inter, Segoe UI, Arial, sans-serif"" font-size=""14"" font-weight=""700"" fill=""#5d6a66"">$safeTheme. Rows and columns start at 1.</text>")

  for ($col = 0; $col -lt $info.Cols; $col++) {
    $x = $left + ($col * ($cell + $gap)) + ($cell / 2)
    $svg.Add("<text x=""$x"" y=""$($top - 14)"" text-anchor=""middle"" font-family=""Inter, Segoe UI, Arial, sans-serif"" font-size=""13"" font-weight=""800"" fill=""#5d6a66"">$($col + 1)</text>")
  }

  for ($row = 0; $row -lt $info.Rows; $row++) {
    $y = $top + ($row * ($cell + $gap)) + 25
    $svg.Add("<text x=""$($left - 18)"" y=""$y"" text-anchor=""end"" font-family=""Inter, Segoe UI, Arial, sans-serif"" font-size=""13"" font-weight=""800"" fill=""#5d6a66"">$($row + 1)</text>")
  }

  for ($row = 0; $row -lt $info.Rows; $row++) {
    for ($col = 0; $col -lt $info.Cols; $col++) {
      $key = "$row,$col"
      $x = $left + ($col * ($cell + $gap))
      $y = $top + ($row * ($cell + $gap))
      $letter = $info.Grid[$row][$col]

      if (-not $info.CellAnswers.ContainsKey($key)) {
        $svg.Add("<rect x=""$x"" y=""$y"" width=""$cell"" height=""$cell"" rx=""7"" fill=""#ece6db"" stroke=""#d7cfc1"" stroke-width=""2""/>")
        $svg.Add("<text x=""$($x + ($cell / 2))"" y=""$($y + 25)"" text-anchor=""middle"" font-family=""Inter, Segoe UI, Arial, sans-serif"" font-size=""17"" font-weight=""900"" fill=""#a19788"">$letter</text>")
        continue
      }

      $answerIndex = $info.CellAnswers[$key]
      $answer = $info.Answers[$answerIndex]
      $color = Get-AnswerColor $answer $answerIndex
      $textColor = Get-ContrastColor $color
      $stroke = if ($answer.kind -eq "spangram") { "#102629" } else { "#fffdf8" }
      $strokeWidth = if ($answer.kind -eq "spangram") { 3 } else { 2 }
      $svg.Add("<rect x=""$x"" y=""$y"" width=""$cell"" height=""$cell"" rx=""7"" fill=""$color"" stroke=""$stroke"" stroke-width=""$strokeWidth""/>")
      $svg.Add("<text x=""$($x + ($cell / 2))"" y=""$($y + 25)"" text-anchor=""middle"" font-family=""Inter, Segoe UI, Arial, sans-serif"" font-size=""17"" font-weight=""900"" fill=""$textColor"">$letter</text>")
    }
  }

  $svg.Add("<text x=""$legendX"" y=""$($legendY - 30)"" font-family=""Inter, Segoe UI, Arial, sans-serif"" font-size=""18"" font-weight=""900"" fill=""#102629"">Legend</text>")
  $svg.Add("<text x=""$legendX"" y=""$($legendY - 10)"" font-family=""Inter, Segoe UI, Arial, sans-serif"" font-size=""12"" font-weight=""700"" fill=""#5d6a66"">Black outline marks the spangram. $note</text>")

  for ($i = 0; $i -lt $info.Answers.Count; $i++) {
    $answer = $info.Answers[$i]
    $color = Get-AnswerColor $answer $i
    $y = $legendY + ($i * 31)
    $label = if ($answer.kind -eq "spangram") { "Spangram - $($answer.word)" } else { $answer.word }
    $safeAnswerLabel = Escape-Xml $label
    $stroke = if ($answer.kind -eq "spangram") { "#102629" } else { "#fffdf8" }
    $strokeWidth = if ($answer.kind -eq "spangram") { 2 } else { 1 }

    $svg.Add("<rect x=""$legendX"" y=""$($y - 14)"" width=""18"" height=""18"" rx=""4"" fill=""$color"" stroke=""$stroke"" stroke-width=""$strokeWidth""/>")
    $svg.Add("<text x=""$($legendX + 28)"" y=""$y"" font-family=""Inter, Segoe UI, Arial, sans-serif"" font-size=""14"" font-weight=""800"" fill=""#102629"">$safeAnswerLabel</text>")
  }
}

$svg.Add('</svg>')
Set-Content -Path $outputPath -Value ($svg -join "`n") -Encoding UTF8
Write-Output "Wrote $outputPath"
