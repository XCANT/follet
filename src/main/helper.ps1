# Helper persistant (Windows PowerShell 5.1 : requis pour WinRT, absent de PowerShell 7).
# Lit une commande JSON par ligne sur stdin, repond une ligne JSON sur stdout : {id, ok, data|error}
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

# ---------- WinRT : session media ----------
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Windows.Forms
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) {
    $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result
}
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime] | Out-Null
# Le flux de la pochette arrive comme __ComObject brut : AsStreamForRead invoque par reflexion
$asStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1 }
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

# ---------- Win32 / COM ----------
Add-Type -TypeDefinition @"
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;

[StructLayout(LayoutKind.Sequential)] public struct PROPERTYKEY { public Guid fmtid; public int pid; }
[StructLayout(LayoutKind.Sequential)] public struct PROPVARIANT { public ushort vt; ushort r1, r2, r3; public IntPtr p; public IntPtr p2; }

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float level, Guid ctx);
  int j(); int GetMasterVolumeLevelScalar(out float level);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid ctx);
  int GetMute(out bool mute);
}
[Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPropertyStore { int GetCount(out uint n); int GetAt(uint i, out PROPERTYKEY k); int GetValue(ref PROPERTYKEY k, out PROPVARIANT v); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid id, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
  int OpenPropertyStore(int access, out IPropertyStore store);
  int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
}
[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceCollection { int GetCount(out uint n); int Item(uint i, out IMMDevice d); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int EnumAudioEndpoints(int flow, int mask, out IMMDeviceCollection c); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice d); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
// Interface non documentee mais stable depuis Windows 7 (utilisee par AudioDeviceCmdlets, EarTrumpet...)
[Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPolicyConfig {
  int a(); int b(); int c(); int d(); int e(); int f(); int g(); int h(); int i(); int j();
  int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
}
[ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] class PolicyConfigClient {}

public static class Vol {
  static IMMDevice Dev() { var en = (IMMDeviceEnumerator)new MMDeviceEnumerator(); IMMDevice d; en.GetDefaultAudioEndpoint(0, 1, out d); return d; }
  static IAudioEndpointVolume Ep() {
    var iid = typeof(IAudioEndpointVolume).GUID; object o; Dev().Activate(ref iid, 23, IntPtr.Zero, out o); return (IAudioEndpointVolume)o;
  }
  public static float Get() { float v; Ep().GetMasterVolumeLevelScalar(out v); return v; }
  public static void Set(float v) { Ep().SetMasterVolumeLevelScalar(v, Guid.Empty); }
  public static bool Muted() { bool m; Ep().GetMute(out m); return m; }
  public static void Mute(bool m) { Ep().SetMute(m, Guid.Empty); }
  // Nom de la sortie audio par defaut (PKEY_Device_FriendlyName)
  static string Name(IMMDevice d) {
    IPropertyStore st; d.OpenPropertyStore(0, out st);
    var key = new PROPERTYKEY { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 };
    PROPVARIANT v; st.GetValue(ref key, out v);
    return v.vt == 31 ? Marshal.PtrToStringUni(v.p) : null;
  }
  public static object Device() { var d = Dev(); string id; d.GetId(out id); return new { id = id, name = Name(d) }; }
  // Sorties audio actives
  public static List<object> Devices() {
    var en = (IMMDeviceEnumerator)new MMDeviceEnumerator();
    string def; Dev().GetId(out def);
    IMMDeviceCollection col; en.EnumAudioEndpoints(0, 1, out col);
    uint n; col.GetCount(out n);
    var list = new List<object>();
    for (uint i = 0; i < n; i++) { IMMDevice d; col.Item(i, out d); string id; d.GetId(out id); list.Add(new { id = id, name = Name(d), isDefault = id == def }); }
    return list;
  }
  public static void SetDefault(string id) {
    var pc = (IPolicyConfig)new PolicyConfigClient();
    for (int role = 0; role < 3; role++) pc.SetDefaultEndpoint(id, role);
  }
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
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
  public struct RECT { public int L, T, R, B; }
  public struct POINT { public int X, Y; }
  // Fenetre racine visible a un point de l'ecran (pixels physiques)
  public static object AtPoint(int x, int y) { return Describe(GetAncestor(WindowFromPoint(new POINT { X = x, Y = y }), 2)); }
  public static object Foreground() { return Describe(GetForegroundWindow()); }
  static object Describe(IntPtr h) {
    if (h == IntPtr.Zero || !IsWindowVisible(h)) return null;
    var c = new StringBuilder(256); GetClassName(h, c, 256);
    RECT r; GetWindowRect(h, out r); uint pid; GetWindowThreadProcessId(h, out pid);
    return new { max = IsZoomed(h), l = r.L, t = r.T, r = r.R, b = r.B, pid = pid, cls = c.ToString() };
  }
}

// Luminosite des ecrans externes par DDC/CI (comme Twinkle Tray)
public static class Ddc {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct PHYSICAL_MONITOR { public IntPtr h; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string desc; }
  delegate bool MonitorEnumProc(IntPtr hMon, IntPtr hdc, ref Shell.RECT r, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnumProc cb, IntPtr data);
  [DllImport("dxva2.dll")] static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr hMon, out uint n);
  [DllImport("dxva2.dll")] static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr hMon, uint n, [Out] PHYSICAL_MONITOR[] arr);
  [DllImport("dxva2.dll")] static extern bool DestroyPhysicalMonitors(uint n, PHYSICAL_MONITOR[] arr);
  [DllImport("dxva2.dll")] static extern bool GetMonitorBrightness(IntPtr h, out uint min, out uint cur, out uint max);
  [DllImport("dxva2.dll")] static extern bool SetMonitorBrightness(IntPtr h, uint v);
  static void Each(Action<int, Shell.RECT, PHYSICAL_MONITOR> fn) {
    int idx = 0;
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr hMon, IntPtr hdc, ref Shell.RECT r, IntPtr data) => {
      uint n; if (GetNumberOfPhysicalMonitorsFromHMONITOR(hMon, out n) && n > 0) {
        var arr = new PHYSICAL_MONITOR[n];
        if (GetPhysicalMonitorsFromHMONITOR(hMon, n, arr)) { foreach (var m in arr) fn(idx++, r, m); DestroyPhysicalMonitors(n, arr); }
      }
      return true;
    }, IntPtr.Zero);
  }
  public static List<object> List() {
    var list = new List<object>();
    Each((i, r, m) => { uint min, cur, max; if (GetMonitorBrightness(m.h, out min, out cur, out max)) list.Add(new { id = i, name = m.desc, x = r.L, y = r.T, value = (int)Math.Round(100.0 * (cur - min) / Math.Max(1, max - min)) }); });
    return list;
  }
  public static bool Set(int id, int pct) {
    bool ok = false;
    Each((i, r, m) => { if (i == id) { uint min, cur, max; if (GetMonitorBrightness(m.h, out min, out cur, out max)) ok = SetMonitorBrightness(m.h, (uint)(min + (max - min) * pct / 100.0)); } });
    return ok;
  }
}
"@

[Shell]::SetProcessDpiAwarenessContext([IntPtr]-4) | Out-Null   # coordonnees physiques

# ---------- media ----------
$lastThumbKey = $null; $lastThumb = $null; $thumbVer = Get-Random; $thumbSig = $null; $keyAt = [DateTime]::MinValue; $thumbReadAt = [DateTime]::MinValue
function Get-Media($knownVer) {
    $s = $mgr.GetCurrentSession()
    if ($null -eq $s) { return @{ present = $false } }
    $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $info = $s.GetPlaybackInfo(); $tl = $s.GetTimelineProperties()
    $key = "$($p.Title)|$($p.Artist)"
    $now = [DateTime]::UtcNow
    if ($key -ne $script:lastThumbKey) { $script:lastThumbKey = $key; $script:keyAt = $now }
    # Au changement de piste, Windows donne le titre avant la nouvelle image : on relit la pochette
    # a chaque releve pendant 10 s, puis toutes les 15 s, et on ne la renvoie que si elle a change.
    $fresh = ($now - $script:keyAt).TotalSeconds -lt 10
    if ($fresh -or -not $script:lastThumb -or ($now - $script:thumbReadAt).TotalSeconds -gt 15) {
        $script:thumbReadAt = $now
        $data = $null
        if ($p.Thumbnail) {
            try {
                $stream = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
                $ms = New-Object IO.MemoryStream
                $asStreamForRead.Invoke($null, @($stream)).CopyTo($ms)
                $bytes = $ms.ToArray()
                $mime = if ($bytes.Length -gt 3 -and $bytes[0] -eq 0x89) { 'image/png' } else { 'image/jpeg' }
                if ($bytes.Length) { $data = "data:$mime;base64," + [Convert]::ToBase64String($bytes) }
            } catch { }
        }
        $sig = if ($data) { "$($data.Length):$($data.Substring([Math]::Max(0, $data.Length - 64)))" } else { '' }
        if ($sig -ne $script:thumbSig) { $script:thumbSig = $sig; $script:lastThumb = $data; $script:thumbVer++ }
    }    @{
        present = $true; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; app = $s.SourceAppUserModelId
        status = $info.PlaybackStatus.ToString(); key = $key
        canPrev = $info.Controls.IsPreviousEnabled; canNext = $info.Controls.IsNextEnabled
        canShuffle = $info.Controls.IsShuffleEnabled; canRepeat = $info.Controls.IsRepeatEnabled
        shuffle = [bool]$info.IsShuffleActive; repeat = $(if ($info.AutoRepeatMode) { $info.AutoRepeatMode.ToString() } else { 'None' })
        # la pochette n'est renvoyee que si le client ne l'a pas deja
        thumbVer = $script:thumbVer; thumb = $(if ("$knownVer" -ne "$($script:thumbVer)") { $script:lastThumb } else { $null }); hasThumb = [bool]$script:lastThumb
        position = $tl.Position.TotalSeconds; duration = $tl.EndTime.TotalSeconds
        updated = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
    }
}

# ---------- notifications Windows (UserNotificationListener) ----------
# Pas d'evenement sans identite de paquet : le client interroge, on renvoie les ids presents
# et le detail des notifications plus recentes que $since (ms).
$notifL = $null; $notifLogos = @{}
function Get-Notifs($since) {
    if (-not $script:notifL) {
        [Windows.UI.Notifications.Management.UserNotificationListener, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        $script:notifL = [Windows.UI.Notifications.Management.UserNotificationListener]::Current
    }
    $l = $script:notifL
    if ($l.GetAccessStatus().ToString() -ne 'Allowed') {
        $st = Await ($l.RequestAccessAsync()) ([Windows.UI.Notifications.Management.UserNotificationListenerAccessStatus])
        if ($st.ToString() -ne 'Allowed') { return @{ access = $st.ToString(); ids = @(); items = @() } }
    }
    $list = Await ($l.GetNotificationsAsync([Windows.UI.Notifications.NotificationKinds]::Toast)) ([System.Collections.Generic.IReadOnlyList[Windows.UI.Notifications.UserNotification]])
    $ids = @(); $items = @()
    foreach ($n in $list) {
        $ids += $n.Id
        $t = $n.CreationTime.ToUnixTimeMilliseconds()
        if ($t -le [double]$since) { continue }
        $texts = @()
        try {
            $b = $n.Notification.Visual.GetBinding([Windows.UI.Notifications.KnownNotificationBindings]::ToastGeneric)
            if ($b) { foreach ($e in $b.GetTextElements()) { if ($e.Text) { $texts += $e.Text } } }
        } catch { }
        $app = $null; $appId = $null
        try { $app = $n.AppInfo.DisplayInfo.DisplayName; $appId = $n.AppInfo.AppUserModelId } catch { }
        $logo = $null
        if ($appId -and $script:notifLogos.ContainsKey($appId)) { $logo = $script:notifLogos[$appId] }
        elseif ($appId) {
            try {
                $ref = $n.AppInfo.DisplayInfo.GetLogo((New-Object Windows.Foundation.Size(48, 48)))
                $stream = Await ($ref.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
                $ms = New-Object IO.MemoryStream
                $asStreamForRead.Invoke($null, @($stream)).CopyTo($ms)
                if ($ms.Length) { $logo = 'data:image/png;base64,' + [Convert]::ToBase64String($ms.ToArray()) }
            } catch { }
            $script:notifLogos[$appId] = $logo
        }
        $items += @{ id = $n.Id; time = $t; app = $app; appId = $appId; title = $(if ($texts.Count) { $texts[0] } else { '' }); body = (($texts | Select-Object -Skip 1) -join "`n"); logo = $logo }
    }
    @{ access = 'Allowed'; ids = $ids; items = $items }
}
function Remove-Notif($id) {
    if ($script:notifL) { $script:notifL.RemoveNotification([uint32]$id) }
    $true
}

# ---------- processus (top RAM / CPU) ----------
$prevCpu = @{}; $prevAt = $null
$cores = [Environment]::ProcessorCount
function Get-Procs {
    $now = Get-Date
    $groups = @{}
    foreach ($p in [System.Diagnostics.Process]::GetProcesses()) {
        $n = $p.ProcessName
        if ($n -eq 'Idle' -or $n -eq 'System' -or $n -eq 'Memory Compression' -or $n -eq 'Registry') { continue }
        $g = $groups[$n]; if (-not $g) { $g = @{ name = $n; mem = 0; cpu = 0.0; path = $null; count = 0 }; $groups[$n] = $g }
        $g.count++
        try { $g.mem += $p.WorkingSet64 } catch { }
        try { $g.cpu += $p.TotalProcessorTime.TotalSeconds } catch { }
        if (-not $g.path) { try { $g.path = $p.MainModule.FileName } catch { } }
    }
    $elapsed = if ($script:prevAt) { ($now - $script:prevAt).TotalSeconds } else { 0 }
    $list = foreach ($g in $groups.Values) {
        $pct = 0
        if ($elapsed -gt 0 -and $script:prevCpu.ContainsKey($g.name)) { $pct = [math]::Max(0, ($g.cpu - $script:prevCpu[$g.name]) / ($elapsed * $cores) * 100) }
        $desc = $null
        if ($g.path) { try { $desc = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($g.path).FileDescription } catch { } }
        [pscustomobject]@{ name = $g.name; label = $(if ($desc) { $desc } else { $g.name }); mem = $g.mem; cpu = [math]::Round($pct, 1); path = $g.path; count = $g.count }
    }
    $script:prevCpu = @{}; foreach ($g in $groups.Values) { $script:prevCpu[$g.name] = $g.cpu }
    $script:prevAt = $now
    @{
        byMem = @($list | Sort-Object mem -Descending | Select-Object -First 5)
        byCpu = @($list | Sort-Object cpu -Descending | Select-Object -First 5)
        total = $groups.Count
    }
}

# ---------- frequence CPU ----------
$cpuPerf = $null
try { $cpuPerf = New-Object System.Diagnostics.PerformanceCounter('Processor Information', '% Processor Performance', '_Total'); $cpuPerf.NextValue() | Out-Null } catch { }
$cpuBaseMhz = (Get-ItemProperty 'HKLM:\HARDWARE\DESCRIPTION\System\CentralProcessor\0' -ErrorAction SilentlyContinue).'~MHz'

# ---------- boucle ----------
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
            'media-seek' {
                $s = $mgr.GetCurrentSession()
                if ($s) { Await ($s.TryChangePlaybackPositionAsync([long]([double]$cmd.arg * 10000000))) ([bool]) | Out-Null }
                $true
            }
            'media-shuffle' {
                $s = $mgr.GetCurrentSession()
                if ($s) { Await ($s.TryChangeShuffleActiveAsync([bool]$cmd.arg)) ([bool]) | Out-Null }
                $true
            }
            'media-repeat' {
                $s = $mgr.GetCurrentSession()
                if ($s) { Await ($s.TryChangeAutoRepeatModeAsync([Windows.Media.MediaPlaybackAutoRepeatMode][string]$cmd.arg)) ([bool]) | Out-Null }
                $true
            }
            'audio-devices' { [Vol]::Devices() }
            'audio-set' { [Vol]::SetDefault([string]$cmd.arg); $true }
            'radios' {
                $null = Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus])
                $list = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
                @($list | Where-Object { $_.Kind -eq 'WiFi' -or $_.Kind -eq 'Bluetooth' } | ForEach-Object { @{ kind = $_.Kind.ToString(); on = ($_.State -eq 'On'); name = $_.Name } })
            }
            'radio-set' {
                $list = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
                $r = $list | Where-Object { $_.Kind.ToString() -eq $cmd.arg.kind } | Select-Object -First 1
                if (-not $r) { throw "radio introuvable" }
                $state = if ($cmd.arg.on) { [Windows.Devices.Radios.RadioState]::On } else { [Windows.Devices.Radios.RadioState]::Off }
                (Await ($r.SetStateAsync($state)) ([Windows.Devices.Radios.RadioAccessStatus])).ToString()
            }
            'volume' { @{ level = [math]::Round([Vol]::Get() * 100); muted = [Vol]::Muted() } }
            'volume-set' { [Vol]::Set([float]$cmd.arg / 100); $true }
            'mute' { [Vol]::Mute([bool]$cmd.arg); $true }
            'audio-device' { [Vol]::Device() }
            # 2 = occupe, 3 = jeu D3D plein ecran, 4 = presentation
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
            'battery' {
                $ps = [System.Windows.Forms.SystemInformation]::PowerStatus
                @{
                    present = -not ($ps.BatteryChargeStatus -band [System.Windows.Forms.BatteryChargeStatus]::NoSystemBattery)
                    percent = [math]::Round($ps.BatteryLifePercent * 100)
                    plugged = ($ps.PowerLineStatus -eq 'Online')
                    charging = [bool]($ps.BatteryChargeStatus -band [System.Windows.Forms.BatteryChargeStatus]::Charging)
                    remaining = $ps.BatteryLifeRemaining
                }
            }
            'procs' { Get-Procs }
        'notifs' { Get-Notifs $cmd.arg }
        'notif-remove' { Remove-Notif $cmd.arg }
            'cpu-freq' { if ($cpuPerf -and $cpuBaseMhz) { [math]::Round($cpuBaseMhz * $cpuPerf.NextValue() / 100) } else { $null } }
            'brightness' {
                $list = @([Ddc]::List() | ForEach-Object { @{ id = "ddc:$($_.id)"; name = $_.name; value = $_.value; x = $_.x; y = $_.y; kind = 'ddc' } })
                try {
                    $b = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1
                    if ($b) { $list += @{ id = 'wmi'; name = $null; value = [int]$b.CurrentBrightness; kind = 'wmi' } }
                } catch { }
                $list
            }
            'brightness-set' {
                $v = [int]$cmd.arg.value
                if ($cmd.arg.id -eq 'wmi') {
                    $m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Select-Object -First 1
                    Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{ Timeout = [uint32]1; Brightness = [byte]$v } | Out-Null
                    $true
                } else { [Ddc]::Set([int]($cmd.arg.id -replace 'ddc:', ''), $v) }
            }
            default { throw "op inconnue: $($cmd.op)" }
        }
        [Console]::Out.WriteLine((@{ id = $id; ok = $true; data = $data } | ConvertTo-Json -Compress -Depth 6))
    } catch {
        [Console]::Out.WriteLine((@{ id = $id; ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress))
    }
    [Console]::Out.Flush()
}
