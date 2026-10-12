# Helper persistant (Windows PowerShell 5.1, requis pour WinRT).
# Lit une commande JSON par ligne sur stdin, repond une ligne JSON sur stdout : {id, ok, data|error}
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) {
    $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result
}
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
$asStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1 }
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float level, Guid ctx);
  int j(); int GetMasterVolumeLevelScalar(out float level);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid ctx);
  int GetMute(out bool mute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice d); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
public static class Vol {
  static IAudioEndpointVolume Ep() {
    var en = (IMMDeviceEnumerator)new MMDeviceEnumerator(); IMMDevice d; en.GetDefaultAudioEndpoint(0, 1, out d);
    var iid = typeof(IAudioEndpointVolume).GUID; object o; d.Activate(ref iid, 23, IntPtr.Zero, out o); return (IAudioEndpointVolume)o;
  }
  public static float Get() { float v; Ep().GetMasterVolumeLevelScalar(out v); return v; }
  public static void Set(float v) { Ep().SetMasterVolumeLevelScalar(v, Guid.Empty); }
  public static bool Muted() { bool m; Ep().GetMute(out m); return m; }
  public static void Mute(bool m) { Ep().SetMute(m, Guid.Empty); }
}
public static class Shell {
  [DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int state);
  public static int State() { int s; SHQueryUserNotificationState(out s); return s; }
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, System.Text.StringBuilder s, int n);
  public struct RECT { public int L, T, R, B; }
  public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
  // Fenetre visible a un point de l'ecran (pixels physiques)
  public static object AtPoint(int x, int y) {
    var p = new POINT { X = x, Y = y };
    var h = GetAncestor(WindowFromPoint(p), 2);   // GA_ROOT
    return Describe(h);
  }
  static object Describe(IntPtr h) {
    if (h == IntPtr.Zero || !IsWindowVisible(h)) return null;
    var c = new System.Text.StringBuilder(256); GetClassName(h, c, 256);
    RECT r; GetWindowRect(h, out r); uint pid; GetWindowThreadProcessId(h, out pid);
    return new { max = IsZoomed(h), l = r.L, t = r.T, r = r.R, b = r.B, pid = pid, cls = c.ToString() };
  }
  // Fenetre au premier plan : maximisee ? rectangle en pixels physiques, pid, classe
  public static object Foreground() {
    return Describe(GetForegroundWindow());
  }
}
"@

[Shell]::SetProcessDpiAwarenessContext([IntPtr]-4) | Out-Null   # coordonnees physiques
$lastThumbKey = $null; $lastThumb = $null
function Get-Media($knownKey) {
    $s = $mgr.GetCurrentSession()
    if ($null -eq $s) { return @{ present = $false } }
    $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $info = $s.GetPlaybackInfo(); $tl = $s.GetTimelineProperties()
    $key = "$($p.Title)|$($p.Artist)"
    if ($key -ne $script:lastThumbKey -or -not $script:lastThumb) {
        $script:lastThumbKey = $key; $script:lastThumb = $null
        if ($p.Thumbnail) {
            try {
                # Le flux WinRT arrive comme __ComObject brut : on passe par AsStreamForRead via reflexion
                $stream = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
                $ms = New-Object IO.MemoryStream
                $asStreamForRead.Invoke($null, @($stream)).CopyTo($ms)
                $bytes = $ms.ToArray()
                $mime = if ($bytes.Length -gt 3 -and $bytes[0] -eq 0x89) { 'image/png' } else { 'image/jpeg' }
                if ($bytes.Length) { $script:lastThumb = "data:$mime;base64," + [Convert]::ToBase64String($bytes) }
            } catch { }
        }
    }
    @{
        present = $true; title = $p.Title; artist = $p.Artist; app = $s.SourceAppUserModelId
        status = $info.PlaybackStatus.ToString(); key = $key
        # la pochette n'est renvoyee que si le client ne l'a pas deja
        thumb = $(if ($knownKey -ne $key) { $script:lastThumb } else { $null })
        position = $tl.Position.TotalSeconds; duration = $tl.EndTime.TotalSeconds
    }
}

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    $id = $null
    try {
        $cmd = $line | ConvertFrom-Json; $id = $cmd.id
        $data = switch ($cmd.op) {
            'media' { Get-Media $cmd.arg }
            'media-cmd' {
                $s = $mgr.GetCurrentSession()
                if ($s) {
                    $op = switch ($cmd.arg) { 'toggle' { $s.TryTogglePlayPauseAsync() } 'next' { $s.TrySkipNextAsync() } 'prev' { $s.TrySkipPreviousAsync() } }
                    Await $op ([bool]) | Out-Null
                }
                $true
            }
            'volume' { @{ level = [math]::Round([Vol]::Get() * 100); muted = [Vol]::Muted() } }
            'volume-set' { [Vol]::Set([float]$cmd.arg / 100); $true }
            'mute' { [Vol]::Mute([bool]$cmd.arg); $true }
            # 2 = occupe (plein ecran), 3 = jeu D3D plein ecran, 4 = presentation
            'quns' { [Shell]::State() }
            'fg' { [Shell]::Foreground() }
            'at' { [Shell]::AtPoint([int]$cmd.arg.x, [int]$cmd.arg.y) }
            'net' {
                $rx = 0; $tx = 0
                foreach ($n in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
                    if ($n.OperationalStatus -ne 'Up' -or $n.NetworkInterfaceType -eq 'Loopback') { continue }
                    $st = $n.GetIPv4Statistics(); $rx += $st.BytesReceived; $tx += $st.BytesSent
                }
                @{ rx = $rx; tx = $tx }
            }
            default { throw "op inconnue: $($cmd.op)" }
        }
        [Console]::Out.WriteLine((@{ id = $id; ok = $true; data = $data } | ConvertTo-Json -Compress -Depth 5))
    } catch {
        [Console]::Out.WriteLine((@{ id = $id; ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress))
    }
    [Console]::Out.Flush()
}
