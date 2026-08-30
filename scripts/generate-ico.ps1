# Generates multi-size Windows .ico from nuevo_logo_sin_fondo.png
Add-Type -AssemblyName System.Drawing
$srcPath = Join-Path $PSScriptRoot "..\nuevo_logo_sin_fondo.png"
if (!(Test-Path $srcPath)) {
    $srcPath = Join-Path $PSScriptRoot "..\public\logoSpigot.png"
}
$srcBmp = [System.Drawing.Bitmap]::FromFile($srcPath)
$destIcoPath = Join-Path $PSScriptRoot "..\logoSpigot.ico"
$publicIcoPath = Join-Path $PSScriptRoot "..\public\logoSpigot.ico"

function Create-IcoFromPng($sourceBmp, $outputPath) {
    $sizes = @(16, 32, 48, 64, 128, 256)
    $images = @()
    foreach ($size in $sizes) {
        $resized = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($resized)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.DrawImage($sourceBmp, 0, 0, $size, $size)
        $g.Dispose()
        
        $ms = New-Object System.IO.MemoryStream
        $resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $pngBytes = $ms.ToArray()
        $ms.Dispose()
        $resized.Dispose()
        
        $images += @{
            Width = $size
            Height = $size
            Bytes = $pngBytes
        }
    }
    
    $fs = [System.IO.File]::Create($outputPath)
    $bw = New-Object System.IO.BinaryWriter($fs)
    
    # ICONDIR
    $bw.Write([uint16]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]$images.Count)
    
    $offset = 6 + (16 * $images.Count)
    
    # ICONDIRENTRY
    foreach ($img in $images) {
        $w = if ($img.Width -ge 256) { [byte]0 } else { [byte]$img.Width }
        $h = if ($img.Height -ge 256) { [byte]0 } else { [byte]$img.Height }
        $bw.Write($w)
        $bw.Write($h)
        $bw.Write([byte]0)
        $bw.Write([byte]0)
        $bw.Write([uint16]1)
        $bw.Write([uint16]32)
        $bw.Write([uint32]$img.Bytes.Length)
        $bw.Write([uint32]$offset)
        $offset += $img.Bytes.Length
    }
    
    # Image data
    foreach ($img in $images) {
        $bw.Write($img.Bytes)
    }
    
    $bw.Flush()
    $fs.Close()
}

Create-IcoFromPng $srcBmp $destIcoPath
Create-IcoFromPng $srcBmp $publicIcoPath
$srcBmp.Dispose()
Write-Output "Successfully generated logoSpigot.ico"
