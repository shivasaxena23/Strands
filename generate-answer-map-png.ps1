$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $PSScriptRoot "puzzle.js"
$outputPath = Join-Path $PSScriptRoot "answer-key.png"
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

function Normalize-Word([string]$value) {
  return ($value -replace '[^A-Za-z]', '').ToUpper()
}

function Get-Color([string]$hex) {
  return [System.Drawing.ColorTranslator]::FromHtml($hex)
}

function Get-ContrastColor([string]$hex) {
  $r = [convert]::ToInt32($hex.Substring(1, 2), 16)
  $g = [convert]::ToInt32($hex.Substring(3, 2), 16)
  $b = [convert]::ToInt32($hex.Substring(5, 2), 16)
  $luminance = (0.299 * $r + 0.587 * $g + 0.114 * $b) / 255

  if ($luminance -gt 0.58) {
    return (Get-Color "#102629")
  }

  return [System.Drawing.Color]::White
}

function Get-AnswerColor($answer, [int]$index) {
  if (($answer.PSObject.Properties.Name -contains "color") -and $answer.color) {
    return [string]$answer.color
  }

  return $colors[$index % $colors.Count]
}

function New-RoundedRectanglePath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $diameter = $radius * 2
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
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
$bitmap = New-Object System.Drawing.Bitmap ([int]$width), ([int]$height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear((Get-Color "#f7f4ee"))

$fontFamily = "Segoe UI"
$titleFont = New-Object System.Drawing.Font($fontFamily, 24, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$subtitleFont = New-Object System.Drawing.Font($fontFamily, 14, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$labelFont = New-Object System.Drawing.Font($fontFamily, 13, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$cellFont = New-Object System.Drawing.Font($fontFamily, 17, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$legendTitleFont = New-Object System.Drawing.Font($fontFamily, 18, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$legendFont = New-Object System.Drawing.Font($fontFamily, 14, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

$inkBrush = New-Object System.Drawing.SolidBrush((Get-Color "#102629"))
$mutedBrush = New-Object System.Drawing.SolidBrush((Get-Color "#5d6a66"))
$paperPen = New-Object System.Drawing.Pen((Get-Color "#fffdf8"), 2)
$spangramPen = New-Object System.Drawing.Pen((Get-Color "#102629"), 3)
$fillerPenColor = Get-Color "#d7cfc1"

$centerFormat = New-Object System.Drawing.StringFormat
$centerFormat.Alignment = [System.Drawing.StringAlignment]::Center
$centerFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

$leftFormat = New-Object System.Drawing.StringFormat
$leftFormat.Alignment = [System.Drawing.StringAlignment]::Near
$leftFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

$rightFormat = New-Object System.Drawing.StringFormat
$rightFormat.Alignment = [System.Drawing.StringAlignment]::Far
$rightFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

foreach ($block in $blocks) {
  $info = $block.Info
  $top = $block.Y + $blockTop
  $legendX = $block.LegendX
  $legendY = $top + 2
  $note = if ($info.ClipCellCount -gt 1 -and $info.ClipCellCount -eq $info.FillerCellCount) { "Flower tiles are popup triggers." } elseif ($info.ClipCellCount -gt 0 -and $info.FillerCellCount -gt $info.ClipCellCount) { "Grey tiles include popup triggers and disabled filler." } elseif ($info.ClipCellCount -eq 1) { "Flower tile is the popup trigger." } elseif ($info.FillerCellCount -gt 1) { "Grey tiles are disabled filler." } elseif ($info.FillerCellCount -eq 1) { "Grey tile is disabled filler." } else { "Every tile belongs to an answer." }

  $graphics.DrawString($info.Label, $titleFont, $inkBrush, 34, $block.Y + 10)
  $graphics.DrawString("$($info.Theme). Rows and columns start at 1.", $subtitleFont, $mutedBrush, 34, $block.Y + 42)

  for ($col = 0; $col -lt $info.Cols; $col++) {
    $x = $left + ($col * ($cell + $gap))
    $bounds = [System.Drawing.RectangleF]::new([float]$x, [float]($top - 31), [float]$cell, 18)
    $graphics.DrawString("$($col + 1)", $labelFont, $mutedBrush, $bounds, $centerFormat)
  }

  for ($row = 0; $row -lt $info.Rows; $row++) {
    $y = $top + ($row * ($cell + $gap))
    $bounds = [System.Drawing.RectangleF]::new(0, [float]$y, [float]($left - 18), [float]$cell)
    $graphics.DrawString("$($row + 1)", $labelFont, $mutedBrush, $bounds, $rightFormat)
  }

  for ($row = 0; $row -lt $info.Rows; $row++) {
    for ($col = 0; $col -lt $info.Cols; $col++) {
      $key = "$row,$col"
      $x = $left + ($col * ($cell + $gap))
      $y = $top + ($row * ($cell + $gap))
      $path = New-RoundedRectanglePath $x $y $cell $cell 7
      $letter = [string]$info.Grid[$row][$col]
      $bounds = [System.Drawing.RectangleF]::new([float]$x, [float]$y, [float]$cell, [float]$cell)

      if (-not $info.CellAnswers.ContainsKey($key)) {
        $fillBrush = New-Object System.Drawing.SolidBrush((Get-Color "#ece6db"))
        $textBrush = New-Object System.Drawing.SolidBrush((Get-Color "#a19788"))
        $fillerPen = New-Object System.Drawing.Pen($fillerPenColor, 2)
        $graphics.FillPath($fillBrush, $path)
        $graphics.DrawPath($fillerPen, $path)
        $graphics.DrawString($letter, $cellFont, $textBrush, $bounds, $centerFormat)
        $path.Dispose(); $fillBrush.Dispose(); $textBrush.Dispose(); $fillerPen.Dispose()
        continue
      }

      $answerIndex = $info.CellAnswers[$key]
      $answer = $info.Answers[$answerIndex]
      $colorHex = Get-AnswerColor $answer $answerIndex
      $fillBrush = New-Object System.Drawing.SolidBrush((Get-Color $colorHex))
      $textBrush = New-Object System.Drawing.SolidBrush((Get-ContrastColor $colorHex))
      $pen = if ($answer.kind -eq "spangram") { $spangramPen } else { $paperPen }
      $graphics.FillPath($fillBrush, $path)
      $graphics.DrawPath($pen, $path)
      $graphics.DrawString($letter, $cellFont, $textBrush, $bounds, $centerFormat)
      $path.Dispose(); $fillBrush.Dispose(); $textBrush.Dispose()
    }
  }

  $graphics.DrawString("Legend", $legendTitleFont, $inkBrush, $legendX, $legendY - 48)
  $graphics.DrawString("Black outline marks the spangram. $note", $labelFont, $mutedBrush, $legendX, $legendY - 22)

  for ($i = 0; $i -lt $info.Answers.Count; $i++) {
    $answer = $info.Answers[$i]
    $colorHex = Get-AnswerColor $answer $i
    $fillBrush = New-Object System.Drawing.SolidBrush((Get-Color $colorHex))
    $y = $legendY + ($i * 31)
    $path = New-RoundedRectanglePath $legendX ($y - 14) 18 18 4
    $pen = if ($answer.kind -eq "spangram") { $spangramPen } else { $paperPen }
    $label = if ($answer.kind -eq "spangram") { "Spangram - $($answer.word)" } else { $answer.word }
    $textBounds = [System.Drawing.RectangleF]::new([float]($legendX + 28), [float]($y - 18), [float]($legendWidth - 28), 26)
    $graphics.FillPath($fillBrush, $path)
    $graphics.DrawPath($pen, $path)
    $graphics.DrawString($label, $legendFont, $inkBrush, $textBounds, $leftFormat)
    $path.Dispose(); $fillBrush.Dispose()
  }
}

$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$bitmap.Dispose()
$titleFont.Dispose()
$subtitleFont.Dispose()
$labelFont.Dispose()
$cellFont.Dispose()
$legendTitleFont.Dispose()
$legendFont.Dispose()
$inkBrush.Dispose()
$mutedBrush.Dispose()
$paperPen.Dispose()
$spangramPen.Dispose()
$centerFormat.Dispose()
$leftFormat.Dispose()
$rightFormat.Dispose()

Write-Output "Wrote $outputPath"
