// Follet helper: a small persistent process for everything Electron cannot do on Windows
// (WinRT media session, Core Audio, radios, notifications, windows, processes).
// Protocol: one JSON command per line on stdin {id, op, arg}, one JSON answer per line on stdout
// {id, ok, data|error}. Commands run concurrently; answers carry their id.
// Built with the C# compiler that ships with .NET Framework 4.8 (C# 5): see scripts/build-helper.js.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Windows.Devices.Enumeration;
using Windows.Devices.Radios;
using Windows.Foundation;
using Windows.Storage.Streams;
using Windows.Media;
using Windows.Media.Control;
using Windows.UI.Notifications;
using Windows.UI.Notifications.Management;

static class Program {
  static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue, RecursionLimit = 16 };
  static readonly object OutLock = new object();
  static GlobalSystemMediaTransportControlsSessionManager mgr;

  // WinRT -> Task, without System.Runtime.WindowsRuntime (which needs the Windows SDK to compile against)
  static Task<T> W<T>(IAsyncOperation<T> op) {
    var tcs = new TaskCompletionSource<T>();
    op.Completed = (o, s) => {
      if (s == AsyncStatus.Completed) tcs.TrySetResult(o.GetResults());
      else if (s == AsyncStatus.Error) tcs.TrySetException(o.ErrorCode ?? new Exception("WinRT error"));
      else tcs.TrySetCanceled();
    };
    return tcs.Task;
  }
  static async Task<byte[]> ReadAll(IRandomAccessStreamWithContentType s) {
    using (s) using (var r = new DataReader(s)) {
      var n = await W(r.LoadAsync((uint)s.Size));
      var bytes = new byte[n]; r.ReadBytes(bytes); return bytes;
    }
  }

  static void Main() {
    Native.SetProcessDpiAwarenessContext(new IntPtr(-4));   // physical pixels, like the notch window math
    var stdout = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = false };
    var stdin = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
    try { mgr = W(GlobalSystemMediaTransportControlsSessionManager.RequestAsync()).Result; } catch { }
    Cpu.Init();
    string line;
    while ((line = stdin.ReadLine()) != null) {
      var l = line;
      Task.Run(() => {
        object id = null; string answer;
        try {
          var cmd = (Dictionary<string, object>)Json.DeserializeObject(l);
          object op, arg; cmd.TryGetValue("id", out id); cmd.TryGetValue("op", out op); cmd.TryGetValue("arg", out arg);
          var data = Run((string)op, arg).Result;
          answer = Json.Serialize(new Dictionary<string, object> { { "id", id }, { "ok", true }, { "data", data } });
        } catch (Exception e) {
          while (e is AggregateException && e.InnerException != null) e = e.InnerException;
          answer = Json.Serialize(new Dictionary<string, object> { { "id", id }, { "ok", false }, { "error", e.Message } });
        }
        lock (OutLock) { stdout.Write(answer); stdout.Write('\n'); stdout.Flush(); }
      });
    }
  }

  static async Task<object> Run(string op, object arg) {
    var a = arg as Dictionary<string, object>;
    switch (op) {
      case "media": return await Media.Get(arg);
      case "media-cmd": {
        var s = Session(); if (s == null) return true;
        var c = (string)arg;
        if (c == "toggle") await W(s.TryTogglePlayPauseAsync()); else if (c == "next") await W(s.TrySkipNextAsync()); else if (c == "prev") await W(s.TrySkipPreviousAsync());
        return true;
      }
      case "media-seek": { var s = Session(); if (s != null) await W(s.TryChangePlaybackPositionAsync((long)(Convert.ToDouble(arg) * 10000000))); return true; }
      case "media-shuffle": { var s = Session(); if (s != null) await W(s.TryChangeShuffleActiveAsync(Convert.ToBoolean(arg))); return true; }
      case "media-repeat": { var s = Session(); if (s != null) await W(s.TryChangeAutoRepeatModeAsync((MediaPlaybackAutoRepeatMode)Enum.Parse(typeof(MediaPlaybackAutoRepeatMode), (string)arg))); return true; }
      case "volume": return new Dictionary<string, object> { { "level", (int)Math.Round(Vol.Get() * 100) }, { "muted", Vol.Muted() } };
      case "volume-set": Vol.Set((float)(Convert.ToDouble(arg) / 100)); return true;
      case "mute": Vol.Mute(Convert.ToBoolean(arg)); return true;
      case "audio-device": return Vol.Device();
      case "audio-devices": return Vol.Devices();
      case "audio-set": Vol.SetDefault((string)arg); return true;
      case "mic-users": return Vol.Recording();
      case "radios": {
        await W(Radio.RequestAccessAsync());
        var list = await W(Radio.GetRadiosAsync());
        return list.Where(r => r.Kind == RadioKind.WiFi || r.Kind == RadioKind.Bluetooth)
          .Select(r => (object)new Dictionary<string, object> { { "kind", r.Kind.ToString() }, { "on", r.State == RadioState.On }, { "name", r.Name } }).ToList();
      }
      case "radio-set": {
        var list = await W(Radio.GetRadiosAsync());
        var r = list.FirstOrDefault(x => x.Kind.ToString() == (string)a["kind"]);
        if (r == null) throw new Exception("radio introuvable");
        return (await W(r.SetStateAsync(Convert.ToBoolean(a["on"]) ? RadioState.On : RadioState.Off))).ToString();
      }
      case "quns": return Native.NotificationState();        // 2 busy, 3 D3D full screen, 4 presentation
      case "fg": return Native.Describe(Native.GetForegroundWindow());
      case "at": return Native.Describe(Native.GetAncestor(Native.WindowFromPoint(new Native.POINT { X = Convert.ToInt32(a["x"]), Y = Convert.ToInt32(a["y"]) }), 2));
      case "net": {
        long rx = 0, tx = 0;
        foreach (var n in NetworkInterface.GetAllNetworkInterfaces()) {
          if (n.OperationalStatus != OperationalStatus.Up || n.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
          var st = n.GetIPv4Statistics(); rx += st.BytesReceived; tx += st.BytesSent;
        }
        return new Dictionary<string, object> { { "rx", rx }, { "tx", tx } };
      }
      case "battery": return Native.Power();
      case "procs": return Procs.Get();
      case "notifs": return await Notifs.Get(arg == null ? 0 : Convert.ToDouble(arg));
      case "notif-remove": Notifs.Remove(Convert.ToUInt32(arg)); return true;
      case "cpu-freq": return Cpu.Mhz();
      case "bt": return await Bt.Connected();
      case "screenshot": {
        // physical pixels (the helper is per-monitor DPI aware), saved as PNG
        var r = (Dictionary<string, object>)arg;
        int x = Convert.ToInt32(r["x"]), y = Convert.ToInt32(r["y"]), w = Convert.ToInt32(r["w"]), h = Convert.ToInt32(r["h"]);
        using (var bmp = new System.Drawing.Bitmap(w, h))
        using (var g = System.Drawing.Graphics.FromImage(bmp)) {
          g.CopyFromScreen(x, y, 0, 0, new System.Drawing.Size(w, h));
          bmp.Save((string)r["path"], System.Drawing.Imaging.ImageFormat.Png);
        }
        return true;
      }
      case "clip-seq": return (long)Native.GetClipboardSequenceNumber();
      case "paste": return Native.PasteInto(new IntPtr(Convert.ToInt64(arg)));
      case "focus-app": return Native.FocusApp(Convert.ToString(arg));
      default: throw new Exception("op inconnue: " + op);
    }
  }

  static GlobalSystemMediaTransportControlsSession Session() { return mgr == null ? null : mgr.GetCurrentSession(); }

  // ---------- media ----------
  static class Media {
    static readonly object Lock = new object();
    static string lastKey, lastThumb, thumbSig;
    static int thumbVer = new Random().Next(1, 1000000);
    static DateTime keyAt = DateTime.MinValue, thumbReadAt = DateTime.MinValue;

    public static async Task<object> Get(object knownVer) {
      var s = Session();
      if (s == null) return new Dictionary<string, object> { { "present", false } };
      var p = await W(s.TryGetMediaPropertiesAsync());
      var info = s.GetPlaybackInfo(); var tl = s.GetTimelineProperties();
      var key = p.Title + "|" + p.Artist;
      var now = DateTime.UtcNow;
      bool read;
      lock (Lock) {
        if (key != lastKey) { lastKey = key; keyAt = now; }
        // On a track change Windows gives the title before the new art: re-read the art on every poll
        // for 10 s, then every 15 s, and only send it again when it changed.
        read = (now - keyAt).TotalSeconds < 10 || lastThumb == null || (now - thumbReadAt).TotalSeconds > 15;
        if (read) thumbReadAt = now;
      }
      if (read) {
        string data = null;
        if (p.Thumbnail != null) {
          try {
            var bytes = await ReadAll(await W(p.Thumbnail.OpenReadAsync()));
            if (bytes.Length > 0) data = "data:" + (bytes.Length > 3 && bytes[0] == 0x89 ? "image/png" : "image/jpeg") + ";base64," + Convert.ToBase64String(bytes);
          } catch { }
        }
        var sig = data == null ? "" : data.Length + ":" + data.Substring(Math.Max(0, data.Length - 64));
        lock (Lock) { if (sig != thumbSig) { thumbSig = sig; lastThumb = data; thumbVer++; } }
      }
      var ctl = info.Controls;
      lock (Lock) {
        return new Dictionary<string, object> {
          { "present", true }, { "title", p.Title }, { "artist", p.Artist }, { "album", p.AlbumTitle }, { "app", s.SourceAppUserModelId },
          { "status", info.PlaybackStatus.ToString() }, { "key", key },
          { "canPrev", ctl.IsPreviousEnabled }, { "canNext", ctl.IsNextEnabled }, { "canShuffle", ctl.IsShuffleEnabled }, { "canRepeat", ctl.IsRepeatEnabled },
          { "shuffle", info.IsShuffleActive == true }, { "repeat", info.AutoRepeatMode.HasValue ? info.AutoRepeatMode.Value.ToString() : "None" },
          // the art is only sent when the client does not have this version yet
          { "thumbVer", thumbVer }, { "thumb", Convert.ToString(knownVer) != thumbVer.ToString() ? lastThumb : null }, { "hasThumb", lastThumb != null },
          { "position", tl.Position.TotalSeconds }, { "duration", tl.EndTime.TotalSeconds }, { "updated", tl.LastUpdatedTime.ToUnixTimeMilliseconds() },
        };
      }
    }
  }

  // ---------- Windows notifications (UserNotificationListener) ----------
  // No change event without package identity: the client polls; we return the ids present and
  // the details of notifications newer than `since` (ms).
  static class Notifs {
    static UserNotificationListener listener;
    static readonly Dictionary<string, string> logos = new Dictionary<string, string>();

    public static async Task<object> Get(double since) {
      if (listener == null) listener = UserNotificationListener.Current;
      if (listener.GetAccessStatus() != UserNotificationListenerAccessStatus.Allowed) {
        var st = await W(listener.RequestAccessAsync());
        if (st != UserNotificationListenerAccessStatus.Allowed)
          return new Dictionary<string, object> { { "access", st.ToString() }, { "ids", new object[0] }, { "items", new object[0] } };
      }
      var list = await W(listener.GetNotificationsAsync(NotificationKinds.Toast));
      var ids = new List<object>(); var items = new List<object>();
      foreach (var n in list) {
        ids.Add(n.Id);
        var t = n.CreationTime.ToUnixTimeMilliseconds();
        if (t <= since) continue;
        var texts = new List<string>();
        try {
          var b = n.Notification.Visual.GetBinding(KnownNotificationBindings.ToastGeneric);
          if (b != null) foreach (var e in b.GetTextElements()) if (!string.IsNullOrEmpty(e.Text)) texts.Add(e.Text);
        } catch { }
        string app = null, appId = null;
        try { app = n.AppInfo.DisplayInfo.DisplayName; appId = n.AppInfo.AppUserModelId; } catch { }
        string logo = null;
        if (appId != null) {
          bool known; lock (logos) known = logos.TryGetValue(appId, out logo);
          if (!known) {
            try {
              var r = Logo(n.AppInfo.DisplayInfo);
              var bytes = await ReadAll(await W(r.OpenReadAsync()));
              if (bytes.Length > 0) logo = "data:image/png;base64," + Convert.ToBase64String(bytes);
            } catch { }
            lock (logos) logos[appId] = logo;
          }
        }
        items.Add(new Dictionary<string, object> {
          { "id", n.Id }, { "time", t }, { "app", app }, { "appId", appId },
          { "title", texts.Count > 0 ? texts[0] : "" }, { "body", string.Join("\n", texts.Skip(1)) }, { "logo", logo },
        });
      }
      return new Dictionary<string, object> { { "access", "Allowed" }, { "ids", ids }, { "items", items } };
    }
    // GetLogo takes a Windows.Foundation.Size, a type projected from System.Runtime.WindowsRuntime:
    // built at run time so the helper compiles without the Windows SDK.
    static readonly Type SizeType = Type.GetType("Windows.Foundation.Size, System.Runtime.WindowsRuntime, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089");
    static IRandomAccessStreamReference Logo(Windows.ApplicationModel.AppDisplayInfo info) {
      var size = Activator.CreateInstance(SizeType, 48.0, 48.0);
      return (IRandomAccessStreamReference)typeof(Windows.ApplicationModel.AppDisplayInfo).GetMethod("GetLogo").Invoke(info, new[] { size });
    }
    public static void Remove(uint id) { if (listener != null) listener.RemoveNotification(id); }
  }

  // ---------- processes (top RAM / CPU) ----------
  static class Procs {
    static readonly object Lock = new object();
    static Dictionary<string, double> prevCpu = new Dictionary<string, double>();
    static DateTime prevAt = DateTime.MinValue;
    static readonly Dictionary<string, string> desc = new Dictionary<string, string>();
    class G { public string name, path; public long mem; public double cpu; public int count; }

    public static object Get() {
      lock (Lock) {
        var now = DateTime.UtcNow;
        var groups = new Dictionary<string, G>();
        foreach (var p in Process.GetProcesses()) {
          using (p) {
            var n = p.ProcessName;
            if (n == "Idle" || n == "System" || n == "Memory Compression" || n == "Registry") continue;
            G g; if (!groups.TryGetValue(n, out g)) groups[n] = g = new G { name = n };
            g.count++;
            try { g.mem += p.WorkingSet64; } catch { }
            try { g.cpu += p.TotalProcessorTime.TotalSeconds; } catch { }
            if (g.path == null) try { g.path = p.MainModule.FileName; } catch { }
          }
        }
        var elapsed = prevAt == DateTime.MinValue ? 0 : (now - prevAt).TotalSeconds;
        var cores = Environment.ProcessorCount;
        var list = groups.Values.Select(g => {
          double pct = 0, before;
          if (elapsed > 0 && prevCpu.TryGetValue(g.name, out before)) pct = Math.Max(0, (g.cpu - before) / (elapsed * cores) * 100);
          string d = null;
          if (g.path != null && !desc.TryGetValue(g.path, out d)) {
            try { d = FileVersionInfo.GetVersionInfo(g.path).FileDescription; } catch { }
            desc[g.path] = d;
          }
          return new Dictionary<string, object> {
            { "name", g.name }, { "label", string.IsNullOrWhiteSpace(d) ? g.name : d }, { "mem", g.mem },
            { "cpu", Math.Round(pct, 1) }, { "path", g.path }, { "count", g.count },
          };
        }).ToList();
        prevCpu = groups.Values.ToDictionary(g => g.name, g => g.cpu);
        prevAt = now;
        return new Dictionary<string, object> {
          { "byMem", list.OrderByDescending(x => (long)x["mem"]).Take(5).ToList() },
          { "byCpu", list.OrderByDescending(x => (double)x["cpu"]).Take(5).ToList() },
          { "total", groups.Count },
        };
      }
    }
  }

  // ---------- Bluetooth: connected devices and their battery ----------
  // A one-shot query of Bluetooth endpoints waits for a ~30 s inquiry scan: a watcher reports the
  // paired, connected devices at once, then follows connections and disconnections.
  static class Bt {
    const string Sel = "(System.Devices.Aep.ProtocolId:=\"{e0cbf06c-cd8b-4647-bb8a-263b43f0f974}\" OR System.Devices.Aep.ProtocolId:=\"{bb7bb05e-5972-42b5-94fc-76eaa7084d49}\") AND System.Devices.Aep.IsPaired:=System.StructuredQueryType.Boolean#True AND System.Devices.Aep.IsConnected:=System.StructuredQueryType.Boolean#True";
    const string Battery = "{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2";
    static readonly object Lock = new object();
    static DeviceWatcher watcher;
    static readonly Dictionary<string, DeviceInformation> found = new Dictionary<string, DeviceInformation>();
    static readonly Dictionary<string, KeyValuePair<DateTime, int?>> battery = new Dictionary<string, KeyValuePair<DateTime, int?>>();

    static void Watch() {
      lock (Lock) {
        if (watcher != null && watcher.Status != DeviceWatcherStatus.Aborted && watcher.Status != DeviceWatcherStatus.Stopped) return;
        found.Clear();
        watcher = DeviceInformation.CreateWatcher(Sel, new[] { "System.Devices.Aep.ContainerId", "System.Devices.Aep.Category" }, DeviceInformationKind.AssociationEndpoint);
        watcher.Added += (w, d) => { lock (Lock) found[d.Id] = d; };
        watcher.Updated += (w, u) => { lock (Lock) { DeviceInformation d; if (found.TryGetValue(u.Id, out d)) d.Update(u); } };
        watcher.Removed += (w, u) => { lock (Lock) found.Remove(u.Id); };
        watcher.Start();
      }
    }

    static async Task<int?> Level(string container) {
      KeyValuePair<DateTime, int?> b;
      lock (Lock) if (battery.TryGetValue(container, out b) && (DateTime.UtcNow - b.Key).TotalSeconds < 60) return b.Value;
      int? level = null;
      try {
        // the level is published on one of the device's PnP nodes (hands-free profile, battery service...)
        var nodes = await W(DeviceInformation.FindAllAsync("System.Devices.ContainerId:=\"{" + container + "}\"", new[] { Battery }, DeviceInformationKind.Device));
        foreach (var n in nodes) { object v; if (n.Properties.TryGetValue(Battery, out v) && v != null) { level = Convert.ToInt32(v); break; } }
      } catch { }
      lock (Lock) battery[container] = new KeyValuePair<DateTime, int?>(DateTime.UtcNow, level);
      return level;
    }

    public static async Task<object> Connected() {
      Watch();
      List<DeviceInformation> now; lock (Lock) now = found.Values.ToList();
      var list = new List<object>(); var seen = new HashSet<string>();
      foreach (var d in now) {
        object c; d.Properties.TryGetValue("System.Devices.Aep.ContainerId", out c);
        var container = c == null ? d.Id : c.ToString();
        if (string.IsNullOrEmpty(d.Name) || !seen.Add(container)) continue;   // classic + LE of the same device
        object cat; d.Properties.TryGetValue("System.Devices.Aep.Category", out cat);
        var cats = cat as string[];
        list.Add(new Dictionary<string, object> { { "id", container }, { "name", d.Name }, { "battery", c == null ? null : await Level(container) }, { "category", cats != null ? string.Join(",", cats) : null } });
      }
      return list;
    }
  }

  // ---------- CPU clock ----------
  static class Cpu {
    static PerformanceCounter perf; static double baseMhz;
    public static void Init() {
      try { perf = new PerformanceCounter("Processor Information", "% Processor Performance", "_Total"); perf.NextValue(); } catch { perf = null; }
      try { baseMhz = Convert.ToDouble(Microsoft.Win32.Registry.GetValue(@"HKEY_LOCAL_MACHINE\HARDWARE\DESCRIPTION\System\CentralProcessor\0", "~MHz", 0)); } catch { }
    }
    public static object Mhz() { lock (typeof(Cpu)) return perf != null && baseMhz > 0 ? (object)Math.Round(baseMhz * perf.NextValue() / 100) : null; }
  }
}

// ---------- Core Audio ----------
[StructLayout(LayoutKind.Sequential)] struct PROPERTYKEY { public Guid fmtid; public int pid; }
[StructLayout(LayoutKind.Sequential)] struct PROPVARIANT { public ushort vt; ushort r1, r2, r3; public IntPtr p; public IntPtr p2; }
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
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
// Undocumented but stable since Windows 7 (used by AudioDeviceCmdlets, EarTrumpet...)
[Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPolicyConfig {
  int a(); int b(); int c(); int d(); int e(); int f(); int g(); int h(); int i(); int j();
  int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
}
[ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] class PolicyConfigClient { }
[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 { int a(); int b(); int GetSessionEnumerator(out IAudioSessionEnumerator e); }
[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator { int GetCount(out int n); int GetSession(int i, out IAudioSessionControl2 s); }
[Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
  int GetState(out int state);   // 1 = active
  int a(); int b(); int c(); int d(); int e(); int f(); int g(); int h();
  int i(); int j();
  int GetProcessId(out uint pid);
  [PreserveSig] int IsSystemSoundsSession();   // S_OK (0) = system sounds
}

static class Vol {
  static IMMDevice Dev() { var en = (IMMDeviceEnumerator)new MMDeviceEnumerator(); IMMDevice d; en.GetDefaultAudioEndpoint(0, 1, out d); return d; }
  static IAudioEndpointVolume Ep() { var iid = typeof(IAudioEndpointVolume).GUID; object o; Dev().Activate(ref iid, 23, IntPtr.Zero, out o); return (IAudioEndpointVolume)o; }
  public static float Get() { float v; Ep().GetMasterVolumeLevelScalar(out v); return v; }
  public static void Set(float v) { Ep().SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(1, v)), Guid.Empty); }
  public static bool Muted() { bool m; Ep().GetMute(out m); return m; }
  public static void Mute(bool m) { Ep().SetMute(m, Guid.Empty); }
  static string Name(IMMDevice d) {   // PKEY_Device_FriendlyName
    IPropertyStore st; d.OpenPropertyStore(0, out st);
    var key = new PROPERTYKEY { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 };
    PROPVARIANT v; st.GetValue(ref key, out v);
    return v.vt == 31 ? Marshal.PtrToStringUni(v.p) : null;
  }
  public static object Device() { var d = Dev(); string id; d.GetId(out id); return new Dictionary<string, object> { { "id", id }, { "name", Name(d) } }; }
  public static object Devices() {
    var en = (IMMDeviceEnumerator)new MMDeviceEnumerator();
    string def; Dev().GetId(out def);
    IMMDeviceCollection col; en.EnumAudioEndpoints(0, 1, out col);
    uint n; col.GetCount(out n);
    var list = new List<object>();
    for (uint i = 0; i < n; i++) { IMMDevice d; col.Item(i, out d); string id; d.GetId(out id); list.Add(new Dictionary<string, object> { { "id", id }, { "name", Name(d) }, { "isDefault", id == def } }); }
    return list;
  }
  // Apps qui enregistrent un micro en ce moment : sessions de capture actives, sur tous les micros
  public static object Recording() {
    var en = (IMMDeviceEnumerator)new MMDeviceEnumerator();
    IMMDeviceCollection col; en.EnumAudioEndpoints(1, 1, out col);
    uint n; col.GetCount(out n);
    var pids = new HashSet<uint>();
    for (uint i = 0; i < n; i++) {
      try {
        IMMDevice d; col.Item(i, out d);
        var iid = typeof(IAudioSessionManager2).GUID; object o; d.Activate(ref iid, 23, IntPtr.Zero, out o);
        IAudioSessionEnumerator se; ((IAudioSessionManager2)o).GetSessionEnumerator(out se);
        int c; se.GetCount(out c);
        for (int k = 0; k < c; k++) {
          IAudioSessionControl2 s; se.GetSession(k, out s);
          int state; s.GetState(out state);
          uint pid; s.GetProcessId(out pid);
          if (state == 1 && pid != 0 && s.IsSystemSoundsSession() != 0) pids.Add(pid);
        }
      } catch { }
    }
    var list = new List<object>();
    foreach (var pid in pids) {
      string name = null, path = null, label = null;
      try { using (var p = Process.GetProcessById((int)pid)) { name = p.ProcessName; try { path = p.MainModule.FileName; label = FileVersionInfo.GetVersionInfo(path).FileDescription; } catch { } } } catch { continue; }
      list.Add(new Dictionary<string, object> { { "pid", (int)pid }, { "name", name }, { "label", string.IsNullOrWhiteSpace(label) ? name : label }, { "path", path } });
    }
    return list;
  }
  public static void SetDefault(string id) { var pc = (IPolicyConfig)new PolicyConfigClient(); for (int role = 0; role < 3; role++) pc.SetDefaultEndpoint(id, role); }
}

// ---------- Win32 ----------
static class Native {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("kernel32.dll")] static extern bool GetSystemPowerStatus(out SPS s);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);

  // Remet la fenetre ou l'on etait au premier plan, puis Ctrl+V
  public static bool PasteInto(IntPtr h) {
    if (h == IntPtr.Zero || !IsWindow(h)) return false;
    if (IsIconic(h)) ShowWindow(h, 9);
    keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero);
    SetForegroundWindow(h);
    System.Threading.Thread.Sleep(120);
    keybd_event(0x11, 0, 0, UIntPtr.Zero); keybd_event(0x56, 0, 0, UIntPtr.Zero);
    keybd_event(0x56, 0, 2, UIntPtr.Zero); keybd_event(0x11, 0, 2, UIntPtr.Zero);
    return true;
  }
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

  // Met au premier plan l'appli qui joue (identifiant de la session media) : appli du Store par son
  // AUMID, sinon la fenetre principale du processus du meme nom
  public static bool FocusApp(string id) {
    if (string.IsNullOrEmpty(id)) return false;
    if (id.Contains("!")) { Process.Start("explorer.exe", "shell:AppsFolder\\" + id); return true; }
    var name = System.IO.Path.GetFileNameWithoutExtension(id);
    foreach (var p in Process.GetProcessesByName(name)) {
      using (p) {
        var h = p.MainWindowHandle;
        if (h == IntPtr.Zero || !IsWindowVisible(h)) continue;
        if (IsIconic(h)) ShowWindow(h, 9);
        // Windows refuse le premier plan a un processus en arriere-plan, sauf juste apres une touche
        keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero);
        return SetForegroundWindow(h);
      }
    }
    return false;
  }
  public struct RECT { public int L, T, R, B; }
  public struct POINT { public int X, Y; }
  struct SPS { public byte AC; public byte Flag; public byte Pct; public byte Saver; public int Life; public int Full; }

  public static int NotificationState() { int s; SHQueryUserNotificationState(out s); return s; }
  public static object Describe(IntPtr h) {
    if (h == IntPtr.Zero || !IsWindowVisible(h)) return null;
    var c = new StringBuilder(256); GetClassName(h, c, 256);
    RECT r; GetWindowRect(h, out r); uint pid; GetWindowThreadProcessId(h, out pid);
    return new Dictionary<string, object> { { "max", IsZoomed(h) }, { "l", r.L }, { "t", r.T }, { "r", r.R }, { "b", r.B }, { "pid", pid }, { "cls", c.ToString() }, { "hwnd", h.ToInt64() } };
  }
  public static object Power() {
    SPS s; GetSystemPowerStatus(out s);
    return new Dictionary<string, object> {
      { "present", s.Flag != 255 && (s.Flag & 128) == 0 }, { "percent", s.Pct == 255 ? 0 : (int)s.Pct },
      { "plugged", s.AC == 1 }, { "charging", (s.Flag & 8) != 0 }, { "remaining", s.Life },
    };
  }
}
